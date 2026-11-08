import { useState } from 'react'
import { Clock,X } from 'lucide-react'
import { useUIStore } from '../../store'
import type { LicenceState } from '../../types'

const WARN_DAYS = 14

/** A heads-up when the licence is close to ending, in its grace days, or expired (view-only), with a shortcut to renewal. */
export default function LicenceBanner({ state }: { state: LicenceState | null }) {
  const setActiveSection = useUIStore((s) => s.setActiveSection)
  const [dismissed, setDismissed] = useState(false)

  if (!state || dismissed) return null
  const left = state.graceDaysLeft ?? 0
  let title: string
  let detail: string
  if (state.readOnly) {
    title = 'Licence expired. View-only'
    detail = 'You can still sign in, read your lessons and progress, and export your work. Renew to add or change anything.'
  } else if (state.grace) {
    title = `Licence expired. Renew within ${left <= 0 ? 'today' : left === 1 ? '1 day' : `${left} days`} to keep full access`
    detail = `It ended on ${state.expires}. After that the app becomes view-only.`
  } else if (state.kind === 'licensed' && !state.lifetime && state.daysLeft !== undefined && state.daysLeft <= WARN_DAYS) {
    const when = state.daysLeft === 0 ? 'today' : state.daysLeft === 1 ? 'tomorrow' : `in ${state.daysLeft} days`
    title = `Your licence ends ${when}`
    detail = `It runs to ${state.expires}. Renew in Settings to keep full access.`
  } else return null
  return (
    <div role="status" style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 900, maxWidth: 330, padding: '12px 14px',
      background: 'var(--bg-elevated)', border: '1px solid var(--warning, #f59e0b)', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,.4))', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Clock size={16} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)' }}>{detail}</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setActiveSection('settings')}>Renew</button>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss"><X size={13} /></button>
    </div>
  )
}
