import { useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../store'
import type { ChatMessage } from '../types'

export interface InstructorContext {
  type: 'general' | 'lesson' | 'exercise' | 'playground' | 'simulation'
  lesson?: string
  exercise?: string
  code?: string
  error?: string
  dataset_info?: string
  /** How the tutor should answer this message (see the tutor modes in InstructorPanel). */
  mode?: 'simpler' | 'ask' | 'check'
}

export interface UseInstructorReturn {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  /** The tutor could not be reached by any provider: show a gentle note, the lesson carries on. */
  unavailable: boolean
  conversationId: string | null
  sendMessage: (text: string, context?: InstructorContext) => Promise<void>
  getExerciseFeedback: (params: ExerciseFeedbackParams) => Promise<string | null>
  clearConversation: () => void
  hasApiKey: boolean
  setHasApiKey: (v: boolean) => void
}

export interface ExerciseFeedbackParams {
  exercise_prompt: string
  user_answer: string
  solution: string
  is_correct: boolean
  skill: string
  context: InstructorContext
}

export function useInstructor(initialContext?: InstructorContext): UseInstructorReturn {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const conversationIdRef = useRef<string | null>(null)

  const sendMessage = useCallback(async (text: string, context?: InstructorContext) => {
    if (!user) return
    setLoading(true)
    setError(null)
    setUnavailable(false)

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const result = await window.api.ai.chat({
        userId: user.id,
        conversationId: conversationIdRef.current,
        message: text,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        context: context ?? initialContext ?? { type: 'general' },
      })

      if (!conversationIdRef.current && result.conversationId) {
        conversationIdRef.current = result.conversationId
      }

      if (result.success) {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMsg])
      } else {
        setError(result.error ?? 'AI response failed.')
        setUnavailable(!!result.unavailable)
        setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      }
    } catch (err: any) {
      setError(err.message ?? 'Network error.')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }, [user, messages, initialContext])

  const getExerciseFeedback = useCallback(async (params: ExerciseFeedbackParams): Promise<string | null> => {
    if (!user) return null
    try {
      const result = await window.api.ai.exerciseFeedback({
        userId: user.id,
        ...params,
      })
      if (result.success) {
        const msg: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: result.message,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, msg])
        return result.message
      }
      setError(result.error ?? 'Could not get feedback.')
      setUnavailable(!!result.unavailable)
      return null
    } catch (err: any) {
      setError(err?.message ?? 'Network error getting feedback.')
      return null
    }
  }, [user])

  const clearConversation = useCallback(() => {
    setMessages([])
    setError(null)
    setUnavailable(false)
    conversationIdRef.current = null
  }, [])

  return {
    messages,
    loading,
    error,
    unavailable,
    conversationId: conversationIdRef.current,
    sendMessage,
    getExerciseFeedback,
    clearConversation,
    hasApiKey,
    setHasApiKey,
  }
}
