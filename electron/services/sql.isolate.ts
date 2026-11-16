import { Worker } from 'worker_threads'
import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────
// RUN STUDENT SQL IN AN ISOLATED WORKER
// ─────────────────────────────────────────────
// sql.js runs synchronously. Reading rows one at a time lets us stop a query that produces too many rows, but a
// query that does heavy work WITHOUT producing rows (e.g. COUNT(*) over a forgotten join of four tables = tens of
// billions of combinations) never gives control back: the whole app freezes, because the main process is stuck.
//
// So the query runs on a COPY of the database inside a worker thread. If it takes longer than the hard limit the
// worker is simply terminated: the app stays responsive and the real database is untouched (no half-finished
// write). If the query changed the database, the worker sends the new contents back and they replace the old.
//
// The worker is fully self-contained (sql.js source and wasm are passed in), so it needs no file access of its own
// and works the same inside the packaged app's archive. If a worker cannot be started for any reason, callers
// fall back to running in-process (see runBounded in sql.service.ts).

export interface IsolatedResult {
  sets: { columns: string[]; values: any[][]; truncated?: 'rows' | 'time' }[]
  /** New database contents, present only when the query changed the database. */
  bytes?: Uint8Array
  /** Rows changed by the last statement (SQLite changes()). */
  changes: number
}

export class IsolateTimeout extends Error { constructor(public ms: number) { super(`Stopped after ${Math.round(ms / 1000)} seconds`) } }
export class IsolateMemory extends Error { constructor() { super('Ran out of memory') } }
export class IsolateUnavailable extends Error { constructor(why: string) { super(why) } }

export const isolateLimits = { hardMs: 20_000, maxMemoryMb: 768 }

let worker: Worker | null = null
let disabled = false
let failures = 0
let chain: Promise<unknown> = Promise.resolve()

function workerSource(execBoundedSource: string): string {
  return `
const { parentPort, workerData } = require('worker_threads')
const MAX_RESULT_ROWS = ${10_000}, MAX_QUERY_MS = ${10_000}
const exports = { MAX_RESULT_ROWS, MAX_QUERY_MS }
${execBoundedSource}
const mod = { exports: {} }
new Function('module', 'exports', 'require', '__dirname', '__filename', workerData.sqlJsSource)(mod, mod.exports, require, '', '')
const ready = mod.exports({ wasmBinary: workerData.wasm })
const signature = (db) => db.exec('SELECT total_changes()')[0].values[0][0] + ':' + db.exec('PRAGMA schema_version')[0].values[0][0]
parentPort.on('message', async (msg) => {
  try {
    const SQL = await ready
    const db = msg.bytes ? new SQL.Database(msg.bytes) : new SQL.Database()
    db.run('PRAGMA foreign_keys=ON;')
    const before = signature(db)
    let sets, error = null
    try { sets = execBounded(db, msg.sql, msg.opts) } catch (e) { error = String(e && e.message || e) }
    const changed = signature(db) !== before
    const changes = db.exec('SELECT changes()')[0].values[0][0]
    const bytes = changed ? db.export() : undefined
    db.close()
    parentPort.postMessage({ id: msg.id, sets, error, bytes, changes }, bytes ? [bytes.buffer] : [])
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: String(e && e.message || e), fatal: true })
  }
})`
}

function start(execBoundedSource: string): Worker {
  const sqlJsPath = require.resolve('sql.js')
  const dir = path.dirname(sqlJsPath)
  const w = new Worker(workerSource(execBoundedSource), {
    eval: true,
    workerData: {
      sqlJsSource: fs.readFileSync(sqlJsPath, 'utf8'),
      wasm: fs.readFileSync(path.join(dir, 'sql-wasm.wasm')),
    },
    resourceLimits: { maxOldGenerationSizeMb: isolateLimits.maxMemoryMb },
  })
  w.unref() // an idle worker must never keep the app (or a test run) alive
  return w
}

/** Run `sql` against a copy of the database (`bytes`). Rejects with IsolateTimeout / IsolateMemory / IsolateUnavailable. */
export function runIsolated(bytes: Uint8Array, sql: string, opts: { maxRows?: number; maxMs?: number }, execBoundedSource: string): Promise<IsolatedResult> {
  if (disabled) return Promise.reject(new IsolateUnavailable('isolated execution is disabled'))
  const job = chain.then(() => attempt(bytes, sql, opts, execBoundedSource))
  chain = job.catch(() => undefined) // one failed run must not block the next
  return job
}

let nextId = 1
function attempt(bytes: Uint8Array, sql: string, opts: { maxRows?: number; maxMs?: number }, execBoundedSource: string): Promise<IsolatedResult> {
  return new Promise((resolve, reject) => {
    let w: Worker
    try { w = worker ?? (worker = start(execBoundedSource)) } catch (e: any) {
      failures++; if (failures >= 2) disabled = true
      return reject(new IsolateUnavailable(e?.message ?? 'worker could not start'))
    }
    const id = nextId++
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer); w.off('message', onMessage); w.off('error', onError); w.off('exit', onExit)
      fn()
    }
    const kill = () => { if (worker === w) worker = null; w.terminate().catch(() => {}) }
    const timer = setTimeout(() => finish(() => { kill(); reject(new IsolateTimeout(isolateLimits.hardMs)) }), isolateLimits.hardMs)
    const onMessage = (m: any) => {
      if (m.id !== id) return
      finish(() => {
        if (m.fatal) { failures++; if (failures >= 2) disabled = true; kill(); return reject(new IsolateUnavailable(m.error)) }
        failures = 0
        if (m.error) return reject(new Error(m.error)) // a normal SQL error: same text the student would have seen in-process
        resolve({ sets: m.sets, bytes: m.bytes, changes: Number(m.changes) || 0 })
      })
    }
    const onError = (e: any) => finish(() => {
      kill()
      if (e?.code === 'ERR_WORKER_OUT_OF_MEMORY') return reject(new IsolateMemory())
      failures++; if (failures >= 2) disabled = true
      reject(new IsolateUnavailable(e?.message ?? 'worker failed'))
    })
    const onExit = () => finish(() => { if (worker === w) worker = null; reject(new IsolateUnavailable('worker exited')) })
    w.on('message', onMessage); w.on('error', onError); w.on('exit', onExit)
    // Copy: the caller keeps using its own database while the worker runs on this snapshot.
    w.postMessage({ id, bytes: bytes.slice(), sql, opts })
  })
}

/** Test hook: forget the worker (e.g. after changing limits). */
export function resetIsolate(): void {
  if (worker) worker.terminate().catch(() => {})
  worker = null; disabled = false; failures = 0
}
