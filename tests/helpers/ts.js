'use strict'
// Load a real TypeScript source file (renderer code in src/) into a Node test, with no mocks:
// esbuild (already installed by Vite) bundles it to CommonJS in a temp folder and it is required from there.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { ROOT } = require('./harness')

function requireTs(relPath) {
  const esbuild = require('esbuild')
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbi-ts-')), 'bundle.cjs')
  esbuild.buildSync({ entryPoints: [path.join(ROOT, relPath)], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
  return require(out)
}

module.exports = { requireTs }
