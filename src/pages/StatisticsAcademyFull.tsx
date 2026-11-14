import React, { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import '@/lib/monacoLocal'
import { TrendingUp, CheckCircle, ChevronRight, Lock, Brain, Info, Play, Loader } from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'
import LessonTheory from '../components/ui/LessonTheory'
import LessonQuiz from '../components/ui/LessonQuiz'
import { PageError } from '../components/ui/PageState'
import { reportApiError } from '../lib/apiError'
import type { Lesson } from '../types'

// Pyodide hook inline (reused from PythonAcademy pattern)
import { usePyodide } from '../hooks/usePyodide'

export function StatisticsAcademy() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [activeLesson, setActiveLesson] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const { user } = useAuthStore()

  const STAT_TOPICS = [
    { title: 'Descriptive Statistics', desc: 'Mean, median, std, IQR — and when to use each', level: 'beginner', tools: ['Python', 'SQL', 'Excel'] },
    { title: 'Probability Basics', desc: 'Events, distributions, expected values', level: 'beginner', tools: ['Python'] },
    { title: 'Sampling & Distributions', desc: 'Normal, binomial, CLT, confidence intervals', level: 'intermediate', tools: ['Python', 'Excel'] },
    { title: 'Hypothesis Testing', desc: 't-test, chi-square, p-values, alpha levels', level: 'intermediate', tools: ['Python', 'SQL'] },
    { title: 'Correlation Analysis', desc: 'Pearson, Spearman, correlation matrix, causation warning', level: 'intermediate', tools: ['Python', 'SQL', 'Excel'] },
    { title: 'Linear Regression', desc: 'Simple & multiple regression, R², residuals, predictions', level: 'advanced', tools: ['Python', 'Excel'] },
    { title: 'Time Series Basics', desc: 'Trend, seasonality, moving averages', level: 'advanced', tools: ['Python', 'SQL'] },
    { title: 'A/B Testing', desc: 'Experiment design, statistical significance, sample size', level: 'advanced', tools: ['Python'] },
  ]

  useEffect(() => {
    if (!user) return
    loadLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function loadLessons() {
    if (!user) return
    setLoading(true)
    setLoadError(false)
    window.api.lessons.list(user.id, 'statistics')
      .then((d: any) => setLessons(d))
      .catch((err: any) => { reportApiError('load Statistics lessons', err); setLoadError(true) })
      .finally(() => setLoading(false))
  }

  if (loadError && !activeLesson) return <PageError message="Couldn't load the Statistics Academy lessons." onRetry={loadLessons} />

  if (activeLesson) {
    return (
      <StatLessonView
        lesson={activeLesson.lesson}
        exercises={activeLesson.exercises || []}
        onBack={() => {
          setActiveLesson(null)
          loadLessons()
        }}
      />
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--stats-color)' }}>
          <TrendingUp size={16} />
        </div>
        <div>
          <h2>Statistics Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Every concept taught in Python, SQL, and Excel — linked to real business decisions</p>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ padding: '12px 16px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--stats-color)', marginBottom: 24, display: 'flex', gap: 8 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Statistics is taught cross-tool. Each concept shows implementation in Python (NumPy/SciPy), SQL (aggregations), and Excel. This is how senior analysts actually work.</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : lessons.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {lessons.map((lesson: any) => (
              <button key={lesson.id} onClick={lesson.user_status === 'locked' ? undefined : async () => {
                const data = await window.api.lessons.get(user!.id, lesson.id)
                await window.api.lessons.start(user!.id, lesson.id)
                setActiveLesson(data)
              }}
              disabled={lesson.user_status === 'locked'}
              style={{ padding: '14px', borderRadius: 'var(--radius)', border: `1px solid ${lesson.user_status === 'complete' ? 'rgba(167,139,250,0.4)' : 'var(--border)'}`, background: lesson.user_status === 'complete' ? 'rgba(167,139,250,0.06)' : 'var(--bg-surface)', opacity: lesson.user_status === 'locked' ? 0.45 : 1, cursor: lesson.user_status === 'locked' ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%', transition: 'all var(--transition)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{lesson.title}</span>
                  {lesson.user_status === 'complete' ? <CheckCircle size={14} color="var(--stats-color)" /> : lesson.user_status === 'locked' ? <Lock size={13} color="var(--text-muted)" /> : <ChevronRight size={14} />}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>{lesson.description}</p>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {lesson.estimated_min}m</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {STAT_TOPICS.map((t, i) => (
              <div key={i} className="card" style={{ opacity: 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                  <Lock size={12} color="var(--text-muted)" />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>{t.desc}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: t.level === 'beginner' ? 'var(--success)' : t.level === 'intermediate' ? 'var(--python-color)' : 'var(--powerbi-color)', background: (t.level === 'beginner' ? 'var(--success)' : t.level === 'intermediate' ? 'var(--python-color)' : 'var(--powerbi-color)') + '20', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>{t.level}</span>
                  {t.tools.map(tool => <span key={tool} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-overlay)', color: 'var(--text-muted)', fontWeight: 600 }}>{tool}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatLessonView({ lesson, exercises, onBack }: { lesson: any; exercises: any[]; onBack: () => void }) {
  const { user } = useAuthStore()
  const [activeEx, setActiveEx] = useState(0)
  const [showInstructor, setShowInstructor] = useState(true)
  const startRef = useRef(Date.now())

  const handleComplete = async () => {
    if (!user) return
    try {
      await window.api.lessons.complete(user.id, lesson.id, Math.floor((Date.now() - startRef.current) / 1000))
      notify.success('Lesson complete!', lesson.title)
      onBack()
    } catch (err) {
      reportApiError('save your lesson progress', err)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>← Back</button>
        <h3 style={{ color: 'var(--stats-color)' }}>{lesson.title}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {exercises.length === 0 && (
            <button onClick={() => setShowInstructor(v => !v)} className="btn btn-secondary btn-sm"><Brain size={12} /> Instructor</button>
          )}
          <button onClick={handleComplete} className="btn btn-primary btn-sm"><CheckCircle size={12} /> Complete</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', padding: 16 }}>
          <LessonTheory markdown={lesson.theory_md} />
          <LessonQuiz quizJson={lesson.quiz} accentColor="var(--stats-color)" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {exercises.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 4, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', overflowX: 'auto', flexShrink: 0 }}>
                {exercises.map((ex: any, i: number) => (
                  <button key={ex.id} onClick={() => setActiveEx(i)} style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', border: `1px solid ${activeEx === i ? 'var(--stats-color)' : 'var(--border)'}`, background: activeEx === i ? 'rgba(167,139,250,0.15)' : 'transparent', color: activeEx === i ? 'var(--stats-color)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}>
                    Ex {i + 1}
                  </button>
                ))}
              </div>
              <StatExercise exercise={exercises[activeEx]} />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No exercises yet.</div>
          )}
        </div>
        {showInstructor && exercises.length === 0 && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <InstructorPanel context={{ type: 'lesson', lesson: lesson.title }} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatExercise({ exercise }: { exercise: any }) {
  const { user } = useAuthStore()
  const { status, loadRuntime, runCode } = usePyodide()
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [isError, setIsError] = useState(false)
  const [running, setRunning] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [lastRunCode, setLastRunCode] = useState<string | null>(null)

  useEffect(() => { if (status === 'idle') loadRuntime(); setCode(''); setOutput(''); setHint(null); setHintsUsed(0); setLastRunCode(null) }, [exercise?.id])

  const run = async () => {
    if (!code.trim() || status !== 'ready') return
    setRunning(true)
    const r = await runCode(code)
    setOutput(r.output || r.error || '(no output)')
    setIsError(!!r.error)
    setRunning(false)
    if (user) {
      window.api.exercises.submit({ userId: user.id, exerciseId: exercise.id, answer: code, timeSpentS: 30 })
        .catch((err: any) => reportApiError('save your progress', err))
    }
  }

  const getHint = async () => {
    if (hintsUsed >= 3) return
    try {
      const res = await window.api.exercises.hint(exercise.id, hintsUsed + 1)
      if (res.hint) { setHint(res.hint); setHintsUsed(h => h + 1) }
    } catch (err) {
      reportApiError('get a hint', err)
    }
  }

  if (!exercise) return null
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{exercise.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{exercise.prompt}</div>
          {hint && <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--warning-dim)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--warning)' }}>💡 {hint}</div>}
        </div>
        <div style={{ flex: '0 0 50%', borderBottom: '1px solid var(--border)' }}>
          <Editor height="100%" language="python" value={code} onChange={v => setCode(v ?? '')} theme="vs-dark" options={{ fontSize: 13, fontFamily: 'var(--font-mono)', minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 10 }, tabSize: 4 }} />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', background: '#0d1117', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: isError ? 'var(--error)' : '#a5d6a7', whiteSpace: 'pre-wrap' }}>
          {output || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Output appears here…</span>}
        </div>
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button className="btn btn-primary btn-sm" onClick={async () => { await run(); setLastRunCode(code) }} disabled={running || status !== 'ready' || !code.trim()}>
            {running ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
            {status === 'loading' ? 'Loading…' : running ? 'Running…' : 'Run ▶'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={getHint} disabled={hintsUsed >= 3}>💡 Hint {hintsUsed > 0 ? `(${hintsUsed}/3)` : ''}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCode('')}>Reset</button>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: status === 'ready' ? 'var(--success)' : 'var(--text-muted)' }}>● {status === 'ready' ? 'Python ready' : status}</span>
        </div>
      </div>

      {/* AI Instructor — kicks in automatically after every run, since there's
          no single mechanical "correct" output to check freeform code against. */}
      <div style={{ width: 290, flexShrink: 0 }}>
        <InstructorPanel
          context={{ type: 'exercise', lesson: 'statistics', exercise: exercise.title }}
          initialPrompt={
            lastRunCode
              ? `This is an open-ended stats/Python exercise with no single correct answer format. Exercise: ${exercise.prompt}\n\nMy code:\n${lastRunCode}\n\nOutput:\n${output || '(no output)'}\n\nAssess whether my approach and result are sound. If something's off, guide me without giving the full solution. If it's solid, briefly affirm it and suggest one way to extend the analysis.`
              : undefined
          }
        />
      </div>
    </div>
  )
}
