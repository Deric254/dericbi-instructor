import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** If provided, clicking the recovery button calls this instead of doing
   * a full window reload — e.g. navigating back to the dashboard. Useful
   * for a boundary scoped to one page, where losing the whole app's state
   * (SQL sandboxes, chat history) over a crash in a single page would be
   * unnecessarily disruptive. */
  onReset?: () => void
  /** When any value in this array changes while the boundary is showing an
   * error, the error clears automatically — e.g. pass the current page's
   * section key so navigating away from a crashed page silently recovers
   * without the person needing to click anything. */
  resetKeys?: any[]
}

interface State {
  error: Error | null
}

/**
 * Without this, an unexpected exception anywhere in the render tree — a
 * bad data shape, a third-party chart library edge case, anything — takes
 * down the entire React app to a blank white screen with zero explanation
 * and zero recovery path, since Electron ships no devtools console for a
 * typical user to see what happened. This catches that class of failure
 * once, at the root, and offers a reload instead.
 *
 * This does NOT catch errors in event handlers, async code, or IPC calls —
 * those are already handled individually via reportApiError() and
 * try/catch throughout the app. This is specifically the backstop for
 * render-time crashes, which nothing else in the app currently covers.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.error || !this.props.resetKeys) return
    const changed = this.props.resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i])
    if (changed) this.setState({ error: null })
  }

  handleReload = () => {
    if (this.props.onReset) {
      this.setState({ error: null })
      this.props.onReset()
      return
    }
    // A full reload is the most reliable recovery here — resetting local
    // component state alone can't undo whatever led to the crash, since we
    // don't know what that was.
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: 24, textAlign: 'center', background: 'var(--bg-base, #0d1117)',
        }}>
          <AlertTriangle size={36} color="var(--error, #f87171)" />
          <div style={{ color: 'var(--text-primary, #e6edf3)', fontSize: 15, fontWeight: 600 }}>
            Something went wrong
          </div>
          <div style={{ color: 'var(--text-muted, #8b949e)', fontSize: 13, maxWidth: 380, lineHeight: 1.6 }}>
            The app hit an unexpected error and couldn't continue. Your progress is saved locally,
            so reloading is safe.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--accent, #49A078)', color: 'white', fontSize: 13, fontWeight: 600,
            }}
          >
            <RotateCcw size={13} /> {this.props.onReset ? 'Go Back' : 'Reload App'}
          </button>
          {/* Visible in dev builds and for anyone who opens devtools — never
              shown as the primary message since raw stack traces aren't
              useful to the students this app is sold to. */}
          <details style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted, #8b949e)', maxWidth: 420 }}>
            <summary style={{ cursor: 'pointer' }}>Technical details</summary>
            <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
