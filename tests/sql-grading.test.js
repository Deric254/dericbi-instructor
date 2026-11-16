'use strict'
// Marking a student's answer. A correct query must never be marked wrong because of something the task did not
// ask for (row order, column order, a rounding crumb), and a wrong one must say exactly HOW it differs.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, makeUser, ROOT } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-grading' })
const sql = h.req('services/sql.service')
const grade = (sandboxId, userQuery, solutionQuery) => sql.validateSQLAnswer({ sandboxId, userQuery, solutionQuery, evaluationMode: 'exact' })

test.before(async () => { await h.req('db/database').initDb(); makeUser(h.req('db/database'), 'u'); await h.req('services/setup.service').runFirstTimeSetup(() => {}) })

const cols = (...c) => c
const R = (columns, rows) => ({ columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) })

test('row order does not matter when the task did not ask for sorting', () => {
  const exp = R(['name', 'age'], [['Amina', 34], ['Brian', 41], ['Cy', 29]])
  const got = R(['name', 'age'], [['Cy', 29], ['Amina', 34], ['Brian', 41]])
  assert.equal(sql.compareAnswers(got, exp, false).correct, true)
})

test('but when the model answer sorts, the order is part of the answer - and the message says so', () => {
  const exp = R(['name'], [['a'], ['b'], ['c']])
  const r = sql.compareAnswers(R(['name'], [['c'], ['b'], ['a']]), exp, true)
  assert.equal(r.correct, false)
  assert.match(r.feedback, /right rows.*order.*ORDER BY/s)
})

test('the same columns in a different order are accepted, with a friendly note', () => {
  const r = sql.compareAnswers(R(['age', 'name'], [[34, 'Amina'], [41, 'Brian']]), R(['name', 'age'], [['Amina', 34], ['Brian', 41]]), false)
  assert.equal(r.correct, true)
  assert.match(r.feedback, /different order/)
})

test('numbers compare as numbers: 3, 3.0, "3" and tiny floating-point noise are all the same', () => {
  const exp = R(['total'], [[1234.56]])
  for (const v of [1234.56, 1234.560000000001, '1234.56', 1234.5600004]) assert.equal(sql.compareAnswers(R(['total'], [[v]]), exp, false).correct, true, String(v))
  assert.equal(sql.compareAnswers(R(['n'], [[3.0]]), R(['n'], [[3]]), false).correct, true)
  assert.equal(sql.compareAnswers(R(['total'], [[1234.6]]), exp, false).correct, false, 'a genuinely different rounding is still wrong')
})

test('NULL only matches NULL, and text is compared exactly', () => {
  assert.equal(sql.compareAnswers(R(['x'], [[null]]), R(['x'], [[null]]), false).correct, true)
  assert.equal(sql.compareAnswers(R(['x'], [[null]]), R(['x'], [['NULL ']]), false).correct, false)
  assert.equal(sql.compareAnswers(R(['x'], [['nairobi']]), R(['x'], [['Nairobi']]), false).correct, false)
})

test('wrong answers explain themselves: columns, row count, and the first differing row', () => {
  const exp = R(['name', 'age'], [['Amina', 34], ['Brian', 41]])
  let r = sql.compareAnswers(R(['name'], [['Amina'], ['Brian']]), exp, false)
  assert.match(r.feedback, /returns 1 column \(name\) but the task expects 2 \(name, age\)/)
  r = sql.compareAnswers(R(['name', 'age'], [['Amina', 34]]), exp, false)
  assert.match(r.feedback, /Expected 2 rows, got 1/); assert.match(r.feedback, /missing rows/); assert.match(r.feedback, /name = Amina, age = 34/)
  r = sql.compareAnswers(R(['name', 'age'], [['Amina', 34], ['Brian', 41], ['Cy', 1]]), exp, false)
  assert.match(r.feedback, /too many rows/)
  r = sql.compareAnswers(R(['name', 'age'], [['Amina', 34], ['Brian', 40]]), exp, false)
  assert.match(r.feedback, /number of rows matches \(2\).*Your row 2:\s+name = Brian, age = 40.*Expected row: name = Brian, age = 41/s)
})

test('duplicates count: returning a row twice is not the same as once', () => {
  assert.equal(sql.compareAnswers(R(['x'], [[1], [1]]), R(['x'], [[1], [2]]), false).correct, false)
  assert.equal(sql.compareAnswers(R(['x'], [[1], [1]]), R(['x'], [[1]]), false).correct, false)
})

test('requiresOrder only counts a real ORDER BY (not one inside text or a comment)', () => {
  assert.equal(sql.requiresOrder('SELECT a FROM t ORDER BY a'), true)
  assert.equal(sql.requiresOrder("SELECT 'order by' FROM t"), false)
  assert.equal(sql.requiresOrder('SELECT a FROM t -- order by a\n'), false)
  assert.equal(sql.requiresOrder('select a from t order\n  by a'), true)
})

test('every exercise in the SQL course: the model answer is accepted, and so is the same answer in a different row order', async () => {
  const { lessons } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sql', 'curriculum.json'), 'utf8'))
  let checked = 0, reordered = 0
  for (const l of lessons) for (const e of l.exercises || []) {
    const sol = e.solution.trim().replace(/;+\s*$/, '')
    const sb = `ex_${e.id}_u`
    const exact = await grade(sb, sol, sol)
    assert.equal(exact.correct, true, `${e.id}: ${exact.feedback}`)
    checked++
    if (!/^(select|with)\b/i.test(sol)) continue
    const rev = await grade(sb, `SELECT * FROM (${sol}) ORDER BY 1 DESC`, sol)
    // An ordered task rightly cares about order; with LIMIT, which rows are "first" depends on the order.
    if (sql.requiresOrder(sol) || /\blimit\b/i.test(sol)) continue
    assert.equal(rev.correct, true, `${e.id}: same rows in another order were marked wrong: ${rev.feedback}`)
    reordered++
  }
  assert.ok(checked >= 30 && reordered >= 10, `checked ${checked}, reordered ${reordered}`)
})

test('a query that returns no table at all gets a clear message', async () => {
  const r = await grade('ex_none_u', "UPDATE patients SET age = age WHERE 1 = 0", 'SELECT * FROM patients')
  assert.equal(r.correct, false)
  assert.match(r.feedback, /did not return a table/)
})

test('a syntax error is reported in the student\'s terms, and does not break later attempts', async () => {
  const bad = await grade('ex_syn_u', 'SELEC * FROM patients', 'SELECT * FROM patients')
  assert.equal(bad.correct, false); assert.match(bad.feedback, /Query error: .*syntax error/is)
  assert.equal((await grade('ex_syn_u', 'SELECT * FROM patients', 'SELECT * FROM patients')).correct, true)
})
