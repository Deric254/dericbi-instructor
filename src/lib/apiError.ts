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
export function reportApiError(context: string, err: unknown): undefined {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err)
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  // IPC failures often carry a long "Error invoking remote method..." wrapper —
  // keep only the tail after the last colon-space if it looks like that, and
  // fall back to a generic message if what's left is empty or unhelpfully long.
  const cleaned = raw.split('Error invoking remote method').pop()?.replace(/^[^:]*:\s*/, '').trim() || ''
  const message = cleaned && cleaned.length < 160 ? cleaned : 'Something went wrong. Please try again.'
  notify.error(`Couldn't ${context}`, message)
  return undefined
}
