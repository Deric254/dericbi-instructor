'use strict'
// First launch and app UPDATES - the moments when "the data wasn't loaded" bugs appear.
// Kept in its own file because it needs a pristine process (the SQL service caches a little state).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot, makeUser } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-firstrun' })
const UID = 'first-run-user'
let db, S, setup

const run = (sandboxId, query) => S.executeSQL({ sandboxId, query, userId: UID })
const patientsCsv = () => fs.readFileSync(path.join(h.datasetsDir, 'hospital_patients.csv'), 'utf8').trim().split('\n')
const stillAdmitted = () => patientsCsv().slice(1).filter((l) => l.endsWith(',')).length

test.before(async () => {
  db = h.req('db/database')
  await db.initDb()
  makeUser(db, UID)
  S = h.req('services/sql.service')
  setup = h.req('services/setup.service')
})

test('RACE: opening an exercise before first-time setup finishes must not break exercises opened afterwards', async () => {
  // At this moment bundled_datasets is still empty - the timing edge case described in sql.service.ts.
  assert.equal(db.getDb().prepare('SELECT COUNT(*) c FROM bundled_datasets').get().c, 0)
  const early = await run('ex_early_u', 'SELECT COUNT(*) c FROM patients')
  assert.equal(early.success, false, 'no data exists yet, so this early attempt cannot succeed')

  await setup.runFirstTimeSetup(() => {})

  // The empty list seen above must NOT have been remembered forever.
  const fresh = await run('ex_later_u', 'SELECT COUNT(*) c FROM patients')
  assert.equal(fresh.success, true, fresh.error)
  assert.ok(fresh.rows[0].c > 0)

  // And retrying the very same exercise sandbox that failed earlier now works too.
  const retry = await run('ex_early_u', 'SELECT COUNT(*) c FROM patients')
  assert.equal(retry.success, true, retry.error)
  assert.ok(retry.rows[0].c > 0)
})

test('setup is safe to run again: nothing is duplicated and nothing is lost', async () => {
  const count = (sql) => db.getDb().prepare(sql).get().c
  const before = { lessons: count('SELECT COUNT(*) c FROM lessons'), ex: count('SELECT COUNT(*) c FROM exercises'), ds: count('SELECT COUNT(*) c FROM bundled_datasets'), ach: count('SELECT COUNT(*) c FROM achievements') }
  assert.ok(before.lessons >= 60 && before.ex >= 100 && before.ds === 11 && before.ach >= 20, JSON.stringify(before))
  const csvBefore = patientsCsv().join('\n')

  await setup.runFirstTimeSetup(() => {})
  await setup.runFirstTimeSetup(() => {})

  assert.deepEqual({ lessons: count('SELECT COUNT(*) c FROM lessons'), ex: count('SELECT COUNT(*) c FROM exercises'), ds: count('SELECT COUNT(*) c FROM bundled_datasets'), ach: count('SELECT COUNT(*) c FROM achievements') }, before)
  assert.equal(patientsCsv().join('\n'), csvBefore, 'existing practice data must not be rewritten on every launch')
})

test('UPDATE: an install holding OLD practice files (nobody still admitted) is upgraded to working data', async () => {
  // Reproduce what an existing student has on disk: patients who all have discharge dates, no version marker.
  const file = path.join(h.datasetsDir, 'hospital_patients.csv')
  const old = patientsCsv().map((l, i) => (i > 0 && l.endsWith(',') ? `${l}2024-12-31` : l))
  fs.writeFileSync(file, old.join('\n'))
  fs.rmSync(path.join(h.datasetsDir, '.dataset-version'), { force: true })
  db.getDb().prepare("UPDATE app_settings SET value = '4' WHERE key = 'setup_version'").run()
  assert.equal(stillAdmitted(), 0, 'precondition: old-style data')

  await setup.runFirstTimeSetup(() => {}) // what happens on the first launch after updating

  assert.ok(stillAdmitted() > 0, 'after the update the data must contain patients who are still admitted')
  assert.ok(fs.existsSync(path.join(h.datasetsDir, '.dataset-version')))

  const fresh = await run('ex_after_update_u', 'SELECT COUNT(*) c FROM patients WHERE discharge_date IS NULL')
  assert.ok(fresh.rows[0].c > 0, '"still admitted" queries must return rows')
})

test('students own imported files survive a data refresh (only the four bundled files are regenerated)', async () => {
  const mine = path.join(h.datasetsDir, 'my-own-upload.csv')
  fs.writeFileSync(mine, 'a\n1\n')
  fs.rmSync(path.join(h.datasetsDir, '.dataset-version'), { force: true })
  await setup.ensureDatasetFiles()
  assert.equal(fs.readFileSync(mine, 'utf8'), 'a\n1\n')
})
