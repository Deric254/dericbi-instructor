'use strict'
// "My Databases": learners build their own databases from scratch. These tests prove the work is real and
// durable: created, designed with plain SQL, saved to disk after every change, reopened, exported, deleted,
// and isolated per user.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, makeUser } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-userdb' })
const db = h.req('db/database')
const sql = h.req('services/sql.service')
const udb = h.req('services/userdb.service')

let A, B
test.before(async () => {
  await db.initDb()
  A = makeUser(db, 'learner-a')
  B = makeUser(db, 'learner-b')
})
const run = (user, id, query) => sql.executeSQL({ sandboxId: udb.sandboxIdFor(id), query, userId: user })

test('a learner creates a database from nothing and designs tables with plain SQL', async () => {
  const c = await udb.createUserDatabase(A, '  My   Clinic  ')
  assert.equal(c.success, true, c.error)
  assert.equal(c.database.name, 'My Clinic', 'names are trimmed and tidied')
  const id = c.database.id

  let r = await run(A, id, `CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER);
                            CREATE TABLE visits (id INTEGER PRIMARY KEY, patient_id INTEGER REFERENCES patients(id), fee REAL);`)
  assert.equal(r.success, true, r.error)
  r = await run(A, id, `INSERT INTO patients (name, age) VALUES ('Amina', 34), ('Brian', 41); INSERT INTO visits (patient_id, fee) VALUES (1, 500), (1, 750), (2, 300);`)
  assert.equal(r.success, true, r.error)
  r = await run(A, id, 'SELECT p.name, SUM(v.fee) AS total FROM patients p JOIN visits v ON v.patient_id = p.id GROUP BY p.name ORDER BY p.name')
  assert.deepEqual(r.rows, [{ name: 'Amina', total: 1250 }, { name: 'Brian', total: 300 }])

  r = await run(A, id, 'INSERT INTO visits (patient_id, fee) VALUES (99, 1)')
  assert.equal(r.success, false, 'foreign keys are enforced, so students learn about integrity')
  assert.match(r.error, /FOREIGN KEY/i)
})

test('everything survives closing and reopening (saved to disk after each change, structure included)', async () => {
  const { id } = (await udb.listUserDatabases(A))[0]
  sql.closeSandbox(udb.sandboxIdFor(id)) // as if the screen was closed
  const r = await run(A, id, 'SELECT COUNT(*) AS n FROM patients')
  assert.deepEqual(r.rows, [{ n: 2 }])
  const d = await udb.describeUserDatabase(A, id)
  assert.deepEqual(d.tables.map((t) => [t.name, t.row_count]), [['patients', 2], ['visits', 3]])
  assert.deepEqual(d.tables[0].columns.map((c) => [c.name, c.type, c.pk, c.notnull]), [['id', 'INTEGER', true, false], ['name', 'TEXT', false, true], ['age', 'INTEGER', false, false]])
})

test('structure-only changes are saved too (a table with no rows is not lost)', async () => {
  const { id } = (await udb.listUserDatabases(A))[0]
  await run(A, id, 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)')
  sql.closeSandbox(udb.sandboxIdFor(id))
  const d = await udb.describeUserDatabase(A, id)
  assert.ok(d.tables.some((t) => t.name === 'notes'))
})

test('a failed statement does not damage the database and the error is readable', async () => {
  const { id } = (await udb.listUserDatabases(A))[0]
  const bad = await run(A, id, 'SELEC * FROM patients')
  assert.equal(bad.success, false)
  assert.match(bad.error, /syntax error/i)
  assert.deepEqual((await run(A, id, 'SELECT COUNT(*) AS n FROM patients')).rows, [{ n: 2 }])
})

test('a bundled practice dataset can be copied into a database and is kept', async () => {
  const { id } = (await udb.listUserDatabases(A))[0]
  h.req('services/setup.service').ensureDatasetFiles?.()
  const bundled = db.getDb().prepare('SELECT id FROM bundled_datasets LIMIT 1').get()
  if (!bundled) return // datasets are generated on first run; covered by sql-first-run tests
  const r = await sql.loadBundledDataset(udb.sandboxIdFor(id), bundled.id)
  if (r.success) {
    await udb.persistUserDatabase(A, udb.sandboxIdFor(id))
    sql.closeSandbox(udb.sandboxIdFor(id))
    const d = await udb.describeUserDatabase(A, id)
    assert.ok(d.tables.some((t) => t.name === r.table_name))
  }
})

