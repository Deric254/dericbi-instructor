'use strict'
// Start Here, the zero-to-founder foundation academy. Every model answer must run on the real practice data and be accepted
// by the real grader; wrong answers (including the classic mistakes each lesson warns about) must be rejected; the figures the
// lessons quote must match the data; a learner must really pass the quiz and practicals before a lesson completes; and the
// other academies must be undisturbed.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const EXPLAIN = {
  'fd-value': 'People pay because the water is worth more to the thirsty runner at that moment than the money, and the seller still gains because it cost him much less.',
  'fd-tables': 'A row is one customer, a single record in the list, while a column holds the same fact for everyone, like the town or the segment each customer belongs to.',
  'fd-profit': 'A variable cost changes with how much you sell, like flour for mandazi, but a fixed cost such as rent stays the same even if you sell nothing that month.',
  'fd-cash': 'Maybe your customers bought on credit and have not paid yet, and the money you did receive already went to suppliers for new stock this month.',
  'fd-numbers': 'The average hides how spread out the sales are, because one shop might have a few huge sales while the other sells many similar small ones every day.',
  'fd-customers': 'My customers are small farmers who struggle to get seeds on time, and they told me that the long trip to town costs them a whole day of work.',
  'fd-price': 'Margin is the part of the price that I keep, while markup is added on top of the cost, so a 330 cost sold at 440 has a 25 percent margin but 33 percent markup.',
  'fd-first-principles': 'I would ask how many customers will buy and at what price, whether the profit after costs is positive, and if I have enough cash to survive until customers pay.',
}
const h = bootWithIpc({ prefix: 'dbi-foundations' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/foundations/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const byId = () => Object.fromEntries(exercises().map((e) => [e.id, e]))
const run = async (id, query) => {
  const r = await sql.executeSQL({ sandboxId: `ex_${id}_u`, userId: 'u', query })
  assert.equal(r.success, true, `${id}: ${r.error}`)
  return r.rows
}
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the academy is its own module of 8 lessons and does not change the others', () => {
  const g = db.getDb()
  const count = (m) => g.prepare('SELECT COUNT(*) c FROM lessons WHERE module = ?').get(m).c
  assert.equal(count('foundations'), 8)
  assert.equal(count('sql'), 10); assert.equal(count('dataeng'), 21); assert.equal(count('bizsolver'), 11)
  assert.equal(g.prepare("SELECT DISTINCT exercise_type t FROM exercises WHERE lesson_id LIKE 'fd-%'").all().map((r) => r.t).join(), 'sql_query')
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'foundations' AND mastery_required = 1").get().c, 8)
})

test('the academy is a full path: chained from nothing, each lesson with theory, 5 quiz questions and graded practice', () => {
  assert.deepEqual(lessons.map((l) => l.id), ['fd-value', 'fd-tables', 'fd-profit', 'fd-cash', 'fd-numbers', 'fd-customers', 'fd-price', 'fd-first-principles'])
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    assert.deepEqual(l.prerequisites, i ? [lessons[i - 1].id] : [])
    assert.equal(l.level, 'beginner')
    assert.ok(l.theory_md.length > 1500, `${l.id}: theory too thin`)
    for (const part of ['## Why this matters', '## The first principle', '## A worked example', '## Try it', '## What you can and cannot claim', '## Say it in your own words', '## Do this in real life']) {
      assert.ok(l.theory_md.includes(part), `${l.id}: missing "${part}"`)
    }
    assert.equal(l.quiz.length, 5, l.id)
    for (const q of l.quiz) {
      assert.equal(q.options.length, 4); assert.ok(q.correct_index >= 0 && q.correct_index < 4 && q.explanation.length > 10)
      assert.equal(new Set(q.options).size, 4, `${l.id}: duplicate quiz options`)
    }
    assert.ok(l.exercises.length >= 3, l.id)
  })
  assert.equal(exercises().length, 28)
})

test('every model answer runs, returns rows and is accepted by the real grader', async () => {
  for (const e of exercises()) {
    assert.ok((await run(e.id, e.solution)).length > 0, `${e.id}: empty result`)
    const ok = await grade(e.id, e.solution, e.solution)
    assert.equal(ok.correct, true, `${e.id}: ${ok.feedback}`)
    assert.equal(e.hint_3, e.solution)
    const nothing = await grade(e.id, 'SELECT 1 AS x', e.solution)
    assert.equal(nothing.correct, false, `${e.id}: a throwaway answer was accepted`)
  }
})

