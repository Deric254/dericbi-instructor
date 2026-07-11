import React, { useEffect, useState } from 'react'
import {
  Shield, Users, BookOpen, Activity, Database, Trash2, RotateCcw,
  ShieldCheck, ShieldOff, AlertTriangle, Server, RefreshCw,
} from 'lucide-react'
import { useAuthStore, notify } from '../store'

export default function AdminPanel() {
  const { user } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) return
    window.api.admin.check(user.id).then((r: any) => {
      setIsAdmin(r.is_admin)
      setChecking(false)
    })
  }, [user])

  if (checking) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <Shield size={32} color="var(--text-muted)" />
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          This account doesn't have admin access.
        </p>
      </div>
    )
  }

  return <AdminDashboard />
}

function AdminDashboard() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [sysInfo, setSysInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{ type: 'reset' | 'delete'; target: any } | null>(null)

  const refresh = async () => {
    if (!user) return
    setLoading(true)
    const [usersRes, statsRes, sysRes] = await Promise.all([
      window.api.admin.usersList(user.id),
      window.api.admin.contentStats(user.id),
      window.api.admin.systemInfo(user.id),
    ])
    setUsers(usersRes.users)
    setStats(statsRes)
    setSysInfo(sysRes)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [user])

  const handleToggleAdmin = async (target: any) => {
    if (!user) return
    const res = await window.api.admin.setAdmin(user.id, target.id, !target.is_admin)
    if (res.success) {
      notify.success(target.is_admin ? 'Admin access removed' : 'Admin access granted', target.name)
      refresh()
    } else {
      notify.error('Could not update', res.error)
    }
  }

  const handleConfirmedAction = async () => {
    if (!confirmAction || !user) return
    const { type, target } = confirmAction
    if (type === 'reset') {
      const res = await window.api.admin.resetUserProgress(user.id, target.id)
      if (res.success) notify.success('Progress reset', `${target.name}'s learning progress was cleared.`)
      else notify.error('Could not reset', res.error)
    } else {
      const res = await window.api.admin.deleteUser(user.id, target.id)
      if (res.success) notify.success('User deleted', target.name)
      else notify.error('Could not delete', res.error)
    }
    setConfirmAction(null)
    refresh()
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 'var(--radius)',
            background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={17} color="var(--accent)" />
          </div>
          <div>
            <h2 style={{ color: 'var(--text-primary)' }}>Admin</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>User management, content, and system status</p>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon={<Users size={16} />} label="Total Users" value={stats?.totalUsers ?? 0} color="var(--accent)" />
        <StatCard icon={<BookOpen size={16} />} label="Lessons" value={stats?.lessons?.reduce((s: number, l: any) => s + l.count, 0) ?? 0} color="var(--sql-color)" />
        <StatCard icon={<Activity size={16} />} label="Exercise Attempts" value={stats?.totalAttempts ?? 0} color="var(--stats-color)" />
        <StatCard icon={<Database size={16} />} label="Datasets" value={stats?.datasets?.length ?? 0} color="var(--excel-color)" />
      </div>

      {/* Users table */}
      <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14 }}>Users ({users.length})</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['User', 'Role', 'Lessons', 'Exercises', 'Last Active', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.is_admin
                      ? <span className="badge badge-rare">Admin</span>
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.experience_level}</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{u.lessons_completed}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                    {u.exercises_correct}/{u.exercises_attempted}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 11 }}>
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <IconBtn title={u.is_admin ? 'Remove admin' : 'Make admin'} onClick={() => handleToggleAdmin(u)}>
                        {u.is_admin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                      </IconBtn>
                      <IconBtn title="Reset progress" onClick={() => setConfirmAction({ type: 'reset', target: u })}>
                        <RotateCcw size={13} />
                      </IconBtn>
                      <IconBtn title="Delete user" danger onClick={() => setConfirmAction({ type: 'delete', target: u })} disabled={u.id === user?.id}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content breakdown + system info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Content by Subject</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats?.lessons?.map((l: any) => {
              const exCount = stats.exercises?.find((e: any) => e.module === l.module)?.count ?? 0
              return (
                <div key={l.module} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{l.module}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{l.count} lessons · {exCount} exercises</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Server size={14} /> System
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <InfoRow label="App version" value={sysInfo?.appVersion} />
            <InfoRow label="Electron" value={sysInfo?.electronVersion} />
            <InfoRow label="Schema version" value={sysInfo?.schemaVersion} />
            <InfoRow label="Platform" value={sysInfo?.platform} />
            <InfoRow label="Data location" value={sysInfo?.userDataPath} mono />
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setConfirmAction(null)}>
          <div className="card" style={{ maxWidth: 380, width: '90%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={18} color="var(--error)" />
              <h3 style={{ fontSize: 14 }}>
                {confirmAction.type === 'reset' ? 'Reset progress?' : 'Delete this user?'}
              </h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              {confirmAction.type === 'reset'
                ? `This clears all lesson progress, exercise history, and skill ratings for ${confirmAction.target.name}. Their account, email, and password are untouched. This cannot be undone.`
                : `This permanently deletes ${confirmAction.target.name}'s account and everything tied to it — progress, projects, portfolio. This cannot be undone.`}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleConfirmedAction}>
                {confirmAction.type === 'reset' ? 'Reset progress' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="card">
      <div style={{
        width: 28, height: 28, borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, marginBottom: 8,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function IconBtn({ children, title, onClick, danger, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      title={disabled ? "You can't act on your own account here" : title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--error)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

function InfoRow({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{
        color: 'var(--text-secondary)', textAlign: 'right', wordBreak: 'break-all',
        fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 10.5 : 12,
      }}>
        {value ?? '—'}
      </span>
    </div>
  )
}
