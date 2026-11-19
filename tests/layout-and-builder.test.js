'use strict'
// Resizable panes and the My Databases table designer. The pane arithmetic is what makes the layout
// "fool-proof": whatever is dragged, saved or squeezed, both panes stay usable and no screen logic is involved.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, src } = require('./helpers/harness')
const { requireTs } = require('./helpers/ts')
const L = requireTs('src/lib/splitLayout.ts')
const B = requireTs('src/lib/sqlBuilder.ts')

test('a divider can never squeeze either pane below its minimum', () => {
  for (const ratio of [-5, 0, 0.01, 0.5, 0.99, 1, 7, NaN, Infinity]) {
    const r = L.clampRatio(ratio, 1000, 200, 300)
    assert.ok(r * 1000 >= 200 - 1e-9 && (1 - r) * 1000 >= 300 - 1e-9, `ratio ${ratio} gave ${r}`)
  }
})

test('in a window too small for both minimums, the space is shared in proportion instead of overflowing', () => {
  const r = L.clampRatio(0.9, 300, 200, 300)
  assert.ok(Math.abs(r - 0.4) < 1e-9)
  assert.equal(L.clampRatio(0.5, 0, 200, 300) > 0 && L.clampRatio(0.5, 0, 200, 300) < 1, true, 'unmeasured container still yields a sane ratio')
  assert.equal(L.clampRatio(NaN, 0, 1, 1), 0.5)
})

test('saved values that are missing, corrupt or absurd are ignored', () => {
  for (const bad of [null, undefined, '', 'abc', 'NaN', '0', '1', '-0.2', '3', {}, '  ']) assert.equal(L.parseStoredRatio(bad), null, String(bad))
  assert.equal(L.parseStoredRatio('0.4'), 0.4)
})

test('keyboard nudges move the divider by pixels and respect the limits', () => {
  assert.ok(Math.abs(L.nudgeRatio(0.5, 100, 1000, 200, 200) - 0.6) < 1e-9)
  assert.equal(L.nudgeRatio(0.5, 10000, 1000, 200, 200), 0.8)
  assert.equal(L.nudgeRatio(0.5, -10000, 1000, 200, 200), 0.2)
})

test('narrow areas fold side-by-side panes into a stack', () => {
  assert.equal(L.shouldStack(700, 820), true)
  assert.equal(L.shouldStack(900, 820), false)
  assert.equal(L.shouldStack(500, 0), false, 'stackBelow 0 means never')
  assert.equal(L.shouldStack(0, 820), false, 'not measured yet')
})

test('default pixel sizes convert to ratios (sidebars keep a sensible width)', () => {
  assert.equal(L.ratioFromPx(250, 1000), 0.25)
  assert.equal(L.firstPaneSize(0.25, 1000, 150, 400), 250)
})

test('storage failures never break the layout (blocked, full or missing localStorage)', () => {
  global.window = { localStorage: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('x') }, get length() { throw new Error('x') }, key() { throw new Error('x') } }, dispatchEvent() { throw new Error('x') } }
  assert.equal(L.readRatio('k'), null)
  assert.doesNotThrow(() => { L.writeRatio('k', 0.3); L.clearRatio('k'); L.resetAllLayouts() })
  delete global.window
})

test('saved sizes round-trip and "reset all" removes only layout keys', () => {
  const store = new Map([['other', 'keep'], [L.storageKey('a', 'horizontal'), '0.3'], [L.storageKey('b', 'vertical'), '0.6']])
  let fired = 0
  global.window = {
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), get length() { return store.size }, key: (i) => [...store.keys()][i] ?? null },
    dispatchEvent: () => { fired++ },
  }
  const k = L.storageKey('x', 'horizontal')
  L.writeRatio(k, 0.4567891)
  assert.equal(L.readRatio(k), 0.4568)
  L.resetAllLayouts()
  assert.deepEqual([...store.keys()], ['other'], 'layout keys are gone, unrelated ones stay')
  assert.equal(fired, 1)
  delete global.window
})

