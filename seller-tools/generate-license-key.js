#!/usr/bin/env node
/**
 * DericBI Instructor — license key generator (SELLER USE ONLY)
 * ──────────────────────────────────────────────────────────────
 * This script never ships inside the app. Keep it, and the private key file
 * it creates, on your own machine only — never commit them to a public
 * repo, never bundle them into the Electron app, never send the private
 * key to anyone.
 *
 * SETUP (one time):
 *   cd seller-tools
 *   npm install @noble/ed25519 @noble/hashes
 *   node generate-license-key.js --new-keypair
 *
 * This prints a PUBLIC key and a PRIVATE key, and saves the private key to
 * seller-tools/private-key.txt (gitignored — check your .gitignore!).
 * Copy the PUBLIC key into electron/services/license.service.ts, replacing
 * the SELLER_PUBLIC_KEY_HEX placeholder, then rebuild the app.
 *
 * ISSUING A KEY FOR EACH SALE:
 *   node generate-license-key.js --ref "order-12345"
 *
 * Paste the printed key into your delivery email/page for that buyer. The
 * "ref" is just a label for your own records (e.g. an order ID or the
 * buyer's email) — it isn't checked against anything at runtime, since the
 * app validates keys fully offline with no server. Use whatever helps you
 * keep track of who has which key, for support purposes.
 */

const fs = require('fs')
const path = require('path')
const ed = require('@noble/ed25519')
const { sha512 } = require('@noble/hashes/sha2.js')

ed.hashes.sha512 = sha512

const PRIVATE_KEY_PATH = path.join(__dirname, 'private-key.txt')

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function newKeypair() {
  const privateKey = ed.utils.randomSecretKey()
  const publicKey = await ed.getPublicKeyAsync(privateKey)

  const privHex = Buffer.from(privateKey).toString('hex')
  const pubHex = Buffer.from(publicKey).toString('hex')

  fs.writeFileSync(PRIVATE_KEY_PATH, privHex, 'utf8')

  console.log('\n=== New signing keypair generated ===\n')
  console.log('PUBLIC key (paste into electron/services/license.service.ts):')
  console.log(pubHex)
  console.log('\nPRIVATE key (saved to private-key.txt — keep this secret, never share or commit it):')
  console.log(privHex)
  console.log('\nNext steps:')
  console.log('1. Open electron/services/license.service.ts')
  console.log('2. Replace SELLER_PUBLIC_KEY_HEX with the PUBLIC key above')
  console.log('3. Rebuild the app (npm run build)')
  console.log('4. Add seller-tools/private-key.txt to .gitignore if it isn\'t already\n')
}

async function issueKey(ref) {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('No private-key.txt found. Run with --new-keypair first.')
    process.exit(1)
  }
  const privateKey = Buffer.from(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim(), 'hex')

  const payload = { ref: ref || `key-${Date.now()}`, iat: Math.floor(Date.now() / 1000) }
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')

  const signature = await ed.signAsync(new Uint8Array(payloadBytes), new Uint8Array(privateKey))

  const licenseKey = `DBI-${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`

  console.log('\n=== License key ===\n')
  console.log(licenseKey)
  console.log(`\n(ref: ${payload.ref})\n`)
  return licenseKey
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--new-keypair')) {
    await newKeypair()
    return
  }
  const refIndex = args.indexOf('--ref')
  const ref = refIndex !== -1 ? args[refIndex + 1] : undefined
  await issueKey(ref)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
