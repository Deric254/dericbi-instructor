import React, { useState } from 'react'
import { Copy, Check, ArrowRight, ShieldCheck, MessageCircle } from 'lucide-react'
import AppLogo from '../components/ui/AppLogo'
import OwnerKeyInput from '../components/ui/OwnerKeyInput'
import { MinimalTitlebar } from '../components/layout/Titlebar'
import { reportApiError } from '../lib/apiError'
import { SUPPORT_WHATSAPP, whatsappLink } from '../lib/contact'
import type { LicenceState } from '../types'

/** Shown until this copy has a valid licence for its own activation code (or is claimed by the owner). */
export default function LicenceGate({ state, onChanged }: { state: LicenceState; onChanged: () => void }) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [ownerMode, setOwnerMode] = useState(false)

  const lapsed = /expired/i.test(state.message)
  const message = `Hello DericBI, I would like a licence for DericBI Instructor. My activation code is ${state.installCode}`

  async function copyCode() {
    await navigator.clipboard.writeText(state.installCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setError('')
    setLoading(true)
    try {
      const r = await window.api.licence.activate(token)
      if (r.success) onChanged()
      else setError(r.error ?? 'This licence could not be activated.')
    } catch (err) {
      reportApiError('activate your licence', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <MinimalTitlebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div className="card" style={{ padding: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <AppLogo size={44} />
              <h2 style={{ textAlign: 'center' }}>{lapsed ? 'Your licence has ended' : 'Activate DericBI Instructor'}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                {state.kind === 'unconfigured'
                  ? state.message
                  : lapsed
                    ? 'Send us your activation code once your next payment is made and we will send a renewal licence.'
                    : 'Send us the activation code below. We reply with your personal licence, which you paste here.'}
              </p>
            </div>

            {state.kind !== 'unconfigured' && !ownerMode && (
              <>
                <div className="input-label" style={{ marginBottom: 6 }}>Your activation code</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-elevated)', fontFamily: 'var(--font-mono)', fontSize: 17, letterSpacing: 2, textAlign: 'center', userSelect: 'all' }}>
                    {state.installCode}
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={copyCode} aria-label="Copy activation code">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <a className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 20, textDecoration: 'none' }}
                   href={whatsappLink(SUPPORT_WHATSAPP, message)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={14} /> Send my code on WhatsApp
                </a>

                <form onSubmit={activate}>
                  <div className="input-group" style={{ marginBottom: 14 }}>
                    <label className="input-label">Your licence</label>
                    <textarea
                      className="input"
                      style={{ minHeight: 84, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                      placeholder="Paste the licence we sent you (it starts with DBIN1.)"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  {error && (
                    <div style={{ padding: '8px 12px', background: 'var(--error-dim)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', color: 'var(--error)', fontSize: 12, marginBottom: 14 }}>
                      {error}
                    </div>
                  )}
                  <button className="btn btn-primary" type="submit" disabled={loading || !token.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                    {loading ? 'Activating…' : <>Activate <ArrowRight size={14} /></>}
                  </button>
                </form>
              </>
            )}

            {ownerMode && (
              <OwnerKeyInput
                onChooseFile={() => window.api.licence.claimOwner()}
                onPaste={(text) => window.api.licence.claimOwner(text)}
                onDone={onChanged}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <ShieldCheck size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Your licence is checked on this computer, so activating needs no internet. It works only on the computer
                that showed this code.
              </p>
            </div>
            {state.kind !== 'unconfigured' && (
              <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => setOwnerMode(m => !m)}>
                {ownerMode ? 'Back' : 'Owner sign-in'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
