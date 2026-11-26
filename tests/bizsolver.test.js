'use strict'
// The Business Problem Solver academy. Every model answer must run on the real practice data and be accepted by the real
// grader; wrong answers must be rejected; the practice business must carry the problems the lessons teach; the eight-skill
// map must point only at real lessons; and adding the academy must not disturb the seven that already exist.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-bizsolver' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/bizsolver/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const isPython = (e) => e.exercise_type === 'python_code'
const sqlExercises = () => exercises().filter((e) => !isPython(e))
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })
const one = async (query, id = 'bp-probe') => {
  const r = await sql.executeSQL({ sandboxId: `ex_${id}_u`, userId: 'u', query })
  assert.equal(r.success, true, r.error)
  return r.rows
}

test('the academy is its own module with 11 lessons and does not change the others', () => {
  const g = db.getDb()
  const count = (m) => g.prepare('SELECT COUNT(*) c FROM lessons WHERE module = ?').get(m).c
  assert.equal(count('bizsolver'), 11)
  assert.equal(count('sql'), 10)
  assert.equal(count('dataeng'), 20)
  assert.equal(g.prepare("SELECT DISTINCT exercise_type t FROM exercises WHERE lesson_id LIKE 'bp-%'").all().map((r) => r.t).sort().join(), 'python_code,sql_query')
  assert.equal(g.prepare("SELECT COUNT(*) c FROM skill_ratings WHERE skill = 'bizsolver'").get().c, 0)
})

test('the practice business is identical on every machine and carries the problems the lessons teach', async () => {
  const [a] = await one(`SELECT (SELECT COUNT(*) FROM shop_sales) AS sales, (SELECT COUNT(*) FROM shop_sale_items) AS items,
    (SELECT COUNT(DISTINCT supplier_name) FROM shop_supplier_invoices) AS spellings, (SELECT COUNT(*) FROM shop_supplier_invoices) AS statements,
    (SELECT COUNT(*) FROM shop_batches) AS batches, (SELECT COUNT(*) FROM shop_purchases WHERE received_date IS NULL) AS open_lines,
    (SELECT ROUND(SUM(total)) FROM shop_sales) AS revenue, (SELECT ROUND(SUM(amount)) FROM shop_expenses) AS expenses`)
  assert.deepEqual(Object.values(a).map(Number), [2046, 5029, 24, 100, 80, 1, 31524349, 5914700])
  const problems = {
    'bp-5-e2': 4,  // dead stock: four products nobody has bought since August
    'bp-5-e3': 6,  // batches expired or about to expire
    'bp-4-e2': 4,  // statement rows entered twice
    'bp-4-e4': 3,  // statements that disagree with our own ledger
    'bp-9-e1': 3,  // utilities more than 1.5 times the normal level, October to December
  }
  const all = Object.fromEntries(exercises().map((e) => [e.id, e]))
  for (const [id, rows] of Object.entries(problems)) assert.equal((await one(all[id].solution, id)).length, rows, `${id}: the problem it teaches must be in the data`)
  const [receipts] = await one(`SELECT COUNT(*) AS n FROM shop_sales s WHERE ABS(s.total - (SELECT SUM(qty * unit_price) FROM shop_sale_items i WHERE i.sale_id = s.sale_id)) > 0.01`)
  assert.equal(Number(Object.values(receipts)[0]), 0, 'every receipt must equal the sum of its lines')
})

test('every model answer is accepted by the real grader, on every exercise (and none returns an empty result)', async () => {
  assert.ok(sqlExercises().length >= 45)
  for (const e of sqlExercises()) {
    const r = await grade(e.id, e.solution, e.solution)
    assert.equal(r.correct, true, `${e.id}: ${r.feedback}`)
    assert.ok((r.actual_total ?? 1) > 0, `${e.id}: model answer returns nothing`)
  }
})

