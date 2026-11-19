'use strict'
// Python practicals must run with no internet: the Python engine's core ships inside the app and is served by a
// private address. Only its five files may ever be served.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, src } = require('./helpers/harness')
const { resolvePyodideFile, pyodideDirs } = require(path.join(ROOT, 'dist-electron/pyodide-protocol.js'))

test('the five core files resolve, with the right content type', () => {
  const want = { 'pyodide.js': 'text/javascript', 'pyodide.asm.js': 'text/javascript', 'pyodide.asm.wasm': 'application/wasm', 'python_stdlib.zip': 'application/zip', 'pyodide-lock.json': 'application/json' }
  for (const [name, type] of Object.entries(want)) {
    const hit = resolvePyodideFile(`dbi-py://runtime/${name}`, ROOT)
    assert.ok(hit, name)
    assert.equal(hit.type, type)
    assert.ok(fs.statSync(hit.file).size > 1000, name)
  }
})

test('nothing else can be read through it: other files, folders, traversal, wrong host or scheme', () => {
  for (const bad of [
    'dbi-py://runtime/package.json', 'dbi-py://runtime/../package.json', 'dbi-py://runtime/%2e%2e/package.json', 'dbi-py://runtime/..%2F..%2Fpackage.json',
    'dbi-py://runtime/', 'dbi-py://runtime/pyodide.js/../../package.json', 'dbi-py://other/pyodide.js', 'https://runtime/pyodide.js', 'file:///etc/passwd', 'not a url', 'dbi-py://runtime/constructor', 'dbi-py://runtime/__proto__',
  ]) assert.equal(resolvePyodideFile(bad, ROOT), null, bad)
})

test('the build copies the core into the interface folder, and the app registers the private address', () => {
  assert.match(src('vite.config.ts'), /bundlePyodideCore\(\)/)
  assert.deepEqual(pyodideDirs('/app').map((p) => p.replace(/\\/g, '/')), ['/app/dist/pyodide', '/app/node_modules/pyodide'])
  const main = src('electron/main.ts')
  assert.match(main, /registerSchemesAsPrivileged\(\[\{ scheme: PY_SCHEME/)
  assert.match(main, /protocol\.handle\(PY_SCHEME/)
})

test('core Python starts from the bundled copy first, and only packages need the internet', () => {
  const l = src('src/lib/pyodideLoader.ts')
  assert.match(l, /if \(!packages\) \{\s*try \{ return await start\(LOCAL, ''\)/)
  assert.match(l, /return start\(CDN, packages\)/)
  assert.match(src('src/pages/SqlAcademy.tsx'), /usePyodide\(''\)/, 'Data Engineering practicals need no downloads')
})
