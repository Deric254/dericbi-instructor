import { useState, useCallback, useRef } from 'react'
import { runPythonCaptured, type PythonRunResult } from '../lib/pythonRunner'

type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error'

export function usePyodide() {
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const pyodideRef = useRef<any>(null)

  const loadRuntime = useCallback(async () => {
    if (pyodideRef.current || status === 'loading' || status === 'ready') return
    setStatus('loading')

    try {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load Pyodide'))
          document.head.appendChild(script)
        })
      }

      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
      })

      // Pre-load analytics packages
      await pyodide.loadPackagesFromImports('import pandas, numpy')

      pyodideRef.current = pyodide
      setStatus('ready')
    } catch (err: any) {
      console.error('[Pyodide]', err)
      setStatus('error')
    }
  }, [status])

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

  return { status, loadRuntime, runCode }
}
