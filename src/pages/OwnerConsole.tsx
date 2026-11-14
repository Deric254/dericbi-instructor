import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound, Lock, LockOpen, Users, CheckCircle, Clock, AlertTriangle, Wallet, Download, FileSpreadsheet,
  Save, ChevronDown, ChevronRight, MessageCircle, Copy, X, RefreshCw,
} from 'lucide-react'
import OwnerKeyInput from '../components/ui/OwnerKeyInput'
import { notify } from '../store'
import { reportApiError } from '../lib/apiError'
import { toWhatsAppNumber, whatsappLink } from '../lib/contact'
import type { CustomerStatus, IssuedLicence, OwnerCustomer, OwnerOverview } from '../types'

const STATUS_LABEL: Record<CustomerStatus, string> = { none: 'No licence yet', active: 'Active', expiring: 'Expiring soon', expired: 'Expired' }
const STATUS_BADGE: Record<CustomerStatus, string> = { none: 'badge-common', active: 'badge-success', expiring: 'badge-warning', expired: 'badge-error' }

type Filter = 'all' | CustomerStatus | 'unpaid'

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' })
}
const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
const money = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 2 })

function licenceMessage(l: IssuedLicence): string {
  return `Hello ${l.name}, here is your DericBI Instructor licence. It runs until ${l.expires}.\n` +
    `Open DericBI Instructor, paste it on the activation screen (or in Settings > Licence if you already use the app) and click Activate:\n\n${l.licence}`
}

