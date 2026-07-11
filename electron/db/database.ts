/**
 * database.ts — sql.js version
 * Pure WebAssembly SQLite. Zero native compilation.
 * No Visual Studio. No node-gyp. Works on any Node version.
 */

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { CREATE_TABLES, SCHEMA_VERSION } from './schema'

let _db: any = null
let dbPath = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

// ─────────────────────────────────────────────
// INIT — async because WASM needs to load
// ─────────────────────────────────────────────

export async function initDb(): Promise<void> {
  const initSqlJs = require('sql.js')

  // Locate the wasm binary bundled with sql.js
  const sqlJsDir = path.dirname(require.resolve('sql.js'))
  const wasmBinary = fs.readFileSync(path.join(sqlJsDir, 'sql-wasm.wasm'))

  const SQL = await initSqlJs({ wasmBinary })

  const userData = app.getPath('userData')
  fs.mkdirSync(userData, { recursive: true })
  dbPath = path.join(userData, 'dericbi.db')

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath)
    _db = new SQL.Database(buf)
    console.log('[DB] Loaded:', dbPath)
  } else {
    _db = new SQL.Database()
    console.log('[DB] Created:', dbPath)
  }

  // Set pragmas
  _db.run('PRAGMA journal_mode=WAL;')
  _db.run('PRAGMA foreign_keys=ON;')

  // Create all tables
  _db.run(CREATE_TABLES)

  // Run migrations
  runMigrations()

  // Save initial state to disk
  _flush()
  console.log('[DB] Ready. Schema v' + SCHEMA_VERSION)
}

// ─────────────────────────────────────────────
// FLUSH to disk (debounced)
// ─────────────────────────────────────────────

function _flush(immediate = false): void {
  if (!_db || !dbPath) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  const doSave = () => {
    try {
      const data: Uint8Array = _db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    } catch (e) { console.error('[DB] Save error:', e) }
  }
  if (immediate) doSave()
  else saveTimer = setTimeout(doSave, 600)
}

// ─────────────────────────────────────────────
// DATASETS PATH — always the writable userData folder
// ─────────────────────────────────────────────
// Dataset CSVs are generated at runtime (never bundled in the installer —
// package.json's extraResources deliberately excludes content/datasets).
// They must live in userData, the same guaranteed-writable location the
// database itself uses — NOT in process.resourcesPath, which sits inside
// the installed app directory: often not writable without admin rights,
// and wiped/replaced on every auto-update regardless. Using userData here
// matches how the database already correctly handles exactly this problem.
export function getDatasetsPath(): string {
  const dir = path.join(app.getPath('userData'), 'datasets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ─────────────────────────────────────────────
// PUBLIC API — mirrors better-sqlite3 interface
// ─────────────────────────────────────────────

export function getDb() {
  if (!_db) throw new Error('DB not initialized')
  return {
    prepare: (sql: string) => new Stmt(sql),
    exec: (sql: string) => { _db.run(sql); _flush() },
    pragma: (_s: string) => null,
    transaction: (fn: () => void) => () => {
      _db.run('BEGIN')
      try { fn(); _db.run('COMMIT'); _flush() }
      catch (e) { _db.run('ROLLBACK'); throw e }
    },
    backup: (dest: string) => {
      _flush(true)
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dest)
    },
    close: () => { _flush(true); _db.close(); _db = null },
  }
}

class Stmt {
  private sql: string
  constructor(sql: string) { this.sql = sql }

  run(...args: any[]): { changes: number; lastInsertRowid: number } {
    const params = flatten(args).map(norm)
    _db.run(this.sql, params)
    _flush()
    const c = _db.exec('SELECT changes()')[0]?.values[0]?.[0] ?? 0
    const r = _db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0
    return { changes: c as number, lastInsertRowid: r as number }
  }

  get(...args: any[]): Record<string, any> | undefined {
    const params = flatten(args).map(norm)
    const res = _db.exec(this.sql, params)
    if (!res?.length || !res[0].values?.length) return undefined
    const { columns, values } = res[0]
    return toObj(columns, values[0])
  }

  all(...args: any[]): Record<string, any>[] {
    const params = flatten(args).map(norm)
    const res = _db.exec(this.sql, params)
    if (!res?.length) return []
    const { columns, values } = res[0]
    return values.map((row: any[]) => toObj(columns, row))
  }
}

function flatten(args: any[]): any[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  return args
}
function norm(v: any): any {
  if (v === undefined) return null
  if (v === true) return 1
  if (v === false) return 0
  return v
}
function toObj(cols: string[], vals: any[]): Record<string, any> {
  const o: Record<string, any> = {}
  cols.forEach((c, i) => { o[c] = vals[i] })
  return o
}

// ─────────────────────────────────────────────
// MIGRATIONS
// ─────────────────────────────────────────────

function runMigrations(): void {
  let cur = 0
  try {
    const r = _db.exec('SELECT MAX(version) as v FROM schema_migrations')
    cur = r[0]?.values[0]?.[0] ?? 0
  } catch { cur = 0 }

  if (cur >= SCHEMA_VERSION) {
    console.log('[DB] Schema current (v' + cur + ')')
    return
  }

  // v1 — initial
  if (cur < 1) {
    _db.run('BEGIN')
    _db.run("INSERT INTO schema_migrations (version, description) VALUES (1, 'Initial schema')")
    _db.run('COMMIT')
  }

  // v2 — add quiz column to lessons (existing installs created the table
  // before this column existed; CREATE TABLE IF NOT EXISTS won't add it
  // retroactively, so it needs an explicit ALTER TABLE here)
  if (cur < 2) {
    _db.run('BEGIN')
    try {
      _db.run("ALTER TABLE lessons ADD COLUMN quiz TEXT NOT NULL DEFAULT '[]'")
    } catch (e: any) {
      // Column already exists (e.g. a fresh install that got it from
      // CREATE_TABLES directly) — safe to ignore.
      if (!String(e.message).includes('duplicate column')) throw e
    }
    _db.run("INSERT INTO schema_migrations (version, description) VALUES (2, 'Add quiz column to lessons')")
    _db.run('COMMIT')
  }

  // v3 — add is_admin column to users, and auto-promote the earliest
  // registered user to admin (on a personal desktop install, whoever
  // registered first is virtually always the app's owner)
  if (cur < 3) {
    _db.run('BEGIN')
    try {
      _db.run("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    } catch (e: any) {
      if (!String(e.message).includes('duplicate column')) throw e
    }
    try {
      const r = _db.exec("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
      const firstUserId = r[0]?.values[0]?.[0]
      if (firstUserId) {
        _db.run("UPDATE users SET is_admin = 1 WHERE id = ?", [firstUserId])
      }
    } catch { /* no users yet — nothing to promote */ }
    _db.run("INSERT INTO schema_migrations (version, description) VALUES (3, 'Add is_admin column, promote first user')")
    _db.run('COMMIT')
  }
}

// ─────────────────────────────────────────────
// BACKUP & CLOSE
// ─────────────────────────────────────────────

export function backupDb(): string {
  const backupDir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(backupDir, 'dericbi-backup-' + ts + '.db')
  _flush(true)
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dest)
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort().reverse()
  files.slice(5).forEach(f => fs.unlinkSync(path.join(backupDir, f)))
  return dest
}

export function closeDb(): void {
  if (_db) { _flush(true); _db.close(); _db = null; console.log('[DB] Closed') }
}
