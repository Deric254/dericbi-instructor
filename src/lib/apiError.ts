import { notify } from '../store'

/**
 * Standard failure handler for window.api.* (IPC) calls and other async
 * data loads. Use in a `.catch()` on every call site that isn't already
 * wrapped in its own try/catch with user feedback.
 *
 * - Logs the real error to devtools console for debugging.
 * - Surfaces a short, friendly toast instead of leaving the caller's
 *   loading state stuck forever or crashing on an unhandled rejection.
 * - Returns `undefined` so it can be chained straight after `.then()`
 *   and the caller can still run a `.finally()` to clear loading state.
 */
/** The refusal the main process sends once a licence has lapsed (see READ_ONLY_MESSAGE in the licence gate). */
export const VIEW_ONLY_MARK = 'view-only'

export function reportApiError(context: string, err: unknown): undefined {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err)
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (raw.includes(VIEW_ONLY_MARK)) {
    notify.warning('This copy is view-only', 'Your licence has expired. Renew it in Settings to add or change anything. Your data is safe.')
    return undefined
  }
  // IPC failures often carry a long "Error invoking remote method..." wrapper —
  // keep only the tail after the last colon-space if it looks like that, and
  // fall back to a generic message if what's left is empty or unhelpfully long.
  const cleaned = raw.split('Error invoking remote method').pop()?.replace(/^[^:]*:\s*/, '').trim() || ''
  const message = cleaned && cleaned.length < 160 ? cleaned : 'Something went wrong. Please try again.'
  notify.error(`Couldn't ${context}`, message)
  return undefined
}

/**
 * A short, kind note for when an AI request did not succeed. If no provider could be reached the student is
 * told their work is safe; any other problem (e.g. a missing key) is shown as the server worded it.
 */
export function aiFailureNote(result: { error?: string; unavailable?: boolean } | null | undefined): string {
  if (result?.unavailable) return 'The AI tutor cannot be reached right now. Your work is safe - try again in a minute, or check your keys in Settings.'
  return result?.error || 'The AI tutor is not set up yet. Add a key in Settings → AI Configuration.'
}
