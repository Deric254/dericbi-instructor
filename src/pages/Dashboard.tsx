import React, { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen, CheckCircle, Clock, Target, Zap, TrendingUp,
  Award, Activity, ChevronRight, Flame, Database, FileSpreadsheet,
  Terminal, BarChart3, Briefcase, ArrowUpRight,
} from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import type { DashboardStats, SkillRating } from '../types'

const SKILL_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sql:              { label: 'SQL',              color: 'var(--sql-color)',      icon: <Database size={14} /> },
  excel:            { label: 'Excel',            color: 'var(--excel-color)',    icon: <FileSpreadsheet size={14} /> },
  python:           { label: 'Python',           color: 'var(--python-color)',   icon: <Terminal size={14} /> },
  powerbi:          { label: 'Power BI',         color: 'var(--powerbi-color)',  icon: <BarChart3 size={14} /> },
  statistics:       { label: 'Statistics',       color: 'var(--stats-color)',    icon: <TrendingUp size={14} /> },
  business_thinking:{ label: 'Business',         color: 'var(--business-color)', icon: <Briefcase size={14} /> },
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const { setActiveSection } = useUIStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    window.api.progress.dashboard(user.id).then((data: any) => {
      setStats(data)
      setLoading(false)
    })
  }, [user])

  if (loading) return <PageLoader />

  const rank = stats?.rank
  const greeting = getGreeting()

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>
          {greeting}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Here's where you stand today. Keep pushing.
        </p>
      </div>

      {/* Rank banner */}
      {rank && (
        <div style={{
          background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)',
          border: '1px solid var(--accent-dim)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 48, height: 48,
            borderRadius: 'var(--radius)',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Award size={22} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>
                {rank.current_rank_label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {rank.total_points.toLocaleString()} pts
              </span>
            </div>
            {rank.next_rank && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    → {rank.next_rank.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {rank.next_rank.points_needed.toLocaleString()} pts needed
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${rank.progress_pct}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<BookOpen size={16} />}
          label="Lessons Complete"
          value={`${stats?.lessons_complete ?? 0} / ${stats?.lessons_total ?? 0}`}
          color="var(--accent)"
        />
        <StatCard
          icon={<CheckCircle size={16} />}
          label="Exercise Accuracy"
          value={`${stats?.accuracy_pct ?? 0}%`}
          sub={`${stats?.exercises_attempted ?? 0} attempted`}
          color="var(--success)"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Time Invested"
          value={`${stats?.total_time_hours ?? 0}h`}
          color="var(--python-color)"
        />
        <StatCard
          icon={<Award size={16} />}
          label="Achievements"
          value={String(stats?.achievements_earned ?? 0)}
          color="var(--legendary)"
        />
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Skill Radar */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3>Skill Map</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Score out of 100</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(stats?.skill_ratings ?? []).map(s => (
              <SkillBar key={s.skill} rating={s} />
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Skill scores increase as you complete exercises, lessons, and projects. Scores decay slowly if a skill isn't practiced.
            </p>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Quick actions */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Jump Back In</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <QuickAction
                label="SQL Academy"
                desc="Continue lessons"
                color="var(--sql-color)"
                icon={<Database size={14} />}
                onClick={() => setActiveSection('sql')}
              />
              <QuickAction
                label="Python Playground"
                desc="Run live code"
                color="var(--python-color)"
                icon={<Terminal size={14} />}
                onClick={() => setActiveSection('python')}
              />
              <QuickAction
                label="Data Playground"
                desc="Explore a dataset"
                color="var(--accent)"
                icon={<Activity size={14} />}
                onClick={() => setActiveSection('playground')}
              />
              <QuickAction
                label="Simulations"
                desc="Analyst role-play"
                color="var(--sim-color)"
                icon={<Zap size={14} />}
                onClick={() => setActiveSection('simulations')}
              />
            </div>
          </div>

          {/* Recent activity */}
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 12 }}>Recent Activity</h3>
            {(stats?.recent_activity?.length ?? 0) === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                No activity yet. Start a lesson or run a SQL query to see your history here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats!.recent_activity.slice(0, 6).map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: a.type === 'query' ? 'var(--sql-color)' : 'var(--accent)',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                      {a.description}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatRelativeTime(a.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30,
          borderRadius: 'var(--radius)',
          background: `${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          {icon}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function SkillBar({ rating }: { rating: SkillRating }) {
  const meta = SKILL_META[rating.skill]
  if (!meta) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: meta.color }}>
          {meta.icon}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{meta.label}</span>
        </div>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: meta.color, fontWeight: 700 }}>
          {Math.round(rating.score)}
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${rating.score}%`, background: meta.color }} />
      </div>
    </div>
  )
}

function QuickAction({ label, desc, color, icon, onClick }: {
  label: string; desc: string; color: string; icon: React.ReactNode; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${hov ? color + '50' : 'var(--border)'}`,
        background: hov ? `${color}10` : 'transparent',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 28, height: 28,
        borderRadius: 'var(--radius-sm)',
        background: `${color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <ChevronRight size={13} color="var(--text-muted)" />
    </button>
  )
}

function PageLoader() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRelativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}


