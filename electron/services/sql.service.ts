import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { getDb, getDatasetsPath } from '../db/database'
import { ensureDatasetFiles } from './setup.service'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────
// SANDBOX POOL — each sandbox is an in-memory sql.js DB
// ─────────────────────────────────────────────

const sandboxPool = new Map<string, any>()
let _SQL: any = null

export async function getSqlJs(): Promise<any> {
  if (_SQL) return _SQL
  const initSqlJs = require('sql.js')
  const sqlJsDir = path.dirname(require.resolve('sql.js'))
  const wasmBinary = fs.readFileSync(path.join(sqlJsDir, 'sql-wasm.wasm'))
  _SQL = await initSqlJs({ wasmBinary })
  return _SQL
}

export async function getSandbox(sandboxId: string): Promise<any> {
  if (sandboxPool.has(sandboxId)) return sandboxPool.get(sandboxId)
  const SQL = await getSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys=ON;')
  sandboxPool.set(sandboxId, db)
  return db
}

/** Put an already-built database into the pool (used when a saved user database is reopened). */
export function registerSandbox(sandboxId: string, db: any): void {
  closeSandbox(sandboxId)
  sandboxPool.set(sandboxId, db)
}

export function hasSandbox(sandboxId: string): boolean { return sandboxPool.has(sandboxId) }

export function closeSandbox(sandboxId: string): void {
  const db = sandboxPool.get(sandboxId)
  if (db) { try { db.close() } catch {} sandboxPool.delete(sandboxId) }
}

// ─────────────────────────────────────────────
// EXECUTE SQL
// ─────────────────────────────────────────────

export interface SqlResult {
  success: boolean
  rows?: any[]
  columns?: string[]
  row_count?: number
  exec_ms?: number
  error?: string
  affected_rows?: number
  /** True when the result was cut short (too many rows or too slow); `notice` says so in plain words. */
  truncated?: boolean
  notice?: string
}

/**
 * Removes leading whitespace and SQL comments (both `--` line comments and slash-star
 * block comments) so the first REAL keyword of a query can be inspected.
 *
 * Why this matters: the Playground pre-fills its editor with `-- Write your SQL here`
 * and every dataset click writes `-- Dataset: …` above the SELECT. Deciding "is this a
 * SELECT?" from the raw text saw `--` instead of `SELECT`, so the query was run as a
 * write and the grid came back EMPTY even though the data was loaded and the query was fine.
 */
export function stripLeadingComments(sql: string): string {
  let s = sql
  for (;;) {
    s = s.replace(/^\s+/, '')
    if (s.startsWith('--')) { const i = s.indexOf('\n'); s = i === -1 ? '' : s.slice(i + 1); continue }
    if (s.startsWith('/*')) { const i = s.indexOf('*/'); s = i === -1 ? '' : s.slice(i + 2); continue }
    return s
  }
}

// ─────────────────────────────────────────────
// BOUNDED EXECUTION
// ─────────────────────────────────────────────
// sql.js runs inside the app's main process. A plain exec() builds the WHOLE result in memory before returning,
// so a beginner's endless recursive query ("WITH RECURSIVE c AS (... FROM c)" with no stop condition) or a
// forgotten JOIN condition would use all the memory and crash the entire app. Stepping row by row lets us stop
// after a sensible number of rows or seconds and tell the student what probably went wrong.
export const MAX_RESULT_ROWS = 10_000
export const MAX_QUERY_MS = 10_000

export interface BoundedSet { columns: string[]; values: any[][]; truncated?: 'rows' | 'time' }

