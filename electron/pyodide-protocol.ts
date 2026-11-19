// Serves the Python engine (Pyodide core) from inside the app, so Python practicals work with no internet.
// The renderer asks for  dbi-py://runtime/<file>;  only the five core files can ever be served.
import fs from 'fs'
import path from 'path'

export const PY_SCHEME = 'dbi-py'

const TYPES: Record<string, string> = {
  'pyodide.js': 'text/javascript',
  'pyodide.asm.js': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

/** Where the core files live: next to the built interface when packaged, in node_modules while developing. */
export function pyodideDirs(appRoot: string): string[] {
  return [path.join(appRoot, 'dist', 'pyodide'), path.join(appRoot, 'node_modules', 'pyodide')]
}

/** The absolute path of an allowed file, or null for anything else (unknown names, traversal, odd characters). */
export function resolvePyodideFile(requestUrl: string, appRoot: string): { file: string; type: string } | null {
  let name: string
  try {
    const u = new URL(requestUrl)
    if (u.protocol !== `${PY_SCHEME}:` || u.hostname !== 'runtime') return null
    name = decodeURIComponent(u.pathname.replace(/^\//, ''))
  } catch { return null }
  if (!Object.prototype.hasOwnProperty.call(TYPES, name)) return null
  for (const dir of pyodideDirs(appRoot)) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return { file, type: TYPES[name] }
  }
  return null
}
