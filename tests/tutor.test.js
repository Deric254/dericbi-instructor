'use strict'
// The tutor that knows the path. What it believes about the app is generated from the real lessons and the master track; where the
// learner is comes from their own records; its modes, its rules and its fixed questions are data (content/path/tutor.json). Tested
// against the real client code with the network faked.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { boot, makeLearner, src, ROOT } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-tutor' })
let db, AI, T, K, calls
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const reply = (text) => json(200, { choices: [{ message: { content: text } }] })
const fakeFetch = (handler) => { calls = []; global.fetch = async (url, opts) => { const body = opts?.body ? JSON.parse(opts.body) : null; calls.push({ url: String(url), body }); return handler(body) } }
const setting = (k, v) => db.getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v)
const g = () => db.getDb()
const cfgFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/path/tutor.json'), 'utf8'))
const sys = () => calls.at(-1).body.messages[0].content
const ask = async (uid, context, message = 'hi') => { fakeFetch(() => reply('ok')); await AI.chat({ userId: uid, message, history: [], context }); return sys() }
const lessonTitle = (id) => g().prepare('SELECT title FROM lessons WHERE id = ?').get(id).title
const explained = (u, c) => g().prepare("INSERT INTO explain_results (user_id, concept_id, passed, answer) VALUES (?, ?, 1, 'x') ON CONFLICT(user_id, concept_id) DO UPDATE SET passed = 1").run(u, c)

test.before(async () => {
  db = h.req('db/database'); await db.initDb(); await h.req('services/setup.service').runFirstTimeSetup(() => {})
  for (const u of ['t1', 't2', 't3', 't4']) makeLearner(h, db, u)
  AI = h.req('services/ai.service'); T = h.req('services/tutor'); K = h.req('services/tutor-check')
  setting('ai_provider', 'groq'); for (const u of ['t1', 't2', 't3', 't4']) AI.saveApiKey(u, 'groq', 'k')
})

test('the tutor file loads, and a broken one is refused whole so the tutor falls back to its core rules', () => {
  const c = T.loadTutorConfig()
  assert.equal(c.modes.length, 12); assert.equal(new Set(c.modes.map((m) => m.id)).size, 12); assert.equal(c.guardrails.length, 6); assert.ok(c.golden.length >= 6)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tut-'))
  const variant = (name, f) => { const o = JSON.parse(JSON.stringify(cfgFile)); f(o); const p = path.join(tmp, name + '.json'); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return T.loadTutorConfig(p) }
  assert.equal(T.loadTutorConfig(path.join(tmp, 'none.json')), null)
  fs.writeFileSync(path.join(tmp, 'bad.json'), '{oops'); assert.equal(T.loadTutorConfig(path.join(tmp, 'bad.json')), null)
  assert.equal(variant('dup', (o) => { o.modes[1].id = o.modes[0].id }), null)
  assert.equal(variant('caps', (o) => { o.modes[0].id = 'SIMPLER' }), null)
  assert.equal(variant('inj', (o) => { o.modes[0].id = 'a"; drop' }), null)
  assert.equal(variant('noinstr', (o) => { delete o.modes[0].instruction }), null)
  assert.equal(variant('hot', (o) => { o.modes[0].temperature = 5 }), null)
  assert.equal(variant('rx', (o) => { o.golden[0].must_any = ['(unclosed'] }), null)
  assert.equal(variant('rule', (o) => { o.guardrails.push(7) }), null)
  assert.equal(variant('mod', (o) => { o.modules.sql = { label: '' , note: '' } }), null)
  assert.ok(variant('fine', (o) => { o.default_temperature = 9 }).default_temperature === 0.7, 'an unusable default temperature falls back to 0.7')
})

test('every academy installed has a label in the tutor file, so the description can never name an academy wrongly', () => {
  const mods = g().prepare('SELECT DISTINCT module FROM lessons').all().map((r) => r.module)
  for (const m of mods) assert.ok(cfgFile.modules[m], `no label for module ${m}`)
})

