'use strict'
// Licence modes (valid / grace / view-only / locked / lifetime), the read-vs-write channel classification, the pay
// window's constants and links, and "no private key in the repo". Uses the compiled output (npm test builds first).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const { Licensing } = require('../dist-electron/licensing/licensing.js')
const Gate = require('../dist-electron/licensing/licence-gate.js')

// The renderer's pure pay module is TypeScript under src/: compile it in memory to test it.
function loadTs(rel) {
  const m = new Module(rel)
  m._compile(ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, rel)
  return m.exports
}
const Pay = loadTs('src/lib/pay.ts')

const memStore = () => { const d = {}; return { get: (k, f = null) => (k in d ? d[k] : f), set: (k, v) => { d[k] = v } } }
const CFG = JSON.parse(read('electron/licensing/licensing.config.json'))
const day = (iso) => new Date(`${iso}T00:00:00Z`)

function setup(today = '2026-01-01') {
  const now = { d: day(today) }
  const { keyText, publicHex } = Licensing.makeOwnerKey(CFG.prefix)
  const make = (store) => new Licensing({ appId: CFG.appId, prefix: CFG.prefix, publicKeyHex: publicHex, store, graceDays: Gate.GRACE_DAYS, today: () => now.d, clock: () => Math.floor(now.d.getTime() / 1000) })
  const owner = make(memStore())
  const cust = make(memStore())
  const seed = owner.parseOwnerKey(keyText)
  const code = cust.installId()
  return { now, owner, cust, seed, code }
}
const advance = (now, days) => { now.d = new Date(now.d.getTime() + days * 86400000) }

test('valid licence: full use, no grace flag, not read-only', () => {
  const { cust, owner, seed, code } = setup()
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  const s = cust.state()
  assert.deepEqual([s.ok, s.kind, s.grace, s.read_only, s.lifetime, s.days_left], [true, 'licensed', undefined, undefined, false, 30])
  assert.equal(s.install_id, code)
})

test('grace: 5 days after the end everything works and the days left count down', () => {
  const { cust, owner, seed, code, now } = setup()
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  advance(now, 31)                                   // 1 day after the end
  let s = cust.state(); assert.deepEqual([s.ok, s.grace, s.grace_days_left], [true, true, 4])
  advance(now, 4)                                    // 5 days after the end: last grace day
  s = cust.state(); assert.deepEqual([s.ok, s.grace, s.grace_days_left], [true, true, 0])
})