export default function OwnerConsole() {
  const [data, setData] = useState<OwnerOverview | null>(null)
  const [issued, setIssued] = useState<IssuedLicence | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(() => {
    return window.api.owner.overview()
      .then(setData)
      .catch((err) => reportApiError('load the owner console', err))
  }, [])

  useEffect(() => { load() }, [load])

  // Keep the lock indicator honest: refresh while open so an idle auto-lock shows up.
  useEffect(() => {
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [load])

  const visible = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.customers.filter((c) => {
      if (q && !`${c.name} ${c.contact} ${c.code}`.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      if (filter === 'unpaid') return !c.payments[data.summary.month]
      return c.status === filter
    })
  }, [data, filter, query])

  if (!data) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>

  const { summary, signing, settings } = data

  async function act<T extends { success: boolean }>(context: string, call: () => Promise<T>, onOk?: (r: Extract<T, { success: true }>) => void) {
    try {
      const r = await call()
      if (r.success) {
        onOk?.(r as Extract<T, { success: true }>)
        await load()
      } else {
        const message = (r as { error?: string }).error
        if (message) notify.error(`Couldn't ${context}`, message) // a cancelled file dialog has no message
      }
      return r
    } catch (err) {
      reportApiError(context, err)
      return undefined
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <KeyRound size={22} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 20 }}>Owner Console</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Visible on your computer only. Customers never see this page.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => act('export', () => window.api.owner.export('xlsx'), (r) => notify.success('Exported', r.path))}>
          <FileSpreadsheet size={13} /> Export Excel
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => act('export', () => window.api.owner.export('csv'), (r) => notify.success('Exported', r.path))}>
          <Download size={13} /> Export CSV
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => act('back up', () => window.api.owner.backup(), (r) => notify.success('Backed up', r.path))}>
          <Save size={13} /> Back up
        </button>
      </div>

      {/* ── Signing ── */}
      <div className="card" style={{ padding: 18 }}>
        {signing.unlocked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LockOpen size={16} color="var(--success)" />
            <div style={{ flex: 1, fontSize: 13 }}>Signing is unlocked. It locks itself after 30 idle minutes or when you close the app.</div>
            <button className="btn btn-secondary btn-sm" onClick={() => act('lock signing', () => window.api.owner.lock())}><Lock size={13} /> Lock now</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Lock size={16} color="var(--warning)" /> Signing is locked. Unlock it with your owner key to create licences.
            </div>
            {settings.keyPath && (
              <button className="btn btn-primary" onClick={() => act('unlock signing', () => window.api.owner.unlockSaved())}>
                <LockOpen size={14} /> Unlock with my saved key file
              </button>
            )}
            <OwnerKeyInput
              fileLabel={settings.keyPath ? 'Choose a different key file…' : 'Choose my owner key file…'}
              onChooseFile={() => window.api.owner.unlockFile()}
              onPaste={(text) => window.api.owner.unlockPasted(text)}
              onDone={load}
            />
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12 }}>
        <Stat icon={<Users size={15} />} label="Total users" value={summary.total} />
        <Stat icon={<CheckCircle size={15} color="var(--success)" />} label="Active licences" value={summary.active} />
        <Stat icon={<Clock size={15} color="var(--warning)" />} label="Expiring in 7 days" value={summary.expiring} />
        <Stat icon={<AlertTriangle size={15} color="var(--error)" />} label="Expired" value={summary.expired} />
        <Stat icon={<Wallet size={15} />} label={`Paid ${monthLabel(summary.month)}`} value={`${summary.paidThisMonth} / ${summary.total}`} />
        <Stat icon={<Wallet size={15} />} label="Amount received" value={money(summary.received)} />
      </div>

      {/* ── Issue a licence ── */}
      <IssueForm signingUnlocked={signing.unlocked} defaultAmount={settings.defaultAmount} onIssued={(l) => { setIssued(l); load() }} />

      {/* ── Customers ── */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <h3 style={{ flex: 1, minWidth: 140, fontSize: 15 }}>Customers ({visible.length}{visible.length !== summary.total ? ` of ${summary.total}` : ''})</h3>
          <input className="input" style={{ width: 220 }} placeholder="Search name, contact or code" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input" style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter customers">
            <option value="all">All customers</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="none">No licence yet</option>
            <option value="unpaid">Not paid {monthLabel(summary.month)}</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {summary.total === 0 ? 'No customers yet. Paste an activation code above to create your first licence.' : 'No customers match.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visible.map((c, i) => (
              <CustomerRow
                key={c.id}
                customer={c}
                index={data.customers.indexOf(c) + 1}
                currentMonth={summary.month}
                signingUnlocked={signing.unlocked}
                striped={i % 2 === 1}
                act={act}
                onIssued={(l) => { setIssued(l); load() }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <SettingsCard settings={settings} onSave={(patch) => act('save settings', () => window.api.owner.updateSettings(patch), () => notify.success('Saved', 'Settings updated.'))} />

      {issued && <IssuedDialog licence={issued} onClose={() => setIssued(null)} />}
    </div>
  )
}

type Act = <T extends { success: boolean }>(context: string, call: () => Promise<T>, onOk?: (r: Extract<T, { success: true }>) => void) => Promise<T | undefined>

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{icon}{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function IssueForm({ signingUnlocked, defaultAmount, onIssued }: { signingUnlocked: boolean; defaultAmount: number | null; onIssued: (l: IssuedLicence) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [months, setMonths] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const r = await window.api.owner.issueNew({ code, name, contact, months, amount: defaultAmount })
      if (r.success) {
        onIssued(r)
        setCode(''); setName(''); setContact(''); setMonths(1)
      } else {
        setError(r.error)
      }
    } catch (err) {
      reportApiError('create the licence', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" style={{ padding: 18 }} onSubmit={submit}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>New customer licence</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Paste the activation code the customer sends you. The licence is made instantly and the months they paid are ticked.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="input-group">
          <label className="input-label">Activation code</label>
          <input className="input" style={{ fontFamily: 'var(--font-mono)', letterSpacing: 1 }} placeholder="ABCD-EFGH-JKLM" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        </div>
        <div className="input-group">
          <label className="input-label">Customer name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Phone or email (optional)</label>
          <input className="input" placeholder="0712 345 678" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Months paid now</label>
          <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>
      </div>
      {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>{error}</div>}
      <button className="btn btn-primary" style={{ marginTop: 14 }} type="submit" disabled={busy || !signingUnlocked || !code.trim() || !name.trim()}>
        <KeyRound size={14} /> {busy ? 'Creating…' : 'Generate licence'}
      </button>
      {!signingUnlocked && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>Unlock signing first.</span>}
    </form>
  )
}

function CustomerRow({ customer: c, index, currentMonth, signingUnlocked, striped, act, onIssued }: {
  customer: OwnerCustomer; index: number; currentMonth: string; signingUnlocked: boolean; striped: boolean; act: Act; onIssued: (l: IssuedLicence) => void
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)))
  const [edit, setEdit] = useState({ name: c.name, contact: c.contact, code: c.code, notes: c.notes })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const paidNow = !!c.payments[currentMonth]

  const renew = () => act('renew the licence', () => window.api.owner.renew(c.id), (r) => onIssued(r))

  return (
    <div style={{ background: striped ? 'var(--bg-elevated)' : 'transparent', borderRadius: 'var(--radius)', padding: '10px 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1.5fr 1fr 1.1fr 0.9fr auto', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} aria-label={open ? 'Hide details' : 'Show details'} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{index}. {c.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.contact || 'no contact'} · <span style={{ fontFamily: 'var(--font-mono)' }}>{c.code}</span></div>
        </div>
        <div>
          <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{c.licenceExpires ? `until ${c.licenceExpires}` : '—'}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={paidNow} onChange={(e) => act('update the payment', () => window.api.owner.setPayment(c.id, currentMonth, e.target.checked))} />
          Paid {monthLabel(currentMonth)}
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paid through<br /><span style={{ color: 'var(--text-secondary)' }}>{c.paidThrough ? monthLabel(c.paidThrough) : 'nothing yet'}</span></div>
        <button className={`btn btn-sm ${c.needsRenewal ? 'btn-primary' : 'btn-secondary'}`} disabled={!signingUnlocked || !c.paidThrough} onClick={renew}
          title={!signingUnlocked ? 'Unlock signing first' : !c.paidThrough ? 'Tick a paid month first' : 'Create a licence that runs to the end of the last paid month'}>
          <RefreshCw size={12} /> {c.lastLicence ? 'Renew' : 'Issue'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
              <strong style={{ fontSize: 13 }}>{year}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tick every month this customer has paid.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
              {monthsOf(year).map((m) => (
                <label key={m} title={c.payments[m] ? `Paid ${c.payments[m].paidAt.slice(0, 10)}` : 'Not paid'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', background: c.payments[m] ? 'var(--success-dim)' : 'transparent' }}>
                  <input type="checkbox" checked={!!c.payments[m]} onChange={(e) => act('update the payment', () => window.api.owner.setPayment(c.id, m, e.target.checked))} />
                  {monthLabel(m).slice(0, 3)}
                </label>
              ))}
            </div>
          </div>

          {c.history.length > 0 && (
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Licences issued (latest first)</div>
              {c.history.map((h) => (
                <div key={h.token} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '3px 0' }}>
                  <span style={{ width: 90 }}>{h.issuedAt.slice(0, 10)}</span>
                  <span style={{ flex: 1, color: 'var(--text-muted)' }}>runs until {h.expires}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => onIssued({ licence: h.token, expires: h.expires, name: c.name, contact: c.contact, customerId: c.id })}>
                    <Copy size={12} /> Open
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <div className="input-group"><label className="input-label">Name</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="input-group"><label className="input-label">Contact</label><input className="input" value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></div>
            <div className="input-group"><label className="input-label">Activation code</label><input className="input" style={{ fontFamily: 'var(--font-mono)' }} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
            <div className="input-group"><label className="input-label">Notes</label><input className="input" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => act('save the customer', () => window.api.owner.updateCustomer(c.id, edit), () => notify.success('Saved', 'Customer updated.'))}>Save details</button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-danger btn-sm" onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
              act('delete the customer', () => window.api.owner.deleteCustomer(c.id))
            }}>
              {confirmDelete ? 'Click again to delete' : 'Delete customer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsCard({ settings, onSave }: { settings: OwnerOverview['settings']; onSave: (patch: { graceDays: number; defaultAmount: number | null }) => void }) {
  const [grace, setGrace] = useState(String(settings.graceDays))
  const [amount, setAmount] = useState(settings.defaultAmount === null ? '' : String(settings.defaultAmount))

  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Licence settings</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        A licence runs to the end of the last month you ticked as paid, plus the grace days below, so a customer is not locked out the moment the month turns.
      </p>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ width: 170 }}>
          <label className="input-label">Grace days after month end</label>
          <input className="input" type="number" min={0} max={30} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </div>
        <div className="input-group" style={{ width: 220 }}>
          <label className="input-label">Amount per month (optional)</label>
          <input className="input" type="number" min={0} placeholder="e.g. 1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => onSave({ graceDays: Number(grace), defaultAmount: amount === '' ? null : Number(amount) })}>Save settings</button>
      </div>
    </div>
  )
}

function IssuedDialog({ licence, onClose }: { licence: IssuedLicence; onClose: () => void }) {
  const [copied, setCopied] = useState<'licence' | 'message' | null>(null)
  const message = licenceMessage(licence)
  const phone = toWhatsAppNumber(licence.contact)

  async function copy(what: 'licence' | 'message') {
    await navigator.clipboard.writeText(what === 'licence' ? licence.licence : message)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Licence created" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ flex: 1, fontSize: 16 }}>Licence for {licence.name}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Runs until {licence.expires}. Send it to the customer.</p>
        <textarea className="input" readOnly value={licence.licence} style={{ minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => copy('licence')}><Copy size={14} /> {copied === 'licence' ? 'Copied' : 'Copy licence'}</button>
          <button className="btn btn-secondary" onClick={() => copy('message')}>{copied === 'message' ? 'Copied' : 'Copy message with steps'}</button>
          {phone && (
            <a className="btn btn-secondary" style={{ textDecoration: 'none' }} href={whatsappLink(phone, message)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Send on WhatsApp</a>
          )}
        </div>
      </div>
    </div>
  )
}
