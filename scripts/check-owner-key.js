#!/usr/bin/env node
/**
 * Build guard: refuses to build an installer that has no owner public key.
 * Such a build can verify no licence at all (it fails closed), so it must never be released.
 * Fix: double-click CREATE-OWNER-KEY.bat once, then commit electron/licensing/licensing.config.json.
 */
const fs = require('fs')
const path = require('path')

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'electron', 'licensing', 'licensing.config.json'), 'utf8'))

if (!/^[0-9a-f]{64}$/i.test(config.ownerPublicKey || '')) {
  console.error('\nBUILD STOPPED: this app has no owner key yet, so it could not check any licence.')
  console.error('Fix: double-click CREATE-OWNER-KEY.bat once, back up the key file it makes, then commit and push')
  console.error('electron/licensing/licensing.config.json. See RELEASING.md.\n')
  process.exit(1)
}
console.log('check-owner-key: OK - the owner public key is set.')
