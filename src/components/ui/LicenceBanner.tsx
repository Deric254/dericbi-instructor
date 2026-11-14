import { useState } from 'react'
import { Clock, X } from 'lucide-react'
import { useUIStore } from '../../store'
import type { LicenceState } from '../../types'

const WARN_DAYS = 14

/** A gentle heads-up when the licence is close to ending, with a shortcut to the renewal box. */
export default function LicenceBanner({ state }: { state: LicenceState | null }) {
  const setActiveSection = useUIStore((s) => s.setActiveSection)
  const [dismissed, setDismissed] = useState(false)

  if (!state || state.kind !== 'licensed' || dismissed || state.daysLeft === undefined || state.daysLeft > WARN_DAYS) return null

  const when = state.daysLeft === 0 ? 'today' : `in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}`
  return (
    <div role="status" style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 900, maxWidth: 330, padding: '12px 14px',
      background: 'var(--bg-elevated)', border: '1px solid var(--warning, #f59e0b)', borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,.4))', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Clock size={16} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Your licence ends {when}</div>
        <div style={{ color: 'var(--text-muted)' }}>It runs to {state.expires}. After your next payment we send a renewal licence to paste in Settings.</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setActiveSection('settings')}>Open Settings</button>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss"><X size={13} /></button>
    </div>
  )
}
