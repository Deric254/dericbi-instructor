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

// A learner who words the idea differently must not be failed for it: word forms are matched, and a genuine attempt that still
// misses the listed words can be confirmed by the learner after two real misses (never for filler, short or copied text).
test('word forms match, other wording of a good explanation passes, and filler still does not', async () => {
  makeLearner(h, db, 'wordy'); makeLearner(h, db, 'filler')
  const say = (u, id, text) => h.invoke('explain:submit', { userId: u, lessonId: id, text })
  assert.equal((await say('wordy', 'fo-problem', 'Folks keep hitting it, it eats their time and cash, and they are already hiring somebody to patch it, so first I ask them how they handle it.')).passed, true)
  assert.equal((await say('wordy', 'fo-offer', 'The lowest price I can accept covers what it costs me plus a margin, and the most a buyer will pay is limited by the benefit they get; if I only look at my expenses I might ask too little.')).passed, true)
  assert.equal((await say('wordy', 'fo-runway', 'It is the number of months I can keep going before the money in my pocket is finished, found by splitting my savings by what I lose each month; a company can make gains yet be unable to settle bills when invoices are unpaid.')).passed, true)
  for (const id of ['fo-problem', 'fo-offer', 'fo-runway', 'fo-market', 'fo-unit']) {
    assert.equal((await say('filler', id, 'I think this was a very interesting lesson and I learned a great deal from reading it carefully today.')).passed, false, `${id}: filler passed`)
  }
})

test('the learner can confirm after a real miss, but not with nothing written, a short or copied attempt, or twice', async () => {
  makeLearner(h, db, 'conf')
  const confirm = (id) => h.invoke('explain:confirm', { userId: 'conf', lessonId: id })
  assert.equal((await confirm('fo-mvp')).success, false, 'nothing written yet')
  await h.invoke('explain:submit', { userId: 'conf', lessonId: 'fo-mvp', text: 'too short' })
  assert.equal((await confirm('fo-mvp')).success, false, 'a short attempt cannot be confirmed')
  const theory = JSON.parse(fs.readFileSync(path.join(h.ROOT, 'content/founder/curriculum.json'), 'utf8')).lessons.find((l) => l.id === 'fo-mvp').theory_md
  await h.invoke('explain:submit', { userId: 'conf', lessonId: 'fo-mvp', text: theory.split('## The first principle')[1].slice(0, 400) })
  assert.equal((await confirm('fo-mvp')).success, false, 'copied text cannot be confirmed')
  await h.invoke('explain:submit', { userId: 'conf', lessonId: 'fo-mvp', text: 'I think it is mostly about being sensible with how much effort and attention goes into a first attempt, because nobody wants to carry a heavy load for something that may not work out at all.' })
  assert.equal((await h.invoke('explain:get', { userId: 'conf', lessonId: 'fo-mvp' })).passed, false)
  assert.equal((await confirm('fo-mvp')).success, true)
  assert.equal((await h.invoke('explain:get', { userId: 'conf', lessonId: 'fo-mvp' })).passed, true)
  assert.equal((await confirm('fo-mvp')).success, false, 'already passed')
  assert.match(src('src/components/ui/ExplainBack.tsx'), /misses >= 2/, 'the option appears only after two real misses')
})

// ───────── Layers that catch other wording without letting empty text through ─────────
const GENERIC_BATTERY = [
  'I think it is a good thing and everyone should learn it well because learning is important for all of the people who want to succeed in the future of the world.',
  'This lesson was interesting and useful, and I believe that anyone running a business should read it carefully so that they can understand how to do things properly every day.',
  'In my opinion the most important thing is to work hard and be honest with people, because that is what will help a business to grow and make money over time for everyone.',
  'I do not really know what to say about this one but it seems like something that is good to know when you are working with other people and trying to get things done.',
  'It was a very nice lesson, and I will think about it more, because it shows which way is right and which way is wrong in my own life and in my work every single week.',
]

