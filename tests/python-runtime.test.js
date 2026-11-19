'use strict'
// The Python Playground runs REAL Python (Pyodide) inside the app. These tests run the same Pyodide version
// the app downloads, the same way the page runs code, in two layers:
//
//   Layer 1 - core runtime (bundled with the npm package, works offline): printing, errors, state,
//             the standard library, and every Python example written in the lessons.
//   Layer 2 - data packages (pandas, numpy, matplotlib are downloaded from the CDN, exactly like the app does):
//             every starter template in the Playground, and the pandas/numpy features the course teaches.
//
// Layer 2 needs internet the first time (the wheels are then cached). Mode is set with DBI_PY_PACKAGES:
//   required  - the packages MUST load, otherwise the tests fail (used by the dedicated CI job)
//   skip      - leave layer 2 out entirely (used by the fast main CI job, which has its own required job)
//   (unset)   - try; if there is no internet the layer-2 tests are SKIPPED and say so
// DBI_PY_ENGINE=cpython runs layer 2 on the computer's own Python instead - handy for debugging the tests.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, src } = require('./helpers/harness')
const { preparePyodideDir } = require('./helpers/pyodide-packages')

const MODE = process.env.DBI_PY_PACKAGES || 'try'
const REQUIRED = MODE === 'required'
const PY_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies.pyodide
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PY_VERSION}/full/`
const LONG = { timeout: 900000 }
const CACHE_DIR = process.env.DBI_PYODIDE_CACHE || path.join(ROOT, 'node_modules', '.cache', `pyodide-${PY_VERSION}`)

// The app's own runner (src/lib/pythonRunner.ts) - used by the Python Academy AND the Statistics Academy.
const { requireTs } = require('./helpers/ts')
const { runPythonCaptured } = requireTs('src/lib/pythonRunner.ts')
const runLikePage = runPythonCaptured

// ───────────────────────── the app and these tests use the same Python ─────────────────────────

test('the app starts Python from ONE loader, which uses the same version these tests run', () => {
  const loader = src('src/lib/pyodideLoader.ts')
  const found = [...loader.matchAll(/pyodide\/v([\d.]+)\//g)].map((m) => m[1])
  assert.equal(found.length, 1, 'one internet address in the loader')
  assert.equal(found[0], PY_VERSION, `the app must stay on v${PY_VERSION} (the devDependency "pyodide"). Upgrade both together.`)
  for (const f of ['src/hooks/usePyodide.ts', 'src/pages/PythonAcademy.tsx', 'src/pages/StatisticsAcademyFull.tsx', 'src/pages/SqlAcademy.tsx']) {
    assert.doesNotMatch(src(f), /cdn\.jsdelivr\.net\/pyodide|loadPyodide\(/, `${f} must use the shared loader, not start Python itself`)
  }
})

test('the pinned Pyodide release still exists on the CDN and still ships pandas, numpy and matplotlib', async (t) => {
  if (MODE === 'skip') return t.skip('DBI_PY_PACKAGES=skip')
  let lock
  try {
    const res = await fetch(`${CDN}pyodide-lock.json`, { signal: AbortSignal.timeout(30000) })
    assert.equal(res.status, 200, `${CDN}pyodide-lock.json returned ${res.status}`)
    lock = await res.json()
  } catch (e) {
    if (REQUIRED || e.name === 'AssertionError') throw e
    return t.skip(`no internet: ${e.message}`)
  }
  assert.equal(lock.info.version, PY_VERSION)
  for (const pkg of ['pandas', 'numpy', 'matplotlib']) assert.ok(lock.packages[pkg], `${pkg} is no longer offered by this Pyodide release`)
  const script = await fetch(`${CDN}pyodide.js`, { method: 'HEAD', signal: AbortSignal.timeout(30000) })
  assert.equal(script.status, 200, 'pyodide.js (the file the app injects into the page) must be downloadable')
})

// ───────────────────────── layer 1: the core runtime ─────────────────────────

let core
test.before(async () => {
  const { loadPyodide } = require('pyodide')
  core = await loadPyodide() // from the npm package: no network needed
}, LONG)

test('the runtime is the pinned version and runs Python 3', () => {
  assert.equal(core.version, PY_VERSION)
  assert.match(core.runPython('import sys; sys.version'), /^3\.\d+/)
})

test('print, arithmetic and f-strings work; the last expression is shown too', () => {
  const r = runLikePage(core, 'revenue = 50000\nexpenses = 32000\nprofit = revenue - expenses\nprint(f"Profit: KES {profit:,}")\nprofit * 2')
  assert.equal(r.error, null)
  assert.match(r.output, /^Profit: KES 18,000\s+36000$/)
})

test('stderr output is reported separately from normal output', () => {
  const r = runLikePage(core, 'import sys\nprint("out")\nprint("err", file=sys.stderr)')
  assert.equal(r.output, 'out')
  assert.equal(r.error, 'err\n')
})

test('variables persist between runs, like a notebook', () => {
  runLikePage(core, 'running_total = 10')
  assert.equal(runLikePage(core, 'running_total += 5\nprint(running_total)').output, '15')
})

test('REGRESSION: a mistake in the student\'s code shows a readable error - it was blank', () => {
  // Pyodide leaves err.message EMPTY while stderr is redirected; the traceback is in the captured buffer.
  const cases = [
    ['1 / 0', /ZeroDivisionError/],
    ['print(undefined_name)', /NameError.*undefined_name/],
    ['def broken(:\n  pass', /SyntaxError/],
    ['int("abc")', /ValueError/],
    ['import module_that_does_not_exist', /ModuleNotFoundError|No module named/],
    ['[1, 2, 3][10]', /IndexError/],
    ['{"a": 1}["b"]', /KeyError/],
  ]
  for (const [code, pattern] of cases) {
    const r = runLikePage(core, code)
    assert.ok(r.error && r.error.length > 0, `${JSON.stringify(code)}: the error must not be empty`)
    assert.match(r.error, pattern, code)
  }
})

test('output printed before a failure is kept, and the playground keeps working afterwards', () => {
  const r = runLikePage(core, 'print("step 1 done")\nprint(1 / 0)')
  assert.equal(r.output, 'step 1 done')
  assert.match(r.error, /ZeroDivisionError/)

  const after = runLikePage(core, 'print("still alive")')
  assert.equal(after.error, null)
  assert.equal(after.output, 'still alive')
  assert.equal(core.runPython('import sys; sys.stdout is sys.__stdout__ and sys.stderr is sys.__stderr__'), true, 'streams must be restored after an error')
})

test('the standard library the lessons use is present', () => {
  const r = runLikePage(core, [
    'import statistics, math, json, csv, io, re, datetime, collections, random, itertools',
    'print(statistics.mean([1, 2, 3, 4]), statistics.median([5, 1, 3]), round(statistics.stdev([2, 4, 4, 4, 5, 5, 7, 9]), 3))',
    'print(json.dumps({"a": [1, 2]}), math.sqrt(144), collections.Counter("aab").most_common(1))',
    'rows = list(csv.DictReader(io.StringIO("name,score\\nAmina,81\\nBrian,64")))',
    'print(sum(int(r["score"]) for r in rows), re.findall(r"\\d+", "KES 1,200 and 35"), datetime.date(2026, 11, 14).strftime("%A"))',
  ].join('\n'))
  assert.equal(r.error, null)
  assert.equal(r.output, '2.5 3 2.138\n{"a": [1, 2]} 12.0 [(\'a\', 2)]\n145 [\'1\', \'200\', \'35\'] Saturday')
})

test('every Python code example in the lessons is valid Python', () => {
  const MODULES = ['python', 'statistics', 'sql', 'excel', 'powerbi', 'business']
  let checked = 0
  const bad = []
  for (const m of MODULES) {
    const { lessons } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', m, 'curriculum.json'), 'utf8'))
    for (const l of lessons) {
      for (const [i, block] of [...(l.theory_md || '').matchAll(/```python\n([\s\S]*?)```/g)].entries()) {
        checked++
        core.globals.set('_example', block[1])
        const err = core.runPython('import ast\ntry:\n    ast.parse(_example)\n    _r = None\nexcept SyntaxError as e:\n    _r = f"{e.msg} (line {e.lineno})"\n_r')
        if (err) bad.push(`${l.id} example #${i + 1}: ${err}`)
      }
    }
  }
  assert.ok(checked >= 40, `expected the lesson examples, found ${checked}`)
  assert.deepEqual(bad, [])
})

