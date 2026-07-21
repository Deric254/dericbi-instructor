import React, { useEffect, useState } from 'react'
import { useAuthStore, useUIStore } from './store'
import AppShell from './components/layout/AppShell'
import AuthScreen from './pages/AuthScreen'
import LicenseGate from './pages/LicenseGate'
import UpdateBanner from './components/ui/UpdateBanner'
import { MinimalTitlebar } from './components/layout/Titlebar'
import './styles/globals.css'

export default function App() {
  const { user, token, isLoading, setUser, setToken, setLoading } = useAuthStore()
  const theme = useUIStore((s) => s.theme)
  const [licenseChecked, setLicenseChecked] = useState(false)
  const [activated, setActivated] = useState(false)

  // Apply the persisted theme to the document root so the CSS variable
  // overrides in globals.css take effect everywhere, immediately.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Check license activation first, before anything else in the app runs.
  useEffect(() => {
    window.api.license.status()
      .then((r) => setActivated(r.activated))
      .catch((err) => { console.error('[license status]', err); setActivated(false) })
      .finally(() => setLicenseChecked(true))
  }, [])

  // Restore session on mount — only once the license is confirmed active,
  // so an unlicensed copy never gets far enough to touch user data.
  useEffect(() => {
    if (!licenseChecked || !activated) return
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
  }, [licenseChecked, activated]) // eslint-disable-line react-hooks/exhaustive-deps

  let content: React.ReactNode
  if (!licenseChecked) {
    content = <BootSplash />
  } else if (!activated) {
    content = <LicenseGate onActivated={() => setActivated(true)} />
  } else if (isLoading) {
    content = <BootSplash />
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

function BootSplash() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MinimalTitlebar />
      <div style={{
        flex: 1,
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
    </div>
  )
}
