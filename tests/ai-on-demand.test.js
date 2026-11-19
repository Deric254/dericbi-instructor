'use strict'
// The AI tutor spends the student's tokens, so it speaks only when asked; and the AI settings are one
// dropdown per choice instead of a wall of buttons and key fields.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const { bootWithIpc } = require('./helpers/ipc')
const { makeUser } = require('./helpers/harness')

test('the tutor panel never sends an attempt message by itself: it offers a button', () => {
  const s = src('src/components/ui/InstructorPanel.tsx')
  assert.doesNotMatch(s, /\[apiKeyOk, initialPrompt\]/, 'no effect may watch the attempt and send')
  assert.match(s, /Ask the tutor about this attempt/)
  const send = s.match(/const askAboutAttempt = \(\) => \{[\s\S]*?\n  \}/)[0]
  assert.match(send, /sendMessage\(initialPrompt, context\)/)
  assert.match(s, /onClick=\{askAboutAttempt\}/)
})

test('every other AI call in the interface sits behind a click handler', () => {
  for (const f of ['src/pages/BusinessAcademyFull.tsx', 'src/pages/SimulationsFull.tsx', 'src/pages/Projects.tsx']) {
    const s = src(f)
    const calls = s.match(/window\.api\.ai\.(chat|exerciseFeedback)\(/g) || []
    assert.ok(calls.length > 0, f)
    assert.doesNotMatch(s, /useEffect\([^)]*ai\.(chat|exerciseFeedback)/, f + ' must not call AI from an effect')
  }
})

test('AI settings use a provider dropdown, a model dropdown and one key box for the chosen provider', () => {
  const s = src('src/pages/Settings.tsx')
  assert.match(s, /<select id="ai-provider"/)
  assert.match(s, /<select id="ai-model"/)
  assert.match(s, /PROVIDERS\.filter\(p => p\.id === provider\)\.map/)
  assert.doesNotMatch(s, /PROVIDERS\.map\(p => \(\s*<button/, 'no button per provider')
})

test('the tutor-answer meter counts only that learner\'s answers, by day, week and month, and shows in Settings', async () => {
  const h = bootWithIpc({ prefix: 'dbi-usage' })
  const db = await h.start(); makeUser(db, 'u1'); makeUser(db, 'u2')
  const g = db.getDb()
  const say = (id, user, role, when) => {
    g.prepare("INSERT OR IGNORE INTO ai_conversations (id, user_id) VALUES (?, ?)").run('c-' + user, user)
    g.prepare("INSERT INTO ai_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, 'x', " + when + ")").run(id, 'c-' + user, role)
  }
  say('m1', 'u1', 'assistant', "datetime('now')")
  say('m2', 'u1', 'user', "datetime('now')")
  say('m3', 'u1', 'assistant', "datetime('now', '-3 days')")
  say('m4', 'u1', 'assistant', "datetime('now', '-40 days')")
  say('m5', 'u2', 'assistant', "datetime('now')")
  const r = await h.invoke('ai:usage', 'u1')
  assert.equal(r.today, 1, 'questions the learner typed are not answers')
  assert.ok(r.week >= 2 && r.month >= 1 && r.week >= r.today)
  assert.ok(r.week < 4, 'the 40-day-old answer is outside the week')
  assert.match(src('src/pages/Settings.tsx'), /Tutor answers used/)
})
