'use strict'
// Phase 4: spaced review. Completing a lesson schedules the ideas it teaches; right answers move an idea to a longer box, a wrong
// answer sends it back; only due ideas can move; answers are marked by the app and never sent with the questions.
const test = require('node:test')
const assert = require('node:assert/strict')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-review' })
let db, g
test.before(async () => { db = await h.start(); g = db.getDb() })
const item = (u, c) => g.prepare('SELECT * FROM review_items WHERE user_id = ? AND concept_id = ?').get(u, c)
const makeDue = (u, c) => g.prepare("UPDATE review_items SET due_at = datetime('now', '-1 hour') WHERE user_id = ? AND concept_id = ?").run(u, c)
const days = (u, c) => Math.round((Date.parse(item(u, c).due_at.replace(' ', 'T') + 'Z') - Date.now()) / 86400000)
const quizOf = (lessonId) => JSON.parse(g.prepare('SELECT quiz FROM lessons WHERE id = ?').get(lessonId).quiz)
const learnerWith = async (u, lessonId) => {
  makeLearner(h, db, u)
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, 'in_progress') ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'in_progress'").run(`${u}-${lessonId}`, u, lessonId)
  return (await h.invoke('lessons:complete', { userId: u, lessonId, timeSpentS: 1 }))
}

test('completing a lesson schedules the ideas it teaches, once, for tomorrow', async () => {
  assert.equal((await learnerWith('r1', 'sql-where')).success, true)
  const row = item('r1', 'filter')
  assert.deepEqual([row.box, row.reviews], [1, 0]); assert.equal(days('r1', 'filter'), 1)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM review_items WHERE user_id = 'r1'").get().c, 1)
  g.prepare("UPDATE review_items SET box = 3 WHERE user_id = 'r1' AND concept_id = 'filter'").run()
  await h.invoke('lessons:complete', { userId: 'r1', lessonId: 'sql-where', timeSpentS: 1 }) // completing again must not reset the schedule
  assert.equal(item('r1', 'filter').box, 3)
})

test('a lesson that teaches no mapped idea schedules nothing, and a refused mastery completion schedules nothing', async () => {
  makeLearner(h, db, 'r2')
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES ('r2a','r2','fd-value','in_progress') ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='in_progress'").run()
  assert.equal((await h.invoke('lessons:complete', { userId: 'r2', lessonId: 'fd-value' })).success, false)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM review_items WHERE user_id = 'r2'").get().c, 0)
})

test('nothing is due on day one; a due idea comes with a question and no answer', async () => {
  const none = await h.invoke('review:due', 'r1')
  assert.deepEqual([none.enrolled, none.due_total, none.questions.length], [1, 0, 0])
  makeDue('r1', 'filter')
  const d = await h.invoke('review:due', 'r1')
  assert.equal(d.due_total, 1); assert.equal(d.questions.length, 1)
  assert.deepEqual(Object.keys(d.questions[0]).sort(), ['concept', 'id', 'options', 'question'])
  assert.equal(d.questions[0].id.startsWith('filter|sql-where:'), true)
  assert.equal(JSON.stringify(d).includes('correct_index'), false)
})

test('right answers climb the boxes (1, 3, 7, 21 days) and stop at the top; a wrong answer goes back to box 1', async () => {
  const u = 'r1'; const right = quizOf('sql-where').map((q) => q.correct_index)
  g.prepare("UPDATE review_items SET box = 1, reviews = 0 WHERE user_id = 'r1' AND concept_id = 'filter'").run()
  const seen = []
  for (let step = 0; step < 5; step++) {
    makeDue(u, 'filter')
    const q = (await h.invoke('review:due', u)).questions[0]
    const idx = Number(q.id.split(':')[1])
    const r = await h.invoke('review:answer', { userId: u, questionId: q.id, answer: right[idx] })
    assert.equal(r.success, true); assert.equal(r.correct, true)
    seen.push([r.box, r.next_review_days, days(u, 'filter')])
  }
  assert.deepEqual(seen.map((s) => s.slice(0, 2)), [[2, 3], [3, 7], [4, 21], [4, 21], [4, 21]])
  assert.deepEqual(seen.map((s) => s[2]), [3, 7, 21, 21, 21])

  makeDue(u, 'filter')
  const q = (await h.invoke('review:due', u)).questions[0]
  const idx = Number(q.id.split(':')[1])
  const bad = await h.invoke('review:answer', { userId: u, questionId: q.id, answer: (right[idx] + 1) % 4 })
  assert.deepEqual([bad.correct, bad.box, bad.next_review_days, bad.correct_index], [false, 1, 1, right[idx]])
  assert.ok(bad.explanation.length > 5)
  assert.equal(item(u, 'filter').reviews, 6)
})

