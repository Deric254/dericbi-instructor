'use strict'
// A learner's progress can be saved to a file and restored: nothing secret goes in, nothing already earned is
// undone, restoring twice changes nothing, and a stranger's file is refused.
const test = require('node:test')
const assert = require('node:assert/strict')
const { makeLearner, makeUser, src } = require('./helpers/harness')
const { bootWithIpc } = require('./helpers/ipc')

const h = bootWithIpc({ prefix: 'dbi-backup' })
let db, B
test.before(async () => {
  db = await h.start()
  B = h.req('services/backup.service')
  for (const id of ['ann', 'ben', 'cy']) makeLearner(h, db, id, `${id}@x.com`)
})

const one = (sql, ...a) => db.getDb().prepare(sql).get(...a)
const status = (u, lesson) => one('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', u, lesson)?.status

// a learner only has a row for lessons that are open to them; make or change one the way the app does
function setLesson(u, lesson, st) {
  db.getDb().prepare(`INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at, time_spent_s) VALUES (?, ?, ?, ?, CASE WHEN ? = 'complete' THEN datetime('now') END, 600)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = excluded.status, completed_at = excluded.completed_at`).run(`lp-${u}-${lesson}`, u, lesson, st, st)
}

function earn(u) {
  const g = db.getDb()
  setLesson(u, 'de-foundations', 'complete')
  setLesson(u, 'de-profiling', 'in_progress')
  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, attempt_number, answer, is_correct, score) VALUES (?, ?, 'de-1-e1', 1, 'SELECT 1', 1, 100)").run('att-' + u, u)
  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, attempt_number, answer, is_correct, score) VALUES (?, ?, 'de-py-1', 1, 'def count_by(r,k): pass', 0, 0)").run('att2-' + u, u)
  g.prepare("INSERT INTO projects (id, user_id, title, description, project_type) VALUES (?, ?, 'My capstone', 'd', 'guided')").run('proj-' + u, u)
  g.prepare("INSERT INTO portfolio_items (id, user_id, project_id, title, summary) VALUES (?, ?, ?, 'Case study', 's')").run('pf-' + u, u, 'proj-' + u)
}

test('a backup holds learning data only: no password, licence or AI keys', () => {
  earn('ann')
  g_setKey('ann')
  const text = JSON.stringify(B.exportProgress('ann'))
  assert.equal(B.exportProgress('ann').format, 'dericbi-progress')
  assert.doesNotMatch(text, /password|api_key|SECRET-KEY-123|licen[cs]e/i)
  assert.equal(B.exportProgress('ann').tables.exercise_attempts.length, 2)
  assert.equal(B.exportProgress('ben').tables.exercise_attempts.length, 0, 'only that learner\'s rows')
})
function g_setKey(u) { try { db.getDb().prepare("INSERT INTO api_keys (id, user_id, provider, encrypted_key) VALUES ('k1', ?, 'gemini', 'SECRET-KEY-123')").run(u) } catch { /* schema may name the column differently */ } }

test('restoring into another learner brings the progress across, with project links intact', () => {
  const data = JSON.parse(JSON.stringify(B.exportProgress('ann')))
  const r = B.importProgress('ben', data)
  assert.equal(r.success, true)
  assert.ok(r.added >= 5, 'lessons, attempts, project and portfolio were added')
  assert.equal(status('ben', 'de-foundations'), 'complete')
  assert.equal(status('ben', 'de-profiling'), 'in_progress')
  assert.equal(one("SELECT COUNT(*) c FROM exercise_attempts WHERE user_id = 'ben'").c, 2)
  const item = one("SELECT project_id FROM portfolio_items WHERE user_id = 'ben'")
  assert.equal(one('SELECT user_id FROM projects WHERE id = ?', item.project_id).user_id, 'ben', 'the portfolio item points at ben\'s own copy of the project')
  assert.equal(one("SELECT COUNT(*) c FROM exercise_attempts WHERE user_id = 'ann'").c, 2, 'the original learner is untouched')
})

test('restoring the same file again changes nothing', () => {
  const data = JSON.parse(JSON.stringify(B.exportProgress('ann')))
  const before = one("SELECT (SELECT COUNT(*) FROM exercise_attempts WHERE user_id = 'ben') a, (SELECT COUNT(*) FROM projects WHERE user_id = 'ben') p").a
  B.importProgress('ben', data)
  B.importProgress('ben', data)
  assert.equal(one("SELECT COUNT(*) a FROM exercise_attempts WHERE user_id = 'ben'").a, before)
  assert.equal(one("SELECT COUNT(*) a FROM projects WHERE user_id = 'ben'").a, 1)
})

test('a lesson only moves forward: an older backup never undoes work done since', () => {
  const old = JSON.parse(JSON.stringify(B.exportProgress('ann')))
  setLesson('cy', 'de-profiling', 'complete')
  B.importProgress('cy', old)
  assert.equal(status('cy', 'de-profiling'), 'complete', 'cy had finished it already; the backup says in progress')
  assert.equal(status('cy', 'de-foundations'), 'complete', 'and the finished lesson from the backup was brought forward')
})

test('files that are not a progress backup, or do not fit, are refused or skipped safely', () => {
  for (const bad of [null, 5, 'x', [], {}, { format: 'other', version: 1, tables: {} }, { format: 'dericbi-progress', version: 99, tables: {} }, { format: 'dericbi-progress', version: 1 }]) {
    assert.equal(B.importProgress('cy', bad).success, false, JSON.stringify(bad))
  }
  const odd = { format: 'dericbi-progress', version: 1, tables: { exercise_attempts: [{ id: 'z', exercise_id: 'no-such-exercise', answer: 'x' }, 7, null, {}], lesson_progress: [{ id: 'q', lesson_id: 'gone', status: 'complete' }], not_a_table: [{ a: 1 }] } }
  const r = B.importProgress('cy', odd)
  assert.equal(r.success, true)
  assert.equal(r.added, 0)
  assert.equal(r.skipped, 5)
  assert.equal(one("SELECT COUNT(*) c FROM exercise_attempts WHERE exercise_id = 'no-such-exercise'").c, 0)
})

test('licence: saving is allowed when view-only, restoring (a change) is not; the screen offers both', () => {
  const gate = src('electron/licensing/licence-gate.ts')
  assert.match(gate, /'progress:export'/)
  assert.doesNotMatch(gate, /'progress:import'/)
  assert.match(src('src/pages/Settings.tsx'), /Save my progress to a file[\s\S]*Restore from a file/)
  assert.match(src('electron/ipc/handlers.ts'), /registerBackupHandlers\(\)/)
})
