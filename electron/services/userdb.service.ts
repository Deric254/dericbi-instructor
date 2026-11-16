import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { getDb } from '../db/database'
import { getSqlJs, getSandbox, registerSandbox, closeSandbox } from './sql.service'

// ─────────────────────────────────────────────
// MY DATABASES — databases a learner builds from scratch
// ─────────────────────────────────────────────
// Each one is a real SQLite file in userData/user-databases/. While open it lives in the same in-memory pool
// the Playground uses (sandbox id "udb_<id>"), and every change is written back to the file immediately,
// so the work survives closing the screen, closing the app, or an update.

export const MAX_DATABASES_PER_USER = 20
export const MAX_DATABASE_BYTES = 50 * 1024 * 1024
export const SANDBOX_PREFIX = 'udb_'

export interface UserDatabase { id: string; name: string; created_at: string; updated_at: string; size_bytes: number; table_count: number }
export interface TableInfo {
  name: string; row_count: number
  columns: { name: string; type: string; pk: boolean; notnull: boolean }[]
}

const dir = (userId: string): string => {
  const d = path.join(app.getPath('userData'), 'user-databases', userId.replace(/[^a-zA-Z0-9_-]/g, '_'))
  fs.mkdirSync(d, { recursive: true })
  return d
}
export const sandboxIdFor = (dbId: string) => `${SANDBOX_PREFIX}${dbId}`
const dbIdFrom = (sandboxId: string) => sandboxId.slice(SANDBOX_PREFIX.length)
const quoteId = (name: string) => `"${name.replace(/"/g, '""')}"`

function row(userId: string, dbId: string): any | undefined {
  return getDb().prepare('SELECT * FROM user_databases WHERE id = ? AND user_id = ?').get(dbId, userId)
}
const fileOf = (userId: string, r: any) => path.join(dir(userId), r.file_name)

/** Write atomically: a crash mid-write must never leave a half-written database. */
function writeFileAtomic(file: string, bytes: Uint8Array): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, Buffer.from(bytes))
  fs.renameSync(tmp, file)
}

/** Changes whenever rows OR structure change (CREATE/DROP do not move total_changes alone). */
export function changeSignature(sandbox: any): string {
  const a = sandbox.exec('SELECT total_changes()')[0]?.values[0]?.[0]
  const b = sandbox.exec('PRAGMA schema_version')[0]?.values[0]?.[0]
  return `${a}:${b}`
}

export function validateName(raw: unknown): { ok: boolean; name: string; error: string } {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, name: '', error: 'Give your database a name.' }
  if (name.length > 60) return { ok: false, name: '', error: 'Database names can be up to 60 characters.' }
  if (/[\u0000-\u001f<>]/.test(name)) return { ok: false, name: '', error: 'That name contains characters that are not allowed.' }
  return { ok: true, name, error: '' }
}

function describe(sandbox: any): TableInfo[] {
  const tables = sandbox.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map((v: any[]) => String(v[0])) ?? []
  return tables.map((name: string) => {
    const cols = sandbox.exec(`PRAGMA table_info(${quoteId(name)})`)[0]?.values ?? []
    const count = sandbox.exec(`SELECT COUNT(*) FROM ${quoteId(name)}`)[0]?.values[0]?.[0] ?? 0
    return {
      name, row_count: Number(count),
      columns: cols.map((c: any[]) => ({ name: String(c[1]), type: String(c[2] || ''), notnull: !!c[3], pk: !!c[5] })),
    }
  })
}

export async function listUserDatabases(userId: string): Promise<UserDatabase[]> {
  const SQL = await getSqlJs()
  const rows = getDb().prepare('SELECT * FROM user_databases WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC').all(userId) as any[]
  return rows.map((r) => {
    let size = 0; let tableCount = 0
    try {
      const file = fileOf(userId, r)
      size = fs.statSync(file).size
      const tmp = new SQL.Database(fs.readFileSync(file))
      try { tableCount = Number(tmp.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values[0]?.[0] ?? 0) } finally { tmp.close() }
    } catch { /* a missing/corrupt file is reported when the database is opened */ }
    return { id: r.id, name: r.name, created_at: r.created_at, updated_at: r.updated_at, size_bytes: size, table_count: tableCount }
  })
}

export async function createUserDatabase(userId: string, rawName: unknown): Promise<{ success: boolean; database?: UserDatabase; error?: string }> {
  const v = validateName(rawName)
  if (!v.ok) return { success: false, error: v.error }
  if (typeof userId !== 'string' || !getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return { success: false, error: 'Your session has expired. Please sign in again.' }
  const existing = getDb().prepare('SELECT name FROM user_databases WHERE user_id = ?').all(userId) as any[]
  if (existing.length >= MAX_DATABASES_PER_USER) return { success: false, error: `You can keep up to ${MAX_DATABASES_PER_USER} databases. Delete one you no longer need first.` }
  if (existing.some((e) => String(e.name).toLowerCase() === v.name.toLowerCase())) return { success: false, error: `You already have a database called "${v.name}".` }

  const SQL = await getSqlJs()
  const id = uuidv4()
  const file_name = `${id}.sqlite`
  const target = path.join(dir(userId), file_name)
  const empty = new SQL.Database()
  try {
    writeFileAtomic(target, empty.export())
    getDb().prepare('INSERT INTO user_databases (id, user_id, name, file_name) VALUES (?, ?, ?, ?)').run(id, userId, v.name, file_name)
  } catch (e: any) {
    try { fs.rmSync(target, { force: true }) } catch { /* nothing to clean */ }
    return { success: false, error: 'The database could not be created. Please sign in again and retry.' }
  } finally { empty.close() }
  return { success: true, database: { id, name: v.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), size_bytes: 0, table_count: 0 } }
}

