'use strict'
// Pyodide in Node cannot load from an https:// address - it reads files from a folder. So to test pandas/numpy/matplotlib
// with the SAME Pyodide release the app uses, this builds a local folder: the core files that ship in the npm package,
// plus the package wheels downloaded from the same CDN release the app downloads from (every wheel is verified against the
// SHA-256 recorded in Pyodide's own lockfile). Downloads are cached, so only the first run needs the internet.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function download(url, attempts = 3) {
  let lastError
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) { lastError = e }
  }
  throw lastError
}

/** Returns the folder to pass to loadPyodide({ indexURL }). Throws if a download fails or a checksum does not match. */
async function preparePyodideDir({ cdnBase, cacheDir, packages }) {
  const pkgDir = path.dirname(require.resolve('pyodide/package.json'))
  const lock = JSON.parse(fs.readFileSync(path.join(pkgDir, 'pyodide-lock.json'), 'utf8'))

  // every wheel needed = the packages plus everything they depend on
  const wanted = new Map()
  const walk = (name) => {
    const key = name.toLowerCase()
    if (wanted.has(key)) return
    const entry = lock.packages[key]
    if (!entry) throw new Error(`"${name}" is not in this Pyodide release's package list`)
    wanted.set(key, entry)
    ;(entry.depends || []).forEach(walk)
  }
  packages.forEach(walk)

  fs.mkdirSync(cacheDir, { recursive: true })
  for (const f of fs.readdirSync(pkgDir)) {
    const from = path.join(pkgDir, f)
    if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(cacheDir, f))
  }

  for (const [name, entry] of wanted) {
    const target = path.join(cacheDir, entry.file_name)
    const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
    if (fs.existsSync(target) && sha(fs.readFileSync(target)) === entry.sha256) continue // cached and intact
    const data = await download(cdnBase + entry.file_name)
    if (sha(data) !== entry.sha256) throw new Error(`${name}: downloaded file does not match the checksum in pyodide-lock.json`)
    fs.writeFileSync(target, data)
  }
  return cacheDir
}

module.exports = { preparePyodideDir }