/** Like sandbox.exec(), but stops reading rows past `maxRows` or `maxMs` and flags the set as truncated. */
export function execBounded(db: any, sql: string, opts: { maxRows?: number; maxMs?: number } = {}): BoundedSet[] {
  const maxRows = opts.maxRows ?? MAX_RESULT_ROWS
  const deadline = Date.now() + (opts.maxMs ?? MAX_QUERY_MS)
  const sets: BoundedSet[] = []
  for (const stmt of db.iterateStatements(sql)) {
    let cur: BoundedSet | null = null
    try {
      while (stmt.step()) {
        if (!cur) { cur = { columns: stmt.getColumnNames(), values: [] }; sets.push(cur) }
        if (cur.values.length >= maxRows) { cur.truncated = 'rows'; break }
        cur.values.push(stmt.get())
        if ((cur.values.length & 255) === 0 && Date.now() > deadline) { cur.truncated = 'time'; break }
      }
    } finally {
      stmt.free()
    }
    if (cur?.truncated) break // do not go on to run later statements after cutting one short
  }
  return sets
}

export const TRUNCATION_HELP = 'If you did not expect this many rows, check for a missing JOIN condition or a recursive query with no stop condition.'

export async function executeSQL(params: {
  sandboxId: string; query: string; userId: string
}): Promise<SqlResult> {
  const start = Date.now()

  // Query history is a convenience log. A failure to write it (e.g. a user row that
  // no longer exists) must never turn a query that ran fine into a reported failure.
  const logHistory = (success: boolean, rowCount: number, errorMsg: string | null, execMs: number) => {
    try {
      getDb().prepare(`
        INSERT INTO sql_query_history (id, user_id, query, success, row_count, error_msg, exec_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), params.userId, params.query, success ? 1 : 0, rowCount, errorMsg, execMs)
    } catch (e: any) {
      console.warn('[SQL] could not record query history:', e?.message)
    }
  }

  try {
    const statement = stripLeadingComments(params.query)
    if (!statement.trim()) {
      return { success: false, error: 'Nothing to run: the query is empty (only comments or blank).' }
    }
    if (statement.toUpperCase().startsWith('DROP DATABASE')) {
      return { success: false, error: 'DROP DATABASE is not permitted in the sandbox.' }
    }

    // Exercise sandboxes start empty; make sure the practice tables are there before ANY
    // query runs (not only before grading), otherwise "Run" gives "no such table: patients".
    await ensureDefaultDatasetsLoaded(params.sandboxId)
    // "My Databases": check ownership and reopen the saved file before running anything.
    const isUserDb = params.sandboxId.startsWith('udb_')
    const userDbs = isUserDb ? require('./userdb.service') as typeof import('./userdb.service') : null
    if (userDbs) {
      const opened = await userDbs.openUserDatabase(params.userId, params.sandboxId)
      if (!opened.success) return { success: false, error: opened.error }
    }
    const sandbox = await getSandbox(params.sandboxId)
    const before = userDbs ? userDbs.changeSignature(sandbox) : ''

    // exec() runs every statement in the text and returns one result set per statement that
    // produced rows. Like a normal SQL console, show the LAST one (`SELECT 1; SELECT 2;` -> 2).
    const sets = execBounded(sandbox, params.query)
    let rows: any[] = []
    let columns: string[] = []
    if (sets && sets.length > 0) {
      const last = sets[sets.length - 1]
      columns = last.columns
      rows = last.values.map((v: any[]) => {
        const o: any = {}
        columns.forEach((c: string, i: number) => { o[c] = v[i] })
        return o
      })
    }

    // Only report "rows changed" for statements that write; for a SELECT, changes() would
    // return the count left over from an earlier write.
    const returnsRows = /^(SELECT|WITH|EXPLAIN|PRAGMA|VALUES)\b/i.test(statement)
    const affected = returnsRows || (sets && sets.length > 0)
      ? 0
      : (sandbox.exec('SELECT changes()')[0]?.values[0]?.[0] ?? 0) as number

    // Anything that changed a user database (rows OR structure) is saved to its file straight away, so a
    // closed window or a crash never loses a student's work.
    if (userDbs && userDbs.changeSignature(sandbox) !== before) {
      const saved = await userDbs.persistUserDatabase(params.userId, params.sandboxId)
      if (!saved.success) { logHistory(false, 0, saved.error ?? null, Date.now() - start); return { success: false, error: saved.error, exec_ms: Date.now() - start } }
    }

    const truncated = sets.length > 0 ? sets[sets.length - 1].truncated : undefined
    const notice = truncated === 'rows'
      ? `Showing the first ${MAX_RESULT_ROWS.toLocaleString('en-US')} rows only. ${TRUNCATION_HELP}`
      : truncated === 'time'
        ? `Stopped after ${MAX_QUERY_MS / 1000} seconds; showing the ${rows.length.toLocaleString('en-US')} rows found so far. ${TRUNCATION_HELP}`
        : undefined

    const exec_ms = Date.now() - start
    logHistory(true, rows.length, null, exec_ms)
    return { success: true, rows, columns, row_count: rows.length, exec_ms, affected_rows: affected, ...(notice ? { truncated: true, notice } : {}) }
  } catch (err: any) {
    const exec_ms = Date.now() - start
    logHistory(false, 0, err.message, exec_ms)
    return { success: false, error: err.message, exec_ms }
  }
}

// ─────────────────────────────────────────────
// VALIDATE EXERCISE ANSWER
// ─────────────────────────────────────────────

export interface ValidationResult {
  correct: boolean; score: number; feedback: string
  actual_rows?: any[]; expected_rows?: any[]
}

// ─────────────────────────────────────────────
// AUTO-LOAD DEFAULT DATASETS FOR EXERCISES
// ─────────────────────────────────────────────
// Every exercise in the built-in SQL curriculum queries the bundled
// hospital dataset (patients / billing tables). Rather than requiring
// every exercise JSON to declare a dataset_id (most future content will
// use the same two tables), we auto-load them into any exercise sandbox
// that doesn't have them yet. This only runs for exercise sandboxes
// (sandboxId starting with "ex_") — the free-form Playground manages its
// own dataset selection via loadBundledDataset and is untouched by this.

let defaultDatasetsCache: { id: string; table_name: string; file_path: string }[] | null = null

function getDefaultDatasetRows(): { id: string; table_name: string; file_path: string }[] {
  // Explicit length check, not truthiness — an empty array is truthy in JS.
  // If this ever ran once before bundled_datasets was populated (a timing
  // edge case during first-time setup), a plain `if (defaultDatasetsCache)`
  // would cache that empty result FOREVER for the rest of the session,
  // making every single SQL exercise fail with "no such table" until the
  // app was fully restarted. This is very likely the "always fails" bug.
  if (defaultDatasetsCache && defaultDatasetsCache.length > 0) return defaultDatasetsCache
  const mainDb = getDb()
  defaultDatasetsCache = mainDb.prepare(`
    SELECT id, table_name, file_path FROM bundled_datasets
    WHERE id IN ('ds-hospital-patients', 'ds-hospital-billing')
  `).all() as any[]
  return defaultDatasetsCache
}

/**
 * Full path of a bundled dataset's CSV. If the file has gone missing (antivirus quarantine, a disk
 * cleaner, an interrupted first run) it is regenerated on the spot instead of leaving every query
 * stuck on "File not found" until the app is reinstalled.
 */
async function bundledFilePath(fileName: string): Promise<string> {
  const full = path.join(getDatasetsPath(), fileName)
  if (!fs.existsSync(full)) {
    try { await ensureDatasetFiles() } catch (e: any) { console.warn('[SQL] could not regenerate datasets:', e?.message) }
  }
  return full
}

async function ensureDefaultDatasetsLoaded(sandboxId: string): Promise<void> {
  if (!sandboxId.startsWith('ex_')) return // only auto-load for exercise sandboxes

  const sandbox = await getSandbox(sandboxId)

  // Skip if already loaded (e.g. retrying the same exercise in one session)
  const existing = sandbox.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='patients'`)
  if (existing && existing.length > 0) return

  for (const ds of getDefaultDatasetRows()) {
    const resourcePath = await bundledFilePath(ds.file_path)

    if (!fs.existsSync(resourcePath)) {
      console.warn(`[SQL] Default dataset file missing: ${resourcePath}`)
      continue
    }
    await loadFileIntoSandbox(sandboxId, resourcePath, ds.table_name)
  }
}

export async function validateSQLAnswer(params: {
  sandboxId: string; userQuery: string; solutionQuery: string
  evaluationMode: string; expectedOutput?: any
}): Promise<ValidationResult> {
  try {
    // Every exercise in the built-in curriculum runs against the bundled
    // hospital dataset (patients + billing tables). Exercise sandboxes are
    // created fresh and empty — without this, every exercise fails with
    // "no such table" the first time it's opened, or after any app restart
    // (the sandbox pool is in-memory and doesn't survive a restart).
    await ensureDefaultDatasetsLoaded(params.sandboxId)

    const sandbox = await getSandbox(params.sandboxId)

    const runQuery = (q: string): any[] => {
      const res = execBounded(sandbox, q, { maxRows: 100_000 })
      if (res[0]?.truncated) throw new Error(`Your query returned far too many rows or ran too long. ${TRUNCATION_HELP}`)
      if (!res?.length) return []
      const { columns, values } = res[0]
      return values.map((v: any[]) => {
        const o: any = {}
        columns.forEach((c: string, i: number) => { o[c] = v[i] })
        return o
      })
    }

    if (params.evaluationMode === 'exact' || params.evaluationMode === 'result_match') {
      let userRows: any[]
      try { userRows = runQuery(params.userQuery) }
      catch (e: any) { return { correct: false, score: 0, feedback: `Query error: ${e.message}` } }

      const expected = params.evaluationMode === 'result_match' && params.expectedOutput
        ? params.expectedOutput
        : runQuery(params.solutionQuery)

      const userStr = JSON.stringify(userRows.map(r => Object.values(r).map(String)))
      const expStr = JSON.stringify(expected.map((r: any) => Object.values(r).map(String)))

      if (userStr === expStr) return { correct: true, score: 100, feedback: 'Correct! Your query produces the expected result.', actual_rows: userRows }

      const sameCount = userRows.length === expected.length
      if (sameCount) return { correct: false, score: 50, feedback: `Row count matches (${userRows.length}) but some values differ. Check your calculations or filters.`, actual_rows: userRows, expected_rows: expected }
      return { correct: false, score: 0, feedback: `Expected ${expected.length} rows, got ${userRows.length}. Review your query logic.`, actual_rows: userRows, expected_rows: expected }
    }

    return { correct: false, score: -1, feedback: 'ai_review_required' }
  } catch (err: any) {
    return { correct: false, score: 0, feedback: `Validation error: ${err.message}` }
  }
}

// ─────────────────────────────────────────────
// LOAD BUNDLED DATASET INTO SANDBOX
// ─────────────────────────────────────────────

export async function loadBundledDataset(sandboxId: string, datasetId: string): Promise<{ success: boolean; error?: string; table_name?: string }> {
  const mainDb = getDb()
  const dataset = mainDb.prepare('SELECT * FROM bundled_datasets WHERE id = ?').get(datasetId) as any
  if (!dataset) return { success: false, error: 'Dataset not found.' }

  const resourcePath = await bundledFilePath(dataset.file_path)

  return loadFileIntoSandbox(sandboxId, resourcePath, dataset.table_name)
}

export async function loadImportedDataset(sandboxId: string, userId: string, datasetId: string): Promise<{ success: boolean; error?: string; table_name?: string }> {
  const mainDb = getDb()
  const dataset = mainDb.prepare('SELECT * FROM imported_datasets WHERE id = ? AND user_id = ?').get(datasetId, userId) as any
  if (!dataset) return { success: false, error: 'Dataset not found.' }
  return loadFileIntoSandbox(sandboxId, dataset.stored_path, dataset.table_name)
}

// ─────────────────────────────────────────────
// IMPORT USER FILE
// ─────────────────────────────────────────────

export async function importFile(userId: string, filePath: string, fileName: string): Promise<{
  success: boolean; dataset?: any; profile?: DataProfile; error?: string
}> {
  const mainDb = getDb()
  const ext = path.extname(fileName).toLowerCase().replace('.', '')
  if (!['csv', 'xlsx', 'xls', 'json'].includes(ext)) {
    return { success: false, error: `File type .${ext} is not supported.` }
  }

  const datasetsDir = getDatasetsPath()

  const datasetId = uuidv4()
  const tableName = `ds_${datasetId.replace(/-/g, '_').slice(0, 16)}`
  const storedPath = path.join(datasetsDir, `${datasetId}.${ext}`)
  fs.copyFileSync(filePath, storedPath)

  const tempSandboxId = `profile_${datasetId}`
  const result = await loadFileIntoSandbox(tempSandboxId, storedPath, tableName)
  if (!result.success) { closeSandbox(tempSandboxId); return { success: false, error: result.error } }

  const sandbox = await getSandbox(tempSandboxId)
  const profile = profileTable(sandbox, tableName)
  closeSandbox(tempSandboxId)

  mainDb.prepare(`
    INSERT INTO imported_datasets
    (id, user_id, name, original_filename, file_type, stored_path, table_name,
     row_count, column_count, column_info, quality_score, profile_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    datasetId, userId,
    path.basename(fileName, path.extname(fileName)),
    fileName, ext, storedPath, tableName,
    profile.row_count, profile.column_count,
    JSON.stringify(profile.columns), profile.quality_score, JSON.stringify(profile)
  )

  const dataset = mainDb.prepare('SELECT * FROM imported_datasets WHERE id = ?').get(datasetId)
  return { success: true, dataset, profile }
}

// ─────────────────────────────────────────────
// DATA PROFILING
// ─────────────────────────────────────────────

export interface ColumnProfile {
  name: string; type: string; null_count: number; null_pct: number
  unique_count: number; sample_values: any[]
}
export interface DataProfile {
  row_count: number; column_count: number; columns: ColumnProfile[]
  duplicate_rows: number; quality_score: number; issues: string[]
}

/** Quote an SQL identifier (column/table name), doubling any embedded double quotes. */
const quoteId = (id: string) => `"${String(id).replace(/"/g, '""')}"`

export function profileTable(sandbox: any, tableName: string): DataProfile {
  const T = quoteId(tableName)
  const q = (sql: string) => {
    const r = sandbox.exec(sql)
    return r[0]?.values[0]?.[0] ?? 0
  }

  const rowCount = q(`SELECT COUNT(*) FROM ${T}`) as number
  const colInfo = sandbox.exec(`PRAGMA table_info(${T})`)[0]
  if (!colInfo) return { row_count: 0, column_count: 0, columns: [], duplicate_rows: 0, quality_score: 0, issues: [] }

  const columns = colInfo.values.map((v: any[]) => v[1] as string)
  const issues: string[] = []

  const columnProfiles: ColumnProfile[] = columns.map((name: string) => {
    const C = quoteId(name)
    const nullCount = q(`SELECT COUNT(*) FROM ${T} WHERE ${C} IS NULL`) as number
    const uniqueCount = q(`SELECT COUNT(DISTINCT ${C}) FROM ${T}`) as number
    const nullPct = rowCount > 0 ? Math.round((nullCount / rowCount) * 100) : 0

    const samplesRes = sandbox.exec(`SELECT DISTINCT ${C} FROM ${T} WHERE ${C} IS NOT NULL LIMIT 5`)
    const samples = samplesRes[0]?.values?.map((v: any[]) => v[0]) ?? []

    if (nullPct > 20) issues.push(`Column "${name}" has ${nullPct}% missing values`)
    return { name, type: 'TEXT', null_count: nullCount, null_pct: nullPct, unique_count: uniqueCount, sample_values: samples }
  })

  // Duplicates = total rows minus rows that remain after DISTINCT over all columns.
  // (The previous `COUNT(*) - COUNT(DISTINCT rowid)` was always 0 - rowid is unique by definition -
  // so duplicate rows in an imported file were never reported.)
  const dupRow = sandbox.exec(`SELECT (SELECT COUNT(*) FROM ${T}) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM ${T}))`)[0]
  const duplicateRows = (dupRow?.values[0]?.[0] ?? 0) as number
  if (duplicateRows > 0) issues.push(`${duplicateRows} duplicate rows detected`)

  const avgNullPct = columnProfiles.reduce((s, c) => s + c.null_pct, 0) / (columnProfiles.length || 1)
  const dupPct = rowCount > 0 ? (duplicateRows / rowCount) * 100 : 0
  const qualityScore = Math.max(0, Math.round(100 - avgNullPct * 0.6 - dupPct * 0.4))

  return { row_count: rowCount, column_count: columns.length, columns: columnProfiles, duplicate_rows: duplicateRows, quality_score: qualityScore, issues }
}

// ─────────────────────────────────────────────
// INTERNAL: LOAD FILE INTO SANDBOX
// ─────────────────────────────────────────────

async function loadFileIntoSandbox(sandboxId: string, filePath: string, tableName: string): Promise<{ success: boolean; error?: string; table_name?: string }> {
  if (!fs.existsSync(filePath)) return { success: false, error: `File not found: ${filePath}` }

  const sandbox = await getSandbox(sandboxId)
  const ext = path.extname(filePath).toLowerCase()

  try {
    let rows: any[]

    if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true, dynamicTyping: true })
      rows = parsed.data as any[]
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
    } else if (ext === '.json') {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(content)
      rows = Array.isArray(parsed) ? parsed : [parsed]
    } else {
      return { success: false, error: `Unsupported file type: ${ext}` }
    }

    if (rows.length === 0) return { success: false, error: 'File is empty.' }
    if (!rows.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
      return { success: false, error: 'The file must contain rows of named columns (for JSON: an array of objects).' }
    }

    // Union of keys across ALL rows - JSON rows may omit a key the first row has (or vice versa).
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
    const quote = quoteId

    // Give every column a REAL type. Storing everything as TEXT made `WHERE age > 60` compare
    // strings ('7' > '60'), `ORDER BY age` sort alphabetically and SUM/AVG/MAX behave oddly -
    // students silently got wrong answers from correct SQL.
    const colTypes = cols.map(c => inferColumnType(rows.map(r => r[c])))
    const colDefs = cols.map((c, i) => `${quote(c)} ${colTypes[i]}`).join(', ')
    sandbox.run(`DROP TABLE IF EXISTS ${quote(tableName)}`)
    sandbox.run(`CREATE TABLE ${quote(tableName)} (${colDefs})`)

    const placeholders = cols.map(() => '?').join(', ')
    const insertSql = `INSERT INTO ${quote(tableName)} VALUES (${placeholders})`

    sandbox.run('BEGIN')
    try {
      for (const row of rows) {
        sandbox.run(insertSql, cols.map((c, i) => {
          const v = row[c]
          if (v === undefined || v === null) return null
          return colTypes[i] === 'TEXT' ? String(v) : v
        }))
      }
      sandbox.run('COMMIT')
    } catch (e) {
      try { sandbox.run('ROLLBACK') } catch {}
      throw e
    }

    return { success: true, table_name: tableName }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/** INTEGER if every value is a whole number, REAL if every value is a number, otherwise TEXT. */
function inferColumnType(values: any[]): 'INTEGER' | 'REAL' | 'TEXT' {
  let sawNumber = false
  let allIntegers = true
  for (const v of values) {
    if (v === null || v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'TEXT'
    sawNumber = true
    if (!Number.isInteger(v)) allIntegers = false
  }
  if (!sawNumber) return 'TEXT'
  return allIntegers ? 'INTEGER' : 'REAL'
}