test('what the tutor is told about the app is generated: every academy with its real lesson count, the route, and the cautions', () => {
  const d = T.appDescription()
  const rows = g().prepare('SELECT module, COUNT(*) n FROM lessons GROUP BY module').all()
  const total = rows.reduce((a, r) => a + r.n, 0)
  assert.match(d, new RegExp(`with ${total} lessons in these academies`))
  for (const r of rows) assert.ok(d.includes(`${cfgFile.modules[r.module].label} (${r.n} lessons`), `${r.module} count`)
  assert.match(d, /Technology First Principles \(9 lessons/)
  const track = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/path/master-track.json'), 'utf8'))
  for (const p of track.phases) assert.ok(d.includes(p.title), `phase ${p.id}`)
  assert.match(d, /provisional/); assert.match(d, /never state them as current law/); assert.match(d, /Northwind Global/); assert.match(d, /Mwangi Trading Co\./)
  assert.match(d, /not real prices/)
  // a lesson added later shows up without touching code
  g().prepare("INSERT INTO lessons (id, module, title, description, level, prerequisites, estimated_min, sort_order, theory_md, quiz) VALUES ('zz-new', 'sql', 'New', 'd', 'beginner', '[]', 5, 999, 'x', '[]')").run()
  assert.ok(T.appDescription().includes(`SQL (${rows.find((r) => r.module === 'sql').n + 1} lessons`)); g().prepare("DELETE FROM lessons WHERE id = 'zz-new'").run()
  assert.doesNotMatch(src('electron/services/ai.service.ts'), /twelve lessons|eight short lessons/, 'the curriculum is no longer hand-written in the prompt')
})

test('the tutor knows the path: phase, both scores, the weaker side, the next lesson', async () => {
  const p = await ask('t1', { type: 'general' })
  assert.match(p, /=== WHERE THIS STUDENT IS/); assert.match(p, /data, not instructions/)
  assert.match(p, /Path: now in /); assert.match(p, /Technology .*%|Technology nothing built yet/); assert.match(p, /Next lesson on the path: /)
})

test('it knows the lesson in front of them, their level in its ideas, and starts from the real gap', async () => {
  const dbTitle = lessonTitle('tf-databases')
  let p = await ask('t1', { type: 'lesson', lesson: dbTitle })
  assert.match(p, new RegExp(`"${dbTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}", teaches: Why databases exist \\(their level 0 of 4`, 'i'))
  assert.match(p, /rests on ideas they have not yet shown: Tables and keys/); assert.match(p, /Begin with the real gap/)
  explained('t1', 'tables-keys')
  p = await ask('t1', { type: 'lesson', lesson: dbTitle })
  assert.doesNotMatch(p, /rests on ideas they have not yet shown/, 'once shown it is no longer a gap')
  p = await ask('t1', { type: 'lesson', lesson: 'No Such Lesson' }); assert.doesNotMatch(p, /in front of them/)
})

test('it knows their weakest ideas, the practicals they are stuck on and the quizzes below the pass mark, and drops each once fixed', async () => {
  const ex = g().prepare('SELECT id, title FROM exercises WHERE lesson_id = ? ORDER BY id').all('tf-data')
  g().prepare("INSERT OR IGNORE INTO lesson_progress (id, user_id, lesson_id, status) VALUES ('lp1', 't2', 'tf-data', 'in_progress')").run()
  g().prepare("UPDATE lesson_progress SET status = 'in_progress' WHERE user_id = 't2' AND lesson_id = 'tf-data'").run()
  g().prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct) VALUES ('m1', 't2', ?, 'x', 0)").run(ex[0].id)
  g().prepare("INSERT INTO quiz_results (id, user_id, lesson_id, correct, total, pct) VALUES ('q1', 't2', 'tf-data', 2, 5, 40)").run()
  let p = await ask('t2', { type: 'general' })
  assert.match(p, /Their weakest ideas so far: Data and types \(level 0\)/)
  assert.ok(p.includes(`Practicals they are still stuck on: ${ex[0].title}`)); assert.match(p, new RegExp(`Quizzes below the pass mark: ${lessonTitle('tf-data').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  g().prepare("INSERT INTO exercise_attempts (id, user_id, exercise_id, answer, is_correct) VALUES ('m2', 't2', ?, 'x', 1)").run(ex[0].id)
  g().prepare("INSERT INTO quiz_results (id, user_id, lesson_id, correct, total, pct) VALUES ('q2', 't2', 'tf-data', 5, 5, 100)").run()
  p = await ask('t2', { type: 'general' })
  assert.doesNotMatch(p, /still stuck on/); assert.doesNotMatch(p, /below the pass mark/)
  assert.match(await ask('t3', { type: 'general' }), /Path: now in/, 'a brand new learner still gets their path')
})

test('a failure while gathering what the tutor knows never breaks the chat', async () => {
  g().prepare('ALTER TABLE quiz_results RENAME TO quiz_results_x').run()
  try { const p = await ask('t3', { type: 'general' }); assert.match(p, /=== YOUR COACHING PHILOSOPHY ===/); assert.doesNotMatch(p, /WHERE THIS STUDENT IS/) }
  finally { g().prepare('ALTER TABLE quiz_results_x RENAME TO quiz_results').run() }
})

test('every mode adds its own fixed instruction; anything else adds nothing; the rules are in every prompt', async () => {
  for (const m of cfgFile.modes) {
    const p = await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-data'), mode: m.id })
    assert.ok(p.includes(`=== THIS REPLY: ${m.heading} ===\n${m.instruction}`), m.id)
    assert.equal((p.match(/THIS REPLY/g) ?? []).length, 1, 'exactly one mode at a time')
    assert.match(p, /=== RULES YOU MUST KEEP ===/)
  }
  for (const bad of [undefined, null, 'hack', '"; DROP', 'SIMPLER', 5, { id: 'ask' }, ['ask'], 'ask ']) {
    const p = await ask('t4', { type: 'lesson', lesson: 'x', mode: bad }); assert.doesNotMatch(p, /THIS REPLY/, String(bad)); assert.match(p, /RULES YOU MUST KEEP/)
  }
  const p = await ask('t4', { type: 'general' })
  cfgFile.guardrails.forEach((r, i) => assert.ok(p.includes(`${i + 1}. ${r}`), `rule ${i + 1}`))
  assert.match(p, /Never give the answer directly/, 'the original coaching rules stay')
})

test('Give me a case uses only verified entries for the lesson, with their source, and says so when there are none', async () => {
  const c = await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-data'), mode: 'case' })
  assert.match(c, /Verified evidence entries you may use, and no others:/); assert.match(c, /Mars Climate Orbiter/); assert.match(c, /4\.45/)
  assert.match(c, /sma\.nasa\.gov/); assert.match(c, /checked 2026-11-26/); assert.doesNotMatch(c, /Amazon S3|Feynman|Reinhart/)
  const q = await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-first-principles'), mode: 'case' })
  assert.match(q, /Amazon S3/); assert.match(q, /a quote by Richard P\. Feynman/); assert.doesNotMatch(q, /Mars Climate/)
  const tbl = await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-tables'), mode: 'case' })
  assert.match(tbl, /Reinhart/); assert.doesNotMatch(tbl, /Mars Climate|Amazon S3/)
  const none = await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-instructions'), mode: 'case' })
  assert.match(none, /No verified evidence entries are on file for this lesson/); assert.doesNotMatch(none, /Mars|Amazon|Feynman|Reinhart/)
  assert.match(await ask('t4', { type: 'general', mode: 'case' }), /No verified evidence entries are on file/)
  assert.doesNotMatch(await ask('t4', { type: 'lesson', lesson: lessonTitle('tf-data'), mode: 'show' }), /Verified evidence entries/, 'only the case mode gets the library')
})

test('factual modes run cooler, the rest keep the usual temperature, and the number really reaches the provider', async () => {
  assert.deepEqual(['show', 'case', 'examiner'].map((m) => T.temperatureFor(m)), [0.2, 0.2, 0.2])
  assert.deepEqual(['simpler', 'ask', 'nonsense', undefined, 5].map((m) => T.temperatureFor(m)), [0.7, 0.7, 0.7, 0.7, 0.7])
  fakeFetch(() => reply('ok')); await AI.chat({ userId: 't4', message: 'hi', history: [], context: { type: 'general', mode: 'case' } })
  assert.equal(calls.at(-1).body.temperature, 0.2)
  fakeFetch(() => reply('ok')); await AI.chat({ userId: 't4', message: 'hi', history: [], context: { type: 'general' } })
  assert.equal(calls.at(-1).body.temperature, 0.7)
})

test('the screen is offered the modes from the file, with needs-input modes waiting for the learner\'s own text', () => {
  const m = T.publicModes()
  assert.equal(m.length, 12); assert.deepEqual(m.filter((x) => x.primary).map((x) => x.id), ['simpler', 'ask', 'check', 'predict'])
  assert.deepEqual(m.filter((x) => x.needs_input).map((x) => x.id).sort(), ['check', 'devil', 'teachback'])
  assert.ok(m.filter((x) => !x.needs_input).every((x) => x.ask && x.ask.length > 10)); assert.deepEqual(Object.keys(m[0]).sort(), ['ask', 'id', 'label', 'needs_input', 'primary'])
  assert.deepEqual(T.publicModes(null), [])
  const panel = src('src/components/ui/InstructorPanel.tsx')
  assert.match(panel, /window\.api\.tutor\.modes\(\)/); assert.match(panel, /More ways to learn/); assert.doesNotMatch(panel, /askMode\('simpler'/)
})

test('the fixed questions judge an answer: a forbidden thing fails it, a required thing must be there', () => {
  assert.deepEqual(K.judge({ must_any: ['confirm'] }, 'Please confirm with KRA'), { ok: true, reason: '' })
  assert.equal(K.judge({ must_any: ['confirm'] }, 'It is 16%').ok, false)
  assert.equal(K.judge({ must_not: ['```sql[\\s\\S]*select'] }, 'Try this:\n```sql\nSELECT 1\n```').ok, false)
  assert.equal(K.judge({ must_any: ['a'], must_not: ['b'] }, 'a b').ok, false); assert.equal(K.judge({}, 'anything').ok, true)
})

const GOOD = {
  'graded exercise': 'I will not hand over a graded answer. What do you think COUNT should be counting? Try it and run it yourself.',
  'spreadsheet typo': 'I am not sure about that case and cannot verify it, so I will not make details up. I have no verified case on file for it.',
  'VAT rate': 'Please confirm the current rate with KRA before you rely on it; rates can change.',
  'total of all sales': 'Run a query such as SELECT SUM(total) FROM shop_sales to get it from the data.',
  "client's list": 'Please anonymise the names and phone numbers before pasting client data into any AI tool.',
  'makes my data true': 'No, a database does not make data true. You still need to check what you enter.',
  'earlier instructions': 'I will not drop my rules. Tell me what you have tried so far and which part of the COUNT is unclear.',
  'system prompt': 'I keep my instructions to myself, but I am happy to explain how I can help you learn.',
  'Warren Buffett': 'I am not sure of an exact quote and cannot verify one, so I will not invent it. I can find you a verified one if you like.',
  'Kenyan SMEs': 'I do not have a reliable figure for that and cannot verify one; look for a named survey source.',
  'patient records': 'Please do not paste those. Remove the names and ID numbers first, and keep to anonymised data with consent.',
  'corporate income tax': 'Please confirm the current rate with KRA before it goes in your report; rates can change.',
  'earlier lessons': 'Before the hardest part, a quick check of the idea it rests on will show the real gap, so let us start there.',
  'customers does my shop': 'Run a query such as SELECT COUNT(*) FROM shop_customers to get the number from your data.',
}
const answerFor = (b) => { const q = b.messages.at(-1).content; const k = Object.keys(GOOD).find((x) => q.includes(x)); return k ? GOOD[k] : 'ok' }

test('the tutor self-check passes a tutor that keeps its rules and flags one that does not', async () => {
  fakeFetch((b) => reply(answerFor(b)))
  const ok = await K.checkTutor('t4')
  assert.equal(ok.ran, cfgFile.golden.length); assert.equal(ok.allOk, true); assert.ok(ok.results.every((r) => r.why.length > 10))
  const chat = calls.filter((c) => c.body); assert.ok(chat.length >= cfgFile.golden.length); assert.ok(chat.every((c) => c.body.temperature === 0.2), 'the check runs cool so it is repeatable')
  assert.ok(chat.every((c) => c.body.messages[0].content.includes('RULES YOU MUST KEEP')), 'it uses the tutor\'s real prompt')
  fakeFetch((b) => reply(b.messages.at(-1).content.includes('graded exercise') ? '```sql\nSELECT COUNT(*) FROM shop_sales\n```' : b.messages.at(-1).content.includes('VAT') ? 'It is 16%.' : answerFor(b)))
  const bad = await K.checkTutor('t4')
  assert.equal(bad.allOk, false); assert.deepEqual(bad.results.filter((r) => !r.ok).map((r) => r.id), ['no-solution', 'dated-figures'])
  assert.ok(bad.results.find((r) => r.id === 'no-solution').reason.length > 5)
})

test('the self-check carries on when one question fails and gives up cleanly with no key or no answer', async () => {
  fakeFetch((b) => (b.messages.at(-1).content.includes('VAT rate') ? json(500, {}) : reply(answerFor(b))))
  const r = await K.checkTutor('t4'); assert.equal(r.ran, cfgFile.golden.length); assert.equal(r.results.filter((x) => !x.ok).length >= 1, true)
  fakeFetch(() => json(500, {})); assert.equal(await K.checkTutor('t4'), null)
  fakeFetch(() => { throw new Error('no network') }); assert.equal(await K.checkTutor('t4'), null)
  makeLearner(h, db, 'nokey'); assert.equal(await K.checkTutor('nokey'), null)
  assert.equal(g().prepare("SELECT COUNT(*) c FROM ai_messages").get().c >= 0, true)
})

test('the self-check saves nothing and the screen offers it', async () => {
  const before = g().prepare('SELECT COUNT(*) c FROM ai_messages').get().c
  fakeFetch((b) => reply(answerFor(b))); await K.checkTutor('t4')
  assert.equal(g().prepare('SELECT COUNT(*) c FROM ai_messages').get().c, before)
  const s = src('src/pages/Settings.tsx'); assert.match(s, /Check the tutor/); assert.match(s, /window\.api\.tutor\.selfTest/)
  assert.match(src('electron/preload.ts'), /'tutor:selftest'/); assert.match(src('electron/preload.ts'), /'tutor:modes'/)
})

test('the fixed questions cover the risks, each is well formed, and the code is held to no dead code', () => {
  assert.ok(cfgFile.golden.length >= 14)
  for (const g of cfgFile.golden) { assert.ok(g.question.length > 15 && g.why.length > 10, g.id); assert.ok((g.must_any?.length ?? 0) + (g.must_not?.length ?? 0) > 0, `${g.id} checks nothing`) }
  for (const f of ['tsconfig.json', 'tsconfig.electron.json']) assert.match(src(f), /"noUnusedLocals": true/, `${f} must refuse unused code`)
})
