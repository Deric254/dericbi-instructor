import CryptoJS from 'crypto-js'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { getMemorySummary, getSkillRatings } from './progress.service'

const ENCRYPTION_KEY = 'dericbi-local-key-v1'

// ─────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────

export function saveApiKey(userId: string, provider: string, key: string): void {
  const db = getDb()
  const encrypted = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString()
  db.prepare(`
    INSERT INTO api_keys (id, user_id, provider, key_encrypted)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      key_encrypted = excluded.key_encrypted,
      is_active = 1
  `).run(uuidv4(), userId, provider, encrypted)
}

export function getApiKey(userId: string, provider: string): string | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ? AND is_active = 1
  `).get(userId, provider) as any

  if (!row) return null

  try {
    const bytes = CryptoJS.AES.decrypt(row.key_encrypted, ENCRYPTION_KEY)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch {
    return null
  }
}

export function getActiveProvider(userId: string): string {
  const db = getDb()
  const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_provider'").get() as any
  return setting?.value ?? 'gemini'
}

// ─────────────────────────────────────────────
// INSTRUCTOR SYSTEM PROMPT
// ─────────────────────────────────────────────

function buildSystemPrompt(userId: string, context: InstructorContext): string {
  const db = getDb()
  const user = db.prepare('SELECT name, experience_level FROM users WHERE id = ?').get(userId) as any
  const memorySummary = getMemorySummary(userId)
  const skills = getSkillRatings(userId)

  const skillSummary = skills
    .map(s => `${s.skill}: ${Math.round(s.score)}/100`)
    .join(', ')

  return `You are DericBI Instructor — a world-class data analytics mentor with 20+ years experience.

Your student: ${user?.name ?? 'the user'} (${user?.experience_level ?? 'beginner'} level)

Current skill ratings: ${skillSummary || 'No data yet'}

${memorySummary ? `Learning history:\n${memorySummary}` : ''}

Current context: ${context.type}${context.lesson ? ` — Lesson: ${context.lesson}` : ''}${context.exercise ? ` — Exercise: ${context.exercise}` : ''}

Your coaching philosophy:
1. Never give the answer directly. Ask Socratic questions to guide thinking.
2. When the student makes a mistake, acknowledge what they got right first.
3. Relate every technical concept to a real business decision it enables.
4. Recommend the right tool for the job, not just the one being practiced.
5. Keep responses focused and actionable. No fluff.
6. If the student is frustrated, acknowledge it briefly then redirect constructively.
7. Celebrate genuine progress without being sycophantic.

Response format:
- Be concise. 3-5 sentences max unless explaining a complex concept.
- Use examples from real business contexts (hospital, sales, operations).
- When reviewing code/SQL, quote specific lines using backticks.
- End coaching responses with one focused question that moves the student forward.`
}

// ─────────────────────────────────────────────
// AI CHAT
// ─────────────────────────────────────────────

export interface InstructorContext {
  type: 'general' | 'lesson' | 'exercise' | 'playground' | 'simulation'
  lesson?: string
  exercise?: string
  code?: string
  error?: string
  dataset_info?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  success: boolean
  message?: string
  error?: string
  provider?: string
}

export async function chat(params: {
  userId: string
  conversationId?: string
  message: string
  history: ChatMessage[]
  context: InstructorContext
}): Promise<ChatResult> {
  const db = getDb()
  const provider = getActiveProvider(params.userId)
  const apiKey = getApiKey(params.userId, provider)

  if (!apiKey) {
    return {
      success: false,
      error: `No API key configured for ${provider}. Add your key in Settings → AI Configuration.`,
    }
  }

  // Build conversation
  const conversationId = params.conversationId ?? (() => {
    const id = uuidv4()
    db.prepare(`
      INSERT INTO ai_conversations (id, user_id, context, context_id)
      VALUES (?, ?, ?, ?)
    `).run(id, params.userId, params.context.type, null)
    return id
  })()

  const systemPrompt = buildSystemPrompt(params.userId, params.context)

  // Save user message
  db.prepare(`
    INSERT INTO ai_messages (id, conversation_id, role, content)
    VALUES (?, ?, 'user', ?)
  `).run(uuidv4(), conversationId, params.message)

  // Call AI provider
  let response: string

  try {
    if (provider === 'gemini') {
      response = await callGemini(apiKey, systemPrompt, params.history, params.message)
    } else if (provider === 'openai') {
      response = await callOpenAI(apiKey, systemPrompt, params.history, params.message, 'https://api.openai.com/v1')
    } else if (provider === 'openrouter') {
      response = await callOpenAI(apiKey, systemPrompt, params.history, params.message, 'https://openrouter.ai/api/v1')
    } else {
      return { success: false, error: `Unknown provider: ${provider}` }
    }
  } catch (err: unknown) {
    const e = err as any
    return { success: false, error: `AI error: ${e.message}` }
  }

  // Save assistant message
  db.prepare(`
    INSERT INTO ai_messages (id, conversation_id, role, content)
    VALUES (?, ?, 'assistant', ?)
  `).run(uuidv4(), conversationId, response)

  // Update last_used
  db.prepare(`UPDATE api_keys SET last_used = datetime('now') WHERE user_id = ? AND provider = ?`)
    .run(params.userId, provider)

  return { success: true, message: response, provider }
}

// ─────────────────────────────────────────────
// EXERCISE FEEDBACK
// ─────────────────────────────────────────────

export async function getExerciseFeedback(params: {
  userId: string
  exercise_prompt: string
  user_answer: string
  solution: string
  is_correct: boolean
  skill: string
  context: InstructorContext
}): Promise<ChatResult> {
  const prompt = params.is_correct
    ? `The student answered correctly.\n\nExercise: ${params.exercise_prompt}\n\nTheir answer:\n${params.user_answer}\n\nBriefly affirm what they did well and suggest one way to deepen their understanding.`
    : `The student answered incorrectly.\n\nExercise: ${params.exercise_prompt}\n\nTheir attempt:\n${params.user_answer}\n\nCorrect approach:\n${params.solution}\n\nDo NOT show the solution. Give one targeted hint that helps them self-correct. Ask a Socratic question.`

  return chat({
    userId: params.userId,
    message: prompt,
    history: [],
    context: params.context,
  })
}

// ─────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────

async function callGemini(apiKey: string, systemPrompt: string, history: ChatMessage[], userMessage: string): Promise<string> {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  // gemini-flash-latest is Google's own maintained alias — it always points
  // at the current Flash model, so this stays correct even as Google
  // retires specific dated model names (which is what broke this before).
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json() as any
    throw new Error(err.error?.message ?? `Gemini error ${res.status}`)
  }

  const data = await res.json() as any
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response from Gemini.'
}

async function callOpenAI(apiKey: string, systemPrompt: string, history: ChatMessage[], userMessage: string, baseUrl: string): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: baseUrl.includes('openrouter') ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.json() as any
    throw new Error(err.error?.message ?? `API error ${res.status}`)
  }

  const data = await res.json() as any
  return data.choices?.[0]?.message?.content ?? 'No response.'
}
