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

  // Pull the real bundled dataset schemas live from the database, so the
  // AI can reference actual table/column names instead of guessing or
  // hallucinating a schema that doesn't match what's really loaded.
  const datasetRows = db.prepare('SELECT name, table_name, description, column_info FROM bundled_datasets').all() as any[]
  const datasetSummary = datasetRows.map(d => {
    let cols = '(columns unknown)'
    try {
      const parsed = JSON.parse(d.column_info)
      if (Array.isArray(parsed) && parsed.length) cols = parsed.join(', ')
    } catch { /* leave default */ }
    return `  - ${d.table_name} (${d.name}): ${d.description}. Columns: ${cols}`
  }).join('\n')

  // Context-specific dataset hint — when the student is inside a SQL
  // exercise or the SQL Playground, tell the AI exactly which table(s)
  // are loaded right now, since giving advice against the wrong schema
  // is worse than giving no advice at all.
  const contextDatasetNote = context.dataset_info ? `\n\nDataset currently loaded in this session: ${context.dataset_info}` : ''

  return `You are DericBI Instructor — a world-class data analytics mentor with 20+ years experience, embedded inside the DericBI Instructor desktop app.

=== THE APP YOU LIVE INSIDE ===
DericBI Instructor is a hands-on learning platform with six subjects, meant to be worked through roughly in this order for a true beginner:
1. SQL - querying real databases (SELECT, JOINs, subqueries, window functions)
2. Excel - formulas, PivotTables, Power Query, dashboards
3. Python - pandas, data cleaning, visualisation, basic ML
4. Power BI - data modelling, DAX, report design
5. Statistics - probability, hypothesis testing, regression, A/B testing
6. Business Thinking - storytelling, KPIs, stakeholder communication

Beyond lessons, the app also has: a SQL Playground (free-form querying against any dataset), Simulations (role-played analyst scenarios), a Datasets page (bundled + user-imported files), Projects and a Portfolio (deliverables the student builds), and Achievements (progress gamification).

=== THE BUNDLED PRACTICE DATA ===
Every SQL exercise and the SQL Playground run against these real, loaded tables - refer to these exact table and column names, never invent your own:
${datasetSummary || '  (no bundled datasets found - this would be unusual; mention to the student that something may be misconfigured)'}${contextDatasetNote}

If the student has imported their own dataset, it will appear as its own table with a name they chose - ask them for its exact table/column names if you need to reference it and it isn't in the list above.

=== YOUR STUDENT ===
Name: ${user?.name ?? 'the user'} (${user?.experience_level ?? 'beginner'} level)
Current skill ratings: ${skillSummary || 'No data yet - this may be their very first session'}
${memorySummary ? `\nLearning history:\n${memorySummary}` : ''}

Current context: ${context.type}${context.lesson ? ` — Lesson: ${context.lesson}` : ''}${context.exercise ? ` — Exercise: ${context.exercise}` : ''}

=== YOUR COACHING PHILOSOPHY ===
1. Never give the answer directly. Ask Socratic questions to guide thinking.
2. When the student makes a mistake, acknowledge what they got right first.
3. Relate every technical concept to a real business decision it enables.
4. Recommend the right tool for the job, not just the one being practiced.
5. Keep responses focused and actionable. No fluff.
6. If the student is frustrated, acknowledge it briefly then redirect constructively.
7. Celebrate genuine progress without being sycophantic.
8. If a beginner (experience_level is 'beginner' or skill score below 30) seems to be missing a foundational concept the current question assumes, briefly explain that concept before answering - do not assume prior knowledge you haven't seen evidence of.
9. Even when the student's answer is correct, don't just say "correct" - point out one thing they did well specifically, and suggest one way to go deeper (an edge case, a more efficient approach, or a related real-world scenario).

=== RESPONSE FORMAT ===
- Be concise. 3-5 sentences max unless explaining a complex concept.
- Use examples from real business contexts (hospital, sales, operations) - ideally using the actual bundled dataset columns above.
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

  // ── OpenAI-compatible providers ──────────────────────────────────────
  // Every provider below exposes the same /v1/chat/completions shape as
  // OpenAI, so they all reuse callOpenAI() — only the base URL and default
  // model differ. Model can be overridden per-provider via app_settings
  // (key: "{provider}_model"), which is how the Settings model pickers work.
  const OPENAI_COMPATIBLE: Record<string, { baseUrl: string; defaultModel: string }> = {
    openai:      { baseUrl: 'https://api.openai.com/v1',              defaultModel: 'gpt-4o-mini' },
    openrouter:  { baseUrl: 'https://openrouter.ai/api/v1',           defaultModel: 'openai/gpt-4o-mini' },
    nvidia:      { baseUrl: 'https://integrate.api.nvidia.com/v1',    defaultModel: 'meta/llama-3.3-70b-instruct' },
    groq:        { baseUrl: 'https://api.groq.com/openai/v1',        defaultModel: 'llama-3.3-70b-versatile' },
    cerebras:    { baseUrl: 'https://api.cerebras.ai/v1',             defaultModel: 'llama-3.3-70b' },
    mistral:     { baseUrl: 'https://api.mistral.ai/v1',              defaultModel: 'mistral-small-latest' },
    cohere:      { baseUrl: 'https://api.cohere.ai/compatibility/v1', defaultModel: 'command-a-03-2025' },
    huggingface: { baseUrl: 'https://api-inference.huggingface.co/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
    github:      { baseUrl: 'https://models.github.ai/inference',     defaultModel: 'openai/gpt-4o-mini' },
  }

  try {
    if (provider === 'gemini') {
      response = await callGemini(apiKey, systemPrompt, params.history, params.message)
    } else if (OPENAI_COMPATIBLE[provider]) {
      const { baseUrl, defaultModel } = OPENAI_COMPATIBLE[provider]
      const modelRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`${provider}_model`) as any
      const model = modelRow?.value ?? defaultModel
      response = await callOpenAI(apiKey, systemPrompt, params.history, params.message, baseUrl, model)
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
  is_correct: boolean | null   // null = freeform/written exercise with no single correct answer — ask the AI to genuinely assess it
  skill: string
  context: InstructorContext
}): Promise<ChatResult> {
  const prompt = params.is_correct === null
    ? `This is an open-ended written exercise with no single correct answer.\n\nExercise: ${params.exercise_prompt}\n\nStudent's answer:\n${params.user_answer}\n\nAssess it genuinely: note one specific strength, then one specific gap or improvement (a missing consideration, a weaker argument, something they should sharpen). Do not default to pure praise if the answer has real gaps — a business analyst needs honest feedback to improve. Keep it constructive and specific to what they actually wrote.`
    : params.is_correct
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

async function callOpenAI(apiKey: string, systemPrompt: string, history: ChatMessage[], userMessage: string, baseUrl: string, model: string): Promise<string> {
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
      model,
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
