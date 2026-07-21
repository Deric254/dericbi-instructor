import React, { useState, useEffect, useRef } from 'react'
import {
  Briefcase, ChevronRight, Lock, CheckCircle, Brain,
  Send, Loader, Star, TrendingUp, Target,
  FileText, MessageSquare, BarChart2, Users, Info,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'
import LessonTheory from '../components/ui/LessonTheory'
import LessonQuiz from '../components/ui/LessonQuiz'
import { PageError } from '../components/ui/PageState'
import { reportApiError } from '../lib/apiError'
import type { Lesson } from '../types'

export function BusinessAcademy() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [activeLesson, setActiveLesson] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const { user } = useAuthStore()

  const TOPICS = [
    { title: 'KPI Design & Selection',  desc: 'What makes a good KPI. Leading vs lagging. Vanity metrics.',       icon: <Target size={16} />,       level: 'beginner',     color: 'var(--accent)' },
    { title: 'Root Cause Analysis',     desc: '5 Whys, fishbone, Pareto. Symptom to cause.',                      icon: <TrendingUp size={16} />,   level: 'intermediate', color: 'var(--sql-color)' },
    { title: 'Decision Frameworks',     desc: 'Data-driven decisions, prioritization, risk assessment.',           icon: <BarChart2 size={16} />,    level: 'intermediate', color: 'var(--python-color)' },
    { title: 'Executive Reporting',     desc: 'One-page reports, Pyramid Principle, what leaders read.',           icon: <FileText size={16} />,     level: 'intermediate', color: 'var(--powerbi-color)' },
    { title: 'Data Storytelling',       desc: 'Narrative structure, choosing visuals, insight vs data.',           icon: <MessageSquare size={16} />, level: 'advanced',    color: 'var(--stats-color)' },
    { title: 'Business Communication',  desc: 'Translating analysis for non-technical stakeholders.',              icon: <Users size={16} />,        level: 'intermediate', color: 'var(--business-color)' },
    { title: 'Recommendation Writing',  desc: 'From findings to decisions. Structuring a recommendation memo.',   icon: <FileText size={16} />,     level: 'advanced',     color: 'var(--sim-color)' },
    { title: 'Analytical Thinking',     desc: 'Problem framing, hypothesis-first thinking, avoiding bias.',        icon: <Brain size={16} />,        level: 'advanced',     color: 'var(--accent)' },
  ]

  const CASE_STUDIES = [
    {
      id: 'cs-hospital-kpi',
      title: 'Hospital KPI Design',
      scenario: `You are the analytics lead at St. Anne Mission Hospital. The medical director asks you to define the top 5 KPIs to track hospital performance.\n\nCurrent situation:\n- 500 beds, 3 wards (General, ICU, Maternity)\n- Monthly admissions: ~400\n- Average length of stay: 4.2 days\n- Bed occupancy: 78%\n- 30-day readmissions: 12%\n\nDirector's request: "I want one dashboard every Monday that tells me whether we're doing well."`,
      question: 'Define 5 KPIs. For each: (1) metric name, (2) calculation method, (3) target value, (4) why it matters to the director.',
      rubric: ['Includes both operational and quality metrics', 'Each KPI is specific and measurable', 'Targets are realistic and justified', 'Written for a non-technical executive'],
      points: 100,
    },
    {
      id: 'cs-sales-rootcause',
      title: 'Sales Drop Root Cause',
      scenario: `You are the data analyst at TechSales Kenya. Revenue dropped 23% in Q3 vs Q2. Your manager: "Revenue is down. Find out why. Presentation by Friday."\n\nAvailable data:\n- Sales by product (Laptops, Phones, Tablets, Monitors)\n- Sales by region (Nairobi, Mombasa, Kisumu, Nakuru)\n- Sales by rep (8 reps)\n- 18 months transaction history\n- Customer acquisition data`,
      question: 'Apply the 5 Whys framework. What hypotheses would you investigate first? What data confirms/rejects each? What would you present Friday?',
      rubric: ['Uses structured framework (5 Whys or similar)', 'Generates 3+ testable hypotheses', 'Links each hypothesis to specific data', 'Addresses the "so what" for management'],
      points: 120,
    },
    {
      id: 'cs-exec-report',
      title: 'Executive Report Writing',
      scenario: `After analysis, you have found:\n1. ICU occupancy at 94% (dangerously high), General ward at 61%\n2. Malaria is top diagnosis (31% of admissions) with highest readmission rate (18%)\n3. Avg ICU billing is 3.2x higher than General ward\n4. 40% of patients were discharged 2+ days after recorded discharge date\n5. ICU staff-to-patient ratio is 1:6 (recommended 1:2)`,
      question: 'Write a one-page executive summary for the hospital director using the Pyramid Principle: lead with the most important insight, then support it. Include one specific recommendation with projected impact.',
      rubric: ['Leads with main insight (not background)', 'Recommendations are specific and actionable', 'Uses plain language (no jargon)', 'Quantifies projected impact', 'Under 300 words'],
      points: 150,
    },
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
    window.api.lessons.list(user.id, 'business')
      .then((d: any) => setLessons(d))
      .catch((err: any) => { reportApiError('load Business lessons', err); setLoadError(true) })
      .finally(() => setLoading(false))
  }

  if (loadError && !activeLesson) return <PageError message="Couldn't load the Business Academy lessons." onRetry={loadLessons} />

  if (activeLesson) {
    return (
      <BusinessLessonView
        lesson={activeLesson.lesson}
        exercises={activeLesson.exercises || []}
        onBack={() => { setActiveLesson(null); loadLessons() }}
      />
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(244,114,182,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--business-color)' }}>
          <Briefcase size={16} />
        </div>
        <div>
          <h2>Business Thinking Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>The module that separates analysts from dashboard builders</p>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ padding: '14px 18px', background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--business-color)', marginBottom: 6 }}>Why this module exists</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Most analysts can run a query. Very few can tell a business story with the result. This academy teaches problem framing, findings structure, recommendation communication, and decision influence. Exercises are open-ended and AI-evaluated, because business thinking cannot be graded with right/wrong.
          </p>
        </div>

        {!loading && lessons.length > 0 ? (
          <><h3 style={{ marginBottom: 14 }}>Your Lessons</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 32 }}>
            {lessons.map((lesson: any) => (
              <button key={lesson.id} onClick={lesson.user_status === 'locked' ? undefined : async () => {
                const data = await window.api.lessons.get(user!.id, lesson.id)
                await window.api.lessons.start(user!.id, lesson.id)
                setActiveLesson(data)
              }} disabled={lesson.user_status === 'locked'} style={{ padding: '14px', borderRadius: 'var(--radius)', border: `1px solid ${lesson.user_status === 'complete' ? 'rgba(244,114,182,0.4)' : 'var(--border)'}`, background: lesson.user_status === 'complete' ? 'rgba(244,114,182,0.06)' : 'var(--bg-surface)', opacity: lesson.user_status === 'locked' ? 0.45 : 1, cursor: lesson.user_status === 'locked' ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%', transition: 'all var(--transition)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{lesson.title}</span>
                  {lesson.user_status === 'complete' ? <CheckCircle size={14} color="var(--business-color)" /> : lesson.user_status === 'locked' ? <Lock size={13} color="var(--text-muted)" /> : <ChevronRight size={14} />}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{lesson.description}</p>
              </button>
            ))}</div></>
        ) : (
          <><h3 style={{ marginBottom: 14 }}>Curriculum</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10, marginBottom: 32 }}>
            {TOPICS.map((t, i) => (
              <div key={i} className="card" style={{ opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: t.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.color, flexShrink: 0 }}>{t.icon}</div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>{t.desc}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Lock size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{t.level}</span>
                </div>
              </div>
            ))}</div></>
        )}

        <h3 style={{ marginBottom: 6 }}>Practice Case Studies</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>Open-ended scenarios. No right answers — only strong and weak thinking. AI instructor evaluates.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CASE_STUDIES.map(cs => <CaseStudyCard key={cs.id} caseStudy={cs} />)}
        </div>
      </div>
    </div>
  )
}

