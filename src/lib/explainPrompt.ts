import type { SqlResult } from '../types'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** The message sent to the AI tutor by the "Explain" button: the student's query and what it returned or the error it gave. */
export function explainPrompt(query: string, result: SqlResult | null): string {
  const q = clip(query.trim(), 2000)
  if (result && !result.success) {
    return `My SQL query gave an error.\n\nQuery:\n${q}\n\nError:\n${clip(String(result.error ?? 'unknown error'), 800)}\n\nExplain in simple words what went wrong and how to fix it. Guide me, but do not just hand me the finished query.`
  }
  if (result?.success) {
    const sample = clip(JSON.stringify((result.rows ?? []).slice(0, 5)), 700)
    return `Please explain this SQL query and its result.\n\nQuery:\n${q}\n\nIt returned ${result.row_count ?? 0} row(s). Columns: ${(result.columns ?? []).join(', ') || 'none'}. First rows: ${sample}\n\nExplain step by step what the query does, then what the result tells me, in simple words.`
  }
  return `Please explain this SQL query step by step, in simple words.\n\nQuery:\n${q}`
}
