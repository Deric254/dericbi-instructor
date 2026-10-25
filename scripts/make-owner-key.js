#!/usr/bin/env node
/**
 * ONE-TIME setup: creates your owner key (double-click CREATE-OWNER-KEY.bat to run this).
 *
 *  - The PRIVATE key is saved to  Documents\DericBI Owner Key\<PREFIX>-owner.key  (never inside the project).
 *  - The matching PUBLIC key is written into electron/licensing/licensing.config.json, which every build
 *    of the app uses to check licences.
 *
 * It refuses to run if a public key is already set or the key file already exists: replacing the key
 * would make every licence you have issued stop working, and losing the old one cannot be undone.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { Licensing } = require('../electron/licensing/licensing')

const configPath = path.join(__dirname, '..', 'electron', 'licensing', 'licensing.config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const keyDir = process.env.DBIN_OWNER_KEY_DIR || path.join(os.homedir(), 'Documents', 'DericBI Owner Key')
const keyFile = path.join(keyDir, `${config.prefix}-owner.key`)

function stop(message) {
  console.error(`\nSTOPPED: ${message}\n`)
  process.exit(1)
}

if (config.ownerPublicKey) stop('An owner key is already set up for this app. Nothing was changed.')
if (fs.existsSync(keyFile)) stop(`A key file already exists at\n${keyFile}\nThe project has no public key, so this is probably an earlier key. Do not delete it. Ask for help before continuing.`)

const { keyText, publicHex } = Licensing.makeOwnerKey(config.prefix)
fs.mkdirSync(keyDir, { recursive: true })
fs.writeFileSync(keyFile, keyText + '\n', { encoding: 'utf8', mode: 0o600 })
config.ownerPublicKey = publicHex
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')

console.log('\nYour owner key was created.\n')
console.log(`  Private key file : ${keyFile}`)
console.log('  Public key       : saved into electron/licensing/licensing.config.json\n')
console.log('NEXT STEPS')
console.log('  1. COPY the private key file to a USB stick or other safe place NOW.')
console.log('     If you lose it you can never create another licence for this app. Never email it or share it.')
console.log('  2. Commit and push the project (the public key change) so a new version is built.')
console.log('  3. Install that version on your own computer, open it, choose "Owner sign-in" and pick the key file.')
console.log('     That unlocks the Owner Console, which only your computer has.\n')

if (process.platform === 'win32' && !process.env.DBIN_OWNER_KEY_DIR) spawn('explorer', [keyDir], { detached: true, stdio: 'ignore' }).unref()
