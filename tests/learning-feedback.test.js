'use strict'
// Wrong answers should teach: SQL errors are explained in plain language with "did you mean", and a wrong
// result comes back with both results and per-row match flags for the side-by-side view.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-learn-'))
const load = Module._load
Module._load = function (req, ...r) {
  if (req === 'electron') return { app: { getPath: () => tmp, isPackaged: false, getVersion: () => '0' }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle() {} }, dialog: {}, shell: {}, BrowserWindow: class {} }
  if (req === 'xlsx') return {}
  return load.call(this, req, ...r)
}
const D = path.join(__dirname, '..', 'dist-electron')
const req = (p) => require(path.join(D, p))
let S, F
const schema = { tables: { patients: ['patient_id', 'first_name', 'age'], billing: ['bill_id', 'patient_id', 'amount'] } }

test.before(async () => {
  const db = req('db/database'); await db.initDb()
  S = req('services/sql.service'); F = req('services/sql.friendly')
  const SQL = await S.getSqlJs()
  const d = new SQL.Database()
  d.run('create table patients(patient_id integer primary key, first_name text, age integer); insert into patients values (1,"Amina",34),(2,"Brian",41),(3,"Chao",29);')
  S.registerSandbox('ex_learn', d)
})

test('misspelt table and column names get a "did you mean" and the real names', () => {
  const t = F.friendlySqlError('no such table: patient', schema)
  assert.match(t, /no table called "patient"/); assert.match(t, /Did you mean "patients"/); assert.match(t, /patients, billing/); assert.match(t, /SQLite said: no such table: patient/)
  const c = F.friendlySqlError('no such column: p.first_nam', schema)
  assert.match(c, /Did you mean "first_name"/)
})

test('common beginner errors each get a specific, actionable explanation', () => {
  const cases = [
    ['near "FROM": syntax error', /missing or extra comma/],
    ['incomplete input', /unfinished/],
    ['ambiguous column name: patient_id', /p\.patient_id/],
    ['no such function: DATEDIFF', /julianday/],
    ['no such function: ISNULL', /IFNULL/],
    ['misuse of aggregate: COUNT()', /HAVING/],
    ['UNIQUE constraint failed: patients.patient_id', /already exists in patients\.patient_id/],
    ['NOT NULL constraint failed: patients.first_name', /must have a value/],
    ['FOREIGN KEY constraint failed', /does not exist in the other table/],
    ['table patients already exists', /IF NOT EXISTS/],
    ['table patients has 3 columns but 2 values were supplied', /3 columns but your INSERT gives 2/],
    ['unrecognized token: "\'abc"', /quote/],
  ]
  for (const [raw, re] of cases) assert.match(F.friendlySqlError(raw, schema), re, raw)
})

test('unknown messages pass through untouched; nothing is invented', () => {
  assert.equal(F.friendlySqlError('disk I/O error', schema), 'disk I/O error')
  assert.equal(F.friendlySqlError('', schema), '')
})

test('running a bad query in a real sandbox returns the friendly text, still containing the original', async () => {
  const r = await S.executeSQL({ sandboxId: 'ex_learn', userId: 'u', query: 'SELECT first_nam FROM patient' })
  assert.equal(r.success, false)
  assert.match(r.error, /Did you mean "patients"/)
  assert.match(r.error, /SQLite said: no such table: patient/)
  const r2 = await S.executeSQL({ sandboxId: 'ex_learn', userId: 'u', query: 'SELECT first_nam FROM patients' })
  assert.match(r2.error, /Did you mean "first_name"/)
})

test('the grader explains query errors the same way', async () => {
  const v = await S.validateSQLAnswer({ sandboxId: 'ex_learn', userQuery: 'SELECT * FROM patient', solutionQuery: 'SELECT * FROM patients', evaluationMode: 'exact' })
  assert.equal(v.correct, false)
  assert.match(v.feedback, /Query error: There is no table called "patient"/)
})

test('a wrong result returns both results with per-row match flags (order-insensitive)', () => {
  const user = { columns: ['name', 'age'], rows: [{ name: 'Amina', age: 34 }, { name: 'Zed', age: 50 }, { name: 'Brian', age: 41 }] }
  const exp = { columns: ['name', 'age'], rows: [{ name: 'Brian', age: 41 }, { name: 'Amina', age: 34 }, { name: 'Chao', age: 29 }] }
  const r = S.compareAnswers(user, exp, false)
  assert.equal(r.correct, false)
  assert.deepEqual(r.actual_match, [true, false, true])
  assert.deepEqual(r.expected_match, [true, true, false])
  assert.deepEqual([r.actual_total, r.expected_total], [3, 3])
  assert.deepEqual(r.actual_columns, ['name', 'age'])
})

test('when order matters, flags follow position; and a huge result is capped for the screen', () => {
  const user = { columns: ['n'], rows: [{ n: 2 }, { n: 1 }] }
  const exp = { columns: ['n'], rows: [{ n: 1 }, { n: 2 }] }
  assert.deepEqual(S.compareAnswers(user, exp, true).actual_match, [false, false])
  const big = { columns: ['n'], rows: Array.from({ length: 5000 }, (_, i) => ({ n: i })) }
  const small = { columns: ['n'], rows: [{ n: 1 }] }
  const r = S.compareAnswers(big, small, false)
  assert.equal(r.actual_rows.length, S.COMPARE_ROWS)
  assert.equal(r.actual_total, 5000)
})
