'use strict'
// An app update re-seeds the lessons. It must refresh the content and NEVER touch a student's own progress:
// lesson status, exercise attempts, points, rank, skill scores, saved databases.
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, makeLearner } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-upgrade' })
let db, setup, g

test.before(async () => {
  db = h.req('db/database'); await db.initDb(); g = db.getDb()
  setup = h.req('services/setup.service'); await setup.runFirstTimeSetup(() => {})
  makeLearner(h, db, 'S')
})
const reseed = async () => { g.prepare("UPDATE app_settings SET value = '0' WHERE key = 'setup_version'").run(); await setup.runFirstTimeSetup(() => {}) }

test('re-seeding after an update keeps every student\'s progress, attempts, points and databases', async () => {
  const ex = g.prepare('SELECT id, lesson_id FROM exercises LIMIT 1').get()
  g.prepare("UPDATE lesson_progress SET status = 'complete', completed_at = datetime('now'), time_spent_s = 321 WHERE user_id = 'S' AND lesson_id = ?").run(ex.lesson_id)
  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, score) VALUES ('att-1','S',?,'SELECT 1',1,100)").run(ex.id)
  g.prepare("UPDATE analyst_ranks SET total_points = 777 WHERE user_id = 'S'").run()
  g.prepare("UPDATE skill_ratings SET score = 42 WHERE user_id = 'S' AND skill = 'sql'").run()
  const ud = h.req('services/userdb.service'); const made = await ud.createUserDatabase('S', 'Keep me')

  const snap = () => ({
    lessons: g.prepare("SELECT lesson_id, status, time_spent_s FROM lesson_progress WHERE user_id = 'S' ORDER BY lesson_id").all(),
    attempts: g.prepare("SELECT id, is_correct, score FROM exercise_attempts WHERE user_id = 'S'").all(),
    points: g.prepare("SELECT total_points FROM analyst_ranks WHERE user_id = 'S'").get(),
    skill: g.prepare("SELECT score FROM skill_ratings WHERE user_id = 'S' AND skill = 'sql'").get(),
    dbs: g.prepare("SELECT id, name FROM user_databases WHERE user_id = 'S'").all(),
  })
  const before = snap()
  assert.equal(before.attempts.length, 1); assert.equal(before.dbs.length, 1); assert.equal(made.success, true)
  await reseed(); await reseed() // twice: also idempotent
  assert.deepEqual(snap(), before)
})

test('re-seeding still refreshes the lesson and exercise content itself', async () => {
  const lesson = g.prepare('SELECT id, title FROM lessons LIMIT 1').get()
  const ex = g.prepare('SELECT id, prompt FROM exercises LIMIT 1').get()
  g.prepare("UPDATE lessons SET title = 'STALE' WHERE id = ?").run(lesson.id)
  g.prepare("UPDATE exercises SET prompt = 'STALE' WHERE id = ?").run(ex.id)
  const count = () => ({ l: g.prepare('SELECT COUNT(*) c FROM lessons').get().c, e: g.prepare('SELECT COUNT(*) c FROM exercises').get().c })
  const n = count()
  await reseed()
  assert.equal(g.prepare('SELECT title FROM lessons WHERE id = ?').get(lesson.id).title, lesson.title)
  assert.equal(g.prepare('SELECT prompt FROM exercises WHERE id = ?').get(ex.id).prompt, ex.prompt)
  assert.deepEqual(count(), n, 'no lesson or exercise duplicated or lost')
})

test('no seed code in the app can delete-and-reinsert (INSERT OR REPLACE) tables that students\' progress hangs off', () => {
  const fs = require('node:fs'), path = require('node:path')
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : []))
  const bad = walk(path.join(h.ROOT, 'electron')).filter((f) => /INSERT\s+OR\s+REPLACE\s+INTO\s+(lessons|exercises|users|user_databases)\b/i.test(fs.readFileSync(f, 'utf8')))
  assert.deepEqual(bad, [])
})
