'use strict'
// SQL Playground + data loading, proven against the real SQL service.
//
// These tests exist because of two real failures students hit:
//   1. "I ran SQL and no data came back" - the Playground's own pre-filled query starts with a comment.
//   2. Numbers behaved like text (`age > 60` was wrong) because every column was stored as TEXT.
// Every assertion about data compares the SQL answer with the answer computed straight from the CSV file.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Papa = require('papaparse')
const XLSX = require('xlsx')
const { boot, makeUser, src } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-sqldata' })
const UID = 'user-sql'
let db, S

const run = (sandboxId, query) => S.executeSQL({ sandboxId, query, userId: UID })
const csvRows = (file) =>
  Papa.parse(fs.readFileSync(path.join(h.datasetsDir, file), 'utf8'), { header: true, skipEmptyLines: true, dynamicTyping: true }).data
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`)

const DATASETS = {
  'ds-hospital-patients': { table: 'patients', file: 'hospital_patients.csv' },
  'ds-hospital-billing': { table: 'billing', file: 'hospital_billing.csv' },
  'ds-sales': { table: 'sales', file: 'sales_transactions.csv' },
  'ds-hr': { table: 'employees', file: 'hr_employees.csv' },
  // Data Engineering academy
  'ds-de-customers': { table: 'customers', file: 'de_customers.csv' },
  'ds-de-orders': { table: 'orders', file: 'de_orders.csv' },
  'ds-de-raw-events': { table: 'raw_events', file: 'de_raw_events.csv' },
  'ds-de-pipeline-runs': { table: 'pipeline_runs', file: 'de_pipeline_runs.csv' },
  'ds-de-ml-features': { table: 'ml_features', file: 'de_ml_features.csv' },
  'ds-de-messy-contacts': { table: 'messy_contacts', file: 'de_messy_contacts.csv' },
  'ds-de-llm-requests': { table: 'llm_requests', file: 'de_llm_requests.csv' },
}

test.before(async () => {
  db = h.req('db/database')
  await db.initDb()
  makeUser(db, UID)
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  S = h.req('services/sql.service')
})

// ───────────────────────── the data is there ─────────────────────────

test('first-time setup writes the practice files and registers each one', () => {
  const registered = db.getDb().prepare('SELECT * FROM bundled_datasets').all()
  assert.deepEqual(registered.map((d) => d.id).sort(), Object.keys(DATASETS).sort())
  for (const d of registered) {
    const spec = DATASETS[d.id]
    assert.equal(d.table_name, spec.table, d.id)
    const file = path.join(h.datasetsDir, d.file_path)
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 100, `${d.file_path} should exist and not be empty`)
    const header = fs.readFileSync(file, 'utf8').split('\n')[0].split(',')
    assert.deepEqual(header, JSON.parse(d.column_info).map((c) => c.name), `${d.id}: file header must match the registered columns`)
    assert.equal(csvRows(d.file_path).length, d.row_count, `${d.id}: registered row_count must match the file`)
  }
})

test('every bundled dataset loads with ALL its rows and ALL its columns', async () => {
  for (const [id, spec] of Object.entries(DATASETS)) {
    const sandbox = `load_${id}`
    const loaded = await S.loadBundledDataset(sandbox, id)
    assert.equal(loaded.success, true, `${id}: ${loaded.error}`)
    assert.equal(loaded.table_name, spec.table)

    const expected = csvRows(spec.file)
    const count = await run(sandbox, `SELECT COUNT(*) AS n FROM ${spec.table}`)
    assert.equal(count.rows[0].n, expected.length, `${id}: row count`)

    const cols = await run(sandbox, `PRAGMA table_info(${spec.table})`)
    assert.deepEqual(cols.rows.map((c) => c.name), Object.keys(expected[0]), `${id}: columns`)
  }
})

test('loading an unknown dataset gives a clear error instead of an empty table', async () => {
  const r = await S.loadBundledDataset('x', 'ds-does-not-exist')
  assert.equal(r.success, false)
  assert.match(r.error, /not found/i)
})

// ───────────────────────── the Playground itself ─────────────────────────

test('REGRESSION: the Playground opens with data - its pre-filled query (which starts with a comment) returns rows', async () => {
  // Read the literal from the real page so this test follows the UI if the text ever changes.
  const page = src('src/pages/SqlAcademy.tsx')
  const m = page.match(/useState\('(-- Write your SQL here[^']*)'\)/)
  assert.ok(m, 'could not find the Playground default query in SqlAcademy.tsx - update this test if it moved')
  const defaultQuery = m[1].replace(/\\n/g, '\n')
  assert.match(defaultQuery.trim(), /^--/, 'this regression only matters while the default query starts with a comment')

  await S.loadBundledDataset('pg-open', 'ds-hospital-patients') // the page auto-loads the Patients dataset
  const r = await run('pg-open', defaultQuery)
  assert.equal(r.success, true, r.error)
  assert.ok(r.row_count > 0, 'the grid must show rows, not an empty result')
  assert.ok(r.columns.includes('patient_id'))
})

test('REGRESSION: clicking any dataset in the Playground shows its rows (the generated query also starts with comments)', async () => {
  const page = src('src/pages/SqlAcademy.tsx')
  const m = page.match(/setQuery\(`(-- Dataset:[^`]*)`\)/)
  assert.ok(m, 'could not find the dataset-click query template in SqlAcademy.tsx')
  for (const ds of db.getDb().prepare('SELECT id, name, table_name FROM bundled_datasets').all()) {
    const query = m[1].replace(/\\n/g, '\n').replace(/\$\{ds\.name\}/g, ds.name).replace(/\$\{ds\.table_name\}/g, ds.table_name)
    assert.ok(query.startsWith('--'))
    assert.equal((await S.loadBundledDataset('pg-click', ds.id)).success, true)
    const r = await run('pg-click', query)
    assert.equal(r.success, true, `${ds.id}: ${r.error}`)
    assert.ok(r.row_count > 0, `${ds.id}: expected rows`)
  }
})

