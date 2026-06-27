import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Send, Loader, X, ChevronDown, ChevronUp,
  Sparkles, AlertCircle, Settings, Brain, RotateCcw,
} from 'lucide-react'
import { useAuthStore } from '../../store'
import { useInstructor } from '../../hooks/useInstructor'
import type { InstructorContext } from '../../hooks/useInstructor'

interface Props {
  context: InstructorContext
  initialPrompt?: string        // auto-send on mount
  compact?: boolean             // collapsed panel mode
  onFeedbackReady?: (msg: string) => void
}

export default function InstructorPanel({
  context,
  initialPrompt,
  compact = false,
  onFeedbackReady,
}: Props) {
  const { user } = useAuthStore()
  const { messages, loading, error, sendMessage, clearConversation } = useInstructor(context)
  const [input, setInput] = useState('')
  const [collapsed, setCollapsed] = useState(compact)
  const [apiKeyOk, setApiKeyOk] = useState<boolean | null>(null)
  const [checkingKey, setCheckingKey] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const didSendInitial = useRef(false)

  // Check API key
  useEffect(() => {
    if (!user) return
    const check = async () => {
      const provider = await window.api.ai.getProvider(user.id)
      const res = await window.api.ai.hasKey(user.id, provider.provider)
      setApiKeyOk(res.has_key)
      setCheckingKey(false)
    }
    check()
  }, [user])

  // Auto-send initial prompt once API key confirmed
  useEffect(() => {
    if (!apiKeyOk || !initialPrompt || didSendInitial.current) return
    didSendInitial.current = true
    sendMessage(initialPrompt, context).then(() => {
      if (onFeedbackReady && messages.length > 0) {
        const last = messages[messages.length - 1]
        if (last?.role === 'assistant') onFeedbackReady(last.content)
      }
    })
  }, [apiKeyOk, initialPrompt])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await sendMessage(text, context)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Collapsed state ──────────────────────
  if (collapsed) {
    return (
      <button
        onClick={() => { setCollapsed(false); setTimeout(() => inputRef.current?.focus(), 100) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          color: 'var(--accent)',
          cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
        }}
      >
        <Sparkles size={13} />
        Ask AI Instructor
        {messages.length > 0 && (
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--accent)',
            color: 'white', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
        <ChevronUp size={12} />
      </button>
    )
  }

  // ─── No API key ───────────────────────────
  if (!checkingKey && !apiKeyOk) {
    return (
      <div style={{
        padding: '12px 14px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--warning)' }}>
          <AlertCircle size={14} />
          <span style={{ fontWeight: 600 }}>AI Instructor requires an API key</span>
        </div>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
          Add a Gemini, OpenAI, or OpenRouter key in Settings to unlock personalized coaching.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              // trigger settings nav via custom event
              window.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' }))
            }}
          >
            <Settings size={12} /> Go to Settings
          </button>
          {compact && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(true)}>
              <X size={12} /> Dismiss
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── Full chat panel ──────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 'var(--radius-sm)',
          background: 'var(--accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)',
        }}>
          <Brain size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            AI Instructor
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {context.type === 'exercise' ? 'Exercise coaching' :
             context.type === 'lesson' ? `Lesson: ${context.lesson}` :
             context.type === 'playground' ? 'Playground assistant' :
             context.type === 'simulation' ? 'Simulation mentor' :
             'General coaching'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {messages.length > 0 && (
            <button className="btn btn-ghost btn-sm btn-icon" onClick={clearConversation} title="Clear chat">
              <RotateCcw size={12} />
            </button>
          )}
          {compact && (
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setCollapsed(true)}>
              <ChevronDown size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {checkingKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
            <Loader size={12} className="animate-spin" /> Connecting to AI…
          </div>
        )}

        {!checkingKey && messages.length === 0 && (
          <EmptyInstructorState context={context} onPrompt={(p) => sendMessage(p, context)} />
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Brain size={13} color="var(--accent)" />
            </div>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--accent)',
                  opacity: 0.4,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px',
            background: 'var(--error-dim)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius)',
            fontSize: 12, color: 'var(--error)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask the instructor anything…"
            disabled={loading || checkingKey}
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              padding: '7px 10px',
              outline: 'none',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || checkingKey}
            style={{
              width: 32, height: 32,
              borderRadius: 'var(--radius)',
              border: 'none',
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-overlay)',
              color: input.trim() && !loading ? 'white' : 'var(--text-muted)',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all var(--transition)',
              flexShrink: 0,
            }}
          >
            {loading ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
          Enter to send · Shift+Enter for newline · Coaching is personalized to your progress
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────
// MESSAGE BUBBLE
// ─────────────────────────────────────────────

function MessageBubble({ message }: { message: { role: string; content: string; timestamp: string } }) {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      {/* Avatar */}
      <div style={{
        width: 26, height: 26,
        borderRadius: isUser ? 'var(--radius-sm)' : 'var(--radius-sm)',
        background: isUser ? 'var(--bg-overlay)' : 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontSize: 10, fontWeight: 700,
        color: isUser ? 'var(--text-secondary)' : 'var(--accent)',
      }}>
        {isUser ? 'You' : <Brain size={13} />}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '85%',
        padding: '8px 12px',
        borderRadius: 'var(--radius)',
        background: isUser ? 'var(--accent-dim)' : 'var(--bg-elevated)',
        border: `1px solid ${isUser ? 'var(--accent-dim)' : 'var(--border)'}`,
        fontSize: 12,
        color: 'var(--text-primary)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {/* Render inline code */}
        {renderContent(message.content)}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

function renderContent(text: string): React.ReactNode {
  // Split on ```code blocks``` and `inline code`
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/, '')
      return (
        <pre key={i} style={{
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          overflowX: 'auto',
          margin: '6px 0',
        }}>
          {code}
        </pre>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>
    }
    return <span key={i}>{part}</span>
  })
}

