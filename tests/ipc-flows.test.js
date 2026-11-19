'use strict'
// End-to-end through the IPC layer: the same calls the screens make (window.api.*), answered by the
// real handlers, real SQL engine, real database. This is the closest thing to "click through the app"
// that can run in CI without a display.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const app = bootWithIpc({ prefix: 'dbi-ipc' })
const UID = 'ipc-user'
let db

test.before(async () => {
  db = await app.start()
  makeLearner(app, db, UID)
})

// ───────────────────────── SQL Playground, as the screen drives it ─────────────────────────

test('SQL Playground: list datasets -> auto-load Patients -> run the default query -> see it in history', async () => {
  const { bundled, imported } = await app.invoke('sql:datasets', UID)
  assert.equal(bundled.length, 24) // 4 core practice tables + 7 for Data Engineering + 13 for the Business Problem Solver
  assert.deepEqual(imported, [])

  // SqlAcademy.tsx prefers the Patients dataset on first open.
  const preferred = bundled.find((d) => d.id === 'ds-hospital-patients')
  assert.ok(preferred, 'the Patients dataset the Playground opens with must be registered')

  const sandboxId = `playground_${UID}`
  const loaded = await app.invoke('sql:load-dataset', { sandboxId, datasetId: preferred.id, type: 'bundled', userId: UID })
  assert.equal(loaded.success, true, loaded.error)

  const defaultQuery = src('src/pages/SqlAcademy.tsx').match(/useState\('(-- Write your SQL here[^']*)'\)/)[1].replace(/\\n/g, '\n')
  const res = await app.invoke('sql:execute', { sandboxId, query: defaultQuery, userId: UID })
  assert.equal(res.success, true, res.error)
  assert.equal(res.row_count, 10)
  assert.ok(res.rows[0].patient_name)

  const history = await app.invoke('sql:history', { userId: UID, limit: 5 })
  assert.ok(history.some((h) => h.query === defaultQuery && h.success === 1))

  assert.deepEqual(await app.invoke('sql:close-sandbox', sandboxId), { success: true })
})

test('SQL Playground: switching between all four datasets keeps working', async () => {
  const { bundled } = await app.invoke('sql:datasets', UID)
  const sandboxId = `playground_switch_${UID}`
  for (const ds of bundled) {
    const loaded = await app.invoke('sql:load-dataset', { sandboxId, datasetId: ds.id, type: 'bundled', userId: UID })
    assert.equal(loaded.success, true, `${ds.id}: ${loaded.error}`)
    const res = await app.invoke('sql:execute', { sandboxId, query: `SELECT COUNT(*) AS n FROM ${ds.table_name}`, userId: UID })
    assert.equal(res.rows[0].n, ds.row_count, `${ds.table_name}`)
  }
})

test('Datasets page: import a CSV -> profile -> query it in the Playground -> delete it', async () => {
  const file = path.join(app.tmp, 'students.csv')
  fs.writeFileSync(file, 'student,marks\nAmina,81\nBrian,64\nCynthia,92\n')

  const imp = await app.invoke('files:import', { userId: UID, filePath: file, fileName: 'students.csv' })
  assert.equal(imp.success, true, imp.error)
  assert.equal(imp.profile.row_count, 3)

  const listed = await app.invoke('sql:datasets', UID)
  assert.equal(listed.imported.length, 1)
  const profile = await app.invoke('files:profile', { userId: UID, datasetId: imp.dataset.id })
  assert.equal(profile.column_count, 2)

  const sandboxId = `playground_import_${UID}`
  const loaded = await app.invoke('sql:load-dataset', { sandboxId, datasetId: imp.dataset.id, type: 'imported', userId: UID })
  assert.equal(loaded.success, true, loaded.error)
  const res = await app.invoke('sql:execute', { sandboxId, query: `-- best student\nSELECT student FROM ${loaded.table_name} ORDER BY marks DESC LIMIT 1`, userId: UID })
  assert.equal(res.rows[0].student, 'Cynthia')

  await app.invoke('files:delete', { userId: UID, datasetId: imp.dataset.id })
  assert.equal((await app.invoke('sql:datasets', UID)).imported.length, 0)
})

// ───────────────────────── SQL exercises, as the screen drives them ─────────────────────────

test('every SQL exercise: its solution is accepted and a wrong answer is rejected, through exercises:submit', async () => {
  const exercises = db.getDb().prepare("SELECT id, solution FROM exercises WHERE exercise_type = 'sql_query'").all()
  assert.ok(exercises.length >= 30, `expected the full SQL course, found ${exercises.length}`)
  const failures = []
  for (const ex of exercises) {
    const sandboxId = `ex_${ex.id}_${UID}`
    const good = await app.invoke('exercises:submit', { userId: UID, exerciseId: ex.id, answer: ex.solution, timeSpentS: 5, sandboxId })
    if (!good.validation.correct) failures.push(`${ex.id}: solution rejected (${good.validation.feedback})`)

    const bad = await app.invoke('exercises:submit', { userId: UID, exerciseId: ex.id, answer: "SELECT 'definitely wrong' AS x", timeSpentS: 5, sandboxId })
    if (bad.validation.correct) failures.push(`${ex.id}: a wrong answer was accepted`)
  }
  assert.deepEqual(failures, [])
})

