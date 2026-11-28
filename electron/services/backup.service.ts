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
  'quiz_results', 'placement_results', 'review_items', 'explain_results', 'field_tasks', 'path_gates', 'path_state', 'jump_passes', 'provisional',
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

/** When the app gently reminds a learner to save their progress: once they have real work to lose, and then every so often. */
export const BACKUP_REMINDER = { min_lessons_complete: 3, every_days: 14 } as const
const savedKey = (userId: string) => `progress_saved_${userId}`

/** Remember that this learner just saved a backup. */
export function noteSaved(userId: string, now = new Date()): void {
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(savedKey(userId), now.toISOString())
}

/** Has this learner enough work that losing it would hurt, and have they saved lately? `due` is true when a reminder is worth showing. */
export function backupStatus(userId: string, now = new Date()): { lessons_complete: number; last_saved: string | null; days_since: number | null; due: boolean } {
  const db = getDb()
  const lessons_complete = (db.prepare("SELECT COUNT(*) c FROM lesson_progress WHERE user_id = ? AND status = 'complete'").get(userId) as { c: number }).c
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(savedKey(userId)) as { value: string } | undefined
  const t = row ? Date.parse(row.value) : NaN
  const last_saved = Number.isNaN(t) ? null : new Date(t).toISOString()
  const days_since = last_saved === null ? null : Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
  const due = lessons_complete >= BACKUP_REMINDER.min_lessons_complete && (days_since === null || days_since >= BACKUP_REMINDER.every_days)
  return { lessons_complete, last_saved, days_since, due }
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
