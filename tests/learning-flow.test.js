'use strict'
// Staying in the work: editor auto-complete from the student's own tables, the "Explain" message sent to the
// tutor, schema lookup that respects ownership, and Reset restoring tables a student dropped.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, makeLearner } = require('./helpers/harness')
const { requireTs } = require('./helpers/ts')

const C = requireTs('src/lib/sqlCompletion.ts')
const E = requireTs('src/lib/explainPrompt.ts')
const schema = { patients: ['patient_id', 'first_name', 'age'], billing: ['bill_id', 'patient_id', 'amount'] }
const labels = (a) => a.map((s) => s.label)

test('after "alias." only that table\'s columns are offered, aliases resolved from FROM/JOIN', () => {
  const sql = 'SELECT p. FROM patients p JOIN billing AS b ON b.patient_id = p.patient_id'
  assert.deepEqual(labels(C.buildSuggestions(sql, 'SELECT p.', schema)), ['patient_id', 'first_name', 'age'])
  assert.deepEqual(labels(C.buildSuggestions(sql, 'SELECT b.am', schema)), ['bill_id', 'patient_id', 'amount'])
  assert.deepEqual(labels(C.buildSuggestions('SELECT patients.', 'SELECT patients.', schema)), ['patient_id', 'first_name', 'age'])
  assert.deepEqual(C.buildSuggestions('SELECT x.', 'SELECT x.', schema), [], 'unknown alias: no wrong suggestions')
})

test('keywords such as WHERE are never mistaken for an alias', () => {
  const al = C.tableAliases('SELECT * FROM patients WHERE age > 3', schema)
  assert.equal(al.where, undefined)
  assert.equal(al.patients, 'patients')
})

test('elsewhere: own tables first, each column once, then keywords and functions', () => {
  const items = C.buildSuggestions('SELECT ', 'SELECT ', schema)
  assert.deepEqual(labels(items).slice(0, 2), ['patients', 'billing'])
  assert.equal(labels(items).filter((l) => l === 'patient_id').length, 1)
  assert.ok(labels(items).includes('GROUP BY') && labels(items).includes('COUNT'))
  assert.deepEqual(labels(C.buildSuggestions('', '', {})).slice(0, 1), ['SELECT'], 'works with no schema at all')
})

test('the Explain message carries the query and what it returned, or the error', () => {
  assert.match(E.explainPrompt('SELECT 1', { success: true, rows: [{ a: 1 }], columns: ['a'], row_count: 1 }), /returned 1 row.*Columns: a.*\[\{"a":1\}\]/s)
  const err = E.explainPrompt('SELEC 1', { success: false, error: 'near "SELEC": syntax error' })
  assert.match(err, /gave an error/); assert.match(err, /syntax error/); assert.match(err, /do not just hand me/)
  assert.match(E.explainPrompt('SELECT 1', null), /explain this SQL query/i)
  assert.ok(E.explainPrompt('x'.repeat(9000), null).length < 2200, 'a huge query is clipped')
})

// ───────── backend: schema lookup and reset ─────────
const h = boot({ prefix: 'dbi-flow' })
let S, U, db
test.before(async () => {
  db = h.req('db/database'); await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  makeLearner(h, db, 'A'); makeLearner(h, db, 'B')
  S = h.req('services/sql.service'); U = h.req('services/userdb.service')
})

test('schema lookup: exercise sandboxes show the practice tables; another learner\'s database shows nothing', async () => {
  const s = await S.getSchema('A', 'ex_flow_A')
  assert.equal(s.success, true)
  assert.ok(s.tables.patients && s.tables.patients.includes('patient_id'))
  const mine = await U.createUserDatabase('A', 'Mine')
  await S.executeSQL({ sandboxId: U.sandboxIdFor(mine.database.id), userId: 'A', query: 'CREATE TABLE t(x INTEGER, y TEXT)' })
  assert.deepEqual((await S.getSchema('A', U.sandboxIdFor(mine.database.id))).tables, { t: ['x', 'y'] })
  assert.deepEqual(await S.getSchema('B', U.sandboxIdFor(mine.database.id)), { success: false, tables: {} })
  assert.deepEqual(await S.getSchema('A', undefined), { success: false, tables: {} })
})

test('Reset: closing the sandbox restores a practice table the student dropped', async () => {
  const run = (q) => S.executeSQL({ sandboxId: 'ex_reset_A', userId: 'A', query: q })
  const billing = db.getDb().prepare("SELECT table_name FROM bundled_datasets WHERE id = 'ds-hospital-billing'").get().table_name
  assert.equal((await run(`SELECT COUNT(*) c FROM ${billing}`)).success, true)
  await run(`DROP TABLE ${billing}`)
  assert.equal((await run(`SELECT COUNT(*) c FROM ${billing}`)).success, false, 'dropped for good until reset')
  S.closeSandbox('ex_reset_A') // what the Reset button does
  const back = await run(`SELECT COUNT(*) c FROM ${billing}`)
  assert.equal(back.success, true, back.error)
  assert.ok(back.rows[0].c > 0)
})

test('the screens are wired: completion registered on all three editors, Reset really resets, Explain uses a request id', () => {
  const sa = fs.readFileSync(path.join(__dirname, '..', 'src/pages/SqlAcademy.tsx'), 'utf8')
  const md = fs.readFileSync(path.join(__dirname, '..', 'src/components/sql/MyDatabases.tsx'), 'utf8')
  assert.equal((sa.match(/beforeMount=\{(prepareSqlEditor|lessonModule === 'sql' \? prepareSqlEditor : preparePythonEditor)\}/g) || []).length, 2)
  assert.match(md, /beforeMount=\{prepareSqlEditor\}/)
  assert.match(sa, /const resetExercise = async[\s\S]*closeSandbox/)
  assert.match(sa, /request=\{tutorRequest\}/)
})