test('wrong answers are rejected on every exercise, and the classic mistakes are caught', async () => {
  for (const e of sqlExercises()) {
    const r = await grade(e.id, 'SELECT 1 AS nothing', e.solution)
    assert.equal(r.correct, false, `${e.id}: "SELECT 1" was accepted`)
    assert.ok(r.feedback && r.feedback.length > 10)
  }
  const byId = Object.fromEntries(exercises().map((e) => [e.id, e]))
  // fan-out: summing receipt totals after joining to the lines counts each receipt once per line
  const fanOut = await grade('bp-3-e2', 'SELECT ROUND(SUM(s.total), 2) AS sales_total, ROUND(SUM(i.qty * i.unit_price), 2) AS items_total, 0 AS difference FROM shop_sales s JOIN shop_sale_items i ON i.sale_id = s.sale_id', byId['bp-3-e2'].solution)
  assert.equal(fanOut.correct, false, 'a join that repeats every receipt must not pass the control-total exercise')
  // valuing stock at selling price instead of cost
  const atPrice = await grade('bp-2-e5', 'SELECT p.category, ROUND(SUM(b.qty_on_hand * p.unit_price), 0) AS stock_value FROM shop_batches b JOIN shop_products p ON p.product_id = b.product_id GROUP BY p.category ORDER BY stock_value DESC', byId['bp-2-e5'].solution)
  assert.equal(atPrice.correct, false, 'stock must be valued at cost')
  // matching suppliers by exact name finds only some of the statement rows
  const names = await one(byId['bp-4-e3'].solution, 'bp-4-e3')
  const { statement_rows, exact_matches } = names[0]
  assert.ok(Number(exact_matches) > 0 && Number(exact_matches) < Number(statement_rows), 'exact name matching must find some, but not all, of the statements')
})

test('Business Problem Solver sandboxes are separate from the hospital and Data Engineering ones', async () => {
  const direct = await sql.executeSQL({ sandboxId: 'ex_sql-g1-e1_u', query: 'SELECT COUNT(*) AS n FROM shop_sales', userId: 'u' })
  assert.equal(direct.success, false, 'shop tables must not leak into SQL exercises')
  const de = await sql.executeSQL({ sandboxId: 'ex_de-1-e1_u', query: 'SELECT COUNT(*) AS n FROM shop_sales', userId: 'u' })
  assert.equal(de.success, false, 'shop tables must not leak into Data Engineering exercises')
  const here = await sql.executeSQL({ sandboxId: 'ex_bp-1-e1_u', query: 'SELECT COUNT(*) AS n FROM patients', userId: 'u' })
  assert.equal(here.success, false, 'hospital tables must not leak into this academy')
})

test('the practice tables are listed for the playground and the AI tutor', () => {
  const rows = db.getDb().prepare("SELECT table_name FROM bundled_datasets WHERE domain = 'bizsolver' ORDER BY table_name").all().map((r) => r.table_name)
  assert.deepEqual(rows, ['shop_actions', 'shop_bank', 'shop_batches', 'shop_customers', 'shop_expenses', 'shop_payments', 'shop_products', 'shop_purchases', 'shop_refunds', 'shop_sale_items', 'shop_sales', 'shop_supplier_invoices', 'shop_suppliers'])
  assert.match(h.req('services/tutor').appDescription(), /Business Problem Solver academy[\s\S]*shop_sales/)
  const tables = src('src/pages/SqlAcademy.tsx').match(/SHOP_TABLES = '([^']+)'/)[1].split(', ')
  assert.deepEqual([...tables].sort(), rows, 'the tables chip lists exactly the practice tables')
})

// ───────────────────────── the student's path, through the same calls the screen makes ─────────────────────────