// ── screens ──
const SCREENS = ['SqlAcademy', 'PythonAcademy', 'ExcelAcademy', 'PowerBIAcademy', 'BusinessAcademyFull', 'StatisticsAcademyFull', 'Projects', 'SimulationsFull', 'Datasets']
test('every multi-window screen uses the resizable panes, with no fixed-width side panel left behind', () => {
  for (const name of SCREENS) {
    const text = src(`src/pages/${name}.tsx`)
    assert.match(text, /SplitPane|AsideSplit|LessonWorkspace/, `${name} lost its resizable panes`)
    const fixed = text.match(/width: (2[5-9]\d|3\d\d|4\d\d), flexShrink: 0/g)
    assert.equal(fixed, null, `${name} still has a fixed-width panel: ${fixed}`)
  }
})

test('every split has its own saved-size name (two splits sharing one would overwrite each other)', () => {
  const ids = []
  for (const f of fs.readdirSync(path.join(ROOT, 'src/pages')).filter((x) => x.endsWith('.tsx'))) {
    for (const m of src(`src/pages/${f}`).matchAll(/<(?:SplitPane|AsideSplit|LessonWorkspace)\s+id="([^"]+)"/g)) ids.push(m[1])
  }
  for (const m of src('src/components/sql/MyDatabases.tsx').matchAll(/<SplitPane id="([^"]+)"/g)) ids.push(m[1])
  assert.ok(ids.length >= 20, `expected the screens' splits, found ${ids.length}`)
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [])
})

test('code editors resize with their pane (otherwise a dragged divider leaves a stale editor)', () => {
  for (const f of ['SqlAcademy', 'PythonAcademy', 'StatisticsAcademyFull']) {
    const text = src(`src/pages/${f}.tsx`)
    const editors = (text.match(/<Editor\b/g) || []).length
    assert.equal((text.match(/automaticLayout: true/g) || []).length, editors, `${f}: every Editor needs automaticLayout`)
  }
})

test('Settings can reset every saved layout', () => {
  assert.match(src('src/pages/Settings.tsx'), /resetAllLayouts\(\)/)
})

// ── table designer ──
const col = (name, type = 'TEXT', pk = false, notNull = false) => ({ name, type, pk, notNull })

test('the table designer writes correct CREATE TABLE SQL', () => {
  assert.equal(B.buildCreateTable('patients', [col('id', 'INTEGER', true), col('name', 'TEXT', false, true), col('age', 'INTEGER')]).sql,
    'CREATE TABLE "patients" (\n  "id" INTEGER PRIMARY KEY,\n  "name" TEXT NOT NULL,\n  "age" INTEGER\n);')
  assert.match(B.buildCreateTable('t', [col('a', 'INTEGER', true), col('b', 'INTEGER', true)]).sql, /PRIMARY KEY \("a", "b"\)/)
})

test('the designer explains mistakes instead of producing broken SQL', () => {
  assert.match(B.buildCreateTable('', [col('a')]).error, /name/)
  assert.match(B.buildCreateTable('t', [col(' ')]).error, /at least one column/)
  assert.match(B.buildCreateTable('t', [col('A'), col('a')]).error, /different/)
})