test('the console behaves like a real SQL console: comments, multiple statements, writes, errors', async () => {
  await S.loadBundledDataset('con', 'ds-hospital-billing')

  assert.ok((await run('con', '/* note */ select count(*) c from billing')).rows[0].c > 0, 'block comment first')
  assert.ok((await run('con', '-- a\n-- b\n   \n SELECT 1 AS one')).rows[0].one === 1, 'several comment lines first')
  assert.equal((await run('con', 'WITH t AS (SELECT 5 v) SELECT v FROM t;')).rows[0].v, 5, 'CTE')
  assert.equal((await run('con', 'SELECT 1 a; SELECT 2 b;')).rows[0].b, 2, 'shows the LAST result set')

  const write = await run('con', 'CREATE TABLE scratch(a); INSERT INTO scratch VALUES (1),(2),(3);')
  assert.equal(write.success, true, write.error)
  assert.equal(write.affected_rows, 3)
  assert.equal((await run('con', 'SELECT COUNT(*) c FROM scratch')).rows[0].c, 3)
  const read = await run('con', 'SELECT * FROM scratch')
  assert.equal(read.affected_rows, 0, 'a SELECT must not report leftover "rows changed" from an earlier write')

  const none = await run('con', 'SELECT * FROM scratch WHERE a > 100')
  assert.equal(none.success, true)
  assert.equal(none.row_count, 0)
})

test('mistakes produce readable errors, never a crash or a fake empty result', async () => {
  await S.loadBundledDataset('err', 'ds-hospital-patients')
  assert.match((await run('err', 'SELEC * FROM patients')).error, /syntax error/i)
  assert.match((await run('err', 'SELECT * FROM no_such_table')).error, /no such table: no_such_table/i)
  assert.match((await run('err', 'SELECT nope FROM patients')).error, /no such column: nope/i)

  for (const empty of ['', '   ', '-- only a comment', '/* only a comment */']) {
    const r = await run('err', empty)
    assert.equal(r.success, false, JSON.stringify(empty))
    assert.match(r.error, /nothing to run/i)
  }
  const drop = await run('err', '-- sneaky\nDROP DATABASE main')
  assert.equal(drop.success, false)
  assert.match(drop.error, /not permitted/i)
})

test('query history records successes and failures, and never breaks a query itself', async () => {
  const before = db.getDb().prepare('SELECT COUNT(*) c FROM sql_query_history WHERE user_id = ?').get(UID).c
  await run('hist', 'SELECT 1')
  await run('hist', 'SELECT * FROM missing_table')
  const rows = db.getDb().prepare('SELECT query, success, error_msg FROM sql_query_history WHERE user_id = ? ORDER BY executed_at, rowid').all(UID)
  assert.equal(rows.length, before + 2)
  assert.deepEqual(rows.slice(-2).map((r) => r.success), [1, 0])
  assert.match(rows.at(-1).error_msg, /missing_table/)

  // A user id with no matching row makes the history insert fail - the query itself must still succeed.
  const orphan = await S.executeSQL({ sandboxId: 'hist', query: 'SELECT 42 AS answer', userId: 'ghost-user' })
  assert.equal(orphan.success, true)
  assert.equal(orphan.rows[0].answer, 42)
})

