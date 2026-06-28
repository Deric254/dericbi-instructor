import React, { useEffect } from 'react'
import { useAuthStore } from './store'
import AppShell from './components/layout/AppShell'
import AuthScreen from './pages/AuthScreen'
import UpdateBanner from './components/ui/UpdateBanner'
import './styles/globals.css'

export default function App() {
  const { user, token, isLoading, setUser, setToken, setLoading } = useAuthStore()

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const result = await window.api.auth.validateSession(token)
        if (result.valid && result.user) {
          setUser(result.user)
        } else {
          // Token expired or invalid
          setToken(null)
          setUser(null)
        }
      } catch {
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    restore()
  }, []) // Run once on mount

  let content: React.ReactNode
  if (isLoading) {
    content = (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 48, height: 48,
          borderRadius: 14,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 32px var(--accent-glow)',
        }}>
          {/* BarChart2 inline SVG to avoid import issues at root level */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <div className="spinner" style={{ width: 20, height: 20 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>DericBI Instructor</span>
      </div>
    )
  } else if (!user) {
    content = <AuthScreen />
  } else {
    content = <AppShell />
  }

  return (
    <>
      {content}
      <UpdateBanner />
    </>
  )
}
