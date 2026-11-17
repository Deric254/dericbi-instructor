'use strict'
// If the safety worker cannot run at all (a packaged app, a locked-down machine), queries must still work, still
// be limited, and still save - never an error. Tested by making the worker fail to start, and then fail mid-job.
const test = require('node:test')
const assert = require('node:assert/strict')
const wt = require('node:worker_threads')
const { EventEmitter } = require('node:events')
const { boot, makeLearner } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-fallback' })
const RealWorker = wt.Worker
let S, U, I, db

test.before(async () => {
  db = h.req('db/database'); await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  makeLearner(h, db, 'U')
  S = h.req('services/sql.service'); U = h.req('services/userdb.service'); I = h.req('services/sql.isolate')
})
test.afterEach(() => { wt.Worker = RealWorker; I.resetIsolate() })

const run = (query, sandboxId = 'ex_fb_U') => S.executeSQL({ sandboxId, userId: 'U', query })

test('worker cannot start: queries, writes and grading still work in-process', async () => {
  wt.Worker = class { constructor() { throw new Error('worker_threads blocked') } }
  const r = await run('SELECT COUNT(*) c FROM patients')
  assert.equal(r.success, true, r.error); assert.ok(r.rows[0].c > 0)
  assert.equal((await run('CREATE TABLE fb(x); INSERT INTO fb VALUES (1),(2)')).success, true)
  assert.equal((await run('SELECT COUNT(*) c FROM fb')).rows[0].c, 2)
  const v = await S.validateSQLAnswer({ sandboxId: 'ex_fb_U', userQuery: 'SELECT * FROM fb', solutionQuery: 'SELECT * FROM fb', evaluationMode: 'exact' })
  assert.equal(v.correct, true)
})

test('the in-process fallback still limits a runaway result', async () => {
  wt.Worker = class { constructor() { throw new Error('blocked') } }
  const r = await run('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c) SELECT x FROM c')
  assert.equal(r.success, true)
  assert.ok(r.rows.length <= 10_000); assert.ok(r.notice || r.truncated, 'the student is told the result was cut short')
})

test('the worker dies mid-query: the student still gets an answer, and after repeated failures it is switched off', async () => {
  wt.Worker = class extends EventEmitter {
    unref() {}
    postMessage() { setImmediate(() => this.emit('error', new Error('worker crashed'))) }
    terminate() { return Promise.resolve() }
  }
  for (let i = 0; i < 4; i++) { const r = await run('SELECT COUNT(*) c FROM patients'); assert.equal(r.success, true, r.error) }
  assert.equal((await run('INSERT INTO fb VALUES (3)')).success, true)
  assert.equal((await run('SELECT COUNT(*) c FROM fb')).rows[0].c, 3)
})

test('My Databases saves still persist through the fallback', async () => {
  wt.Worker = class { constructor() { throw new Error('blocked') } }
  const c = await U.createUserDatabase('U', 'Fallback')
  const sid = U.sandboxIdFor(c.database.id)
  assert.equal((await run('CREATE TABLE k(v TEXT); INSERT INTO k VALUES ("kept")', sid)).success, true)
  S.closeSandbox(sid)
  assert.equal((await run('SELECT v FROM k', sid)).rows[0].v, 'kept')
})
