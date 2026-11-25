'use strict'
// The master track: one learning order across every academy, phases that end in a gate, a Technology score and a Business score,
// and the rule that a learner advances on the lower of the two. Everything comes from content/path/master-track.json, so these
// tests also prove nothing is hard-coded: a different track file gives a different path, and a missing or broken one is harmless.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { makeLearner, src, ROOT } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-path' })
let db, P, real
test.before(async () => {
  db = await h.start(); P = h.req('services/path')
  real = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/path/master-track.json'), 'utf8'))
  for (const u of ['ann', 'ben', 'cat', 'dan', 'eve', 'fay', 'gus']) makeLearner(h, db, u)
})
const g = () => db.getDb()
const complete = (u, id, best) => {
  g().prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES (?, ?, ?, 'complete', datetime('now')) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'complete', completed_at = datetime('now')").run(`lp-${u}-${id}`, u, id)
  if (best != null) g().prepare('INSERT INTO quiz_results (id, user_id, lesson_id, correct, total, pct) VALUES (?, ?, ?, ?, 5, ?)').run(`q-${u}-${id}-${best}`, u, id, Math.round(best / 20), best)
}
const status = (u, id, s) => g().prepare("INSERT INTO lesson_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = excluded.status").run(`lp-${u}-${id}-${s}`, u, id, s)
// A small track built from real lessons: Technology (sql), Business (foundations) and Both (bizsolver), with a planned module and an optional lesson.
const small = () => ({
  version: 't', title: 'Small', pass_pct: 80, gate_min_words: 5,
  sides: { sql: 'tech', foundations: 'business', bizsolver: 'bridge' },
  later: [{ lesson: 'ml-ops' }],
  phases: [
    { id: 'a', title: 'First', weeks: '1-2', focus: 'f', project: null, gate: 'Show it.', items: [{ lesson: 'sql-select' }, { lesson: 'sql-where' }, { lesson: 'fd-value' }, { lesson: 'fd-tables' }, { planned: 'new-thing', side: 'tech', summary: 'Not written yet' }, { lesson: 'sql-orderby', optional: true }, { lesson: 'removed-lesson' }] },
    { id: 'b', title: 'Second', weeks: '3-4', focus: 'f', project: null, gate: 'Show it again.', items: [{ lesson: 'bp-audit' }, { lesson: 'sql-groupby' }] },
  ],
})

