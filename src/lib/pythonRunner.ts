/**
 * Runs Python in an already-loaded Pyodide and returns what the student should see.
 * Shared by the Python Academy and the Statistics Academy (previously two diverging copies).
 *
 *  - print() output and the value of the last expression are returned as `output`
 *  - anything written to stderr, or an uncaught exception, comes back as `error`
 *  - stdout/stderr are always restored, even when the code fails
 *
 * Why it reads the stderr buffer on failure: while sys.stderr is redirected (to capture it), Pyodide
 * writes the traceback INTO that buffer and leaves the JavaScript error's `message` empty. Returning
 * `err.message` alone therefore showed students a blank result for every typo and NameError.
 */
export interface PythonRunResult {
  output: string
  error: string | null
  exec_ms: number
}

const RESTORE = 'sys.stdout = sys.__stdout__\nsys.stderr = sys.__stderr__'

export function runPythonCaptured(pyodide: any, code: string): PythonRunResult {
  const start = Date.now()
  const read = (name: string): string => {
    try { return String(pyodide.runPython(`${name}.getvalue()`) ?? '') } catch { return '' }
  }

  try {
    pyodide.runPython('import sys, io\n_stdout_capture = io.StringIO()\n_stderr_capture = io.StringIO()\nsys.stdout = _stdout_capture\nsys.stderr = _stderr_capture')

    let value: any
    try {
      value = pyodide.runPython(code)
    } catch (err: any) {
      const printed = read('_stdout_capture')
      const traceback = read('_stderr_capture')
      pyodide.runPython(RESTORE)
      const message = (err?.message || traceback || `${err?.type || 'Error'}: the code could not run`).trim()
      return { output: printed.trim(), error: message, exec_ms: Date.now() - start }
    }

    const stdout = read('_stdout_capture')
    const stderr = read('_stderr_capture')
    pyodide.runPython(RESTORE)

    const parts = [stdout]
    if (value !== undefined && value !== null) {
      const s = String(value)
      if (s !== 'undefined' && s !== 'None') parts.push(s)
    }
    return { output: parts.filter(Boolean).join('\n').trim(), error: stderr || null, exec_ms: Date.now() - start }
  } catch (err: any) {
    try { pyodide.runPython(RESTORE) } catch {}
    return { output: '', error: err?.message || 'Python runtime error', exec_ms: Date.now() - start }
  }
}