test('the classic mistakes each lesson warns about are rejected', async () => {
  const all = byId()
  const wrong = {
    'fd-1-e1': 'SELECT 150 + 120 AS gain',
    'fd-2-e2': 'SELECT name, unit_price FROM shop_products ORDER BY unit_price LIMIT 3',
    'fd-2-e3': "SELECT COUNT(*) AS customers FROM shop_customers WHERE town = 'Nairobi'",
    'fd-3-e3': 'SELECT SUM(qty * unit_price) AS revenue, SUM(qty * unit_cost) AS cost, SUM(qty * unit_cost) AS gross_profit FROM shop_sale_items',
    'fd-3-e4': 'SELECT (SELECT SUM(qty * (unit_price - unit_cost)) FROM shop_sale_items) AS gross_profit, (SELECT SUM(amount) FROM shop_expenses) AS expenses, (SELECT SUM(qty * (unit_price - unit_cost)) FROM shop_sale_items) AS profit', // forgot the expenses
    'fd-4-e3': 'SELECT (SELECT SUM(total) FROM shop_sales) AS sold, (SELECT SUM(amount) FROM shop_payments) AS received, (SELECT SUM(amount) FROM shop_payments) - (SELECT SUM(total) FROM shop_sales) AS still_owed',
    'fd-4-e4': 'SELECT COUNT(*) AS credit_sales, SUM(total) AS credit_value FROM shop_sales',
    'fd-5-e3': "SELECT ROUND(100 * (SELECT COUNT(*) FROM shop_sales WHERE payment_status = 'credit') / (SELECT COUNT(*) FROM shop_sales), 1) AS credit_pct", // whole-number division drops the decimals
    'fd-6-e2': 'SELECT c.name, COUNT(*) AS sales FROM shop_sales s JOIN shop_customers c ON c.customer_id = s.customer_id GROUP BY c.name ORDER BY sales LIMIT 1',
    'fd-7-e1': 'SELECT 432 - 330 AS profit_each, ROUND(100.0 * (432 - 330) / 330, 1) AS margin_pct', // markup, not margin
    'fd-7-e4': 'SELECT ROUND(330 * 1.25, 2) AS price', // markup, not margin
    'fd-8-e2': 'SELECT ROUND(100.0 * ((SELECT SUM(qty * (unit_price - unit_cost)) FROM shop_sale_items) - (SELECT SUM(amount) FROM shop_expenses)) / (SELECT SUM(qty * unit_cost) FROM shop_sale_items), 1) AS profit_pct',
    'fd-8-e3': 'SELECT ROUND(394723 * 1.02) AS new_profit', // raises only the old profit, not the prices
  }
  for (const [id, user] of Object.entries(wrong)) {
    const r = await grade(id, user, all[id].solution)
    assert.equal(r.correct, false, `${id}: a wrong answer was accepted`)
  }
})

test('the figures the lessons quote are the figures in the data', async () => {
  const all = byId(); const theory = Object.fromEntries(lessons.map((l) => [l.id, l.theory_md]))
  const [p] = await run('fd-8-e1', all['fd-8-e1'].solution)
  assert.deepEqual([p.revenue, p.cost_of_goods, p.expenses, p.profit], [31524349, 25214926, 5914700, 394723])
  for (const n of ['31,524,349', '25,214,926', '5,914,700', '394,723']) assert.ok(theory['fd-first-principles'].includes(n), `fd-first-principles quotes ${n}`)
  assert.equal((await run('fd-8-e2', all['fd-8-e2'].solution))[0].profit_pct, 1.3)
  assert.equal((await run('fd-8-e3', all['fd-8-e3'].solution))[0].new_profit, 1025210)
  assert.ok(theory['fd-first-principles'].includes('1,025,210') && theory['fd-first-principles'].includes('1.3 percent'))
  assert.equal((await run('fd-5-e3', all['fd-5-e3'].solution))[0].credit_pct, 27.7); assert.ok(theory['fd-numbers'].includes('27.7 percent') && theory['fd-numbers'].includes('566'))
  const [m] = await run('fd-7-e2', all['fd-7-e2'].solution); assert.deepEqual([m.profit_each, m.margin_pct], [42, 10.7])
  assert.ok(theory['fd-price'].includes('10.7 percent') && theory['fd-price'].includes('23.6 percent'))
  assert.equal((await run('fd-3-e2', all['fd-3-e2'].solution))[0].breakeven_units, 200)
  assert.equal((await run('fd-4-e2', all['fd-4-e2'].solution))[0].closing_cash, 3500)
  assert.equal((await run('fd-2-e1', all['fd-2-e1'].solution))[0].products, 40)
})

