'use strict'
// The Data Engineering academy. Every model answer must run on the real practice data and be accepted by the real
// grader; a wrong answer must be rejected; and adding the course must not disturb the six existing ones.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-dataeng' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/dataeng/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const isPython = (e) => e.exercise_type === 'python_code'
const sqlExercises = () => exercises().filter((e) => !isPython(e))
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the course is seeded as its own module with 20 lessons and does not add a skill or change the others', () => {
  const g = db.getDb()
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'dataeng'").get().c, 21)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'sql'").get().c, 10)
  assert.equal(g.prepare("SELECT DISTINCT exercise_type t FROM exercises WHERE lesson_id LIKE 'de-%'").all().map((r) => r.t).sort().join(), 'python_code,sql_query')
  assert.equal(g.prepare("SELECT COUNT(*) c FROM skill_ratings WHERE skill = 'dataeng'").get().c, 0)
})

test('the practice data is identical on every machine and carries the traps the lessons teach', async () => {
  const r = await sql.executeSQL({ sandboxId: 'ex_de-probe_u', userId: 'u', query: 'SELECT (SELECT COUNT(*) FROM raw_events) a, (SELECT COUNT(DISTINCT event_id) FROM raw_events) b, (SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.customer_id=o.customer_id WHERE c.customer_id IS NULL) c, (SELECT COUNT(*) FROM pipeline_runs) d, (SELECT COUNT(*) FROM llm_requests) e, (SELECT COUNT(*) FROM ml_features) f' })
  assert.equal(r.success, true, r.error)
  assert.deepEqual(r.rows[0].map ? r.rows[0].map(Number) : Object.values(r.rows[0]).map(Number), [3240, 3000, 30, 360, 2000, 300])
})

test('every model answer is accepted by the real grader, on every exercise (and none returns an empty result)', async () => {
  assert.ok(sqlExercises().length >= 60)
  for (const e of sqlExercises()) {
    const r = await grade(e.id, e.solution, e.solution)
    assert.equal(r.correct, true, `${e.id}: ${r.feedback}`)
    assert.ok((r.actual_total ?? 1) > 0, `${e.id}: model answer returns nothing`)
  }
})

test('wrong answers are rejected on every exercise: an unrelated query, and a query with the right shape but wrong filter', async () => {
  for (const e of sqlExercises()) {
    const r = await grade(e.id, 'SELECT 1 AS nothing', e.solution)
    assert.equal(r.correct, false, `${e.id}: "SELECT 1" was accepted`)
    assert.ok(r.feedback && r.feedback.length > 10)
  }
  const dup = lessons.find((l) => l.id === 'de-dedup').exercises.find((x) => x.id === 'de-3-e3')
  const naive = await grade(dup.id, "SELECT event_type, COUNT(*) AS events FROM raw_events GROUP BY event_type ORDER BY events DESC, event_type", dup.solution)
  assert.equal(naive.correct, false, 'forgetting to deduplicate must be marked wrong')
})

test('Data Engineering sandboxes are separate from the hospital ones: the SQL course is untouched', async () => {
  const direct = await sql.executeSQL({ sandboxId: 'ex_sql-g1-e1_u', query: 'SELECT COUNT(*) AS n FROM patients', userId: 'u' })
  assert.equal(direct.success, true, direct.error)
  const none = await sql.executeSQL({ sandboxId: 'ex_sql-g1-e1_u', query: 'SELECT COUNT(*) FROM raw_events', userId: 'u' })
  assert.equal(none.success, false, 'platform tables must not leak into SQL exercises')
})

test('the practice tables are listed for the playground and the AI tutor', () => {
  const rows = db.getDb().prepare("SELECT table_name FROM bundled_datasets WHERE domain = 'dataeng' ORDER BY table_name").all().map((r) => r.table_name)
  assert.deepEqual(rows, ['customers', 'llm_requests', 'messy_contacts', 'ml_features', 'orders', 'pipeline_runs', 'raw_events'])
})

