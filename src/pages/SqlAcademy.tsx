import React, { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Database, Play, ChevronRight, Lock, CheckCircle, Circle,
  Clock, BookOpen, Lightbulb, X, Loader, AlertCircle,
  ChevronDown, RotateCcw, HelpCircle, MessageSquare, Star,
  Brain,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'
import LessonTheory from '../components/ui/LessonTheory'
import LessonQuiz from '../components/ui/LessonQuiz'
import { useInstructor } from '../hooks/useInstructor'
import type { Lesson, SqlResult } from '../types'

type View = 'lessons' | 'lesson' | 'playground'

export default function SqlAcademy() {
  const [view, setView] = useState<View>('lessons')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user) return
    window.api.lessons.list(user.id, 'sql').then((data: any) => {
      setLessons(data)
      setLoading(false)
    })
  }, [user])

  const openLesson = (id: string) => {
    setActiveLessonId(id)
    setView('lesson')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius)',
          background: 'rgba(34,211,238,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--sql-color)',
        }}>
          <Database size={16} />
        </div>
        <div>
          <h2 style={{ color: 'var(--text-primary)' }}>SQL Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            From SELECT to window functions — real execution on real data
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <TabBtn active={view === 'lessons'} onClick={() => setView('lessons')}>
            <BookOpen size={13} /> Lessons
          </TabBtn>
          <TabBtn active={view === 'playground'} onClick={() => setView('playground')}>
            <Play size={13} /> Playground
          </TabBtn>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'lessons' && (
          <LessonList lessons={lessons} loading={loading} onOpen={openLesson} />
        )}
        {view === 'lesson' && activeLessonId && (
          <LessonView
            lessonId={activeLessonId}
            onBack={() => setView('lessons')}
            onComplete={() => {
              setView('lessons')
              // Refresh lessons
              if (user) window.api.lessons.list(user.id, 'sql').then(setLessons)
            }}
          />
        )}
        {view === 'playground' && <SqlPlayground />}
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
          icon={<Database size={32} />}
          title="No SQL lessons yet"
          desc="Lessons will appear here once the content is seeded."
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
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
        padding: '14px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${complete ? 'var(--success)' + '40' : inProgress ? 'var(--accent)' + '40' : 'var(--border)'}`,
        background: complete ? 'rgba(34,197,94,0.06)' : inProgress ? 'var(--accent-dim)' : 'var(--bg-surface)',
        opacity: locked ? 0.45 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        transition: 'all var(--transition)',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
            {lesson.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {lesson.description}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginLeft: 8, color: complete ? 'var(--success)' : locked ? 'var(--text-muted)' : 'var(--accent)' }}>
          {locked ? <Lock size={14} /> : complete ? <CheckCircle size={14} /> : <Circle size={14} />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} /> {lesson.estimated_min}m
        </span>
        {inProgress && (
          <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>In Progress</span>
        )}
        {complete && lesson.completed_at && (
          <span style={{ fontSize: 10, color: 'var(--success)' }}>
            ✓ Done
          </span>
        )}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// LESSON VIEWER
// ─────────────────────────────────────────────

