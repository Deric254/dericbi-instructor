import { getDb } from '../db/database'
import { loadConcepts } from './concepts'

/** Days until the next review for each box. A right answer moves an idea up a box, a wrong one sends it back to box 1. */
const BOX_DAYS = [1, 3, 7, 21]
/** The most ideas one review session asks about, so a session stays about five minutes. */
const SESSION_SIZE = 5

interface Question { question: string; options: string[]; correct_index: number; explanation: string }

/** Every quiz question of the lessons that teach a concept, as [question id inside the lesson, question]. */
function pool(conceptId: string): Array<{ ref: string; q: Question }> {
  const concept = loadConcepts().find((c) => c.id === conceptId)
  if (!concept) return []
  const out: Array<{ ref: string; q: Question }> = []
  for (const lessonId of concept.lessons) {
    const row = getDb().prepare('SELECT quiz FROM lessons WHERE id = ?').get(lessonId) as { quiz: string } | undefined
    if (!row) continue
    ;(JSON.parse(row.quiz || '[]') as Question[]).forEach((q, i) => out.push({ ref: `${lessonId}:${i}`, q }))
  }
  return out
}

/** When a lesson is completed, every concept it teaches is scheduled for its first review in a day. Never changes an existing schedule. */
export function enrollConcepts(userId: string, lessonId: string): void {
  const db = getDb()
  for (const c of loadConcepts().filter((c) => c.lessons.includes(lessonId))) {
    db.prepare("INSERT INTO review_items (user_id, concept_id, box, due_at) VALUES (?, ?, 1, datetime('now', '+' || ? || ' days')) ON CONFLICT(user_id, concept_id) DO NOTHING")
      .run(userId, c.id, BOX_DAYS[0])
  }
}

/** How many ideas are scheduled and how many are due, plus the questions for one session (without their answers). */
export function getReview(userId: string) {
  const db = getDb()
  const enrolled = (db.prepare('SELECT COUNT(*) AS n FROM review_items WHERE user_id = ?').get(userId) as { n: number }).n
  const due = db.prepare("SELECT concept_id, reviews FROM review_items WHERE user_id = ? AND due_at <= datetime('now') ORDER BY due_at, concept_id")
    .all(userId) as Array<{ concept_id: string; reviews: number }>
  const names = new Map(loadConcepts().map((c) => [c.id, c.name]))
  const questions = due.slice(0, SESSION_SIZE).flatMap((d) => {
    const p = pool(d.concept_id)
    if (p.length === 0) return []
    const pick = p[d.reviews % p.length]
    return [{ id: `${d.concept_id}|${pick.ref}`, concept: names.get(d.concept_id) ?? d.concept_id, question: pick.q.question, options: pick.q.options }]
  })
  return { enrolled, due_total: due.length, questions }
}

/**
 * Mark one review answer. Only an idea that is due can move, so repeating an answer cannot climb the boxes.
 * Returns null (and changes nothing) when the question or answer does not fit.
 */
export function answerReview(userId: string, questionId: unknown, answer: unknown) {
  if (typeof questionId !== 'string' || !Number.isInteger(answer)) return null
  const [conceptId, ref] = questionId.split('|')
  const db = getDb()
  const item = db.prepare("SELECT box FROM review_items WHERE user_id = ? AND concept_id = ? AND due_at <= datetime('now')").get(userId, conceptId) as { box: number } | undefined
  const hit = pool(conceptId).find((p) => p.ref === ref)
  if (!item || !hit || (answer as number) < 0 || (answer as number) >= hit.q.options.length) return null

  const correct = answer === hit.q.correct_index
  const box = correct ? Math.min(item.box + 1, BOX_DAYS.length) : 1
  db.prepare("UPDATE review_items SET box = ?, due_at = datetime('now', '+' || ? || ' days'), reviews = reviews + 1, last_reviewed_at = datetime('now') WHERE user_id = ? AND concept_id = ?")
    .run(box, BOX_DAYS[box - 1], userId, conceptId)
  return { correct, correct_index: hit.q.correct_index, explanation: hit.q.explanation, box, next_review_days: BOX_DAYS[box - 1] }
}
