'use strict'
// The Founder Track: twelve lessons from finding a problem to measuring and iterating. Every model answer must be accepted by the
// real grader, classic mistakes rejected, the figures and dated facts the lessons quote must match what the code and sources say,
// a learner must really pass quiz, practicals and explain-back before a lesson completes, and the other academies stay undisturbed.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const IDS = ['fo-problem', 'fo-interviews', 'fo-market', 'fo-offer', 'fo-unit', 'fo-runway', 'fo-sale', 'fo-mvp', 'fo-funding', 'fo-legal', 'fo-team', 'fo-iterate']
const EXPLAIN = {
  'fo-problem': 'A good problem happens often, it hurts or costs people money and time, and they already pay to cope with it, so I ask them what they do about it today.',
  'fo-interviews': 'People are polite and bad at predicting, so I ask about the last time it happened and what they did, then count how many already pay.',
  'fo-market': 'One percent of a whole country is just a big number with no real people behind it, so I count the shops I can reach, multiply by the share who buy and by the price.',
  'fo-offer': 'The floor is my cost plus the profit I need and the ceiling is the value to the customer, and pricing from cost alone leaves money on the table when they would pay more.',
  'fo-unit': 'A fixed cost like rent stays the same each month while a variable cost rises with every sale, and I divide the fixed costs by the contribution per sale to get the break even.',
  'fo-runway': 'Runway is my cash divided by the monthly burn, and a profitable business can still run out of cash because customers pay late while the bills are due now.',
  'fo-sale': 'A conversion rate is the share of people at one step who move to the next, and I write down the reason each person said no so I can learn and change the offer.',
  'fo-mvp': 'An MVP is the smallest thing that gives the customer the result, and doing it by hand is cheap and lets me test whether people pay before building anything.',
  'fo-funding': 'Savings and sales have no interest to repay, and a loan must earn more than it costs me in total, so I confirm the current terms before I borrow.',
  'fo-legal': 'The law decides who may trade through registration, who owes tax like turnover tax to KRA, and who is bound by a written contract, and the figures change so I confirm them.',
  'fo-team': 'The employer pays NSSF and levy contributions on top of the salary, so I only hire when the work is proven and the hire can pay for themselves.',
  'fo-iterate': 'I change only one thing at a time so I can tell the cause, and I track customers, contribution and cash, measuring again over a few weeks to avoid luck.',
}
const h = bootWithIpc({ prefix: 'dbi-founder' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/founder/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const byId = () => Object.fromEntries(exercises().map((e) => [e.id, e]))
const run = async (id, query) => {
  const r = await sql.executeSQL({ sandboxId: `ex_${id}_u`, userId: 'u', query })
  assert.equal(r.success, true, `${id}: ${r.error}`)
  return r.rows
}
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the academy is its own module of 12 lessons and does not change the others', () => {
  const g = db.getDb()
  const count = (m) => g.prepare('SELECT COUNT(*) c FROM lessons WHERE module = ?').get(m).c
  assert.equal(count('founder'), 12)
  assert.equal(count('foundations'), 8); assert.equal(count('sql'), 10); assert.equal(count('dataeng'), 20); assert.equal(count('bizsolver'), 11)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'founder' AND mastery_required = 1").get().c, 12)
})

test('a full path: the first lesson is open, each next lesson needs the one before, each has the whole template, 5 quiz questions and graded practice', () => {
  assert.deepEqual(lessons.map((l) => l.id), IDS)
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    assert.deepEqual(l.prerequisites, i ? [lessons[i - 1].id] : [])
    assert.ok(l.theory_md.length > 1500, `${l.id}: theory too thin`)
    for (const part of ['## Why this matters', '## The first principle', '## A worked example', '## Try it', '## What you can and cannot claim', '## Say it in your own words', '## Do this in real life']) {
      assert.ok(l.theory_md.includes(part), `${l.id}: missing "${part}"`)
    }
    assert.equal(l.quiz.length, 5, l.id)
    for (const q of l.quiz) {
      assert.equal(q.options.length, 4); assert.ok(q.correct_index >= 0 && q.correct_index < 4 && q.explanation.length > 10)
      assert.equal(new Set(q.options).size, 4, `${l.id}: duplicate quiz options`)
    }
    assert.equal(l.exercises.length, 3, l.id)
  })
  assert.equal(exercises().length, 36)
  assert.ok(new Set(lessons.flatMap((l) => l.quiz.map((q) => q.correct_index))).size >= 2, 'the right answer is not always in the same place')
})

