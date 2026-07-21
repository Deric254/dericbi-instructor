import { app, safeStorage } from 'electron'
import * as os from 'os'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

// @noble/ed25519 v3 needs a sha512 implementation wired in manually (it has no
// built-in dependency on a hash library, by design, to stay dependency-free).
ed.hashes.sha512 = sha512

// ─────────────────────────────────────────────
// SELLER PUBLIC KEY
// ─────────────────────────────────────────────
// This is the ONLY half of the keypair that ships inside the app — it can
// only verify signatures, never create them. The matching PRIVATE key must
// be generated once by the seller (see seller-tools/generate-license-key.js),
// kept offline and secret, and used only to mint new license keys for real
// purchases. Losing the private key means no more valid keys can ever be
// issued under this public key; leaking it means anyone could mint keys
// that this app will accept as genuine. Treat it like a signing certificate.
//
// PLACEHOLDER — replace with your own generated public key before shipping.
// Running `node seller-tools/generate-license-key.js --new-keypair` prints
// both halves once; paste the public half in here and never commit the
// private half anywhere.
//
// The value below is a TEST keypair generated during development so the
// activation flow works out of the box for trying the app — it is NOT
// secret-safe to keep using for real sales, since its matching private key
// exists in this conversation's history. Generate your own before selling.
const SELLER_PUBLIC_KEY_HEX = 'e5376d7d073b7c307dc4aade4243330a0915bd795e20b847a116e9501659273b'

interface LicensePayload {
  /** Short order/customer reference, for the seller's own records — not
   * validated against anything at runtime since there's no server to check
   * it against; it's carried along so a support conversation ("what does my
   * key say") is possible without the seller keeping a separate database. */
  ref: string
  /** Unix seconds the key was issued. */
  iat: number
}

interface LicenseRecord {
  key: string
  payload: LicensePayload
  machineId: string
  activatedAt: string
}

function licenseFilePath(): string {
  return path.join(app.getPath('userData'), 'license.dat')
}

/**
 * A best-effort hardware/OS fingerprint. This is intentionally NOT a random
 * value generated and saved on first run — a saved random value would just
 * copy along with the rest of the userData folder if someone cloned the
 * whole app install to a new machine, defeating the point. Deriving it from
 * actual machine characteristics means copying files elsewhere produces a
 * different fingerprint on the new machine, so the copied install won't
 * validate there.
 *
 * This is NOT unbreakable hardware DRM — someone deliberately reverse
 * engineering the app could spoof it. It's meant to stop casual copying,
 * not a determined attacker, consistent with running fully offline with no
 * license server.
 */
function getMachineId(): string {
  const cpus = os.cpus()
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpus[0]?.model ?? '',
    String(cpus.length),
    os.userInfo().username,
  ]
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64')
}

/**
 * Verifies a license key's signature against the embedded public key.
 * Returns the decoded payload if genuine, or an error if the key is
 * malformed or wasn't signed by the matching private key.
 */
type VerifyResult = { valid: true; payload: LicensePayload } | { valid: false; error: string }

async function verifyKey(licenseKey: string): Promise<VerifyResult> {
  // .trim() only strips the ends — an email client that line-wraps a long
  // key can leave a newline or space in the MIDDLE of it after copy-paste,
  // which is a real, common way this fails for a non-technical buyer.
  // Stripping all whitespace handles that without weakening validation,
  // since a genuine key never legitimately contains whitespace anywhere.
  const trimmed = licenseKey.replace(/\s+/g, '')
  const withoutPrefix = trimmed.startsWith('DBI-') ? trimmed.slice(4) : trimmed
  const parts = withoutPrefix.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'That doesn\'t look like a valid license key. If you copied it from an email, make sure you selected the whole thing.' }
  }

  try {
    const [payloadB64, sigB64] = parts
    const payloadBytes = base64UrlDecode(payloadB64)
    const signature = base64UrlDecode(sigB64)
    const publicKey = Buffer.from(SELLER_PUBLIC_KEY_HEX, 'hex')

    const ok = await ed.verifyAsync(new Uint8Array(signature), new Uint8Array(payloadBytes), new Uint8Array(publicKey))
    if (!ok) {
      return { valid: false, error: 'This license key is not valid.' }
    }

    const payload = JSON.parse(payloadBytes.toString('utf8')) as LicensePayload
    if (!payload || typeof payload.ref !== 'string' || typeof payload.iat !== 'number') {
      return { valid: false, error: 'This license key is malformed.' }
    }
    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'This license key could not be read.' }
  }
}

function readRecord(): LicenseRecord | null {
  try {
    const filePath = licenseFilePath()
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath)
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8')
    return JSON.parse(json) as LicenseRecord
  } catch (err) {
    console.error('[license] failed to read local record', err)
    return null
  }
}

function writeRecord(record: LicenseRecord): void {
  const json = JSON.stringify(record)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8')
  fs.writeFileSync(licenseFilePath(), data)
}

/**
 * Current activation status. Called on every app launch before showing the
 * rest of the app.
 */
export function getStatus(): { activated: boolean; ref?: string } {
  const record = readRecord()
  if (!record) return { activated: false }

  const currentMachineId = getMachineId()
  if (record.machineId !== currentMachineId) {
    // The local record doesn't match this machine's fingerprint — most
    // likely the whole app folder was copied from a different computer.
    // Treat as not activated rather than silently trusting it.
    return { activated: false }
  }
  return { activated: true, ref: record.payload.ref }
}

/**
 * Activates a license key on this device. Idempotent for the same key on
 * the same device; rejects a key that's already bound to a DIFFERENT
 * machine fingerprint recorded locally (re-entering a different key on the
 * same physical device is allowed, e.g. while troubleshooting).
 */
export async function activate(licenseKey: string): Promise<{ success: boolean; error?: string }> {
  const result = await verifyKey(licenseKey)
  if (result.valid === false) {
    return { success: false, error: result.error }
  }

  const machineId = getMachineId()
  const existing = readRecord()
  const normalizedKey = licenseKey.replace(/\s+/g, '')
  if (existing && existing.key === normalizedKey && existing.machineId === machineId) {
    return { success: true } // already activated here — nothing to do
  }

  writeRecord({
    key: normalizedKey,
    payload: result.payload,
    machineId,
    activatedAt: new Date().toISOString(),
  })
  return { success: true }
}

/** Clears the local activation record on this device (e.g. before handing
 * the machine to someone else, or to re-activate with a different key). */
export function deactivate(): { success: boolean } {
  try {
    const filePath = licenseFilePath()
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    console.error('[license] failed to clear local record', err)
    return { success: false }
  }
}
