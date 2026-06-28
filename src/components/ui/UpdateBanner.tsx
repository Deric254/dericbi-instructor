import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'

type Phase = 'idle' | 'downloading' | 'downloaded'

/**
 * Surfaces the app's auto-update flow (electron-updater, wired in
 * electron/main.ts) to the user. The main process checks GitHub Releases
 * shortly after launch; this component reacts to what it finds:
 *
 *   update-available  -> start a background download (no prompt needed,
 *                          this can't disrupt anything the user is doing)
 *   download-progress -> show a small progress indicator
 *   update-downloaded  -> ask the user to restart, or let them keep working
 *                          (main.ts has autoInstallOnAppQuit=true, so it
 *                          installs automatically next time they quit even
 *                          if they dismiss this)
 *
 * Local progress/account data lives in the OS user-data folder, completely
 * separate from the app's installed files — installing a new version (or
 * reinstalling an older one from the GitHub Releases page) never touches it.
 */
export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = window.api?.updater
    if (!api) return // no-op outside Electron (e.g. a stray web preview)

    api.onAvailable((info: any) => {
      setVersion(info?.version ?? null)
      setPhase('downloading')
      setDismissed(false)
      api.download().catch(() => { /* surfaced via onError below */ })
    })
    api.onProgress((p: any) => {
      setProgress(Math.round(p?.percent ?? 0))
    })
    api.onDownloaded(() => {
      setPhase('downloaded')
      setDismissed(false)
    })
    api.onError(() => {
      // A failed background check (e.g. offline) shouldn't interrupt anyone.
    })
  }, [])

  if (dismissed || phase === 'idle') return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 20,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-lg)',
      minWidth: 270,
      maxWidth: 360,
    }}>
      {phase === 'downloaded' ? (
        <>
          <RefreshCw size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              Update ready{version ? ` — v${version}` : ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Your progress is saved. Restart to apply.
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 11, padding: '6px 10px', flexShrink: 0 }}
            onClick={() => window.api.updater.install()}
          >
            Restart
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Remind me later"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <Download size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              Downloading update{version ? ` v${version}` : ''}…
            </div>
            <div className="progress-bar" style={{ marginTop: 5 }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
