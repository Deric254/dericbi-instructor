'use strict'
// Both themes must be clearly readable: every text and status colour meets WCAG AA (4.5:1) on every surface it
// can sit on, panel borders are visible, and nothing is hard-wired to one theme (editors, consoles).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(ROOT, 'src/styles/globals.css'), 'utf8')
const block = (sel) => { const i = css.indexOf(sel); return css.slice(i, css.indexOf('\n}', i)) }
const vars = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
const dark = vars(block(':root {'))
const light = { ...dark, ...vars(block('[data-theme="light"] {')) }

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const TEXT = ['text-primary', 'text-secondary', 'text-muted', 'accent', 'sql-color', 'excel-color', 'python-color', 'powerbi-color', 'stats-color', 'business-color', 'de-color', 'sim-color', 'playground-color', 'success', 'error', 'warning', 'info', 'terminal-text']
const SURFACES = ['bg-base', 'bg-surface', 'bg-elevated']

for (const [name, t] of [['dark', dark], ['light', light]]) {
  test(`${name} theme: every text and status colour is AA-readable on every surface`, () => {
    const failures = []
    for (const fg of TEXT) for (const bg of SURFACES.concat(fg === 'terminal-text' ? ['terminal-bg'] : [])) {
      assert.ok(t[fg] && t[bg], `${fg}/${bg} defined`)
      const r = ratio(t[fg], t[bg]); if (r < 4.5) failures.push(`${fg} on ${bg} = ${r.toFixed(2)}`)
    }
    assert.deepEqual(failures, [])
  })
  test(`${name} theme: button text on the accent colour and panel borders are clear`, () => {
    assert.ok(ratio(t['text-inverse'], t.accent) >= 4.5, 'text on accent buttons')
    assert.ok(ratio(t['border-strong'], t['bg-surface']) >= 2, 'strong borders visible')
    assert.ok(ratio(t.border, t['bg-surface']) >= 1.5, 'borders visible')
  })
}

test('nothing is hard-wired to one theme: editors follow the app theme, consoles use theme tokens', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(d, e.name)] : []))
  const offenders = []
  for (const f of walk(path.join(ROOT, 'src'))) {
    const s = fs.readFileSync(f, 'utf8'); const rel = path.relative(ROOT, f)
    if (/theme=["']vs-dark["']/.test(s)) offenders.push(`${rel}: editor fixed to dark`)
    if (/\.tsx$/.test(f) && /['"]#0d1117['"]|['"]#a5d6a7['"]/.test(s)) offenders.push(`${rel}: console colour hard-coded`)
  }
  assert.deepEqual(offenders, [])
})
