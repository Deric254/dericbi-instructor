/** Where customers send their activation code and where the owner's licences are sent back. */
export const SUPPORT_WHATSAPP = '254791360805'

export const whatsappLink = (digits: string, text: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(text)}`

/**
 * Turns a phone number typed by the owner into WhatsApp's digits-only form (Kenyan 07xx / 01xx numbers get
 * 254). Returns null when the contact is not a usable phone number (for example an email address).
 */
export function toWhatsAppNumber(contact: string): string | null {
  if (/[a-z@]/i.test(contact)) return null
  let d = contact.replace(/\D/g, '')
  if (d.startsWith('0') && d.length === 10) d = '254' + d.slice(1)
  return d.length >= 11 && d.length <= 15 ? d : null
}
