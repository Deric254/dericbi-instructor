'use strict'
// Shared test harness.
//
// The tests run the REAL compiled main-process code (dist-electron/) - the same SQL engine, dataset
// generator, grader and AI client the app ships - with only Electron itself stubbed, because Electron
// needs a display. Each test file runs in its own process (node --test), so each gets its own clean
// "userData" folder in the OS temp directory and never touches a real installation.
const Module = require('node:module')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const ROOT = path.join(__dirname, '..', '..')

/** Small seeded random generator (mulberry32) so the generated practice data is identical on every run. */
function seededRandom(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Prepare a sandboxed copy of the app's main process.
 *  - electron:  overrides for the Electron stub (e.g. a fake safeStorage)
 *  - seed:      seed for Math.random so generated datasets are reproducible. Set DBI_TEST_SEED to try
 *               other data (useful to prove a test does not depend on one lucky dataset).
 */
function boot({ prefix = 'dbi', electron = {}, seed = process.env.DBI_TEST_SEED || 20260101 } = {}) {
  const dist = path.join(ROOT, 'dist-electron')
  if (!fs.existsSync(path.join(dist, 'main.js'))) {
    throw new Error('dist-electron/ is missing - compile the main process first: npm run build:electron')
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  Math.random = seededRandom(Number(seed))

  const stub = {
    app: { getPath: () => tmp, isPackaged: false, getVersion: () => '0.0.0-test' },
    safeStorage: { isEncryptionAvailable: () => false },
    ipcMain: { handle() {} },
    dialog: {}, shell: {}, BrowserWindow: class {},
    ...electron,
  }
  const realLoad = Module._load
  Module._load = function (request, ...rest) {
    if (request === 'electron') return stub
    return realLoad.call(this, request, ...rest)
  }

  return {
    ROOT,
    tmp,
    stub,
    datasetsDir: path.join(tmp, 'datasets'),
    /** require() a compiled main-process module, e.g. req('services/sql.service') */
    req: (p) => require(path.join(dist, p)),
  }
}

/** Insert a user row (history, imports and AI conversations all reference users). */
function makeUser(db, id, email = `${id}@example.test`) {
  db.getDb()
    .prepare("INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, 'Test User', ?, 'x')")
    .run(id, email)
  return id
}

/**
 * A user the way real sign-up leaves one: the row PLUS the skill ratings, rank and unlocked starter lessons
 * (auth.service calls setupNewUser right after creating the account). Needed for anything that awards points.
 */
function makeLearner(h, db, id, email) {
  makeUser(db, id, email)
  h.req('services/setup.service').setupNewUser(id)
  return id
}

/** Read a project file as text, e.g. src('src/pages/SqlAcademy.tsx'). */
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n') // same text on Windows checkouts

module.exports = { boot, makeUser, makeLearner, src, ROOT }