test('sandboxes are isolated from each other and from the app database', async () => {
  await run('iso-a', 'CREATE TABLE only_in_a(x); INSERT INTO only_in_a VALUES (1);')
  assert.equal((await run('iso-a', 'SELECT COUNT(*) c FROM only_in_a')).rows[0].c, 1)
  assert.match((await run('iso-b', 'SELECT * FROM only_in_a')).error, /no such table/i)
  assert.match((await run('iso-b', 'SELECT * FROM users')).error, /no such table/i, 'the app database (users, api keys) is not reachable from SQL')

  S.closeSandbox('iso-a')
  assert.match((await run('iso-a', 'SELECT * FROM only_in_a')).error, /no such table/i, 'a closed sandbox starts clean')
})

// ───────────────────────── the answers are RIGHT ─────────────────────────

test('numbers behave as numbers: comparisons, sorting and types match the CSV', async () => {
  await S.loadBundledDataset('num', 'ds-hospital-patients')
  const patients = csvRows('hospital_patients.csv')

  assert.equal((await run('num', 'SELECT typeof(age) t FROM patients LIMIT 1')).rows[0].t, 'integer')
  assert.equal((await run('num', 'SELECT COUNT(*) n FROM patients WHERE age > 60')).rows[0].n, patients.filter((p) => p.age > 60).length,
    'age > 60 must compare numbers (as text, "7" > "60")')
  assert.equal((await run('num', 'SELECT COUNT(*) n FROM patients WHERE age BETWEEN 5 AND 18')).rows[0].n, patients.filter((p) => p.age >= 5 && p.age <= 18).length)

  const top = await run('num', 'SELECT age FROM patients ORDER BY age DESC LIMIT 3')
  assert.deepEqual(top.rows.map((r) => r.age), patients.map((p) => p.age).sort((a, b) => b - a).slice(0, 3), 'ORDER BY age must sort numerically')
  assert.equal((await run('num', 'SELECT MAX(age) m, MIN(age) n FROM patients')).rows[0].m, Math.max(...patients.map((p) => p.age)))

  // Text columns stay text, dates stay sortable ISO strings.
  assert.equal((await run('num', 'SELECT typeof(ward) t, typeof(admission_date) d FROM patients LIMIT 1')).rows[0].d, 'text')
})

test('hospital data: still-admitted patients exist (NULL discharge) and joins line up', async () => {
  await S.loadBundledDataset('hosp', 'ds-hospital-patients')
  await S.loadBundledDataset('hosp', 'ds-hospital-billing')
  const patients = csvRows('hospital_patients.csv')
  const billing = csvRows('hospital_billing.csv')

  const stillIn = patients.filter((p) => p.discharge_date === null || p.discharge_date === '').length
  assert.ok(stillIn > 0, 'there must be patients with no discharge date, or every "still admitted" exercise returns nothing')
  assert.equal((await run('hosp', 'SELECT COUNT(*) n FROM patients WHERE discharge_date IS NULL')).rows[0].n, stillIn)

  const joined = await run('hosp', 'SELECT COUNT(*) n FROM billing b JOIN patients p ON p.patient_id = b.patient_id')
  assert.equal(joined.rows[0].n, billing.length, 'every bill must belong to an existing patient')

  approx((await run('hosp', 'SELECT SUM(bill_amount) s FROM billing')).rows[0].s, sum(billing.map((b) => b.bill_amount)), 'SUM(bill_amount)')
  approx((await run('hosp', 'SELECT AVG(insurance_covered) a FROM billing')).rows[0].a, sum(billing.map((b) => b.insurance_covered)) / billing.length, 'AVG(insurance_covered)')
})

