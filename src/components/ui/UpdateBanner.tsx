import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

/**
 * A lightweight, read-only download-progress indicator.
 *
 * The actual "an update is available, download it?" and "downloaded,
 * restart now?" prompts are native OS dialogs shown directly from the main
 * process (electron/main.ts) — asking permission at both stages, never
 * downloading or installing without the user saying yes. This component
 * only appears in the moment between "user clicked Download Update" and
 * the download finishing, so they have some visual confirmation it's
 * actually happening.
 *
 * Local progress/account data lives in the OS user-data folder, completely
 * separate from the app's installed files — installing a new version (or
 * reinstalling an older one from the GitHub Releases page) never touches it.
 */
export default function UpdateBanner() {
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    const api = window.api?.updater
    if (!api) return // no-op outside Electron (e.g. a stray web preview)

    api.onProgress((p: any) => {
      setProgress(Math.round(p?.percent ?? 0))
    })
  }, [])

  if (progress === null || progress >= 100) return null

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
      <Download size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Downloading update…
        </div>
        <div className="progress-bar" style={{ marginTop: 5 }}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}
