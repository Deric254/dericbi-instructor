/**
 * The owner's customer ledger: who has been licensed, which months they have paid, and the licences issued.
 *
 * Pure data logic (no Electron), so it is fully unit-tested. It lives in one JSON file in the owner's
 * user-data folder (owner-ledger.json), is written atomically, and the previous version is kept as
 * owner-ledger.json.bak. Only the owner's copy of the app ever creates or reads it.
 *
 * Money rule: a licence runs to the END of the last month ticked as paid, plus a few grace days. When the
 * next month is paid and ticked, the owner issues a renewal. Nobody has to be "switched off": an unpaid
 * month simply lets the signed expiry date arrive.
 */
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { normCode } from '../licensing/licensing'

interface Payment { paidAt: string; amount: number | null }
interface LicenceRecord { issuedAt: string; expires: string; token: string }
export interface Customer {
  id: string
  name: string
  contact: string
  code: string // normalised 12-character activation code
  notes: string
  createdAt: string
  payments: Record<string, Payment> // key "YYYY-MM"
  licences: LicenceRecord[]
}
export interface LedgerSettings { graceDays: number; defaultAmount: number | null; keyPath: string }
interface LedgerFile { version: 1; settings: LedgerSettings; customers: Customer[] }

export type Status = 'none' | 'active' | 'expiring' | 'expired'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const EXPIRING_DAYS = 7
const MAX_LICENCE_HISTORY = 24

// ── date helpers (months are the owner's local calendar months; expiry dates are UTC days like the licence) ──
const pad = (n: number) => String(n).padStart(2, '0')
export const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10)

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}
export function lastDayOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86400000)
}

// ── derived facts about one customer ──
export function paidMonths(c: Customer): string[] { return Object.keys(c.payments).sort() }
export function paidThrough(c: Customer): string | null { const m = paidMonths(c); return m.length ? m[m.length - 1] : null }
export function lastLicence(c: Customer): LicenceRecord | null { return c.licences.length ? c.licences[c.licences.length - 1] : null }

export function statusOf(c: Customer, now: Date): Status {
  const l = lastLicence(c)
  if (!l) return 'none'
  const left = daysBetween(utcDay(now), l.expires)
  if (left < 0) return 'expired'
  return left <= EXPIRING_DAYS ? 'expiring' : 'active'
}

/** True when a month has been paid for that the current licence does not yet cover. */
export function needsRenewal(c: Customer, graceDays: number): boolean {
  const paid = paidThrough(c)
  if (!paid) return false
  const l = lastLicence(c)
  return !l || l.expires < addDays(lastDayOfMonth(paid), graceDays)
}

/** The expiry date a licence issued now should carry for this customer. */
export function licenceTarget(c: Customer, graceDays: number): string | null {
  const paid = paidThrough(c)
  return paid ? addDays(lastDayOfMonth(paid), graceDays) : null
}

/**
 * How many days from today a licence issued now must run to cover what the customer has paid for.
 * Throws a plain-language error when a licence cannot sensibly be issued.
 */
export function licenceDays(c: Customer, now: Date, graceDays: number, maxDays: number): number {
  const target = licenceTarget(c, graceDays)
  if (!target) throw new Error('Tick the month this customer has paid first.')
  const today = utcDay(now)
  if (target < today) throw new Error(`The last paid month (${paidThrough(c)}) has already ended. Tick the month this customer has paid now.`)
  const days = Math.max(1, daysBetween(today, target))
  if (days > maxDays) throw new Error(`That would run ${days} days, and a licence lasts at most ${maxDays}. Tick fewer months ahead.`)
  return days
}

function cleanName(v: unknown): string {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (s.length < 1 || s.length > 60) throw new Error("Give the customer's name (1 to 60 characters).")
  return s
}
function cleanCode(v: unknown): string {
  const c = normCode(v)
  if (c.length !== 12) throw new Error('The activation code is 12 letters and numbers, like ABCD-EFGH-JKLM.')
  return c
}
const cleanText = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)

const DEFAULT_SETTINGS: LedgerSettings = { graceDays: 5, defaultAmount: null, keyPath: '' }

export class OwnerLedger {
  private data: LedgerFile

  constructor(private readonly file: string) {
    this.data = this.load()
  }

  // ── persistence ──
  private load(): LedgerFile {
    for (const f of [this.file, `${this.file}.bak`]) {
      try {
        const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
        if (raw && raw.version === 1 && Array.isArray(raw.customers)) return this.normalise(raw)
      } catch { /* missing or damaged: try the backup, then start empty */ }
    }
    return { version: 1, settings: { ...DEFAULT_SETTINGS }, customers: [] }
  }