test('sales data: revenue = quantity x unit price, and GROUP BY totals match the file', async () => {
  await S.loadBundledDataset('sales', 'ds-sales')
  const sales = csvRows('sales_transactions.csv')
  assert.equal((await run('sales', 'SELECT COUNT(*) n FROM sales WHERE revenue <> quantity * unit_price')).rows[0].n, 0)

  const byRegion = {}
  for (const s of sales) byRegion[s.region] = (byRegion[s.region] || 0) + s.revenue
  const got = await run('sales', 'SELECT region, SUM(revenue) total FROM sales GROUP BY region ORDER BY region')
  assert.deepEqual(got.rows.map((r) => r.region), Object.keys(byRegion).sort())
  for (const r of got.rows) approx(r.total, byRegion[r.region], `revenue for ${r.region}`)

  // Window functions (taught in the SQL course) work in the bundled SQLite build.
  const win = await run('sales', 'SELECT region, SUM(revenue) t, RANK() OVER (ORDER BY SUM(revenue) DESC) rk FROM sales GROUP BY region ORDER BY rk')
  assert.equal(win.rows[0].rk, 1)
  assert.equal(win.rows[0].region, Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0][0])
})

test('HR data: salary filters and attrition counts match the file', async () => {
  await S.loadBundledDataset('hr', 'ds-hr')
  const emp = csvRows('hr_employees.csv')
  assert.equal((await run('hr', 'SELECT COUNT(*) n FROM employees WHERE salary >= 100000')).rows[0].n, emp.filter((e) => e.salary >= 100000).length)
  assert.equal((await run('hr', "SELECT COUNT(*) n FROM employees WHERE attrition = 'Yes'")).rows[0].n, emp.filter((e) => e.attrition === 'Yes').length)
  approx((await run('hr', 'SELECT AVG(salary) a FROM employees')).rows[0].a, sum(emp.map((e) => e.salary)) / emp.length, 'AVG(salary)')
})

// ───────────────────────── exercise sandboxes ─────────────────────────

test('an exercise sandbox has the hospital tables the first time Run is pressed', async () => {
  const r = await run('ex_fresh_u', 'SELECT COUNT(*) AS n FROM patients')
  assert.equal(r.success, true, r.error)
  assert.ok(r.rows[0].n > 0)
  const j = await run('ex_fresh_u', 'SELECT COUNT(*) AS n FROM billing')
  assert.ok(j.rows[0].n > 0)
  // Re-running in the same sandbox must not duplicate the data.
  const again = await run('ex_fresh_u', 'SELECT COUNT(*) AS n FROM patients')
  assert.equal(again.rows[0].n, r.rows[0].n)
})

test('every SQL exercise\'s own solution returns data (an empty "correct" answer would accept ANY empty result)', async () => {
  const exercises = db.getDb().prepare("SELECT id, solution FROM exercises WHERE exercise_type = 'sql_query'").all()
  assert.ok(exercises.length >= 30)
  const empty = []
  for (const ex of exercises) {
    const r = await run(`ex_${ex.id}_u`, ex.solution)
    assert.equal(r.success, true, `${ex.id}: ${r.error}`)
    if (r.row_count === 0) empty.push(ex.id)
  }
  assert.deepEqual(empty, [], 'these exercises have a solution that shows no rows on the practice data, so they cannot teach or grade anything')
})

test('SELF-HEALING: if a practice file disappears, it is recreated instead of failing with "File not found"', async () => {
  const file = path.join(h.datasetsDir, 'hospital_patients.csv')
  fs.rmSync(file)
  const r = await S.loadBundledDataset('heal', 'ds-hospital-patients')
  assert.equal(r.success, true, r.error)
  assert.ok(fs.existsSync(file), 'the file should have been regenerated')
  assert.ok((await run('heal', 'SELECT COUNT(*) n FROM patients')).rows[0].n > 0)
})

// ───────────────────────── importing the student's own files ─────────────────────────

const writeFile = (name, text) => { const p = path.join(h.tmp, name); fs.writeFileSync(p, text); return p }

