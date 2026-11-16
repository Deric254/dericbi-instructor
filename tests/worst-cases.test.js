'use strict'
// Worst-case behaviour: runaway queries are stopped, writes survive isolation, bad input and damaged files
// never crash or leak internals.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-worst-'))
const load = Module._load
Module._load = function (req, ...r) {
  if (req === 'electron') return { app: { getPath: () => tmp, isPackaged: false, getVersion: () => '0' }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle() {} }, dialog: {}, shell: {}, BrowserWindow: class {} }
  if (req === 'xlsx') return {}
  return load.call(this, req, ...r)
}
const D = path.join(__dirname, '..', 'dist-electron')
const req = (p) => require(path.join(D, p))
let S, I, U, db
test.before(async () => {
  db = req('db/database'); await db.initDb()
  db.getDb().prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES ('u1','T','t@x.io','x')").run()
  S = req('services/sql.service'); I = req('services/sql.isolate'); U = req('services/userdb.service')
  I.isolateLimits.hardMs = 2500
  const SQL = await S.getSqlJs()
  const d = new SQL.Database(); d.run('create table t(x);')
  for (let i = 0; i < 500; i++) d.run('insert into t values(?)', [i])
  S.registerSandbox('ex_w', d)
})
const run = (query, sandboxId = 'ex_w') => S.executeSQL({ sandboxId, query, userId: 'u1' })

test('a runaway query is stopped with a friendly message and the app stays usable', async () => {
  const r = await run('select count(*) from t a,t b,t c,t d,t e')
  assert.equal(r.success, false)
  assert.match(r.error, /stopped after .*seconds/i)
  const ok = await run('select count(*) c from t')
  assert.equal(ok.rows[0].c, 500)
})

test('writes made through the isolated runner are kept', async () => {
  const w = await run('insert into t values (999); create table z(a)')
  assert.equal(w.success, true)
  assert.equal(w.affected_rows, 1)
  assert.equal((await run('select count(*) c from t')).rows[0].c, 501)
})

test('TEMP tables still work across runs', async () => {
  await run('create temp table q(a); insert into q values (1)')
  assert.equal((await run('select * from q')).rows[0].a, 1)
})

test('non-string / missing queries give a plain message, not an internal error', async () => {
  for (const q of [undefined, null, 42, {}, []]) {
    const r = await run(q)
    assert.equal(r.success, false)
    assert.doesNotMatch(r.error, /undefined|reading|TypeError/)
  }
})

test('creating a database for an unknown user fails cleanly and leaves no stray file', async () => {
  const r = await U.createUserDatabase('ghost', 'Mine')
  assert.equal(r.success, false)
  const base = path.join(tmp)
  const stray = []
  ;(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : f.name.endsWith('.sqlite') && stray.push(f.name) })(base)
  assert.equal(stray.length, 0)
})

test('a damaged database file is reported kindly and is not registered', async () => {
  const c = await U.createUserDatabase('u1', 'Damaged')
  assert.equal(c.success, true, c.error)
  const file = path.join(tmp, 'user-databases', 'u1', fs.readdirSync(path.join(tmp, 'user-databases', 'u1')).find((f) => f.endsWith('.sqlite')))
  fs.writeFileSync(file, Buffer.from('this is definitely not a sqlite database at all, just text'.repeat(20)))
  S.closeSandbox('udb_' + c.database.id)
  const r = await run('select 1', 'udb_' + c.database.id)
  assert.equal(r.success, false)
  assert.match(r.error, /could not be opened/i)
  assert.equal(S.hasSandbox('udb_' + c.database.id), false)
})
