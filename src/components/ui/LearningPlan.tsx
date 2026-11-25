import React from 'react'
import { Play, Flame, RotateCcw } from 'lucide-react'
import type { LearningPlan as Plan, NavSection } from '../../types'

const LABEL: Record<string, string> = { sql: 'SQL', excel: 'Excel', python: 'Python', powerbi: 'Power BI', statistics: 'Statistics', business: 'Business', dataeng: 'Data Engineering', bizsolver: 'Business Problem Solver', foundations: 'Start Here', founder: 'Founder Track', aiml: 'AI & ML Track', simulation: 'Simulations' }
const COLOR: Record<string, string> = { sql: 'var(--sql-color)', excel: 'var(--excel-color)', python: 'var(--python-color)', powerbi: 'var(--powerbi-color)', statistics: 'var(--stats-color)', business: 'var(--business-color)', dataeng: 'var(--de-color)', bizsolver: 'var(--bp-color)', foundations: 'var(--fd-color)', founder: 'var(--fo-color)', aiml: 'var(--ml-color)' }
const SECTION = (module: string): NavSection => (module === 'simulation' ? 'simulations' : module as NavSection)

/** Where to go next: continue point, streak, progress in each academy, and exercises worth another go. */
export default function LearningPlan({ plan, onOpen }: { plan: Plan; onOpen: (section: NavSection, lessonId?: string) => void }) {
  const { next, streak_days, active_today, modules, review } = plan
  const verb = next?.status === 'in_progress' ? 'Continue where you left off' : next?.status === 'available' ? 'Next lesson' : 'Start here'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{next ? verb : 'All caught up'}</span>
          <span title={active_today ? 'You have practised today' : streak_days > 0 ? 'Practise today to keep your streak' : 'Practise today to start a streak'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: streak_days > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            <Flame size={13} /> {streak_days} day{streak_days === 1 ? '' : 's'}
          </span>
        </div>
        {next ? (
          <>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{next.title}</div>
              <div style={{ fontSize: 12, color: COLOR[next.module] ?? 'var(--text-muted)' }}>{LABEL[next.module] ?? next.module}</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(SECTION(next.module), next.module === 'simulation' ? undefined : next.lesson_id)}>
              <Play size={12} /> {next.status === 'in_progress' ? 'Continue' : 'Open'}
            </button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>Every open lesson is complete. Try a project or a simulation to keep sharpening your skills.</div>
        )}
        {review.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><RotateCcw size={11} /> Worth another go</div>
            {review.map((r) => (
              <button key={r.exercise_id} className="btn btn-ghost btn-sm" style={{ display: 'block', textAlign: 'left', width: '100%', padding: '3px 4px' }} onClick={() => onOpen(SECTION(r.module))}>
                <span style={{ color: 'var(--text-primary)' }}>{r.title}</span> <span style={{ color: 'var(--text-muted)' }}>· {r.lesson_title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Progress by academy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modules.map((m) => {
            const pct = m.total ? Math.round((m.complete / m.total) * 100) : 0
            return (
              <div key={m.module} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onOpen(SECTION(m.module))} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(SECTION(m.module)) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{LABEL[m.module] ?? m.module}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{m.complete} / {m.total}</span>
                </div>
                <div className="progress-bar" aria-label={`${LABEL[m.module] ?? m.module}: ${pct}% complete`}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: COLOR[m.module] }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
