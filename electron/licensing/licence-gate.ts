/**
 * What a licence allows, as pure rules (no Electron here, so they are unit-tested).
 *
 *  - Valid, or inside the grace days after it ends: every channel works.
 *  - Past the grace days: READ-ONLY. Signing in, viewing lessons and reading/exporting your own data still
 *    work; anything else is refused with READ_ONLY_MESSAGE. The person is never locked out of their data.
 *  - Never activated, wrong computer, clock wound back: nothing works except the licence screens.
 *
 * Fail safe: a channel that is not listed in READ_CHANNELS counts as a write and is refused in read-only,
 * so a channel added later stays blocked until someone decides it is safe to read.
 */

/** Days after the end date during which everything still works (the app shows a renewal notice). */
export const GRACE_DAYS = 5

export const READ_ONLY_MESSAGE = 'Your licence has expired, so this is view-only. Renew your licence to add or change anything.'

/** Where a person renews: the DericBI site, pre-filled with this app and this computer's activation code. */
export const RENEW_PAGE = 'https://dericbi.vercel.app/renew.html'
export const RENEW_APP = 'instructor'
export const renewUrl = (installCode: string): string => `${RENEW_PAGE}?app=${RENEW_APP}&code=${installCode}`

/**
 * Channels that still work once the licence has run out: sign-in and password recovery, viewing lessons,
 * reading progress, projects, portfolio and datasets, and taking work out (portfolio export, open the file).
 * lessons:start only marks a lesson as opened (no points, no completion), and the lesson pages call it on
 * every open, so refusing it would make lessons impossible to view. sql:close-sandbox only frees memory.
 */
export const READ_CHANNELS: ReadonlySet<string> = new Set([
  'auth:login', 'auth:validate-session', 'auth:logout', 'auth:get-security-question', 'auth:reset-password',
  'progress:dashboard', 'progress:skills', 'progress:rank', 'progress:memory', 'progress:achievements',
  'lessons:list', 'lessons:get', 'lessons:start',
  'exercises:get', 'exercises:hint',
  'sql:history', 'sql:datasets', 'sql:close-sandbox',
  'files:profile',
  'ai:has-key', 'ai:get-provider',
  'settings:get', 'settings:get-all', 'app:get-version',
  'projects:list', 'projects:get', 'portfolio:list', 'portfolio:export', 'portfolio:open-file',
  'admin:check', 'admin:users-list', 'admin:user-detail', 'admin:content-stats', 'admin:system-info',
])

export interface GateState { ok: boolean; read_only?: boolean }

/** May this channel run now? Everything for a valid licence; reading only once it has lapsed; nothing otherwise. */
export function allows(channel: string, state: GateState): boolean {
  if (state.ok) return true
  return !!state.read_only && READ_CHANNELS.has(channel)
}

/**
 * The only places the app opens outside itself for payment: the DericBI renewal page, PayPal, Gmail's
 * compose window and an email to the owner. Anything else is refused.
 */
export const LINK_ALLOW: readonly string[] = [
  'https://dericbi.vercel.app/renew.html?',
  'https://www.paypal.com/',
  'https://mail.google.com/mail/?view=cm',
  'mailto:dericmarangu@gmail.com?',
]

export const isAllowedLink = (url: unknown): url is string =>
  typeof url === 'string' && url.length <= 4000 && LINK_ALLOW.some((p) => url.startsWith(p))
