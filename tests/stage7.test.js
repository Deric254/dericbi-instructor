'use strict'
// Stage 7: stuck-help in Python and Excel, Explore (read without starting), lesson-id aliases, the dated-figures list,
// the cost-at-scale lesson, and the lint gate.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src, ROOT } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-s7' })
let db
const g = () => db.getDb()
const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))
test.before(async () => { db = await h.start(); makeLearner(h, db, 's7') })

test('the cost-at-scale lesson: its figures are the real ones, wrong answers fail, and it sits before the capstone', async () => {
  const sql = h.req('services/sql.service')
  const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })
  const ex = Object.fromEntries(g().prepare("SELECT id, solution FROM exercises WHERE lesson_id = 'de-scale'").all().map((e) => [e.id, e.solution]))
  assert.deepEqual(Object.keys(ex).sort(), ['de-21-e1', 'de-21-e2', 'de-21-e3'])
  for (const [id, fixed, name] of [['de-21-e1', 241147, 'rows_loaded_today'], ['de-21-e2', 134, 'one_day_rows'], ['de-21-e3', 30, 'summary_rows']]) {
    assert.equal((await grade(id, `SELECT ${fixed} AS ${name}`, ex[id])).correct, true, `${id} real value`)
    assert.equal((await grade(id, `SELECT ${fixed + 1} AS ${name}`, ex[id])).correct, false, `${id} wrong value`)
  }
  const theory = g().prepare("SELECT theory_md t FROM lessons WHERE id = 'de-scale'").get().t
  for (const n of ['3,240 events across 30 days', '**134**', '27.41', '18.98', '4.47', '**30 rows**']) assert.ok(theory.includes(n), n)
  const order = g().prepare("SELECT id, prerequisites p FROM lessons WHERE module = 'dataeng' ORDER BY sort_order").all()
  assert.deepEqual(order.slice(-3).map((l) => l.id), ['de-system-design', 'de-scale', 'de-capstone']); assert.deepEqual(JSON.parse(order.at(-1).p), ['de-scale'])
  assert.ok(json('content/concepts/concepts.json').concepts.some((c) => c.id === 'scale-cost' && c.lessons.includes('de-scale')))
})

test('a lesson id with the other spelling (stat-/stats-, py-/python-) finds the lesson that exists, and nothing is renamed', async () => {
  const A = h.req('services/aliases')
  const has = new Set(['stat-a', 'python-b', 'sql-c'])
  const r = (id) => A.resolveLessonId((x) => has.has(x), id, [['stat', 'stats'], ['py', 'python']])
  assert.equal(r('stat-a'), 'stat-a'); assert.equal(r('stats-a'), 'stat-a'); assert.equal(r('py-b'), 'python-b'); assert.equal(r('sql-c'), 'sql-c')
  for (const bad of ['stats-zzz', 'nope', '', null, undefined, 5, {}, 'stat', '-a']) assert.equal(r(bad), null, String(bad))
  assert.deepEqual(A.loadPrefixGroups(), [['stat', 'stats'], ['py', 'python']])
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'al-')); const w = (n, s) => { fs.writeFileSync(path.join(tmp, n), s); return path.join(tmp, n) }
  assert.deepEqual(A.loadPrefixGroups(path.join(tmp, 'missing.json')), []); assert.deepEqual(A.loadPrefixGroups(w('bad.json', '{oops')), [])
  assert.deepEqual(A.loadPrefixGroups(w('mix.json', JSON.stringify({ prefix_groups: [['a', 'b'], ['x'], 'y', ['Q;', 'z'], [1, 2]] }))), [['a', 'b']])
  // through the real channel, against real lessons
  const real = g().prepare("SELECT id FROM lessons WHERE id LIKE 'stat-%' OR id LIKE 'stats-%' ORDER BY id LIMIT 1").get().id
  const other = real.startsWith('stats-') ? real.replace('stats-', 'stat-') : real.replace('stat-', 'stats-')
  const direct = await h.invoke('lessons:get', { userId: 's7', lessonId: real }); const alias = await h.invoke('lessons:get', { userId: 's7', lessonId: other })
  assert.equal(alias.lesson.id, real); assert.equal(alias.lesson.theory_md, direct.lesson.theory_md)
  const before = g().prepare('SELECT COUNT(*) c FROM lessons').get().c
  assert.equal(before, g().prepare('SELECT COUNT(*) c FROM lessons').get().c)
  const py = g().prepare("SELECT id FROM lessons WHERE id LIKE 'py-%' OR id LIKE 'python-%' LIMIT 1").get().id
  const pyOther = py.startsWith('py-') ? py.replace('py-', 'python-') : py.replace('python-', 'py-')
  assert.equal((await h.invoke('lessons:get', { userId: 's7', lessonId: pyOther })).lesson.id, py)
})

test('Explore: reading a lesson, even one the path would hold back, records nothing and starts nothing', async () => {
  makeLearner(h, db, 'reader')
  const track = json('content/path/master-track.json')
  const later = track.phases.slice(3).flatMap((p) => p.items).find((i) => i.lesson)?.lesson
  assert.ok(later, 'a lesson far down the path exists')
  const count = () => ({ p: g().prepare("SELECT COUNT(*) c FROM lesson_progress WHERE user_id = 'reader' AND status <> 'not_started'").get().c, j: g().prepare("SELECT COUNT(*) c FROM jump_passes WHERE user_id = 'reader'").get().c, v: g().prepare("SELECT COUNT(*) c FROM provisional WHERE user_id = 'reader'").get().c })
  const before = count()
  const l = await h.invoke('lessons:get', { userId: 'reader', lessonId: later })
  assert.ok(l && String(l.lesson.theory_md).length > 50, 'the reading is returned')
  assert.deepEqual(count(), before, 'reading wrote nothing')
  const panel = src('src/pages/Path.tsx'); assert.match(panel, /Just read it first/); assert.match(panel, /<Explore key=\{check\.lesson_id\}/); assert.doesNotMatch(panel.slice(panel.indexOf('function Explore'), panel.indexOf('function JumpPanel')), /lessons\.start|jump\.go|complete/)
})