function CaseStudyCard({ caseStudy }: { caseStudy: any }) {
  const [expanded, setExpanded] = useState(false)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { user } = useAuthStore()
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length

  const handleSubmit = async () => {
    if (!user || !answer.trim()) return
    setSubmitting(true)
    try {
      const result = await window.api.ai.chat({
        userId: user.id,
        message: `Evaluate this business analysis response.\n\nCase: ${caseStudy.title}\nScenario: ${caseStudy.scenario}\nQuestion: ${caseStudy.question}\n\nStudent Response:\n${answer}\n\nRubric:\n${caseStudy.rubric.map((r: string, i: number) => `${i+1}. ${r}`).join('\n')}\n\nProvide: 1) What they did well (specific), 2) What needs improvement (actionable), 3) What a senior analyst would add, 4) Score: X/${caseStudy.points}. Be direct, not effusive.`,
        history: [], context: { type: 'exercise', exercise: caseStudy.title },
      })
      if (result.success) { setFeedback(result.message); setSubmitted(true) }
      else setFeedback('Could not get feedback. Check AI API key in Settings.')
    } catch (err) {
      reportApiError('get AI feedback', err)
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <button onClick={() => setExpanded(v => !v)} style={{ width: '100%', padding: '14px 18px', background: 'var(--bg-surface)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{caseStudy.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI-evaluated · {caseStudy.points} points</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {submitted && <span style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Done</span>}
          <Star size={12} color="var(--legendary)" />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{caseStudy.points} pts</span>
          <ChevronRight size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 18px 18px', background: 'var(--bg-elevated)' }}>
          <div style={{ padding: '14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{caseStudy.scenario}</div>
          <div style={{ padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Your Task</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{caseStudy.question}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grading Criteria</div>
            {caseStudy.rubric.map((r: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{i+1}</span>
                {r}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="input-label">Your Response</label>
            <span style={{ fontSize: 11, color: wordCount > 50 ? 'var(--text-muted)' : 'var(--warning)' }}>{wordCount} words</span>
          </div>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Write your analysis here. Be specific and structured…" rows={10}
            style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', marginBottom: 10 }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: feedback ? 14 : 0 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || wordCount < 20}>
              {submitting ? <><Loader size={13} className="animate-spin" /> Evaluating…</> : <><Send size={13} /> Submit for AI Evaluation</>}
            </button>
            {answer && <button className="btn btn-ghost btn-sm" onClick={() => setAnswer('')}>Clear</button>}
          </div>
          {feedback && (
            <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--radius)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}><Brain size={11} /> AI Instructor Feedback</div>
              {feedback}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BusinessLessonView({ lesson, exercises, onBack }: { lesson: any; exercises: any[]; onBack: () => void }) {
  const { user } = useAuthStore()
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
        <h3 style={{ color: 'var(--business-color)' }}>{lesson.title}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowInstructor(v => !v)} className="btn btn-secondary btn-sm"><Brain size={12} /> Instructor</button>
          <button onClick={handleComplete} className="btn btn-primary btn-sm"><CheckCircle size={12} /> Complete</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', padding: 18 }}>
          <LessonTheory markdown={lesson.theory_md} />
          <LessonQuiz quizJson={lesson.quiz} accentColor="var(--business-color)" />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {exercises.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No exercises yet.</p> : exercises.map((ex: any, i: number) => <WrittenExercise key={ex.id} exercise={ex} index={i+1} />)}
        </div>
        {showInstructor && <div style={{ width: 280, flexShrink: 0 }}><InstructorPanel context={{ type: 'lesson', lesson: lesson.title }} /></div>}
      </div>
    </div>
  )
}

function WrittenExercise({ exercise, index }: { exercise: any; index: number }) {
  const { user } = useAuthStore()
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length

  const submit = async () => {
    if (!user || !answer.trim()) return
    setSubmitting(true)
    try {
      const r = await window.api.ai.exerciseFeedback({ userId: user.id, exercise_prompt: exercise.prompt, user_answer: answer, solution: exercise.solution || '', is_correct: null, skill: 'business_thinking', context: { type: 'exercise', exercise: exercise.title } })
      if (r.success) setFeedback(r.message)
      else setFeedback('Could not get feedback. Check your AI API key in Settings.')
      await window.api.exercises.submit({ userId: user.id, exerciseId: exercise.id, answer, timeSpentS: 60 })
    } catch (err) {
      reportApiError('get feedback on this exercise', err)
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{ marginBottom: 24, padding: 18, background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(244,114,182,0.2)', color: 'var(--business-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{exercise.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{exercise.prompt}</div>
        </div>
      </div>
      <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Write your answer here…" rows={6}
        style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', marginBottom: 10 }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting || wordCount < 10}>
          {submitting ? <><Loader size={12} className="animate-spin" /> Evaluating…</> : <><Send size={12} /> Get Feedback</>}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{wordCount} words</span>
      </div>
      {feedback && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}><Brain size={11} /> AI Feedback</div>
          {feedback}
        </div>
      )}
    </div>
  )
}