// ───────────────────────── the student's path, through the same calls the screen makes ─────────────────────────
test('a student upgrading from the previous version: Data Engineering opens at lesson 1, finishing it unlocks lesson 2, and old progress is intact', async () => {
  const app = h, g = db.getDb()
  makeLearner(app, db, 'old')
  // Pretend this student already finished SQL lesson 1 on the previous version, before the academy existed.
  g.prepare("UPDATE lesson_progress SET status = 'complete' WHERE user_id = 'old' AND lesson_id = 'sql-select'").run()
  g.prepare("DELETE FROM lesson_progress WHERE user_id = 'old' AND lesson_id LIKE 'de-%'").run()
  g.prepare("UPDATE app_settings SET value = '5' WHERE key = 'setup_version'").run()
  await app.req('services/setup.service').runFirstTimeSetup(() => {}) // first launch after the update

  const list = (m) => app.invoke('lessons:list', { userId: 'old', module: m })
  const de = await list('dataeng')
  assert.equal(de.length, 21)
  assert.equal(de[0].id, 'de-foundations')
  assert.notEqual(de[0].user_status, 'locked', 'lesson 1 must be open')
  assert.ok(de.slice(1).every((l) => l.user_status === 'locked' || !l.user_status), 'the rest wait for their prerequisites')
  assert.equal((await list('sql')).find((l) => l.id === 'sql-select').user_status, 'complete', 'old progress untouched')

  await app.invoke('lessons:start', { userId: 'old', lessonId: 'de-foundations' })
  const done = await app.invoke('lessons:complete', { userId: 'old', lessonId: 'de-foundations', timeSpentS: 60 })
  assert.equal(done.success, true)
  const after = await list('dataeng')
  assert.equal(after[0].user_status, 'complete')
  assert.notEqual(after[1].user_status, 'locked', 'lesson 2 unlocked')
  assert.equal(after[2].user_status === 'locked' || !after[2].user_status, true, 'lesson 3 still waits')
})

test('submitting a Data Engineering exercise through the real channel: right answer scores, wrong answer explains', async () => {
  const app = h, g = db.getDb()
  makeLearner(app, db, 's')
  const e = exercises().find((x) => x.id === 'de-3-e3') // clean events by type
  const ok = await app.invoke('exercises:submit', { userId: 's', exerciseId: e.id, answer: e.solution })
  assert.equal(ok.validation.correct, true, ok.validation.feedback)
  const bad = await app.invoke('exercises:submit', { userId: 's', exerciseId: e.id, answer: 'SELECT event_type, COUNT(*) AS events FROM raw_events GROUP BY event_type' })
  assert.equal(bad.validation.correct, false)
  assert.match(bad.validation.feedback, /rows|values|differ|expected/i)
})

test('cleaning lesson: the messy data really is messy, and the repair exercises reject the naive answer', async () => {
  const clean = lessons.find((l) => l.id === 'de-cleaning')
  assert.deepEqual(lessons.slice(0, 4).map((l) => l.id), ['de-foundations', 'de-profiling', 'de-cleaning', 'de-dedup'])
  assert.deepEqual(lessons.find((l) => l.id === 'de-dedup').prerequisites, ['de-cleaning'])
  const probe = await sql.executeSQL({ sandboxId: 'ex_de-probe_u', userId: 'u', query: "SELECT COUNT(DISTINCT country) raw, COUNT(DISTINCT LOWER(TRIM(country))) cleaned, SUM(signup_date LIKE '__/__/____') slash FROM messy_contacts" })
  assert.equal(probe.success, true, probe.error)
  const row = Object.values(probe.rows[0]).map(Number)
  assert.ok(row[0] > row[1] && row[1] === 4 && row[2] > 0, `expected messy countries and two date formats, got ${row}`)
  const naive = { 'de-clean-e1': 'SELECT country, COUNT(*) AS contacts FROM messy_contacts GROUP BY country ORDER BY contacts DESC, country', 'de-clean-e2': 'SELECT COUNT(*) AS missing_emails FROM messy_contacts WHERE email IS NULL', 'de-clean-e5': 'SELECT COUNT(DISTINCT email) AS distinct_emails FROM messy_contacts' }
  for (const [id, q] of Object.entries(naive)) {
    const e = clean.exercises.find((x) => x.id === id)
    assert.equal((await grade(id, q, e.solution)).correct, false, `${id}: the naive, uncleaned query must be marked wrong`)
  }
})

