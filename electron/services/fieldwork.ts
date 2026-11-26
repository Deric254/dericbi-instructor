import { getDb } from '../db/database'

/** Real-world tasks: what the learner actually did outside the app and what they learned. The app stores their words and never writes results for them. */
const MAX_CHARS = 2000
const MIN_WORDS = 3
const HEADING = '## Do this in real life'

/** The task a lesson sets, taken from its own "Do this in real life" section (null when the lesson sets none). */
function taskOf(lessonId: string): { title: string; module: string; task: string } | null {
  const row = getDb().prepare('SELECT title, module, theory_md FROM lessons WHERE id = ?').get(lessonId) as { title: string; module: string; theory_md: string } | undefined
  if (!row || (row.module !== 'foundations' && row.module !== 'founder' && row.module !== 'aiml' && row.module !== 'techfirst')) return null
  const at = (row.theory_md ?? '').indexOf(HEADING)
  if (at === -1) return null
  const task = row.theory_md.slice(at + HEADING.length).split('\n## ')[0].trim()
  return task ? { title: row.title, module: row.module, task } : null
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/** The lesson's task and what the learner has recorded for it so far. */
export function getFieldTask(userId: string, lessonId: string) {
  const t = taskOf(lessonId)
  if (!t) return null
  const row = getDb().prepare('SELECT did, learned, updated_at FROM field_tasks WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId) as { did: string; learned: string; updated_at: string } | undefined
  return { task: t.task, did: row?.did ?? '', learned: row?.learned ?? '', saved: !!row, updated_at: row?.updated_at ?? null }
}

export type SaveOutcome = { success: true } | { success: false; reason: 'unavailable' | 'invalid' | 'short' }

/** Save what the learner did and learned. Both must be their own words (a few words at least) and are stored exactly as written. */
export function saveFieldTask(userId: string, lessonId: string, did: unknown, learned: unknown): SaveOutcome {
  if (!taskOf(lessonId)) return { success: false, reason: 'unavailable' }
  if (typeof did !== 'string' || typeof learned !== 'string' || did.length > MAX_CHARS || learned.length > MAX_CHARS) return { success: false, reason: 'invalid' }
  if (wordCount(did) < MIN_WORDS || wordCount(learned) < MIN_WORDS) return { success: false, reason: 'short' }
  getDb().prepare(`
    INSERT INTO field_tasks (user_id, lesson_id, did, learned) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET did = excluded.did, learned = excluded.learned, updated_at = datetime('now')
  `).run(userId, lessonId, did.trim(), learned.trim())
  return { success: true }
}

/** Remove a recorded task. Returns whether there was one. */
export function deleteFieldTask(userId: string, lessonId: string): boolean {
  return getDb().prepare('DELETE FROM field_tasks WHERE user_id = ? AND lesson_id = ?').run(userId, lessonId).changes > 0
}

/** Everything the learner has recorded, newest first, for the portfolio. Only their own words. */
export function listFieldTasks(userId: string) {
  return getDb().prepare(`
    SELECT f.lesson_id, l.title AS lesson_title, l.module, f.did, f.learned, f.updated_at
    FROM field_tasks f JOIN lessons l ON l.id = f.lesson_id
    WHERE f.user_id = ? ORDER BY f.updated_at DESC, f.lesson_id
  `).all(userId) as Array<{ lesson_id: string; lesson_title: string; module: string; did: string; learned: string; updated_at: string }>
}