export async function renameUserDatabase(userId: string, dbId: string, rawName: unknown): Promise<{ success: boolean; error?: string }> {
  if (!row(userId, dbId)) return { success: false, error: 'That database no longer exists.' }
  const v = validateName(rawName)
  if (!v.ok) return { success: false, error: v.error }
  const clash = (getDb().prepare('SELECT id, name FROM user_databases WHERE user_id = ?').all(userId) as any[])
    .some((e) => e.id !== dbId && String(e.name).toLowerCase() === v.name.toLowerCase())
  if (clash) return { success: false, error: `You already have a database called "${v.name}".` }
  getDb().prepare("UPDATE user_databases SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(v.name, dbId, userId)
  return { success: true }
}

export async function deleteUserDatabase(userId: string, dbId: string): Promise<{ success: boolean; error?: string }> {
  const r = row(userId, dbId)
  if (!r) return { success: false, error: 'That database no longer exists.' }
  closeSandbox(sandboxIdFor(dbId))
  try { fs.rmSync(fileOf(userId, r), { force: true }) } catch { /* index row is removed regardless */ }
  getDb().prepare('DELETE FROM user_databases WHERE id = ? AND user_id = ?').run(dbId, userId)
  return { success: true }
}

/** Make a saved database ready to query (idempotent). Verifies the database belongs to this user. */
export async function openUserDatabase(userId: string, sandboxId: string): Promise<{ success: boolean; error?: string }> {
  if (!sandboxId.startsWith(SANDBOX_PREFIX)) return { success: false, error: 'Not a user database.' }
  const r = row(userId, dbIdFrom(sandboxId))
  if (!r) return { success: false, error: 'That database no longer exists. Pick another from My Databases.' }
  if (isOpen(sandboxId)) return { success: true }
  const file = fileOf(userId, r)
  if (!fs.existsSync(file)) return { success: false, error: `The file for "${r.name}" is missing, so it cannot be opened.` }
  try {
    const SQL = await getSqlJs()
    const db = new SQL.Database(fs.readFileSync(file))
    try { db.exec('SELECT count(*) FROM sqlite_master') } catch { db.close(); throw new Error('the file is damaged') }
    db.run('PRAGMA foreign_keys=ON;')
    registerSandbox(sandboxId, db)
    openIds.add(sandboxId)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: `"${r.name}" could not be opened (${e?.message ?? 'unreadable file'}). You can delete it from My Databases and create a new one.` }
  }
}

// Track which user databases were loaded from disk, so a pool entry closed elsewhere is reloaded.
const openIds = new Set<string>()
function isOpen(sandboxId: string): boolean {
  return openIds.has(sandboxId) && sandboxPoolHas(sandboxId)
}
function sandboxPoolHas(sandboxId: string): boolean {
  try { return !!(require('./sql.service') as any).hasSandbox(sandboxId) } catch { return false }
}

/** Save the open database to its file. Refuses (and discards the change) if it would exceed the size limit. */
export async function persistUserDatabase(userId: string, sandboxId: string): Promise<{ success: boolean; error?: string }> {
  const r = row(userId, dbIdFrom(sandboxId))
  if (!r) return { success: false, error: 'That database no longer exists.' }
  const sandbox = await getSandbox(sandboxId)
  const bytes: Uint8Array = sandbox.export()
  sandbox.run('PRAGMA foreign_keys=ON;') // export() resets connection settings in some sql.js builds
  if (bytes.length > MAX_DATABASE_BYTES) {
    closeSandbox(sandboxId); openIds.delete(sandboxId) // discard; it reloads from the last good file
    return { success: false, error: `That change would make "${r.name}" larger than ${MAX_DATABASE_BYTES / 1024 / 1024} MB, so it was not saved.` }
  }
  writeFileAtomic(fileOf(userId, r), bytes)
  getDb().prepare("UPDATE user_databases SET updated_at = datetime('now') WHERE id = ?").run(r.id)
  return { success: true }
}

/** Tables and columns of a saved database, for the schema browser. */
export async function describeUserDatabase(userId: string, dbId: string): Promise<{ success: boolean; tables?: TableInfo[]; name?: string; error?: string }> {
  const sid = sandboxIdFor(dbId)
  const opened = await openUserDatabase(userId, sid)
  if (!opened.success) return { success: false, error: opened.error }
  const sandbox = await getSandbox(sid)
  try { return { success: true, name: row(userId, dbId).name, tables: describe(sandbox) } } catch (e: any) { return { success: false, error: e.message } }
}

/** Path of the .sqlite file for "Export" (the caller shows a Save dialog and copies it). */
export async function exportUserDatabasePath(userId: string, dbId: string): Promise<{ success: boolean; path?: string; name?: string; error?: string }> {
  const r = row(userId, dbId)
  if (!r) return { success: false, error: 'That database no longer exists.' }
  const sid = sandboxIdFor(dbId)
  if (isOpen(sid)) { const s = await persistUserDatabase(userId, sid); if (!s.success) return { success: false, error: s.error } }
  const file = fileOf(userId, r)
  if (!fs.existsSync(file)) return { success: false, error: 'The database file is missing.' }
  return { success: true, path: file, name: `${String(r.name).replace(/[^\w\- ]+/g, '').trim() || 'database'}.sqlite` }
}
