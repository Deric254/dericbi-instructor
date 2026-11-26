'use strict'
// Technology First Principles: eight short lessons that give the technology side the same footing Start Here gives the business side.
// Every model answer must be accepted by the real grader, wrong answers rejected, the figures the lessons quote must match what the
// answers produce, a learner must really pass quiz, practicals and explain-back before a lesson completes, every concept the lessons
// teach exists in the concept map, the master track places them beside the business lessons, and the other academies stay undisturbed.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const IDS = ['tf-data', 'tf-files', 'tf-tables', 'tf-instructions', 'tf-databases', 'tf-networks', 'tf-trust', 'tf-first-principles']
const EXPLAIN = {
  'tf-data': 'A type tells the computer how to read the stored bits as a number, text or a date, and text sorts character by character like a dictionary so 10 can come before 9, which is why I check the type.',
  'tf-files': 'The same table can be written as CSV, one row per line with commas between the values, or as JSON where each row is a record with the column name beside every value, but it is still the same table.',
  'tf-tables': 'Each row stands for one customer and each column holds a fact, and a key picks out a single row because no two rows ever carry the same one, but a name fails as a key since two people can share a name.',
  'tf-instructions': 'Every program takes input, follows steps and gives output, a condition chooses between two paths depending on whether something is true, and a loop repeats the same steps for each item in a list.',
  'tf-databases': 'A database is shared so many people use one copy, safe because rules protect the data, and a transaction means a group of changes either all happen together or none of them happen.',
  'tf-networks': 'A client sends a request to a server and the server sends back a response, and a 404 means the request was wrong or the thing was not found while a 500 means the server itself failed.',
  'tf-trust': 'Least privilege means each person gets only the access the job needs, and a backup has to be tested by restoring it because otherwise I only hope it works when the day comes.',
  'tf-first-principles': 'I write down what I expected and what actually happened, form one hypothesis and run a test that could prove it wrong, and I change only one thing at a time so I know which change caused the effect.',
}
const WRONG = {
  'tf-1-e1': "SELECT 'integer' AS whole, 'real' AS decimal, 'integer' AS text_kind",
  'tf-1-e2': "SELECT 0 AS as_text, 0 AS as_numbers",
  'tf-1-e3': "SELECT 0 AS days",
  'tf-2-e1': "SELECT 0 AS price",
  'tf-2-e2': "SELECT name AS record FROM shop_products WHERE product_id = 1",
  'tf-2-e3': "SELECT name AS csv_line FROM shop_products WHERE product_id = 1",
  'tf-3-e1': "SELECT COUNT(*) AS customers FROM shop_sales",
  'tf-3-e2': "SELECT COUNT(*) AS duplicate_keys FROM shop_customers",
  'tf-3-e3': "SELECT c.name, COUNT(*) AS sales FROM shop_sales s JOIN shop_customers c ON c.customer_id = s.customer_id GROUP BY c.name LIMIT 1",
  'tf-4-e1': "SELECT 'ok' AS action",
  'tf-4-e2': "SELECT COUNT(*) AS large_sales FROM shop_sales WHERE total > 20000000",
  'tf-4-e3': "SELECT segment, COUNT(*) AS customers FROM shop_customers GROUP BY segment ORDER BY customers",
  'tf-5-e1': "SELECT COUNT(*) AS buyers FROM shop_sales",
  'tf-5-e2': "SELECT 1 AS mismatched",
  'tf-5-e3': "SELECT SUM(amount) AS received FROM shop_payments",
  'tf-6-e1': "SELECT 'https://api.shop.co.ke' AS host",
  'tf-6-e2': "SELECT 'ok' AS meaning",
  'tf-6-e3': "SELECT name, unit_cost FROM shop_products WHERE product_id = 7",
  'tf-7-e1': "SELECT name AS masked FROM shop_customers WHERE customer_id = 1",
  'tf-7-e2': "SELECT town, COUNT(*) AS customers FROM shop_customers GROUP BY town ORDER BY customers LIMIT 3",
  'tf-7-e3': "SELECT 1 AS sales, 1 AS payments",
  'tf-8-e1': "SELECT COUNT(*) AS credit_sales FROM shop_sales",
  'tf-8-e2': "SELECT COUNT(*) AS unpaid_credit FROM shop_sales WHERE payment_status = 'credit'",
  'tf-8-e3': "SELECT 5 AS paid_without_payment",
}
const h = bootWithIpc({ prefix: 'dbi-techfirst' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/techfirst/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const byId = () => Object.fromEntries(exercises().map((e) => [e.id, e]))
const run = async (id, query) => {
  const r = await sql.executeSQL({ sandboxId: `ex_${id}_u`, userId: 'u', query })
  assert.equal(r.success, true, `${id}: ${r.error}`)
  return r.rows
}
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the academy is its own module of 8 gated lessons and does not change the others', () => {
  const g = db.getDb()
  const count = (m) => g.prepare('SELECT COUNT(*) c FROM lessons WHERE module = ?').get(m).c
  assert.equal(count('techfirst'), 8)
  assert.equal(count('foundations'), 8); assert.equal(count('founder'), 12); assert.equal(count('aiml'), 12); assert.equal(count('sql'), 10)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'techfirst' AND mastery_required = 1").get().c, 8)
})