test('a student upgrading from the previous version: the academy opens at lesson 1, finishing it unlocks lesson 2, and old progress is intact', async () => {
  const app = h, g = db.getDb()
  makeLearner(app, db, 'old')
  g.prepare("UPDATE lesson_progress SET status = 'complete' WHERE user_id = 'old' AND lesson_id = 'sql-select'").run()
  g.prepare("DELETE FROM lesson_progress WHERE user_id = 'old' AND lesson_id LIKE 'bp-%'").run()
  g.prepare("UPDATE app_settings SET value = '8' WHERE key = 'setup_version'").run()
  await app.req('services/setup.service').runFirstTimeSetup(() => {}) // first launch after the update

  const list = (m) => app.invoke('lessons:list', { userId: 'old', module: m })
  const bp = await list('bizsolver')
  assert.equal(bp.length, 11)
  assert.equal(bp[0].id, 'bp-audit')
  assert.notEqual(bp[0].user_status, 'locked', 'lesson 1 must be open')
  assert.ok(bp.slice(1).every((l) => l.user_status === 'locked' || !l.user_status), 'the rest wait for their prerequisites')
  assert.equal((await list('sql')).find((l) => l.id === 'sql-select').user_status, 'complete', 'old progress untouched')
  assert.equal((await list('dataeng')).length, 20)

  await app.invoke('lessons:start', { userId: 'old', lessonId: 'bp-audit' })
  assert.equal((await app.invoke('lessons:complete', { userId: 'old', lessonId: 'bp-audit', timeSpentS: 60 })).success, true)
  const after = await list('bizsolver')
  assert.equal(after[0].user_status, 'complete')
  assert.notEqual(after[1].user_status, 'locked', 'lesson 2 unlocked')
  assert.equal(after[2].user_status === 'locked' || !after[2].user_status, true, 'lesson 3 still waits')
})

test('submitting a Business Problem Solver exercise through the real channel: right answer scores, wrong answer explains', async () => {
  makeLearner(h, db, 's')
  const e = exercises().find((x) => x.id === 'bp-5-e2') // find the dead stock
  const ok = await h.invoke('exercises:submit', { userId: 's', exerciseId: e.id, answer: e.solution })
  assert.equal(ok.validation.correct, true, ok.validation.feedback)
  const bad = await h.invoke('exercises:submit', { userId: 's', exerciseId: e.id, answer: 'SELECT p.name AS product FROM shop_products p' })
  assert.equal(bad.validation.correct, false)
  assert.match(bad.validation.feedback, /rows|values|differ|expected|column/i)
})

test('the academy is a full path: chained in order, ending at the capstone, with theory, a quiz and exercises in every lesson', () => {
  const ids = lessons.map((l) => l.id)
  assert.deepEqual(ids, ['bp-audit', 'bp-model', 'bp-connect', 'bp-unify', 'bp-stock', 'bp-margins', 'bp-cash', 'bp-investigate', 'bp-monitor', 'bp-scale', 'bp-capstone'])
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    assert.deepEqual(l.prerequisites, i ? [lessons[i - 1].id] : [])
    assert.ok(l.theory_md.length > 1500 && l.quiz.length >= 3 && l.exercises.length >= 3, l.id)
    assert.ok(/What you can and cannot claim|Before you present/.test(l.theory_md), `${l.id}: every lesson says what the data does not prove`)
  })
  assert.equal(new Set(exercises().map((e) => e.id)).size, exercises().length, 'exercise ids are unique')
  assert.ok(exercises().filter(isPython).length >= 12, 'practicals, not only theory')
})

// ───────────── Python practicals: real Python, hidden tests, graded by the main process ─────────────