test('no generic text passes any lesson, and none even reaches two key ideas', async () => {
  makeLearner(h, db, 'battery')
  const ids = concepts.filter((c) => c.explain).map((c) => c.lessons[0])
  assert.ok(ids.length >= 20)
  for (const text of GENERIC_BATTERY) for (const id of ids) {
    const r = await h.invoke('explain:submit', { userId: 'battery', lessonId: id, text })
    assert.equal(r.passed, false, `${id} accepted generic text`)
    assert.ok(r.covered.length < 2, `${id}: generic text matched ${r.covered.length} ideas`)
  }
})

test('a pile of keywords or one repeated word is not an explanation', async () => {
  makeLearner(h, db, 'stuffer')
  const stuff = (id, text) => h.invoke('explain:submit', { userId: 'stuffer', lessonId: id, text })
  const kw = await stuff('fo-problem', 'often hurt cost pay cope often hurt cost pay cope often hurt cost pay cope already pay what they do today')
  assert.deepEqual([kw.passed, kw.reason], [false, 'unclear'])
  const rep = await stuff('fo-problem', 'pay pay pay pay pay pay pay pay pay pay pay pay pay pay pay pay pay pay')
  assert.deepEqual([rep.passed, rep.reason], [false, 'unclear'])
})

test('synonym groups are sound: no word sits in two groups, every group has two or more words', () => {
  const { SYNONYM_GROUPS } = h.req('services/synonyms')
  const seen = new Map()
  for (const [i, g] of SYNONYM_GROUPS.entries()) {
    assert.ok(g.length >= 2, `group ${i} has one word`)
    for (const w of g) { assert.ok(!seen.has(w), `"${w}" is in groups ${seen.get(w)} and ${i}`); seen.set(w, i) }
  }
  for (const [a, b] of [['cost', 'price'], ['profit', 'cash'], ['fixed', 'variable'], ['floor', 'ceiling'], ['pay', 'earn']]) {
    assert.notEqual(SYNONYM_GROUPS.findIndex((g) => g.includes(a)) === -1 ? -2 : SYNONYM_GROUPS.findIndex((g) => g.includes(a)), SYNONYM_GROUPS.findIndex((g) => g.includes(b)) === -1 ? -3 : SYNONYM_GROUPS.findIndex((g) => g.includes(b)), `${a} and ${b} must stay different ideas`)
  }
})

