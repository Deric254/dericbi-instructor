import React, { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Terminal, Play, BookOpen, RotateCcw, Loader, CheckCircle,
  AlertCircle, Lightbulb, ChevronRight, Download, Star,
  Cpu, Zap,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import LessonTheory from '../components/ui/LessonTheory'
import LessonQuiz from '../components/ui/LessonQuiz'
import { PageError } from '../components/ui/PageState'
import { reportApiError } from '../lib/apiError'
import type { Lesson } from '../types'

type View = 'lessons' | 'playground'
type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error'

// ─────────────────────────────────────────────
// PYODIDE RUNTIME HOOK
// Loads Pyodide once, exposes runCode()
// ─────────────────────────────────────────────

function usePyodide() {
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const pyodideRef = useRef<any>(null)

  const loadRuntime = useCallback(async () => {
    if (pyodideRef.current || status === 'loading') return
    setStatus('loading')

    try {
      // Inject Pyodide CDN script if not already present
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load Pyodide script'))
          document.head.appendChild(script)
        })
      }

      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
      })

      // Pre-install common packages
      await pyodide.loadPackagesFromImports('import pandas, numpy, matplotlib')

      pyodideRef.current = pyodide
      setStatus('ready')
    } catch (err: any) {
      console.error('[Pyodide]', err)
      setStatus('error')
    }
  }, [status])

  const runCode = useCallback(async (code: string): Promise<{
    output: string; error: string | null; exec_ms: number
  }> => {
    if (!pyodideRef.current) {
      return { output: '', error: 'Python runtime not loaded.', exec_ms: 0 }
    }

    setStatus('running')
    const start = Date.now()

    try {
      // Redirect stdout/stderr
      pyodideRef.current.runPython(`
import sys, io
_stdout_capture = io.StringIO()
_stderr_capture = io.StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
      `)

      let result = ''
      try {
        const out = pyodideRef.current.runPython(code)
        if (out !== undefined && out !== null) {
          result = String(out)
        }
      } catch (err: any) {
        // Restore stdout before reading error
        pyodideRef.current.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
        `)
        setStatus('ready')
        return { output: '', error: err.message, exec_ms: Date.now() - start }
      }

      const stdout = pyodideRef.current.runPython('_stdout_capture.getvalue()')
      const stderr = pyodideRef.current.runPython('_stderr_capture.getvalue()')

      // Restore
      pyodideRef.current.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
      `)

      const output = [stdout, result].filter(Boolean).join('\n').trim()
      setStatus('ready')
      return {
        output,
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

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function PythonAcademy() {
  const [view, setView] = useState<View>('lessons')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const { user } = useAuthStore()

  const loadLessons = useCallback(() => {
    if (!user) return
    setLoading(true)
    setLoadError(false)
    window.api.lessons.list(user.id, 'python')
      .then((data: any) => setLessons(data))
      .catch((err) => { reportApiError('load Python lessons', err); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [user])

  useEffect(loadLessons, [loadLessons])

  if (loadError) return <PageError message="Couldn't load the Python Academy lessons." onRetry={loadLessons} />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius)',
          background: 'rgba(250,204,21,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--python-color)',
        }}>
          <Terminal size={16} />
        </div>
        <div>
          <h2 style={{ color: 'var(--text-primary)' }}>Python Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Real Python execution via Pyodide — Pandas, NumPy, Matplotlib in-browser
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <TabBtn active={view === 'lessons'} color="var(--python-color)" onClick={() => setView('lessons')}>
            <BookOpen size={13} /> Lessons
          </TabBtn>
          <TabBtn active={view === 'playground'} color="var(--python-color)" onClick={() => setView('playground')}>
            <Terminal size={13} /> Playground
          </TabBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'lessons' && (
          <LessonList
            lessons={lessons}
            loading={loading}
            onOpen={(id) => { setActiveLessonId(id); setView('playground') }}
          />
        )}
        {view === 'playground' && (
          <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
            {activeLessonId && (
              <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <button onClick={() => { setActiveLessonId(null); setView('lessons') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 10 }}>
                    ← Back to lessons
                  </button>
                  <h3 style={{ color: 'var(--python-color)' }}>
                    {lessons.find(l => l.id === activeLessonId)?.title}
                  </h3>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                  <LessonTheory markdown={lessons.find(l => l.id === activeLessonId)?.theory_md ?? ''} />
                  <LessonQuiz quizJson={lessons.find(l => l.id === activeLessonId)?.quiz} accentColor="var(--python-color)" />
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
                    if (!user || !activeLessonId) return
                    try {
                      await window.api.lessons.complete(user.id, activeLessonId, 0)
                      notify.success('Lesson marked complete!')
                    } catch (err) {
                      reportApiError('mark this lesson complete', err)
                    }
                  }}>
                    <CheckCircle size={14} /> Mark Complete
                  </button>
                </div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <PythonPlayground contextLessonId={activeLessonId ?? undefined} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LESSON LIST
// ─────────────────────────────────────────────

function LessonList({ lessons, loading, onOpen }: {
  lessons: Lesson[]; loading: boolean; onOpen: (id: string) => void
}) {
  if (loading) return <CenteredSpinner />

  const grouped = groupByLevel(lessons)

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {lessons.length === 0 && (
        <EmptyState
          icon={<Terminal size={32} />}
          title="No Python lessons yet"
          desc="Python lessons will appear here once content is seeded."
        />
      )}
      {Object.entries(grouped).map(([level, items]) => (
        <div key={level} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: levelColor(level),
              background: `${levelColor(level)}20`,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {level}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {items.filter(l => l.user_status === 'complete').length}/{items.length} complete
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {items.map(lesson => (
              <LessonCard key={lesson.id} lesson={lesson} onClick={() => onOpen(lesson.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const locked = lesson.user_status === 'locked'
  const complete = lesson.user_status === 'complete'
  const inProgress = lesson.user_status === 'in_progress'

  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        padding: '14px', borderRadius: 'var(--radius)', width: '100%', textAlign: 'left',
        border: `1px solid ${complete ? 'rgba(250,204,21,0.3)' : inProgress ? 'rgba(250,204,21,0.2)' : 'var(--border)'}`,
        background: complete ? 'rgba(250,204,21,0.06)' : 'var(--bg-surface)',
        opacity: locked ? 0.45 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
            {lesson.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {lesson.description}
          </div>
        </div>
        <div style={{ color: complete ? 'var(--python-color)' : 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
          {complete ? <CheckCircle size={14} /> : locked ? '🔒' : <ChevronRight size={14} />}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {lesson.estimated_min}m</span>
        {inProgress && <span style={{ fontSize: 10, color: 'var(--python-color)', fontWeight: 600 }}>In Progress</span>}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// PYTHON PLAYGROUND
// ─────────────────────────────────────────────

const STARTER_SNIPPETS = [
  {
    label: 'Hello Python',
    code: `# Your first Python in DericBI\nprint("Hello, Analyst!")\n\n# Simple arithmetic\nrevenue = 50000\nexpenses = 32000\nprofit = revenue - expenses\nprint(f"Profit: KES {profit:,}")`,
  },
  {
    label: 'Pandas Basics',
    code: `import pandas as pd\nimport numpy as np\n\n# Create a sample dataset\ndata = {\n    'month': ['Jan', 'Feb', 'Mar', 'Apr', 'May'],\n    'sales': [12000, 15000, 11000, 18000, 22000],\n    'expenses': [8000, 9500, 7800, 11000, 13000]\n}\n\ndf = pd.DataFrame(data)\ndf['profit'] = df['sales'] - df['expenses']\ndf['margin_pct'] = (df['profit'] / df['sales'] * 100).round(1)\n\nprint(df.to_string(index=False))\nprint(f"\\nAvg margin: {df['margin_pct'].mean():.1f}%")`,
  },
  {
    label: 'Data Cleaning',
    code: `import pandas as pd\nimport numpy as np\n\n# Simulate messy data\ndf = pd.DataFrame({\n    'name': ['Alice', None, 'Bob', 'Alice', 'Carol'],\n    'sales': [1200, 800, None, 1200, 950],\n    'region': ['North', 'South', 'North', 'North', None]\n})\n\nprint("=== Raw Data ===")\nprint(df)\nprint(f"\\nNull counts:\\n{df.isnull().sum()}")\nprint(f"\\nDuplicates: {df.duplicated().sum()}")\n\n# Clean\ndf_clean = df.dropna().drop_duplicates()\nprint(f"\\n=== Cleaned: {len(df_clean)} rows ===")\nprint(df_clean)`,
  },
  {
    label: 'EDA Template',
    code: `import pandas as pd\nimport numpy as np\n\n# Simulate a sales dataset\nnp.random.seed(42)\nn = 100\ndf = pd.DataFrame({\n    'sales': np.random.normal(50000, 12000, n).round(2),\n    'units': np.random.randint(10, 200, n),\n    'region': np.random.choice(['North', 'South', 'East', 'West'], n),\n    'category': np.random.choice(['A', 'B', 'C'], n)\n})\n\nprint("=== Shape ===")\nprint(df.shape)\n\nprint("\\n=== Describe ===")\nprint(df.describe().round(1))\n\nprint("\\n=== By Region ===")\nprint(df.groupby('region')['sales'].agg(['mean','sum','count']).round(2))`,
  },
]

function PythonPlayground({ contextLessonId }: { contextLessonId?: string }) {
  const { user } = useAuthStore()
  const { status, loadRuntime, runCode } = usePyodide()
  const [code, setCode] = useState(STARTER_SNIPPETS[0].code)
  const [output, setOutput] = useState<{ text: string; type: 'output' | 'error' | 'info' }[]>([])
  const [activeSnippet, setActiveSnippet] = useState(0)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRuntime()
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleRun = async () => {
    if (status !== 'ready' || !code.trim()) return

    const startMsg = `>>> Running... (${new Date().toLocaleTimeString()})`
    setOutput(prev => [...prev, { text: startMsg, type: 'info' }])

    const result = await runCode(code)

    if (result.error) {
      setOutput(prev => [...prev, { text: result.error!, type: 'error' }])
    } else {
      const out = result.output || '(no output)'
      setOutput(prev => [...prev, { text: out, type: 'output' }])
    }
    setOutput(prev => [...prev, { text: `Executed in ${result.exec_ms}ms`, type: 'info' }])

    // Save to history
    if (user) {
      // IPC call to log python history would go here
    }
  }

  const loadSnippet = (idx: number) => {
    setActiveSnippet(idx)
    setCode(STARTER_SNIPPETS[idx].code)
  }

  const clearOutput = () => setOutput([])

  const RuntimeBadge = () => {
    const color = status === 'ready' ? 'var(--success)'
      : status === 'loading' ? 'var(--python-color)'
      : status === 'running' ? 'var(--accent)'
      : status === 'error' ? 'var(--error)'
      : 'var(--text-muted)'

    const label = status === 'ready' ? 'Runtime Ready'
      : status === 'loading' ? 'Loading Pyodide…'
      : status === 'running' ? 'Executing…'
      : status === 'error' ? 'Runtime Error'
      : 'Not Loaded'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color,
          boxShadow: status === 'ready' ? `0 0 6px ${color}` : 'none' }} />
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>{label}</span>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '6px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleRun}
          disabled={status !== 'ready' || !code.trim()}
        >
          {status === 'running'
            ? <><Loader size={12} className="animate-spin" /> Running…</>
            : <><Play size={12} /> Run  ▶</>}
        </button>

        {status === 'idle' && (
          <button className="btn btn-secondary btn-sm" onClick={loadRuntime}>
            <Cpu size={12} /> Load Python
          </button>
        )}

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

        {/* Snippets */}
        {STARTER_SNIPPETS.map((s, i) => (
          <button
            key={i}
            onClick={() => loadSnippet(i)}
            style={{
              padding: '3px 9px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${activeSnippet === i ? 'var(--python-color)' : 'var(--border)'}`,
              background: activeSnippet === i ? 'rgba(250,204,21,0.12)' : 'transparent',
              color: activeSnippet === i ? 'var(--python-color)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {s.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <RuntimeBadge />
          <button className="btn btn-ghost btn-sm" onClick={clearOutput}>
            <RotateCcw size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Editor + output split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor */}
        <div style={{ flex: 1, borderRight: '1px solid var(--border)' }}>
          <Editor
            height="100%"
            language="python"
            value={code}
            onChange={v => setCode(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: 'on',
              suggestOnTriggerCharacters: true,
              tabSize: 4,
            }}
          />
        </div>

        {/* Output terminal */}
        <div style={{
          width: 400, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: '#0d1117',
        }}>
          <div style={{
            padding: '6px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Output
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {output.length} lines
            </span>
          </div>
          <div
            ref={outputRef}
            style={{
              flex: 1, overflow: 'auto', padding: '10px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
            }}
          >
            {output.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Output will appear here…
              </span>
            )}
            {output.map((line, i) => (
              <div key={i} style={{
                color: line.type === 'error' ? 'var(--error)'
                  : line.type === 'info' ? 'var(--text-muted)'
                  : '#a5d6a7',
                marginBottom: 2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
                {line.text}
              </div>
            ))}
          </div>

          {/* Pyodide notice */}
          {status === 'loading' && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--python-color)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Loader size={12} className="animate-spin" />
              Loading Python runtime (first run may take ~10s)…
            </div>
          )}
          {status === 'error' && (
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--error)',
            }}>
              ⚠ Pyodide failed to load. Check your internet connection or use local Python.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────

function TabBtn({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 'var(--radius)',
      border: `1px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}18` : 'transparent',
      color: active ? color : 'var(--text-muted)',
      cursor: 'pointer', fontSize: 12, fontWeight: 500,
    }}>
      {children}
    </button>
  )
}

function CenteredSpinner() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12 }}>{desc}</div>
    </div>
  )
}

function groupByLevel(lessons: Lesson[]) {
  const order = ['beginner', 'intermediate', 'advanced', 'expert']
  const grouped: Record<string, Lesson[]> = {}
  for (const l of lessons) {
    if (!grouped[l.level]) grouped[l.level] = []
    grouped[l.level].push(l)
  }
  return Object.fromEntries(order.filter(k => grouped[k]).map(k => [k, grouped[k]]))
}

function levelColor(level: string) {
  return level === 'beginner' ? 'var(--success)'
    : level === 'intermediate' ? 'var(--python-color)'
    : level === 'advanced' ? 'var(--powerbi-color)'
    : 'var(--epic)'
}
