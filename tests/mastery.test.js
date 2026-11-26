'use strict'
// Phase 1 of the zero-to-founder work: the concept map is sound, quiz results are graded and saved by the app,
// and a lesson that requires mastery cannot be completed early, while every existing lesson completes as before.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-mastery' })
let db, g
test.before(async () => { db = await h.start(); g = db.getDb(); makeLearner(h, db, 'M') })

const content = () => fs.readdirSync(path.join(h.ROOT, 'content'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(h.ROOT, 'content', d.name, 'curriculum.json')))
  .flatMap((d) => JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content', d.name, 'curriculum.json'), 'utf8')).lessons)
const concepts = () => JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/concepts/concepts.json'), 'utf8')).concepts

test('concept map: unique ids, real dependencies, no cycles, one-line definitions', () => {
  const list = concepts(); const ids = new Set(list.map((c) => c.id))
  assert.equal(ids.size, list.length, 'duplicate concept id')
  for (const c of list) {
    assert.match(c.definition, /^[^\n]{20,260}$/, `${c.id}: definition must be one plain line`)
    for (const d of c.depends_on) assert.ok(ids.has(d), `${c.id} depends on unknown "${d}"`)
    assert.ok(!c.depends_on.includes(c.id), `${c.id} depends on itself`)
  }
  const state = new Map()
  const visit = (id, trail) => {
    if (state.get(id) === 2) return
    assert.notEqual(state.get(id), 1, `cycle: ${[...trail, id].join(' > ')}`)
    state.set(id, 1)
    list.find((c) => c.id === id).depends_on.forEach((d) => visit(d, [...trail, id]))
    state.set(id, 2)
  }
  list.forEach((c) => visit(c.id, []))
})

test('concept map: every concept is taught by real lessons that have a quiz and a graded practical', () => {
  const byId = new Map(content().map((l) => [l.id, l]))
  for (const c of concepts()) {
    assert.ok(c.lessons.length > 0, `${c.id} has no lesson`)
    for (const id of c.lessons) {
      const l = byId.get(id)
      assert.ok(l, `${c.id}: lesson "${id}" does not exist`)
      assert.ok((l.quiz || []).length > 0, `${c.id}: ${id} has no quiz`)
      assert.ok((l.exercises || []).length > 0, `${c.id}: ${id} has no practical`)
    }
  }
})

test('schema: quiz_results exists, the mastery flag defaults to 0 and only the Start Here and Founder Track lessons require it', () => {
  assert.ok(g.prepare("SELECT 1 FROM sqlite_master WHERE name = 'quiz_results'").get())
  const col = g.prepare("SELECT dflt_value FROM pragma_table_info('lessons') WHERE name = 'mastery_required'").get()
  assert.equal(col.dflt_value, '0')
  const gated = g.prepare('SELECT module FROM lessons WHERE mastery_required <> 0').all().map((r) => r.module)
  assert.ok(gated.length > 0 && gated.every((m) => m === 'foundations' || m === 'founder' || m === 'aiml' || m === 'techfirst'), 'mastery applies to Start Here, the Founder Track, the AI & ML Track and Technology First Principles only')
  assert.equal(g.prepare('SELECT MAX(version) v FROM schema_migrations').get().v, 10)
})

const quizOf = (id) => JSON.parse(g.prepare('SELECT quiz FROM lessons WHERE id = ?').get(id).quiz)
const right = (id) => quizOf(id).map((q) => q.correct_index)
const wrong = (id) => quizOf(id).map((q) => (q.correct_index + 1) % q.options.length)

test('quizzes:submit marks the answers itself, saves one row per finished quiz and lessons:get reports the best', async () => {
  const lesson = 'sql-select'
  assert.equal((await h.invoke('lessons:get', { userId: 'M', lessonId: lesson })).quiz_best_pct, null)
  const bad = await h.invoke('quizzes:submit', { userId: 'M', lessonId: lesson, answers: wrong(lesson) })
  assert.deepEqual([bad.success, bad.correct, bad.pct, bad.passed], [true, 0, 0, false])
  const good = await h.invoke('quizzes:submit', { userId: 'M', lessonId: lesson, answers: right(lesson) })
  assert.deepEqual([good.correct, good.total, good.pct, good.passed], [quizOf(lesson).length, quizOf(lesson).length, 100, true])
  assert.equal(g.prepare("SELECT COUNT(*) c FROM quiz_results WHERE user_id = 'M'").get().c, 2)
  assert.equal((await h.invoke('lessons:get', { userId: 'M', lessonId: lesson })).quiz_best_pct, 100)
})

test('quizzes:submit refuses answers that do not fit the quiz and saves nothing', async () => {
  const before = g.prepare('SELECT COUNT(*) c FROM quiz_results').get().c
  const lesson = 'sql-select'
  for (const answers of [[], [0], [...right(lesson), 0], 'x', null, [0.5, 1, 1], ['0', '1', '1']]) {
    assert.deepEqual(await h.invoke('quizzes:submit', { userId: 'M', lessonId: lesson, answers }), { success: false })
  }
  assert.deepEqual(await h.invoke('quizzes:submit', { userId: 'M', lessonId: 'no-such-lesson', answers: [0] }), { success: false })
  assert.equal(g.prepare('SELECT COUNT(*) c FROM quiz_results').get().c, before)
})

test('a lesson that does not require mastery completes exactly as before', async () => {
  const r = await h.invoke('lessons:complete', { userId: 'M', lessonId: 'sql-where', timeSpentS: 5 })
  assert.equal(r.success, true)
  assert.equal(r.mastery_gaps, undefined)
})

test('a mastery lesson needs the quiz passed at 80% and every practical passed, then completes', async () => {
  g.prepare("INSERT INTO lessons (id, module, title, description, level, quiz, mastery_required) VALUES ('mx-1','sql','Mastery probe','d','beginner', ?, 1)")
    .run(JSON.stringify([0, 1, 2, 3, 4].map((i) => ({ question: `q${i}`, options: ['a', 'b'], correct_index: 0, explanation: 'e' }))))
  g.prepare("INSERT INTO exercises (id, lesson_id, exercise_type, title, prompt, solution, evaluation_mode, points, sort_order) VALUES ('mx-1-e1','mx-1','sql_query','t','p','SELECT 1','exact',10,1)").run()
  g.prepare("INSERT INTO exercises (id, lesson_id, exercise_type, title, prompt, solution, evaluation_mode, points, sort_order) VALUES ('mx-1-e2','mx-1','sql_query','t','p','SELECT 1','exact',10,2)").run()
  await h.invoke('lessons:start', { userId: 'M', lessonId: 'mx-1' }) // the lesson page does this on every open
  const complete = () => h.invoke('lessons:complete', { userId: 'M', lessonId: 'mx-1', timeSpentS: 1 })
  const status = () => g.prepare("SELECT status FROM lesson_progress WHERE user_id = 'M' AND lesson_id = 'mx-1'").get()

  let r = await complete()
  assert.equal(r.success, false); assert.equal(r.mastery_gaps.length, 2)
  assert.equal(status().status, 'in_progress', 'a refused completion must not change progress')

  await h.invoke('quizzes:submit', { userId: 'M', lessonId: 'mx-1', answers: [0, 0, 0, 1, 1] }) // 60%
  r = await complete(); assert.equal(r.mastery_gaps.length, 2)
  await h.invoke('quizzes:submit', { userId: 'M', lessonId: 'mx-1', answers: [0, 0, 0, 0, 1] }) // 80%
  r = await complete(); assert.equal(r.mastery_gaps.length, 1); assert.match(r.mastery_gaps[0], /2 practicals/)

  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, score) VALUES ('a1','M','mx-1-e1','x',1,100)").run()
  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, score) VALUES ('a2','M','mx-1-e2','x',0,0)").run()
  r = await complete(); assert.match(r.mastery_gaps[0], /1 practical/)
  g.prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct, score) VALUES ('a3','M','mx-1-e2','x',1,100)").run()
  r = await complete(); assert.equal(r.success, true)
  assert.equal(status().status, 'complete')
})

test('a licence in view-only mode cannot save quiz results, and the quiz screen survives that refusal', () => {
  const { READ_CHANNELS } = h.req('licensing/licence-gate')
  assert.equal(READ_CHANNELS.has('quizzes:submit'), false)
  const quiz = src('src/components/ui/LessonQuiz.tsx')
  assert.match(quiz, /quizzes\.submit\([^)]*\)\.catch\(/)
})

test('every academy passes its lesson id to the quiz so results are recorded', () => {
  for (const f of ['SqlAcademy', 'PythonAcademy', 'ExcelAcademy', 'PowerBIAcademy', 'StatisticsAcademyFull', 'BusinessAcademyFull']) {
    assert.match(src(`src/pages/${f}.tsx`), /<LessonQuiz [^\n]*lessonId=/, f)
  }
})

test('the lesson upsert carries the mastery flag from content and the preload exposes the channel', () => {
  assert.match(src('electron/services/setup.service.ts'), /mastery_required = excluded\.mastery_required/)
  assert.match(src('electron/preload.ts'), /'quizzes:submit'/)
  assert.match(src('src/types/electron.d.ts'), /quizzes:\s*\{/)
})
