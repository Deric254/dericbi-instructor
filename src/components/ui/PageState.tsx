import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/** Centered spinner for a page's initial data load. */
export function PageLoader() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )
}

/**
 * Centered, friendly error state for when a page's initial data load fails
 * outright (as opposed to a background refresh, which should just toast).
 * Always offers a retry so a transient DB/IPC hiccup never strands the user.
 */
export function PageError({
  message = "We couldn't load this page.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center',
    }}>
      <AlertTriangle size={28} color="var(--error)" />
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 320 }}>{message}</div>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RotateCcw size={13} /> Try again
        </button>
      )}
    </div>
  )
}