test('every model answer runs, returns rows and is accepted by the real grader; a throwaway answer is not', async () => {
  for (const e of exercises()) {
    assert.ok((await run(e.id, e.solution)).length > 0, `${e.id}: empty result`)
    assert.equal((await grade(e.id, e.solution, e.solution)).correct, true, e.id)
    assert.equal(e.hint_3, e.solution)
    assert.equal((await grade(e.id, 'SELECT 1 AS x', e.solution)).correct, false, `${e.id}: a throwaway answer was accepted`)
  }
})

test('the classic mistakes each lesson warns about are rejected', async () => {
  const all = byId()
  const wrong = {
    'fo-5-e2': 'SELECT CAST(6000.0 / 180 AS INTEGER) AS break_even_shops', // rounds down: 33 shops do not break even
    'fo-6-e3': 'SELECT 18000 AS first_month_burn, 90000 - 18000 AS cash_after_month_1', // forgets that nothing comes in during month 1
    'fo-7-e1': 'SELECT 6 * 100.0 / 25 AS conversion_percent', // divides by the wrong step
    'fo-9-e2': 'SELECT 60000 AS total, 60000 / 6 AS monthly', // forgets the interest
    'fo-10-e1': 'SELECT 150000 * 16 / 100 AS monthly_tax', // uses the VAT rate instead of the rate given
    'fo-11-e1': 'SELECT 20000 AS real_cost', // salary only
  }
  for (const [id, user] of Object.entries(wrong)) {
    assert.equal((await grade(id, user, all[id].solution)).correct, false, `${id}: a wrong answer was accepted`)
  }
})

test('the figures the lessons quote are the figures the answers produce', async () => {
  const all = byId(); const theory = Object.fromEntries(lessons.map((l) => [l.id, l.theory_md]))
  const one = async (id) => (await run(id, all[id].solution))[0]
  assert.equal((await one('fo-1-e1')).monthly_cost, 520); assert.ok(theory['fo-problem'].includes('KES 520'))
  assert.equal((await one('fo-3-e2')).yearly_revenue, 64800); assert.ok(theory['fo-market'].includes('KES 64,800'))
  assert.equal((await one('fo-4-e1')).margin_percent, 60); assert.ok(theory['fo-offer'].includes('60 percent'))
  assert.equal((await one('fo-5-e2')).break_even_shops, 34); assert.ok(theory['fo-unit'].includes('34 shops'))
  assert.equal((await one('fo-6-e2')).runway_months, 5); assert.ok(theory['fo-runway'].includes('5 months'))
  assert.equal((await one('fo-7-e1')).conversion_percent, 15)
  assert.equal((await one('fo-9-e2')).total, 66000); assert.ok(theory['fo-funding'].includes('66,000'))
  assert.equal((await one('fo-10-e2')).yearly_tax, 54000); assert.ok(theory['fo-legal'].includes('KES 54,000'))
  assert.equal((await one('fo-11-e1')).real_cost, 21500); assert.ok(theory['fo-team'].includes('KES 21,500'))
  assert.equal((await one('fo-12-e1')).change_percent.toFixed(1), '33.3')
})

test('dated legal, tax and funding facts name their source and date, and tell the learner to confirm; each graded answer states its own rate', () => {
  const t = Object.fromEntries(lessons.map((l) => [l.id, l.theory_md]))
  for (const id of ['fo-legal', 'fo-team', 'fo-funding']) {
    assert.match(t[id], /November 2026/, `${id}: facts must carry their date`)
    assert.match(t[id], /[Cc]onfirm|check/, `${id}: must tell the learner to verify`)
  }
  assert.match(t['fo-legal'], /Unpacking Turnover Tax/); assert.match(t['fo-legal'], /3 percent of gross sales/); assert.match(t['fo-legal'], /KES 1 million and up to KES 25 million/)
  assert.match(t['fo-legal'], /KES 950/); assert.match(t['fo-legal'], /KES 5 million/); assert.match(t['fo-legal'], /not legal or tax advice/)
  assert.match(t['fo-team'], /FNJ & Associates/); assert.match(t['fo-team'], /could not check against/)
  assert.match(t['fo-funding'], /TechTrends Kenya/); assert.match(t['fo-funding'], /12 June 2026/)
  for (const id of ['fo-10-e1', 'fo-10-e2', 'fo-10-e3']) assert.match(byId()[id].prompt, /3 percent/, `${id}: the rate is stated in the question`)
})

