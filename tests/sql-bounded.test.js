'use strict'
// A beginner's endless recursive query or forgotten JOIN used to use all the memory and crash the whole app
// (verified: "WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c) SELECT n FROM c" aborted the process).
// Queries are now read row by row and cut short. These tests prove (1) normal queries behave EXACTLY as before
// (compared against sql.js's own exec on many statements) and (2) runaway queries are stopped with a clear message.
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, makeUser } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-bounded' })
const sqlSvc = h.req('services/sql.service')
let SQL, db

test.before(async () => {
  await h.req('db/database').initDb()
  makeUser(h.req('db/database'), 'u')
  SQL = await sqlSvc.getSqlJs()
  db = new SQL.Database()
  db.exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL);
           INSERT INTO t (name, score) VALUES ('a', 1.5), ('b', NULL), ('c', 3);
           CREATE TABLE empty (x INTEGER);`)
})

const CASES = [
  'SELECT * FROM t', 'SELECT * FROM empty', 'SELECT 1; SELECT 2', 'SELECT 1; CREATE TABLE z (a); SELECT 3',
  "INSERT INTO t (name) VALUES ('d')", 'UPDATE t SET score = 0 WHERE id = 1', 'DELETE FROM t WHERE id = 99',
  'CREATE TABLE q (a)', 'SELECT name, COUNT(*) c FROM t GROUP BY name ORDER BY name', 'PRAGMA table_info(t)',
  'WITH x AS (SELECT 1 a UNION ALL SELECT 2) SELECT * FROM x', 'SELECT NULL, 1.5, \'txt\', x\'ff\'', '-- just a comment', '',
  'SELECT * FROM t WHERE id = -1', 'EXPLAIN SELECT 1', 'SELECT 1;;; SELECT 2;',
]
for (const q of CASES) {
  test(`same answer as sql.js exec: ${JSON.stringify(q).slice(0, 60)}`, () => {
    const a = new SQL.Database(db.export()); const b = new SQL.Database(db.export())
    const expected = a.exec(q)
    const got = sqlSvc.execBounded(b, q).map(({ columns, values }) => ({ columns, values }))
    assert.deepEqual(got, expected)
    assert.deepEqual(b.exec('SELECT * FROM t'), a.exec('SELECT * FROM t'), 'the data changed identically')
  })
}

test('errors behave the same: earlier statements ran, the error text is sql.js\'s own', () => {
  const a = new SQL.Database(db.export()); const b = new SQL.Database(db.export())
  let e1, e2
  try { a.exec("INSERT INTO t (name) VALUES ('x'); SELEC 1") } catch (e) { e1 = e.message }
  try { sqlSvc.execBounded(b, "INSERT INTO t (name) VALUES ('x'); SELEC 1") } catch (e) { e2 = e.message }
  assert.equal(e2, e1)
  assert.deepEqual(b.exec('SELECT COUNT(*) FROM t'), a.exec('SELECT COUNT(*) FROM t'))
})

test('a query with an endless recursion is stopped by the time limit instead of crashing the app', async () => {
  const t0 = Date.now()
  const sets = sqlSvc.execBounded(db, 'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c) SELECT n FROM c', { maxRows: 10_000_000, maxMs: 300 })
  assert.equal(sets[0].truncated, 'time')
  assert.ok(Date.now() - t0 < 3000)
})

test('an enormous result is cut at the row limit, and the student is told', async () => {
  const r = await sqlSvc.executeSQL({ sandboxId: 'playground_u', userId: 'u', query: 'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 50000) SELECT n FROM c' })
  assert.equal(r.success, true)
  assert.equal(r.row_count, sqlSvc.MAX_RESULT_ROWS)
  assert.equal(r.truncated, true)
  assert.match(r.notice, /first 10,000 rows.*missing JOIN/s)
})

test('the endless-recursion query that used to abort the process now returns normally (checked in a separate process)', () => {
  const { spawnSync } = require('node:child_process')
  const code = `
    const { boot, makeUser } = require(${JSON.stringify(require('node:path').join(__dirname, 'helpers', 'harness'))})
    ;(async () => {
      const h = boot({ prefix: 'dbi-endless' }); const d = h.req('db/database'); await d.initDb(); makeUser(d, 'u')
      const r = await h.req('services/sql.service').executeSQL({ sandboxId: 'p_u', userId: 'u', query: 'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c) SELECT n FROM c' })
      console.log(JSON.stringify({ ok: r.success, rows: r.row_count, truncated: r.truncated }))
    })()`
  const r = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', code], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(r.status, 0, (r.stderr || '').slice(-300))
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), { ok: true, rows: 10000, truncated: true })
})

test('an exercise answer that runs away is graded as an error, not a crash', async () => {
  const r = await sqlSvc.validateSQLAnswer({
    sandboxId: 'ex_runaway_u', userId: 'u', exerciseId: 'x', evaluationMode: 'exact',
    userQuery: 'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c) SELECT n FROM c',
    solutionQuery: 'SELECT 1',
  })
  assert.equal(r.correct, false)
  assert.match(r.feedback, /too many rows|too long/i)
})
