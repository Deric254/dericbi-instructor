/**
 * The one place that starts the Python engine (Pyodide). Everything that runs Python in the app goes through here.
 *
 *  - Core Python only (packages = ''): started from the copy that ships inside the app, so it works offline.
 *    If that copy cannot be reached for any reason, it falls back to the internet copy.
 *  - With packages (pandas, numpy, matplotlib): these are downloaded from the internet copy (cached afterwards).
 *
 * The version below must match the "pyodide" devDependency; a test enforces it.
 */
const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/'
const LOCAL = 'dbi-py://runtime/'

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load the Python engine from ${src}`))
    document.head.appendChild(script)
  })
}

async function start(base: string, packages: string): Promise<any> {
  if (!(window as any).loadPyodide) await addScript(`${base}pyodide.js`)
  const pyodide = await (window as any).loadPyodide({ indexURL: base })
  if (packages) await pyodide.loadPackagesFromImports(packages)
  return pyodide
}

export async function loadPythonEngine(packages: string): Promise<any> {
  if (!packages) {
    try { return await start(LOCAL, '') } catch (err) { console.warn('[Python] bundled engine unavailable, using the internet copy', err) }
  }
  return start(CDN, packages)
}
