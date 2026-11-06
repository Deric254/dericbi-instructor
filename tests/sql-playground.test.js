'use strict'
// The SQL playground and exercises run on the real main-process code (Electron stubbed): datasets exist,
// every query shape runs, and every curriculum exercise can be run and then passes with its own solution.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-sql-'))
const load = Module._load
Module._load = function (req, ...r) {
  if (req === 'electron') return { app: { getPath: () => tmp, isPackaged: false, getVersion: () => '0' }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle() {} }, dialog: {}, shell: {}, BrowserWindow: class {} }
  if (req === 'xlsx') return {}
  return load.call(this, req, ...r)
}
const req = (p) => require(path.join(__dirname, '..', 'dist-electron', p))
let db, S
const run = (sandboxId, query) => S.executeSQL({ sandboxId, query, userId: 'nobody' })

test.before(async () => {
  db = req('db/database'); await db.initDb()
  await req('services/setup.service').runFirstTimeSetup(() => {})
  S = req('services/sql.service')
})

test('all four bundled datasets load and have rows', async () => {
  const sets = db.getDb().prepare('SELECT id, table_name FROM bundled_datasets').all()
  assert.ok(sets.length >= 4)
  for (const ds of sets) {
    assert.equal((await S.loadBundledDataset('pg', ds.id)).success, true, ds.id)
    const r = await run('pg', `-- Dataset: ${ds.id}\nSELECT * FROM ${ds.table_name} LIMIT 5;`)
    assert.equal(r.row_count, 5, `${ds.table_name}: ${r.error}`)
  }
})

test('queries behave like a SQL console: comments, multiple statements, writes, errors', async () => {
  assert.equal((await run('ex_t_u', '/* note */ select count(*) c from billing')).rows[0].c > 0, true)
  assert.equal((await run('ex_t_u', 'SELECT 1 a; SELECT 2 b;')).rows[0].b, 2)
  assert.equal((await run('ex_t_u', 'CREATE TABLE t(a); INSERT INTO t VALUES (1),(2);')).affected_rows, 2)
  assert.equal((await run('ex_t_u', '-- nothing')).success, false)
  assert.match((await run('ex_t_u', 'SELEC 1')).error, /syntax error/)
})

test('every SQL exercise can be run first and is then accepted with its solution', async () => {
  const ex = db.getDb().prepare("SELECT id, solution, evaluation_mode FROM exercises WHERE exercise_type = 'sql_query'").all()
  assert.ok(ex.length >= 30)
  for (const e of ex) {
    const ran = await run(`ex_${e.id}_u`, e.solution)
    assert.equal(ran.success, true, `${e.id} run: ${ran.error}`)
    const v = await S.validateSQLAnswer({ sandboxId: `ex_${e.id}_v`, userQuery: e.solution, solutionQuery: e.solution, evaluationMode: e.evaluation_mode })
    assert.equal(v.correct, true, `${e.id}: ${v.feedback}`)
  }
})
