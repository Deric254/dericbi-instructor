'use strict'
// Speed budgets. Generous (several times what is measured on a plain CI machine) so they never flake, but tight
// enough to catch a real slowdown: anything that makes the app feel slow fails here first.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, makeLearner } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-perf' })
const now = () => performance.now()
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
let S, P, db

test('the database opens and the first-time setup finishes quickly', async () => {
  let t = now(); db = h.req('db/database'); await db.initDb(); const open = now() - t
  t = now(); await h.req('services/setup.service').runFirstTimeSetup(() => {}); const setup = now() - t
  assert.ok(open < 2000, `open ${open.toFixed(0)}ms`)
  assert.ok(setup < 5000, `first-time setup ${setup.toFixed(0)}ms`)
  makeLearner(h, db, 'U')
  S = h.req('services/sql.service'); P = h.req('services/progress.service')
})

test('everyday queries answer in a blink, including through the safety worker', async () => {
  const run = async (q) => { const t = now(); const r = await S.executeSQL({ sandboxId: 'ex_perf_U', userId: 'U', query: q }); assert.equal(r.success, true, r.error); return now() - t }
  const first = await run('SELECT COUNT(*) FROM patients') // loads the practice tables
  assert.ok(first < 2000, `first query ${first.toFixed(0)}ms`)
  const times = []; for (let i = 0; i < 15; i++) times.push(await run('SELECT * FROM patients LIMIT 20'))
  assert.ok(median(times) < 100, `median ${median(times).toFixed(1)}ms`)
  const heavy = await run('SELECT diagnosis, COUNT(*) c FROM patients GROUP BY diagnosis ORDER BY c DESC')
  assert.ok(heavy < 500, `group-by ${heavy.toFixed(0)}ms`)
})

test('grading an answer is fast', async () => {
  const times = []
  for (let i = 0; i < 5; i++) {
    const t = now()
    const v = await S.validateSQLAnswer({ sandboxId: 'ex_perf_U', userQuery: 'SELECT * FROM patients LIMIT 50', solutionQuery: 'SELECT * FROM patients LIMIT 50', evaluationMode: 'exact' })
    assert.equal(v.correct, true); times.push(now() - t)
  }
  assert.ok(median(times) < 200, `grading median ${median(times).toFixed(1)}ms`)
})

test('a large result (200,000 rows) still returns quickly and is capped for the screen', async () => {
  const SQL = await S.getSqlJs(); const d = new SQL.Database()
  d.run('create table big(id integer primary key, a text); with recursive c(x) as (select 1 union all select x+1 from c where x<200000) insert into big select x, hex(randomblob(8)) from c;')
  d.run('PRAGMA foreign_keys=ON'); S.registerSandbox('ex_perf_big', d)
  const t = now(); const r = await S.executeSQL({ sandboxId: 'ex_perf_big', userId: 'U', query: 'SELECT * FROM big' }); const ms = now() - t
  assert.equal(r.success, true); assert.ok(r.rows.length <= 10_000, 'rows are capped'); assert.ok(ms < 1500, `${ms.toFixed(0)}ms`)
  const t2 = now(); await S.executeSQL({ sandboxId: 'ex_perf_big', userId: 'U', query: 'SELECT COUNT(*) FROM big' }); assert.ok(now() - t2 < 1000, 'count over 200k rows')
})

test('the dashboard (with streak, progress and review) loads fast even for a busy learner', () => {
  const g = db.getDb()
  g.run?.('BEGIN')
  const ex = g.prepare("SELECT id FROM exercises LIMIT 1").get().id
  for (let i = 0; i < 2000; i++) g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, attempted_at) VALUES (?, 'U', ?, 'x', ?, datetime('now', ?))").run('p' + i, ex, i % 2, `-${i % 300} days`)
  g.run?.('COMMIT')
  const t = now(); for (let i = 0; i < 10; i++) P.getDashboardStats('U'); const per = (now() - t) / 10
  assert.ok(per < 100, `dashboard ${per.toFixed(1)}ms each`)
})

test('a long result is drawn in steps so the window never freezes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/components/sql/ResultsGrid.tsx'), 'utf8')
  assert.ok(Number(src.match(/FIRST_ROWS = (\d+)/)[1]) <= 500)
  for (const f of ['src/pages/SqlAcademy.tsx', 'src/components/sql/MyDatabases.tsx']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    assert.match(s, /<ResultsGrid /); assert.doesNotMatch(s, /result\.rows!?\.map|rows\.map\(\(row, i\)/, `${f} must not draw every row itself`)
  }
})
