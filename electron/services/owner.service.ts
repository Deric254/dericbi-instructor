/**
 * The Owner Console's backend. Available on the owner's computer only: every function starts with
 * requireOwner(), which passes only on a copy that was claimed with the owner key.
 *
 * Signing needs the owner key. It is read from the owner's key file, held in memory for this session only
 * (auto-locks after 30 idle minutes, or when the app closes) and never written anywhere by the app.
 */
import { app, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { LicenceError } from '../licensing/licensing'
import * as Licence from './licence.service'
import {
  OwnerLedger, Customer, LedgerSettings, addMonths, daysBetween, lastLicence, licenceDays, monthKey,
  needsRenewal, paidThrough, statusOf, utcDay,
} from './owner-ledger'

const SIGNING_IDLE_MS = 30 * 60 * 1000
const MAX_MONTHS_AT_ONCE = 12

let ledger: OwnerLedger | null = null
let session: { seed: Buffer; until: number } | null = null

function getLedger(): OwnerLedger {
  if (!ledger) ledger = new OwnerLedger(path.join(app.getPath('userData'), 'owner-ledger.json'))
  return ledger
}

function owner(): OwnerLedger {
  Licence.requireOwner()
  return getLedger()
}

const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`

function view(c: Customer, now: Date, grace: number) {
  const l = lastLicence(c)
  return {
    id: c.id,
    name: c.name,
    contact: c.contact,
    code: formatCode(c.code),
    notes: c.notes,
    createdAt: c.createdAt,
    payments: c.payments,
    status: statusOf(c, now),
    paidThrough: paidThrough(c),
    needsRenewal: needsRenewal(c, grace),
    licenceExpires: l ? l.expires : null,
    daysLeft: l ? daysBetween(utcDay(now), l.expires) : null,
    lastLicence: l,
    history: c.licences.slice(-10).reverse(),
  }
}

function signingStatus() {
  const live = !!session && Date.now() < session.until
  if (!live) session = null
  return { unlocked: live, until: live ? session!.until : null }
}

// ── signing ──
function unlockWithText(keyText: string, keyPath?: string) {
  const lic = Licence.licensing()
  const seed = lic.parseOwnerKey(keyText)
  if (!lic.ownerKeyMatches(seed)) throw new LicenceError("That owner key doesn't belong to this app, so it can't sign licences.")
  session = { seed, until: Date.now() + SIGNING_IDLE_MS }
  if (keyPath) getLedger().updateSettings({ keyPath })
}

function seedForSigning(): Buffer {
  if (!session || Date.now() >= session.until) {
    session = null
    throw new LicenceError('Signing is locked. Unlock it with your owner key first.')
  }
  session.until = Date.now() + SIGNING_IDLE_MS
  return session.seed
}

/** Runs an owner action and turns any failure into a friendly { success: false, error } for the screen. */
function guard<T extends object>(fn: () => T): ({ success: true } & T) | { success: false; error: string } {
  try {
    return { success: true, ...fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Something went wrong.' }
  }
}

export function overview(now = new Date()) {
  const l = owner()
  const settings = l.settings()
  return {
    signing: signingStatus(),
    settings,
    summary: l.summary(now),
    customers: l.customers().map((c) => view(c, now, settings.graceDays)),
  }
}

export async function unlockWithFile() {
  owner()
  const picked = await Licence.readOwnerKeyFile()
  if (!picked) return { success: false as const, error: '', cancelled: true }
  return guard(() => { unlockWithText(picked.text, picked.path); return {} })
}

export function unlockWithSavedKey() {
  const l = owner()
  const p = l.settings().keyPath
  return guard(() => {
    if (!p || !fs.existsSync(p)) throw new Error('The saved key file could not be found. Choose it again.')
    unlockWithText(fs.readFileSync(p, 'utf8'), p)
    return {}
  })
}

export function unlockWithPastedKey(keyText: string) {
  owner()
  return guard(() => { unlockWithText(keyText); return {} })
}

export function lockSigning() {
  owner()
  session = null
  return { success: true as const }
}

/** After this computer is claimed, remember where the key file is so the owner can unlock in one click. */
export function rememberKeyPath(keyPath: string) {
  getLedger().updateSettings({ keyPath })
}

// ── licences ──
function issueFor(l: OwnerLedger, c: Customer, now: Date) {
  const days = licenceDays(c, now, l.settings().graceDays, Licence.MAX_LICENCE_DAYS)
  const issued = Licence.licensing().issue(seedForSigning(), c.code, c.name, days)
  l.recordLicence(c.id, { issuedAt: now.toISOString(), expires: issued.expires, token: issued.licence })
  return { licence: issued.licence, expires: issued.expires, name: c.name, contact: c.contact, customerId: c.id }
}

/** New customer: add them, tick the months they paid now (from this month), and sign their first licence. */
export function issueNew(input: { code: string; name: string; contact?: string; notes?: string; months?: number; amount?: number | null }, now = new Date()) {
  const l = owner()
  return guard(() => {
    const months = Math.trunc(Number(input.months ?? 1))
    if (!(months >= 1 && months <= MAX_MONTHS_AT_ONCE)) throw new Error(`Months paid must be from 1 to ${MAX_MONTHS_AT_ONCE}.`)
    seedForSigning() // fail early, before anything is added, if signing is locked
    const c = l.addCustomer(input, now)
    try {
      for (let i = 0; i < months; i++) l.setPayment(c.id, addMonths(monthKey(now), i), true, input.amount ?? undefined, now)
      return issueFor(l, c, now)
    } catch (e) {
      l.deleteCustomer(c.id) // do not leave a half-created customer behind
      throw e
    }
  })
}

export function renew(id: string, now = new Date()) {
  const l = owner()
  return guard(() => {
    const c = l.find(id)
    if (!c) throw new Error('That customer was not found.')
    return issueFor(l, c, now)
  })
}

// ── customers and payments ──
export function setPayment(id: string, month: string, paid: boolean, now = new Date()) {
  const l = owner()
  return guard(() => { l.setPayment(id, month, paid, undefined, now); return {} })
}
export function updateCustomer(id: string, patch: { name?: string; contact?: string; code?: string; notes?: string }) {
  const l = owner()
  return guard(() => { l.updateCustomer(id, patch); return {} })
}
export function deleteCustomer(id: string) {
  const l = owner()
  return guard(() => { l.deleteCustomer(id); return {} })
}
export function updateSettings(patch: Partial<LedgerSettings>) {
  const l = owner()
  return guard(() => ({ settings: l.updateSettings({ graceDays: patch.graceDays, defaultAmount: patch.defaultAmount }) }))
}

// ── export and backup ──
const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCustomers(format: 'xlsx' | 'csv', now = new Date()) {
  const l = owner()
  const stamp = utcDay(now)
  const saved = await dialog.showSaveDialog({
    title: 'Export customers',
    defaultPath: `DericBI-customers-${stamp}.${format}`,
    filters: [format === 'xlsx' ? { name: 'Excel workbook', extensions: ['xlsx'] } : { name: 'CSV file', extensions: ['csv'] }],
  })
  if (saved.canceled || !saved.filePath) return { success: false as const, error: '', cancelled: true }
  return guard(() => {
    const rows = l.exportRows(now)
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Customers')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(l.paymentGrid()), 'Monthly payments')
      XLSX.writeFile(wb, saved.filePath!)
    } else {
      const cols = Object.keys(rows[0] ?? { 'No.': '', 'Name': '', 'Contact': '', 'Activation code': '', 'Status': '', 'Licence issued': '', 'Licence expires': '', 'Paid through': '', 'Months paid': '', 'Months list': '', 'Amount received': '', 'Added on': '', 'Notes': '' })
      const lines = [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(','))]
      fs.writeFileSync(saved.filePath!, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8') // BOM so Excel reads it as UTF-8
    }
    return { path: saved.filePath! }
  })
}

export async function backupLedger(now = new Date()) {
  const l = owner()
  const saved = await dialog.showSaveDialog({
    title: 'Back up the customer list',
    defaultPath: `DericBI-customers-backup-${utcDay(now)}.json`,
    filters: [{ name: 'Backup', extensions: ['json'] }],
  })
  if (saved.canceled || !saved.filePath) return { success: false as const, error: '', cancelled: true }
  return guard(() => {
    l.updateSettings({}) // makes sure the ledger file exists, even before the first customer
    fs.copyFileSync(l.filePath, saved.filePath!)
    return { path: saved.filePath! }
  })
}
