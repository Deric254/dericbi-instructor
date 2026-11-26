'use strict'
// Integrated lessons: the ten-step blueprint, the safe diagram renderer and the evidence library. A lesson that starts with the "Hook"
// heading must follow every step in order, its diagram must be valid, its case and quote must exist in the library with a source and a
// check date, and there is never more than one quote. Nothing here names a lesson: it checks every lesson in every academy.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { bootWithIpc } = require('./helpers/ipc')
const { requireTs } = require('./helpers/ts')
const { src, ROOT } = require('./helpers/harness')

const h = bootWithIpc({ prefix: 'dbi-blueprint' })
const D = requireTs('src/lib/diagram.ts')
let E
test.before(async () => { await h.start(); E = h.req('services/evidence') })

const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/path/blueprint.json'), 'utf8'))
const library = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/evidence/library.json'), 'utf8')).entries
const lessons = fs.readdirSync(path.join(ROOT, 'content')).map((d) => path.join(ROOT, 'content', d, 'curriculum.json')).filter((f) => fs.existsSync(f))
  .flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).lessons)
const sections = (md) => { const out = {}; let cur = null; for (const line of md.split('\n')) { const m = /^## (.+)$/.exec(line); if (m) { cur = m[1].trim(); out[cur] = '' } else if (cur) out[cur] += line + '\n' } return out }
const blocks = (md, lang) => [...md.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```', 'g'))].map((m) => m[1].trim())
const byId = Object.fromEntries(library.map((e) => [e.id, e]))
const integrated = lessons.filter((l) => l.theory_md.includes('## Hook'))

test('the blueprint is ten steps, each with a heading and a purpose', () => {
  assert.equal(blueprint.steps.length, 10)
  assert.deepEqual(blueprint.steps.map((s) => s.heading), ['Hook', 'Predict', 'Plain words', 'Diagram', 'Worked example', 'Case', 'Bridge', 'Try it', 'Say it back', 'Use it'])
  assert.equal(new Set(blueprint.steps.map((s) => s.id)).size, 10); assert.ok(blueprint.steps.every((s) => s.purpose.length > 20))
  assert.equal(blueprint.max_quotes_per_lesson, 1)
})

test('every integrated lesson follows the blueprint exactly, in order, with a real diagram, a real case and at most one quote', () => {
  assert.ok(integrated.length >= 3, 'the pilot lessons exist')
  for (const l of integrated) {
    const sec = sections(l.theory_md)
    assert.deepEqual(Object.keys(sec), blueprint.steps.map((s) => s.heading), `${l.id}: headings`)
    for (const [k, body] of Object.entries(sec)) assert.ok(body.trim().length > 40, `${l.id}: "${k}" is empty`)
    assert.match(sec['Predict'].trim(), /\?$/, `${l.id}: Predict must end with a question`)
    const diagrams = blocks(sec['Diagram'], 'diagram'); assert.ok(diagrams.length >= 1, `${l.id}: Diagram needs a diagram`)
    diagrams.forEach((d) => assert.ok(D.parseDiagram(d), `${l.id}: invalid diagram`))
    const cases = blocks(sec['Case'], 'evidence'); assert.ok(cases.length >= 1, `${l.id}: Case needs a library case`)
    cases.forEach((id) => assert.ok(['case', 'history'].includes(byId[id]?.kind), `${l.id}: ${id} is not a case or history entry`))
    assert.ok(/Technology side:/.test(sec['Bridge']) && /Business side:/.test(sec['Bridge']), `${l.id}: Bridge must speak to both sides`)
    const used = blocks(l.theory_md, 'evidence'); const quotes = used.filter((id) => byId[id]?.kind === 'quote')
    assert.ok(quotes.length <= blueprint.max_quotes_per_lesson, `${l.id}: too many quotes`)
    quotes.forEach((id) => assert.ok(blocks(sec['Hook'], 'evidence').includes(id), `${l.id}: a quote belongs in the Hook`))
  }
  assert.ok(['tf-data', 'tf-first-principles', 'py-pandas-intro'].every((id) => integrated.some((l) => l.id === id)))
})

test('no lesson anywhere points at a diagram that cannot be drawn or an entry that is not in the library', () => {
  for (const l of lessons) {
    blocks(l.theory_md, 'diagram').forEach((d) => assert.ok(D.parseDiagram(d), `${l.id}: bad diagram`))
    blocks(l.theory_md, 'evidence').forEach((id) => assert.ok(byId[id], `${l.id}: unknown evidence ${id}`))
  }
})

test('the evidence library: every entry has a source on https, a real check date and its own words; quotes name who said it and where', () => {
  assert.ok(library.length >= 4)
  assert.equal(E.loadEvidence().length, library.length, 'the service accepts every entry')
  assert.equal(new Set(library.map((e) => e.id)).size, library.length)
  for (const e of library) {
    assert.ok(E.validEntry(e), e.id); assert.match(e.source.url, /^https:\/\//); assert.match(e.checked, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(Date.parse(e.checked) <= Date.now(), `${e.id}: checked in the future`)
    assert.ok(e.takeaway.length > 30)
    if (e.kind === 'quote') { assert.ok(e.who && e.work); assert.ok(e.text.length < 300, 'a quote is a line, not a passage') }
  }
  const cm = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/concepts/concepts.json'), 'utf8')).concepts.map((c) => c.id)
  for (const e of library) e.concepts.forEach((c) => assert.ok(cm.includes(c), `${e.id}: unknown concept ${c}`))
  const feynman = byId['quote-feynman-fooling'].text
  assert.equal(feynman, 'The first principle is that you must not fool yourself—and you are the easiest person to fool.')
})

test('the evidence service refuses malformed entries and survives a missing or broken file', () => {
  const ok = JSON.parse(JSON.stringify(byId['case-mars-orbiter']))
  const bad = (patch) => E.validEntry({ ...ok, ...patch })
  assert.equal(E.validEntry(ok), true)
  assert.equal(bad({ kind: 'rumour' }), false); assert.equal(bad({ id: '' }), false); assert.equal(bad({ checked: 'yesterday' }), false)
  assert.equal(bad({ checked: '2026-13-45' }), false); assert.equal(bad({ source: { ...ok.source, url: 'http://example.com' } }), false)
  assert.equal(bad({ source: { ...ok.source, url: 'javascript:alert(1)' } }), false); assert.equal(bad({ takeaway: '' }), false)
  assert.equal(bad({ concepts: 'data-types' }), false); assert.equal(bad({ kind: 'quote' }), false, 'a quote must say who said it')
  assert.equal(E.validEntry(null), false)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-')); const f = path.join(tmp, 'l.json')
  assert.deepEqual(E.loadEvidence(path.join(tmp, 'nope.json')), [])
  fs.writeFileSync(f, 'not json'); assert.deepEqual(E.loadEvidence(f), [])
  fs.writeFileSync(f, JSON.stringify({ entries: [ok, ok, { ...ok, id: 'x', kind: 'rumour' }, 5] })); assert.deepEqual(E.loadEvidence(f).map((e) => e.id), ['case-mars-orbiter'])
  fs.writeFileSync(f, JSON.stringify({ entries: 'oops' })); assert.deepEqual(E.loadEvidence(f), [])
})

const spec = (o = {}) => JSON.stringify({ title: 'T', nodes: [{ id: 'a', label: 'A', side: 'tech' }, { id: 'b', label: 'B', side: 'business' }], edges: [['a', 'b']], ...o })

test('a diagram spec is checked strictly: anything odd is refused rather than drawn', () => {
  assert.ok(D.parseDiagram(spec()))
  const n = (i, side = 'tech') => ({ id: i, label: i, side })
  assert.equal(D.parseDiagram('nope'), null); assert.equal(D.parseDiagram('[]'), null); assert.equal(D.parseDiagram(spec({ title: '' })), null)
  assert.equal(D.parseDiagram(spec({ nodes: [n('a')] })), null, 'one node is not a diagram')
  assert.equal(D.parseDiagram(spec({ nodes: [n('a'), n('a')] })), null, 'duplicate ids')
  assert.equal(D.parseDiagram(spec({ nodes: [n('a'), n('b', 'red')] })), null, 'unknown side')
  assert.equal(D.parseDiagram(spec({ edges: [['a', 'zzz']] })), null, 'edge to nowhere')
  assert.equal(D.parseDiagram(spec({ edges: [['a', 'a']] })), null, 'self edge')
  assert.equal(D.parseDiagram(spec({ edges: [] })), null, 'no flow')
  assert.equal(D.parseDiagram(spec({ edges: [['a', 'b', 'x'.repeat(31)]] })), null)
  assert.equal(D.parseDiagram(spec({ edges: [['a', 'b', 5]] })), null)
  assert.equal(D.parseDiagram(spec({ nodes: [n('a'), { id: 'b', label: 'x'.repeat(D.MAX_LABEL + 1), side: 'tech' }] })), null)
  assert.equal(D.parseDiagram(spec({ nodes: Array.from({ length: D.MAX_NODES + 1 }, (_, i) => n('n' + i)), edges: [['n0', 'n1']] })), null)
})

test('the layout puts the flow top to bottom, survives loops, and keeps lesson text as plain text', () => {
  const s = D.parseDiagram(JSON.stringify({ title: 'Loop', nodes: ['a', 'b', 'c', 'd'].map((i) => ({ id: i, label: `Step ${i}`, side: i === 'a' ? 'bridge' : 'tech' })), edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'b', 'again'], ['a', 'c']] }))
  const l = D.layoutDiagram(s); const x = Object.fromEntries(l.nodes.map((n) => [n.id, n.y]))
  assert.ok(x.a < x.b && x.b < x.c && x.c < x.d, 'rows follow the flow, top to bottom')
  assert.ok(Number.isFinite(l.width) && Number.isFinite(l.height) && l.width > 0 && l.height > 0)
  assert.equal(l.edges.length, 5); assert.ok(l.edges.every((e) => /^M[-\d.,]+ C[-\d.,\s]+$/.test(e.d)), 'paths are numbers only')
  assert.ok(l.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= l.width && n.y + n.h <= l.height))
  assert.deepEqual(l.sides.sort(), ['bridge', 'tech']); assert.match(l.description, /again/)
  const evil = D.parseDiagram(JSON.stringify({ title: '<img src=x onerror=alert(1)>', nodes: [{ id: 'a', label: '<script>alert(1)</script>', side: 'tech' }, { id: 'b', label: 'ok', side: 'tech' }], edges: [['a', 'b']] }))
  const le = D.layoutDiagram(evil); assert.equal(le.nodes[0].lines.join(''), '<script>alert(1)</script>', 'kept as plain text, never interpreted'); assert.equal(le.title, '<img src=x onerror=alert(1)>')
  const long = D.layoutDiagram(D.parseDiagram(spec({ nodes: [{ id: 'a', label: 'A very long label that needs two lines', side: 'tech' }, { id: 'b', label: 'B', side: 'tech' }] })))
  assert.ok(long.nodes[0].lines.length <= 2 && long.nodes[0].lines.every((t) => t.length <= 21))
  assert.equal(D.layoutDiagram(D.parseDiagram(spec({ nodes: [{ id: 'a', label: 'A', side: 'tech' }, { id: 'b', label: 'B', side: 'tech' }, { id: 'c', label: 'C', side: 'tech' }], edges: [['a', 'b'], ['a', 'c']] }))).nodes.length, 3)
})

test('the page draws diagrams and evidence as text and SVG only, in every academy through the one shared renderer', () => {
  const theory = src('src/components/ui/LessonTheory.tsx'); const dg = src('src/components/ui/Diagram.tsx'); const ev = src('src/components/ui/EvidenceCard.tsx')
  assert.match(theory, /language-\(diagram\|evidence\)/); assert.match(theory, /<Diagram source=/); assert.match(theory, /<EvidenceCard id=/)
  for (const f of [theory, dg, ev]) { assert.ok(!/dangerouslySetInnerHTML|rehype-raw|innerHTML/.test(f), 'no raw HTML'); }
  assert.match(dg, /var\(--sql-color\)/); assert.match(dg, /var\(--business-color\)/); assert.match(dg, /var\(--bp-color\)/)
  assert.match(dg, /<title id=/); assert.match(dg, /<desc id=/); assert.match(ev, /rel="noopener noreferrer"/); assert.match(ev, /entry\.checked/)
  for (const a of ['SqlAcademy', 'PythonAcademy', 'ExcelAcademy', 'PowerBIAcademy', 'StatisticsAcademyFull', 'BusinessAcademyFull']) assert.match(src(`src/pages/${a}.tsx`), /LessonTheory/, a)
})

test('the library reaches the page through its own read channel', async () => {
  const list = await h.invoke('evidence:list')
  assert.deepEqual(list.map((e) => e.id).sort(), library.map((e) => e.id).sort())
  assert.match(src('electron/preload.ts'), /'evidence:list'/)
})
