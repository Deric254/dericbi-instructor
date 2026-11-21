import { getDb } from '../db/database'
import { v4 as uuidv4 } from 'uuid'
import { explainPending } from './explain'

/** A quiz counts as passed at this share of correct answers (the same line the quiz screen calls "solid"). */
export const QUIZ_PASS_PCT = 80

/**
 * Grade a finished quiz against the lesson's own questions and store the result. The app does the marking, so
 * a stored result is always consistent with the real questions. Returns null when the lesson has no quiz or the
 * answers do not fit it (wrong count or not whole option numbers), so nothing odd is ever saved.
 */
export function recordQuiz(userId: string, lessonId: string, answers: unknown):
  { correct: number; total: number; pct: number; passed: boolean } | null {
  const db = getDb()
  const lesson = db.prepare('SELECT quiz FROM lessons WHERE id = ?').get(lessonId) as { quiz: string } | undefined
  if (!lesson) return null
  let questions: Array<{ correct_index: number }>
  try { questions = JSON.parse(lesson.quiz || '[]') } catch { return null }
  if (!Array.isArray(questions) || questions.length === 0) return null
  if (!Array.isArray(answers) || answers.length !== questions.length) return null
  if (!answers.every((a) => Number.isInteger(a))) return null

  const correct = questions.filter((q, i) => answers[i] === q.correct_index).length
  const total = questions.length
  const pct = Math.round((correct / total) * 100)
  db.prepare('INSERT INTO quiz_results (id, user_id, lesson_id, correct, total, pct) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, lessonId, correct, total, pct)
  return { correct, total, pct, passed: pct >= QUIZ_PASS_PCT }
}

/** The learner's best recorded quiz score for a lesson, or null if none has been recorded. */
export function bestQuizPct(userId: string, lessonId: string): number | null {
  const row = getDb().prepare('SELECT MAX(pct) AS best FROM quiz_results WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId) as { best: number | null } | undefined
  return row?.best ?? null
}

/**
 * What still stands between a learner and completing a mastery lesson. Empty means ready. A lesson that does not
 * require mastery always returns an empty list, so every existing lesson completes exactly as before.
 */
export function masteryGaps(userId: string, lessonId: string): string[] {
  const db = getDb()
  const lesson = db.prepare('SELECT mastery_required, quiz FROM lessons WHERE id = ?').get(lessonId) as
    { mastery_required: number; quiz: string } | undefined
  if (!lesson || !lesson.mastery_required) return []

  const gaps: string[] = []
  let quizCount = 0
  try { quizCount = (JSON.parse(lesson.quiz || '[]') as unknown[]).length } catch { quizCount = 0 }
  if (quizCount > 0) {
    const best = bestQuizPct(userId, lessonId)
    if (best === null || best < QUIZ_PASS_PCT) gaps.push(`Score at least ${QUIZ_PASS_PCT}% on the lesson quiz`)
  }

  if (explainPending(userId, lessonId)) gaps.push('Explain the idea back in your own words')

  const open = db.prepare(`
    SELECT COUNT(*) AS n FROM exercises e
    WHERE e.lesson_id = ?
      AND NOT EXISTS (SELECT 1 FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = ? AND a.is_correct = 1)
  `).get(lessonId, userId) as { n: number }
  if (open.n > 0) gaps.push(open.n === 1 ? 'Pass the 1 practical you have not passed yet' : `Pass the ${open.n} practicals you have not passed yet`)
  return gaps
}