test('submitting records attempts, awards points once solved and remembers mistakes', async () => {
  const ex = db.getDb().prepare("SELECT id, solution, points, lesson_id FROM exercises WHERE exercise_type = 'sql_query' ORDER BY id LIMIT 1").get()
  makeLearner(app, db, 'fresh-learner')
  const attemptsBefore = db.getDb().prepare('SELECT COUNT(*) c FROM exercise_attempts WHERE user_id = ?').get('fresh-learner').c
  const wrong = await app.invoke('exercises:submit', { userId: 'fresh-learner', exerciseId: ex.id, answer: 'SELECT 1', timeSpentS: 3 })
  assert.equal(wrong.success, true)
  assert.equal(wrong.validation.correct, false)
  const right = await app.invoke('exercises:submit', { userId: 'fresh-learner', exerciseId: ex.id, answer: ex.solution, timeSpentS: 3 })
  assert.equal(right.validation.correct, true)

  const attempts = db.getDb().prepare('SELECT attempt_number, is_correct FROM exercise_attempts WHERE user_id = ? ORDER BY attempt_number').all('fresh-learner')
  assert.equal(attempts.length, attemptsBefore + 2)
  assert.deepEqual(attempts.map((a) => a.attempt_number), [1, 2])
  assert.deepEqual(attempts.map((a) => a.is_correct), [0, 1])

  const missing = await app.invoke('exercises:submit', { userId: 'fresh-learner', exerciseId: 'no-such-exercise', answer: 'x' })
  assert.equal(missing.success, false)
})

test('hints come back level by level and are empty for unknown exercises', async () => {
  const ex = db.getDb().prepare("SELECT id, hint_1, hint_2, hint_3 FROM exercises WHERE exercise_type = 'sql_query' LIMIT 1").get()
  assert.equal((await app.invoke('exercises:hint', { exerciseId: ex.id, hintLevel: 1 })).hint, ex.hint_1)
  assert.equal((await app.invoke('exercises:hint', { exerciseId: ex.id, hintLevel: 3 })).hint, ex.hint_3)
  assert.equal((await app.invoke('exercises:hint', { exerciseId: 'nope', hintLevel: 1 })).hint, null)
})

// ───────────────────────── AI settings, as the screen drives them ─────────────────────────

test('REGRESSION: choosing an AI provider in Settings actually changes the provider the tutor uses', async () => {
  assert.equal((await app.invoke('ai:get-provider', UID)).provider, 'gemini', 'default provider')
  await app.invoke('ai:set-provider', { provider: 'groq' })
  assert.equal((await app.invoke('ai:get-provider', UID)).provider, 'groq', 'the choice must stick')
  await app.invoke('ai:set-provider', { provider: 'openai' })
  assert.equal((await app.invoke('ai:get-provider', UID)).provider, 'openai', 'and it must be changeable again')
})

test('AI keys: saved per provider, reported without ever being returned to the screen', async () => {
  assert.equal((await app.invoke('ai:has-key', { userId: UID, provider: 'mistral' })).has_key, false)
  await app.invoke('ai:save-key', { userId: UID, provider: 'mistral', key: 'sk-test-123' })
  const has = await app.invoke('ai:has-key', { userId: UID, provider: 'mistral' })
  assert.deepEqual(has, { has_key: true }, 'the screen only learns THAT a key exists, never the key itself')
  const stored = db.getDb().prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?').get(UID, 'mistral').key_encrypted
  assert.ok(!stored.includes('sk-test-123'), 'the key must not be stored as plain text')
})

// ───────────────────────── the activation gate ─────────────────────────

test('an unactivated copy refuses EVERY data channel, including SQL, AI and the exercises', async () => {
  app.setLicensed(false)
  try {
    const open = new Set(['licence:state', 'licence:activate', 'licence:claim-owner', 'licence:open-link'])
    const dataChannels = [...app.handlers.keys()].filter((c) => !open.has(c))
    assert.ok(dataChannels.length > 50, `expected the whole app surface to be registered, found ${dataChannels.length}`)
    assert.ok(dataChannels.includes('sql:execute') && dataChannels.includes('ai:chat') && dataChannels.includes('exercises:submit'))
    for (const channel of dataChannels) {
      await assert.rejects(app.invoke(channel, {}), /not activated/i, `${channel} must be refused without a licence`)
    }
  } finally {
    app.setLicensed(true)
  }
  assert.equal((await app.invoke('sql:datasets', UID)).bundled.length, 24, 'and works again once licensed')
})
