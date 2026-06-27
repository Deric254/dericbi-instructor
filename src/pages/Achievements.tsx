import React, { useState, useEffect } from 'react'
import { Trophy, Star, Lock, CheckCircle, Zap, Award } from 'lucide-react'
import { useAuthStore } from '../store'

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 }
const RARITY_COLOR: Record<string, string> = {
  legendary: 'var(--legendary)', epic: 'var(--epic)',
  rare: 'var(--rare)', common: 'var(--common)',
}

export default function Achievements() {
  const { user } = useAuthStore()
  const [data, setData] = useState<{ earned: any[]; locked: any[] }>({ earned: [], locked: [] })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all')

  useEffect(() => {
    if (!user) return
    window.api.progress.achievements(user.id).then((d: any) => { setData(d); setLoading(false) })
  }, [user])

  const allAchs = [
    ...data.earned.map(a => ({ ...a, _earned: true })),
    ...data.locked.map(a => ({ ...a, _earned: false })),
  ].sort((a, b) => (RARITY_ORDER[a.rarity as keyof typeof RARITY_ORDER] ?? 3) - (RARITY_ORDER[b.rarity as keyof typeof RARITY_ORDER] ?? 3))

  const shown = allAchs.filter(a => {
    if (filter === 'earned') return a._earned
    if (filter === 'locked') return !a._earned
    return true
  })

  const totalPoints = data.earned.reduce((sum, a) => sum + (a.points || 0), 0)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius)', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--legendary)' }}>
          <Trophy size={16} />
        </div>
        <div>
          <h2>Achievements</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {data.earned.length} earned · {data.locked.length} remaining · {totalPoints.toLocaleString()} pts total
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['all', 'earned', 'locked'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', border: `1px solid ${filter === f ? 'var(--legendary)' : 'var(--border)'}`, background: filter === f ? 'rgba(251,191,36,0.12)' : 'transparent', color: filter === f ? 'var(--legendary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: filter === f ? 600 : 400, textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : (
          <>
            {/* Summary stats */}
            {filter === 'all' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
                {[
                  { label: 'Earned', value: data.earned.length, color: 'var(--success)', icon: <CheckCircle size={16} /> },
                  { label: 'Total Points', value: totalPoints.toLocaleString(), color: 'var(--legendary)', icon: <Star size={16} /> },
                  { label: 'Legendary', value: data.earned.filter(a => a.rarity === 'legendary').length, color: 'var(--legendary)', icon: <Award size={16} /> },
                  { label: 'Epic', value: data.earned.filter(a => a.rarity === 'epic').length, color: 'var(--epic)', icon: <Zap size={16} /> },
                ].map(s => (
                  <div key={s.label} className="card">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, color: s.color }}>{s.icon}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</span></div>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {shown.map(a => <AchCard key={a.id} ach={a} earned={a._earned} />)}
            </div>

            {shown.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <Trophy size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div>{filter === 'earned' ? 'No achievements earned yet.' : 'All achievements unlocked!'}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AchCard({ ach, earned }: { ach: any; earned: boolean }) {
  const color = RARITY_COLOR[ach.rarity] || 'var(--common)'
  const EMOJIS: Record<string, string> = {
    common: '⭐', rare: '💎', epic: '🔮', legendary: '🏆'
  }

  return (
    <div style={{ padding: '14px', borderRadius: 'var(--radius-lg)', border: `1px solid ${earned ? color + '40' : 'var(--border)'}`, background: earned ? color + '06' : 'var(--bg-surface)', opacity: earned ? 1 : 0.55, transition: 'all var(--transition)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: 'var(--radius)', background: earned ? color + '20' : 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {earned ? EMOJIS[ach.rarity] || '🏅' : '🔒'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: earned ? color : 'var(--text-muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ach.title}</div>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: color, background: color + '20', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>{ach.rarity}</span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 8 }}>{ach.description}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Star size={10} color="var(--legendary)" />
        <span style={{ fontSize: 11, color: 'var(--legendary)', fontWeight: 600 }}>{ach.points} pts</span>
        {earned && ach.earned_at && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {new Date(ach.earned_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}
