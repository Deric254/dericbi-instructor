import { useState } from 'react'
import { Clock, Eye, X } from 'lucide-react'
import { useUIStore } from '../../store'
import type { LicenceState } from '../../types'

const WARN_DAYS = 14

/**
 * Tells the person where their licence stands, in three levels: a gentle heads-up before it ends, a notice during
 * the grace days (everything still works), and a standing notice once it is view-only. Lifetime licences never show one.
 */
export default function LicenceBanner({ state }: { state: LicenceState | null }) {
  const setActiveSection = useUIStore((s) => s.setActiveSection)
  const [dismissed, setDismissed] = useState(false)

  if (!state || state.lifetime) return null
  const viewOnly = state.kind === 'expired' && state.readOnly === true
  if (!viewOnly && state.kind !== 'licensed') return null

  let title: string
  let text: string
  if (viewOnly) {
    title = 'Your licence has expired: view-only'
    text = 'You can still open your lessons, progress and projects. Renew in Settings to add or change anything.'
  } else if (state.grace) {
    const left = state.graceDaysLeft ?? 0
    title = `Your licence ended: ${left} day${left === 1 ? '' : 's'} of full use left`
    text = 'Everything still works for a few days. Renew in Settings to keep going without interruption.'
  } else if (state.daysLeft !== undefined && state.daysLeft <= WARN_DAYS) {
    title = `Your licence ends ${state.daysLeft === 0 ? 'today' : `in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}`}`
    text = `It runs to ${state.expires}. After your next payment we send a renewal licence to paste in Settings.`
  } else {
    return null
  }
  if (dismissed && !viewOnly) return null // the view-only notice stays: it explains why buttons are refused

  const Icon = viewOnly ? Eye : Clock
  return (
    <div role="status" style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 900, maxWidth: 330, padding: '12px 14px',
      background: 'var(--bg-elevated)', border: `1px solid ${viewOnly ? 'var(--error)' : 'var(--warning, #f59e0b)'}`, borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,.4))', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Icon size={16} style={{ color: viewOnly ? 'var(--error)' : 'var(--warning, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)' }}>{text}</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setActiveSection('settings')}>Open Settings</button>
      </div>
      {!viewOnly && <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss"><X size={13} /></button>}
    </div>
  )
}