test('import a CSV: profiled correctly (rows, nulls, duplicates), typed, queryable', async () => {
  const file = writeFile('clients.csv', 'id,name,score,city\n1,Ann,10.5,Nairobi\n2,Bob,,Mombasa\n3,Cy,7,\n3,Cy,7,\n')
  const r = await S.importFile(UID, file, 'clients.csv')
  assert.equal(r.success, true, r.error)
  assert.equal(r.profile.row_count, 4)
  assert.equal(r.profile.column_count, 4)
  assert.equal(r.profile.duplicate_rows, 1, 'the repeated "3,Cy,7," row must be reported as a duplicate')
  assert.ok(r.profile.issues.some((i) => /duplicate/i.test(i)))
  assert.ok(r.profile.issues.some((i) => /"city".*50%/.test(i)), 'city is half empty')
  assert.ok(r.profile.quality_score < 100)

  const stored = db.getDb().prepare('SELECT * FROM imported_datasets WHERE id = ?').get(r.dataset.id)
  assert.equal(stored.row_count, 4)
  assert.equal(stored.file_type, 'csv')

  const loaded = await S.loadImportedDataset('imp-csv', UID, r.dataset.id)
  assert.equal(loaded.success, true, loaded.error)
  const q = await run('imp-csv', `SELECT AVG(score) a, typeof(score) t FROM ${loaded.table_name} WHERE score IS NOT NULL`)
  approx(q.rows[0].a, (10.5 + 7 + 7) / 3, 'AVG(score)')
  assert.equal(q.rows[0].t, 'real')
})

test('import an Excel workbook (.xlsx): first sheet, numbers stay numbers', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Product', 'Units', 'Price'], ['Pen', 10, 1.5], ['Book', 3, 12], ['Bag', 7, 30.25]]), 'Sales')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ignored'], [1]]), 'Other')
  const file = path.join(h.tmp, 'sales.xlsx')
  XLSX.writeFile(wb, file)

  const r = await S.importFile(UID, file, 'sales.xlsx')
  assert.equal(r.success, true, r.error)
  assert.equal(r.profile.row_count, 3)
  const loaded = await S.loadImportedDataset('imp-xlsx', UID, r.dataset.id)
  const q = await run('imp-xlsx', `SELECT SUM(Units * Price) total, MAX(Units) top FROM ${loaded.table_name}`)
  approx(q.rows[0].total, 10 * 1.5 + 3 * 12 + 7 * 30.25, 'SUM(Units*Price)')
  assert.equal(q.rows[0].top, 10, 'MAX(Units) is 10, not "7" (the text maximum)')
})

test('import JSON: arrays of objects, uneven keys, awkward column names', async () => {
  const file = writeFile('rows.json', JSON.stringify([{ id: 1, 'Unit Price': 5, 'Total "Net"': 9 }, { id: 2, 'Unit Price': 7, extra: 'late key' }]))
  const r = await S.importFile(UID, file, 'rows.json')
  assert.equal(r.success, true, r.error)
  const loaded = await S.loadImportedDataset('imp-json', UID, r.dataset.id)
  const cols = (await run('imp-json', `PRAGMA table_info(${loaded.table_name})`)).rows.map((c) => c.name)
  assert.deepEqual(cols.sort(), ['Total "Net"', 'Unit Price', 'extra', 'id'].sort(), 'keys that only appear in later rows must not be dropped')
  const q = await run('imp-json', `SELECT SUM("Unit Price") s FROM ${loaded.table_name}`)
  assert.equal(q.rows[0].s, 12)

  const single = await S.importFile(UID, writeFile('one.json', '{"a":1,"b":"x"}'), 'one.json')
  assert.equal(single.success, true, 'a single JSON object is one row')
  assert.equal(single.profile.row_count, 1)
})

test('bad imports are refused with a clear message and nothing is registered', async () => {
  const before = db.getDb().prepare('SELECT COUNT(*) c FROM imported_datasets').get().c
  const txt = await S.importFile(UID, writeFile('notes.txt', 'hello'), 'notes.txt')
  assert.equal(txt.success, false)
  assert.match(txt.error, /not supported/i)

  const empty = await S.importFile(UID, writeFile('empty.csv', 'a,b\n'), 'empty.csv')
  assert.equal(empty.success, false)
  assert.match(empty.error, /empty/i)

  const numbers = await S.importFile(UID, writeFile('nums.json', '[1,2,3]'), 'nums.json')
  assert.equal(numbers.success, false)

  assert.equal(db.getDb().prepare('SELECT COUNT(*) c FROM imported_datasets').get().c, before)
})

test("a student cannot load another student's imported dataset", async () => {
  const mine = await S.importFile(UID, writeFile('private.csv', 'a\n1\n'), 'private.csv')
  assert.equal(mine.success, true)
  makeUser(db, 'someone-else')
  const stolen = await S.loadImportedDataset('x', 'someone-else', mine.dataset.id)
  assert.equal(stolen.success, false)
  assert.match(stolen.error, /not found/i)
})