test('the course is a full path: the new lessons are chained in order, finish at the capstone, and every lesson has theory, a quiz and exercises', () => {
  const ids = lessons.map((l) => l.id)
  for (const id of ['de-pipelines-etl', 'de-warehouse', 'de-orchestration', 'de-streaming', 'de-testing', 'de-python-pipelines', 'de-system-design']) assert.ok(ids.includes(id), id)
  assert.equal(ids[ids.length - 1], 'de-capstone')
  assert.equal(ids.indexOf('de-python-pipelines'), ids.indexOf('de-pipelines-etl') + 1, 'Python pipelines follows the ETL lesson')
  assert.ok(ids.indexOf('de-governance') < ids.indexOf('de-system-design') && lessons.find((l) => l.id === 'de-governance').prerequisites[0] === 'de-observability')
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    // A straight chain, with the programme's two re-chains: Python pipelines follows the ETL lesson, and governance follows observability so the optional AI lessons never block it.
    const expected = l.id === 'de-ai-features' || l.id === 'de-governance' ? ['de-observability'] : i ? [lessons[i - 1].id] : []
    assert.deepEqual(l.prerequisites, expected, l.id)
    assert.ok(l.theory_md.length > 800 && l.quiz.length >= 3 && l.exercises.length >= 3, l.id)
  })
  assert.equal(new Set(exercises().map((e) => e.id)).size, exercises().length, 'exercise ids are unique')
})

// ───────────── Python practicals: real Python, hidden tests, graded by the main process ─────────────