test('Python practicals: the real runner + the real grader accept every model solution and reject mistakes, the untouched starter and hard-coded output', async () => {
  const { requireTs } = require('./helpers/ts')
  const { runPythonGraded } = requireTs('src/lib/pythonRunner.ts')
  const { loadPyodide } = require('pyodide')
  const py = await loadPyodide()
  const g = db.getDb()
  makeLearner(h, db, 'py')
  const pys = exercises().filter(isPython)
  assert.equal(pys.length, 13)
  const submit = (e, code, run) => h.invoke('exercises:submit', { userId: 'py', exerciseId: e.id, answer: code, pythonRun: run })
  const attempt = (e, code) => {
    const r = runPythonGraded(py, { setup: e.expected_output.setup, code, check: e.expected_output.check })
    return { checkOutput: r.checkOutput, error: r.error }
  }
  for (const e of pys) {
    assert.equal(e.evaluation_mode, 'python_output')
    assert.ok(e.expected_output.setup !== undefined && e.expected_output.check && e.expected_output.output, e.id)
    const good = await submit(e, e.solution, attempt(e, e.solution))
    assert.equal(good.validation.correct, true, `${e.id}: ${good.validation.feedback}`)
    const blank = await submit(e, e.expected_output.starter, attempt(e, e.expected_output.starter))
    assert.equal(blank.validation.correct, false, `${e.id}: the untouched starter was accepted`)
    const cheat = `print(${JSON.stringify(e.expected_output.output)})`
    const cheated = await submit(e, cheat, { checkOutput: e.expected_output.output, error: null })
    assert.equal(cheated.validation.correct, false, `${e.id}: hard-coded output was accepted`)
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM exercise_attempts WHERE user_id = 'py'").get().c, pys.length * 3, 'every attempt is recorded')
})

test('Python practicals: the classic mistakes fail with a message that names the failing test line, and the answer key never reaches the screen', async () => {
  const { requireTs } = require('./helpers/ts')
  const { runPythonGraded } = requireTs('src/lib/pythonRunner.ts')
  const py = await require('pyodide').loadPyodide()
  makeLearner(h, db, 'py2')
  const byId = Object.fromEntries(exercises().map((e) => [e.id, e]))
  const run = (e, code) => { const r = runPythonGraded(py, { setup: e.expected_output.setup, code, check: e.expected_output.check }); return { checkOutput: r.checkOutput, error: r.error } }
  const sub = (e, answer, pythonRun) => h.invoke('exercises:submit', { userId: 'py2', exerciseId: e.id, answer, pythonRun })

  // An alert that fires on thin history, an estimate copied into the measured field, and a guess at an ambiguous supplier.
  const alert = byId['bp-py-9']
  const thin = await sub(alert, 'def should_alert(history, latest, factor, min_points):\n    return bool(history) and latest > factor * (sum(history) / len(history))', run(alert, 'def should_alert(history, latest, factor, min_points):\n    return bool(history) and latest > factor * (sum(history) / len(history))'))
  assert.equal(thin.validation.correct, false)
  assert.match(thin.validation.feedback, /Test line \d+: expected "\w+" but your code gave "\w+"/)
  const finding = byId['bp-py-13']
  const copied = 'def build_finding(**f):\n    f["impact_measured"] = f.get("impact_estimated")\n    return f'
  assert.equal((await sub(finding, copied, run(finding, copied))).validation.correct, false, 'copying the estimate into the measured field must fail')
  const supplier = byId['bp-py-4']
  const guess = 'def match_supplier(raw, known):\n    for sid, n in known.items():\n        if n.lower().split()[0] == raw.lower().split()[0]:\n            return sid\n    return None'
  assert.equal((await sub(supplier, guess, run(supplier, guess))).validation.correct, false, 'picking the first supplier that shares a word must fail')

  assert.match((await sub(alert, 'x = 1/0', { checkOutput: '', error: 'ZeroDivisionError: division by zero (line 1)' })).validation.feedback, /ZeroDivisionError/)
  assert.match((await sub(alert, 'def should_alert(h, l, f, m): pass')).validation.feedback, /Press Run/)
  const listed = await h.invoke('lessons:get', { userId: 'py2', lessonId: 'bp-monitor' })
  const row = listed.exercises.find((x) => x.id === 'bp-py-9')
  assert.ok(row.python_check && row.python_starter !== undefined)
  assert.equal('expected_output' in row || 'solution' in row, false, 'neither the key nor the solution is sent to the screen')
})

// ───────────── the eight skills ─────────────

test('the eight-skill map points only at real lessons, covers all eight, and follows the student\'s progress', async () => {
  const { SKILLS, SKILLS_CAPSTONE } = h.req('services/skills')
  assert.equal(SKILLS.length, 8)
  assert.deepEqual(SKILLS.map((s) => s.id), [1, 2, 3, 4, 5, 6, 7, 8])
  const real = new Set(db.getDb().prepare('SELECT id FROM lessons').all().map((r) => r.id))
  for (const s of SKILLS) {
    assert.ok(s.problem.length > 20 && s.lessons.length >= 2, `skill ${s.id} states its business problem and has lessons`)
    for (const id of s.lessons) assert.ok(real.has(id), `skill ${s.id} points at a lesson that does not exist: ${id}`)
  }
  assert.ok(real.has(SKILLS_CAPSTONE))
  // each Business Problem Solver lesson but the capstone is the lead lesson of exactly one skill
  const lead = SKILLS.map((s) => s.lessons[0])
  assert.deepEqual(lead.filter((id) => id.startsWith('bp-')).length, 8)
  assert.equal(new Set(lessons.map((l) => l.id).filter((id) => id !== SKILLS_CAPSTONE && !SKILLS.flatMap((s) => s.lessons).includes(id))).size, 0, 'no Business Problem Solver lesson is missing from the map')

  makeLearner(h, db, 'map')
  const before = await h.invoke('progress:skill-map', 'map')
  assert.equal(before.skills.length, 8)
  assert.equal(before.skills[0].lessons[0].id, 'bp-audit')
  assert.equal(before.skills[0].complete, 0)
  assert.equal(before.capstone.id, 'bp-capstone')
  db.getDb().prepare("UPDATE lesson_progress SET status = 'complete' WHERE user_id = 'map' AND lesson_id = 'bp-audit'").run()
  const after = await h.invoke('progress:skill-map', 'map')
  assert.equal(after.skills[0].complete, 1)
  assert.equal(after.skills[0].lessons[0].status, 'complete')
  assert.equal(after.skills[1].lessons[0].status === 'locked' || after.skills[1].lessons[0].status === 'available', true)
})

test('the academy is wired into every place a course lives, and the Skill map tab is only on this course', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'bizsolver'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /bizsolver:\s+<SqlAcademy key="bizsolver" course="bizsolver" \/>/)
  assert.match(src('src/pages/Dashboard.tsx'), /id: 'bizsolver'/)
  assert.match(src('src/components/ui/GlobalInstructor.tsx'), /'bizsolver'/)
  assert.match(src('src/components/ui/LearningPlan.tsx'), /bizsolver: 'Business Problem Solver'/)
  const page = src('src/pages/SqlAcademy.tsx')
  assert.match(page, /bizsolver: \{[\s\S]*?skillMap: true/)
  assert.equal((page.match(/skillMap: true/g) || []).length, 1, 'only the Business Problem Solver has the Skill map')
  assert.match(page, /view === 'skills' && cfg\.skillMap/)
  assert.match(src('electron/services/sql.service.ts'), /startsWith\('ex_bp-'\)/)
  assert.match(src('electron/services/progress.service.ts'), /'dataeng', 'bizsolver', 'foundations', 'founder', 'aiml', 'techfirst', 'simulation'/)
})

