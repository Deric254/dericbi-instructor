'use strict'
// The backup reminder: shown only when a learner has real work to lose and no recent copy; saving resets it; it is per learner.
const test = require('node:test')
const assert = require('node:assert/strict')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-bkrem' })
let db, B
const g = () => db.getDb()
const complete = (u, n) => { const ids = g().prepare('SELECT id FROM lessons ORDER BY id LIMIT ?').all(n).map((r) => r.id); for (const id of ids) g().prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, 'complete') ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete'").run(`${u}-${id}`, u, id) }

test.before(async () => {
  db = await h.start()
  B = h.req('services/backup.service'); for (const u of ['a', 'b']) makeLearner(h, db, u)
})

test('a newcomer is never nagged, a learner with real work and no copy is reminded', () => {
  assert.equal(B.backupStatus('a').due, false)
  complete('a', B.BACKUP_REMINDER.min_lessons_complete - 1); assert.equal(B.backupStatus('a').due, false)
  complete('a', B.BACKUP_REMINDER.min_lessons_complete)
  const s = B.backupStatus('a'); assert.equal(s.due, true); assert.equal(s.last_saved, null); assert.equal(s.days_since, null)
})

test('saving silences it for the set number of days, then it returns, and only for that learner', () => {
  const t0 = new Date('2026-11-26T10:00:00Z'); B.noteSaved('a', t0)
  const day = (n) => new Date(t0.getTime() + n * 86_400_000)
  assert.equal(B.backupStatus('a', day(0)).due, false)
  assert.equal(B.backupStatus('a', day(B.BACKUP_REMINDER.every_days - 1)).due, false)
  assert.equal(B.backupStatus('a', day(B.BACKUP_REMINDER.every_days)).due, true)
  assert.equal(B.backupStatus('a', day(3)).days_since, 3)
  complete('b', 5); assert.equal(B.backupStatus('b', day(1)).due, true, 'another learner\'s save does not count')
})

test('a damaged saved date counts as never saved, and the clock going backwards is safe', () => {
  g().prepare("INSERT INTO app_settings (key, value) VALUES ('progress_saved_b', 'garbage') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
  assert.equal(B.backupStatus('b').last_saved, null); assert.equal(B.backupStatus('b').due, true)
  B.noteSaved('b', new Date('2030-01-01T00:00:00Z')); assert.equal(B.backupStatus('b', new Date('2026-01-01T00:00:00Z')).days_since, 0)
})

test('saving through the real channel records it, the status channel works, and the dashboard shows the reminder', async () => {
  assert.equal((await h.invoke('progress:backup-status', { userId: 'a' })).lessons_complete >= 3, true)
  assert.match(src('electron/ipc/handlers.ts'), /noteSaved\(userId\)/)
  assert.match(src('src/pages/Dashboard.tsx'), /<BackupReminder \/>/); assert.match(src('src/components/ui/BackupReminder.tsx'), /progress_backup\.status/)
})