test('a straight path: each lesson needs the one before, has the whole template, 5 quiz questions and 3 graded practicals', () => {
  assert.deepEqual(lessons.map((l) => l.id), IDS)
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    assert.deepEqual(l.prerequisites, i ? [lessons[i - 1].id] : [], l.id)
    assert.ok(l.theory_md.length > 1500, `${l.id}: theory too thin`)
    // two lessons are already rewritten to the integrated blueprint (checked in blueprint.test.js); the rest keep the original template
    if (!l.theory_md.includes('## Hook')) for (const part of ['## Why this matters', '## The first principle', '## A worked example', '## Try it', '## What you can and cannot claim', '## Say it in your own words', '## Do this in real life']) assert.ok(l.theory_md.includes(part), `${l.id}: ${part}`)
    assert.equal(l.quiz.length, 5); assert.equal(l.exercises.length, 3)
    l.quiz.forEach((q) => { assert.equal(q.options.length, 4); assert.ok(q.explanation.length > 20); assert.equal(new Set(q.options).size, 4) })
    assert.deepEqual([...new Set(l.quiz.map((q) => q.correct_index))].every((c) => c >= 0 && c < 4), true)
  })
})

test('every model answer is accepted by the real grader and every wrong answer is rejected', async () => {
  for (const e of exercises()) {
    assert.ok(WRONG[e.id], `${e.id}: no wrong answer written`)
    assert.equal((await grade(e.id, e.solution, e.solution)).correct, true, `${e.id}: its own solution was refused`)
    assert.equal((await grade(e.id, WRONG[e.id], e.solution)).correct, false, `${e.id}: a wrong answer was accepted`)
  }
})

test('the figures the lessons quote are the figures the answers produce', async () => {
  const all = byId(); const theory = Object.fromEntries(lessons.map((l) => [l.id, l.theory_md]))
  const one = async (id) => (await run(id, all[id].solution))[0]
  assert.deepEqual(await one('tf-1-e1'), { whole: 'integer', decimal: 'real', text_kind: 'text' })
  assert.deepEqual(await one('tf-1-e2'), { as_text: 1, as_numbers: 0 })
  assert.equal((await one('tf-1-e3')).days, 841)
  assert.equal((await one('tf-2-e1')).price, 432); assert.equal((await one('tf-2-e2')).record, '{"name":"Maize flour 2kg","price":432}'); assert.equal((await one('tf-2-e3')).csv_line, '1,Maize flour 2kg,432')
  assert.ok(theory['tf-files'].includes('1,Maize flour 2kg,432') && theory['tf-files'].includes('{"name":"Maize flour 2kg","price":432}'))
  assert.equal((await one('tf-3-e1')).customers, 150); assert.equal((await one('tf-3-e2')).duplicate_keys, 0)
  assert.deepEqual(await one('tf-3-e3'), { name: 'Mercy Mission School', sales: 113 })
  assert.ok(theory['tf-tables'].includes('150 rows') && theory['tf-tables'].includes('Mercy Mission School') && theory['tf-tables'].includes('113'))
  assert.equal((await one('tf-4-e1')).action, 'reorder'); assert.equal((await one('tf-4-e2')).large_sales, 610)
  assert.deepEqual((await run('tf-4-e3', all['tf-4-e3'].solution)).map((r) => r.customers), [120, 20, 10])
  assert.equal((await one('tf-5-e1')).buyers, 150); assert.equal((await one('tf-5-e2')).mismatched, 0); assert.equal((await one('tf-5-e3')).received, 28225)
  assert.ok(theory['tf-databases'].includes('2,046') && theory['tf-databases'].includes('0 mismatches'))
  assert.equal((await one('tf-6-e1')).host, 'api.shop.co.ke'); assert.equal((await one('tf-6-e2')).meaning, 'your request was wrong')
  assert.deepEqual(await one('tf-6-e3'), { name: 'Biscuits pack', unit_price: 467 })
  assert.equal((await one('tf-7-e1')).masked, 'K***')
  assert.deepEqual(await one('tf-7-e3'), { sales: 2046, payments: 1909 }); assert.ok(theory['tf-trust'].includes('2,046 sales and 1,909 payments'))
  assert.deepEqual(await one('tf-8-e1'), { credit_sales: 566 }); assert.deepEqual(await one('tf-8-e2'), { unpaid_credit: 137 }); assert.deepEqual(await one('tf-8-e3'), { paid_without_payment: 0 })
  assert.ok(theory['tf-first-principles'].includes('566') && theory['tf-first-principles'].includes('137'))
})

