import { useState, useCallback, useRef } from 'react'

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

  const runCode = useCallback(async (code: string): Promise<{
    output: string
    error: string | null
    exec_ms: number
  }> => {
    if (!pyodideRef.current) {
      return { output: '', error: 'Python runtime not loaded.', exec_ms: 0 }
    }

    setStatus('running')
    const start = Date.now()

    try {
      pyodideRef.current.runPython(`
import sys, io
_stdout = io.StringIO()
_stderr = io.StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
      `)

      let returnValue: any = undefined
      try {
        returnValue = pyodideRef.current.runPython(code)
      } catch (err: any) {
        pyodideRef.current.runPython(`sys.stdout = sys.__stdout__\nsys.stderr = sys.__stderr__`)
        setStatus('ready')
        return { output: '', error: err.message, exec_ms: Date.now() - start }
      }

      const stdout = pyodideRef.current.runPython('_stdout.getvalue()')
      const stderr = pyodideRef.current.runPython('_stderr.getvalue()')
      pyodideRef.current.runPython(`sys.stdout = sys.__stdout__\nsys.stderr = sys.__stderr__`)

      const parts = [stdout]
      if (returnValue !== undefined && returnValue !== null && typeof returnValue !== 'undefined') {
        const s = String(returnValue)
        if (s !== 'undefined' && s !== 'None') parts.push(s)
      }

      setStatus('ready')
      return {
        output: parts.filter(Boolean).join('\n').trim(),
        error: stderr || null,
        exec_ms: Date.now() - start,
      }
    } catch (err: any) {
      setStatus('ready')
      return { output: '', error: err.message, exec_ms: Date.now() - start }
    }
  }, [])

  return { status, loadRuntime, runCode }
}
