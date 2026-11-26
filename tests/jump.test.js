'use strict'
// Guided jumping and the mastery ladder. A learner may open any lesson: they get an honest readiness light from the ideas they would be
// missing, a short check that can clear those ideas, or "go anyway" as provisional (it opens, but does not count toward a phase until the
// ideas are in place). The ladder is worked out from work actually done. Both are driven by content files, never by lesson names in code.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src, ROOT } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-jump' })
let db, J, L, P, concepts
test.before(async () => {
  db = await h.start(); J = h.req('services/jump'); L = h.req('services/ladder'); P = h.req('services/path')
  concepts = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/concepts/concepts.json'), 'utf8')).concepts
  for (const u of ['ann', 'ben', 'cat', 'dan', 'eve', 'fay', 'gus', 'hal']) makeLearner(h, db, u)
})
const g = () => db.getDb()
const explained = (u, conceptId) => g().prepare("INSERT INTO explain_results (user_id, concept_id, passed, answer) VALUES (?, ?, 1, 'x') ON CONFLICT(user_id, concept_id) DO UPDATE SET passed = 1").run(u, conceptId)
const lessonStatus = (u, id) => g().prepare('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(u, id)?.status
const correctFor = (q) => { const [lesson, i] = q.ref.split(':'); return JSON.parse(g().prepare('SELECT quiz FROM lessons WHERE id = ?').get(lesson).quiz)[Number(i)].correct_index }

test('the light follows the ideas a lesson rests on: green nothing missing, amber one, red two or more', () => {
  assert.equal(J.jumpCheck('ann', 'tf-data').light, 'green')
  const files = J.jumpCheck('ann', 'tf-files')
  assert.equal(files.light, 'amber'); assert.deepEqual(files.gaps.map((x) => x.id), ['data-types'])
  const dbs = J.jumpCheck('ann', 'tf-databases')
  assert.equal(dbs.light, 'red'); assert.deepEqual(dbs.gaps.map((x) => x.id), ['tables-keys', 'data-types'])
  assert.ok(dbs.gaps.every((x) => x.name && x.definition))
  explained('ann', 'data-types')
  assert.equal(J.jumpCheck('ann', 'tf-files').light, 'green', 'holding the idea clears it')
  assert.deepEqual(J.jumpCheck('ann', 'tf-databases').gaps.map((x) => x.id), ['tables-keys'], 'only the idea still missing is listed')
  assert.equal(J.jumpCheck('ann', 'no-such-lesson'), null)
})

test('a lesson with no concept falls back to the lessons it waits for, and at most three gaps are ever listed', () => {
  const taught = new Set(concepts.flatMap((c) => c.lessons))
  const row = g().prepare('SELECT id, prerequisites FROM lessons').all().find((l) => !taught.has(l.id) && JSON.parse(l.prerequisites).length > 0)
  assert.ok(row, 'there is a lesson with no concept and a prerequisite')
  const c = J.jumpCheck('ben', row.id)
  assert.equal(c.gaps[0].kind, 'lesson'); assert.ok(JSON.parse(row.prerequisites).includes(c.gaps[0].id)); assert.ok(c.gaps.length <= 3)
  for (const l of g().prepare('SELECT id FROM lessons').all()) assert.ok(J.jumpCheck('ben', l.id).gaps.length <= 3, l.id)
})

test('the check asks up to three questions from the missing ideas\' own lessons and never gives away the answers', () => {
  const c = J.jumpCheck('cat', 'tf-databases')
  assert.equal(c.questions.length, 3)
  for (const q of c.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['options', 'question', 'ref']); assert.ok(q.options.length >= 2)
    assert.ok(['tf-tables', 'tf-data'].includes(q.ref.split(':')[0]), `${q.ref} comes from a missing idea's lesson`)
  }
  assert.equal(new Set(c.questions.map((q) => q.ref)).size, 3)
  assert.deepEqual(J.questionsFor([], concepts), [])
  assert.equal(J.jumpCheck('cat', 'tf-data').questions.length, 0, 'nothing missing means nothing to ask')
})

