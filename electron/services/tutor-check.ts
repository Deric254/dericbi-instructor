import { askOnce, buildSystemPrompt } from './ai.service'
import { loadTutorConfig, type GoldenCase } from './tutor'

/** Judge one answer against a fixed question: every "must not" pattern absent, and at least one "must" pattern present. */
export function judge(g: Pick<GoldenCase, 'must_any' | 'must_not'>, answer: string): { ok: boolean; reason: string } {
  for (const r of g.must_not ?? []) if (new RegExp(r, 'i').test(answer)) return { ok: false, reason: 'It said something it should not have.' }
  if (g.must_any?.length && !g.must_any.some((r) => new RegExp(r, 'i').test(answer))) return { ok: false, reason: 'It did not say what it should have.' }
  return { ok: true, reason: '' }
}

/**
 * Asks the tutor, with its real prompt and the learner's own key, the fixed questions from content/path/tutor.json and checks that its
 * rules held. The answers of a language model vary, so a miss is a sign to look, not a proof; the full answers are never stored.
 * Returns null when no provider could answer at all.
 */
export async function checkTutor(userId: string) {
  const cfg = loadTutorConfig()
  if (!cfg || cfg.golden.length === 0) return null
  const results: Array<{ id: string; why: string; ok: boolean; reason: string }> = []
  for (const g of cfg.golden) {
    const answer = await askOnce(userId, buildSystemPrompt(userId, { ...g.context, type: g.context.type as any }), g.question, 40_000, 0.2)
    if (answer === null) { if (results.length === 0) return null; results.push({ id: g.id, why: g.why, ok: false, reason: 'No answer came back.' }); continue }
    results.push({ id: g.id, why: g.why, ...judge(g, answer) })
  }
  return { results, allOk: results.every((r) => r.ok), ran: results.length }
}
