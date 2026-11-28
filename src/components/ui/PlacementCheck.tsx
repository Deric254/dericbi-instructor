import { useEffect, useState } from 'react'
import { CheckCircle, Compass } from 'lucide-react'
import { useAuthStore } from '../../store'
import { PageError } from './PageState'
import { reportApiError } from '../../lib/apiError'

interface Question { id: string; concept: string; question: string; options: string[] }
interface Result { known: Array<{ lesson_id: string; concept: string }>; total: number }
interface Placement { questions: Question[]; result: Result | null }

/** A line on the lesson list: offers the check, or says what it found. */
export function PlacementBanner({ onStart }: { onStart: () => void }) {
  const { user } = useAuthStore()
  const [result, setResult] = useState<Result | null | undefined>(undefined)

  useEffect(() => {
    if (!user) return
    window.api.placement.get(user.id).then((p: Placement) => setResult(p.result)).catch(() => setResult(undefined))
  }, [user])

  if (result === undefined) return null
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <Compass size={18} color="var(--fd-color)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {result === null
          ? 'Already know some of this? A short check lets you skip what you know. Or just start at lesson 1.'
          : `Placement check done: you showed you know ${result.known.length} of ${result.total} lessons. Those stay open if you want them.`}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onStart}>{result === null ? 'Check what I know' : 'Take it again'}</button>
    </div>
  )
}

/** The placement check: every question is marked by the app, and "I don't know yet" is always a fair answer. */
export default function PlacementCheck({ onDone }: { onDone: () => void }) {
  const { user } = useAuthStore()
  const [data, setData] = useState<Placement | null>(null)
  const [error, setError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const load = () => {
    if (!user) return
    setError(false)
    window.api.placement.get(user.id).then((p: Placement) => setData(p)).catch((err: any) => { reportApiError('load the placement check', err); setError(true) })
  }
  useEffect(load, [user])

  if (error) return <PageError message="Couldn't load the placement check." onRetry={load} />
  if (!data) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  if (result) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
        <div className="card" style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            <CheckCircle size={18} color="var(--success)" /> Check finished
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {result.known.length === 0
              ? 'You will start at lesson 1. That is the right place to begin.'
              : `You already know: ${result.known.map((k) => k.concept).join(', ')}. Those lessons stay open if you want them, and your next lesson is the first one you have not shown yet.`}
          </p>
          <button className="btn btn-primary" onClick={onDone}>Go to my lessons</button>
        </div>
      </div>
    )
  }

  const total = data.questions.length
  const q = data.questions[index]
  const choose = async (option: number) => {
    const next = { ...answers, [q.id]: option }
    setAnswers(next)
    if (index < total - 1) { setIndex(index + 1); return }
    if (!user) return
    setSaving(true)
    try {
      const r = await window.api.placement.submit(user.id, next)
      if (r?.success) setResult(r.result)
      else { reportApiError('save your placement check', new Error('The answers could not be saved')); setIndex(0); setAnswers({}) }
    } catch (err) {
      reportApiError('save your placement check', err); setIndex(0); setAnswers({})
    } finally { setSaving(false) }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      <div className="card" style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{q.concept}</span><span>Question {index + 1} of {total}</span>
        </div>
        <div className="progress-bar" aria-label={`Question ${index + 1} of ${total}`}>
          <div className="progress-fill" style={{ width: `${(index / total) * 100}%`, background: 'var(--fd-color)' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>{q.question}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((o, i) => (
            <button key={i} className="btn btn-secondary" disabled={saving} onClick={() => choose(i)} style={{ textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal' }}>{o}</button>
          ))}
          <button className="btn btn-ghost" disabled={saving} onClick={() => choose(-1)} style={{ textAlign: 'left', justifyContent: 'flex-start' }}>I don't know yet</button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No score is kept against you. Guessing does not help: it is better to say you don't know yet.</p>
      </div>
    </div>
  )
}
