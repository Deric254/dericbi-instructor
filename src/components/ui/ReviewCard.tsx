import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, RotateCcw, XCircle } from 'lucide-react'
import { useAuthStore } from '../../store'
import { reportApiError } from '../../lib/apiError'

interface Question { id: string; concept: string; question: string; options: string[] }
interface Due { enrolled: number; due_total: number; questions: Question[] }
interface Feedback { correct: boolean; correct_index: number; explanation: string; next_review_days: number }

/**
 * "Review: 5 minutes". Ideas come back after 1, 3, 7 and then 21 days: right answers push the next review further out,
 * a wrong answer brings the idea back tomorrow. The card shows nothing when no idea is due.
 */
export default function ReviewCard() {
  const { user } = useAuthStore()
  const [due, setDue] = useState<Due | null>(null)
  const [running, setRunning] = useState(false)
  const [index, setIndex] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [right, setRight] = useState(0)
  const [asked, setAsked] = useState(0)
  const [finished, setFinished] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!user) return
    window.api.review.due(user.id).then((d: Due) => setDue(d)).catch(() => setDue(null))
  }, [user])
  useEffect(load, [load])

  if (!due || (due.due_total === 0 && !finished)) return null

  const start = () => { setAsked(due.questions.length); setRunning(true); setIndex(0); setFeedback(null); setPicked(null); setRight(0); setFinished(false) }
  const questions = due.questions
  const q = questions[index]

  const choose = async (option: number) => {
    if (!user || busy || feedback) return
    setBusy(true)
    try {
      const r = await window.api.review.answer(user.id, q.id, option)
      if (r?.success) { setPicked(option); setFeedback(r); if (r.correct) setRight((n) => n + 1) }
      else reportApiError('save your review answer', new Error('The answer could not be saved'))
    } catch (err) { reportApiError('save your review answer', err) } finally { setBusy(false) }
  }
  const next = () => {
    setFeedback(null); setPicked(null)
    if (index < questions.length - 1) setIndex(index + 1)
    else { setRunning(false); setFinished(true); load() }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Review: 5 minutes</span>
        {running && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{index + 1} of {questions.length}</span>}
      </div>

      {!running && !finished && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {due.due_total} idea{due.due_total === 1 ? ' is' : 's are'} ready to refresh. A few questions now keeps them from fading.
          </div>
          <button className="btn btn-primary btn-sm" onClick={start}><RotateCcw size={12} /> Start review</button>
        </div>
      )}

      {running && q && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{q.concept}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>{q.question}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.options.map((o, i) => {
              const isRight = feedback && i === feedback.correct_index
              const isWrong = feedback && picked === i && !feedback.correct
              return (
                <button key={i} className="btn btn-secondary" disabled={busy || !!feedback} onClick={() => choose(i)}
                  style={{ textAlign: 'left', justifyContent: 'flex-start', whiteSpace: 'normal', borderColor: isRight ? 'var(--success)' : isWrong ? 'var(--error)' : undefined }}>
                  {o}
                </button>
              )
            })}
          </div>
          {feedback && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: feedback.correct ? 'var(--success)' : 'var(--error)' }}>
                {feedback.correct ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {feedback.correct ? `Right. You will see this again in ${feedback.next_review_days} day${feedback.next_review_days === 1 ? '' : 's'}.` : 'Not quite. This one comes back tomorrow.'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{feedback.explanation}</div>
              <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={next}>{index < questions.length - 1 ? 'Next' : 'Finish'}</button>
            </div>
          )}
        </>
      )}

      {finished && !running && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Review done: {right} of {asked} right. {due.due_total > 0 ? `${due.due_total} more ${due.due_total === 1 ? 'idea is' : 'ideas are'} ready if you want to keep going.` : 'Everything is refreshed for now.'}
          </div>
          {due.due_total > 0 && <button className="btn btn-secondary btn-sm" onClick={start}>Keep going</button>}
        </div>
      )}
    </div>
  )
}
