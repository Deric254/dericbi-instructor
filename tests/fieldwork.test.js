'use strict'
// Phase 7: real-world tasks. A learner records what they did outside the app and what they learned; the app stores exactly their
// words on their own computer, never invents results, shows them in the portfolio, includes them in progress backups, and does
// not let them block or change any lesson.
const test = require('node:test')
const assert = require('node:assert/strict')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-fieldwork' })
let db
test.before(async () => { db = await h.start(); makeLearner(h, db, 'ann'); makeLearner(h, db, 'ben') })
const DID = 'I spoke to five shop owners in Kapsoya on Tuesday and Wednesday, and wrote down what each said.'
const LEARNED = 'Four of the five already pay someone to fetch float, so the problem is real, but only two liked my price.'

test('a lesson that sets a task returns it from its own text; a lesson without one returns nothing', async () => {
  const t = await h.invoke('fieldwork:get', { userId: 'ann', lessonId: 'fo-interviews' })
  assert.match(t.task, /Interview five people who have the problem/)
  assert.deepEqual([t.did, t.learned, t.saved, t.updated_at], ['', '', false, null])
  assert.equal(await h.invoke('fieldwork:get', { userId: 'ann', lessonId: 'sql-select' }), null, 'only Start Here and Founder lessons set tasks')
  assert.equal(await h.invoke('fieldwork:get', { userId: 'ann', lessonId: 'no-such-lesson' }), null)
  for (const id of ['fd-value', 'fd-first-principles', 'fo-problem', 'fo-iterate']) assert.ok(await h.invoke('fieldwork:get', { userId: 'ann', lessonId: id }), id)
})

test('saving stores exactly the learner\'s words; blank, one-word, oversized and wrong-lesson saves are refused and store nothing', async () => {
  const g = db.getDb(); const rows = () => g.prepare("SELECT COUNT(*) c FROM field_tasks WHERE user_id = 'ann'").get().c
  const save = (lessonId, did, learned) => h.invoke('fieldwork:save', { userId: 'ann', lessonId, did, learned })
  assert.deepEqual(await save('fo-interviews', '', LEARNED), { success: false, reason: 'short' })
  assert.deepEqual(await save('fo-interviews', DID, 'ok'), { success: false, reason: 'short' })
  assert.deepEqual(await save('fo-interviews', 'x'.repeat(2001), LEARNED), { success: false, reason: 'invalid' })
  assert.deepEqual(await save('fo-interviews', 42, LEARNED), { success: false, reason: 'invalid' })
  assert.deepEqual(await save('sql-select', DID, LEARNED), { success: false, reason: 'unavailable' })
  assert.equal(rows(), 0)
  assert.deepEqual(await save('fo-interviews', `  ${DID}  `, LEARNED), { success: true })
  const back = await h.invoke('fieldwork:get', { userId: 'ann', lessonId: 'fo-interviews' })
  assert.deepEqual([back.did, back.learned, back.saved], [DID, LEARNED, true])
  assert.deepEqual(await save('fo-interviews', DID + ' Then I went back on Friday.', LEARNED), { success: true })
  assert.equal(rows(), 1, 'editing replaces the entry, it does not add another')
  assert.match((await h.invoke('fieldwork:get', { userId: 'ann', lessonId: 'fo-interviews' })).did, /went back on Friday/)
})

test('one learner never sees or changes another learner\'s entries', async () => {
  await h.invoke('fieldwork:save', { userId: 'ann', lessonId: 'fo-problem', did: DID, learned: LEARNED })
  assert.equal((await h.invoke('fieldwork:get', { userId: 'ben', lessonId: 'fo-problem' })).saved, false)
  assert.deepEqual(await h.invoke('fieldwork:list', 'ben'), [])
  const list = await h.invoke('fieldwork:list', 'ann')
  assert.equal(list.length, 2)
  assert.deepEqual(Object.keys(list[0]).sort(), ['did', 'learned', 'lesson_id', 'lesson_title', 'module', 'updated_at'])
  assert.equal((await h.invoke('fieldwork:delete', { userId: 'ben', lessonId: 'fo-problem' })).success, false, 'ben has nothing to delete there')
  assert.equal((await h.invoke('fieldwork:list', 'ann')).length, 2)
  assert.equal((await h.invoke('fieldwork:delete', { userId: 'ann', lessonId: 'fo-problem' })).success, true)
  assert.deepEqual((await h.invoke('fieldwork:list', 'ann')).map((r) => r.lesson_id), ['fo-interviews'])
})

test('a task is optional: recording one (or not) never changes whether a lesson can complete', async () => {
  const before = await h.invoke('lessons:complete', { userId: 'ben', lessonId: 'fo-market', timeSpentS: 1 })
  assert.equal(before.success, false)
  assert.ok(!before.mastery_gaps.some((g) => /real|task|did/i.test(g)), 'the task is not listed as a gap')
  assert.equal(before.mastery_gaps.length, 3)
})

test('progress backups carry the task entries and the mastery records of earlier phases, and restoring twice adds nothing new', async () => {
  const B = h.req('services/backup.service'); const g = db.getDb()
  await h.invoke('quizzes:submit', { userId: 'ann', lessonId: 'fo-interviews', answers: JSON.parse(g.prepare("SELECT quiz FROM lessons WHERE id = 'fo-interviews'").get().quiz).map((q) => q.correct_index) })
  const data = B.exportProgress('ann')
  for (const t of ['field_tasks', 'quiz_results', 'placement_results', 'review_items', 'explain_results']) assert.ok(Array.isArray(data.tables[t]), `${t} is in the backup`)
  assert.equal(data.tables.field_tasks.length, 1); assert.ok(data.tables.quiz_results.length >= 1)
  makeLearner(h, db, 'cy')
  const first = B.importProgress('cy', data); assert.equal(first.success, true)
  assert.deepEqual((await h.invoke('fieldwork:get', { userId: 'cy', lessonId: 'fo-interviews' })).did, DID + ' Then I went back on Friday.')
  assert.ok(g.prepare("SELECT COUNT(*) c FROM quiz_results WHERE user_id = 'cy'").get().c >= 1)
  const again = B.importProgress('cy', data)
  assert.equal(again.added, 0, 'restoring the same backup twice changes nothing')
  assert.equal(B.importProgress('cy', { format: 'dericbi-progress', version: 1, tables: { lesson_progress: [] } }).success, true, 'a backup from the earlier version still restores')
})

test('the screens are wired: the task form under each lesson, the evidence in the portfolio, and the channels are classed read or write', () => {
  assert.match(src('src/pages/SqlAcademy.tsx'), /<RealWorldTask lessonId=\{lesson\.id\} \/>/)
  assert.match(src('src/pages/Portfolio.tsx'), /<FieldEvidence entries=\{field\} \/>/)
  assert.match(src('electron/licensing/licence-gate.ts'), /'fieldwork:get', 'fieldwork:list'/)
  assert.match(src('electron/preload.ts'), /fieldwork: \{/)
  assert.match(src('src/components/ui/RealWorldTask.tsx'), /never fills this in for you/)
})
