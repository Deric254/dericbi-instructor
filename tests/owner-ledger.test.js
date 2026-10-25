'use strict'
// Tests for the owner's customer ledger and the "licence runs to the end of the last paid month" rule.
// Runs against the compiled output, so use `npm test` (it builds first).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const L = require('../dist-electron/services/owner-ledger.js')
const { Licensing } = require('../dist-electron/licensing/licensing.js')

// The licence module only needs a store with get/set; an in-memory one stands in for the file.
const memoryStore = () => { const m = {}; return { get: (k, d = null) => (k in m ? m[k] : d), set: (k, v) => { m[k] = v } } }

const CODE_A = 'ABCD-EFGH-JKLM'
const CODE_B = 'NPQR-STUV-WXYZ'
const at = (iso) => new Date(`${iso}T09:00:00Z`)

function tmpLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbin-ledger-'))
  return { dir, file: path.join(dir, 'owner-ledger.json'), ledger: new L.OwnerLedger(path.join(dir, 'owner-ledger.json')) }
}

test('month and day helpers', () => {
  assert.equal(L.addMonths('2026-11', 3), '2027-02')
  assert.equal(L.addMonths('2026-01', -1), '2025-12')
  assert.equal(L.lastDayOfMonth('2026-02'), '2026-02-28')
  assert.equal(L.lastDayOfMonth('2028-02'), '2028-02-29')
  assert.equal(L.lastDayOfMonth('2026-12'), '2026-12-31')
  assert.equal(L.addDays('2026-10-31', 5), '2026-11-05')
  assert.equal(L.daysBetween('2026-10-01', '2026-10-31'), 30)
})

test('adding customers: validation, normalised codes, duplicates', () => {
  const { ledger } = tmpLedger()
  const c = ledger.addCustomer({ name: '  Amina   Wanjiru ', contact: '0712345678', code: CODE_A.toLowerCase() })
  assert.equal(c.name, 'Amina Wanjiru')
  assert.equal(c.code, 'ABCDEFGHJKLM')
  assert.throws(() => ledger.addCustomer({ name: 'Other', code: CODE_A }), /already in your list/)
  assert.throws(() => ledger.addCustomer({ name: '', code: CODE_B }), /name/)
  assert.throws(() => ledger.addCustomer({ name: 'X', code: 'SHORT' }), /12 letters and numbers/)
  assert.equal(ledger.findByCode('abcd efgh jklm').id, c.id)
})

test('editing: code change is unique, delete removes', () => {
  const { ledger } = tmpLedger()
  const a = ledger.addCustomer({ name: 'A', code: CODE_A })
  const b = ledger.addCustomer({ name: 'B', code: CODE_B })
  assert.throws(() => ledger.updateCustomer(b.id, { code: CODE_A }), /another customer/)
  ledger.updateCustomer(b.id, { name: 'Bee', code: 'ZZZZ-YYYY-XXXX' })
  assert.equal(ledger.find(b.id).code, 'ZZZZYYYYXXXX')
  ledger.deleteCustomer(a.id)
  assert.equal(ledger.customers().length, 1)
  assert.throws(() => ledger.deleteCustomer(a.id), /not found/)
})

test('monthly payments: tick, untick, paid-through, rejects bad months', () => {
  const { ledger } = tmpLedger()
  const c = ledger.addCustomer({ name: 'A', code: CODE_A })
  ledger.setPayment(c.id, '2026-10', true, 1000, at('2026-10-02'))
  ledger.setPayment(c.id, '2026-08', true, undefined, at('2026-08-05'))
  assert.deepEqual(L.paidMonths(ledger.find(c.id)), ['2026-08', '2026-10'])
  assert.equal(L.paidThrough(ledger.find(c.id)), '2026-10')
  ledger.setPayment(c.id, '2026-10', false)
  assert.equal(L.paidThrough(ledger.find(c.id)), '2026-08')
  assert.throws(() => ledger.setPayment(c.id, '2026-13', true), /valid month/)
  assert.throws(() => ledger.setPayment(c.id, 'October', true), /valid month/)
})

test('default amount is applied to ticks and counted in the summary', () => {
  const { ledger } = tmpLedger()
  ledger.updateSettings({ defaultAmount: 1000 })
  const c = ledger.addCustomer({ name: 'A', code: CODE_A })
  ledger.setPayment(c.id, '2026-10', true, undefined, at('2026-10-02'))
  ledger.setPayment(c.id, '2026-11', true, 500, at('2026-10-02'))
  assert.equal(ledger.summary(at('2026-10-15')).received, 1500)
  assert.throws(() => ledger.updateSettings({ graceDays: 99 }), /0 to 30/)
  assert.throws(() => ledger.updateSettings({ defaultAmount: -5 }), /number/)
})