// ───────────────────────── layer 2: pandas / numpy / matplotlib ─────────────────────────

let engine = null
let engineError = null
test.before(async () => {
  if (MODE === 'skip') return
  try {
    if (process.env.DBI_PY_ENGINE === 'cpython') {
      engine = {
        name: 'cpython',
        run(code) {
          const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' })
          return { output: r.stdout.trim(), error: r.status === 0 ? (r.stderr || null) : r.stderr.trim().split('\n').pop() }
        },
      }
      return
    }
    const { loadPyodide } = require('pyodide')
    const dir = await preparePyodideDir({ cdnBase: CDN, cacheDir: CACHE_DIR, packages: ['pandas', 'numpy', 'matplotlib'] })
    const py = await loadPyodide({ indexURL: dir + path.sep })
    await py.loadPackagesFromImports('import pandas, numpy, matplotlib') // same call as PythonAcademy.tsx
    // loadPackage does not throw when something goes wrong - so prove the imports really work.
    py.runPython('import pandas, numpy, matplotlib')
    engine = { name: 'pyodide', run: (code) => runLikePage(py, code) }
  } catch (e) {
    engineError = e
  }
}, LONG)

/** True when the package tests can run; skips (locally) or fails (in CI) when they cannot. */
function havePackages(t) {
  if (engine) return true
  if (MODE === 'skip') { t.skip('DBI_PY_PACKAGES=skip'); return false }
  const why = `pandas/numpy could not be prepared from ${CDN}: ${engineError && engineError.message}`
  if (REQUIRED) assert.fail(why)
  t.skip(`no internet? ${why}`)
  return false
}

