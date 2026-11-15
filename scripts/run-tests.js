'use strict'
// Runs every tests/*.test.js with Node's built-in test runner. Files are DISCOVERED, so a new test file is
// picked up automatically and cannot be forgotten.
//
//   npm test                    everything
//   npm test -- sql             only files whose name contains "sql"
//
// Environment:
//   DBI_PY_PACKAGES=skip|required   see tests/python-runtime.test.js (pandas/numpy tests need internet the first time)
//   DBI_TEST_SEED=123               try different generated practice data
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const filters = process.argv.slice(2)
const files = fs.readdirSync(path.join(root, 'tests'))
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)))
  .sort()
  .map((f) => path.join('tests', f))

if (files.length === 0) {
  console.error(`No test files matched ${JSON.stringify(filters)}`)
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: root, stdio: 'inherit' })
process.exit(result.status === null ? 1 : result.status)
