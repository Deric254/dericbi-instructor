import React, { useState } from 'react'
import { KeyRound, ArrowRight, ShieldCheck } from 'lucide-react'
import AppLogo from '../components/ui/AppLogo'
import { MinimalTitlebar } from '../components/layout/Titlebar'
import { reportApiError } from '../lib/apiError'

export default function LicenseGate({ onActivated }: { onActivated: () => void }) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    setError('')
    setLoading(true)
    try {
      const result = await window.api.license.activate(key)
      if (result.success) {
        onActivated()
      } else {
        setError(result.error ?? 'This license key could not be activated.')
      }
    } catch (err) {
      reportApiError('activate your license', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <MinimalTitlebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div className="card" style={{ padding: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <AppLogo size={44} />
              <h2 style={{ textAlign: 'center' }}>Activate DericBI Instructor</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                Enter the license key you received after purchase. This activates the app on this device.
              </p>
            </div>

            <form onSubmit={activate}>
              <div className="input-group" style={{ marginBottom: 14 }}>
                <label className="input-label">License Key</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 34, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    placeholder="DBI-XXXXXXXX...XXXX.XXXXXXXX...XXXX"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    autoFocus
                    spellCheck={false}
                  />
                </div>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', background: 'var(--error-dim)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', color: 'var(--error)', fontSize: 12, marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <button className="btn btn-primary" type="submit" disabled={loading || !key.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Activating…' : <>Activate <ArrowRight size={14} /></>}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <ShieldCheck size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                This activates on one device. No account or internet connection is required after
                activation — everything runs locally on your machine.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
