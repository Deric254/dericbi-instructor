import React, { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import '@/lib/monacoLocal'
import {
  Database, Play, ChevronRight, Lock, CheckCircle, Circle,
  Clock, BookOpen, Lightbulb, X, Loader, AlertCircle,
  ChevronDown, RotateCcw, HelpCircle, MessageSquare, Star,
  Brain, Workflow,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'
import { SplitPane, AsideSplit } from '../components/ui/SplitPane'
import MyDatabases from '../components/sql/MyDatabases'
import { refreshSqlSchema } from '../lib/sqlCompletion'
import { prepareSqlEditor, preparePythonEditor, useEditorTheme } from '../lib/editorTheme'
import { explainPrompt } from '../lib/explainPrompt'
import ResultsGrid from '../components/sql/ResultsGrid'
import ComparePanel, { hasComparison, type Comparison } from '../components/sql/ComparePanel'
import LessonTheory from '../components/ui/LessonTheory'
import LessonQuiz from '../components/ui/LessonQuiz'
import { PageError } from '../components/ui/PageState'
import { reportApiError } from '../lib/apiError'
import { usePendingLesson } from '../hooks/usePendingLesson'
import type { Lesson, SqlResult } from '../types'

type View = 'lessons' | 'lesson' | 'playground' | 'mydbs'

<<<<<<< HEAD
const DATAENG_TABLES = 'customers, orders, raw_events, pipeline_runs, ml_features, llm_requests, messy_contacts'

=======
>>>>>>> 751a2baa32746d5c49186b4147523c95a563f56f
/** The SQL screen also teaches Data Engineering: same editor, grader and tutor, different course, colour and title. */
const COURSES = {
  sql: {
    module: 'sql', title: 'SQL Academy', tint: 'rgba(34,211,238,0.15)', icon: <Database size={16} />,
    subtitle: 'From SELECT to window functions — real execution on real data', myDatabases: true,
  },
  dataeng: {
    module: 'dataeng', title: 'Data Engineering Academy', tint: 'rgba(251,113,133,0.15)', icon: <Workflow size={16} />,
    subtitle: 'Pipelines, data quality and AI-ready data — for the people who run the platform', myDatabases: false,
  },
} as const

export default function SqlAcademy({ course = 'sql' }: { course?: keyof typeof COURSES }) {
  const cfg = COURSES[course]
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
    window.api.lessons.list(user.id, cfg.module)
      .then((data: any) => setLessons(data))
      .catch((err) => { reportApiError(`load ${cfg.title} lessons`, err); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [user, cfg])

  useEffect(loadLessons, [loadLessons])

  const openLesson = (id: string) => {
    setActiveLessonId(id)
    setView('lesson')
  }
  usePendingLesson(lessons, openLesson)

  return (
    // The page is built on --sql-color; Data Engineering re-points it to its own colour for everything below.
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', ...(course === 'dataeng' ? { ['--sql-color' as any]: 'var(--de-color)' } : {}) }}>
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
          background: cfg.tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--sql-color)',
        }}>
          {cfg.icon}
        </div>
        <div>
          <h2 style={{ color: 'var(--text-primary)' }}>{cfg.title}</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {cfg.subtitle}
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <TabBtn active={view === 'lessons'} onClick={() => setView('lessons')}>
            <BookOpen size={13} /> Lessons
          </TabBtn>
          <TabBtn active={view === 'playground'} onClick={() => setView('playground')}>
            <Play size={13} /> Playground
          </TabBtn>
          {cfg.myDatabases && (
            <TabBtn active={view === 'mydbs'} onClick={() => setView('mydbs')}>
              <Database size={13} /> My Databases
            </TabBtn>
          )}
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
              if (user) window.api.lessons.list(user.id, cfg.module).then(setLessons).catch((err: any) => reportApiError('refresh your lessons', err))
            }}
          />
        )}
        {view === 'playground' && <SqlPlayground />}
        {view === 'mydbs' && cfg.myDatabases && <MyDatabases />}
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
  const [loadError, setLoadError] = useState(false)
  const startTime = useRef(Date.now())

  const loadLesson = useCallback(() => {
    if (!user) return
    setLoading(true)
    setLoadError(false)
    window.api.lessons.get(user.id, lessonId)
      .then((d: any) => {
        setData(d)
        window.api.lessons.start(user.id, lessonId).catch((err) => reportApiError('mark lesson started', err))
      })
      .catch((err) => { reportApiError('load this lesson', err); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [lessonId, user])

  useEffect(loadLesson, [loadLesson])

  const handleComplete = async () => {
    if (!user) return
    const elapsed = Math.floor((Date.now() - startTime.current) / 1000)
    try {
      const result = await window.api.lessons.complete(user.id, lessonId, elapsed)
      if (result.new_achievements?.length > 0) {
        notify.success('Achievement Unlocked!', `You earned ${result.new_achievements.length} new achievement(s)`)
      }
      notify.success('Lesson Complete!', data?.lesson?.title)
      onComplete()
    } catch (err) {
      reportApiError('save your lesson progress', err)
    }
  }

  if (loadError) return <PageError message="Couldn't load this lesson." onRetry={loadLesson} />
  if (loading) return <CenteredSpinner />
  if (!data) return null

  const { lesson, exercises } = data

  return (
    <SplitPane id="sql-lesson" defaultRatio={0.4} minFirst={260} minSecond={380} stackBelow={820}
      first={
      /* Theory panel - the learning window gets the larger share by default; drag the divider to change it */
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      }
      second={
      /* Exercise panel */
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
              key={exercises[activeExIdx]?.id}
              exercise={exercises[activeExIdx]}
              lessonModule="sql"
              onNext={activeExIdx < exercises.length - 1 ? () => setActiveExIdx(i => i + 1) : undefined}
            />
          </>
        )}
      </div>
      } />
  )
}