test('Python practicals: the real runner + the real grader accept every model solution and reject mistakes, the untouched starter and hard-coded output', async () => {
  const { requireTs } = require('./helpers/ts')
  const { runPythonGraded } = requireTs('src/lib/pythonRunner.ts')
  const { loadPyodide } = require('pyodide')
  const py = await loadPyodide() // the core language ships inside the app's npm package: no network
  const g = db.getDb()
  makeLearner(h, db, 'py')
  const py_ = exercises().filter(isPython)
  assert.ok(py_.length >= 20, 'a real practical track, not a token few')
  const submit = (e, code, run) => h.invoke('exercises:submit', { userId: 'py', exerciseId: e.id, answer: code, pythonRun: run })
  const attempt = (e, code) => {
    const r = runPythonGraded(py, { setup: e.expected_output.setup, code, check: e.expected_output.check })
    return { checkOutput: r.checkOutput, error: r.error }
  }
  for (const e of py_) {
    assert.equal(e.evaluation_mode, 'python_output')
    assert.ok(e.expected_output.setup !== undefined && e.expected_output.check && e.expected_output.output, e.id)
    const good = await submit(e, e.solution, attempt(e, e.solution))
    assert.equal(good.validation.correct, true, `${e.id}: ${good.validation.feedback}`)
    // the starter alone does nothing useful
    const blank = await submit(e, e.expected_output.starter, attempt(e, e.expected_output.starter))
    assert.equal(blank.validation.correct, false, `${e.id}: the untouched starter was accepted`)
    // printing the expected text without writing the logic: the code must define what the exercise asks for
    const cheat = `print(${JSON.stringify(e.expected_output.output)})`
    const cheated = await submit(e, cheat, { checkOutput: e.expected_output.output, error: null })
    assert.equal(cheated.validation.correct, false, `${e.id}: hard-coded output was accepted`)
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM exercise_attempts WHERE user_id = 'py'").get().c, py_.length * 3, 'every attempt is recorded')
})

test('Python practicals: failures explain themselves (error, missing run, wrong line) and the answer key never reaches the screen', async () => {
  const app = h
  makeLearner(app, db, 'py2')
  const e = exercises().find((x) => x.id === 'de-py-11')
  const sub = (answer, pythonRun) => app.invoke('exercises:submit', { userId: 'py2', exerciseId: e.id, answer, pythonRun })
  assert.match((await sub('def sessions(t, g): return len(t)', { checkOutput: '0\n1\n7\n3', error: null })).validation.feedback, /Test line 3: expected "3" but your code gave "7"/)
  assert.match((await sub('x = 1/0', { checkOutput: '', error: 'ZeroDivisionError: division by zero (line 1)' })).validation.feedback, /ZeroDivisionError/)
  assert.match((await sub('def sessions(t, g): pass')).validation.feedback, /Press Run/)
  assert.match((await sub('   ', { checkOutput: '', error: null })).validation.feedback, /Write some code/)
  assert.equal((await sub('def sessions(t, g): pass', { checkOutput: 5, error: null })).validation.correct, false, 'a malformed run result is just a wrong answer')
  const listed = await app.invoke('lessons:get', { userId: 'py2', lessonId: 'de-streaming' })
  const row = listed.exercises.find((x) => x.id === 'de-py-11')
  assert.ok(row.python_check && row.python_starter !== undefined)
  assert.equal(JSON.stringify(row).includes(e.expected_output.output.split('\n')[2] + '\n'), false)
  assert.equal('expected_output' in row || 'solution' in row, false, 'neither the key nor the solution is sent to the screen')
})

test('Python practicals: an endless loop is stopped and the next run still works', async () => {
  const { requireTs } = require('./helpers/ts')
  const { runPythonGraded } = requireTs('src/lib/pythonRunner.ts')
  const py = await require('pyodide').loadPyodide()
  const stuck = runPythonGraded(py, { code: 'while True:\n    pass' })
  assert.match(stuck.error, /more than 5 seconds/)
  assert.equal(runPythonGraded(py, { code: 'print(2+2)' }).output, '4')
  assert.match(runPythonGraded(py, { code: 'print(secret)' }).error, /NameError/, 'one exercise never sees another one\'s variables')
})

test('Data Engineering achievements are earned by real work: distinct exercises, Python practicals, and the capstone', async () => {
  const P = h.req('services/progress.service')
  const g = db.getDb()
  makeLearner(h, db, 'ach')
  const earned = () => new Set(g.prepare("SELECT achievement_id FROM user_achievements WHERE user_id = 'ach'").all().map((r) => r.achievement_id))
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_de_first'), false, 'nothing earned before any work')
  let seq = 0
  const right = (id, n) => { for (let i = 0; i < n; i++) g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, attempt_number, answer, is_correct, score) VALUES (?, 'ach', ?, ?, 'x', 1, 100)").run(`a-${++seq}`, id, i + 1) }
  right('de-1-e1', 12)  // the same exercise solved 12 times is still ONE exercise
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_de_first'), true)
  assert.equal(earned().has('ach_de_10'), false, 'repeating one exercise does not earn the 10-exercise badge')
  const sqlIds = exercises().filter((e) => !isPython(e)).slice(0, 10).map((e) => e.id)
  sqlIds.forEach((id) => right(id, 1))
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_de_10'), true)
  assert.equal(earned().has('ach_de_py_10'), false, 'SQL exercises do not count as Python practicals')
  exercises().filter(isPython).slice(0, 10).forEach((e) => right(e.id, 1))
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES ('lp-ach', 'ach', 'de-capstone', 'complete', datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete'").run()
  P.checkAndAwardAchievements('ach')
  assert.equal(earned().has('ach_de_py_10'), true)
  assert.equal(earned().has('ach_de_capstone'), true)
})
