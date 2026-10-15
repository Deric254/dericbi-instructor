#!/usr/bin/env node
/**
 * Build guard: makes sure the installer contains every npm package the Electron main process needs.
 *
 * Why this exists: the renderer (React, Monaco, charts...) is already compiled into dist/, so
 * package.json -> build.files EXCLUDES the packages only the renderer used (the installer is
 * ~160 MB smaller). If someone later `require()`s one of those excluded packages from
 * electron/, the installed app would crash at launch. This script walks dist-electron/ + each
 * package's dependencies (Node-style resolution) and fails the build, naming the package and
 * the fix, if anything the main process needs is on the exclusion list. (A NEW dependency that
 * isn't listed is shipped by default - worst case a larger installer, never a crash.)
 *
 * Run automatically by `npm run build:win` / `npm run publish:win`. Needs `npm run build` first.
 */
const fs = require('fs')
const path = require('path')
const builtin = new Set(require('module').builtinModules)

const ROOT = path.resolve(__dirname, '..')
const NM = path.join(ROOT, 'node_modules')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const entry = (pkg.build.files || []).find((f) => /^!node_modules\/\{.*\}\/\*\*\/\*$/.test(f))
if (!entry) { console.error('verify-packaged-deps: no "!node_modules/{...}/**/*" exclusion entry found in package.json build.files'); process.exit(1) }
const excluded = new Set(entry.slice('!node_modules/{'.length, entry.indexOf('}/**/*')).split(','))

function resolvePkg(name, fromDir) {
  let d = fromDir
  while (d.length >= ROOT.length) {
    const c = path.join(d, 'node_modules', name)
    if (fs.existsSync(path.join(c, 'package.json'))) return c
    const up = path.dirname(d); if (up === d) break; d = up
  }
  return null
}

const needed = new Set()
function visit(dir) {
  if (needed.has(dir)) return
  needed.add(dir)
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  for (const dep of Object.keys({ ...j.dependencies, ...j.optionalDependencies })) {
    if (dep.startsWith('@types/')) continue // TypeScript typings only, never loaded at runtime
    const r = resolvePkg(dep, dir); if (r) visit(r)
  }
}

const distDir = path.join(ROOT, 'dist-electron')
if (!fs.existsSync(distDir)) { console.error('verify-packaged-deps: dist-electron/ not found - run `npm run build` first'); process.exit(1) }
const direct = new Set()
;(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.js')) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/require\(["']([^"'./][^"']*)["']\)/g)) {
        const n = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]
        if (!builtin.has(n) && n !== 'electron' && !n.startsWith('node:')) direct.add(n)
      }
    }
  }
})(distDir)

for (const n of direct) { const r = resolvePkg(n, ROOT); if (r) visit(r); else { console.error(`verify-packaged-deps: cannot resolve "${n}" (npm install?)`); process.exit(1) } }

// electron-builder applies "!node_modules/{name}" exclusions to that package name at ANY depth
// (including copies nested inside another package), so compare by name, not by location.
const neededNames = new Set(
  [...needed].map((d) => {
    const rel = d.split(path.sep + 'node_modules' + path.sep).pop().split(path.sep)
    return rel[0].startsWith('@') ? rel.slice(0, 2).join('/') : rel[0]
  })
)
const wronglyExcluded = [...neededNames].filter((n) => excluded.has(n)).sort()
if (wronglyExcluded.length) {
  console.error('\nINSTALLER WOULD CRASH: the main process needs packages that package.json -> build.files excludes:\n  ' + wronglyExcluded.join(', '))
  console.error('\nFix: delete those names from the "!node_modules/{...}/**/*" entry in package.json -> build.files.\n')
  process.exit(1)
}
console.log(`verify-packaged-deps: OK - the ${neededNames.size} packages the main process needs are all shipped (${excluded.size} unused packages excluded).`)
