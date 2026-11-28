import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Circle, Lock, Trophy } from 'lucide-react'
import { useAuthStore } from '../../store'
import { PageError } from './PageState'
import { reportApiError } from '../../lib/apiError'

interface MapLesson { id: string; title: string; module: string; status: string }
interface MapSkill { id: number; title: string; problem: string; lessons: MapLesson[]; complete: number; total: number }
interface Map8 { skills: MapSkill[]; capstone: MapLesson | null }

const MODULE_LABEL: Record<string, string> = { sql: 'SQL', excel: 'Excel', python: 'Python', powerbi: 'Power BI', statistics: 'Statistics', business: 'Business', dataeng: 'Data Engineering', bizsolver: 'Business Problem Solver' }

const statusIcon = (status: string) =>
  status === 'complete' ? <CheckCircle size={14} color="var(--success)" /> : status === 'locked' ? <Lock size={13} color="var(--text-muted)" /> : <Circle size={14} color="var(--sql-color)" />

/** The eight business skills: what each one solves and every lesson, in any academy, that builds it. */
export default function SkillMap({ onOpen }: { onOpen: (module: string, lessonId: string) => void }) {
  const { user } = useAuthStore()
  const [map, setMap] = useState<Map8 | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    if (!user) return
    setError(false)
    window.api.progress.skillMap(user.id)
      .then((m: Map8) => setMap(m))
      .catch((err: any) => { reportApiError('load your skill map', err); setError(true) })
  }, [user])

  useEffect(load, [load])

  if (error) return <PageError message="Couldn't load the skill map." onRetry={load} />
  if (!map) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  const open = (l: MapLesson) => { if (l.status !== 'locked') onOpen(l.module, l.id) }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 720, marginBottom: 18 }}>
        Eight skills turn data into decisions an owner can trust. Each one solves a real business problem and is practised in code, not only read.
        Lessons from other academies that support a skill are listed with it.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        {map.skills.map((s) => {
          const pct = s.total ? Math.round((s.complete / s.total) * 100) : 0
          return (
            <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.id}. {s.title}</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.complete} / {s.total}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{s.problem}</div>
              <div className="progress-bar" aria-label={`${s.title}: ${pct}% complete`}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--sql-color)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.lessons.map((l) => (
                  <button key={l.id} className="btn btn-ghost btn-sm" disabled={l.status === 'locked'} onClick={() => open(l)} title={l.title}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%', padding: '4px 6px', minWidth: 0 }}>
                    <span style={{ flexShrink: 0, display: 'flex' }}>{statusIcon(l.status)}</span>
                    <span style={{ color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{MODULE_LABEL[l.module] ?? l.module}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {map.capstone && (
        <div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Trophy size={18} color="var(--sql-color)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{map.capstone.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Brings all eight skills together: find the leaks, value them and write findings an owner can act on and check.</div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={map.capstone.status === 'locked'} onClick={() => open(map.capstone!)}>
            {map.capstone.status === 'complete' ? 'Review' : 'Open'}
          </button>
        </div>
      )}
    </div>
  )
}
