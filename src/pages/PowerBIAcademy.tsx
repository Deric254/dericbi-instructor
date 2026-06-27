import React, { useState, useEffect } from 'react'
import { BarChart3, BookOpen, Lock, CheckCircle, ChevronRight, Clock, Info, Brain, Play, ExternalLink } from 'lucide-react'
import { useAuthStore, notify } from '../store'
import InstructorPanel from '../components/ui/InstructorPanel'
import type { Lesson } from '../types'

export default function PowerBIAcademy() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInstructor, setShowInstructor] = useState(false)
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user) return
    window.api.lessons.list(user.id, 'powerbi').then((d: any) => { setLessons(d); setLoading(false) })
  }, [user])

  const MODULE_TOPICS = [
    { title: 'Data Modeling & Relationships', desc: 'Star schema, dimension tables, fact tables, cardinality', level: 'beginner', est: 45 },
    { title: 'DAX Fundamentals', desc: 'Calculated columns, measures, basic DAX syntax', level: 'beginner', est: 60 },
    { title: 'Aggregation Measures', desc: 'SUM, CALCULATE, FILTER, ALL, ALLEXCEPT', level: 'intermediate', est: 50 },
    { title: 'Time Intelligence', desc: 'DATEYTD, SAMEPERIODLASTYEAR, DATEADD, rolling averages', level: 'intermediate', est: 55 },
    { title: 'Power Query (M Language)', desc: 'Data transformation, custom columns, merging queries', level: 'intermediate', est: 60 },
    { title: 'Dashboard Design Principles', desc: 'Layout, color theory, visual hierarchy, KPI cards', level: 'beginner', est: 40 },
    { title: 'Row-Level Security', desc: 'Dynamic RLS, roles, testing security', level: 'advanced', est: 35 },
    { title: 'Performance Optimization', desc: 'Query folding, aggregations, reducing model size', level: 'advanced', est: 50 },
    { title: 'Enterprise BI Concepts', desc: 'Workspaces, deployment pipelines, dataflows', level: 'advanced', est: 45 },
  ]

  if (activeLesson) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={() => setActiveLesson(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>← Back</button>
          <h3 style={{ color: 'var(--powerbi-color)' }}>{activeLesson.title}</h3>
          <button onClick={() => setShowInstructor(v => !v)} className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}>
            <Brain size={12} /> {showInstructor ? 'Hide' : 'Ask'} Instructor
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <div style={{ maxWidth: 680 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {activeLesson.theory_md || 'Lesson content is being prepared.'}
              </div>
              <div style={{ marginTop: 24, padding: '14px 16px', background: 'var(--info-dim)', border: '1px solid var(--info)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--info)', display: 'flex', gap: 8 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Power BI exercises use guided walkthroughs. Open Power BI Desktop alongside this lesson and follow the steps. The AI Instructor will evaluate your work based on your descriptions and screenshots.</span>
              </div>
              <button className="btn btn-primary" onClick={async () => {
                if (!user) return
                await window.api.lessons.complete(user.id, activeLesson.id, 0)
                notify.success('Lesson marked complete!', activeLesson.title)
                setActiveLesson(null)
                window.api.lessons.list(user.id, 'powerbi').then(setLessons)
              }} style={{ marginTop: 20 }}>
                <CheckCircle size={14} /> Mark as Complete
              </button>
            </div>
          </div>
          {showInstructor && (
            <div style={{ width: 300, flexShrink: 0 }}>
              <InstructorPanel context={{ type: 'lesson', lesson: activeLesson.title }} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(249,115,22,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--powerbi-color)' }}>
          <BarChart3 size={16} />
        </div>
        <div>
          <h2>Power BI Academy</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Modeling · DAX · Time Intelligence · Dashboard Design · Enterprise BI</p>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--powerbi-color)', display: 'flex', gap: 8 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Power BI lessons use guided walkthroughs. You work in Power BI Desktop while the AI instructor coaches you step by step. <a href="https://powerbi.microsoft.com/downloads/" target="_blank" style={{ color: 'var(--powerbi-color)' }}>Download Power BI Desktop ↗</a></span>
        </div>

        {lessons.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {lessons.map((lesson: any) => (
              <LessonCard key={lesson.id} lesson={lesson} color="var(--powerbi-color)" onClick={() => { setActiveLesson(lesson); window.api.lessons.start(user!.id, lesson.id) }} />
            ))}
          </div>
        ) : (
          <>
            <h3 style={{ marginBottom: 14 }}>Curriculum</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {MODULE_TOPICS.map((t, i) => (
                <div key={i} className="card" style={{ opacity: 0.7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
                    <Lock size={12} color="var(--text-muted)" />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>{t.desc}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <LevelBadge level={t.level} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {t.est}m</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LessonCard({ lesson, color, onClick }: { lesson: any; color: string; onClick: () => void }) {
  const locked = lesson.user_status === 'locked'
  const complete = lesson.user_status === 'complete'
  return (
    <button onClick={locked ? undefined : onClick} disabled={locked} style={{ padding: '14px', borderRadius: 'var(--radius)', border: `1px solid ${complete ? color + '40' : 'var(--border)'}`, background: complete ? color + '08' : 'var(--bg-surface)', opacity: locked ? 0.45 : 1, cursor: locked ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'all var(--transition)', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{lesson.title}</span>
        {complete ? <CheckCircle size={14} color={color} /> : locked ? <Lock size={13} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>{lesson.description}</p>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {lesson.estimated_min}m</span>
    </button>
  )
}

function LevelBadge({ level }: { level: string }) {
  const c = level === 'beginner' ? 'var(--success)' : level === 'intermediate' ? 'var(--python-color)' : 'var(--powerbi-color)'
  return <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: c, background: c + '20', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>{level}</span>
}