// ─────────────────────────────────────────────
// EMPTY STATE WITH SUGGESTED PROMPTS
// ─────────────────────────────────────────────

const CONTEXT_PROMPTS: Record<string, string[]> = {
  exercise: [
    'I\'m stuck — can you give me a hint without revealing the answer?',
    'Why would a business analyst need this skill?',
    'What are common mistakes to avoid here?',
  ],
  lesson: [
    'Can you summarize the key concepts in simple terms?',
    'Give me a real business example of where this is used.',
    'What should I master before moving to the next lesson?',
  ],
  playground: [
    'Help me write a query to find the top 5 diagnoses by cost.',
    'How do I calculate month-over-month growth in SQL?',
    'What\'s the most useful analysis I can do with this dataset?',
  ],
  simulation: [
    'What should I prioritize first as a hospital analyst?',
    'How would a senior analyst approach this problem?',
    'What KPIs matter most in this scenario?',
  ],
  general: [
    'What\'s the most important SQL skill for analysts?',
    'How long does it take to become job-ready in data analytics?',
    'What should I focus on given my current skill level?',
  ],
}

function EmptyInstructorState({ context, onPrompt }: {
  context: InstructorContext
  onPrompt: (p: string) => void
}) {
  const prompts = CONTEXT_PROMPTS[context.type] ?? CONTEXT_PROMPTS.general

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '16px 8px 20px', color: 'var(--text-muted)' }}>
        <div style={{
          width: 40, height: 40,
          borderRadius: 'var(--radius)',
          background: 'var(--accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 10px',
        }}>
          <Sparkles size={18} color="var(--accent)" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
          Your AI Instructor
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          Personalized coaching based on your learning history. Ask anything.
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Suggested questions
      </div>
      {prompts.map((p, i) => (
        <button
          key={i}
          onClick={() => onPrompt(p)}
          style={{
            width: '100%', textAlign: 'left',
            padding: '7px 10px', marginBottom: 5,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 11, lineHeight: 1.4,
            transition: 'all var(--transition)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--accent-dim)'
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