test('after grace: view-only (kind expired, read_only), not unlicensed', () => {
  const { cust, owner, seed, code, now } = setup()
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  advance(now, 36)                                   // 6 days after the end
  const s = cust.state()
  assert.deepEqual([s.ok, s.kind, s.read_only], [false, 'expired', true])
  assert.match(s.message, /view your data/)
  assert.equal(s.install_id, code)
  assert.throws(() => cust.activate((t => t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA'))(owner.issue(seed, code, 'Jane', 30).licence)), /signed|licence/i) // a tampered one is still refused
})

test('renewing restores full use at once', () => {
  const { cust, owner, seed, code, now } = setup()
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  advance(now, 60); assert.equal(cust.state().kind, 'expired')
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  const s = cust.state(); assert.deepEqual([s.ok, s.kind, s.grace, s.read_only], [true, 'licensed', undefined, undefined])
})

test('never activated, wrong computer and wound-back clock stay fully locked (not read-only)', () => {
  const { cust, owner, seed, code, now } = setup()
  let s = cust.state(); assert.deepEqual([s.ok, s.kind, s.read_only], [false, 'unlicensed', undefined])
  assert.throws(() => cust.activate(owner.issue(seed, 'AAAA-BBBB-CCCC', 'X', 30).licence), /different computer/)
  cust.activate(owner.issue(seed, code, 'Jane', 30).licence)
  advance(now, 10); cust.state()                     // clock high-water mark moves forward
  advance(now, -5)                                   // wound back more than a day
  s = cust.state(); assert.deepEqual([s.ok, s.kind, s.read_only], [false, 'unlicensed', undefined])
  assert.match(s.message, /clock/)
})

test('lifetime: expires 2099-12-31 with plan lifetime, never nags or expires; days are not needed', () => {
  const { cust, owner, seed, code, now } = setup()
  const out = owner.issue(seed, code, 'Jane', undefined, undefined, true)
  assert.equal(out.expires, '2099-12-31')
  cust.activate(out.licence)
  advance(now, 365 * 20)
  const s = cust.state(); assert.deepEqual([s.ok, s.kind, s.lifetime, s.grace, s.read_only], [true, 'licensed', true, undefined, undefined])
  assert.throws(() => owner.issue(seed, code, 'Jane', undefined), /lasts 1 to/)   // a monthly licence still needs days
  assert.throws(() => owner.issue(seed, code, 'Jane', 400), /lasts 1 to 365/)
})

test('owner console can issue lifetime licences (checkbox + renew flag reach the signer)', () => {
  const svc = read('electron/services/owner.service.ts')
  assert.match(svc, /issue\(seedForSigning\(\), c\.code, c\.name, days, undefined, lifetime\)/)
  assert.match(read('electron/ipc/licence-handlers.ts'), /owner:renew', async \(_, id: string, lifetime\?: boolean\) => Owner\.renew\(id, lifetime\)/)
  assert.match(read('src/pages/OwnerConsole.tsx'), /issueNew\(\{[^}]*lifetime \}\)/)
})

// ── read vs write ──
const READ = ['auth:login', 'auth:validate-session', 'auth:logout', 'auth:get-security-question', 'auth:reset-password',
  'progress:dashboard', 'progress:skills', 'progress:rank', 'progress:memory', 'progress:achievements',
  'lessons:list', 'lessons:get', 'lessons:start', 'exercises:get', 'exercises:hint',
  'sql:history', 'sql:datasets', 'sql:close-sandbox', 'files:profile', 'ai:has-key', 'ai:get-provider',
  'settings:get', 'settings:get-all', 'app:get-version', 'projects:list', 'projects:get', 'portfolio:list',
  'portfolio:export', 'portfolio:open-file',
  'admin:check', 'admin:users-list', 'admin:user-detail', 'admin:content-stats', 'admin:system-info']
const WRITE = ['auth:register', 'auth:update-profile', 'auth:change-password', 'auth:set-security-question',
  'lessons:complete', 'exercises:submit', 'sql:execute', 'sql:load-dataset',
  'files:pick', 'files:import', 'files:delete',
  'ai:chat', 'ai:exercise-feedback', 'ai:save-key', 'ai:list-models', 'ai:set-provider', 'settings:set',
  'projects:create', 'projects:update', 'projects:delete', 'portfolio:create', 'portfolio:delete',
  'admin:reset-user-progress', 'admin:set-admin', 'admin:delete-user',
  'owner:overview', 'owner:unlock-file', 'owner:unlock-saved', 'owner:unlock-pasted', 'owner:lock', 'owner:issue-new', 'owner:renew',
  'owner:set-payment', 'owner:update-customer', 'owner:delete-customer', 'owner:update-settings', 'owner:export', 'owner:backup']
const UNGATED = ['licence:state', 'licence:activate', 'licence:claim-owner', 'licence:open-link']

function registeredChannels() {
  const out = []
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${f.name}`
      if (f.isDirectory()) walk(rel)
      else if (f.name.endsWith('.ts')) for (const m of read(rel).matchAll(/safeHandle\(\s*'([\w:-]+)'/g)) out.push(m[1])
    }
  }
  walk('electron')
  return out
}

test('every IPC channel is classified read, write or licence-screen; the code lists exactly the read ones', () => {
  const registered = registeredChannels()
  assert.equal(new Set(registered).size, registered.length, 'a channel is registered twice')
  assert.deepEqual([...registered].sort(), [...READ, ...WRITE, ...UNGATED].sort(),
    'a channel was added or removed: classify it in this test AND (if it only reads) in READ_CHANNELS')
  assert.deepEqual([...Gate.READ_CHANNELS].sort(), [...READ].sort())
  assert.equal(new Set([...READ, ...WRITE, ...UNGATED]).size, READ.length + WRITE.length + UNGATED.length, 'a channel is in two classes')
})

test('gate: valid licence allows all; view-only allows reads and refuses writes and unknown channels; locked refuses everything', () => {
  const valid = { ok: true }, readOnly = { ok: false, read_only: true }, locked = { ok: false }
  for (const c of [...READ, ...WRITE, 'made:up']) assert.equal(Gate.allows(c, valid), true, c)
  for (const c of READ) assert.equal(Gate.allows(c, readOnly), true, c)
  for (const c of [...WRITE, 'made:up', '']) assert.equal(Gate.allows(c, readOnly), false, c)
  for (const c of [...READ, ...WRITE]) assert.equal(Gate.allows(c, locked), false, c)
})

test('the safe-handle wrapper uses the gate, and the refusal text is what the screen matches on', () => {
  assert.match(read('electron/ipc/safe-handle.ts'), /requireAccess\(channel\)/)
  assert.match(read('electron/services/licence.service.ts'), /st\.read_only \? READ_ONLY_MESSAGE/)
  assert.equal(Gate.READ_ONLY_MESSAGE, 'Your licence has expired, so this is view-only. Renew your licence to add or change anything.')
  const mark = read('src/lib/apiError.ts').match(/VIEW_ONLY_MARK = '([^']+)'/)[1]
  assert.ok(Gate.READ_ONLY_MESSAGE.includes(mark))
  assert.equal(Gate.GRACE_DAYS, 5)
  assert.match(read('electron/services/licence.service.ts'), /graceDays: GRACE_DAYS/)
})

// ── pay window ──
test('pay window: one window, right account, amounts, tag and plans', () => {
  assert.equal(Pay.PAY.email, 'dericmarangu@gmail.com')
  assert.equal(Pay.PAY.tag, 'INS'); assert.equal(Pay.PAY.app, 'DericBI Instructor')
  assert.deepEqual([Pay.PAY.plans.M.amount, Pay.PAY.plans.L.amount], [100, 1000])
  assert.equal(Pay.PAY.paypal, 'https://www.paypal.com/myaccount/transfer/homepage')
  assert.equal(Pay.payRef('M', 'ABCD-EFGH-JKLM'), 'LIC-INS-ABCDEFGHJKLM-M')
  assert.equal(Pay.payRef('L', 'abcd-efgh-jklm'), 'LIC-INS-ABCDEFGHJKLM-L')
  // one pay window component, used by the activation screen and Settings (no second copy of it)
  const dialogs = []
  const walk = (dir) => { for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { const rel = `${dir}/${f.name}`; if (f.isDirectory()) walk(rel); else if (/\.tsx?$/.test(f.name) && /paypal|Email my proof/i.test(read(rel))) dialogs.push(rel) } }
  walk('src')
  assert.deepEqual(dialogs.sort(), ['src/components/ui/PayWindow.tsx', 'src/lib/pay.ts'])
  assert.equal((read('src/components/ui/PayWindow.tsx').match(/role="dialog"/g) || []).length, 1)
  assert.match(read('src/pages/LicenceGate.tsx'), /<PayPlans /); assert.match(read('src/pages/Settings.tsx'), /<PayPlans /)
})

test('proof email carries what is needed to issue the licence', () => {
  const m = Pay.payMail('M', 'ABCD-EFGH-JKLM')
  assert.equal(m.subject, 'Payment proof - DericBI Instructor licence Monthly (30 days) - LIC-INS-ABCDEFGHJKLM-M')
  for (const needed of ['Amount: $100 USD', 'Reference: LIC-INS-ABCDEFGHJKLM-M', 'Activation code: ABCD-EFGH-JKLM', 'PayPal transaction ID: ', 'My name: ', 'Please attach your PayPal screenshot']) assert.ok(m.body.includes(needed), needed)
  assert.ok(Pay.payMail('L', 'ABCD-EFGH-JKLM').body.includes('Amount: $1000 USD'))
  assert.ok(m.mailto.startsWith('mailto:dericmarangu@gmail.com?subject='))
  assert.ok(m.gmail.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=dericmarangu%40gmail.com&su='))
  assert.doesNotMatch(read('src/components/ui/PayWindow.tsx'), /auto-?attach/i)
  assert.match(read('src/components/ui/PayWindow.tsx'), /Attach the screenshot and press Send/)
})

test('only payment links can be opened: exact allowlist, every link the window builds passes, others fail', () => {
  assert.deepEqual([...Gate.LINK_ALLOW].sort(), ['https://dericbi.vercel.app/renew.html?', 'https://mail.google.com/mail/?view=cm', 'https://www.paypal.com/', 'mailto:dericmarangu@gmail.com?'].sort())
  const m = Pay.payMail('L', 'ABCD-EFGH-JKLM')
  for (const u of [m.mailto, m.gmail, Pay.PAY.paypal, 'https://dericbi.vercel.app/renew.html?app=instructor&code=ABCD-EFGH-JKLM']) assert.equal(Gate.isAllowedLink(u), true, u)
  for (const u of ['https://evil.example/', 'https://www.paypal.com.evil.example/', 'http://www.paypal.com/', 'file:///C:/Windows/calc.exe', 'ms-msdt:x', 'mailto:other@x.com?subject=a', 'https://mail.google.com/mail/u/0/', 'https://dericbi.vercel.app/', 7, null, undefined, 'https://www.paypal.com/' + 'a'.repeat(4000)]) assert.equal(Gate.isAllowedLink(u), false, String(u))
  assert.equal(Gate.renewUrl('ABCD-EFGH-JKLM'), 'https://dericbi.vercel.app/renew.html?app=instructor&code=ABCD-EFGH-JKLM')
  // the only shell.openExternal reached from the renderer's pay window goes through the allowlist check
  assert.match(read('electron/services/licence.service.ts'), /if \(!isAllowedLink\(url\)\) return \{ ok: false \}[\s\S]*shell\.openExternal\(url\)/)
  assert.match(read('electron/preload.ts'), /openLink: \(url: string\) => ipcRenderer\.invoke\('licence:open-link', url\)/)
})

// ── secrets ──
test('no private owner key is ever in the repo, and key files are ignored', () => {
  const hits = []
  const skip = new Set(['node_modules', 'dist', 'dist-electron', 'release', '.git'])
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (skip.has(f.name)) continue
      const rel = dir ? `${dir}/${f.name}` : f.name
      if (f.isDirectory()) { walk(rel); continue }
      if (/\.(key|pem)$/.test(f.name)) hits.push(`${rel}: key file`)
      if (!/\.(ts|tsx|js|json|yml|md|bat|html|txt)$/.test(f.name) || f.name === 'package-lock.json') continue
      if (/\b[A-Z]{2,6}-OWNER-[A-Za-z0-9_-]{43}\b/.test(read(rel))) hits.push(`${rel}: owner key text`)
    }
  }
  walk('')
  assert.deepEqual(hits, [])
  assert.match(read('.gitignore'), /^\*\.key$/m)
  assert.match(CFG.ownerPublicKey, /^[0-9a-f]{64}$/i, 'the config holds only the 64-hex PUBLIC key')
  // the tooling that makes keys writes outside the project (Documents) and the app never writes key text
  assert.match(read('scripts/make-owner-key.js'), /os\.homedir\(\), 'Documents'/)
})
