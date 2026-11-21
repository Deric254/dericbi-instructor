import React, { useEffect, useState } from 'react'
import { CheckCircle, Footprints } from 'lucide-react'
import { useAuthStore } from '../../store'
import { reportApiError } from '../../lib/apiError'

interface Task { task: string; did: string; learned: string; saved: boolean }

/**
 * "Do this in real life": the learner records what they actually did outside the app and what they learned. The app keeps their
 * words on this computer and never writes results for them. It is optional and never blocks completing a lesson.
 * Shows nothing for lessons that set no task.
 */
export default function RealWorldTask({ lessonId }: { lessonId: string }) {
  const { user } = useAuthStore()
  const [task, setTask] = useState<Task | null>(null)
  const [did, setDid] = useState('')
  const [learned, setLearned] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTask(null); setMsg(null); setDid(''); setLearned('')
    if (!user) return
    window.api.fieldwork.get(user.id, lessonId)
      .then((t: Task | null) => { if (t) { setTask(t); setDid(t.did); setLearned(t.learned) } })
      .catch(() => { /* no task shown; the lesson still works */ })
  }, [user, lessonId])

  if (!task) return null

  const save = async () => {
    if (!user || busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await window.api.fieldwork.save(user.id, lessonId, did, learned)
      if (r?.success) { setTask({ ...task, saved: true }); setMsg({ ok: true, text: 'Saved on this computer. It now appears in your Portfolio.' }) }
      else if (r?.reason === 'short') setMsg({ ok: false, text: 'Write a few words in each box, in your own words.' })
      else reportApiError('save your task', new Error('The task could not be saved'))
    } catch (err) { reportApiError('save your task', err) } finally { setBusy(false) }
  }

  const box: React.CSSProperties = { width: '100%', resize: 'vertical', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 12, padding: '8px 10px', outline: 'none' }
  return (
    <div className="card" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        <Footprints size={14} /> Do this in real life
        {task.saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)', marginLeft: 'auto' }}><CheckCircle size={12} /> Recorded</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{task.task}</div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)' }} htmlFor={`fw-did-${lessonId}`}>What I actually did</label>
      <textarea id={`fw-did-${lessonId}`} value={did} onChange={(e) => setDid(e.target.value)} rows={3} aria-label="What I did" placeholder="Who, how many, when. Only what really happened." style={box} />
      <label style={{ fontSize: 11, color: 'var(--text-muted)' }} htmlFor={`fw-learned-${lessonId}`}>What I learned</label>
      <textarea id={`fw-learned-${lessonId}`} value={learned} onChange={(e) => setLearned(e.target.value)} rows={3} aria-label="What I learned" placeholder="What surprised you, and what you will change." style={box} />
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || !did.trim() || !learned.trim()} onClick={save}>Save what I did</button>
      {msg && <div style={{ fontSize: 12, color: msg.ok ? 'var(--success)' : 'var(--text-secondary)' }}>{msg.text}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Optional. It does not stop you completing the lesson, and the app never fills this in for you.</div>
    </div>
  )
}
