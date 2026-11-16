'use strict'
// "What next": continue point, streak (in the student's own timezone), progress per academy, and exercises
// worth another go - all computed from real progress rows of the shipped curriculum.
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, makeLearner } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-plan' })
let P, db
const stamp = (d) => d.toISOString().slice(0, 16).replace('T', ' ')
const localNoon = (offsetDays, base = new Date()) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays, 12, 0)

test.before(async () => {
  db = h.req('db/database'); await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  makeLearner(h, db, 'L1')
  P = h.req('services/progress.service')
})

test('streak counts consecutive local days; today may still be empty; a gap ends it', () => {
  const now = new Date()
  const days = (...offs) => offs.map((o) => stamp(localNoon(o)))
  assert.deepEqual(P.streakFrom(days(0, -1, -2), now), { streak: 3, activeToday: true })
  assert.deepEqual(P.streakFrom(days(-1, -2), now), { streak: 2, activeToday: false }, 'yesterday still counts until today ends')
  assert.deepEqual(P.streakFrom(days(0, -2, -3), now), { streak: 1, activeToday: true })
  assert.deepEqual(P.streakFrom(days(-2, -3), now), { streak: 0, activeToday: false })
  assert.deepEqual(P.streakFrom([], now), { streak: 0, activeToday: false })
  assert.deepEqual(P.streakFrom(['not a date', ''], now), { streak: 0, activeToday: false })
})

test('a late-evening UTC time lands on the student\'s own calendar day', () => {
  const now = new Date(2026, 5, 10, 8, 0) // 10 June, local
  const justAfterLocalMidnight = new Date(2026, 5, 10, 0, 20) // 00:20 local = whatever UTC says
  assert.equal(P.streakFrom([stamp(justAfterLocalMidnight)], now).activeToday, true)
})

test('a new learner is pointed at the first open lesson, then at the one in progress, then the next unlocked', () => {
  let plan = P.getLearningPlan('L1')
  assert.ok(plan.next, 'there is somewhere to start')
  assert.ok(['new', 'available'].includes(plan.next.status))
  assert.equal(plan.next.module, 'sql')
  assert.equal(plan.streak_days, 0)

  const first = plan.next.lesson_id
  db.getDb().prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES ('p1','L1',?,'available') ON CONFLICT(user_id, lesson_id) DO UPDATE SET id = 'p1'").run(first)
  db.getDb().prepare("UPDATE lesson_progress SET status='in_progress', started_at=datetime('now') WHERE id='p1'").run()
  plan = P.getLearningPlan('L1')
  assert.deepEqual([plan.next.lesson_id, plan.next.status], [first, 'in_progress'])
  assert.equal(plan.active_today, true)
  assert.equal(plan.streak_days, 1)

  db.getDb().prepare("UPDATE lesson_progress SET status='complete', completed_at=datetime('now') WHERE id='p1'").run()
  plan = P.getLearningPlan('L1')
  assert.notEqual(plan.next?.lesson_id, first, 'a finished lesson is never offered again')
})

test('progress per academy counts only this learner\'s completed lessons', () => {
  const plan = P.getLearningPlan('L1')
  const sql = plan.modules.find((m) => m.module === 'sql')
  assert.equal(sql.complete, 1)
  assert.ok(sql.total > 1)
  assert.deepEqual(plan.modules.map((m) => m.module).slice(0, 3), ['sql', 'excel', 'python'].filter((m) => plan.modules.some((x) => x.module === m)))
  makeLearner(h, db, 'L2')
  assert.equal(P.getLearningPlan('L2').modules.find((m) => m.module === 'sql').complete, 0)
})

test('an exercise missed days ago comes back for review until it is answered correctly', () => {
  const ex = db.getDb().prepare("SELECT id FROM exercises WHERE evaluation_mode IN ('exact','result_match') LIMIT 1").get().id
  const add = (id, ok, ago) => db.getDb().prepare(`INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, attempted_at) VALUES (?, 'L1', ?, 'x', ?, datetime('now', ?))`).run(id, ex, ok, ago)
  add('a1', 0, '-10 minutes')
  assert.equal(P.getLearningPlan('L1').review.length, 0, 'a miss from just now is a retry, not a review')
  add('a2', 0, '-3 days')
  db.getDb().prepare("DELETE FROM exercise_attempts WHERE id = 'a1'").run()
  const r = P.getLearningPlan('L1').review
  assert.equal(r.length, 1); assert.equal(r[0].exercise_id, ex)
  add('a3', 1, '-1 hours')
  assert.equal(P.getLearningPlan('L1').review.length, 0, 'once answered correctly it leaves the list')
})

test('the dashboard carries the plan, and a learner with no data at all still gets a sane one', () => {
  makeLearner(h, db, 'L3')
  const d = P.getDashboardStats('L3')
  assert.ok(d.plan && Array.isArray(d.plan.modules) && d.plan.streak_days === 0 && d.plan.review.length === 0)
})