function LessonView({ lessonId, onBack, onComplete }: {
  lessonId: string; onBack: () => void; onComplete: () => void
}) {
  const { user } = useAuthStore()
  const [data, setData] = useState<any>(null)
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const startTime = useRef(Date.now())

  useEffect(() => {
    if (!user) return
    window.api.lessons.get(user.id, lessonId).then((d: any) => {
      setData(d)
      setLoading(false)
      window.api.lessons.start(user.id, lessonId)
    })
  }, [lessonId, user])

  const handleComplete = async () => {
    if (!user) return
    const elapsed = Math.floor((Date.now() - startTime.current) / 1000)
    const result = await window.api.lessons.complete(user.id, lessonId, elapsed)
    if (result.new_achievements?.length > 0) {
      notify.success('Achievement Unlocked!', `You earned ${result.new_achievements.length} new achievement(s)`)
    }
    notify.success('Lesson Complete!', data?.lesson?.title)
    onComplete()
  }

  if (loading) return <CenteredSpinner />
  if (!data) return null

  const { lesson, exercises } = data

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Theory panel */}
      <div style={{
        width: 340, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onBack} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 10,
          }}>
            ← Back
          </button>
          <h3 style={{ color: 'var(--sql-color)', marginBottom: 4 }}>{lesson.title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lesson.description}</p>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {lesson.theory_md ? (
            <LessonTheory markdown={lesson.theory_md} />
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Lesson content will appear here once seeded.
            </p>
          )}
          <LessonQuiz quizJson={lesson.quiz} accentColor="var(--sql-color)" />
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary" onClick={handleComplete} style={{ width: '100%', justifyContent: 'center' }}>
            <CheckCircle size={14} /> Mark Complete
          </button>
        </div>
      </div>

      {/* Exercise panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {exercises.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No exercises for this lesson yet.</p>
          </div>
        ) : (
          <>
            {/* Exercise tabs */}
            <div style={{
              display: 'flex', gap: 4, padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              overflowX: 'auto',
            }}>
              {exercises.map((ex: any, i: number) => (
                <button
                  key={ex.id}
                  onClick={() => setActiveExIdx(i)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: `1px solid ${activeExIdx === i ? 'var(--accent)' : 'var(--border)'}`,
                    background: activeExIdx === i ? 'var(--accent-dim)' : 'transparent',
                    color: activeExIdx === i ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                  }}
                >
                  Ex {i + 1}
                </button>
              ))}
            </div>
            <ExerciseSolver
              exercise={exercises[activeExIdx]}
              lessonModule="sql"
              onNext={activeExIdx < exercises.length - 1 ? () => setActiveExIdx(i => i + 1) : undefined}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// EXERCISE SOLVER
// ─────────────────────────────────────────────

