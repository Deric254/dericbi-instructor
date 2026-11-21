'use strict'
// An email address is the same address whatever its capitals or stray spaces: sign-in, duplicate sign-up and password recovery
// must all treat "Ann@Mail.com" and " ann@mail.com " as one account.
const test = require('node:test')
const assert = require('node:assert/strict')
const { bootWithIpc } = require('./helpers/ipc')

const h = bootWithIpc({ prefix: 'dbi-emailcase' })
test.before(async () => { await h.start() })
const reg = (email) => h.invoke('auth:register', { name: 'Ann', email, password: 'secret123', experience_level: 'beginner', learning_goals: [], security_question: 'Colour?', security_answer: 'blue' })

test('sign-in ignores capitals and surrounding spaces; a wrong password is still refused', async () => {
  const r = await reg('Ann@Mail.com'); assert.equal(r.success, true, r.error)
  for (const e of ['Ann@Mail.com', 'ann@mail.com', 'ANN@MAIL.COM', '  ann@mail.com  ']) {
    const l = await h.invoke('auth:login', { email: e, password: 'secret123' })
    assert.equal(l.success, true, `${e}: ${l.error}`); assert.equal(l.user.id, r.user.id)
  }
  assert.equal((await h.invoke('auth:login', { email: 'ann@mail.com', password: 'wrong' })).success, false)
  assert.equal((await h.invoke('auth:login', { email: 'other@mail.com', password: 'secret123' })).success, false)
})

test('the same address in other capitals cannot create a second account', async () => {
  const again = await reg('ANN@mail.com'); assert.equal(again.success, false); assert.match(again.error, /already exists/)
})
