'use strict'
// Behaviour tests for the AI layer: models are discovered live (never pinned), a retired model is
// replaced automatically, and an expired key gives a clear message. Runs the compiled main-process code
// with Electron stubbed and fetch faked - no network, no real keys.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const ROOT = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-ai-'))
const load = Module._load
Module._load = function (req, ...r) {
  if (req === 'electron') return { app: { getPath: () => tmp, isPackaged: false, getVersion: () => '0' }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle() {} }, dialog: {}, shell: {}, BrowserWindow: class {} }
  if (req === 'xlsx') return {}
  return load.call(this, req, ...r)
}
const D = path.join(ROOT, 'dist-electron')
const req = (p) => require(path.join(D, p))

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })
let calls
function fakeFetch(handler) { calls = []; global.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return handler(String(url), opts) } }

let AI, db, uid
test.before(async () => {
  db = req('db/database'); await db.initDb()
  uid = 'u-ai'
  db.getDb().prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, 'T', 't@x.io', 'x')").run(uid)
  AI = req('services/ai.service')
  db.getDb().prepare("INSERT INTO app_settings (key, value) VALUES ('ai_provider', 'groq') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
  AI.saveApiKey(uid, 'groq', 'k-groq'); AI.saveApiKey(uid, 'gemini', 'k-gem')
})

test('chat models are discovered live; embeddings/audio are ignored', async () => {
  fakeFetch(() => json(200, { data: [
    { id: 'whisper-large-v3', created: 9 }, { id: 'text-embedding-x', created: 8 },
    { id: 'llama-9-70b-versatile', created: 5 }, { id: 'old-chat', created: 1 } ] }))
  const r = await AI.listModels(uid, 'groq')
  assert.equal(r.success, true)
  assert.deepEqual(r.models, ['llama-9-70b-versatile', 'old-chat'])
  assert.equal(r.selected, 'llama-9-70b-versatile')
})

test('Gemini lists only generateContent models and prefers a current Flash', async () => {
  fakeFetch(() => json(200, { models: [
    { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] } ] }))
  const r = await AI.listModels(uid, 'gemini')
  assert.equal(r.selected, 'gemini-9-flash')
  assert.equal(calls[0].opts.headers['x-goog-api-key'], 'k-gem')
  assert.ok(!calls[0].url.includes('key='), 'the key travels in a header, not the URL')
})

test('a retired saved model is replaced automatically and the chat still succeeds', async () => {
  db.getDb().prepare("INSERT INTO app_settings (key, value) VALUES ('groq_model', 'retired-model') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
  fakeFetch((url, opts) => {
    if (url.endsWith('/models')) return json(200, { data: [{ id: 'fresh-70b-instruct' }] })
    const used = JSON.parse(opts.body).model
    return used === 'fresh-70b-instruct' ? json(200, { choices: [{ message: { content: 'hello' } }] }) : json(404, { error: { message: 'model not found' } })
  })
  const r = await AI.chat({ userId: uid, message: 'hi', history: [], context: { type: 'general' } })
  assert.equal(r.success, true, r.error)
  assert.equal(r.message, 'hello')
  const chats = calls.filter(c => c.url.endsWith('/chat/completions'))
  assert.equal(JSON.parse(chats.at(-1).opts.body).model, 'fresh-70b-instruct')
})

test('an expired or revoked key says so plainly', async () => {
  fakeFetch(() => json(401, { error: { message: 'Invalid API Key' } }))
  const r = await AI.listModels(uid, 'groq')
  assert.equal(r.success, false)
  assert.match(r.error, /rejected the API key.*expired or revoked/i)
})

test('when the model list cannot be fetched the tutor still has a last-resort model', async () => {
  db.getDb().prepare("DELETE FROM app_settings WHERE key = 'groq_model'").run()
  fakeFetch((url) => { if (url.endsWith('/models')) throw new Error('offline'); return json(200, { choices: [{ message: { content: 'ok' } }] }) })
  const r = await AI.chat({ userId: uid, message: 'hi', history: [], context: { type: 'general' } })
  assert.equal(r.success, true, r.error)
})
