import React, { useState, useRef } from 'react'
import {
  LayoutDashboard, Database, FileSpreadsheet, Terminal,
  BarChart3, TrendingUp, Briefcase, FlaskConical,
  Table2, FolderOpen, BookOpen, Trophy, Settings,
  ChevronLeft, ChevronRight, Cpu, Users, LogOut,
} from 'lucide-react'
import { useAuthStore, useUIStore } from '../../store'
import type { NavSection } from '../../types'

interface NavItem {
  id: NavSection
  label: string
  icon: React.ReactNode
  color?: string
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: <LayoutDashboard size={16} /> },

  // Learning modules
  { id: 'sql',         label: 'SQL',          icon: <Database size={16} />,       color: 'var(--sql-color)',      section: 'Academies' },
  { id: 'excel',       label: 'Excel',        icon: <FileSpreadsheet size={16} />, color: 'var(--excel-color)' },
  { id: 'python',      label: 'Python',       icon: <Terminal size={16} />,       color: 'var(--python-color)' },
  { id: 'powerbi',     label: 'Power BI',     icon: <BarChart3 size={16} />,      color: 'var(--powerbi-color)' },
  { id: 'statistics',  label: 'Statistics',   icon: <TrendingUp size={16} />,     color: 'var(--stats-color)' },
  { id: 'business',    label: 'Business',     icon: <Briefcase size={16} />,      color: 'var(--business-color)' },

  // Practice
  { id: 'simulations', label: 'Simulations',  icon: <Users size={16} />,          color: 'var(--sim-color)',      section: 'Practice' },
  { id: 'playground',  label: 'Playground',   icon: <FlaskConical size={16} />,   color: '#818cf8' },
  { id: 'datasets',    label: 'Datasets',     icon: <Table2 size={16} /> },

  // Output
  { id: 'projects',    label: 'Projects',     icon: <FolderOpen size={16} />,                                     section: 'Output' },
  { id: 'portfolio',   label: 'Portfolio',    icon: <BookOpen size={16} /> },
  { id: 'achievements',label: 'Achievements', icon: <Trophy size={16} /> },

  // Config
  { id: 'settings',    label: 'Settings',     icon: <Settings size={16} />,                                       section: 'System' },
]

export default function Sidebar() {
  const { activeSection, sidebarCollapsed, setActiveSection, toggleSidebar } = useUIStore()
  const { user, token, logout: storeLogout } = useAuthStore()
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLogoutClick = async () => {
    if (!confirmingLogout) {
      setConfirmingLogout(true)
      confirmTimer.current = setTimeout(() => setConfirmingLogout(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    if (token) await window.api.auth.logout(token)
    storeLogout()
    setActiveSection('dashboard')
  }

  const width = sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)'

  return (
    <aside style={{
      width,
      minWidth: width,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width var(--transition-slow), min-width var(--transition-slow)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
        {renderNavItems()}
      </nav>

      {/* User info */}
      {!sidebarCollapsed && user && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-full)',
            background: user.avatar_color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: 'white',
            flexShrink: 0,
          }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user.experience_level}
            </div>
          </div>
        </div>
      )}

      {/* Log out */}
      {user && (
        <LogoutButton
          collapsed={sidebarCollapsed}
          confirming={confirmingLogout}
          onClick={handleLogoutClick}
        />
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        style={{
          padding: '10px',
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-end',
          paddingRight: sidebarCollapsed ? 10 : 14,
          transition: 'color var(--transition)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  )

  function renderNavItems() {
    const elements: React.ReactNode[] = []
    let currentSection = ''

    for (const item of NAV_ITEMS) {
      if (item.section && item.section !== currentSection) {
        currentSection = item.section
        if (!sidebarCollapsed) {
          elements.push(
            <div key={`section-${item.section}`} style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '10px 8px 4px',
            }}>
              {item.section}
            </div>
          )
        } else {
          elements.push(
            <div key={`section-${item.section}`} style={{
              height: 1,
              background: 'var(--border)',
              margin: '6px 4px',
            }} />
          )
        }
      }

      const isActive = activeSection === item.id
      elements.push(
        <NavBtn
          key={item.id}
          item={item}
          isActive={isActive}
          collapsed={sidebarCollapsed}
          onClick={() => setActiveSection(item.id)}
        />
      )
    }

    return elements
  }
}

function LogoutButton({ collapsed, confirming, onClick }: {
  collapsed: boolean
  confirming: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const active = confirming || hovered
  const color = confirming ? 'var(--error)' : hovered ? 'var(--error)' : 'var(--text-secondary)'
  const bg = confirming ? 'var(--error-dim)' : hovered ? 'var(--bg-overlay)' : 'transparent'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? (confirming ? 'Click to confirm logout' : 'Log Out') : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        margin: collapsed ? '0 6px 6px' : '0 8px 6px',
        padding: collapsed ? '8px' : '7px 8px',
        borderRadius: 'var(--radius)',
        border: `1px solid ${confirming ? 'var(--error)' : 'transparent'}`,
        background: bg,
        color,
        cursor: 'pointer',
        transition: 'all var(--transition)',
        justifyContent: collapsed ? 'center' : 'flex-start',
        width: collapsed ? undefined : 'calc(100% - 16px)',
      }}
    >
      <LogOut size={16} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap' }}>
          {confirming ? 'Click to confirm' : 'Log Out'}
        </span>
      )}
    </button>
  )
}

function NavBtn({ item, isActive, collapsed, onClick }: {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const bg = isActive ? 'var(--accent-dim)' : hovered ? 'var(--bg-overlay)' : 'transparent'
  const color = isActive ? 'var(--accent)' : item.color && hovered ? item.color : 'var(--text-secondary)'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: collapsed ? '8px' : '7px 8px',
        borderRadius: 'var(--radius)',
        border: isActive ? '1px solid var(--accent-dim)' : '1px solid transparent',
        background: bg,
        color,
        cursor: 'pointer',
        transition: 'all var(--transition)',
        justifyContent: collapsed ? 'center' : 'flex-start',
        marginBottom: 1,
      }}
    >
      <span style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        color: isActive ? 'var(--accent)' : item.color && hovered ? item.color : 'var(--text-secondary)',
      }}>
        {item.icon}
      </span>
      {!collapsed && (
        <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>
          {item.label}
        </span>
      )}
      {isActive && !collapsed && (
        <div style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: 'var(--accent)',
          marginLeft: 'auto',
        }} />
      )}
    </button>
  )
}
