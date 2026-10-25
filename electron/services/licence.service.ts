/**
 * Licensing for this copy of the app (the adapter around the guide's offline-licensing module).
 *
 * Every install shows a 12-character activation code. The owner signs a licence for exactly that code,
 * with an expiry date, and the person pastes it in. Everything is checked offline against the owner's
 * public key that is built into the app. The app can only VERIFY; creating licences needs the owner key
 * (see owner.service.ts), which is never stored by the app.
 */
import { app, dialog } from 'electron'
import * as fs from 'fs'
import { Licensing, FileStore, LicenceError } from '../licensing/licensing'
import config from '../licensing/licensing.config.json'

export interface LicenceState {
  ok: boolean
  kind: 'owner' | 'licensed' | 'unlicensed' | 'unconfigured'
  message: string
  installCode: string
  user?: string
  expires?: string
  daysLeft?: number
}

const CACHE_MS = 60_000

/** The longest a single licence may run. The owner renews as each month is paid. */
export const MAX_LICENCE_DAYS = 365

let instance: Licensing | null = null
let cache: { at: number; ok: boolean } | null = null

export function licensing(): Licensing {
  if (!instance) {
    instance = new Licensing({
      appId: config.appId,
      prefix: config.prefix,
      publicKeyHex: config.ownerPublicKey,
      maxDays: MAX_LICENCE_DAYS,
      store: new FileStore(app.getPath('userData')),
    })
  }
  return instance
}

export function getState(): LicenceState {
  const lic = licensing()
  const st = lic.state()
  return {
    ok: st.ok,
    kind: st.kind as LicenceState['kind'],
    message: st.message,
    installCode: lic.configured() ? lic.installId() : '',
    user: st.user,
    expires: st.expires,
    daysLeft: st.days_left,
  }
}

/** Cheap check used to guard every data-touching IPC channel (re-verified at most once a minute). */
export function isLicensed(): boolean {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.ok
  const ok = licensing().state().ok
  cache = { at: now, ok }
  return ok
}

export function requireOwner(): void {
  if (licensing().state().kind !== 'owner') throw new Error('Owner access required.')
}

function fail(e: unknown): { success: false; error: string } {
  if (e instanceof LicenceError) return { success: false, error: e.message }
  throw e
}

export function activate(token: string): { success: true } | { success: false; error: string } {
  try {
    licensing().activate(token)
    cache = null
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

/** Lets the owner choose their owner key file; returns its text and location, or null if cancelled. */
export async function readOwnerKeyFile(): Promise<{ text: string; path: string } | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Choose your owner key file',
    properties: ['openFile'],
    filters: [{ name: 'Owner key', extensions: ['key', 'txt'] }, { name: 'All files', extensions: ['*'] }],
  })
  if (picked.canceled || !picked.filePaths[0]) return null
  return { text: fs.readFileSync(picked.filePaths[0], 'utf8'), path: picked.filePaths[0] }
}

/** Marks THIS computer as the owner's. The key is used once, in memory, and is not stored. */
export function claimOwner(keyText: string): { success: true } | { success: false; error: string } {
  try {
    licensing().claimOwner(keyText)
    cache = null
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}
