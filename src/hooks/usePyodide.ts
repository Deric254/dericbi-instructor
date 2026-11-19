import { useState, useCallback, useRef } from 'react'
import { loadPythonEngine } from '../lib/pyodideLoader'
import { runPythonCaptured, runPythonGraded, type PythonRunResult, type PythonGradedRun } from '../lib/pythonRunner'

type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error'

/** `packages`: Python imports to pre-load. Pass '' for the core language only (starts faster, nothing extra to download). */
export function usePyodide(packages = 'import pandas, numpy') {
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const pyodideRef = useRef<any>(null)

  const loadRuntime = useCallback(async () => {
    if (pyodideRef.current || status === 'loading' || status === 'ready') return
    setStatus('loading')

    try {
      const pyodide = await loadPythonEngine(packages)

      pyodideRef.current = pyodide
      setStatus('ready')
    } catch (err: any) {
      console.error('[Pyodide]', err)
      setStatus('error')
    }
  }, [status, packages])

  const runCode = useCallback(async (code: string): Promise<PythonRunResult> => {
    if (!pyodideRef.current) {
      return { output: '', error: 'Python runtime not loaded.', exec_ms: 0 }
    }
    setStatus('running')
    try {
      return runPythonCaptured(pyodideRef.current, code)
    } finally {
      setStatus('ready')
    }
  }, [])

  const runGraded = useCallback(async (parts: { setup?: string; code: string; check?: string }): Promise<PythonGradedRun> => {
    if (!pyodideRef.current) return { output: '', checkOutput: '', error: 'Python runtime not loaded.', exec_ms: 0 }
    setStatus('running')
    try {
      return runPythonGraded(pyodideRef.current, parts)
    } finally {
      setStatus('ready')
    }
  }, [])

  return { status, loadRuntime, runCode, runGraded }
}
