'use strict'
// The six courses (SQL, Excel, Python, Power BI, Statistics, Business) are data files. A typo there is
// silent: a lesson that never unlocks, a quiz with no right answer, an exercise nobody can complete.
// These checks read the real files and the real seeded database.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { boot } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-curriculum' })
const MODULES = ['sql', 'excel', 'python', 'powerbi', 'statistics', 'business', 'dataeng']
const MODES = new Set(['exact', 'contains', 'ai_review', 'result_match'])
const load = (m) => JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content', m, 'curriculum.json'), 'utf8'))

test('every course has its lessons: unique ids, a title, theory, a quiz', () => {
  for (const m of MODULES) {
    const { lessons } = load(m)
    assert.ok(lessons.length >= 10, `${m}: expected at least 10 lessons, found ${lessons.length}`)
    assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length, `${m}: duplicate lesson ids`)
    for (const l of lessons) {
      assert.ok(l.title && l.description, `${m}/${l.id}: needs a title and description`)
      assert.ok((l.theory_md || '').trim().length > 200, `${m}/${l.id}: theory is missing or too short to teach anything`)
      assert.ok(Array.isArray(l.quiz) && l.quiz.length >= 2, `${m}/${l.id}: every lesson needs a quiz`)
    }
  }
})

test('lesson ids are unique across ALL courses (they share one database table)', () => {
  const ids = MODULES.flatMap((m) => load(m).lessons.map((l) => l.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('every quiz question has a real correct answer and an explanation', () => {
  for (const m of MODULES) {
    for (const l of load(m).lessons) {
      for (const [i, q] of l.quiz.entries()) {
        const where = `${m}/${l.id} quiz #${i + 1}`
        assert.ok(q.question && q.question.trim(), `${where}: question text`)
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${where}: needs at least two options`)
        assert.equal(new Set(q.options).size, q.options.length, `${where}: duplicate options`)
        assert.ok(Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < q.options.length, `${where}: correct_index must point at an option`)
        assert.ok((q.explanation || '').trim(), `${where}: explanation`)
      }
    }
  }
})

test('every prerequisite points at a lesson that exists, and every lesson can eventually be unlocked', () => {
  for (const m of MODULES) {
    const { lessons } = load(m)
    const byId = new Map(lessons.map((l) => [l.id, l]))
    for (const l of lessons) {
      for (const p of l.prerequisites || []) assert.ok(byId.has(p), `${m}/${l.id} requires "${p}", which does not exist - it could never unlock`)
    }
    // Walk the unlock order from the starter lessons; anything left over is unreachable (or in a cycle).
    const unlocked = new Set()
    let progressed = true
    while (progressed) {
      progressed = false
      for (const l of lessons) {
        if (!unlocked.has(l.id) && (l.prerequisites || []).every((p) => unlocked.has(p))) { unlocked.add(l.id); progressed = true }
      }
    }
    const stuck = lessons.filter((l) => !unlocked.has(l.id)).map((l) => l.id)
    assert.deepEqual(stuck, [], `${m}: these lessons can never be reached: ${stuck.join(', ')}`)
    assert.ok(lessons.some((l) => (l.prerequisites || []).length === 0), `${m}: needs a starter lesson`)
  }
})

test('every exercise is complete: id, prompt, solution, valid grading mode, hints, points', () => {
  const seen = new Set()
  let total = 0
  for (const m of MODULES) {
    for (const l of load(m).lessons) {
      for (const e of l.exercises || []) {
        total++
        const where = `${m}/${e.id}`
        assert.ok(e.id && !seen.has(e.id), `${where}: exercise ids must be unique across all courses`)
        seen.add(e.id)
        assert.ok((e.title || '').trim() && (e.prompt || '').trim(), `${where}: title and prompt`)
        assert.ok((e.solution || '').trim(), `${where}: solution`)
        assert.ok(MODES.has(e.evaluation_mode || 'exact'), `${where}: unknown evaluation_mode "${e.evaluation_mode}"`)
        assert.ok(e.hint_1 && e.hint_2 && e.hint_3, `${where}: all three hints (the screen offers three)`)
        assert.ok(e.points > 0, `${where}: points`)
      }
    }
  }
  assert.ok(total >= 120, `expected the full exercise bank, found ${total}`)
})

test('setup loads EVERYTHING in the files into the database - nothing skipped or lost', async () => {
  const db = h.req('db/database')
  await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  const q = (sql, ...a) => db.getDb().prepare(sql).get(...a).c

  for (const m of MODULES) {
    const { lessons } = load(m)
    assert.equal(q('SELECT COUNT(*) c FROM lessons WHERE module = ?', m), lessons.length, `${m}: lessons in the database`)
    const exercises = lessons.reduce((n, l) => n + (l.exercises || []).length, 0)
    assert.equal(
      q('SELECT COUNT(*) c FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE module = ?)', m),
      exercises, `${m}: exercises in the database`)
  }

  // Quizzes survive the round-trip through the database as real JSON, and the starter lessons are unlockable.
  for (const row of db.getDb().prepare('SELECT id, quiz, prerequisites FROM lessons').all()) {
    assert.ok(Array.isArray(JSON.parse(row.quiz)), `${row.id}: quiz stored as JSON`)
    assert.ok(Array.isArray(JSON.parse(row.prerequisites)), `${row.id}: prerequisites stored as JSON`)
  }
  assert.ok(db.getDb().prepare("SELECT COUNT(*) c FROM lessons WHERE prerequisites = '[]'").get().c >= MODULES.length)
})

test('the SQL course is only SQL exercises, and the practice tables expose the columns its lessons use', async () => {
  const db = h.req('db/database')
  const types = db.getDb().prepare("SELECT DISTINCT exercise_type FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE module = 'sql')").all()
  assert.deepEqual(types.map((t) => t.exercise_type), ['sql_query'])
  const known = new Set(
    db.getDb().prepare('SELECT column_info FROM bundled_datasets').all().flatMap((d) => JSON.parse(d.column_info).map((c) => c.name)),
  )
  assert.ok(known.has('patient_id') && known.has('bill_amount') && known.has('discharge_date'))
})
