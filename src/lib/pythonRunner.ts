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

/**
 * Runs a graded Python practical, the way a real test suite would:
 *   setup  - hidden code that defines the practice data (rows, events ...). The student's code can use it.
 *   code   - what the student wrote. Its own print() output is shown to them.
 *   check  - hidden code that calls what the student defined (their function) on fixed inputs and prints results.
 * All three run in one fresh namespace, so nothing leaks between exercises. Only the check output is graded.
 * A time limit stops an endless loop (`while True`) instead of freezing the app.
 */
export interface PythonGradedRun {
  /** What the student's own code printed (shown to them). */
  output: string
  /** What the hidden check printed (this is what gets graded). */
  checkOutput: string
  /** Set when the student's code (or the check calling it) raised an error, in plain words. */
  error: string | null
  exec_ms: number
}

export const PRACTICAL_SECONDS = 5

const EXEC_IN_SHARED_NAMESPACE = `
import sys, time
def _dbi_exec():
    ns = globals().setdefault('_dbi_ns', {'__name__': '__main__'})
    code = compile(_dbi_src, '<your code>', 'exec')
    if _dbi_limited:
        deadline = time.time() + ${PRACTICAL_SECONDS}
        def guard(frame, event, arg):
            if time.time() > deadline:
                sys.settrace(None)
                raise TimeoutError('This ran for more than ${PRACTICAL_SECONDS} seconds. Is there a loop that never ends?')
            return guard
        sys.settrace(guard)
    try:
        exec(code, ns)
    finally:
        sys.settrace(None)
_dbi_exec()
`

/** The last line of a Python traceback, plus the line of the student's code it happened on. */
export function friendlyPythonError(traceback: string): string {
  const lines = traceback.trim().split('\n').map(l => l.trimEnd()).filter(Boolean)
  const last = lines[lines.length - 1] || 'The code could not run'
  const at = [...lines].reverse().map(l => /File "<your code>", line (\d+)/.exec(l)).find(Boolean)
  return at ? `${last} (line ${at[1]})` : last
}

export function runPythonGraded(pyodide: any, parts: { setup?: string; code: string; check?: string }): PythonGradedRun {
  const start = Date.now()
  const step = (source: string, limited: boolean) => {
    pyodide.globals.set('_dbi_src', source)
    pyodide.globals.set('_dbi_limited', limited)
    return runPythonCaptured(pyodide, EXEC_IN_SHARED_NAMESPACE)
  }
  const wipe = () => { try { pyodide.globals.delete('_dbi_ns') } catch { /* nothing to clear */ } }
  const elapsed = () => Date.now() - start

  wipe()
  try {
    if (parts.setup) {
      const s = step(parts.setup, false)
      if (s.error) return { output: '', checkOutput: '', error: `The exercise set-up failed: ${friendlyPythonError(s.error)}`, exec_ms: elapsed() }
    }
    const mine = step(parts.code, true)
    if (mine.error) return { output: mine.output, checkOutput: '', error: friendlyPythonError(mine.error), exec_ms: elapsed() }
    if (!parts.check) return { output: mine.output, checkOutput: mine.output, error: null, exec_ms: elapsed() }
    const checked = step(parts.check, true)
    return {
      output: mine.output,
      checkOutput: checked.output,
      error: checked.error ? `The tests could not use your code: ${friendlyPythonError(checked.error).replace(/ \(line \d+\)$/, '')}` : null,
      exec_ms: elapsed(),
    }
  } finally {
    wipe()
  }
}
