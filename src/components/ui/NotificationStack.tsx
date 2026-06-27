import React, { useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X, Trophy } from 'lucide-react'
import { useNotificationStore } from '../../store'

export default function NotificationStack() {
  const { notifications, remove } = useNotificationStore()

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {notifications.map(n => (
        <Toast key={n.id} notification={n} onClose={() => remove(n.id)} />
      ))}
    </div>
  )
}

function Toast({ notification: n, onClose }: { notification: any; onClose: () => void }) {
  const isAchievement = n.type === 'achievement'

  const colors = {
    success: 'var(--success)',
    error: 'var(--error)',
    warning: 'var(--warning)',
    info: 'var(--info)',
    achievement: 'var(--legendary)',
  }

  const icons = {
    success: <CheckCircle size={15} />,
    error: <XCircle size={15} />,
    warning: <AlertTriangle size={15} />,
    info: <Info size={15} />,
    achievement: <Trophy size={15} />,
  }

  const color = colors[n.type as keyof typeof colors] ?? 'var(--accent)'

  return (
    <div
      style={{
        pointerEvents: 'all',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)',
        border: `1px solid ${color}50`,
        boxShadow: `var(--shadow-lg), 0 0 20px ${color}20`,
        minWidth: 280,
        maxWidth: 360,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{ color, flexShrink: 0, marginTop: 1 }}>
        {icons[n.type as keyof typeof icons]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {n.title}
        </div>
        {n.message && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {n.message}
          </div>
        )}
        {isAchievement && n.achievement && (
          <div style={{ fontSize: 12, color, marginTop: 4 }}>
            🏆 {n.achievement.title} — +{n.achievement.points} pts
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
          padding: 2, flexShrink: 0,
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}