  private normalise(raw: any): LedgerFile {
    const s = raw.settings || {}
    return {
      version: 1,
      settings: {
        graceDays: Number.isInteger(s.graceDays) && s.graceDays >= 0 && s.graceDays <= 30 ? s.graceDays : DEFAULT_SETTINGS.graceDays,
        defaultAmount: typeof s.defaultAmount === 'number' && s.defaultAmount >= 0 ? s.defaultAmount : null,
        keyPath: typeof s.keyPath === 'string' ? s.keyPath : '',
      },
      customers: raw.customers.map((c: any): Customer => ({
        id: String(c.id),
        name: String(c.name ?? ''),
        contact: String(c.contact ?? ''),
        code: String(c.code ?? ''),
        notes: String(c.notes ?? ''),
        createdAt: String(c.createdAt ?? new Date().toISOString()),
        payments: c.payments && typeof c.payments === 'object' ? c.payments : {},
        licences: Array.isArray(c.licences) ? c.licences : [],
      })),
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`)
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.file)
  }

  get filePath(): string { return this.file }

  // ── settings ──
  settings(): LedgerSettings { return { ...this.data.settings } }
  updateSettings(patch: Partial<LedgerSettings>): LedgerSettings {
    const next = { ...this.data.settings }
    if (patch.graceDays !== undefined) {
      const g = Number(patch.graceDays)
      if (!Number.isInteger(g) || g < 0 || g > 30) throw new Error('Grace days must be a whole number from 0 to 30.')
      next.graceDays = g
    }
    if (patch.defaultAmount !== undefined) {
      const a = patch.defaultAmount === null || (patch.defaultAmount as unknown) === '' ? null : Number(patch.defaultAmount)
      if (a !== null && !(a >= 0)) throw new Error('The default amount must be a number, or left empty.')
      next.defaultAmount = a
    }
    if (patch.keyPath !== undefined) next.keyPath = String(patch.keyPath)
    this.data.settings = next
    this.save()
    return { ...next }
  }

  // ── customers ──
  customers(): Customer[] { return this.data.customers.map((c) => ({ ...c })) }
  find(id: string): Customer | undefined { return this.data.customers.find((c) => c.id === id) }
  findByCode(code: string): Customer | undefined {
    const n = normCode(code)
    return this.data.customers.find((c) => c.code === n)
  }

  addCustomer(input: { name: string; contact?: string; code: string; notes?: string }, now = new Date()): Customer {
    const code = cleanCode(input.code)
    if (this.findByCode(code)) throw new Error('That activation code is already in your list.')
    const c: Customer = {
      id: uuidv4(), name: cleanName(input.name), contact: cleanText(input.contact, 80), code,
      notes: cleanText(input.notes, 300), createdAt: now.toISOString(), payments: {}, licences: [],
    }
    this.data.customers.push(c)
    this.save()
    return c
  }

  updateCustomer(id: string, patch: { name?: string; contact?: string; code?: string; notes?: string }): Customer {
    const c = this.require(id)
    if (patch.name !== undefined) c.name = cleanName(patch.name)
    if (patch.contact !== undefined) c.contact = cleanText(patch.contact, 80)
    if (patch.notes !== undefined) c.notes = cleanText(patch.notes, 300)
    if (patch.code !== undefined) {
      const code = cleanCode(patch.code)
      const clash = this.findByCode(code)
      if (clash && clash.id !== id) throw new Error('That activation code belongs to another customer.')
      c.code = code
    }
    this.save()
    return c
  }

  deleteCustomer(id: string): void {
    this.require(id)
    this.data.customers = this.data.customers.filter((c) => c.id !== id)
    this.save()
  }

  setPayment(id: string, month: string, paid: boolean, amount?: number | null, now = new Date()): Customer {
    if (!MONTH_RE.test(month)) throw new Error('That is not a valid month.')
    const c = this.require(id)
    if (paid) {
      const a = amount === undefined || amount === null ? this.data.settings.defaultAmount : Number(amount)
      if (a !== null && !(a >= 0)) throw new Error('The amount must be a number.')
      c.payments[month] = { paidAt: now.toISOString(), amount: a }
    } else {
      delete c.payments[month]
    }
    this.save()
    return c
  }

  recordLicence(id: string, rec: LicenceRecord): void {
    const c = this.require(id)
    c.licences.push(rec)
    if (c.licences.length > MAX_LICENCE_HISTORY) c.licences = c.licences.slice(-MAX_LICENCE_HISTORY)
    this.save()
  }

  private require(id: string): Customer {
    const c = this.find(id)
    if (!c) throw new Error('That customer was not found.')
    return c
  }

  // ── reporting ──
  summary(now: Date) {
    const month = monthKey(now)
    const list = this.data.customers
    const count = (s: Status) => list.filter((c) => statusOf(c, now) === s).length
    let received = 0
    for (const c of list) for (const p of Object.values(c.payments)) received += p.amount ?? 0
    const paidNow = list.filter((c) => c.payments[month]).length
    return {
      total: list.length,
      active: count('active') + count('expiring'),
      expiring: count('expiring'),
      expired: count('expired'),
      notIssued: count('none'),
      paidThisMonth: paidNow,
      unpaidThisMonth: list.length - paidNow,
      received,
      month,
    }
  }

  /** One flat row per customer, used for both the Excel and CSV exports. */
  exportRows(now: Date) {
    return this.data.customers.map((c, i) => {
      const l = lastLicence(c)
      const months = paidMonths(c)
      return {
        'No.': i + 1,
        'Name': c.name,
        'Contact': c.contact,
        'Activation code': `${c.code.slice(0, 4)}-${c.code.slice(4, 8)}-${c.code.slice(8)}`,
        'Status': { none: 'No licence yet', active: 'Active', expiring: 'Expiring soon', expired: 'Expired' }[statusOf(c, now)],
        'Licence issued': l ? l.issuedAt.slice(0, 10) : '',
        'Licence expires': l ? l.expires : '',
        'Paid through': paidThrough(c) ?? '',
        'Months paid': months.length,
        'Months list': months.join(', '),
        'Amount received': months.reduce((sum, m) => sum + (c.payments[m].amount ?? 0), 0),
        'Added on': c.createdAt.slice(0, 10),
        'Notes': c.notes,
      }
    })
  }

  /** Customers x months grid for the payments sheet: each paid month shows the amount, or "paid". */
  paymentGrid() {
    const all = new Set<string>()
    for (const c of this.data.customers) for (const m of Object.keys(c.payments)) all.add(m)
    const months = [...all].sort()
    return this.data.customers.map((c, i) => {
      const row: Record<string, string | number> = { 'No.': i + 1, 'Name': c.name }
      for (const m of months) row[m] = c.payments[m] ? (c.payments[m].amount ?? 'paid') : ''
      return row
    })
  }
}
