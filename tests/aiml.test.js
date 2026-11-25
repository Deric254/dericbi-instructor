'use strict'
// The AI & ML Track: twelve lessons from "what a model is" to monitoring one after launch, taught with SQL on the practice business.
// Every model answer must be accepted by the real grader, classic mistakes rejected, the figures the lessons quote must match what
// the answers produce, a learner must really pass quiz, practicals and explain-back before a lesson completes, and the other
// academies stay undisturbed.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser, makeLearner, src } = require('./helpers/harness')

const IDS = ['ml-model', 'ml-split', 'ml-regress', 'ml-error', 'ml-classify', 'ml-metrics', 'ml-overfit', 'ml-knn', 'ml-features', 'ml-llm', 'ml-rag', 'ml-ops']
const EXPLAIN = {
  'ml-model': 'A model is a rule that turns facts into a guess, and the baseline is the simplest guess, such as always the average, so a model that is no better than the baseline has learned nothing useful.',
  'ml-split': 'I keep a test set aside and learn only from the training set, because the model must be judged on data it has never seen, and leakage is when test information influences the learning.',
  'ml-regress': 'The slope tells me how much the price rises for each extra unit of cost, the line is the best fit through the sums, and I use only the training data so the test stays honest.',
  'ml-error': 'MAE is the average size of the miss while MSE uses squared errors so big misses count much more, and I always look at the worst miss because it can reveal an exception.',
  'ml-classify': 'The baseline always guesses the most common answer, and a model is useless if its accuracy, the percentage right, is worse than always paid.',
  'ml-metrics': 'Precision is how often a warning is right and recall is how many of the real cases it catches, and accuracy hides these two kinds of mistake that cost different amounts.',
  'ml-overfit': 'Overfitting is when the model memorises the training data instead of learning, which I spot by a big gap between the training score and the test score, and it fails on new data.',
  'ml-knn': 'It finds the closest cases that are most similar and takes the average of their values, and the size of k and how distance is measured change how smooth the guess is.',
  'ml-features': 'A feature is an input the model is given, and leakage is using something only known after the sale, which looks brilliant in testing but fails in real life.',
  'ml-llm': 'A language model predicts the next piece of text, a token is a small piece of text that providers charge for, and it can sound right and be wrong so I check the answers.',
  'ml-rag': 'Retrieval finds the relevant documents for a question and gives them to the model so it answers from them, and an evaluation set with recall tells me whether the search works.',
  'ml-ops': 'Drift is when the data changes from what the model was built on, so I set a threshold in advance that triggers a check and decide who looks at it before it goes live.',
}
const h = bootWithIpc({ prefix: 'dbi-aiml' })
let db, sql, lessons
test.before(async () => {
  db = await h.start(); makeUser(db, 'u')
  sql = h.req('services/sql.service')
  lessons = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/aiml/curriculum.json'), 'utf8')).lessons
})
const exercises = () => lessons.flatMap((l) => l.exercises)
const byId = () => Object.fromEntries(exercises().map((e) => [e.id, e]))
const run = async (id, query) => {
  const r = await sql.executeSQL({ sandboxId: `ex_${id}_u`, userId: 'u', query })
  assert.equal(r.success, true, `${id}: ${r.error}`)
  return r.rows
}
const grade = (id, user, solution) => sql.validateSQLAnswer({ sandboxId: `ex_${id}_u`, userQuery: user, solutionQuery: solution, evaluationMode: 'exact' })

test('the track is its own module of 12 gated lessons and does not change the others', () => {
  const g = db.getDb()
  const count = (m) => g.prepare('SELECT COUNT(*) c FROM lessons WHERE module = ?').get(m).c
  assert.equal(count('aiml'), 12)
  assert.equal(count('foundations'), 8); assert.equal(count('founder'), 12); assert.equal(count('sql'), 10); assert.equal(count('dataeng'), 20); assert.equal(count('bizsolver'), 11)
  assert.equal(g.prepare("SELECT COUNT(*) c FROM lessons WHERE module = 'aiml' AND mastery_required = 1").get().c, 12)
})

