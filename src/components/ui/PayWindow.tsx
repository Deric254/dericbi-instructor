import { useState } from 'react'
import { Copy,Check,X } from 'lucide-react'
import { notify } from '../../store'
import { PAY,payMail,payRef,paySentKey,type PayPlan } from '../../lib/pay'

const readSent = (ref: string): number | null => {
  try { const v = localStorage.getItem(paySentKey(ref)); return v ? Number(v) : null } catch { return null }
}
const writeSent = (ref: string) => { try { localStorage.setItem(paySentKey(ref), String(Date.now())) } catch { /* private mode: no memory, still works */ } }

/**
 * The app's one pay window. Plan buttons open it; it shows what to pay and the reference, opens PayPal, and writes
 * the proof email. A mailto link cannot attach files, so the window tells the person to attach the screenshot.
 * Links open through the main process, which only opens the allowlist in electron/licensing/licence-gate.ts.
 */
export default function PayPlans({ installCode, renewUrl }: { installCode: string; renewUrl?: string }) {
  const [plan, setPlan] = useState<PayPlan | null>(null)
  const [again, setAgain] = useState(false)
  const [copied, setCopied] = useState('')

  const close = () => { setPlan(null); setAgain(false) }
  const open = (p: PayPlan) => {
    if (!installCode) { notify.warning('Activation code not ready', 'Close this screen and open it again.'); return }
    setAgain(false); setPlan(p)
  }
  const openLink = (url: string) => {
    window.api.licence.openLink(url)
      .then((r) => { if (!r.ok) notify.error("Couldn't open the link", 'Copy the details above and do it by hand.') })
      .catch(() => notify.error("Couldn't open the link", 'Copy the details above and do it by hand.'))
  }
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1500) } catch { /* clipboard blocked */ }
  }
  const proof = (p: PayPlan, gmail?: boolean) => {
    const m = payMail(p, installCode)
    openLink(gmail ? m.gmail : m.mailto)
    writeSent(payRef(p, installCode))
  }

  const row = (label: string, value: string) => (
    <>
      <div className="input-label" style={{ margin: '12px 0 4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', wordBreak: 'break-all' }}>
        <b style={{ fontSize: 13 }}>{value}</b>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => copy(value)} aria-label={`Copy ${label}`}>
          {copied === value ? <Check size={12} /> : <Copy size={12} />} Copy
        </button>
      </div>
    </>
  )

  const p = plan ? PAY.plans[plan] : null
  const ref = plan ? payRef(plan, installCode) : ''
  const sent = plan && !again ? readSent(ref) : null

  return (
    <>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" type="button" style={{ flex: 1, flexDirection: 'column', gap: 2, padding: '10px 8px' }} onClick={() => open('M')}>
          <b>${PAY.plans.M.amount} / month</b><span style={{ fontSize: 11, fontWeight: 400 }}>Pay with PayPal</span>
        </button>
        <button className="btn btn-secondary" type="button" style={{ flex: 1, flexDirection: 'column', gap: 2, padding: '10px 8px' }} onClick={() => open('L')}>
          <b>${PAY.plans.L.amount} for life</b><span style={{ fontSize: 11, fontWeight: 400 }}>Pay with PayPal</span>
        </button>
      </div>

      {plan && p && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1100, overflow: 'auto' }}
             onClick={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-labelledby="pay-title"
               style={{ position: 'relative', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-xl)', padding: 24, width: 460, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <button className="btn btn-ghost btn-sm" type="button" onClick={close} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10 }}><X size={14} /></button>
            <h3 id="pay-title" style={{ marginBottom: 2 }}>Pay with PayPal</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{PAY.app} licence, {p.name}</div>

            {sent ? (
              <>
                <div style={{ padding: '10px 12px', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', fontSize: 12.5, lineHeight: 1.6 }}>
                  <b>Proof already sent</b><br />
                  You opened the proof email for this payment on {new Date(sent).toLocaleDateString()}. We are checking it. Please do not pay again for the same thing.
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="btn btn-secondary" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={close}>Close</button>
                  <button className="btn btn-secondary" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setAgain(true)}>I need to pay again</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 30, fontWeight: 700, margin: '4px 0 2px' }}>${p.amount} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>USD</span></div>
                {row('Send to (PayPal)', PAY.email)}
                {row('Put this in the PayPal note', ref)}
                <ol style={{ margin: '14px 0', paddingLeft: 20, fontSize: 12.5, lineHeight: 1.6 }}>
                  <li><b>Open PayPal</b> and send exactly <b>${p.amount} USD</b> to the email above.</li>
                  <li><b>Take a screenshot</b> of the PayPal confirmation. It must show the amount, the date and the <b>transaction ID</b>.</li>
                  <li><b>Click "Email my proof"</b>. The email opens already written. Attach the screenshot and press Send.</li>
                </ol>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={() => openLink(PAY.paypal)}>Open PayPal</button>
                  <button className="btn btn-primary" type="button" style={{ flex: 1, justifyContent: 'center' }} onClick={() => proof(plan)}>Email my proof</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
                  Email app not opening?{' '}
                  <span role="button" tabIndex={0} style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => proof(plan, true)}>Write it in Gmail on the web</span>
                  , or send the screenshot to <b>{PAY.email}</b> with the reference above.
                  {renewUrl && <> Or <span role="button" tabIndex={0} style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => openLink(renewUrl)}>pay on the website</span>.</>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
