#!/usr/bin/env node
/**
 * DericBI Instructor - license key generator (SELLER USE ONLY)
 * ------------------------------------------------------------
 * This script never ships inside the app. Keep it, and the private key file it
 * creates, on your own machine only - never commit them to a public repo, never
 * bundle them into the Electron app, never send the private key to anyone.
 *
 * No npm install needed: it uses Node's built-in Ed25519 (Node 18+).
 *
 * ONE-TIME SETUP
 *   cd seller-tools
 *   node generate-license-key.js --new-keypair
 *     -> prints a PUBLIC key and saves the PRIVATE key to seller-tools/private-key.txt
 *        (gitignored). BACK UP private-key.txt somewhere safe and OFFLINE: if you lose it you
 *        can never issue another key that this build accepts, and if you run --new-keypair
 *        again, every key you already sold stops working in new builds.
 *   Copy the PUBLIC key into electron/services/license.service.ts (SELLER_PUBLIC_KEY_HEX),
 *   then release a new version of the app.
 *
 * EACH SALE
 *   node generate-license-key.js --ref "order-12345"
 *     -> prints the key to send to the buyer, and appends a line to issued-keys.log (gitignored)
 *
 * OTHER COMMANDS
 *   node generate-license-key.js --show-public        print the public key for the stored private key
 *   node generate-license-key.js --check "<key>"      verify a key against the stored private key
 *   node generate-license-key.js --new-keypair --force   REPLACE an existing keypair (dangerous)
 *
 * The "ref" is only a label for your records (order id, buyer email...). The app validates keys
 * fully offline and never looks it up.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PRIVATE_KEY_PATH = path.join(__dirname, 'private-key.txt')
const ISSUED_LOG_PATH = path.join(__dirname, 'issued-keys.log')

// DER wrappers that turn raw 32-byte Ed25519 keys into the formats Node's crypto understands.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

function privateKeyObject(seedHex) {
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seedHex, 'hex')]), format: 'der', type: 'pkcs8' })
}
function publicHexOf(privateKey) {
  return crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
}
function loadPrivateSeed() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('No private-key.txt found. Run:  node generate-license-key.js --new-keypair')
    process.exit(1)
  }
  const hex = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim()
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    console.error('private-key.txt is not a valid 64-character hex key.')
    process.exit(1)
  }
  return hex
}

function newKeypair(force) {
  if (fs.existsSync(PRIVATE_KEY_PATH) && !force) {
    console.error('\nSTOP: seller-tools/private-key.txt already exists.')
    console.error('Creating a new keypair would REPLACE it, and every license key you have already sold')
    console.error('would stop being accepted by new builds of the app.')
    console.error('To see your current public key run:  node generate-license-key.js --show-public')
    console.error('If you really intend to replace it, run again with --force (back up the old file first).\n')
    process.exit(1)
  }
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const seedHex = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('hex')
  fs.writeFileSync(PRIVATE_KEY_PATH, seedHex, { encoding: 'utf8', mode: 0o600 })
  console.log('\n=== New signing keypair generated ===\n')
  console.log('PUBLIC key (paste into electron/services/license.service.ts as SELLER_PUBLIC_KEY_HEX):')
  console.log(publicHexOf(privateKey))
  console.log('\nThe PRIVATE key was saved to seller-tools/private-key.txt - keep it secret and BACK IT UP offline.')
  console.log('\nNext steps:')
  console.log('1. Open electron/services/license.service.ts and replace SELLER_PUBLIC_KEY_HEX with the PUBLIC key above')
  console.log('2. Commit and push so the app is rebuilt and released with the new key')
  console.log('3. Never commit private-key.txt (it is already in .gitignore)\n')
}

function sign(ref) {
  const privateKey = privateKeyObject(loadPrivateSeed())
  const payload = { ref: ref || `key-${Date.now()}`, iat: Math.floor(Date.now() / 1000) }
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = crypto.sign(null, payloadBytes, privateKey)
  return { licenseKey: `DBI-${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`, payload }
}

function issueKey(ref) {
  const { licenseKey, payload } = sign(ref)
  fs.appendFileSync(ISSUED_LOG_PATH, `${new Date().toISOString()}\t${payload.ref}\t${licenseKey}\n`, 'utf8')
  console.log('\n=== License key ===\n')
  console.log(licenseKey)
  console.log(`\n(ref: ${payload.ref} - also recorded in issued-keys.log)\n`)
}

function checkKey(key) {
  const privateKey = privateKeyObject(loadPrivateSeed())
  const publicKey = crypto.createPublicKey(privateKey)
  const m = /^DBI-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec((key || '').replace(/\s+/g, ''))
  if (!m) { console.log('INVALID: not in DBI-<payload>.<signature> format'); process.exit(1) }
  const ok = crypto.verify(null, fromBase64Url(m[1]), publicKey, fromBase64Url(m[2]))
  console.log(ok ? 'VALID for your current keypair.' : 'INVALID: signature does not match your current keypair.')
  process.exit(ok ? 0 : 1)
}

const args = process.argv.slice(2)
const after = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined }
if (args.includes('--new-keypair')) newKeypair(args.includes('--force'))
else if (args.includes('--show-public')) console.log(publicHexOf(privateKeyObject(loadPrivateSeed())))
else if (args.includes('--check')) checkKey(after('--check'))
else issueKey(after('--ref'))
