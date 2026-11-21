'use strict'
// Phase 3: the placement check. The app marks it, a learner can say "I don't know yet", the first concept that is not known
// ends the run, known lessons are opened but never marked complete, and the learning plan stops suggesting lessons already known.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-placement' })
let db, g, lessons
test.before(async () => {
  db = await h.start(); g = db.getDb()
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/foundations/curriculum.json'), 'utf8')).lessons
})
const ids = () => lessons.map((l) => l.id)
// An answer sheet: the first `right` lessons answered correctly, the rest answered with a wrong option or "I don't know yet" (-1).
const sheet = (right, rest = -1) => Object.fromEntries(lessons.flatMap((l, i) => [0, 1].map((k) =>
  [`${l.id}:${k}`, i < right ? l.quiz[k].correct_index : rest === 'wrong' ? (l.quiz[k].correct_index + 1) % 4 : -1])))
const status = (u, id) => g.prepare('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(u, id)?.status
const known = (u) => g.prepare('SELECT concept_id FROM placement_results WHERE user_id = ? AND known = 1').all(u).length

test('the check asks 2 questions per Start Here lesson, in teaching order, and never sends the answers', async () => {
  makeLearner(h, db, 'p0')
  const p = await h.invoke('placement:get', 'p0')
  assert.equal(p.result, null)
  assert.deepEqual(p.questions.map((q) => q.id), ids().flatMap((id) => [`${id}:0`, `${id}:1`]))
  for (const q of p.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['concept', 'id', 'options', 'question'])
    assert.equal(q.options.length, 4)
  }
  assert.equal(JSON.stringify(p).includes('correct_index'), false)
  assert.equal(JSON.stringify(p).includes('explanation'), false)
})

test('answers that do not fit the questions are refused and nothing is saved', async () => {
  makeLearner(h, db, 'p1')
  const good = sheet(3)
  const missing = { ...good }; delete missing['fd-value:0']
  for (const answers of [null, 'x', [], {}, missing, { ...good, 'fd-value:0': -2 }, { ...good, 'fd-value:0': 4 }, { ...good, 'fd-value:0': 0.5 }, { ...good, 'fd-value:0': '1' }]) {
    assert.deepEqual(await h.invoke('placement:submit', { userId: 'p1', answers }), { success: false })
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM placement_results WHERE user_id = 'p1'").get().c, 0)
})

test('"I don\'t know yet" to everything: nothing is known, only lesson 1 is open, nothing is complete', async () => {
  makeLearner(h, db, 'p2')
  const r = await h.invoke('placement:submit', { userId: 'p2', answers: sheet(0) })
  assert.equal(r.success, true); assert.deepEqual(r.result, { known: [], total: 8 })
  assert.equal(known('p2'), 0)
  assert.equal(status('p2', 'fd-value'), 'available'); assert.equal(status('p2', 'fd-tables'), undefined)
})

test('knowing the first three: they are known and stay open, the fourth is opened, none is marked complete', async () => {
  makeLearner(h, db, 'p3')
  const r = await h.invoke('placement:submit', { userId: 'p3', answers: sheet(3, 'wrong') })
  assert.deepEqual(r.result.known.map((k) => k.lesson_id), ['fd-value', 'fd-tables', 'fd-profit'])
  assert.equal(known('p3'), 3)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM placement_results WHERE user_id = 'p3'").get().c, 8)
  for (const id of ids().slice(0, 4)) assert.equal(status('p3', id), 'available', id)
  for (const id of ids().slice(4)) assert.equal(status('p3', id), undefined, id)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lesson_progress WHERE user_id = 'p3' AND status = 'complete'").get().c, 0)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM user_achievements WHERE user_id = 'p3'").get().c, 0)
})

test('one wrong answer in a concept means it is not known, and later correct answers do not count', async () => {
  makeLearner(h, db, 'p4')
  const answers = sheet(8)
  answers['fd-tables:1'] = (lessons[1].quiz[1].correct_index + 1) % 4 // concept 2 missed by one answer; concepts 3 to 8 all correct
  const r = await h.invoke('placement:submit', { userId: 'p4', answers })
  assert.deepEqual(r.result.known.map((k) => k.lesson_id), ['fd-value'])
  assert.equal(status('p4', 'fd-tables'), 'available'); assert.equal(status('p4', 'fd-profit'), undefined)
})

test('knowing everything opens all eight lessons without completing any, and the plan moves on to the next academy', async () => {
  makeLearner(h, db, 'p5')
  const r = await h.invoke('placement:submit', { userId: 'p5', answers: sheet(8) })
  assert.equal(r.result.known.length, 8)
  for (const id of ids()) assert.equal(status('p5', id), 'available')
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lesson_progress WHERE user_id = 'p5' AND status = 'complete'").get().c, 0)
  const next = h.req('services/progress.service').getLearningPlan('p5').next
  assert.notEqual(next.module, 'foundations', 'every Start Here lesson is known, so the plan does not send them back')
})

test('the learning plan suggests the first lesson not yet shown, and without a check it is lesson 1', async () => {
  const P = h.req('services/progress.service')
  makeLearner(h, db, 'p6')
  assert.equal(P.getLearningPlan('p6').next.lesson_id, 'fd-value')
  await h.invoke('placement:submit', { userId: 'p6', answers: sheet(3, 'wrong') })
  assert.equal(P.getLearningPlan('p6').next.lesson_id, 'fd-cash')
})

test('retaking replaces the result, and progress is never downgraded', async () => {
  makeLearner(h, db, 'p7')
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES ('p7a','p7','fd-value','complete',datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='complete'").run()
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES ('p7b','p7','fd-tables','in_progress') ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='in_progress'").run()
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES ('p7c','p7','fd-profit','locked') ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='locked'").run()
  await h.invoke('placement:submit', { userId: 'p7', answers: sheet(3, 'wrong') })
  assert.deepEqual([status('p7', 'fd-value'), status('p7', 'fd-tables'), status('p7', 'fd-profit')], ['complete', 'in_progress', 'available'])
  await h.invoke('placement:submit', { userId: 'p7', answers: sheet(0) })
  assert.equal(known('p7'), 0, 'the new result replaces the old one')
  assert.equal(status('p7', 'fd-value'), 'complete')
})

test('the screen, the channel and the tab are wired, and the check is offered only in Start Here', () => {
  assert.match(src('electron/preload.ts'), /'placement:get'/); assert.match(src('electron/preload.ts'), /'placement:submit'/)
  const page = src('src/pages/SqlAcademy.tsx')
  assert.equal((page.match(/placement: true/g) || []).length, 1)
  assert.match(page, /foundations: \{[\s\S]*?placement: true/)
  assert.match(page, /<PlacementCheck onDone=/); assert.match(page, /<PlacementBanner onStart=/)
  assert.match(src('src/components/ui/PlacementCheck.tsx'), /I don't know yet/)
})