test('Business Problem Solver achievements are earned by real work: distinct exercises, Python practicals, and the capstone', async () => {
  const P = h.req('services/progress.service')
  const g = db.getDb()
  makeLearner(h, db, 'ach')
  const earned = () => new Set(g.prepare("SELECT achievement_id FROM user_achievements WHERE user_id = 'ach'").all().map((r) => r.achievement_id))
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_bp_first'), false, 'nothing earned before any work')
  let seq = 0
  const right = (id, n) => { for (let i = 0; i < n; i++) g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, attempt_number, answer, is_correct, score) VALUES (?, 'ach', ?, ?, 'x', 1, 100)").run(`a-${++seq}`, id, ++seq) }
  right('bp-1-e1', 12) // the same exercise solved 12 times is still ONE exercise
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_bp_first'), true)
  assert.equal(earned().has('ach_bp_25'), false, 'repeating one exercise does not earn the 25-exercise badge')
  sqlExercises().slice(0, 25).forEach((e) => right(e.id, 1))
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_bp_25'), true)
  assert.equal(earned().has('ach_bp_py_8'), false, 'SQL exercises do not count as Python practicals')
  exercises().filter(isPython).slice(0, 8).forEach((e) => right(e.id, 1))
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES ('lp-ach', 'ach', 'bp-capstone', 'complete', datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete'").run()
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_bp_py_8'), true)
  assert.equal(earned().has('ach_bp_capstone'), true)
})
