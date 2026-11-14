import React, { useState } from 'react'
import { CheckCircle, XCircle, Sparkles, RotateCcw } from 'lucide-react'

export interface QuizQuestion {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

/**
 * Self-contained quiz UI. Reads a lesson's `quiz` field (a JSON string of
 * QuizQuestion[]) and walks through one question at a time with immediate
 * right/wrong feedback and an explanation — no backend call needed, since
 * the correct answer is already present in data the client has loaded.
 *
 * Renders nothing if the lesson has no quiz questions yet, so it's always
 * safe to drop into any lesson view unconditionally.
 */
export default function LessonQuiz({ quizJson, accentColor = 'var(--accent)' }: {
  quizJson?: string
  accentColor?: string
}) {
  const questions: QuizQuestion[] = React.useMemo(() => {
    if (!quizJson) return []
    try {
      const parsed = JSON.parse(quizJson)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [quizJson])

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [started, setStarted] = useState(false)

  if (questions.length === 0) return null

  const q = questions[index]
  const isLast = index === questions.length - 1
  const isDone = answers.length === questions.length

  const selectAnswer = (i: number) => {
    if (selected !== null) return // already answered this one
    setSelected(i)
    setAnswers(prev => [...prev, i === q.correct_index])
  }

  const next = () => {
    setSelected(null)
    setIndex(i => i + 1)
  }

  const restart = () => {
    setSelected(null)
    setAnswers([])
    setIndex(0)
    setStarted(true)
  }

  if (!started) {
    return (
      <div style={{
        marginTop: 16, padding: '14px 16px', borderRadius: 'var(--radius-lg)',
        border: `1px solid ${accentColor}`, background: 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Sparkles size={18} color={accentColor} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Test yourself — {questions.length} quick question{questions.length > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Make sure this actually stuck before moving on.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setStarted(true)}>
          Start
        </button>
      </div>
    )
  }

  if (isDone) {
    const correctCount = answers.filter(Boolean).length
    const pct = Math.round((correctCount / questions.length) * 100)
    const strong = pct >= 80
    return (
      <div style={{
        marginTop: 16, padding: '16px 18px', borderRadius: 'var(--radius-lg)',
        border: `1px solid ${strong ? 'var(--success)' : 'var(--warning)'}`,
        background: strong ? 'var(--success-dim)' : 'var(--warning-dim)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: strong ? 'var(--success)' : 'var(--warning)', marginBottom: 4 }}>
          {correctCount} / {questions.length}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {strong
            ? "Solid — you've got this concept."
            : 'Worth a second pass before moving on — review anything you missed above.'}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={restart}>
          <RotateCcw size={12} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 16, padding: '16px 18px', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Question {index + 1} of {questions.length}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>
        {q.question}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {q.options.map((opt, i) => {
          const isSelected = selected === i
          const isCorrectOpt = i === q.correct_index
          const showState = selected !== null
          let borderColor = 'var(--border)'
          let bg = 'transparent'
          if (showState && isCorrectOpt) { borderColor = 'var(--success)'; bg = 'var(--success-dim)' }
          else if (showState && isSelected && !isCorrectOpt) { borderColor = 'var(--error)'; bg = 'var(--error-dim)' }

          return (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              disabled={selected !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '9px 12px', borderRadius: 'var(--radius)',
                border: `1px solid ${borderColor}`, background: bg,
                textAlign: 'left', cursor: selected === null ? 'pointer' : 'default',
                fontSize: 12.5, color: 'var(--text-secondary)',
                transition: 'all var(--transition)',
              }}
            >
              {showState && isCorrectOpt && <CheckCircle size={14} color="var(--success)" style={{ flexShrink: 0 }} />}
              {showState && isSelected && !isCorrectOpt && <XCircle size={14} color="var(--error)" style={{ flexShrink: 0 }} />}
              <span>{opt}</span>
            </button>
          )
        })}
      </div>

      {selected !== null && (
        <>
          <div style={{
            marginTop: 12, padding: '9px 12px', borderRadius: 'var(--radius)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55,
          }}>
            {selected === q.correct_index ? '✓ Correct. ' : '✗ Not quite. '}{q.explanation}
          </div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={next}>
            {isLast ? 'See results' : 'Next question →'}
          </button>
        </>
      )}
    </div>
  )
}
