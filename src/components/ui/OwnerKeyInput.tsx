import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { reportApiError } from '../../lib/apiError'

type Outcome = { success: boolean; error?: string; cancelled?: boolean }

/**
 * Lets the owner give the app the owner key: choose the key file, or paste its text. The key is used
 * once, in memory, and never stored by the app. Shared by "claim this computer" and "unlock signing".
 */
export default function OwnerKeyInput({ onChooseFile, onPaste, onDone, fileLabel = 'Choose my owner key file…' }: {
  onChooseFile: () => Promise<Outcome>
  onPaste: (text: string) => Promise<Outcome>
  onDone: () => void
  fileLabel?: string
}) {
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<Outcome>) {
    setError('')
    setBusy(true)
    try {
      const r = await action()
      if (r.success) onDone()
      else if (!r.cancelled) setError(r.error ?? 'That key was not accepted.')
    } catch (err) {
      reportApiError('use the owner key', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => run(onChooseFile)}>
        <FolderOpen size={14} /> {fileLabel}
      </button>
      {!pasting ? (
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPasting(true)}>Paste the key instead</button>
      ) : (
        <>
          <textarea
            className="input"
            style={{ minHeight: 70, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            placeholder="DBIN-OWNER-…"
            value={text}
            onChange={e => setText(e.target.value)}
            spellCheck={false}
            autoFocus
          />
          <button className="btn btn-primary" type="button" disabled={busy || !text.trim()} onClick={() => run(() => onPaste(text))}>
            Use this key
          </button>
        </>
      )}
      {error && <div style={{ padding: '8px 12px', background: 'var(--error-dim)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', color: 'var(--error)', fontSize: 12 }}>{error}</div>}
    </div>
  )
}
