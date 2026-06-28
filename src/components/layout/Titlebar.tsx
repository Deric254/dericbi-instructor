import React, { useState, useEffect } from 'react'
import { Minus, Square, X, Sparkles, Sun, Moon } from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import { LogoMark } from '../ui/AppLogo'
import { SECTIONS_WITH_OWN_INSTRUCTOR } from '../ui/GlobalInstructor'

export default function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { user } = useAuthStore()
  const { activeSection, instructorOpen, toggleInstructor, theme, toggleTheme } = useUIStore()
  const showInstructorToggle = !!user && !SECTIONS_WITH_OWN_INSTRUCTOR.has(activeSection)

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

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', WebkitAppRegion: 'no-drag' } as any}>
        <WinBtn
          icon={theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          slim
        />

        {showInstructorToggle && (
          <button
            onClick={toggleInstructor}
            title="Ask the AI Instructor"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 26,
              padding: '0 10px',
              margin: '0 8px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${instructorOpen ? 'var(--accent)' : 'var(--border)'}`,
              background: instructorOpen ? 'var(--accent-dim)' : 'transparent',
              color: instructorOpen ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              transition: 'all var(--transition)',
            }}
          >
            <Sparkles size={12} />
            AI Instructor
          </button>
        )}

        {/* Window controls */}
        <div style={{ display: 'flex' }}>
          <WinBtn icon={<Minus size={12} />} onClick={() => window.api?.window.minimize()} />
          <WinBtn icon={<Square size={10} />} onClick={handleMaximize} />
          <WinBtn icon={<X size={12} />} onClick={() => window.api?.window.close()} danger />
        </div>
      </div>
    </div>
  )
}

function WinBtn({ icon, onClick, danger, title, slim }: {
  icon: React.ReactNode; onClick: () => void; danger?: boolean; title?: string; slim?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: slim ? 32 : 42, height: 'var(--titlebar-height)',
        border: 'none',
        background: hovered ? (danger ? 'var(--error)' : 'var(--bg-overlay)') : 'transparent',
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
