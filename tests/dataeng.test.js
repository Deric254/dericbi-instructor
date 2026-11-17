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
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the course is seeded as its own module with 13 lessons and does not add a skill or change the others', () => {
  const g = db.getDb()
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'dataeng'").get().c, 13)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'sql'").get().c, 10)
  assert.equal(g.prepare("SELECT DISTINCT exercise_type t FROM exercises WHERE lesson_id LIKE 'de-%'").all().map((r) => r.t).join(), 'sql_query')
  assert.equal(g.prepare("SELECT COUNT(*) c FROM skill_ratings WHERE skill = 'dataeng'").get().c, 0)
})

test('the practice data is identical on every machine and carries the traps the lessons teach', async () => {
  const r = await sql.executeSQL({ sandboxId: 'ex_de-probe_u', userId: 'u', query: 'SELECT (SELECT COUNT(*) FROM raw_events) a, (SELECT COUNT(DISTINCT event_id) FROM raw_events) b, (SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.customer_id=o.customer_id WHERE c.customer_id IS NULL) c, (SELECT COUNT(*) FROM pipeline_runs) d, (SELECT COUNT(*) FROM llm_requests) e, (SELECT COUNT(*) FROM ml_features) f' })
  assert.equal(r.success, true, r.error)
  assert.deepEqual(r.rows[0].map ? r.rows[0].map(Number) : Object.values(r.rows[0]).map(Number), [3240, 3000, 30, 360, 2000, 300])
})

test('every model answer is accepted by the real grader, on every exercise (and none returns an empty result)', async () => {
  assert.ok(exercises().length >= 38)
  for (const e of exercises()) {
    const r = await grade(e.id, e.solution, e.solution)
    assert.equal(r.correct, true, `${e.id}: ${r.feedback}`)
    assert.ok((r.actual_total ?? 1) > 0, `${e.id}: model answer returns nothing`)
  }
})

test('wrong answers are rejected on every exercise: an unrelated query, and a query with the right shape but wrong filter', async () => {
  for (const e of exercises()) {
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
  assert.equal(de.length, 13)
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
