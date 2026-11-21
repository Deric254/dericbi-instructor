import { getDb } from '../db/database'
import { loadConcepts } from './concepts'
import type { Concept } from './concepts'

/** An explanation shorter than this cannot cover the ideas. */
const MIN_WORDS = 15
const MAX_CHARS = 2000
/** A run of this many words taken straight from the lesson text means the learner copied it instead of explaining it. */
const COPY_RUN = 10

const words = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim().split(' ').filter(Boolean)

/** The concept a lesson is about, when that concept asks for an explanation. */
function conceptOf(lessonId: string): Concept | undefined {
  return loadConcepts().find((c) => c.lessons[0] === lessonId && c.explain)
}

/** A rough word stem, so "frequently", "charged" and "customers" match "frequent", "charge" and "customer". */
function stem(w: string): string {
  let s = w
  for (const suf of ['ing', 'ly', 'ed', 'es', 's']) if (s.length > suf.length + 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break }
  return s.length > 4 ? s.replace(/e$/, '') : s
}

/** Which of the rubric's key points the text covers. A point is covered when any of its phrases appears. */
function covered(text: string, concept: Concept) {
  const flat = ` ${text.toLowerCase().replace(/[‘’]/g, "'")} `
  const stems = words(text).map(stem)
  // A phrase is found as written, or as the same words in other forms (plural, past tense, -ly) one after another.
  const stemmed = (phrase: string) => {
    const p = words(phrase).map(stem)
    return p.length > 0 && stems.some((_, i) => p.every((w, k) => stems[i + k] === w))
  }
  const has = (phrase: string) => phrase === '#digit' ? /\d/.test(flat)
    : phrase.startsWith('#both:') ? phrase.slice(6).split(',').every((w) => flat.includes(w))
    : flat.includes(phrase) || stemmed(phrase)
  return concept.explain!.points.map((p) => ({ hint: p.hint, met: p.any.some(has) }))
}

/** Does the text repeat a long run of words from the lesson's own text? */
function copiedFrom(text: string, theory: string): boolean {
  const t = words(theory); const a = words(text)
  if (a.length < COPY_RUN) return false
  const runs = new Set<string>()
  for (let i = 0; i + COPY_RUN <= t.length; i++) runs.add(t.slice(i, i + COPY_RUN).join(' '))
  for (let i = 0; i + COPY_RUN <= a.length; i++) if (runs.has(a.slice(i, i + COPY_RUN).join(' '))) return true
  return false
}

/** The prompt for a lesson's explain-it-back step (null when the lesson has none) and whether the learner has passed it. */
export function getExplain(userId: string, lessonId: string) {
  const concept = conceptOf(lessonId)
  if (!concept) return null
  const row = getDb().prepare('SELECT passed, answer FROM explain_results WHERE user_id = ? AND concept_id = ?').get(userId, concept.id) as { passed: number; answer: string } | undefined
  return { prompt: concept.explain!.prompt, passed: row?.passed === 1, last_answer: row?.answer ?? '' }
}

/** True when the lesson asks for an explanation the learner has not yet passed. */
export function explainPending(userId: string, lessonId: string): boolean {
  const e = getExplain(userId, lessonId)
  return !!e && !e.passed
}

/**
 * The learner has written a real explanation that did not match the key ideas (they may have used other words) and says they
 * have compared it with the ideas and understand. The check cannot judge understanding, so it never blocks someone who has
 * made a genuine attempt. Only allowed after a substantive, uncopied, not-yet-passed attempt is on record.
 */
export function confirmExplain(userId: string, lessonId: string): boolean {
  const concept = conceptOf(lessonId)
  if (!concept) return false
  const row = getDb().prepare('SELECT passed, answer FROM explain_results WHERE user_id = ? AND concept_id = ?').get(userId, concept.id) as { passed: number; answer: string } | undefined
  const lesson = getDb().prepare('SELECT theory_md FROM lessons WHERE id = ?').get(lessonId) as { theory_md: string } | undefined
  if (!row || !lesson || row.passed === 1 || words(row.answer).length < MIN_WORDS || copiedFrom(row.answer, lesson.theory_md)) return false
  getDb().prepare("UPDATE explain_results SET passed = 1, updated_at = datetime('now') WHERE user_id = ? AND concept_id = ?").run(userId, concept.id)
  return true
}

/**
 * Check a learner's own explanation against the concept's key points. This checks that the key ideas are present; it does not
 * judge understanding, and a tutor (when a key is set) adds the feedback a human would. Returns null for a lesson with no
 * explain step or text that is not usable. A pass is never taken back by a later, weaker attempt.
 */
export function submitExplain(userId: string, lessonId: string, text: unknown) {
  const concept = conceptOf(lessonId)
  if (!concept || typeof text !== 'string' || text.length > MAX_CHARS) return null
  const answer = text.trim()
  const lesson = getDb().prepare('SELECT theory_md FROM lessons WHERE id = ?').get(lessonId) as { theory_md: string } | undefined
  if (!lesson) return null

  let outcome: { passed: boolean; reason?: 'short' | 'copied'; covered: string[]; missing: string[] }
  if (words(answer).length < MIN_WORDS) outcome = { passed: false, reason: 'short', covered: [], missing: [] }
  else if (copiedFrom(answer, lesson.theory_md)) outcome = { passed: false, reason: 'copied', covered: [], missing: [] }
  else {
    const points = covered(answer, concept)
    const met = points.filter((p) => p.met)
    outcome = { passed: met.length >= concept.explain!.need, covered: met.map((p) => p.hint), missing: points.filter((p) => !p.met).map((p) => p.hint) }
  }

  getDb().prepare(`INSERT INTO explain_results (user_id, concept_id, passed, answer) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, concept_id) DO UPDATE SET passed = MAX(explain_results.passed, excluded.passed), answer = excluded.answer, updated_at = datetime('now')`)
    .run(userId, concept.id, outcome.passed ? 1 : 0, answer)
  return outcome
}