test('right answers clear the gaps and open the lesson; wrong ones leave it closed so the learner can review', () => {
  const c = J.jumpCheck('dan', 'tf-files')
  const wrong = J.jumpGo('dan', 'tf-files', c.questions.map((q) => ({ ref: q.ref, choice: (correctFor(q) + 1) % q.options.length })), false)
  assert.equal(wrong.success, true); assert.equal(wrong.started, false); assert.equal(wrong.correct, 0)
  assert.equal(lessonStatus('dan', 'tf-files'), undefined, 'a failed check opens nothing')
  assert.equal(g().prepare("SELECT COUNT(*) c FROM jump_passes WHERE user_id = 'dan'").get().c, 0)
  const ok = J.jumpGo('dan', 'tf-files', c.questions.map((q) => ({ ref: q.ref, choice: correctFor(q) })), false)
  assert.deepEqual([ok.started, ok.passed, ok.provisional], [true, true, false])
  assert.equal(lessonStatus('dan', 'tf-files'), 'in_progress')
  assert.equal(g().prepare("SELECT COUNT(*) c FROM jump_passes WHERE user_id = 'dan' AND ref = 'data-types'").get().c, 1)
  assert.equal(J.jumpCheck('dan', 'tf-instructions').light, 'green', 'a proven idea stays proven for other lessons')
  assert.equal(J.provisionalOpen('dan').size, 0)
})

test('two of three is enough, one of three is not', () => {
  const c = J.jumpCheck('eve', 'tf-databases')
  const answer = (rights) => c.questions.map((q, i) => ({ ref: q.ref, choice: i < rights ? correctFor(q) : (correctFor(q) + 1) % q.options.length }))
  assert.equal(J.jumpGo('eve', 'tf-databases', answer(1), false).started, false)
  const two = J.jumpGo('eve', 'tf-databases', answer(2), false)
  assert.deepEqual([two.started, two.correct, two.total], [true, 2, 3])
})

test('a check cannot be gamed: too few answers, repeats, foreign or malformed references are refused', () => {
  const c = J.jumpCheck('fay', 'tf-databases'); const q = c.questions
  const r = (a) => J.jumpGo('fay', 'tf-databases', a, false)
  assert.deepEqual(r([{ ref: q[0].ref, choice: correctFor(q[0]) }]), { success: false, reason: 'invalid' })
  assert.equal(r([{ ref: q[0].ref, choice: 0 }, { ref: q[0].ref, choice: 0 }, { ref: q[1].ref, choice: 0 }]).reason, 'invalid')
  assert.equal(r([{ ref: 'sql-select:0', choice: 0 }, { ref: q[1].ref, choice: 0 }, { ref: q[2].ref, choice: 0 }]).reason, 'invalid')
  assert.equal(r([{ ref: q[0].ref, choice: 'a' }, { ref: q[1].ref, choice: 0 }, { ref: q[2].ref, choice: 0 }]).reason, 'invalid')
  assert.equal(r([{ ref: 'nonsense', choice: 0 }, { ref: q[1].ref, choice: 0 }, { ref: q[2].ref, choice: 0 }]).reason, 'invalid')
  assert.equal(r('yes').reason, 'invalid'); assert.equal(r([]).reason, 'invalid')
  assert.equal(J.jumpGo('fay', 'no-such-lesson', undefined, true).reason, 'unknown')
  assert.equal(lessonStatus('fay', 'tf-databases'), undefined)
})

test('go anyway opens the lesson as provisional: it completes, but does not count until the missing ideas are in place', () => {
  const o = J.jumpGo('gus', 'tf-files', undefined, true)
  assert.deepEqual([o.started, o.provisional], [true, true]); assert.equal(lessonStatus('gus', 'tf-files'), 'in_progress')
  g().prepare("UPDATE lesson_progress SET status = 'complete' WHERE user_id = 'gus' AND lesson_id = 'tf-files'").run()
  const item = () => P.getPath('gus').phases.flatMap((p) => p.items).find((i) => i.id === 'tf-files')
  assert.equal(item().done, false, 'finished but provisional'); assert.equal(item().provisional, true)
  assert.equal(P.getPath('gus').phases[0].tech.done, 0)
  explained('gus', 'data-types')
  assert.equal(item().done, true); assert.equal(item().provisional, false); assert.equal(P.getPath('gus').phases[0].tech.done, 1)
})

test('a lesson already begun is never held back, and the path page marks each unstarted lesson with its light', () => {
  const items = P.getPath('hal').phases.flatMap((p) => p.items).filter((i) => i.kind === 'lesson')
  assert.ok(items.every((i) => (i.status === 'in_progress' || i.status === 'complete' ? i.light === null : ['green', 'amber', 'red'].includes(i.light))))
  assert.equal(items.find((i) => i.id === 'tf-data').light, 'green'); assert.equal(items.find((i) => i.id === 'tf-databases').light, 'red')
})

