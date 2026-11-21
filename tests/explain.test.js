'use strict'
// Phase 5: explain it back and the tutor modes. The check marks that the key ideas are present, refuses short or copied text, never
// takes a pass back, and is part of the mastery rule. The tutor modes only add fixed instructions to the system prompt.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-explain' })
let db, g, concepts, lessons
test.before(async () => {
  db = await h.start(); g = db.getDb()
  concepts = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/concepts/concepts.json'), 'utf8')).concepts
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/foundations/curriculum.json'), 'utf8')).lessons
})

// Good explanations, written the way a learner would say them, for every Start Here lesson.
const GOOD = {
  'fd-value': 'People pay because the water is worth more to the thirsty runner at that moment than the money, and the seller still gains because it cost him much less.',
  'fd-tables': 'A row is one customer, a single record in the list, while a column holds the same fact for everyone, like the town or the segment each customer belongs to.',
  'fd-profit': 'A variable cost changes with how much you sell, like flour for mandazi, but a fixed cost such as rent stays the same even if you sell nothing that month.',
  'fd-cash': 'Maybe your customers bought on credit and have not paid yet, and the money you did receive already went to suppliers for new stock this month.',
  'fd-numbers': 'The average hides how spread out the sales are, because one shop might have a few huge sales while the other sells many similar small ones every day.',
  'fd-customers': 'My customers are small farmers who struggle to get seeds on time, and they told me that the long trip to town costs them a whole day of work.',
  'fd-price': 'Margin is the part of the price that I keep, while markup is added on top of the cost, so a 330 cost sold at 440 has a 25 percent margin but 33 percent markup.',
  'fd-first-principles': 'I would ask how many customers will buy and at what price, whether the profit after costs is positive, and if I have enough cash to survive until customers pay.',
}
const GENERIC = 'I think it is a good thing and everyone should learn it well because learning is important for all of the people who want to succeed in the future of the world.'

test('every Start Here lesson has a prompt and a rubric that is well formed', () => {
  for (const l of lessons) {
    const c = concepts.find((x) => x.lessons[0] === l.id)
    assert.ok(c && c.explain, `${l.id} has no explain step`)
    assert.ok(c.explain.prompt.length > 20 && c.explain.points.length === 3 && c.explain.need === 2, l.id)
    for (const p of c.explain.points) {
      assert.ok(p.hint.length > 10 && p.any.length >= 1, `${l.id}: ${p.hint}`)
      for (const k of p.any) assert.equal(k, k.toLowerCase(), `${l.id}: keywords are lower case`)
    }
  }
})

test('a good explanation passes for every lesson, and generic or empty-of-ideas text passes for none', async () => {
  makeLearner(h, db, 'e1')
  for (const l of lessons) {
    const bad = await h.invoke('explain:submit', { userId: 'e1', lessonId: l.id, text: GENERIC })
    assert.deepEqual([bad.success, bad.passed], [true, false], `${l.id} accepted generic text`)
    assert.equal(bad.missing.length, 3)
    const good = await h.invoke('explain:submit', { userId: 'e1', lessonId: l.id, text: GOOD[l.id] })
    assert.equal(good.passed, true, `${l.id}: ${JSON.stringify(good)}`)
    assert.ok(good.covered.length >= 2)
  }
})

test('short text and text copied from the lesson are refused with a reason', async () => {
  makeLearner(h, db, 'e2')
  const short = await h.invoke('explain:submit', { userId: 'e2', lessonId: 'fd-value', text: 'It is worth more to the buyer.' })
  assert.deepEqual([short.passed, short.reason], [false, 'short'])
  const theory = lessons[0].theory_md.replace(/[#*`]/g, '')
  const start = theory.indexOf('Value is not what something cost you')
  const copied = await h.invoke('explain:submit', { userId: 'e2', lessonId: 'fd-value', text: theory.slice(start, start + 260) })
  assert.deepEqual([copied.passed, copied.reason], [false, 'copied'])
  assert.equal((await h.invoke('explain:get', { userId: 'e2', lessonId: 'fd-value' })).passed, false)
})

test('unusable requests are refused and nothing is saved', async () => {
  makeLearner(h, db, 'e3')
  for (const [lessonId, text] of [['sql-select', GOOD['fd-value']], ['no-such-lesson', GOOD['fd-value']], ['fd-value', null], ['fd-value', 42], ['fd-value', 'x'.repeat(2001)]]) {
    assert.deepEqual(await h.invoke('explain:submit', { userId: 'e3', lessonId, text }), { success: false }, `${lessonId}`)
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM explain_results WHERE user_id = 'e3'").get().c, 0)
  assert.equal(await h.invoke('explain:get', { userId: 'e3', lessonId: 'sql-select' }), null)
})

test('a pass is never taken back, and the latest words are what is kept', async () => {
  makeLearner(h, db, 'e4')
  await h.invoke('explain:submit', { userId: 'e4', lessonId: 'fd-cash', text: GOOD['fd-cash'] })
  await h.invoke('explain:submit', { userId: 'e4', lessonId: 'fd-cash', text: GENERIC })
  const e = await h.invoke('explain:get', { userId: 'e4', lessonId: 'fd-cash' })
  assert.deepEqual([e.passed, e.last_answer], [true, GENERIC])
  assert.equal(g.prepare("SELECT COUNT(*) c FROM explain_results WHERE user_id = 'e4'").get().c, 1)
})

test('explaining it back is part of the mastery rule, and lessons without one are unchanged', async () => {
  makeLearner(h, db, 'e5')
  const L = lessons[0]
  await h.invoke('lessons:start', { userId: 'e5', lessonId: L.id })
  await h.invoke('quizzes:submit', { userId: 'e5', lessonId: L.id, answers: L.quiz.map((q) => q.correct_index) })
  const all = Object.fromEntries(L.exercises.map((e) => [e.id, e]))
  for (const e of L.exercises) await h.invoke('exercises:submit', { userId: 'e5', exerciseId: all[e.id].id, answer: e.solution })
  const before = await h.invoke('lessons:complete', { userId: 'e5', lessonId: L.id })
  assert.deepEqual([before.success, before.mastery_gaps], [false, ['Explain the idea back in your own words']])
  await h.invoke('explain:submit', { userId: 'e5', lessonId: L.id, text: GOOD[L.id] })
  assert.equal((await h.invoke('lessons:complete', { userId: 'e5', lessonId: L.id })).success, true)
  assert.equal((await h.invoke('lessons:complete', { userId: 'e5', lessonId: 'sql-where' })).success, true)
})

test('the panel, the explain box and the channels are wired', () => {
  const panel = src('src/components/ui/InstructorPanel.tsx')
  for (const label of ['Explain simpler', 'Ask me', 'Check my explanation']) assert.ok(panel.includes(label), label)
  assert.match(panel, /context\.type === 'lesson' \|\| context\.type === 'exercise'\) && apiKeyOk/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /<ExplainBack lessonId=\{lesson\.id\} \/>/)
  assert.match(src('electron/preload.ts'), /'explain:get'/); assert.match(src('electron/preload.ts'), /'explain:submit'/)
})
