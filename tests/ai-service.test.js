'use strict'
// The AI tutor, tested against the real client code with the network faked (no keys, no internet).
// Proves: keys are stored safely, every provider is called the right way, failures give readable messages,
// and the tutor is told the REAL table and column names of the practice data.
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, makeLearner } = require('./helpers/harness')

// A fake OS keychain whose availability the tests can switch on and off.
let keychain = false
const safeStorage = {
  isEncryptionAvailable: () => keychain,
  encryptString: (s) => Buffer.from('ENC[' + s + ']'),
  decryptString: (b) => {
    const t = b.toString()
    if (!t.startsWith('ENC[')) throw new Error('cannot decrypt')
    return t.slice(4, -1)
  },
}
const h = boot({ prefix: 'dbi-ai', electron: { safeStorage } })
const UID = 'ai-user'
let db, AI, calls

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const fakeFetch = (handler) => {
  calls = []
  global.fetch = async (url, opts) => { calls.push({ url: String(url), opts, body: opts?.body ? JSON.parse(opts.body) : null }); return handler(String(url), opts) }
}
const setting = (key, value) => db.getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
const useProvider = (p, key = 'key-' + p) => { setting('ai_provider', p); AI.saveApiKey(UID, p, key) }
const ask = (message = 'hello', extra = {}) => AI.chat({ userId: UID, message, history: [], context: { type: 'general' }, ...extra })
const systemPrompt = () => calls.at(-1).body.messages[0].content

test.before(async () => {
  db = h.req('db/database')
  await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  makeLearner(h, db, UID)
  AI = h.req('services/ai.service')
})

// ───────────────────────── keys ─────────────────────────

test('without a key the tutor says exactly what to do, and never calls the network', async () => {
  fakeFetch(() => { throw new Error('network must not be touched') })
  setting('ai_provider', 'groq')
  const r = await ask()
  assert.equal(r.success, false)
  assert.match(r.error, /No API key configured for groq.*Settings/i)
  assert.equal(calls.length, 0)
})

test('keys are never stored as plain text, and read back correctly (legacy encryption)', () => {
  keychain = false
  AI.saveApiKey(UID, 'groq', 'gsk_secret_value')
  const stored = db.getDb().prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?').get(UID, 'groq').key_encrypted
  assert.ok(!stored.includes('gsk_secret_value'))
  assert.equal(AI.getApiKey(UID, 'groq'), 'gsk_secret_value')
})

test('keys use the OS keychain when available, and older keys keep working after the switch', () => {
  keychain = false
  AI.saveApiKey(UID, 'mistral', 'old-format-key')
  keychain = true
  AI.saveApiKey(UID, 'openai', 'new-format-key')
  const stored = db.getDb().prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?').get(UID, 'openai').key_encrypted
  assert.ok(stored.startsWith('v2:') && !stored.includes('new-format-key'))
  assert.equal(AI.getApiKey(UID, 'openai'), 'new-format-key')
  assert.equal(AI.getApiKey(UID, 'mistral'), 'old-format-key', 'a key saved before the keychain was available must still be readable')
  keychain = false
})

test('saving a key again replaces it; a corrupt stored key reads as "no key", not a crash', () => {
  AI.saveApiKey(UID, 'cerebras', 'first')
  AI.saveApiKey(UID, 'cerebras', 'second')
  assert.equal(AI.getApiKey(UID, 'cerebras'), 'second')
  assert.equal(db.getDb().prepare("SELECT COUNT(*) c FROM api_keys WHERE user_id = ? AND provider = 'cerebras'").get(UID).c, 1)

  keychain = true
  db.getDb().prepare("UPDATE api_keys SET key_encrypted = 'v2:Z2FyYmFnZQ==' WHERE user_id = ? AND provider = 'cerebras'").run(UID)
  assert.equal(AI.getApiKey(UID, 'cerebras'), null)
  keychain = false
  assert.equal(AI.getApiKey(UID, 'never-saved'), null)
})

// ───────────────────────── every provider is called correctly ─────────────────────────