test('designer output is accepted by the real SQL engine, even with awkward names', async () => {
  const { boot } = require('./helpers/harness')
  const h = boot({ prefix: 'dbi-designer' })
  const SQL = await h.req('services/sql.service').getSqlJs()
  const db = new SQL.Database()
  for (const [name, cols] of [['patients', [col('id', 'INTEGER', true), col('name', 'TEXT', false, true), col('born', 'DATE'), col('active', 'BOOLEAN'), col('fee', 'REAL')]],
    ['order', [col('select', 'TEXT'), col('we"ird', 'INTEGER')]], ['my table', [col('first name')]]]) {
    const r = B.buildCreateTable(name, cols)
    assert.doesNotThrow(() => db.exec(r.sql), r.sql)
  }
  assert.equal(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")[0].values[0][0], 3)
})

test('starter snippets reference the chosen table and run against it', async () => {
  const { boot } = require('./helpers/harness')
  const h = boot({ prefix: 'dbi-snip' })
  const SQL = await h.req('services/sql.service').getSqlJs()
  const db = new SQL.Database()
  db.exec('CREATE TABLE "clients" ("id" INTEGER PRIMARY KEY, "name" TEXT)')
  const list = B.snippets({ name: 'clients', columns: [{ name: 'id' }, { name: 'name' }] })
  assert.ok(list.length >= 5)
  for (const s of list) assert.match(s.sql, /clients/)
  const run = (sql, params) => { const st = db.prepare(sql); st.run(params); st.free() }
  run(list.find((s) => s.label === 'Add rows').sql, [1, 'Amina'])
  run(list.find((s) => s.label === 'Change rows').sql, ['Aminah', 1])
  assert.equal(db.exec('SELECT name FROM clients')[0].values[0][0], 'Aminah')
  db.exec(list.find((s) => s.label === 'Speed up lookups').sql)
  db.exec(list.find((s) => s.label === 'Add a column').sql)
})

test('the SQL screen offers My Databases and still has its playground defaults the tests rely on', () => {
  const page = src('src/pages/SqlAcademy.tsx')
  assert.match(page, /view === 'mydbs' && cfg\.myDatabases && <MyDatabases/)
  assert.match(page, /sql: \{[\s\S]*?myDatabases: true,?\s*\},\s*dataeng/, 'the SQL course keeps My Databases (Data Engineering hides it)')
  assert.match(page, /useState\('(-- Write your SQL here[^']*)'\)/)
})

test('SQL exercises show what the query returned, and only re-run read-only queries to do so', () => {
  const page = src('src/pages/SqlAcademy.tsx')
  assert.match(page, /ExerciseEditorArea showOutput=\{lessonModule === 'sql'\}/)
  assert.match(page, /\^\(select\|with\|values\|pragma\|explain\)\\b/i, 'writes must never be run a second time just to display them')
  assert.match(page, /setOutput\(await window\.api\.sql\.execute\(sandboxId\.current, code, user\.id\)\)/)
})

test('every SELECT exercise answer in the SQL course returns rows through the same path the output panel uses', async () => {
  const { boot, makeUser } = require('./helpers/harness')
  const h = boot({ prefix: 'dbi-exout' })
  const db = h.req('db/database'); await db.initDb(); makeUser(db, 'u')
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  const sql = h.req('services/sql.service')
  const { lessons } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'sql', 'curriculum.json'), 'utf8'))
  let checked = 0
  for (const l of lessons) for (const e of l.exercises || []) {
    const q = (e.solution || '').trim()
    if (!/^(select|with)\b/i.test(q)) continue
    const r = await sql.executeSQL({ sandboxId: `ex_${e.id}_u`, userId: 'u', query: q })
    assert.equal(r.success, true, `${e.id}: ${r.error}`)
    assert.ok(Array.isArray(r.rows) && r.columns.length > 0, `${e.id} shows nothing`)
    checked++
  }
  assert.ok(checked >= 20, `expected the course's SELECT exercises, found ${checked}`)
})

test('no screen uses window.prompt() or alert() (Electron does not support prompt: the button silently does nothing)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  for (const f of walk(path.join(ROOT, 'src')).filter((x) => /\.tsx?$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /\bwindow\.prompt\(|[^.\w]prompt\(['"`]/, `${path.relative(ROOT, f)} uses prompt()`)
    assert.doesNotMatch(text, /\bwindow\.alert\(|[^.\w]alert\(/, `${path.relative(ROOT, f)} uses alert()`)
  }
})

test('My Databases: naming and deleting use in-app dialogs, there is a database switcher, and the last one is reopened', () => {
  const page = src('src/components/sql/MyDatabases.tsx')
  assert.match(page, /function NameDialog/)
  assert.match(page, /function ConfirmDialog/)
  assert.match(page, /aria-label="Database to work in"/)
  assert.match(page, /dbi\.mydb\.last/)
})