test('the question changes from one review to the next', async () => {
  makeDue('r1', 'filter'); const a = (await h.invoke('review:due', 'r1')).questions[0].id
  g.prepare("UPDATE review_items SET reviews = reviews + 1 WHERE user_id = 'r1' AND concept_id = 'filter'").run()
  const b = (await h.invoke('review:due', 'r1')).questions[0].id
  assert.notEqual(a, b)
})

test('only a due idea can move, and answers that do not fit are refused without changing anything', async () => {
  await learnerWith('r3', 'sql-where')
  const before = JSON.stringify(item('r3', 'filter'))
  const right = quizOf('sql-where')[0].correct_index
  assert.deepEqual(await h.invoke('review:answer', { userId: 'r3', questionId: 'filter|sql-where:0', answer: right }), { success: false }) // not due yet
  makeDue('r3', 'filter')
  const dueRow = JSON.stringify(item('r3', 'filter'))
  for (const [questionId, answer] of [['filter|sql-where:0', 9], ['filter|sql-where:0', -1], ['filter|sql-where:0', 0.5], ['filter|sql-where:0', '0'], ['filter|sql-where:99', 0],
    ['nonsense', 0], ['aggregate|sql-groupby:0', 0], [null, 0], [42, 0]]) {
    assert.deepEqual(await h.invoke('review:answer', { userId: 'r3', questionId, answer }), { success: false }, `${questionId} ${answer}`)
  }
  assert.equal(JSON.stringify(item('r3', 'filter')), dueRow)
  assert.notEqual(before, dueRow)
  const ok = await h.invoke('review:answer', { userId: 'r3', questionId: 'filter|sql-where:0', answer: right })
  assert.equal(ok.success, true)
  assert.deepEqual(await h.invoke('review:answer', { userId: 'r3', questionId: 'filter|sql-where:0', answer: right }), { success: false }, 'answering again right away cannot climb further')
})

test('a session holds at most five ideas, oldest first, and ideas are per learner', async () => {
  makeLearner(h, db, 'r4')
  for (const [i, c] of ['table', 'filter', 'aggregate', 'join', 'metric', 'kpi', 'trend'].entries()) {
    g.prepare("INSERT INTO review_items (user_id, concept_id, box, due_at) VALUES ('r4', ?, 1, datetime('now', ?))").run(c, `-${10 - i} hours`)
  }
  const d = await h.invoke('review:due', 'r4')
  assert.equal(d.due_total, 7); assert.equal(d.questions.length, 5)
  assert.deepEqual(d.questions.map((q) => q.id.split('|')[0]), ['table', 'filter', 'aggregate', 'join', 'metric'])
  assert.equal((await h.invoke('review:due', 'r3')).enrolled, 1)
})

test('the card, the channels and the dashboard are wired', () => {
  assert.match(src('electron/preload.ts'), /'review:due'/); assert.match(src('electron/preload.ts'), /'review:answer'/)
  assert.match(src('src/pages/Dashboard.tsx'), /<ReviewCard \/>/)
  const card = src('src/components/ui/ReviewCard.tsx')
  assert.match(card, /Review: 5 minutes/); assert.match(card, /if \(!due \|\| \(due\.due_total === 0 && !finished\)\) return null/)
  assert.match(src('electron/ipc/handlers.ts'), /try \{ enrollConcepts\(userId, lessonId\) \} catch/)
})
