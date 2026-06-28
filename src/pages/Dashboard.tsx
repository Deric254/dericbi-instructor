import React, { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpen, CheckCircle, Clock, TrendingUp,
  Award, ChevronRight, Database, FileSpreadsheet,
  Terminal, BarChart3, Briefcase, Users, FlaskConical,
  Table2, FolderOpen, Trophy, Sparkles,
} from 'lucide-react'
import { useAuthStore, useUIStore } from '../store'
import type { DashboardStats, SkillRating, NavSection } from '../types'
import AppLogo from '../components/ui/AppLogo'

const SKILL_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sql:              { label: 'SQL',              color: 'var(--sql-color)',      icon: <Database size={14} /> },
  excel:            { label: 'Excel',            color: 'var(--excel-color)',    icon: <FileSpreadsheet size={14} /> },
  python:           { label: 'Python',           color: 'var(--python-color)',   icon: <Terminal size={14} /> },
  powerbi:          { label: 'Power BI',         color: 'var(--powerbi-color)',  icon: <BarChart3 size={14} /> },
  statistics:       { label: 'Statistics',       color: 'var(--stats-color)',    icon: <TrendingUp size={14} /> },
  business_thinking:{ label: 'Business',         color: 'var(--business-color)', icon: <Briefcase size={14} /> },
}

// ─────────────────────────────────────────────
// LEARNING JOURNEY — every section, in the order
// a new analyst would naturally move through them.
// ─────────────────────────────────────────────
interface JourneyItem {
  id: NavSection
  label: string
  desc: string
  icon: React.ReactNode
  color: string
}
interface JourneyGroup {
  phase: string
  items: JourneyItem[]
}

const JOURNEY: JourneyGroup[] = [
  {
    phase: 'Academies',
    items: [
      { id: 'sql',        label: 'SQL',        desc: 'Query real databases — SELECT, joins, subqueries.',     icon: <Database size={16} />,       color: 'var(--sql-color)' },
      { id: 'excel',      label: 'Excel',      desc: 'Formulas, PivotTables, and dashboards.',                  icon: <FileSpreadsheet size={16} />, color: 'var(--excel-color)' },
      { id: 'python',     label: 'Python',     desc: 'Data wrangling and automation with real code.',          icon: <Terminal size={16} />,       color: 'var(--python-color)' },
      { id: 'powerbi',    label: 'Power BI',   desc: 'Interactive dashboards that tell a story.',              icon: <BarChart3 size={16} />,      color: 'var(--powerbi-color)' },
      { id: 'statistics', label: 'Statistics', desc: 'The numbers behind the charts — tests & inference.',     icon: <TrendingUp size={16} />,     color: 'var(--stats-color)' },
      { id: 'business',   label: 'Business',   desc: 'Think like an analyst — frame and recommend.',          icon: <Briefcase size={16} />,      color: 'var(--business-color)' },
    ],
  },
  {
    phase: 'Practice',
    items: [
      { id: 'simulations', label: 'Simulations',    desc: 'Role-play real analyst scenarios under pressure.', icon: <Users size={16} />,        color: 'var(--sim-color)' },
      { id: 'playground',  label: 'Data Playground', desc: 'Explore any dataset freely — no script needed.',   icon: <FlaskConical size={16} />, color: 'var(--playground-color)' },
      { id: 'datasets',    label: 'Datasets',       desc: 'Bundled business datasets, or import your own.',    icon: <Table2 size={16} />,       color: 'var(--text-secondary)' },
    ],
  },
  {
    phase: 'Output',
    items: [
      { id: 'projects',     label: 'Projects',     desc: 'Turn lessons into portfolio-ready deliverables.', icon: <FolderOpen size={16} />, color: 'var(--text-secondary)' },
      { id: 'portfolio',    label: 'Portfolio',    desc: 'Showcase your completed work and case studies.',  icon: <BookOpen size={16} />,   color: 'var(--text-secondary)' },
      { id: 'achievements', label: 'Achievements', desc: 'Badges and milestones as you level up.',          icon: <Trophy size={16} />,     color: 'var(--legendary)' },
    ],
  },
]

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
  const isNewcomer = (stats?.lessons_complete ?? 0) === 0 && (stats?.exercises_attempted ?? 0) === 0

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {/* Hero / Welcome */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 22,
        padding: '18px 20px',
        borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
        border: '1px solid var(--border)',
      }}>
        <AppLogo size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ marginBottom: 2 }}>
            {greeting}, {user?.name?.split(' ')[0]} 👋
          </h1>
          {isNewcomer && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Your personal analytics mentor — SQL, Excel, Python, Power BI, Statistics, and Business.
            </p>
          )}
        </div>
        {isNewcomer && (
          <button
            className="btn btn-primary"
            onClick={() => setActiveSection('sql')}
            style={{ flexShrink: 0 }}
          >
            <Sparkles size={14} /> Start with SQL
          </button>
        )}
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

      {/* Learning Journey — every page, chronologically organized */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 14 }}>Your Learning Journey</h3>

        {(() => {
          let counter = 0
          return JOURNEY.map(group => (
            <div key={group.phase} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {group.phase}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {group.items.map(item => {
                  counter += 1
                  return (
                    <JourneyCard
                      key={item.id}
                      order={counter}
                      item={item}
                      onClick={() => setActiveSection(item.id)}
                    />
                  )
                })}
              </div>
            </div>
          ))
        })()}
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
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
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

function JourneyCard({ order, item, onClick }: {
  order: number; item: JourneyItem; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        textAlign: 'left',
        cursor: 'pointer',
        background: hov ? 'var(--bg-overlay)' : 'var(--bg-surface)',
        border: `1px solid ${hov ? item.color : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '12px 14px',
        transition: 'all var(--transition)',
      }}
    >
      <div style={{
        width: 30, height: 30,
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: item.color, flexShrink: 0, position: 'relative',
      }}>
        {item.icon}
        <span style={{
          position: 'absolute', top: -6, left: -6,
          width: 16, height: 16, borderRadius: '50%',
          background: 'var(--bg-base)', border: '1px solid var(--border-strong)',
          fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {order}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {item.desc}
        </div>
      </div>
      <ChevronRight size={14} color={hov ? item.color : 'var(--text-muted)'} style={{ flexShrink: 0, marginTop: 2 }} />
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