test('the dated-figures list: every figure is word for word in its lesson, bad entries are dropped, and age decides when it is due', async () => {
  const F = h.req('services/freshness'); const file = json('content/path/freshness.json')
  assert.equal(file.facts.length, 8)
  for (const f of file.facts) {
    assert.ok(F.validFact(f), f.id); const t = g().prepare('SELECT theory_md t FROM lessons WHERE id = ?').get(f.lesson).t
    assert.ok(t.includes(f.text), `${f.id} must appear in ${f.lesson}`); assert.equal(f.confirmed, false, 'nothing is claimed as confirmed')
  }
  assert.equal(new Set(file.facts.map((f) => f.id)).size, file.facts.length)
  const base = file.facts[0]; const bad = [{ ...base, id: '' }, { ...base, as_of: '2026-13-45' }, { ...base, official_url: 'http://x' }, { ...base, confirmed: true, confirmed_on: null }, { ...base, text: '' }, null, 'x']
  for (const b of bad) assert.equal(F.validFact(b), false, JSON.stringify(b)?.slice(0, 40))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-')); const w = (s) => { const p = path.join(tmp, 'f.json'); fs.writeFileSync(p, s); return p }
  assert.deepEqual(F.loadFreshness(path.join(tmp, 'none.json')), { review_every_days: 120, facts: [] }); assert.deepEqual(F.loadFreshness(w('{oops')).facts, [])
  assert.equal(F.loadFreshness(w(JSON.stringify({ review_every_days: 9999, facts: [base, base, bad[0]] }))).review_every_days, 120)
  assert.equal(F.loadFreshness(w(JSON.stringify({ review_every_days: 9999, facts: [base, base, bad[0]] }))).facts.length, 1, 'duplicates and bad entries are dropped')
  const day = (s) => new Date(s + 'T12:00:00Z')
  const rep = (now) => F.freshnessReport(day(now))
  assert.equal(rep('2026-11-27').due, 1, 'only the 2023/24 turnover-tax source is old today')
  assert.equal(rep('2026-11-27').items[0].id, 'turnover-tax-rate'); assert.equal(rep('2026-11-27').items[0].due, true)
  assert.equal(rep('2027-03-01').due, 8 - rep('2027-03-01').items.filter((i) => !i.due).length); assert.ok(rep('2027-03-01').due > 1, 'the rest fall due as time passes')
  assert.equal(rep('2020-01-01').items.every((i) => i.age_days === 0), true, 'a clock set back is safe')
  assert.equal(rep('2026-11-27').items.find((i) => i.id === 'vat-rate').lesson_title.length > 3, true)
  const d = h.req('services/tutor').appDescription()
  assert.match(d, /quote dated legal or tax figures, and none has been confirmed/); assert.match(d, /Kenya Revenue Authority/); assert.match(d, /1 of these figures are now past their re-check date/)
  const gate = src('electron/licensing/licence-gate.ts'); assert.match(gate, /'freshness:report'/)
  assert.match(src('src/pages/Settings.tsx'), /<FreshnessCard \/>/); assert.match(src('src/components/ui/FreshnessCard.tsx'), /freshness\.report\(\)/)
  assert.deepEqual(await h.invoke('freshness:report', {}).then((r) => r.items.length), 8)
})

test('Python and Excel tell the floating tutor what the learner is running, and offer help after errors, and clear it on leaving', () => {
  const store = src('src/store/index.ts'), gi = src('src/components/ui/GlobalInstructor.tsx')
  assert.match(store, /export interface WorkHint/); assert.match(store, /setWork: \(work: WorkHint \| null\) => void/)
  assert.match(gi, /work\.section === activeSection/); assert.match(gi, /stuck=\{here\?\.stuck\}/); assert.match(gi, /initialPrompt=\{here\?\.context\.error \? here\.prompt : undefined\}/)
  for (const [f, sec, key] of [['src/pages/PythonAcademy.tsx', 'python', 'python-playground'], ['src/pages/ExcelAcademy.tsx', 'excel', 'excel-formula']]) {
    const s = src(f); assert.match(s, new RegExp(`setWork\\(\\{ section: '${sec}'`)); assert.match(s, new RegExp(`key: '${key}'`)); assert.match(s, /\(\) => \(\) => setWork\(null\)/)
    assert.match(s, /setWrong\(/); assert.match(s, /without writing the finished/, 'the offered question never asks for the answer')
  }
})

test('the lint gate: a config, a script, a CI step and a lockfile that agrees with package.json', () => {
  const pkg = json('package.json'), lock = json('package-lock.json')
  assert.match(pkg.scripts.lint, /^eslint src electron/); for (const d of ['eslint', 'typescript-eslint', 'eslint-plugin-react-hooks', 'globals']) { assert.ok(pkg.devDependencies[d], d); assert.ok(lock.packages[`node_modules/${d}`], `${d} is in the lockfile`) }
  assert.match(src('.github/workflows/ci.yml'), /npm run lint/); const cfg = src('eslint.config.mjs'); assert.match(cfg, /rules-of-hooks': 'error'/)
  for (const f of ['tsconfig.json', 'tsconfig.electron.json']) assert.match(src(f), /"noUnusedLocals": true/)
})
