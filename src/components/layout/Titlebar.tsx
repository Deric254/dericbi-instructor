import React, { useState, useEffect } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { useAuthStore } from '../../store'
import { LogoMark } from '../ui/AppLogo'

export default function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { user } = useAuthStore()

  useEffect(() => {
    window.api?.window.isMaximized().then(setIsMaximized)
  }, [])

  const handleMaximize = async () => {
    await window.api?.window.maximize()
    const max = await window.api?.window.isMaximized()
    setIsMaximized(max ?? false)
  }

  return (
    <div style={{
      height: 'var(--titlebar-height)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      WebkitAppRegion: 'drag',
      flexShrink: 0,
      paddingLeft: 12,
      userSelect: 'none',
    } as any}>
      {/* Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LogoMark size={22} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          DericBI Instructor
        </span>
        {user && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>
            — {user.name}
          </span>
        )}
      </div>

      {/* Window controls */}
      <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' } as any}>
        <WinBtn icon={<Minus size={12} />} onClick={() => window.api?.window.minimize()} />
        <WinBtn icon={<Square size={10} />} onClick={handleMaximize} />
        <WinBtn icon={<X size={12} />} onClick={() => window.api?.window.close()} danger />
      </div>
    </div>
  )
}

function WinBtn({ icon, onClick, danger }: {
  icon: React.ReactNode; onClick: () => void; danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 42, height: 'var(--titlebar-height)',
        border: 'none',
        background: hovered ? (danger ? '#ef4444' : 'rgba(255,255,255,0.08)') : 'transparent',
        color: hovered && danger ? 'white' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {icon}
    </button>
  )
}