const OPENAI_STYLE = {
  openai: ['https://api.openai.com/v1', 'gpt-4o-mini'],
  openrouter: ['https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'],
  nvidia: ['https://integrate.api.nvidia.com/v1', 'meta/llama-3.3-70b-instruct'],
  groq: ['https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
  cerebras: ['https://api.cerebras.ai/v1', 'llama-3.3-70b'],
  mistral: ['https://api.mistral.ai/v1', 'mistral-small-latest'],
  cohere: ['https://api.cohere.ai/compatibility/v1', 'command-a-03-2025'],
  huggingface: ['https://router.huggingface.co/v1', 'meta-llama/Llama-3.3-70B-Instruct'],
  github: ['https://models.github.ai/inference', 'openai/gpt-4o-mini'],
}

for (const [provider, [baseUrl, defaultModel]] of Object.entries(OPENAI_STYLE)) {
  test(`provider "${provider}": right address, right sign-in header, right model, answer returned`, async () => {
    db.getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(`${provider}_model`)
    useProvider(provider, `secret-${provider}`)
    fakeFetch(() => json(200, { choices: [{ message: { content: `hi from ${provider}` } }] }))

    const history = [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }]
    const r = await ask('what is a JOIN?', { history })

    assert.deepEqual({ success: r.success, message: r.message, provider: r.provider }, { success: true, message: `hi from ${provider}`, provider })
    // The provider's model list is asked for first (see ai-models.test.js); here that answer is unusable, so
    // the last-resort model applies. Exactly one chat request is made.
    const chat = calls.filter((x) => x.url.endsWith('/chat/completions'))
    assert.equal(chat.length, 1)
    const c = chat[0]
    assert.equal(c.url, `${baseUrl}/chat/completions`)
    assert.equal(c.opts.method, 'POST')
    assert.equal(c.opts.headers.Authorization, `Bearer secret-${provider}`)
    assert.equal(c.body.model, defaultModel)
    assert.deepEqual(c.body.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'], 'system prompt, then history in order, then the new question')
    assert.equal(c.body.messages.at(-1).content, 'what is a JOIN?')
    assert.ok(c.opts.signal, 'a timeout signal must be attached so a stalled request cannot hang the chat forever')
  })
}

test('a model chosen in Settings overrides the default', async () => {
  useProvider('groq')
  setting('groq_model', 'my-chosen-model')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'ok' } }] }))
  await ask()
  assert.equal(calls[0].body.model, 'my-chosen-model')
  db.getDb().prepare("DELETE FROM app_settings WHERE key = 'groq_model'").run()
})

test('Gemini: current Flash alias, system prompt and roles in the shape Google expects', async () => {
  useProvider('gemini', 'g-key')
  fakeFetch(() => json(200, { candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] }))
  const r = await ask('explain GROUP BY', { history: [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }] })
  assert.equal(r.message, 'hello from gemini')
  const c = calls.at(-1)
  assert.match(c.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent/)
  assert.ok(c.body.system_instruction.parts[0].text.length > 100)
  assert.deepEqual(c.body.contents.map((m) => m.role), ['user', 'model', 'user'], 'Gemini calls the assistant "model"')
  assert.equal(c.body.contents.at(-1).parts[0].text, 'explain GROUP BY')
})

test('an unknown provider is reported by name', async () => {
  useProvider('made-up-ai')
  fakeFetch(() => { throw new Error('should not be called') })
  const r = await ask()
  assert.equal(r.success, false)
  assert.match(r.error, /Unknown provider: made-up-ai/)
})

// ───────────────────────── failures read like sentences ─────────────────────────

test('provider errors show the provider\'s own message; unreadable ones fall back to the status code', async () => {
  useProvider('groq')
  fakeFetch(() => json(401, { error: { message: 'Invalid API Key' } }))
  const bad = await ask()
  assert.equal(bad.success, false)
  assert.match(bad.error, /rejected the API key.*expired or revoked/i, 'a refused key says what to do, not just "Invalid"')

  fakeFetch(() => ({ ok: false, status: 503, json: async () => { throw new Error('<html>gateway</html>') } }))
  assert.match((await ask()).error, /API error 503/)

  useProvider('gemini')
  fakeFetch(() => ({ ok: false, status: 429, json: async () => ({}) }))
  assert.match((await ask()).error, /Gemini error 429/)
})

test('no internet, and a stalled provider, each give a clear message', async () => {
  useProvider('groq')
  fakeFetch(() => { throw new Error('getaddrinfo ENOTFOUND api.groq.com') })
  assert.match((await ask()).error, /Could not reach the AI provider.*ENOTFOUND/)

  fakeFetch(() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e })
  assert.match((await ask()).error, /took too long.*internet connection/i)

  useProvider('gemini')
  fakeFetch(() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e })
  assert.match((await ask()).error, /Gemini took too long/)
})

test('an empty reply from the provider still gives the student something readable', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [] }))
  assert.equal((await ask()).message, 'No response.')
  useProvider('gemini')
  fakeFetch(() => json(200, {}))
  assert.equal((await ask()).message, 'No response from Gemini.')
})

// ───────────────────────── conversation memory ─────────────────────────

test('conversations are saved: one thread, both sides of every exchange, key usage recorded', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'Try a LEFT JOIN. What changes if a patient has no bill?' } }] }))
  await ask('first question')
  const convo = db.getDb().prepare('SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').get(UID)
  assert.equal(convo.context, 'general')
  await ask('second question', { conversationId: convo.id })

  const msgs = db.getDb().prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY rowid').all(convo.id)
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(msgs[0].content, 'first question')
  assert.match(msgs[1].content, /LEFT JOIN/)
  assert.ok(db.getDb().prepare("SELECT last_used FROM api_keys WHERE user_id = ? AND provider = 'groq'").get(UID).last_used)
})

