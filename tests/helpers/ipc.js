'use strict'
// Boots the real main process INCLUDING the IPC layer, so a test can call a channel exactly the way
// the UI does (window.api.sql.execute -> 'sql:execute') and get the real handler's answer.
const { boot } = require('./harness')

/** A stand-in for the licence check: a licensed copy passes everything, an unlicensed one refuses with the real wording. */
const licenceGate = (licensed) => () => { if (!licensed) throw new Error('This copy of DericBI Instructor is not activated.') }

function bootWithIpc(opts = {}) {
  const handlers = new Map()
  const h = boot({
    ...opts,
    electron: { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, ...(opts.electron || {}) },
  })

  const api = {
    ...h,
    handlers,
    /** Same startup order as electron/main.ts: database -> first-time setup -> handlers. */
    async start({ licensed = true } = {}) {
      const db = h.req('db/database')
      await db.initDb()
      // The licence check lives in safe-handle.ts and calls requireAccess() at call time; tests flip it here.
      const licence = h.req('services/licence.service')
      licence.requireAccess = licenceGate(licensed)
      await h.req('services/setup.service').runFirstTimeSetup(() => {})
      h.req('ipc/handlers').registerAllHandlers()
      api.setLicensed = (v) => { licence.requireAccess = licenceGate(v) }
      return db
    },
    /** Call a channel like ipcRenderer.invoke would. */
    invoke(channel, ...args) {
      const fn = handlers.get(channel)
      if (!fn) return Promise.reject(new Error(`no handler registered for "${channel}"`))
      return fn({ sender: {} }, ...args)
    },
  }
  return api
}

module.exports = { bootWithIpc }