test('pandas and numpy load and compute correctly', (t) => {
  if (!havePackages(t)) return
  const r = engine.run([
    'import pandas as pd, numpy as np',
    'df = pd.DataFrame({"region": ["N", "S", "N", "E"], "sales": [100, 200, 300, 400]})',
    'print(df.groupby("region")["sales"].sum().to_dict())',
    'print(int(df["sales"].sum()), float(df["sales"].mean()), int(np.median(df["sales"])))',
  ].join('\n'))
  assert.equal(r.error, null)
  assert.equal(r.output, "{'E': 400, 'N': 400, 'S': 200}\n1000 250.0 250")
})

test('the data-analysis moves the course teaches: read_csv, merge, missing values, duplicates, pivot, describe', (t) => {
  if (!havePackages(t)) return
  const r = engine.run([
    'import io, pandas as pd',
    'patients = pd.read_csv(io.StringIO("patient_id,ward,age\\n1,A,30\\n2,B,\\n3,A,50\\n3,A,50"))',
    'bills = pd.read_csv(io.StringIO("patient_id,amount\\n1,100\\n3,300\\n9,999"))',
    'print(len(patients), int(patients["age"].isna().sum()), int(patients.duplicated().sum()))',
    'clean = patients.dropna().drop_duplicates()',
    'm = clean.merge(bills, on="patient_id", how="left")',
    'print(len(clean), m["amount"].tolist())',
    'print(pd.pivot_table(m, index="ward", values="amount", aggfunc="sum")["amount"].to_dict())',
    'print(round(float(patients["age"].describe()["mean"]), 1))',
  ].join('\n'))
  assert.equal(r.error, null)
  assert.equal(r.output, '4 1 1\n2 [100, 300]\n{\'A\': 400}\n43.3')
})

test('numpy random with a seed is reproducible (the lessons rely on seed(42))', (t) => {
  if (!havePackages(t)) return
  const r = engine.run('import numpy as np\nnp.random.seed(42)\nprint(np.random.randint(0, 100, 3).tolist())')
  assert.equal(r.error, null)
  assert.equal(r.output, '[51, 92, 14]')
})

test('matplotlib can draw a chart to an image', (t) => {
  if (!havePackages(t)) return
  const r = engine.run([
    'import matplotlib',
    'matplotlib.use("Agg")',
    'import matplotlib.pyplot as plt, io',
    'fig, ax = plt.subplots()',
    'ax.plot([1, 2, 3], [3, 1, 2])',
    'buf = io.BytesIO()',
    'fig.savefig(buf, format="png")',
    'print(buf.getvalue()[:8] == b"\\x89PNG\\r\\n\\x1a\\n", len(buf.getvalue()) > 1000)',
  ].join('\n'))
  assert.equal(r.error, null)
  assert.equal(r.output, 'True True')
})

// The Playground's own starter snippets - the first thing a student presses Run on.
const page = src('src/pages/PythonAcademy.tsx')
const snippets = [...page.matchAll(/label:\s*'([^']+)',\s*\n\s*code:\s*`([^`]*)`/g)].map((m) => ({
  label: m[1],
  code: new Function(`return \`${m[2]}\``)(), // the page keeps them as template literals with \n escapes
}))

test('the Playground offers starter snippets, and none depends on template placeholders', () => {
  assert.ok(snippets.length >= 4, `expected the starter snippets, found ${snippets.length}`)
  for (const s of snippets) {
    assert.ok(s.code.includes('\n'), `${s.label}: should be multi-line`)
    assert.ok(!/\$\{/.test(page.match(new RegExp(`label:\\s*'${s.label}'[\\s\\S]*?code:\\s*\`([^\`]*)\``))[1]), `${s.label}: ` + 'contains ${...}')
  }
})

for (const s of snippets) {
  test(`Playground snippet "${s.label}" runs and prints a result`, (t) => {
    if (!havePackages(t)) return
    const r = engine.run(s.code)
    assert.equal(r.error, null, r.error)
    assert.ok(r.output.trim().length > 0, 'a starter snippet must show something')
  })
}

test('the starter snippets produce the numbers their lessons describe', (t) => {
  if (!havePackages(t)) return
  const by = (label) => snippets.find((s) => s.label === label) || snippets.find((s) => s.label.toLowerCase().includes(label.toLowerCase()))
  const hello = engine.run(by('Hello').code)
  assert.match(hello.output, /Hello, Analyst!/)
  assert.match(hello.output, /Profit: KES 18,000/)

  const sales = snippets.find((s) => s.code.includes('margin_pct'))
  assert.match(engine.run(sales.code).output, /Avg margin: 35\.8%/)

  const messy = snippets.find((s) => s.code.includes('drop_duplicates'))
  const out = engine.run(messy.code).output
  assert.match(out, /Duplicates: 1/)
  assert.match(out, /Cleaned: 1 rows/)

  const eda = snippets.find((s) => s.code.includes('describe()'))
  assert.match(engine.run(eda.code).output, /\(100, 4\)/)
})
