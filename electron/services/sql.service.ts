import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { getDb, getDatasetsPath } from '../db/database'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─────────────────────────────────────────────
// SANDBOX POOL — each sandbox is an in-memory sql.js DB
// ─────────────────────────────────────────────

const sandboxPool = new Map<string, any>()
let _SQL: any = null

async function getSqlJs(): Promise<any> {
  if (_SQL) return _SQL
  const initSqlJs = require('sql.js')
  const sqlJsDir = path.dirname(require.resolve('sql.js'))
  const wasmBinary = fs.readFileSync(path.join(sqlJsDir, 'sql-wasm.wasm'))
  _SQL = await initSqlJs({ wasmBinary })
  return _SQL
}

async function getSandbox(sandboxId: string): Promise<any> {
  if (sandboxPool.has(sandboxId)) return sandboxPool.get(sandboxId)
  const SQL = await getSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys=ON;')
  sandboxPool.set(sandboxId, db)
  return db
}

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
}

export async function executeSQL(params: {
  sandboxId: string; query: string; userId: string
}): Promise<SqlResult> {
  const mainDb = getDb()
  const start = Date.now()

  try {
    const sandbox = await getSandbox(params.sandboxId)
    const norm = params.query.trim().toUpperCase()
    if (norm.startsWith('DROP DATABASE')) {
      return { success: false, error: 'DROP DATABASE is not permitted in the sandbox.' }
    }

    const isSelect = norm.startsWith('SELECT') || norm.startsWith('WITH') || norm.startsWith('EXPLAIN')
    let rows: any[] = []
    let columns: string[] = []
    let affected = 0

    if (isSelect) {
      const res = sandbox.exec(params.query)
      if (res && res.length > 0) {
        columns = res[0].columns
        rows = res[0].values.map((v: any[]) => {
          const o: any = {}
          columns.forEach((c: string, i: number) => { o[c] = v[i] })
          return o
        })
      }
    } else {
      sandbox.run(params.query)
      const c = sandbox.exec('SELECT changes()')[0]?.values[0]?.[0] ?? 0
      affected = c as number
    }

    const exec_ms = Date.now() - start
    mainDb.prepare(`
      INSERT INTO sql_query_history (id, user_id, query, success, row_count, exec_ms)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(uuidv4(), params.userId, params.query, rows.length, exec_ms)

    return { success: true, rows, columns, row_count: rows.length, exec_ms, affected_rows: affected }
  } catch (err: any) {
    const exec_ms = Date.now() - start
    try {
      getDb().prepare(`
        INSERT INTO sql_query_history (id, user_id, query, success, error_msg, exec_ms)
        VALUES (?, ?, ?, 0, ?, ?)
      `).run(uuidv4(), params.userId, params.query, err.message, exec_ms)
    } catch {}
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

async function ensureDefaultDatasetsLoaded(sandboxId: string): Promise<void> {
  if (!sandboxId.startsWith('ex_')) return // only auto-load for exercise sandboxes

  const sandbox = await getSandbox(sandboxId)

  // Skip if already loaded (e.g. retrying the same exercise in one session)
  const existing = sandbox.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='patients'`)
  if (existing && existing.length > 0) return

  const datasetsDir = getDatasetsPath()
  for (const ds of getDefaultDatasetRows()) {
    const resourcePath = path.join(datasetsDir, ds.file_path)

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
      const res = sandbox.exec(q)
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

  const resourcePath = path.join(getDatasetsPath(), dataset.file_path)

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

export function profileTable(sandbox: any, tableName: string): DataProfile {
  const q = (sql: string) => {
    const r = sandbox.exec(sql)
    return r[0]?.values[0]?.[0] ?? 0
  }

  const rowCount = q(`SELECT COUNT(*) FROM "${tableName}"`) as number
  const colInfo = sandbox.exec(`PRAGMA table_info("${tableName}")`)[0]
  if (!colInfo) return { row_count: 0, column_count: 0, columns: [], duplicate_rows: 0, quality_score: 0, issues: [] }

  const columns = colInfo.values.map((v: any[]) => v[1] as string)
  const issues: string[] = []

  const columnProfiles: ColumnProfile[] = columns.map((name: string) => {
    const nullCount = q(`SELECT COUNT(*) FROM "${tableName}" WHERE "${name}" IS NULL`) as number
    const uniqueCount = q(`SELECT COUNT(DISTINCT "${name}") FROM "${tableName}"`) as number
    const nullPct = rowCount > 0 ? Math.round((nullCount / rowCount) * 100) : 0

    const samplesRes = sandbox.exec(`SELECT DISTINCT "${name}" FROM "${tableName}" WHERE "${name}" IS NOT NULL LIMIT 5`)
    const samples = samplesRes[0]?.values?.map((v: any[]) => v[0]) ?? []

    if (nullPct > 20) issues.push(`Column "${name}" has ${nullPct}% missing values`)
    return { name, type: 'TEXT', null_count: nullCount, null_pct: nullPct, unique_count: uniqueCount, sample_values: samples }
  })

  const dupRow = sandbox.exec(`SELECT COUNT(*) - COUNT(DISTINCT rowid) FROM "${tableName}"`)[0]
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

    const cols = Object.keys(rows[0])
    const colDefs = cols.map(c => `"${c}" TEXT`).join(', ')
    sandbox.run(`DROP TABLE IF EXISTS "${tableName}"`)
    sandbox.run(`CREATE TABLE "${tableName}" (${colDefs})`)

    const placeholders = cols.map(() => '?').join(', ')
    const insertSql = `INSERT INTO "${tableName}" VALUES (${placeholders})`

    sandbox.run('BEGIN')
    for (const row of rows) {
      sandbox.run(insertSql, cols.map(c => row[c] !== undefined && row[c] !== null ? String(row[c]) : null))
    }
    sandbox.run('COMMIT')

    return { success: true, table_name: tableName }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