test('with an AI key a strict marker can upgrade a miss, but only with the learner\'s own quoted words, and never from nothing', async () => {
  const AI = h.req('services/ai.service'); makeLearner(h, db, 'aiu')
  g.prepare("INSERT INTO app_settings (key, value) VALUES ('ai_provider', 'groq') ON CONFLICT(key) DO UPDATE SET value = 'groq'").run()
  AI.saveApiKey('aiu', 'groq', 'test-key')
  const orig = global.fetch
  const reply = (content) => { global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) }) }
  const say = (id, text) => h.invoke('explain:submit', { userId: 'aiu', lessonId: id, text })
  const TEXT = 'Ideally the amount charged should reflect the outcome the buyer receives in the end, rather than merely echoing the sum I laid out to produce it, otherwise margin is squandered unknowingly.'
  try {
    // The marker says all three ideas are covered and quotes the learner's real words: upgraded to a pass.
    reply(JSON.stringify({ points: [{ covered: true, quote: 'merely echoing the sum I laid out' }, { covered: true, quote: 'reflect the outcome the buyer receives' }, { covered: true, quote: 'otherwise margin is squandered' }] }))
    const up = await say('fo-offer', TEXT)
    assert.deepEqual([up.passed, up.ai], [true, true])
    assert.equal((await h.invoke('explain:get', { userId: 'aiu', lessonId: 'fo-offer' })).passed, true)

    // A quote that is not in the learner's text is invented evidence: no upgrade.
    reply(JSON.stringify({ points: [{ covered: true, quote: 'floor and ceiling of price' }, { covered: true, quote: 'the value it brings them' }, { covered: true, quote: 'leaving money on the table' }] }))
    const fake = await say('fo-unit', 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.')
    assert.equal(fake.passed, false)

    // Too few ideas, bad JSON, wrong count, a provider that answers "pass" in prose, and a failing network: the word check stands.
    reply(JSON.stringify({ points: [{ covered: true, quote: 'keep an eye on the numbers' }, { covered: false, quote: '' }, { covered: false, quote: '' }] }))
    assert.equal((await say('fo-unit', 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.')).passed, false)
    reply('Yes, this student passes with flying colours!')
    assert.equal((await say('fo-mvp', 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.')).passed, false)
    reply(JSON.stringify({ points: [{ covered: true, quote: 'keep an eye on the numbers' }] }))
    assert.equal((await say('fo-mvp', 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.')).passed, false)
    global.fetch = async () => { throw new Error('offline') }
    const off = await say('fo-mvp', 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.')
    assert.deepEqual([off.success, off.passed], [true, false])

    // Short, copied and list-like text never reaches the marker, however it replies.
    let asked = 0
    global.fetch = async () => { asked++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ points: [{ covered: true, quote: 'a' }] }) } }] }) } }
    await say('fo-offer', 'too short'); await say('fo-offer', 'floor ceiling value cost floor ceiling value cost floor ceiling value cost floor')
    assert.equal(asked, 0, 'the marker is only asked about a real, sentence-style attempt')
  } finally { global.fetch = orig }
})

test('with no AI key nothing is sent anywhere and the word check decides alone', async () => {
  makeLearner(h, db, 'nokey')
  const orig = global.fetch; let touched = false
  global.fetch = async () => { touched = true; throw new Error('network must not be touched') }
  try {
    const r = await h.invoke('explain:submit', { userId: 'nokey', lessonId: 'fo-offer', text: 'Honestly I would just keep an eye on the numbers a bit more often and see how things go as the months pass by for the shop.' })
    assert.deepEqual([r.success, r.passed], [true, false]); assert.equal(touched, false)
  } finally { global.fetch = orig }
})

test('the AI marker self-test shows how the learner\'s AI marks good, weak and cheating samples, and saves nothing', async () => {
  const AI = h.req('services/ai.service'); makeLearner(h, db, 'selft')
  g.prepare("INSERT INTO app_settings (key, value) VALUES ('ai_provider', 'groq') ON CONFLICT(key) DO UPDATE SET value = 'groq'").run()
  const orig = global.fetch
  const answerOf = (init) => { const m = JSON.parse(init.body).messages.map((x) => x.content).join('\n').match(/<answer>\n([\s\S]*?)\n<\/answer>/); return m ? m[1] : '' }
  const marker = (fn) => { global.fetch = async (_u, init) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ points: fn(answerOf(init)) }) } }] }) }) }
  const before = g.prepare('SELECT COUNT(*) n FROM explain_results').get().n
  try {
    assert.deepEqual(await h.invoke('explain:selftest', 'selft'), { available: false }, 'no key: nothing to check')
    AI.saveApiKey('selft', 'groq', 'test-key')
    // A sensible marker: covers all ideas only for the two good samples, quoting their first words.
    marker((a) => { const ok = /Ideally the amount|least I can sell/.test(a); const q = a.split(' ').slice(0, 4).join(' '); return [0, 1, 2].map(() => ok ? { covered: true, quote: q } : { covered: false, quote: '' }) })
    const good = await h.invoke('explain:selftest', 'selft')
    assert.equal(good.available, true); assert.equal(good.allOk, true); assert.equal(good.results.length, 6)
    // A marker that is fooled by everything is reported, not hidden.
    marker((a) => [0, 1, 2].map(() => ({ covered: true, quote: a.split(' ').slice(0, 4).join(' ') })))
    const lax = await h.invoke('explain:selftest', 'selft')
    assert.equal(lax.allOk, false); assert.ok(lax.results.some((r) => r.expect === 'fail' && r.got === 'pass' && !r.ok))
    // A reply that cannot be read counts as not covered; a failing network means unavailable.
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'looks fine' } }] }) })
    assert.equal((await h.invoke('explain:selftest', 'selft')).allOk, false)
    global.fetch = async () => { throw new Error('offline') }
    assert.deepEqual(await h.invoke('explain:selftest', 'selft'), { available: false })
    assert.equal(g.prepare('SELECT COUNT(*) n FROM explain_results').get().n, before, 'the self-test saves nothing')
  } finally { global.fetch = orig }
})