// ─────────────────────────────────────────────
// EXERCISE SOLVER
// ─────────────────────────────────────────────

function ExerciseSolver({ exercise, lessonModule, onNext }: {
  exercise: any; lessonModule: string; onNext?: () => void
}) {
  const editorTheme = useEditorTheme()
  const { user } = useAuthStore()
  const [code, setCode] = useState(exercise?.solution ? '' : '')
  const [result, setResult] = useState<any>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [correct, setCorrect] = useState<boolean | null>(null)
  // What the student's query actually returns, shown under the editor (SELECT-style queries only).
  const [output, setOutput] = useState<SqlResult | null>(null)
  const sandboxId = useRef(`ex_${exercise?.id}_${user?.id}`)

  useEffect(() => {
    setCode('')
    setResult(null)
    setFeedback(null)
    setHint(null)
    setHintsUsed(0)
    setCorrect(null)
    setOutput(null)
  }, [exercise?.id])

  useEffect(() => { if (lessonModule === 'sql') refreshSqlSchema(user?.id, sandboxId.current) }, [exercise?.id, user?.id, lessonModule])

  // Each exercise gets its own in-memory sql.js sandbox (loaded with the
  // hospital dataset). Without closing it on unmount, every exercise a
  // student has ever attempted stays allocated for the entire app session
  // — across a full 60-lesson course that's 100+ accumulated sandboxes
  // never freed. The `key={exercise.id}` on this component (see parent)
  // ensures this effect's cleanup fires on every exercise switch, not just
  // when leaving the lesson entirely.
  useEffect(() => {
    return () => { window.api.sql.closeSandbox(sandboxId.current).catch((err: any) => console.error('[close sandbox]', err)) }
  }, [])

  const handleRun = async () => {
    if (!user || !exercise) return
    setRunning(true)
    setResult(null)
    setFeedback(null)
    setOutput(null)

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
      if (lessonModule === 'sql') refreshSqlSchema(user.id, sandboxId.current)

      if (res.validation.feedback && res.validation.feedback !== 'ai_review_required') {
        setFeedback(res.validation.feedback)
      }

      if (res.new_achievements?.length > 0) {
        notify.success('Achievement Unlocked!')
      }

      // Show the student what their query returned. Only for queries that read data: running anything that
      // writes a second time (after grading) could change the practice tables twice.
      if (lessonModule === 'sql' && /^(select|with|values|pragma|explain)\b/i.test(stripSqlComments(code))) {
        try { setOutput(await window.api.sql.execute(sandboxId.current, code, user.id)) } catch { /* the grading result is already shown */ }
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

  // Starting over also restores the practice tables, in case a query (e.g. DROP TABLE) changed them.
  const resetExercise = async () => {
    setCode(''); setResult(null); setFeedback(null); setOutput(null); setCorrect(null)
    try { await window.api.sql.closeSandbox(sandboxId.current) } catch (err) { console.error('[reset exercise]', err) }
    if (lessonModule === 'sql') refreshSqlSchema(user?.id, sandboxId.current)
  }

  const getHint = async () => {
    if (!exercise || hintsUsed >= 3) return
    const next = hintsUsed + 1
    try {
      const res = await window.api.exercises.hint(exercise.id, next)
      if (res.hint) {
        setHint(res.hint)
        setHintsUsed(next)
      } else {
        setHint('No more hints available for this exercise.')
      }
    } catch (err) {
      reportApiError('get a hint', err)
    }
  }

  if (!exercise) return null

  return (
    <SplitPane id="sql-exercise-ai" defaultRatio={0.72} minFirst={340} minSecond={240} stackBelow={640}
      first={
      /* Left: task + editor + results */
      <SplitPane id="sql-exercise-task" direction="vertical" defaultRatio={0.22} minFirst={90} minSecond={200}
      first={
        /* Prompt */
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 18px', background: 'var(--bg-surface)' }}>
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
              <Database size={11} /> Tables ready: {String(exercise.id).startsWith('de-') ? DATAENG_TABLES : 'patients, billing'}
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
      }
      second={
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Editor, with the query output underneath (drag the divider to resize) */}
        <ExerciseEditorArea showOutput={lessonModule === 'sql'} output={output} running={running} comparison={result && !result.correct ? result : null}>
          <Editor
            height="100%"
            language={lessonModule === 'sql' ? 'sql' : 'python'}
            beforeMount={lessonModule === 'sql' ? prepareSqlEditor : preparePythonEditor}
            value={code}
            onChange={v => setCode(v ?? '')}
            theme={editorTheme}
            options={{
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              padding: { top: 12 },
              suggestOnTriggerCharacters: true,
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </ExerciseEditorArea>

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
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', maxHeight: 130, overflow: 'auto' }}>{feedback ?? (result.correct ? 'Correct!' : 'Not quite right.')}</span>
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
          <button className="btn btn-ghost btn-sm" onClick={resetExercise} title="Clear your answer and restore the practice tables">
            <RotateCcw size={12} /> Reset
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={12} color="var(--legendary)" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{exercise.points} pts</span>
          </div>
        </div>
      </div>
      } />
      }
      second={
      /* Right: AI Instructor */
      <div style={{ flex: 1, minHeight: 0 }}>
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
      } />
  )
}

// ─────────────────────────────────────────────
// SQL PLAYGROUND
// ─────────────────────────────────────────────

function SqlPlayground() {
  const editorTheme = useEditorTheme()
  const { user } = useAuthStore()
  const [query, setQuery] = useState('-- Write your SQL here\nSELECT * FROM patients LIMIT 10;')
  const [result, setResult] = useState<SqlResult | null>(null)
  const [running, setRunning] = useState(false)
  const [datasets, setDatasets] = useState<{ bundled: any[]; imported: any[] }>({ bundled: [], imported: [] })
  const [activeDataset, setActiveDataset] = useState<any>(null)
  const sandboxId = useRef(`playground_${user?.id}`)
  const [tutorOpen, setTutorOpen] = useState(false)
  const [tutorRequest, setTutorRequest] = useState<{ id: number; text: string } | undefined>()

  const loadDataset = async (ds: any, type: 'bundled' | 'imported') => {
    if (!user) return
    try {
      const res = await window.api.sql.loadDataset(sandboxId.current, ds.id, type, user.id)
      if (res.success) {
        setActiveDataset({ ...ds, type })
        refreshSqlSchema(user.id, sandboxId.current)
        setQuery(`-- Dataset: ${ds.name}\n-- Table: ${ds.table_name}\nSELECT * FROM ${ds.table_name} LIMIT 20;`)
        notify.success(`Loaded: ${ds.name}`)
      } else {
        notify.error('Failed to load dataset', res.error)
      }
    } catch (err) {
      reportApiError('load this dataset', err)
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
    }).catch((err: any) => reportApiError('load your datasets', err))
    return () => { window.api.sql.closeSandbox(sandboxId.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const explain = () => {
    setTutorOpen(true)
    setTutorRequest((prev) => ({ id: (prev?.id ?? 0) + 1, text: explainPrompt(query, result) }))
  }

  // Closing the sandbox and loading the dataset again puts back any table a query changed or dropped.
  const resetDataset = async () => {
    if (!user || !activeDataset) return
    try { await window.api.sql.closeSandbox(sandboxId.current) } catch (err) { console.error('[reset playground]', err) }
    setResult(null)
    await loadDataset(activeDataset, activeDataset.type)
  }

  const runQuery = async () => {
    if (!user || !query.trim()) return
    setRunning(true)
    try {
      const res = await window.api.sql.execute(sandboxId.current, query, user.id)
      setResult(res)
      if (res.success) refreshSqlSchema(user.id, sandboxId.current)
    } catch (err: any) {
      // Without this, any unexpected failure left the screen exactly as it
      // was before clicking Run — no error, no result, nothing visible.
      setResult({ success: false, error: err?.message || 'Something went wrong running this query. Try again.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <SplitPane id="sql-playground-side" defaultFirstPx={210} minFirst={150} minSecond={420} stackBelow={640}
      first={
      /* Dataset sidebar */
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      }
      second={
      <AsideSplit id="sql-playground-ai" aside={tutorOpen && (
        <InstructorPanel context={{ type: 'playground', lesson: 'sql', code: query }} request={tutorRequest} />
      )} main={
      /* Editor above, results below - drag the divider to give either more room */
      <SplitPane id="sql-playground-main" direction="vertical" defaultRatio={0.45} minFirst={130} minSecond={150}
      first={
        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor
            height="100%"
            language="sql"
            beforeMount={prepareSqlEditor}
            value={query}
            onChange={v => setQuery(v ?? '')}
            theme={editorTheme}
            options={{
              fontSize: 13, fontFamily: 'var(--font-mono)',
              minimap: { enabled: false }, scrollBeyondLastLine: false,
              padding: { top: 10 }, lineNumbers: 'on', automaticLayout: true,
            }}
          />
        </div>
      }
      second={
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <button className="btn btn-secondary btn-sm" onClick={explain} disabled={!query.trim()} title="Ask the AI tutor to explain this query and its result">
            <Brain size={12} /> Explain
          </button>
          {tutorOpen && (
            <button className="btn btn-ghost btn-sm" onClick={() => setTutorOpen(false)} title="Hide the AI tutor">
              <X size={12} /> Hide tutor
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={resetDataset} disabled={!activeDataset || running} title="Reload the dataset, restoring any table a query changed">
            <RotateCcw size={12} /> Reset
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
          {result?.success && result.notice && (
            <div style={{ padding: '8px 14px', fontSize: 12, background: 'var(--warning-dim, rgba(250,204,21,0.12))', color: 'var(--warning, #facc15)', borderBottom: '1px solid var(--border)' }}>
              {result.notice}
            </div>
          )}
          {result?.success && result.rows && (
            <ResultsGrid rows={result.rows} columns={result.columns ?? []} />
          )}
        </div>
      </div>
      } />
      }
      />
      }
      />
  )
}

/** Leading whitespace and comments removed, so the first real keyword can be inspected. */
function stripSqlComments(sql: string): string {
  let t = sql
  for (;;) {
    t = t.replace(/^\s+/, '')
    if (t.startsWith('--')) { const i = t.indexOf('\n'); t = i === -1 ? '' : t.slice(i + 1); continue }
    if (t.startsWith('/*')) { const i = t.indexOf('*/'); t = i === -1 ? '' : t.slice(i + 2); continue }
    return t
  }
}

/** Editor on top; for SQL exercises the query output sits below it, with a side-by-side view after a wrong answer. */
function ExerciseEditorArea({ children, showOutput, output, running, comparison }: {
  children: React.ReactNode; showOutput: boolean; output: SqlResult | null; running: boolean; comparison: Comparison | null
}) {
  const [tab, setTab] = useState<'output' | 'compare'>('output')
  const canCompare = hasComparison(comparison)
  // A wrong answer opens the comparison; running again returns to the plain output.
  useEffect(() => { setTab(canCompare ? 'compare' : 'output') }, [canCompare, comparison])
  const editor = <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
  if (!showOutput) return <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{editor}</div>
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
    background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  })
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <SplitPane id="sql-exercise-editor-output" direction="vertical" defaultRatio={0.48} minFirst={110} minSecond={90}
        first={editor}
        second={
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <button style={tabStyle(tab === 'output')} onClick={() => setTab('output')}>
                Output{output?.success ? ` · ${output.row_count} row${output.row_count === 1 ? '' : 's'}` : ''}
              </button>
              {canCompare && <button style={tabStyle(tab === 'compare')} onClick={() => setTab('compare')}>Compare with expected</button>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {tab === 'compare' && canCompare ? <ComparePanel comparison={comparison} /> : (
                <>
                  {!output && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>{running ? 'Running…' : 'Press Run to see what your query returns here.'}</div>}
                  {output && !output.success && <div style={{ padding: 14, fontSize: 12, color: 'var(--error)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>{output.error}</div>}
                  {output?.success && output.notice && <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--warning)' }}>{output.notice}</div>}
                  {output?.success && output.rows && <ResultsGrid rows={output.rows} columns={output.columns ?? []} />}
                </>
              )}
            </div>
          </div>
        } />
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