test('licence target = end of last paid month + grace; days validation', () => {
  const { ledger } = tmpLedger()
  const c = ledger.addCustomer({ name: 'A', code: CODE_A })
  assert.equal(L.licenceTarget(ledger.find(c.id), 5), null)
  assert.throws(() => L.licenceDays(ledger.find(c.id), at('2026-10-10'), 5, 365), /Tick the month/)
  ledger.setPayment(c.id, '2026-10', true)
  assert.equal(L.licenceTarget(ledger.find(c.id), 5), '2026-11-05')
  assert.equal(L.licenceDays(ledger.find(c.id), at('2026-10-10'), 5, 365), 26)
  // last paid month already over
  assert.throws(() => L.licenceDays(ledger.find(c.id), at('2026-12-01'), 5, 365), /already ended/)
  // too far ahead
  ledger.setPayment(c.id, '2028-01', true)
  assert.throws(() => L.licenceDays(ledger.find(c.id), at('2026-10-10'), 5, 365), /at most 365/)
  // paid month ends today -> still at least one day
  ledger.setPayment(c.id, '2028-01', false)
  assert.equal(L.licenceDays(ledger.find(c.id), at('2026-11-05'), 5, 365), 1)
})

test('the licence really expires on the date the ledger promises (real licence module)', () => {
  const owner = Licensing.makeOwnerKey('DBIN')
  const lic = new Licensing({ appId: 'DericBI Instructor', prefix: 'DBIN', publicKeyHex: owner.publicHex, store: memoryStore(), today: () => at('2026-10-10') })
  const seed = lic.parseOwnerKey(owner.keyText)
  const { ledger } = tmpLedger()
  const c = ledger.addCustomer({ name: 'Amina', code: lic.installId() })
  ledger.setPayment(c.id, '2026-10', true)
  const days = L.licenceDays(ledger.find(c.id), at('2026-10-10'), 5, 365)
  const issued = lic.issue(seed, lic.installId(), 'Amina', days)
  assert.equal(issued.expires, L.licenceTarget(ledger.find(c.id), 5))
  lic.activate(issued.licence)
  assert.equal(lic.state().ok, true)
  assert.equal(lic.state().days_left, 26)
})

test('status, renewal need and summary', () => {
  const { ledger } = tmpLedger()
  const a = ledger.addCustomer({ name: 'A', code: CODE_A })
  const b = ledger.addCustomer({ name: 'B', code: CODE_B })
  const now = at('2026-10-20')
  assert.equal(L.statusOf(ledger.find(a.id), now), 'none')
  ledger.recordLicence(a.id, { issuedAt: '2026-10-01T00:00:00Z', expires: '2026-10-25', token: 'x' })
  assert.equal(L.statusOf(ledger.find(a.id), now), 'expiring')
  ledger.recordLicence(b.id, { issuedAt: '2026-09-01T00:00:00Z', expires: '2026-10-05', token: 'y' })
  assert.equal(L.statusOf(ledger.find(b.id), now), 'expired')
  assert.equal(L.statusOf(ledger.find(a.id), at('2026-10-01')), 'active')
  ledger.setPayment(a.id, '2026-11', true)
  assert.equal(L.needsRenewal(ledger.find(a.id), 5), true)   // November paid, licence ends 25 Oct
  ledger.recordLicence(a.id, { issuedAt: '2026-10-20T00:00:00Z', expires: '2026-12-05', token: 'z' })
  assert.equal(L.needsRenewal(ledger.find(a.id), 5), false)
  const s = ledger.summary(now)
  assert.deepEqual([s.total, s.expired, s.paidThisMonth, s.unpaidThisMonth, s.month], [2, 1, 0, 2, '2026-10'])
})

test('export rows and the monthly grid', () => {
  const { ledger } = tmpLedger()
  const a = ledger.addCustomer({ name: 'Amina', contact: '0712', code: CODE_A, notes: 'says "hi", thanks' })
  ledger.setPayment(a.id, '2026-10', true, 1000)
  ledger.setPayment(a.id, '2026-11', true, 1000)
  ledger.recordLicence(a.id, { issuedAt: '2026-10-02T08:00:00Z', expires: '2026-12-05', token: 't' })
  const [row] = ledger.exportRows(at('2026-10-20'))
  assert.equal(row.Name, 'Amina')
  assert.equal(row['Activation code'], 'ABCD-EFGH-JKLM')
  assert.equal(row.Status, 'Active')
  assert.equal(row['Paid through'], '2026-11')
  assert.equal(row['Months paid'], 2)
  assert.equal(row['Amount received'], 2000)
  assert.equal(row['Licence expires'], '2026-12-05')
  const [g] = ledger.paymentGrid()
  assert.equal(g['2026-10'], 1000)
})

test('saves atomically, keeps a backup, and recovers from a damaged file', () => {
  const { dir, file, ledger } = tmpLedger()
  const a = ledger.addCustomer({ name: 'A', code: CODE_A })
  ledger.addCustomer({ name: 'B', code: CODE_B })           // second save makes the .bak of the first
  assert.ok(fs.existsSync(`${file}.bak`))
  assert.ok(!fs.existsSync(`${file}.tmp`), 'no temp file left behind')
  assert.equal(new L.OwnerLedger(file).customers().length, 2)
  fs.writeFileSync(file, '{ this is not json')                // simulate a crash mid-write / corruption
  const recovered = new L.OwnerLedger(file)
  assert.equal(recovered.customers().length, 1)               // restored from the backup (one save behind)
  assert.equal(recovered.customers()[0].id, a.id)
  fs.writeFileSync(file, 'garbage'); fs.writeFileSync(`${file}.bak`, 'garbage')
  assert.equal(new L.OwnerLedger(file).customers().length, 0) // both bad -> starts empty, does not crash
  fs.rmSync(dir, { recursive: true, force: true })
})