test('a full path: the first lesson is open, each next needs the one before (the language-model lessons branch from the first), each has the whole template, 5 quiz questions and 3 graded practicals', () => {
  assert.deepEqual(lessons.map((l) => l.id), IDS)
  lessons.forEach((l, i) => {
    assert.equal(l.sort_order, i + 1)
    // A straight chain, except that the language-model lessons branch from the first lesson so the later machine-learning lessons never block them.
    const branch = { 'ml-llm': ['ml-model'], 'ml-rag': ['ml-llm'], 'ml-ops': ['ml-rag'] }
    assert.deepEqual(l.prerequisites, branch[l.id] || (i ? [lessons[i - 1].id] : []), l.id)
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
    'ml-2-e3': 'SELECT ROUND(AVG(ABS(unit_price - (SELECT AVG(unit_price) FROM shop_products))), 2) AS test_baseline_mae FROM shop_products WHERE product_id % 2 = 0', // learns the average from all the data: leakage
    'ml-3-e2': 'WITH s AS (SELECT COUNT(*) AS n, SUM(unit_cost) AS sx, SUM(unit_price) AS sy, SUM(unit_cost * unit_cost) AS sxx, SUM(unit_cost * unit_price) AS sxy FROM shop_products WHERE product_id % 2 = 1) SELECT ROUND((n * sxy - sx * sy) / (n * sxx - sx * sx), 4) AS slope FROM s', // whole-number division
    'ml-4-e1': 'SELECT ROUND(AVG(ABS(unit_price - (15.33 + 1.236 * unit_cost))), 2) AS line_mae FROM shop_products', // scores on all products, not the test half
    'ml-5-e2': "SELECT ROUND(100 * SUM(payment_status = 'paid') / COUNT(*), 1) AS accuracy_pct FROM shop_sales", // whole-number division drops the decimals
    'ml-6-e2': "SELECT ROUND(100.0 * SUM(total > 20000 AND payment_status = 'credit') / SUM(payment_status = 'credit'), 1) AS precision_pct, ROUND(100.0 * SUM(total > 20000 AND payment_status = 'credit') / SUM(payment_status = 'credit'), 1) AS recall_pct FROM shop_sales", // precision with the recall denominator
    'ml-8-e1': 'SELECT product_id, name, unit_price, ABS(unit_cost - (SELECT unit_cost FROM shop_products WHERE product_id = 10)) AS distance FROM shop_products ORDER BY distance, product_id LIMIT 3', // neighbours from all products: product 10 finds itself
    'ml-9-e3': "SELECT SUM(payment_status = 'credit') AS credit_without_payment, SUM(payment_status = 'paid') AS paid_without_payment FROM shop_sales", // counts every sale, ignoring payments
    'ml-11-e3': "SELECT 50 AS recall_at_2_pct", // a guessed answer
    'ml-12-e3': "SELECT 1 AS quarter, 26.7 AS credit_pct, 'ok' AS status", // one row only
  }
  for (const [id, user] of Object.entries(wrong)) {
    assert.equal((await grade(id, user, all[id].solution)).correct, false, `${id}: a wrong answer was accepted`)
  }
})

test('the figures the lessons quote are the figures the answers produce', async () => {
  const all = byId(); const theory = Object.fromEntries(lessons.map((l) => [l.id, l.theory_md]))
  const one = async (id) => (await run(id, all[id].solution))[0]
  assert.equal((await one('ml-1-e1')).baseline, 1359.17); assert.ok(theory['ml-model'].includes('1,359.17'))
  assert.equal((await one('ml-1-e2')).baseline_mae, 1027.09); assert.ok(theory['ml-model'].includes('1,027.09'))
  assert.equal((await one('ml-1-e3')).rule_mae, 74.04); assert.ok(theory['ml-model'].includes('74.04'))
  assert.equal((await one('ml-2-e2')).train_mean, 1103.65); assert.ok(theory['ml-split'].includes('1,103.65'))
  assert.equal((await one('ml-2-e3')).test_baseline_mae, 1178.03); assert.ok(theory['ml-split'].includes('1,178.03'))
  const sums = await one('ml-3-e1'); assert.deepEqual([sums.n, sums.sum_x, sums.sum_y, sums.sum_xx, sums.sum_xy], [20, 17610, 22073, 26064850, 32486805])
  for (const n of ['17,610', '22,073', '26,064,850', '32,486,805']) assert.ok(theory['ml-regress'].includes(n), n)
  const line = await one('ml-3-e3'); assert.deepEqual([line.slope, line.intercept], [1.236, 15.33])
  assert.equal((await one('ml-4-e1')).line_mae, 103.79); assert.ok(theory['ml-error'].includes('103.79'))
  assert.deepEqual(await one('ml-4-e3'), { name: 'Acaricide 1L', error: 548.29 }); assert.ok(theory['ml-error'].includes('548.29'))
  assert.equal((await one('ml-5-e2')).accuracy_pct, 72.3); assert.equal((await one('ml-5-e3')).accuracy_pct, 65.6)
  assert.ok(theory['ml-classify'].includes('72.3') && theory['ml-classify'].includes('65.6'))
  const cm = await one('ml-6-e1'); assert.deepEqual([cm.tp, cm.fp, cm.fn, cm.tn], [236, 374, 330, 1106])
  const pr = await one('ml-6-e2'); assert.deepEqual([pr.precision_pct, pr.recall_pct], [38.7, 41.7])
  const pr4 = await one('ml-6-e3'); assert.deepEqual([pr4.precision_pct, pr4.recall_pct], [38.4, 5.8])
  assert.equal((await one('ml-7-e1')).test_accuracy_pct, 67); assert.equal((await one('ml-7-e2')).test_accuracy_pct, 65); assert.equal((await one('ml-7-e3')).train_accuracy_pct, 98.5)
  for (const n of ['98.5 percent', '65.0 percent', '67.0 percent', '72.5 percent']) assert.ok(theory['ml-overfit'].includes(n), n)
  assert.equal((await one('ml-8-e2')).predicted_price, 1113.33); assert.equal((await one('ml-8-e3')).error, 202.67)
  assert.ok(theory['ml-knn'].includes('1,113.33') && theory['ml-knn'].includes('202.67') && theory['ml-knn'].includes('1,220.43') && theory['ml-knn'].includes('95.57'))
  assert.equal(1220.43, Math.round((15.33 + 1.236 * 975) * 100) / 100); assert.equal(95.57, Math.round((1316 - 1220.43) * 100) / 100)
  const seg = await run('ml-9-e1', all['ml-9-e1'].solution); assert.deepEqual(seg.map((r) => r.credit_pct), [39.1, 3.9, 40.1])
  const watch = await one('ml-9-e2'); assert.deepEqual([watch.sales_to_watch_pct, watch.credit_caught_pct], [66.4, 95.2])
  assert.deepEqual(await one('ml-9-e3'), { credit_without_payment: 137, paid_without_payment: 0 })
  assert.deepEqual(await one('ml-10-e1'), { name_tokens: 132 }); assert.equal((await one('ml-10-e2')).cost_per_call, 0.091)
  assert.deepEqual(await one('ml-10-e3'), { monthly_cost: 27.3, context_check: 'fits' })
  assert.deepEqual((await run('ml-11-e1', all['ml-11-e1'].solution)).slice(0, 2), [{ action_id: 2, score: 2 }, { action_id: 3, score: 1 }])
  assert.equal((await one('ml-11-e3')).recall_at_2_pct, 100)
  assert.deepEqual((await run('ml-12-e3', all['ml-12-e3'].solution)).map((r) => r.status), ['ok', 'ok', 'ok', 'check'])
  assert.ok(theory['ml-ops'].includes('28.8 percent') && theory['ml-ops'].includes('3.9 points'))
})

test('rates and prices in the language-model lesson are labelled as practice figures, with a pointer to the real source', () => {
  const t = lessons.find((l) => l.id === 'ml-llm').theory_md
  assert.match(t, /as an example only/); assert.match(t, /invented for practice/); assert.match(t, /provider's current page/)
  assert.match(lessons.find((l) => l.id === 'ml-llm').exercises[1].prompt, /example rate/)
})

test('the track is a real path: completion is refused until quiz, practicals and the explanation are done, then each lesson opens the next', async () => {
  makeLearner(h, db, 'walker')
  const g = db.getDb(); const all = byId()
  const status = (id) => g.prepare("SELECT status FROM lesson_progress WHERE user_id = 'walker' AND lesson_id = ?").get(id)?.status
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
    const ex = await h.invoke('explain:submit', { userId: 'walker', lessonId: l.id, text: EXPLAIN[l.id] })
    assert.equal(ex.passed, true, `${l.id}: a real explanation was refused (${ex.reason ?? ex.missing})`)
    assert.equal((await h.invoke('lessons:complete', { userId: 'walker', lessonId: l.id, timeSpentS: 60 })).success, true, l.id)
    assert.equal(status(l.id), 'complete')
    if (i < lessons.length - 1) assert.equal(status(lessons[i + 1].id), 'available')
  }
  assert.equal(g.prepare("SELECT COUNT(*) c FROM user_achievements WHERE user_id = 'walker' AND achievement_id IN ('ach_ml_first','ach_ml_done')").get().c, 2)
})

test('the real-world task works in this track and a learner can keep evidence', async () => {
  makeLearner(h, db, 'field')
  const saved = await h.invoke('fieldwork:save', { userId: 'field', lessonId: 'ml-model', did: 'Guessed next month sales as the average of the last three months', learned: 'The simple average missed by about twelve percent in a normal month' })
  assert.equal(saved.success, true)
  assert.equal((await h.invoke('fieldwork:get', { userId: 'field', lessonId: 'ml-model' })).saved, true)
})

test('the track is wired into every place a course lives, and the other academies keep their own wiring', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'aiml'[^\n]*'AI & ML Track'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /aiml:\s+<SqlAcademy key="aiml" course="aiml" \/>/)
  assert.match(src('src/pages/Dashboard.tsx'), /id: 'aiml'/)
  assert.match(src('src/components/ui/GlobalInstructor.tsx'), /'aiml'/)
  assert.match(src('src/components/ui/LearningPlan.tsx'), /aiml: 'AI & ML Track'/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /aiml: \{[\s\S]*?placement: false/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /\^\(bp\|fd\|fo\|ml\)-/)
  assert.match(src('electron/services/sql.service.ts'), /startsWith\('ex_ml-'\)/)
  assert.match(src('electron/services/setup.service.ts'), /aiml\/curriculum\.json/)
  assert.match(src('electron/services/fieldwork.ts'), /'aiml'/)
  assert.match(src('electron/services/ai.service.ts'), /AI & ML Track/)
  assert.match(src('src/styles/globals.css'), /--ml-color:\s+#d946ef/)
  assert.match(src('src/styles/globals.css'), /--ml-color:\s+#a21caf/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /founder: \{[\s\S]*?placement: false/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /foundations: \{[\s\S]*?placement: true/)
})