test('the strict path still keeps later phases closed, even to a jump', async () => {
  const track = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/path/master-track.json'), 'utf8'))
  const later = track.phases.slice(1).flatMap((p) => p.items).find((i) => i.lesson).lesson
  assert.equal((await h.invoke('path:jump', { userId: 'hal', lessonId: later })).held, false)
  await h.invoke('path:strict', { userId: 'hal', on: true })
  assert.equal((await h.invoke('path:jump', { userId: 'hal', lessonId: later })).held, true)
  const r = await h.invoke('path:jump-go', { userId: 'hal', lessonId: later, go: true })
  assert.deepEqual(r, { success: false, reason: 'held' }); assert.equal(lessonStatus('hal', later), undefined)
  await h.invoke('path:strict', { userId: 'hal', on: false })
  assert.equal((await h.invoke('path:jump-go', { userId: 'hal', lessonId: later, go: true })).started, true)
})

test('the ladder is worked out from real work, level by level, and level 5 is never awarded', () => {
  const level = (u, phaseOf) => L.conceptLevels(u, phaseOf).find((c) => c.id === 'data-types').level
  const phaseOf = new Map([['tf-data', 'p0']])
  assert.equal(level('ann', phaseOf), 1, 'ann explained data-types earlier')
  assert.equal(level('cat', phaseOf), 0)
  explained('cat', 'data-types'); assert.equal(level('cat', phaseOf), 1)
  const ex = g().prepare('SELECT id FROM exercises WHERE lesson_id = ?').all('tf-data'); assert.equal(ex.length, 3)
  ex.slice(0, 2).forEach((e, i) => g().prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct) VALUES (?, 'cat', ?, 'x', 1)").run(`a${i}`, e.id))
  assert.equal(level('cat', phaseOf), 1, 'two of three practicals is not level 2')
  g().prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct) VALUES ('a9', 'cat', ?, 'x', 1)").run(ex[2].id)
  assert.equal(level('cat', phaseOf), 2)
  g().prepare("INSERT INTO field_tasks (user_id, lesson_id, did, learned) VALUES ('cat', 'tf-data', 'did a thing', 'learned a thing')").run()
  assert.equal(level('cat', phaseOf), 3)
  assert.equal(level('cat', new Map()), 3, 'without a phase the gate cannot count')
  g().prepare("INSERT INTO path_gates (user_id, phase_id, evidence) VALUES ('cat', 'p0', 'built and defended it')").run()
  assert.equal(level('cat', phaseOf), 4)
  assert.ok(L.conceptLevels('cat', phaseOf).every((c) => c.level <= 4))
  // levels are consecutive: a gate alone, with nothing under it, is not level 4
  g().prepare("INSERT INTO path_gates (user_id, phase_id, evidence) VALUES ('dan', 'p0', 'built and defended it')").run()
  assert.equal(L.conceptLevels('dan', phaseOf).find((c) => c.id === 'file-formats').level, 0)
})

test('the ladder and the readiness check are data driven: a broken file means nothing is shown, never a crash', () => {
  const real = L.loadLadder(); assert.equal(real.length, 5); assert.equal(real[4].available, false); assert.ok(real.slice(0, 4).every((l) => l.available))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lad-'))
  const bad = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return L.loadLadder(f) }
  assert.equal(L.loadLadder(path.join(tmp, 'missing.json')), null); assert.equal(bad('a.json', 'nope'), null)
  assert.equal(bad('b.json', JSON.stringify({ levels: [{ level: 2, name: 'x', meaning: 'y' }] })), null)
  assert.equal(bad('c.json', JSON.stringify({ levels: [] })), null)
  // with only two available levels nothing above them is ever awarded
  const two = [{ level: 1, name: 'a', meaning: 'm', available: true }, { level: 2, name: 'b', meaning: 'm', available: true }, { level: 3, name: 'c', meaning: 'm', available: false }]
  assert.ok(L.conceptLevels('cat', new Map(), concepts, two).every((c) => c.level <= 2))
})

test('the screen and the channels: lights, the check, the ladder, licence classes, backup and schema', async () => {
  const page = src('src/pages/Path.tsx')
  assert.match(page, /function JumpPanel/); assert.match(page, /Go anyway \(provisional\)/); assert.match(page, /function Ladder/); assert.match(page, /window\.api\.path\.jump\(/)
  assert.match(src('electron/preload.ts'), /'path:jump-go'/); assert.match(src('electron/preload.ts'), /'ladder:get'/)
  assert.match(src('electron/db/schema.ts'), /SCHEMA_VERSION = 10/)
  assert.match(src('electron/services/backup.service.ts'), /'jump_passes', 'provisional'/)
  const l = await h.invoke('ladder:get', 'ann'); assert.equal(l.levels.length, 5); assert.ok(l.concepts.length >= 57)
  assert.ok(g().prepare("SELECT 1 FROM schema_migrations WHERE version = 10").get())
})
