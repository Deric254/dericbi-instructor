import React, { useCallback, useEffect, useState } from 'react'
import { useAuthStore, useUIStore } from './store'
import AppShell from './components/layout/AppShell'
import AuthScreen from './pages/AuthScreen'
import LicenceGate from './pages/LicenceGate'
import LicenceBanner from './components/ui/LicenceBanner'
import UpdateBanner from './components/ui/UpdateBanner'
import { MinimalTitlebar } from './components/layout/Titlebar'
import type { LicenceState } from './types'
import './styles/globals.css'

// A licence can run out while the app is open, so it is re-checked every few minutes.
const LICENCE_RECHECK_MS = 5 * 60 * 1000

export default function App() {
  const { user, token, isLoading, setUser, setToken, setLoading } = useAuthStore()
  const theme = useUIStore((s) => s.theme)
  const setOwner = useUIStore((s) => s.setOwner)
  const [licence, setLicence] = useState<LicenceState | null>(null)
  const licenceChecked = licence !== null
  const activated = licence?.ok === true

  // Apply the persisted theme to the document root so the CSS variable
  // overrides in globals.css take effect everywhere, immediately.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Check the licence first, before anything else in the app runs, and keep checking.
  const refreshLicence = useCallback(() => {
    window.api.licence.state()
      .then((s) => { setLicence(s); setOwner(s.kind === 'owner') })
      .catch((err) => {
        console.error('[licence state]', err)
        setLicence({ ok: false, kind: 'unlicensed', message: 'The licence could not be checked.', installCode: '' })
      })
  }, [setOwner])

  useEffect(() => {
    refreshLicence()
    const timer = setInterval(refreshLicence, LICENCE_RECHECK_MS)
    return () => clearInterval(timer)
  }, [refreshLicence])

  // Restore session on mount — only once the licence is confirmed active,
  // so an unlicensed copy never gets far enough to touch user data.
  useEffect(() => {
    if (!licenceChecked || !activated) return
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
  }, [licenceChecked, activated]) // eslint-disable-line react-hooks/exhaustive-deps

  let content: React.ReactNode
  if (!licenceChecked) {
    content = <BootSplash />
  } else if (!activated) {
    content = <LicenceGate state={licence} onChanged={refreshLicence} />
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
      <LicenceBanner state={licence} />
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