test('every concept the lessons teach exists in the concept map, with a rubric an honest explanation passes', () => {
  const cm = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/concepts/concepts.json'), 'utf8')).concepts
  const ids = new Set(cm.map((c) => c.id))
  for (const l of lessons) {
    const mine = cm.filter((c) => c.lessons.includes(l.id)); assert.equal(mine.length, 1, `${l.id}: exactly one concept`)
    const c = mine[0]; assert.ok(c.explain && c.explain.points.length === 3 && c.explain.need === 2, l.id)
    c.depends_on.forEach((d) => assert.ok(ids.has(d), `${c.id} depends on missing ${d}`))
  }
})

test('the master track places the eight lessons beside the business lessons, on the technology side', () => {
  const t = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/path/master-track.json'), 'utf8'))
  assert.equal(t.sides.techfirst, 'tech')
  const order = t.phases.slice(0, 2).flatMap((p) => p.items.map((i) => i.lesson).filter(Boolean))
  assert.deepEqual(order.filter((x) => x.startsWith('tf-')), IDS)
  const fd = order.filter((x) => x.startsWith('fd-')); assert.ok(fd.length >= 6)
  // alternation: a technology lesson never follows another more than twice in a row inside the two phases
  let run = 0
  for (const id of order) { run = id.startsWith('tf-') ? run + 1 : 0; assert.ok(run <= 2, `three technology lessons in a row at ${id}`) }
})

test('the academy is a real path: completion is refused until quiz, practicals and the explanation are done, then each lesson opens the next', async () => {
  makeLearner(h, db, 'walker')
  const g = db.getDb(); const all = byId()
  const status = (id) => g.prepare("SELECT status FROM lesson_progress WHERE user_id = 'walker' AND lesson_id = ?").get(id)?.status
  for (const [i, l] of lessons.entries()) {
    await h.invoke('lessons:start', { userId: 'walker', lessonId: l.id })
    const early = await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 1 })
    assert.equal(early.success, false, `${l.id}: completed without any work`); assert.equal(early.mastery_gaps.length, 3)
    assert.equal((await h.invoke('quizzes:submit', { userId: 'walker', lessonId: l.id, answers: l.quiz.map((q) => q.correct_index) })).passed, true)
    for (const e of l.exercises) {
      const r = await h.invoke('exercises:submit', { userId: 'walker', exerciseId: all[e.id].id, answer: e.solution })
      assert.equal(r.validation.correct, true, `${e.id}: ${r.validation.feedback}`)
    }
    const filler = await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: 'I think this was a very interesting lesson and I learned a great deal from reading it carefully today.' })
    assert.equal(filler.passed, false, `${l.id}: filler text passed the explanation`)
    const ex = await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: EXPLAIN[l.id] })
    assert.equal(ex.passed, true, `${l.id}: a real explanation was refused (${ex.reason ?? ex.missing})`)
    assert.equal((await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 60 })).success, true, l.id)
    assert.equal(status(l.id), 'complete')
    if (i < lessons.length - 1) assert.equal(status(lessons[i + 1].id), 'available')
  }
})

test('the academy is wired into every place a course lives', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'techfirst'[^\n]*'Tech First Principles'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /techfirst:\s+<SqlAcademy key="techfirst" course="techfirst" \/>/)
  assert.match(src('src/pages/Dashboard.tsx'), /id: 'techfirst'/)
  assert.match(src('src/components/ui/GlobalInstructor.tsx'), /'techfirst'/)
  assert.match(src('src/components/ui/LearningPlan.tsx'), /techfirst: 'Technology First Principles'/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /techfirst: \{[\s\S]*?placement: false/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /\^\(bp\|fd\|fo\|ml\|tf\)-/)
  assert.match(src('electron/services/sql.service.ts'), /startsWith\('ex_tf-'\)/)
  assert.match(src('electron/services/setup.service.ts'), /techfirst\/curriculum\.json/)
  assert.match(src('electron/services/fieldwork.ts'), /'techfirst'/)
  assert.match(src('electron/services/progress.service.ts'), /'techfirst'/)
  assert.match(src('src/styles/globals.css'), /--tf-color:\s+#38bdf8/); assert.match(src('src/styles/globals.css'), /--tf-color:\s+#0369a1/)
})