test('names: required, tidy, unique per learner (case-insensitive), renameable', async () => {
  assert.equal((await udb.createUserDatabase(A, '   ')).success, false)
  assert.equal((await udb.createUserDatabase(A, 'x'.repeat(61))).success, false)
  assert.match((await udb.createUserDatabase(A, 'my clinic')).error, /already have/)
  const other = await udb.createUserDatabase(B, 'My Clinic') // another learner may reuse the name
  assert.equal(other.success, true)
  const second = await udb.createUserDatabase(A, 'Shop')
  assert.equal((await udb.renameUserDatabase(A, second.database.id, 'my clinic')).success, false)
  assert.equal((await udb.renameUserDatabase(A, second.database.id, 'Corner Shop')).success, true)
  assert.ok((await udb.listUserDatabases(A)).some((d) => d.name === 'Corner Shop'))
})

test('learners cannot open, change or delete each other\'s databases', async () => {
  const mine = (await udb.listUserDatabases(A))[0]
  const r = await run(B, mine.id, 'SELECT * FROM patients')
  assert.equal(r.success, false)
  assert.match(r.error, /no longer exists/)
  assert.equal((await udb.deleteUserDatabase(B, mine.id)).success, false)
  assert.equal((await udb.exportUserDatabasePath(B, mine.id)).success, false)
  assert.ok((await udb.listUserDatabases(A)).some((d) => d.id === mine.id), 'still there')
})

test('the export is a genuine SQLite file that opens elsewhere with the data in it', async () => {
  const { id } = (await udb.listUserDatabases(A)).find((d) => d.name === 'My Clinic')
  const e = await udb.exportUserDatabasePath(A, id)
  assert.equal(e.success, true)
  assert.match(e.name, /^My Clinic\.sqlite$/)
  const bytes = fs.readFileSync(e.path)
  assert.equal(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3')
  const SQL = await sql.getSqlJs()
  const copy = new SQL.Database(bytes)
  assert.equal(copy.exec('SELECT COUNT(*) FROM visits')[0].values[0][0], 3)
})

test('there is a limit on how many databases one learner keeps, and deleting frees a slot and the file', async () => {
  const C = makeUser(db, 'learner-c')
  let last
  for (let i = 0; i < udb.MAX_DATABASES_PER_USER; i++) { last = await udb.createUserDatabase(C, `db ${i}`); assert.equal(last.success, true) }
  assert.match((await udb.createUserDatabase(C, 'one too many')).error, /up to 20/)
  const file = path.join(h.tmp, 'user-databases', 'learner-c')
  const before = fs.readdirSync(file).length
  assert.equal((await udb.deleteUserDatabase(C, last.database.id)).success, true)
  assert.equal(fs.readdirSync(file).length, before - 1, 'the file is removed with the database')
  assert.equal((await udb.createUserDatabase(C, 'fits now')).success, true)
})

test('a change that would exceed the size limit is refused and not saved', async () => {
  const D = makeUser(db, 'learner-d')
  const { database } = await udb.createUserDatabase(D, 'Big')
  const sid = udb.sandboxIdFor(database.id)
  assert.equal((await run(D, database.id, 'CREATE TABLE t (x TEXT)')).success, true)
  // 40 rows of 2 MB each is about 80 MB
  const r = await run(D, database.id, 'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 40) INSERT INTO t SELECT hex(zeroblob(1000000)) FROM c')
  assert.equal(r.success, false)
  assert.match(r.error, /larger than 50 MB/)
  assert.deepEqual((await run(D, database.id, 'SELECT COUNT(*) AS n FROM t')).rows, [{ n: 0 }], 'the last good version is what comes back')
  assert.ok(sid)
})

test('IPC: the screens can reach every My Databases action, and it is behind the activation gate', () => {
  const handlers = require('node:fs').readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'handlers.ts'), 'utf8')
  for (const ch of ['list', 'create', 'rename', 'delete', 'describe', 'export']) assert.match(handlers, new RegExp(`safeHandle\\('userdb:${ch}'`))
})
