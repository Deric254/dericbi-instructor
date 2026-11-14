'use strict'
// Guards the licensing wiring: owner-only access, the activation gate, and "no leftovers from the old design".
// These are source-level checks, so they run without Electron.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('app id and prefix never change (every issued licence is bound to them)', () => {
  const cfg = JSON.parse(read('electron/licensing/licensing.config.json'))
  assert.equal(cfg.appId, 'DericBI Instructor')
  assert.equal(cfg.prefix, 'DBIN')
  assert.match(cfg.ownerPublicKey, /^([0-9a-f]{64})?$/i, 'public key is either empty (not set up yet) or 64 hex characters')
})

test('every function in the owner service checks owner access first', () => {
  const src = read('electron/services/owner.service.ts')
  const exported = [...src.matchAll(/^export (?:async )?function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)^\}/gm)]
  assert.ok(exported.length >= 12, 'expected the owner service functions to be found')
  // rememberKeyPath is only called right after the owner claim succeeded, and the claim itself is the proof.
  const exempt = new Set(['rememberKeyPath'])
  for (const [, name, body] of exported) {
    if (exempt.has(name)) continue
    assert.match(body, /\bowner\(\)/, `${name} must call owner() (the owner-access check) before doing anything`)
  }
})

test('owner channels only delegate to the owner service; licence channels are the only ungated ones', () => {
  const handlers = read('electron/ipc/licence-handlers.ts')
  for (const m of handlers.matchAll(/safeHandle\('owner:[\w-]+'.*$/gm)) assert.match(m[0], /Owner\.\w+\(/, m[0])
  const ungated = read('electron/ipc/safe-handle.ts').match(/UNGATED = new Set\(\[([^\]]*)\]\)/)[1]
  assert.deepEqual(ungated.split(',').map((s) => s.trim().replace(/'/g, '')).sort(), ['licence:activate', 'licence:claim-owner', 'licence:state'])
})

test('every data channel goes through the shared gated wrapper (nothing registers ipcMain directly)', () => {
  const direct = []
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`
      if (f.isDirectory()) walk(rel)
      else if (f.name.endsWith('.ts') && /ipcMain\.handle\(/.test(read(rel))) direct.push(rel)
    }
  }
  walk('electron')
  // main.ts owns only window controls and the updater; safe-handle.ts is the gate itself.
  assert.deepEqual(direct.sort(), ['electron/ipc/safe-handle.ts', 'electron/main.ts'])
})

test('the owner key is never written to disk or logged by the app', () => {
  const owner = read('electron/services/owner.service.ts')
  const licence = read('electron/services/licence.service.ts')
  assert.doesNotMatch(owner + licence, /writeFileSync\([^)]*(seed|keyText|ownerKey)/i)
  assert.doesNotMatch(owner + licence, /console\.\w+\([^)]*(seed|keyText)/i)
})

test('no leftovers from the previous licence design', () => {
  const stale = ['seller-tools', '@noble', 'SELLER_PUBLIC_KEY', 'license:status', 'license:activate', 'license:deactivate', 'LicenseGate', 'license.service', 'generate-license-key']
  const hits = []
  const skip = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git', 'tests'])
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (skip.has(f.name)) continue
      const rel = dir ? `${dir}/${f.name}` : f.name
      if (f.isDirectory()) { walk(rel); continue }
      if (!/\.(ts|tsx|js|json|yml|md|bat|html)$/.test(f.name) || f.name === 'package-lock.json' || /^CHANGES-/.test(f.name)) continue
      const text = read(rel)
      for (const s of stale) if (text.includes(s)) hits.push(`${rel}: ${s}`)
    }
  }
  walk('')
  assert.deepEqual(hits, [])
})
