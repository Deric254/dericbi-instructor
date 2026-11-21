import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { loadConcepts } from './concepts'

/** Questions asked per concept, and how many must be right for the concept to count as known. */
const QUESTIONS_PER_CONCEPT = 2

interface Step { lessonId: string; conceptId: string; conceptName: string; questions: Array<{ question: string; options: string[]; correct_index: number }> }

/**
 * The placement check covers the Start Here lessons, in teaching order. Each step is a concept from the concept map whose
 * first lesson is a Start Here lesson, and its questions are the first questions of that lesson's own quiz.
 */
function steps(): Step[] {
  const concepts = loadConcepts()
  const rows = getDb().prepare("SELECT id, quiz FROM lessons WHERE module = 'foundations' ORDER BY sort_order").all() as Array<{ id: string; quiz: string }>
  const out: Step[] = []
  for (const r of rows) {
    const concept = concepts.find((c) => c.lessons[0] === r.id)
    if (!concept) continue
    const quiz = JSON.parse(r.quiz || '[]') as Step['questions']
    if (quiz.length < QUESTIONS_PER_CONCEPT) continue
    out.push({ lessonId: r.id, conceptId: concept.id, conceptName: concept.name, questions: quiz.slice(0, QUESTIONS_PER_CONCEPT) })
  }
  return out
}

/** The lessons a learner has shown they know. A lesson is known only if every concept before it was known too. */
export function knownLessonIds(userId: string): string[] {
  const known = new Set((getDb().prepare('SELECT concept_id FROM placement_results WHERE user_id = ? AND known = 1').all(userId) as Array<{ concept_id: string }>).map((r) => r.concept_id))
  return steps().filter((s) => known.has(s.conceptId)).map((s) => s.lessonId)
}

/** The questions (without answers) and the learner's saved result, if they have taken the check. */
export function getPlacement(userId: string) {
  const list = steps()
  const saved = getDb().prepare('SELECT concept_id, known FROM placement_results WHERE user_id = ?').all(userId) as Array<{ concept_id: string; known: number }>
  return {
    questions: list.flatMap((s) => s.questions.map((q, i) => ({ id: `${s.lessonId}:${i}`, concept: s.conceptName, question: q.question, options: q.options }))),
    result: saved.length === 0 ? null : {
      known: list.filter((s) => saved.some((r) => r.concept_id === s.conceptId && r.known === 1)).map((s) => ({ lesson_id: s.lessonId, concept: s.conceptName })),
      total: list.length,
    },
  }
}

/**
 * Mark the check on the server. `answers` maps a question id to the chosen option number, or -1 for "I don't know yet".
 * A concept is known when all its questions are right, and the first concept that is not known ends the run, because the
 * lessons after it build on it. Known lessons stay optional and the lessons up to the first unknown one are opened;
 * nothing is marked complete. Returns null (and saves nothing) when the answers do not fit the questions.
 */
export function submitPlacement(userId: string, answers: unknown) {
  const list = steps()
  if (list.length === 0 || !answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const given = answers as Record<string, unknown>
  for (const s of list) {
    for (let i = 0; i < s.questions.length; i++) {
      const a = given[`${s.lessonId}:${i}`]
      if (!Number.isInteger(a) || (a as number) < -1 || (a as number) >= s.questions[i].options.length) return null
    }
  }

  let stopped = false
  const verdicts = list.map((s) => {
    const right = s.questions.every((q, i) => given[`${s.lessonId}:${i}`] === q.correct_index)
    const known = !stopped && right
    if (!known) stopped = true
    return { step: s, known }
  })

  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM placement_results WHERE user_id = ?').run(userId)
    for (const v of verdicts) db.prepare('INSERT INTO placement_results (user_id, concept_id, known) VALUES (?, ?, ?)').run(userId, v.step.conceptId, v.known ? 1 : 0)
    const firstUnknown = verdicts.findIndex((v) => !v.known)
    const open = firstUnknown === -1 ? verdicts : verdicts.slice(0, firstUnknown + 1)
    for (const v of open) {
      db.prepare(`INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, 'available')
        ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'available' WHERE lesson_progress.status = 'locked'`).run(uuidv4(), userId, v.step.lessonId)
    }
  })()
  return getPlacement(userId).result
}
