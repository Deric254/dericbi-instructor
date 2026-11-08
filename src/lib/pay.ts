/**
 * The one place that knows how a DericBI licence is paid for: PayPal to the owner, then an email with the proof.
 * Pure functions (no React, no Electron) so the references, amounts and links are unit-tested.
 * Every link built here must start with an entry of LINK_ALLOW in electron/licensing/licence-gate.ts.
 */
export const PAY = {
  email: 'dericmarangu@gmail.com',
  paypal: 'https://www.paypal.com/myaccount/transfer/homepage',
  app: 'DericBI Instructor',
  tag: 'INS',
  plans: {
    M: { name: 'Monthly (30 days)', amount: 100 },
    L: { name: 'Lifetime', amount: 1000 },
  },
} as const

export type PayPlan = keyof typeof PAY.plans

/** Same app + computer + plan always gives the same reference, so a repeat payment is easy to spot. */
export const payRef = (plan: PayPlan, installCode: string): string =>
  `LIC-${PAY.tag}-${installCode.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-${plan}`

export function payMail(plan: PayPlan, installCode: string): { mailto: string; gmail: string; subject: string; body: string } {
  const p = PAY.plans[plan]
  const ref = payRef(plan, installCode)
  const subject = `Payment proof - ${PAY.app} licence ${p.name} - ${ref}`
  const body = [
    'Hello Deric,', '',
    'I have paid by PayPal. My proof is attached.', '',
    `What I paid for: ${PAY.app} licence, ${p.name}`,
    `Amount: $${p.amount} USD`,
    `Reference: ${ref}`,
    `Activation code: ${installCode}`,
    'PayPal transaction ID: ',
    'My name: ', '',
    '(Please attach your PayPal screenshot before sending.)',
  ].join('\n')
  const q = (s: string) => encodeURIComponent(s)
  return {
    subject, body,
    mailto: `mailto:${PAY.email}?subject=${q(subject)}&body=${q(body)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${q(PAY.email)}&su=${q(subject)}&body=${q(body)}`,
  }
}

/** Remembered per reference on this computer, so a second click says "proof already sent" instead of paying twice. */
export const paySentKey = (ref: string): string => `dericbi.paysent.${ref}`
