import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { loadConcepts, type Concept } from './concepts'
import { understood } from './ladder'

/**
 * Guided jumping: a learner may open any lesson. What they get first is an honest readiness light, not a wall. The light comes from the
 * few ideas they would be missing (the concept map says what each idea rests on; a lesson with no concept falls back to the lessons it
 * waits for). Green: nothing missing. Amber: one. Red: two or more. A short check of up to three questions drawn from the missing
 * ideas' own lessons can clear them; otherwise "go anyway" opens the lesson as provisional: it does not count toward a phase until
 * the missing ideas are in place.
 */
export interface Gap { kind: 'concept' | 'lesson'; id: string; name: string; definition: string }
export type Light = 'green' | 'amber' | 'red'
export interface JumpQuestion { ref: string; question: string; options: string[] }

const MAX_GAPS = 3
const MAX_QUESTIONS = 3

interface LessonRow { id: string; title: string; description: string | null; prerequisites: string; quiz: string }
const lessonRow = (id: string) => getDb().prepare('SELECT id, title, description, prerequisites, quiz FROM lessons WHERE id = ?').get(id) as LessonRow | undefined
const statusOf = (userId: string, lessonId: string) => (getDb().prepare('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId) as { status: string } | undefined)?.status ?? 'locked'
const passed = (userId: string, kind: string, ref: string) => !!getDb().prepare('SELECT 1 FROM jump_passes WHERE user_id = ? AND kind = ? AND ref = ?').get(userId, kind, ref)

function isClosed(userId: string, g: { kind: string; id: string }, concepts: Concept[]): boolean {
  if (passed(userId, g.kind, g.id)) return true
  if (g.kind === 'lesson') return statusOf(userId, g.id) === 'complete'
  const c = concepts.find((x) => x.id === g.id)
  return !c || understood(userId, c)
}

/** The ideas a learner would be missing for this lesson, nearest first, at most three. */
export function gapsFor(userId: string, lessonId: string, concepts: Concept[] = loadConcepts()): Gap[] {
  const lesson = lessonRow(lessonId)
  if (!lesson) return []
  const status = statusOf(userId, lessonId)
  if (status === 'in_progress' || status === 'complete') return []
  const out: Gap[] = []
  const taught = concepts.filter((c) => c.lessons.includes(lessonId))
  const seen = new Set(taught.map((c) => c.id))
  let layer = taught.flatMap((c) => c.depends_on)
  while (layer.length && out.length < MAX_GAPS) {
    const next: string[] = []
    for (const id of layer) {
      if (seen.has(id)) continue
      seen.add(id)
      const c = concepts.find((x) => x.id === id)
      if (!c) continue
      // An idea the learner holds needs nothing behind it. One they do not hold is a gap, and what it rests on is looked at next.
      if (!isClosed(userId, { kind: 'concept', id }, concepts)) { if (out.length < MAX_GAPS) out.push({ kind: 'concept', id, name: c.name, definition: c.definition }); next.push(...c.depends_on) }
    }
    layer = next
  }
  // A lesson that no concept covers has only the lessons it waits for to go on.
  if (taught.length === 0) {
    let pre: string[] = []
    try { pre = JSON.parse(lesson.prerequisites || '[]') } catch { pre = [] }
    for (const p of pre) {
      const row = lessonRow(p)
      if (row && !isClosed(userId, { kind: 'lesson', id: p }, concepts) && out.length < MAX_GAPS) out.push({ kind: 'lesson', id: p, name: row.title, definition: row.description ?? '' })
    }
  }
  return out
}

export const lightOf = (gaps: Gap[]): Light => (gaps.length === 0 ? 'green' : gaps.length === 1 ? 'amber' : 'red')

interface Quiz { question: string; options: string[]; correct_index: number }
/** The lessons whose quiz questions can check a gap: those that teach the concept, or the lesson itself. */
function poolLessons(g: Gap, concepts: Concept[]): string[] {
  return g.kind === 'lesson' ? [g.id] : (concepts.find((c) => c.id === g.id)?.lessons ?? [])
}
function quizOf(lessonId: string): Quiz[] {
  const r = getDb().prepare('SELECT quiz FROM lessons WHERE id = ?').get(lessonId) as { quiz: string } | undefined
  try { const q = JSON.parse(r?.quiz || '[]'); return Array.isArray(q) ? q : [] } catch { return [] }
}
const validQuestion = (q: Quiz) => !!q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correct_index)

/** Up to three questions spread across the gaps, without their answers. The starting point changes each day so the check is not always the same. */
export function questionsFor(gaps: Gap[], concepts: Concept[] = loadConcepts(), day = Math.floor(Date.now() / 86_400_000)): JumpQuestion[] {
  const pools = gaps.map((g) => poolLessons(g, concepts).flatMap((l) => quizOf(l).map((q, i) => ({ ref: `${l}:${i}`, q }))).filter((x) => validQuestion(x.q)))
  const out: JumpQuestion[] = []
  const used = new Set<string>()
  for (let round = 0; out.length < MAX_QUESTIONS && round < 12; round++) {
    let added = false
    for (const pool of pools) {
      if (out.length >= MAX_QUESTIONS || pool.length === 0) continue
      const pick = pool[(day + round) % pool.length]
      if (used.has(pick.ref)) continue
      used.add(pick.ref); added = true
      out.push({ ref: pick.ref, question: pick.q.question, options: pick.q.options })
    }
    if (!added && round > 0) break
  }
  return out
}

export function jumpCheck(userId: string, lessonId: string) {
  const lesson = lessonRow(lessonId)
  if (!lesson) return null
  const concepts = loadConcepts()
  const gaps = gapsFor(userId, lessonId, concepts)
  return { lesson_id: lessonId, title: lesson.title, status: statusOf(userId, lessonId), light: lightOf(gaps), gaps, questions: gaps.length ? questionsFor(gaps, concepts) : [] }
}

/** Start a lesson: an unstarted or locked lesson becomes in progress; one already started or finished is left as it is. */
export function startLesson(userId: string, lessonId: string): void {
  const db = getDb()
  const existing = db.prepare('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId) as { status: string } | undefined
  if (!existing) db.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, started_at) VALUES (?, ?, ?, 'in_progress', datetime('now'))").run(uuidv4(), userId, lessonId)
  else if (existing.status === 'available' || existing.status === 'locked') db.prepare("UPDATE lesson_progress SET status = 'in_progress', started_at = datetime('now') WHERE user_id = ? AND lesson_id = ?").run(userId, lessonId)
}

export type JumpOutcome =
  | { success: false; reason: 'unknown' | 'invalid' }
  | { success: true; started: boolean; passed: boolean; provisional: boolean; correct?: number; total?: number }

/**
 * Open a lesson the guided way. With nothing missing it simply opens. With gaps, `answers` (reference + chosen option) are marked here;
 * enough right answers clear the gaps. `go` opens it anyway as provisional. Neither leaves it closed, so the learner can review first.
 */
export function jumpGo(userId: string, lessonId: string, answers: unknown, go: unknown): JumpOutcome {
  if (!lessonRow(lessonId)) return { success: false, reason: 'unknown' }
  const concepts = loadConcepts()
  const gaps = gapsFor(userId, lessonId, concepts)
  const db = getDb()
  if (gaps.length === 0) { startLesson(userId, lessonId); return { success: true, started: true, passed: true, provisional: false } }

  let result: { correct: number; total: number; passed: boolean } | null = null
  if (answers !== undefined && answers !== null) {
    if (!Array.isArray(answers) || answers.length === 0 || answers.length > MAX_QUESTIONS) return { success: false, reason: 'invalid' }
    const allowed = new Set(gaps.flatMap((g) => poolLessons(g, concepts)))
    const available = new Set(gaps.flatMap((g) => poolLessons(g, concepts).flatMap((l) => quizOf(l).map((q, i) => (validQuestion(q) ? `${l}:${i}` : '')))).filter(Boolean))
    const needed = Math.min(MAX_QUESTIONS, available.size)
    const refs = new Set<string>()
    let correct = 0
    for (const a of answers as Array<{ ref?: unknown; choice?: unknown }>) {
      if (!a || typeof a.ref !== 'string' || !Number.isInteger(a.choice) || refs.has(a.ref)) return { success: false, reason: 'invalid' }
      const m = /^(.+):(\d+)$/.exec(a.ref)
      if (!m || !allowed.has(m[1]) || !available.has(a.ref)) return { success: false, reason: 'invalid' }
      refs.add(a.ref)
      if (quizOf(m[1])[Number(m[2])].correct_index === a.choice) correct++
    }
    if (refs.size < needed) return { success: false, reason: 'invalid' }
    result = { correct, total: refs.size, passed: correct >= Math.ceil((refs.size * 2) / 3) }
  }

  if (result?.passed) {
    for (const g of gaps) db.prepare('INSERT OR IGNORE INTO jump_passes (user_id, kind, ref) VALUES (?, ?, ?)').run(userId, g.kind, g.id)
    startLesson(userId, lessonId)
    return { success: true, started: true, passed: true, provisional: false, correct: result.correct, total: result.total }
  }
  if (go === true) {
    db.prepare("INSERT INTO provisional (user_id, lesson_id, gaps) VALUES (?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET gaps = excluded.gaps, created_at = datetime('now')")
      .run(userId, lessonId, JSON.stringify(gaps.map((g) => ({ kind: g.kind, id: g.id }))))
    startLesson(userId, lessonId)
    return { success: true, started: true, passed: false, provisional: true, correct: result?.correct, total: result?.total }
  }
  return { success: true, started: false, passed: false, provisional: false, correct: result?.correct, total: result?.total }
}

/** Lessons the learner opened without the ideas they rest on and has not yet put in place. They do not count toward a phase until then. */
export function provisionalOpen(userId: string): Set<string> {
  const concepts = loadConcepts()
  const out = new Set<string>()
  const rows = getDb().prepare('SELECT lesson_id, gaps FROM provisional WHERE user_id = ?').all(userId) as Array<{ lesson_id: string; gaps: string }>
  for (const r of rows) {
    let gaps: Array<{ kind: string; id: string }> = []
    try { gaps = JSON.parse(r.gaps) } catch { gaps = [] }
    if (gaps.some((g) => !isClosed(userId, g, concepts))) out.add(r.lesson_id)
  }
  return out
}
