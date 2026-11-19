'use strict'
// The contracts BETWEEN the parts of the app. An upgrade or a rename can leave every part individually fine
// while the screen calls something that no longer exists - a button that does nothing, a page that never opens.
// These tests read the real code and check the parts still line up.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, src } = require('./helpers/harness')
const { bootWithIpc } = require('./helpers/ipc')

// Load the real compiled preload with a recording stand-in for Electron's bridge.
const exposed = {}
const invoked = new Set()
const listened = new Set()
const app = bootWithIpc({
  prefix: 'dbi-wiring',
  electron: {
    contextBridge: { exposeInMainWorld: (name, obj) => { exposed[name] = obj } },
    ipcRenderer: {
      invoke: (channel) => { invoked.add(channel); return Promise.resolve() },
      on: (channel) => { listened.add(channel) },
      removeListener() {}, removeAllListeners() {}, send() {},
    },
  },
})

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name)
  return e.isDirectory() ? walk(p) : [p]
})

// ───────────────────────── screens <-> main process ─────────────────────────

test.before(async () => {
  await app.start()
  app.req('preload') // runs the preload script, which exposes window.api
})

test('the preload exposes window.api, and every call on it is answered by a handler in the main process', async () => {
  const api = exposed.api
  assert.ok(api && typeof api === 'object', 'preload must expose "api"')

  for (const [group, fns] of Object.entries(api)) {
    for (const [name, fn] of Object.entries(fns)) {
      assert.equal(typeof fn, 'function', `api.${group}.${name}`)
      try { fn() } catch { /* a few helpers need arguments; the channel is still recorded before they fail */ }
    }
  }
  assert.ok(invoked.size >= 60, `expected the whole API surface, found ${invoked.size} channels`)

  // Window controls and the updater are registered in main.ts itself, not in the shared handler list.
  const inMain = new Set([...src('electron/main.ts').matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]))
  const missing = [...invoked].filter((ch) => !app.handlers.has(ch) && !inMain.has(ch))
  assert.deepEqual(missing, [], `the screens call these channels but nothing answers them: ${missing.join(', ')}`)
})

test('events the main process pushes to the screens are ones the preload listens for', () => {
  const sent = new Set([...src('electron/main.ts').matchAll(/webContents\.send\('([^']+)'/g)].map((m) => m[1]))
  const unheard = [...sent].filter((ch) => !listened.has(ch))
  assert.deepEqual(unheard, [], `main sends these events but no screen can hear them: ${unheard.join(', ')}`)
})

test('every window.api.group.function the screens use really exists in the preload', () => {
  const api = exposed.api
  const used = new Map()
  for (const file of walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('electron.d.ts'))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/window\.api\.(\w+)\.(\w+)/g)) {
      used.set(`${m[1]}.${m[2]}`, path.relative(ROOT, file))
    }
  }
  assert.ok(used.size > 40, `expected many API calls in the screens, found ${used.size}`)
  const broken = [...used].filter(([call]) => { const [g, f] = call.split('.'); return typeof api[g]?.[f] !== 'function' })
  assert.deepEqual(broken.map(([call, file]) => `${call} (used in ${file})`), [])
})

test('the app\'s data-handling channels are all behind the activation gate', () => {
  // Every channel except the three licence ones is registered through safeHandle (checked at runtime in ipc-flows).
  // Here: nobody has registered a data channel directly with ipcMain.handle, bypassing the gate.
  const direct = [...src('electron/ipc/handlers.ts').matchAll(/ipcMain\.handle\(/g)]
  assert.equal(direct.length, 0, 'use safeHandle() for data channels so an unactivated copy cannot reach them')
})

// ───────────────────────── page routing ─────────────────────────

test('every page the app can navigate to is mounted, and every sidebar and shortcut target exists', () => {
  const types = src('src/types/index.ts')
  const sections = [...types.match(/export type NavSection =([\s\S]*?)\n\n/)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  assert.ok(sections.length >= 14)

  const shell = src('src/components/layout/AppShell.tsx')
  const mounted = [...shell.match(/const PAGES[^{]*\{([\s\S]*?)\n\}/)[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
  assert.deepEqual([...mounted].sort(), [...sections].sort(), 'every NavSection needs a page in AppShell (and vice versa)')

  const sidebar = [...src('src/components/layout/Sidebar.tsx').matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1])
  for (const id of sidebar) assert.ok(sections.includes(id), `sidebar item "${id}" has no page`)
  for (const core of ['sql', 'python', 'excel', 'powerbi', 'statistics', 'business', 'playground', 'datasets', 'settings']) {
    assert.ok(sidebar.includes(core), `the sidebar must offer "${core}"`)
  }

  const targets = new Set()
  for (const file of walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.tsx'))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/setActiveSection\('([a-z]+)'\)/g)) targets.add(m[1])
    for (const m of text.matchAll(/\bsection:\s*'([a-z]+)'/g)) if (!file.endsWith('Sidebar.tsx')) targets.add(m[1])
  }
  assert.ok(targets.has('sql') && targets.has('python') && targets.has('datasets'), 'the Playground hub links to SQL, Python and Datasets')
  for (const t of targets) assert.ok(sections.includes(t), `a button navigates to "${t}", which is not a page`)
})

test('every imported page file exists', () => {
  const shell = src('src/components/layout/AppShell.tsx')
  for (const m of shell.matchAll(/from '(\.\.\/\.\.\/pages\/[^']+)'/g)) {
    const base = path.join(ROOT, 'src/components/layout', m[1])
    assert.ok(['.tsx', '.ts'].some((ext) => fs.existsSync(base + ext)), `${m[1]} is imported but missing`)
  }
})

// ───────────────────────── the safety nets themselves ─────────────────────────

test('the installer still contains every package the app needs at run time', () => {
  const r = spawnSync(process.execPath, ['scripts/verify-packaged-deps.js'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('CI runs this test suite on every push and pull request, and releases are gated on it', () => {
  const ci = src('.github/workflows/ci.yml')
  assert.match(ci, /\bpush:/)
  assert.match(ci, /\bpull_request:/)
  assert.match(ci, /npm test/)
  assert.match(src('.github/workflows/release.yml'), /npm test/, 'a release must not be published if the tests fail')
})

test('npm test runs every test file in tests/ (a new test cannot be forgotten)', () => {
  const runner = src('scripts/run-tests.js')
  assert.match(runner, /readdirSync/, 'the runner must discover files, not list them by hand')
  assert.equal(JSON.parse(src('package.json')).scripts.test, 'npm run build:electron && node scripts/run-tests.js')
})