test('Start Here is a real path: completion is refused until the quiz and practicals are passed, then each lesson opens the next', async () => {
  makeLearner(h, db, 'walker')
  const g = db.getDb(); const all = byId()
  const status = (id) => g.prepare("SELECT status FROM lesson_progress WHERE user_id = 'walker' AND lesson_id = ?").get(id)?.status
  assert.equal(status('fd-tables'), undefined, 'lesson 2 is not open before lesson 1 is done')

  for (const [i, l] of lessons.entries()) {
    await h.invoke('lessons:start', { userId: 'walker', lessonId: l.id })
    const early = await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 1 })
    assert.equal(early.success, false, `${l.id}: completed without any work`); assert.equal(early.mastery_gaps.length, 3)

    const partly = l.quiz.map((q, k) => (k < 3 ? q.correct_index : (q.correct_index + 1) % 4)) // 3 of 5 = 60%
    assert.equal((await h.invoke('quizzes:submit', { userId: 'walker', lessonId: l.id, answers: partly })).passed, false)
    assert.equal((await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id })).mastery_gaps.length, 3)

    const pass = await h.invoke('quizzes:submit', { userId: 'walker', lessonId: l.id, answers: l.quiz.map((q) => q.correct_index) })
    assert.equal(pass.passed, true)
    for (const e of l.exercises) {
      const r = await h.invoke('exercises:submit', { userId: 'walker', exerciseId: all[e.id].id, answer: e.solution })
      assert.equal(r.validation.correct, true, `${e.id}: ${r.validation.feedback}`)
    }
    const lacking = await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id })
    assert.deepEqual(lacking.mastery_gaps, ['Explain the idea back in your own words'], `${l.id}: only the explanation is left`)
    await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: EXPLAIN[l.id] })
    const done = await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 60 })
    assert.equal(done.success, true, l.id); assert.equal(status(l.id), 'complete')
    if (i < lessons.length - 1) assert.equal(status(lessons[i + 1].id), 'available', `${l.id} opens ${lessons[i + 1].id}`)
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM user_achievements WHERE user_id = 'walker' AND achievement_id IN ('ach_fd_first','ach_fd_done')").get().c, 2)
})

test('a learner who has finished nothing is pointed at Start Here; one already working elsewhere is not moved', () => {
  const P = h.req('services/progress.service'); const g = db.getDb()
  makeLearner(h, db, 'fresh')
  assert.equal(P.getLearningPlan('fresh').next.module, 'foundations')
  makeLearner(h, db, 'veteran')
  g.prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES ('v1','veteran','sql-select','complete',datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='complete', completed_at=datetime('now')").run()
  assert.notEqual(P.getLearningPlan('veteran').next.module, 'foundations')
})

test('the academy is wired into every place a course lives, and the other academies keep their own wiring', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'foundations'[^\n]*'Start Here'|label: 'Start Here'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /foundations:\s+<SqlAcademy key="foundations" course="foundations" \/>/)
  assert.match(src('src/pages/Dashboard.tsx'), /id: 'foundations'/)
  assert.match(src('src/components/ui/GlobalInstructor.tsx'), /'foundations'/)
  assert.match(src('src/components/ui/LearningPlan.tsx'), /foundations: 'Start Here'/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /foundations: \{[\s\S]*?skillMap: false/)
  assert.match(src('electron/services/sql.service.ts'), /startsWith\('ex_fd-'\)/)
  assert.match(src('electron/services/setup.service.ts'), /foundations\/curriculum\.json/)
  assert.match(h.req('services/tutor').appDescription(), /Start Here \(8 lessons/)
  assert.match(src('src/styles/globals.css'), /--fd-color:\s+#a3e635/)
})