test('the real master track is sound: every lesson is placed exactly once, every module has a side, planned modules never clash with real lessons', () => {
  const lessons = g().prepare('SELECT id, module FROM lessons').all()
  const placed = [...real.phases.flatMap((p) => p.items), ...real.later].filter((i) => i.lesson).map((i) => i.lesson)
  assert.equal(real.phases.length, 10)
  assert.deepEqual(real.phases.map((p) => p.id), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'])
  assert.equal(new Set(placed).size, placed.length, 'a lesson is placed twice')
  for (const l of lessons) assert.ok(placed.includes(l.id), `${l.id} is not placed in the track`)
  for (const id of placed) assert.ok(lessons.some((l) => l.id === id), `${id} is in the track but is not a lesson`)
  for (const m of new Set(lessons.map((l) => l.module))) if (m !== 'simulation') assert.ok(['tech', 'business', 'bridge'].includes(real.sides[m]), `${m} has no side`)
  const planned = real.phases.flatMap((p) => p.items).filter((i) => i.planned)
  assert.equal(new Set(planned.map((i) => i.planned)).size, planned.length, 'a planned id is repeated')
  for (const i of planned) { assert.ok(!lessons.some((l) => l.id === i.planned), `${i.planned} is planned but already exists`); assert.ok(['tech', 'business', 'bridge'].includes(i.side) && i.summary.length > 5, i.planned) }
  assert.equal(planned.length, 68)
  assert.ok(real.phases.every((p) => p.gate && p.gate.length > 20 && p.focus && p.items.length > 0))
})

test('the order matters: within an academy the track follows the lessons, the programme\'s re-chains are in place, and no required lesson sits behind an optional or later one', () => {
  const lessons = g().prepare('SELECT id, module, prerequisites, sort_order FROM lessons').all()
  const by = Object.fromEntries(lessons.map((l) => [l.id, l]))
  const pos = {}; real.phases.forEach((p, pi) => p.items.forEach((i, k) => { if (i.lesson) pos[i.lesson] = [pi, k, !!i.optional] }))
  for (const l of lessons) {
    for (const pre of JSON.parse(l.prerequisites)) {
      if (!pos[l.id] || !pos[pre]) continue // a later-track lesson is outside the phases
      assert.ok(pos[pre][0] < pos[l.id][0] || (pos[pre][0] === pos[l.id][0] && pos[pre][1] < pos[l.id][1]), `${l.id} comes before its prerequisite ${pre}`)
      assert.ok(!(pos[pre][2] && !pos[l.id][2]), `${l.id} is required but sits behind the optional ${pre}`)
    }
  }
  assert.deepEqual(JSON.parse(by['de-python-pipelines'].prerequisites), ['de-pipelines-etl']); assert.deepEqual(JSON.parse(by['de-governance'].prerequisites), ['de-observability'])
  assert.deepEqual(JSON.parse(by['ml-llm'].prerequisites), ['ml-model'])
})

test('a new learner starts in phase 0 with the first Start Here lesson, nothing locked, and the path is off by default', async () => {
  const d = await h.invoke('path:get', 'ann')
  assert.equal(d.current_phase, 'p0'); assert.equal(d.strict, false); assert.equal(d.next.lesson_id, 'fd-value')
  assert.equal(d.phases[0].tech.score, null, 'phase 0 has no technology lessons yet, so it is not scored')
  assert.equal(d.phases[0].business.required, 3)
  const list = await h.invoke('lessons:list', { userId: 'ann', module: 'sql' })
  assert.ok(list.every((l) => !l.path_locked))
})

test('scores: how much is done, scaled by how well the quizzes went; a Both lesson counts for both sides; optional, planned and removed lessons never count', () => {
  const t = small()
  let d = P.getPath('ben', t); let a = d.phases[0]
  assert.deepEqual([a.tech.required, a.business.required], [2, 2]); assert.equal(a.tech.score, 0)
  complete('ben', 'sql-select', 100); complete('ben', 'sql-where', 60)
  d = P.getPath('ben', t); a = d.phases[0]
  assert.deepEqual([a.tech.done, a.tech.quiz_avg, a.tech.score, a.tech.ready], [2, 80, 80, true])
  assert.deepEqual([a.business.done, a.business.score, a.business.ready], [0, 0, false])
  complete('ben', 'fd-value', 100)
  d = P.getPath('ben', t); a = d.phases[0]
  assert.deepEqual([a.business.done, a.business.quiz_avg, a.business.score], [1, 100, 50])
  const b = d.phases[1]; assert.deepEqual([b.tech.required, b.business.required], [2, 1].map((x, i) => (i === 0 ? 2 : 1)), 'a Both lesson counts for both sides')
  complete('ben', 'sql-orderby', 10)
  assert.equal(P.getPath('ben', t).phases[0].tech.quiz_avg, 80, 'an optional lesson does not change the score')
  assert.ok(P.getPath('ben', t).phases[0].items.some((i) => i.kind === 'planned' && i.id === 'new-thing'))
  assert.ok(P.getPath('ben', t).phases[0].items.some((i) => i.kind === 'planned' && i.id === 'removed-lesson'), 'a lesson the app no longer has shows as not available instead of breaking the path')
})

test('you advance on the lower side: a strong coder with weak business is not ready, and the next lesson comes from the weaker side', () => {
  const t = small()
  complete('cat', 'sql-select', 100); complete('cat', 'sql-where', 100)
  status('cat', 'fd-value', 'available'); status('cat', 'fd-tables', 'available')
  const d = P.getPath('cat', t)
  assert.equal(d.weaker, 'business'); assert.equal(d.phases[0].tech.score, 100); assert.equal(d.phases[0].business.score, 0)
  assert.equal(d.next.lesson_id, 'fd-value'); assert.match(d.next.reason, /Business side is behind/)
  complete('cat', 'fd-value', 100); complete('cat', 'fd-tables', 70)
  const e = P.getPath('cat', t).phases[0]
  assert.equal(e.business.quiz_avg, 85); assert.ok(e.tech.ready && e.business.ready)
  assert.equal(e.complete, false, 'both sides ready is not enough: the gate evidence is needed too')
})

test('quizzes below the pass line keep a side from being ready even when every lesson is done', () => {
  const t = small()
  complete('dan', 'sql-select', 90); complete('dan', 'sql-where', 50); complete('dan', 'fd-value', 100); complete('dan', 'fd-tables', 100)
  const a = P.getPath('dan', t).phases[0]
  assert.equal(a.tech.quiz_avg, 70); assert.equal(a.tech.ready, false); assert.equal(a.business.ready, true)
  complete('dan', 'sql-where', 90)
  assert.equal(P.getPath('dan', t).phases[0].tech.ready, true, 'the best quiz result counts')
})

test('gate evidence: your own words, at least the minimum, only for an open phase; saved evidence completes the phase and opens the next', () => {
  const t = small()
  complete('eve', 'sql-select', 100); complete('eve', 'sql-where', 100); complete('eve', 'fd-value', 100); complete('eve', 'fd-tables', 100)
  assert.deepEqual(P.saveGate('eve', 'zzz', 'a b c d e f g', t), { success: false, reason: 'unavailable' })
  assert.deepEqual(P.saveGate('eve', 'b', 'one two three four five six', t), { success: false, reason: 'locked' })
  assert.deepEqual(P.saveGate('eve', 'a', 'too few words', t), { success: false, reason: 'short' })
  assert.deepEqual(P.saveGate('eve', 'a', 42, t), { success: false, reason: 'invalid' })
  assert.deepEqual(P.saveGate('eve', 'a', 'x '.repeat(1500), t), { success: false, reason: 'invalid' })
  assert.equal(P.getPath('eve', t).phases[0].complete, false)
  assert.deepEqual(P.saveGate('eve', 'a', '  I built the repository, wrote the README and explained it aloud without notes.  ', t), { success: true })
  const d = P.getPath('eve', t)
  assert.equal(d.phases[0].complete, true); assert.equal(d.phases[0].gate_evidence, 'I built the repository, wrote the README and explained it aloud without notes.')
  assert.equal(d.current_phase, 'b'); assert.equal(d.phases[1].open, true)
  assert.deepEqual(P.saveGate('eve', 'a', 'I rewrote the README and explained it again to someone else today.', t), { success: true })
  assert.equal(g().prepare("SELECT COUNT(*) c FROM path_gates WHERE user_id = 'eve'").get().c, 1, 'saving again replaces, never duplicates')
})

test('strict mode holds back lessons of later phases, never anything started or finished, never lessons the track does not name; switching it off releases them', async () => {
  // Use the real track through the IPC list: a learner in phase 0 may not open Python or SQL yet.
  assert.deepEqual(await h.invoke('path:strict', { userId: 'fay', on: true }), { success: true })
  const sql = await h.invoke('lessons:list', { userId: 'fay', module: 'sql' })
  assert.ok(sql.every((l) => l.user_status === 'locked' && l.path_locked === 1), 'every SQL lesson is held back in phase 0')
  const fd = await h.invoke('lessons:list', { userId: 'fay', module: 'foundations' })
  assert.equal(fd.find((l) => l.id === 'fd-value').user_status, 'available'); assert.ok(!fd.find((l) => l.id === 'fd-value').path_locked)
  assert.equal(fd.find((l) => l.id === 'fd-price').path_locked, 1, 'a Start Here lesson placed in phase 2 waits as well')
  // Something already started stays reachable.
  status('fay', 'sql-select', 'in_progress')
  assert.ok(!(await h.invoke('lessons:list', { userId: 'fay', module: 'sql' })).find((l) => l.id === 'sql-select').path_locked)
  // A lesson the track does not name is never held back.
  g().prepare("INSERT OR IGNORE INTO lessons (id, module, title, description, level, prerequisites, estimated_min, sort_order, theory_md, quiz) VALUES ('stray-1', 'sql', 'Stray', 'd', 'beginner', '[]', 5, 99, 'x', '[]')").run()
  assert.ok(!(await h.invoke('lessons:list', { userId: 'fay', module: 'sql' })).find((l) => l.id === 'stray-1').path_locked)
  g().prepare("DELETE FROM lessons WHERE id = 'stray-1'").run()
  assert.equal((await h.invoke('path:get', 'fay')).strict, true)
  await h.invoke('path:strict', { userId: 'fay', on: false })
  assert.ok((await h.invoke('lessons:list', { userId: 'fay', module: 'sql' })).every((l) => !l.path_locked))
  assert.equal(g().prepare("SELECT COUNT(*) c FROM path_state WHERE user_id = 'fay'").get().c, 1)
  assert.deepEqual(await h.invoke('path:strict', { userId: 'fay', on: 'yes' }), { success: true }); assert.equal((await h.invoke('path:get', 'fay')).strict, false, 'only a real true turns it on')
})

test('strict mode: completing a phase releases the next one, and the lock is computed from the file, not hard-coded', () => {
  const t = small()
  P.setStrict('gus', true)
  assert.deepEqual([...P.pathLocked('gus', t)].sort(), ['bp-audit', 'sql-groupby'])
  complete('gus', 'sql-select', 100); complete('gus', 'sql-where', 100); complete('gus', 'fd-value', 100); complete('gus', 'fd-tables', 100)
  assert.equal(P.pathLocked('gus', t).size, 2, 'still held: the gate evidence is missing')
  P.saveGate('gus', 'a', 'I showed my working repository and defended each choice out loud to a friend.', t)
  assert.equal(P.pathLocked('gus', t).size, 0)
  // A different file gives a different path.
  const other = { ...small(), phases: [{ id: 'only', title: 'Only', weeks: '1', focus: 'f', project: null, gate: 'g', items: [{ lesson: 'sql-select' }] }] }
  assert.equal(P.getPath('gus', other).phases.length, 1)
  P.setStrict('gus', false)
})

test('a missing or broken track file means no path and no locks, never an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-track-'))
  const f = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p }
  assert.equal(P.loadTrack(path.join(dir, 'nope.json')), null)
  assert.equal(P.loadTrack(f('bad.json', '{ not json')), null)
  assert.equal(P.loadTrack(f('empty.json', '{"phases":[],"pass_pct":80,"sides":{}}')), null)
  assert.equal(P.loadTrack(f('dupe.json', JSON.stringify({ pass_pct: 80, sides: {}, phases: [{ id: 'x', items: [] }, { id: 'x', items: [] }] }))), null)
  assert.equal(P.getPath('ann', null), null); assert.equal(P.pathLocked('ann', null).size, 0)
  assert.deepEqual(P.saveGate('ann', 'a', 'a b c d e f g h i j k l m n o p', null), { success: false, reason: 'unavailable' })
  const ok = P.loadTrack(f('ok.json', JSON.stringify({ pass_pct: 70, sides: { sql: 'tech' }, phases: [{ id: 'x', title: 'X', weeks: '1', focus: 'f', gate: 'g', items: [{ lesson: 'sql-select' }] }] })))
  assert.equal(ok.pass_pct, 70); assert.equal(ok.gate_min_words, 15); assert.deepEqual(ok.later, [])
  assert.equal(P.getPath('ann', ok).phases[0].items[0].side, 'tech')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('an academy missing from the sides list is treated as technology rather than breaking the path', () => {
  const t = { ...small(), sides: {} }
  assert.equal(P.getPath('ann', t).phases[0].items.find((i) => i.id === 'fd-value').side, 'tech')
})