test('the founder track is a real path: completion is refused until quiz, practicals and the explanation are done, then each lesson opens the next', async () => {
  makeLearner(h, db, 'walker')
  const g = db.getDb(); const all = byId()
  const status = (id) => g.prepare("SELECT status FROM lesson_progress WHERE user_id = 'walker' AND lesson_id = ?").get(id)?.status
  assert.equal(status('fo-interviews'), undefined)
  for (const [i, l] of lessons.entries()) {
    await h.invoke('lessons:start', { userId: 'walker', lessonId: l.id })
    const early = await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 1 })
    assert.equal(early.success, false, `${l.id}: completed without any work`); assert.equal(early.mastery_gaps.length, 3)
    const partly = l.quiz.map((q, k) => (k < 3 ? q.correct_index : (q.correct_index + 1) % 4))
    assert.equal((await h.invoke('quizzes:submit', { userId: 'walker', lessonId: l.id, answers: partly })).passed, false)
    assert.equal((await h.invoke('quizzes:submit', { userId: 'walker', lessonId: l.id, answers: l.quiz.map((q) => q.correct_index) })).passed, true)
    for (const e of l.exercises) {
      const r = await h.invoke('exercises:submit', { userId: 'walker', exerciseId: all[e.id].id, answer: e.solution })
      assert.equal(r.validation.correct, true, `${e.id}: ${r.validation.feedback}`)
    }
    assert.deepEqual((await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id })).mastery_gaps, ['Explain the idea back in your own words'])
    const filler = await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: 'I think this was a very interesting lesson and I learned a great deal from reading it carefully today.' })
    assert.equal(filler.passed, false, `${l.id}: filler text passed the explanation`)
    assert.equal((await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: EXPLAIN[l.id] })).passed, true, `${l.id}: a real explanation was refused`)
    assert.equal((await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 60 })).success, true, l.id)
    assert.equal(status(l.id), 'complete')
    if (i < lessons.length - 1) assert.equal(status(lessons[i + 1].id), 'available')
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM user_achievements WHERE user_id = 'walker' AND achievement_id IN ('ach_fo_first','ach_fo_done')").get().c, 2)
})

test('after Start Here the plan points at the founder track; a learner working elsewhere is not moved', () => {
  const P = h.req('services/progress.service'); const g = db.getDb()
  makeLearner(h, db, 'grad')
  const stamp = "INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES (?, 'grad', ?, 'complete', datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete', completed_at = datetime('now')"
  for (const id of ['fd-value', 'fd-tables', 'fd-profit', 'fd-cash', 'fd-numbers', 'fd-customers', 'fd-price', 'fd-first-principles']) g.prepare(stamp).run(`g-${id}`, id)
  assert.equal(P.getLearningPlan('grad').next.lesson_id, 'fo-problem')
  makeLearner(h, db, 'sqler')
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES ('s1','sqler','sql-select','complete',datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete', completed_at = datetime('now')").run()
  assert.notEqual(P.getLearningPlan('sqler').next.module, 'founder')
  assert.match(P.getLearningPlan('grad').modules.map((m) => m.module).join(), /foundations,founder/)
})

test('the academy is wired into every place a course lives, and the other academies keep their own wiring', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'founder'[^\n]*'Founder Track'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /founder:\s+<SqlAcademy key="founder" course="founder" \/>/)
  assert.match(src('src/pages/Dashboard.tsx'), /id: 'founder'/)
  assert.match(src('src/components/ui/GlobalInstructor.tsx'), /'founder'/)
  assert.match(src('src/components/ui/LearningPlan.tsx'), /founder: 'Founder Track'/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /founder: \{[\s\S]*?placement: false/)
  assert.match(src('electron/services/sql.service.ts'), /startsWith\('ex_fo-'\)/)
  assert.match(src('electron/services/setup.service.ts'), /founder\/curriculum\.json/)
  assert.match(src('electron/services/ai.service.ts'), /Founder Track/)
  assert.match(src('src/styles/globals.css'), /--fo-color:\s+#fb923c/)
  assert.match(src('src/styles/globals.css'), /--fo-color:\s+#9a3412/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /foundations: \{[\s\S]*?placement: true/)
})
