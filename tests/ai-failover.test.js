'use strict'
// When one AI provider fails, the next one with a key is tried; if all fail the student gets a kind message
// and nothing is left half-saved. Network faked - no keys, no internet.
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, makeLearner } = require('./helpers/harness')

const h = boot({ prefix: 'dbi-failover', electron: { safeStorage: { isEncryptionAvailable: () => false } } })
const UID = 'fo-user'
let db, AI, calls

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const ok = (text) => json(200, { choices: [{ message: { content: text } }] })
const fakeFetch = (handler) => { calls = []; global.fetch = async (url, opts) => { calls.push(String(url)); return handler(String(url), opts) } }
const ask = (extra = {}) => AI.chat({ userId: UID, message: 'hello', history: [], context: { type: 'general' }, ...extra })
const hostOf = (u) => new URL(u).host
const countRows = () => db.getDb().prepare("SELECT COUNT(*) n FROM ai_messages").get().n

test.before(async () => {
  db = h.req('db/database'); await db.initDb()
  await h.req('services/setup.service').runFirstTimeSetup(() => {})
  makeLearner(h, db, UID)
  AI = h.req('services/ai.service')
  db.getDb().prepare("INSERT INTO app_settings (key, value) VALUES ('ai_provider','groq') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
  AI.saveApiKey(UID, 'groq', 'k1'); AI.saveApiKey(UID, 'xai', 'k2'); AI.saveApiKey(UID, 'gemini', 'k3')
})

test('a busy provider is skipped and the next one answers, without the student noticing', async () => {
  fakeFetch((url) => url.includes('groq.com') ? (url.endsWith('/models') ? json(200, { data: [{ id: 'llama-x' }] }) : json(503, { error: { message: 'overloaded' } })) : url.endsWith('/models') ? json(200, { data: [{ id: 'grok-x' }] }) : ok('Hello from Grok'))
  const r = await ask()
  assert.equal(r.success, true, r.error)
  assert.equal(r.message, 'Hello from Grok')
  assert.equal(r.provider, 'xai')
})

test('an expired key on the chosen provider falls through to another', async () => {
  fakeFetch((url) => url.includes('groq.com') ? json(401, { error: { message: 'bad key' } }) : url.endsWith('/models') ? json(200, { data: [{ id: 'grok-x' }] }) : ok('still here'))
  const r = await ask()
  assert.equal(r.success, true, r.error)
  assert.equal(r.provider, 'xai')
})

test('an empty reply moves on to the next provider', async () => {
  fakeFetch((url) => url.includes('groq.com') ? (url.endsWith('/models') ? json(200, { data: [{ id: 'llama-x' }] }) : json(200, { choices: [] })) : url.endsWith('/models') ? json(200, { data: [{ id: 'grok-x' }] }) : ok('second opinion'))
  assert.equal((await ask()).message, 'second opinion')
})

test('when every provider fails the message is kind, names what happened, and nothing is half-saved', async () => {
  const before = countRows()
  fakeFetch(() => { throw new Error('getaddrinfo ENOTFOUND') })
  const r = await ask()
  assert.equal(r.success, false)
  assert.equal(r.unavailable, true)
  assert.match(r.error, /everything else still works/i)
  assert.match(r.error, /Groq/); assert.match(r.error, /xAI Grok/); assert.match(r.error, /Google Gemini/)
  assert.match(r.error, /Settings → AI Configuration/)
  assert.equal(countRows(), before, 'a failed attempt leaves no orphan question in the history')
  assert.deepEqual([...new Set(calls.map(hostOf))].sort(), ['api.groq.com', 'api.x.ai', 'generativelanguage.googleapis.com'])
})

test('a stalled network cannot hold the student for minutes', async () => {
  AI.aiLimits.totalMs = 100; AI.aiLimits.minAttemptMs = 50; AI.aiLimits.attemptMs = 50
  const t0 = Date.now()
  fakeFetch((url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e) })))
  const r = await ask()
  assert.equal(r.success, false)
  assert.ok(Date.now() - t0 < 3000)
  Object.assign(AI.aiLimits, { totalMs: 70_000, attemptMs: 30_000, minAttemptMs: 8_000 })
})

test('the conversation id comes back so the next message joins the same thread', async () => {
  fakeFetch((url) => url.endsWith('/models') ? json(200, { data: [{ id: 'llama-x' }] }) : ok('hi'))
  const a = await ask()
  assert.ok(a.conversationId)
  const b = await ask({ conversationId: a.conversationId })
  assert.equal(b.conversationId, a.conversationId)
  assert.equal(db.getDb().prepare('SELECT COUNT(*) n FROM ai_messages WHERE conversation_id = ?').get(a.conversationId).n, 4)
})
