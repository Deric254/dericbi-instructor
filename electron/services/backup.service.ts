// A learner's progress as one small file they can keep, move to another computer, or restore after a reinstall.
// It holds learning data only: never the licence, the password, or the AI keys.
import { getDb } from '../db/database'

export const BACKUP_FORMAT = 'dericbi-progress'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024

/** Tables that belong to one learner, in the order they are restored (a table never points at one restored after it). */
const TABLES = [
  'lesson_progress', 'exercise_attempts', 'skill_ratings', 'learning_memory', 'user_achievements', 'analyst_ranks',
  'projects', 'portfolio_items', 'simulation_sessions', 'sql_query_history', 'python_code_history',
] as const

const RANK = (col: string) => `CASE ${col} WHEN 'complete' THEN 3 WHEN 'in_progress' THEN 2 WHEN 'available' THEN 1 ELSE 0 END`

const columnsOf = (table: string): string[] => (getDb().prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name)

export interface ProgressBackup { format: string; version: number; exported_at: string; tables: Record<string, Record<string, unknown>[]> }

export function exportProgress(userId: string): ProgressBackup {
  const db = getDb()
  const tables: ProgressBackup['tables'] = {}
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(userId) as any[]
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables }
}

export interface ImportResult { success: boolean; error?: string; added?: number; skipped?: number }

/**
 * Merges a backup into this learner's data. Nothing already here is overwritten or deleted, except that a lesson that
 * is further along in the backup (e.g. completed) is brought forward. Rows that do not fit this install (a lesson the
 * installed content does not have, say) are skipped and counted, never forced in.
 */
export function importProgress(userId: string, raw: unknown): ImportResult {
  const data = raw as Partial<ProgressBackup> | null
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT || !data.tables || typeof data.tables !== 'object') {
    return { success: false, error: 'This file is not a DericBI progress backup.' }
  }
  if (data.version !== BACKUP_VERSION) return { success: false, error: 'This backup was made by a different version of the app.' }
  const db = getDb()
  let added = 0
  let skipped = 0
  const run = db.transaction(() => {
    for (const t of TABLES) {
      const rows = (data.tables as any)[t]
      if (!Array.isArray(rows)) continue
      const have = new Set(columnsOf(t))
      for (const row of rows) {
        if (!row || typeof row !== 'object') { skipped++; continue }
        // session rows are not part of a backup, so history rows are restored without their session link
        const cols = Object.keys(row).filter((c) => have.has(c) && c !== 'user_id' && c !== 'session_id')
        if (!cols.length) { skipped++; continue }
        // ids are rebuilt from the learner + the original id: restoring twice never duplicates, and two learners never clash
        const names = ['user_id', ...cols]
        const values = [userId, ...cols.map((c) => (c === 'id' || (c === 'project_id' && (row as any)[c]) ? `bk_${userId}_${(row as any)[c]}` : (row as any)[c]))]
        const marks = names.map(() => '?').join(',')
        const sql = t === 'lesson_progress'
          // a lesson only ever moves forward: a finished lesson stays finished, a restored one never undoes local progress
          ? `INSERT INTO ${t} (${names.join(',')}) VALUES (${marks})
             ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = excluded.status, started_at = COALESCE(started_at, excluded.started_at),
               completed_at = COALESCE(completed_at, excluded.completed_at), time_spent_s = MAX(time_spent_s, excluded.time_spent_s)
             WHERE ${RANK('excluded.status')} > ${RANK('status')}`
          : `INSERT OR IGNORE INTO ${t} (${names.join(',')}) VALUES (${marks})`
        db.exec('SAVEPOINT one_row')
        try {
          const r = db.prepare(sql).run(...values)
          db.exec('RELEASE one_row')
          if (r.changes) added++; else skipped++
        } catch {
          db.exec('ROLLBACK TO one_row'); db.exec('RELEASE one_row')
          skipped++
        }
      }
    }
  })
  try { run() } catch (e: any) { return { success: false, error: 'The backup could not be restored: ' + (e?.message ?? e) } }
  return { success: true, added, skipped }
}
