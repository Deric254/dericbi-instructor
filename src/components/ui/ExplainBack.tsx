import React, { useEffect, useState } from 'react'
import { CheckCircle, MessageSquare } from 'lucide-react'
import { useAuthStore } from '../../store'
import { reportApiError } from '../../lib/apiError'

interface Outcome { passed: boolean; reason?: 'short' | 'copied'; covered: string[]; missing: string[] }

/**
 * "Explain it back": the learner says the idea in their own words. The app checks that the key ideas are there (it cannot judge
 * understanding, and says so); a lesson that asks for this cannot be completed until it is passed. Shows nothing for lessons
 * that do not ask for an explanation.
 */
export default function ExplainBack({ lessonId }: { lessonId: string }) {
  const { user } = useAuthStore()
  const [prompt, setPrompt] = useState<string | null>(null)
  const [passed, setPassed] = useState(false)
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  // Real attempts that did not match the key ideas (the learner may simply have used other words).
  const [misses, setMisses] = useState(0)

  useEffect(() => {
    setPrompt(null); setOutcome(null); setPassed(false); setText(''); setMisses(0)
    if (!user) return
    window.api.explain.get(user.id, lessonId)
      .then((e: { prompt: string; passed: boolean; last_answer: string } | null) => { if (e) { setPrompt(e.prompt); setPassed(e.passed); setText(e.last_answer) } })
      .catch(() => { /* no explain step shown; the lesson still works */ })
  }, [user, lessonId])

  if (!prompt) return null

  const check = async () => {
    if (!user || busy) return
    setBusy(true)
    try {
      const r = await window.api.explain.submit(user.id, lessonId, text)
      if (r?.success) { setOutcome(r); if (r.passed) setPassed(true); else if (!r.reason) setMisses((m) => m + 1) }
      else reportApiError('check your explanation', new Error('The explanation could not be checked'))
    } catch (err) { reportApiError('check your explanation', err) } finally { setBusy(false) }
  }

  // The check looks for key ideas in plain words, so it can miss a good explanation written differently. After two real misses the
  // learner can say they have compared it with the ideas and understand; it never blocks a genuine attempt.
  const confirm = async () => {
    if (!user || busy) return
    setBusy(true)
    try {
      const r = await window.api.explain.confirm(user.id, lessonId)
      if (r?.success) { setPassed(true); setOutcome(null) } else reportApiError('confirm your explanation', new Error('It could not be confirmed'))
    } catch (err) { reportApiError('confirm your explanation', err) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        <MessageSquare size={14} /> Explain it back
        {passed && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)', marginLeft: 'auto' }}><CheckCircle size={12} /> Done</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{prompt}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Your explanation" placeholder="Write it in your own words, as if to a friend."
        style={{ width: '100%', resize: 'vertical', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 12, padding: '8px 10px', outline: 'none' }} />
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !text.trim()} onClick={check}>Check my explanation</button>
      {outcome && (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: outcome.passed ? 'var(--success)' : 'var(--text-secondary)' }}>
          {outcome.reason === 'short' && 'Say a little more: a few sentences, in your own words.'}
          {outcome.reason === 'copied' && 'That is very close to the lesson text. Put it in your own words, as you would say it to a friend.'}
          {!outcome.reason && outcome.passed && 'Good: you covered the key ideas. This check looks for the ideas, not your understanding, so the tutor can read it with you if you want more.'}
          {!outcome.reason && !outcome.passed && (
            <>Not quite yet. Try to include:
              <ul style={{ margin: '4px 0 0 18px' }}>{outcome.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {!passed && misses >= 2 && outcome && !outcome.passed && !outcome.reason && (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>This check looks for particular words, so a good explanation in different words can be missed. Compare yours with the ideas above. If you cover them in your own way, you can go on. You can also use "Check my explanation" in the AI tutor for a fuller read.</span>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={confirm}>I have compared it and I understand this</button>
        </div>
      )}
    </div>
  )
}