test('gate evidence and the strict setting travel in a progress backup and restore without duplicates', async () => {
  const B = h.req('services/backup.service')
  P.setStrict('ann', true); P.saveGate('ann', 'p0', 'I set up my repository, wrote the README and explained it aloud to a friend without notes.')
  const data = B.exportProgress('ann')
  assert.equal(data.tables.path_gates.length, 1); assert.equal(data.tables.path_state[0].strict, 1)
  makeLearner(h, db, 'ann2')
  const r1 = B.importProgress('ann2', JSON.parse(JSON.stringify(data))); assert.equal(r1.success, true)
  assert.equal(g().prepare("SELECT evidence FROM path_gates WHERE user_id = 'ann2'").get().evidence.startsWith('I set up my repository'), true)
  assert.equal(g().prepare("SELECT strict FROM path_state WHERE user_id = 'ann2'").get().strict, 1)
  B.importProgress('ann2', JSON.parse(JSON.stringify(data)))
  assert.equal(g().prepare("SELECT COUNT(*) c FROM path_gates WHERE user_id = 'ann2'").get().c, 1)
  P.setStrict('ann', false)
})

test('the path is wired in: sidebar, page, types, the lock hint in every academy, and the track file ships with the content', () => {
  assert.match(src('src/components/layout/Sidebar.tsx'), /id: 'path'[^\n]*'Your Path'/)
  assert.match(src('src/components/layout/AppShell.tsx'), /path:\s+<Path \/>/)
  assert.match(src('src/types/index.ts'), /\| 'path'/)
  for (const f of ['SqlAcademy', 'PythonAcademy', 'ExcelAcademy', 'PowerBIAcademy', 'StatisticsAcademyFull', 'BusinessAcademyFull']) assert.match(src(`src/pages/${f}.tsx`), /path_locked/, f)
  assert.match(src('electron/ipc/handlers.ts'), /pathLocked\(userId\)/)
  assert.ok(fs.existsSync(path.join(ROOT, 'content/path/master-track.json')))
})
