// Grades a Python practical. The code itself runs in the app's Python (Pyodide, in the renderer); the main process
// owns the answer key and the verdict, so a result is always judged against the stored expected output.

export interface PythonRun { checkOutput?: unknown; error?: unknown }
export interface PythonKey { output?: string; must_have?: string[] }

const normalise = (s: string) => s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim()

export interface PythonVerdict { correct: boolean; score: number; feedback: string }

export function gradePythonOutput(code: string, run: PythonRun | undefined, key: PythonKey | null): PythonVerdict {
  const fail = (feedback: string): PythonVerdict => ({ correct: false, score: 0, feedback })
  if (!key || typeof key.output !== 'string') return fail('This exercise has no answer key yet.')
  if (typeof code !== 'string' || !code.trim()) return fail('Write some code first, then press Run.')
  if (!run || typeof run.checkOutput !== 'string') return fail('Press Run so your code can be tested.')
  if (run.error) return fail(String(run.error))

  for (const rule of key.must_have ?? []) {
    let re: RegExp
    try { re = new RegExp(rule) } catch { continue }
    if (!re.test(code)) return fail('Your output is not enough here: the exercise asks you to write the logic yourself (for example with a function). Re-read the task.')
  }

  const want = normalise(key.output).split('\n')
  const got = normalise(run.checkOutput).split('\n')
  if (want.length === got.length && want.every((l, i) => l === got[i])) return { correct: true, score: 100, feedback: 'All tests passed.' }

  const at = want.findIndex((l, i) => l !== got[i])
  const i = at === -1 ? Math.min(want.length, got.length) : at
  return fail(
    `The tests did not pass. Test line ${i + 1}: expected "${want[i] ?? '(nothing)'}" but your code gave "${got[i] ?? '(nothing)'}".` +
    (want.length !== got.length ? ` (Expected ${want.length} lines, got ${got.length}.)` : '')
  )
}