function ExerciseSolver({ exercise, lessonModule, onNext }: {
  exercise: any; lessonModule: string; onNext?: () => void
}) {
  const { user } = useAuthStore()
  const [code, setCode] = useState(exercise?.solution ? '' : '')
  const [result, setResult] = useState<any>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [correct, setCorrect] = useState<boolean | null>(null)
  const sandboxId = useRef(`ex_${exercise?.id}_${user?.id}`)

  useEffect(() => {
    setCode('')
    setResult(null)
    setFeedback(null)
    setHint(null)
    setHintsUsed(0)
    setCorrect(null)
  }, [exercise?.id])

  const handleRun = async () => {
    if (!user || !exercise) return
    setRunning(true)
    setResult(null)
    setFeedback(null)

    try {
      const res = await window.api.exercises.submit({
        userId: user.id,
        exerciseId: exercise.id,
        answer: code,
        timeSpentS: 60,
        sandboxId: sandboxId.current,
      })

      setResult(res.validation)
      setCorrect(res.validation.correct)

      if (res.validation.feedback && res.validation.feedback !== 'ai_review_required') {
        setFeedback(res.validation.feedback)
      }

      if (res.new_achievements?.length > 0) {
        notify.success('Achievement Unlocked!')
      }
    } catch (err: any) {
      // Without this, any unexpected failure (not a normal wrong-answer
      // case, which is handled above) leaves the screen showing nothing —
      // the spinner just stops with zero explanation. Always show something.
      notify.error('Could not run this', err?.message || 'Something went wrong. Try again.')
      setResult({ success: false, correct: false, error: err?.message || 'Something went wrong running this.' })
    } finally {
      setRunning(false)
    }
  }

  const getHint = async () => {
    if (!exercise || hintsUsed >= 3) return
    const next = hintsUsed + 1
    const res = await window.api.exercises.hint(exercise.id, next)
    if (res.hint) {
      setHint(res.hint)
      setHintsUsed(next)
    } else {
      setHint('No more hints available for this exercise.')
    }
  }

  if (!exercise) return null

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left: editor + results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Prompt */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {exercise.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {exercise.prompt}
          </div>
          {lessonModule === 'sql' && (
            <div style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--sql-color)', fontWeight: 500,
              padding: '3px 9px', borderRadius: 'var(--radius-full)',
              background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
            }}>
              <Database size={11} /> Tables ready: patients, billing
            </div>
          )}
          {hint && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: 'var(--warning-dim)',
              border: '1px solid var(--warning)',
              borderRadius: 'var(--radius)',
              fontSize: 12, color: 'var(--warning)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{hint}</span>
            </div>
          )}
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Editor
            height="100%"
            language={lessonModule === 'sql' ? 'sql' : 'python'}
            value={code}
            onChange={v => setCode(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              padding: { top: 12 },
              suggestOnTriggerCharacters: true,
              tabSize: 2,
            }}
          />
        </div>

        {/* Results */}
        {result && (
          <div style={{
            padding: '10px 16px',
            background: result.correct ? 'var(--success-dim)' : 'var(--error-dim)',
            borderTop: `1px solid ${result.correct ? 'var(--success)' : 'var(--error)'}`,
            fontSize: 12,
            color: result.correct ? 'var(--success)' : 'var(--error)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            {result.correct ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            <span style={{ flex: 1 }}>{feedback ?? (result.correct ? 'Correct!' : 'Not quite right.')}</span>
            {result.row_count !== undefined && (
              <span style={{ fontSize: 11, opacity: 0.8 }}>{result.row_count} rows</span>
            )}
            {result.correct && onNext && (
              <button className="btn btn-sm" onClick={onNext}
                style={{ background: 'var(--success)', color: 'white', border: 'none' }}>
                Next <ChevronRight size={12} />
              </button>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running || !code.trim()}>
            {running ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running...' : 'Run'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={getHint} disabled={hintsUsed >= 3}>
            <Lightbulb size={12} />
            Hint {hintsUsed > 0 ? `(${hintsUsed}/3)` : ''}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCode('')}>
            <RotateCcw size={12} /> Reset
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={12} color="var(--legendary)" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{exercise.points} pts</span>
          </div>
        </div>
      </div>

      {/* Right: AI Instructor */}
      <div style={{ width: 290, flexShrink: 0 }}>
        <InstructorPanel
          context={{
            type: 'exercise',
            lesson: lessonModule,
            exercise: exercise.title,
          }}
          initialPrompt={
            result
              ? result.correct
                ? `I got the exercise "${exercise.title}" correct. Task: ${exercise.prompt}. My answer:\n${code}\nBriefly affirm what I did well and suggest one way to go deeper.`
                : `I tried the exercise "${exercise.title}". Task: ${exercise.prompt}. My attempt:\n${code}\nPlease guide me without giving the answer.`
              : undefined
          }
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SQL PLAYGROUND
// ─────────────────────────────────────────────

function SqlPlayground() {
  const { user } = useAuthStore()
  const [query, setQuery] = useState('-- Write your SQL here\nSELECT * FROM patients LIMIT 10;')
  const [result, setResult] = useState<SqlResult | null>(null)
  const [running, setRunning] = useState(false)
  const [datasets, setDatasets] = useState<{ bundled: any[]; imported: any[] }>({ bundled: [], imported: [] })
  const [activeDataset, setActiveDataset] = useState<any>(null)
  const sandboxId = useRef(`playground_${user?.id}`)

  const loadDataset = async (ds: any, type: 'bundled' | 'imported') => {
    if (!user) return
    const res = await window.api.sql.loadDataset(sandboxId.current, ds.id, type, user.id)
    if (res.success) {
      setActiveDataset({ ...ds, type })
      setQuery(`-- Dataset: ${ds.name}\n-- Table: ${ds.table_name}\nSELECT * FROM ${ds.table_name} LIMIT 20;`)
      notify.success(`Loaded: ${ds.name}`)
    } else {
      notify.error('Failed to load dataset', res.error)
    }
  }

  useEffect(() => {
    if (!user) return
    window.api.sql.datasets(user.id).then(async (ds: any) => {
      setDatasets(ds)
      // Auto-load a dataset immediately so the pre-filled query works without
      // requiring the user to already know they need to pick one first.
      // This is what was causing "no such table" the first time anyone opened
      // the Playground — nothing was ever loaded until a manual click.
      // Prefer the Patients dataset as the default — it's the simple,
      // foundational table every SQL lesson starts from. Falling back to
      // whatever sorts first alphabetically would default to "Billing"
      // instead, which is the more complex, derived table.
      const preferred = ds.bundled.find((d: any) => d.id === 'ds-hospital-patients') ?? ds.bundled[0]
      if (preferred) {
        await loadDataset(preferred, 'bundled')
      }
    })
    return () => { window.api.sql.closeSandbox(sandboxId.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const runQuery = async () => {
    if (!user || !query.trim()) return
    setRunning(true)
    try {
      const res = await window.api.sql.execute(sandboxId.current, query, user.id)
      setResult(res)
    } catch (err: any) {
      // Without this, any unexpected failure left the screen exactly as it
      // was before clicking Run — no error, no result, nothing visible.
      setResult({ success: false, error: err?.message || 'Something went wrong running this query. Try again.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Dataset sidebar */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Datasets
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
          {datasets.bundled.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 6px 4px', fontWeight: 600, textTransform: 'uppercase' }}>
                Bundled
              </div>
              {datasets.bundled.map(ds => (
                <DatasetBtn key={ds.id} ds={ds} active={activeDataset?.id === ds.id}
                  onClick={() => loadDataset(ds, 'bundled')} />
              ))}
            </>
          )}
          {datasets.imported.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '10px 6px 4px', fontWeight: 600, textTransform: 'uppercase' }}>
                My Imports
              </div>
              {datasets.imported.map(ds => (
                <DatasetBtn key={ds.id} ds={ds} active={activeDataset?.id === ds.id}
                  onClick={() => loadDataset(ds, 'imported')} />
              ))}
            </>
          )}
          {datasets.bundled.length === 0 && datasets.imported.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 8px', lineHeight: 1.5 }}>
              No datasets loaded. Import a file from the Datasets page.
            </p>
          )}
        </div>
      </div>

      {/* Editor + results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Editor */}
        <div style={{ flex: '0 0 40%', borderBottom: '1px solid var(--border)' }}>
          <Editor
            height="100%"
            language="sql"
            value={query}
            onChange={v => setQuery(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13, fontFamily: 'var(--font-mono)',
              minimap: { enabled: false }, scrollBeyondLastLine: false,
              padding: { top: 10 }, lineNumbers: 'on',
            }}
          />
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '6px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <button className="btn btn-primary btn-sm" onClick={runQuery} disabled={running || !activeDataset}>
            {running ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running…' : 'Run  ⌘↵'}
          </button>
          {activeDataset ? (
            <span style={{
              fontSize: 11, color: 'var(--sql-color)', display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 'var(--radius-full)',
              background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
              fontWeight: 600,
            }}>
              <Database size={11} /> {activeDataset.name} loaded — table "{activeDataset.table_name}"
            </span>
          ) : (
            <span style={{
              fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 'var(--radius-full)',
              background: 'var(--warning-dim)', border: '1px solid var(--warning)',
            }}>
              <Database size={11} /> No dataset loaded — pick one from the left
            </span>
          )}
          {result && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {result.success
                ? `${result.row_count} rows · ${result.exec_ms}ms`
                : <span style={{ color: 'var(--error)' }}>Error</span>}
            </span>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!result && (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
              {activeDataset
                ? 'Results will appear here after you run a query.'
                : 'Select a dataset from the left to get started.'}
            </div>
          )}
          {result && !result.success && (
            <div style={{ padding: '12px 16px' }}>
              <div style={{
                padding: '10px 14px',
                background: 'var(--error-dim)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius)',
                color: 'var(--error)',
                fontSize: 12, fontFamily: 'var(--font-mono)',
              }}>
                {result.error}
              </div>
            </div>
          )}
          {result?.success && result.rows && (
            <ResultsGrid rows={result.rows} columns={result.columns ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}

function ResultsGrid({ rows, columns }: { rows: any[]; columns: string[] }) {
  if (rows.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Query returned 0 rows.</div>
  }
  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <table className="data-table" style={{ minWidth: '100%' }}>
        <thead>
          <tr>
            {columns.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col}>{row[col] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span> : String(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────

function DatasetBtn({ ds, active, onClick }: { ds: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '6px 8px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${active ? 'var(--sql-color)' : 'transparent'}`,
      background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
      color: active ? 'var(--sql-color)' : 'var(--text-secondary)',
      cursor: 'pointer', fontSize: 12, transition: 'all var(--transition)',
    }}>
      <div style={{ fontWeight: active ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ds.name}
      </div>
      {ds.row_count && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
          {ds.row_count.toLocaleString()} rows
        </div>
      )}
    </button>
  )
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 'var(--radius)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
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