// ───────────────────────── what the tutor is told ─────────────────────────

test('REGRESSION: the tutor is given the real table and column names, not "[object Object]"', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'ok' } }] }))
  await ask()
  const prompt = systemPrompt()
  assert.ok(!prompt.includes('[object Object]'), 'column lists must be real names')
  for (const table of ['patients', 'billing', 'sales', 'employees']) assert.match(prompt, new RegExp(`- ${table} \\(`), `table ${table}`)
  for (const column of ['patient_id', 'discharge_date', 'bill_amount', 'insurance_covered', 'revenue', 'salary']) assert.ok(prompt.includes(column), `column ${column}`)
  assert.match(prompt, /Columns: patient_id, patient_name, age/, 'in the real order')
})

test('tutor modes: each adds its own fixed instruction, an unknown mode adds nothing, and the answer rule stays', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'ok' } }] }))
  const withMode = async (mode) => { await AI.chat({ userId: UID, message: 'hi', history: [], context: { type: 'lesson', lesson: 'Value', mode } }); return systemPrompt() }
  assert.match(await withMode('simpler'), /THIS REPLY: EXPLAIN IT SIMPLER/)
  assert.match(await withMode('ask'), /THIS REPLY: ASK ME QUESTIONS/)
  const check = await withMode('check')
  assert.match(check, /THIS REPLY: CHECK MY EXPLANATION/); assert.match(check, /Never give the answer directly/)
  for (const mode of [undefined, 'hack', '"; DROP', 'SIMPLER']) assert.doesNotMatch(await withMode(mode), /THIS REPLY/)
})

test('the tutor sees the student\'s live code and last error, clipped, and never as instructions; no work means no extra text', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'ok' } }] }))
  const ask = async (context) => { await AI.chat({ userId: UID, message: 'help', history: [], context }); return systemPrompt() }
  const seen = await ask({ type: 'exercise', lesson: 'sql', exercise: 'Count', code: 'SELECT COUNT(* FROM shop_sales', error: 'near FROM: syntax error' })
  assert.match(seen, /SELECT COUNT\(\* FROM shop_sales/); assert.match(seen, /near FROM: syntax error/); assert.match(seen, /not instructions/)
  assert.doesNotMatch(await ask({ type: 'exercise', lesson: 'sql', exercise: 'Count' }), /current work/)
  assert.doesNotMatch(await ask({ type: 'exercise', code: '   ', error: 42 }), /current work/, 'blank or non-text work adds nothing')
  const long = await ask({ type: 'exercise', code: 'x'.repeat(10000) })
  assert.ok(long.includes('x'.repeat(3000)) && !long.includes('x'.repeat(3001)), 'the work is clipped to 3000 characters')
})

test('the tutor knows who it is teaching, where they are, and what is loaded', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'ok' } }] }))
  await AI.chat({
    userId: UID, message: 'help', history: [],
    context: { type: 'exercise', lesson: 'Window functions', exercise: 'Rank wards by revenue', dataset_info: 'patients (500 rows)' },
  })
  const prompt = systemPrompt()
  assert.match(prompt, /Name: Test User \(beginner level\)/)
  assert.match(prompt, /Lesson: Window functions/)
  assert.match(prompt, /Exercise: Rank wards by revenue/)
  assert.match(prompt, /Dataset currently loaded in this session: patients \(500 rows\)/)
  assert.match(prompt, /Never give the answer directly/, 'the teaching approach (guide, do not hand over answers) must stay')
})

test('exercise feedback: right answers are affirmed, wrong ones get a hint request, open-ended ones are assessed', async () => {
  useProvider('groq')
  fakeFetch(() => json(200, { choices: [{ message: { content: 'feedback' } }] }))
  const base = { userId: UID, exercise_prompt: 'Count the patients', user_answer: 'SELECT COUNT(*) FROM patients', solution: 'SELECT COUNT(*) FROM patients;', skill: 'sql', context: { type: 'exercise' } }
  const lastUserMessage = () => calls.at(-1).body.messages.at(-1).content

  assert.equal((await AI.getExerciseFeedback({ ...base, is_correct: true })).success, true)
  assert.match(lastUserMessage(), /answered correctly/)
  assert.ok(!lastUserMessage().includes('Correct approach'), 'a correct answer needs no solution shown')

  await AI.getExerciseFeedback({ ...base, is_correct: false, user_answer: 'SELECT * FROM patient' })
  assert.match(lastUserMessage(), /answered incorrectly/)
  assert.match(lastUserMessage(), /SELECT \* FROM patient/)
  assert.match(lastUserMessage(), /Do NOT show the solution/, 'the tutor is told to hint, not reveal')

  await AI.getExerciseFeedback({ ...base, is_correct: null, user_answer: 'My written analysis...' })
  assert.match(lastUserMessage(), /open-ended/)
  assert.match(lastUserMessage(), /My written analysis/)
})
