import CryptoJS from 'crypto-js'
import { safeStorage } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { getMemorySummary,getSkillRatings } from './progress.service'

// Legacy fallback only — kept so any key saved before this file switched to
// safeStorage can still be read back and transparently re-saved in the new
// format. Never used for new saves. A hardcoded key like this only ever
// provided obfuscation, not real protection, since it ships inside the app
// and is trivially recoverable by anyone who decompiles it (Electron apps
// are just JS) — that's exactly why this moved to OS-level encryption.
const LEGACY_ENCRYPTION_KEY = 'dericbi-local-key-v1'

// ─────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────

export function saveApiKey(userId: string, provider: string, key: string): void {
  const db = getDb()
  const encrypted = encryptApiKey(key)
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
  return decryptApiKey(row.key_encrypted)
}

/** OS-keychain-backed encryption (macOS Keychain / Windows DPAPI / Linux
 * Secret Service) via a per-machine key Electron manages — never embedded
 * in the app itself, unlike the old static AES key. */
function encryptApiKey(key: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'v2:' + safeStorage.encryptString(key).toString('base64')
  }
  // Rare fallback (some Linux setups without a keyring available) — still
  // better than refusing to save the key at all.
  console.warn('[ai] OS-level encryption unavailable, falling back to legacy encryption for this save')
  return CryptoJS.AES.encrypt(key, LEGACY_ENCRYPTION_KEY).toString()
}

function decryptApiKey(stored: string): string | null {
  try {
    if (stored.startsWith('v2:')) {
      const buffer = Buffer.from(stored.slice(3), 'base64')
      return safeStorage.decryptString(buffer)
    }
    // Legacy format from before this switched to safeStorage.
    const bytes = CryptoJS.AES.decrypt(stored, LEGACY_ENCRYPTION_KEY)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch (err) {
    console.error('[ai] failed to decrypt stored API key', err)
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

  try {
    response = await callProvider(provider, apiKey, systemPrompt, params.history, params.message)
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

// Every provider except Gemini exposes OpenAI's /chat/completions and /models
// shapes, so only the base URL is configured here. Model names are NEVER
// pinned: they are discovered from each provider's own /models list, so a
// retired model cannot break the tutor. FALLBACK_MODEL is used only when
// that list cannot be fetched (offline, rate-limited) and nothing is saved.
const OPENAI_COMPATIBLE: Record<string, { baseUrl: string; fallback: string }> = {
  openai:      { baseUrl: 'https://api.openai.com/v1',               fallback: 'gpt-4o-mini' },
  openrouter:  { baseUrl: 'https://openrouter.ai/api/v1',            fallback: 'openrouter/auto' },
  nvidia:      { baseUrl: 'https://integrate.api.nvidia.com/v1',     fallback: 'meta/llama-3.3-70b-instruct' },
  groq:        { baseUrl: 'https://api.groq.com/openai/v1',          fallback: 'llama-3.3-70b-versatile' },
  cerebras:    { baseUrl: 'https://api.cerebras.ai/v1',              fallback: 'llama-3.3-70b' },
  mistral:     { baseUrl: 'https://api.mistral.ai/v1',               fallback: 'mistral-small-latest' },
  cohere:      { baseUrl: 'https://api.cohere.ai/compatibility/v1',  fallback: 'command-a-03-2025' },
  huggingface: { baseUrl: 'https://router.huggingface.co/v1',        fallback: 'meta-llama/Llama-3.3-70B-Instruct' },
  github:      { baseUrl: 'https://models.github.ai/inference',      fallback: 'openai/gpt-4o-mini' },
}
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_FALLBACK = 'gemini-flash-latest' // Google-maintained alias

const NOT_CHAT = /embed|whisper|tts|speech|audio|transcri|image|vision-preview|dall|moderation|guard|rerank|safety|imagen|veo|video|realtime|search-preview|aqa|computer-use/i
// Preference when choosing a default: fast, general, instruction-tuned models.
const PREFER = [/flash(?!.*(lite|8b))/i, /mini|small|instant|versatile/i, /instruct|chat|turbo|70b/i]

const modelCache = new Map<string, { at: number; ids: string[] }>()
const CACHE_MS = 6 * 3600_000

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 15_000)
  try {
    const res = await fetch(url, { headers, signal: ctl.signal })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any
      throw new HttpError(res.status, body?.error?.message ?? body?.message ?? `HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err: any) {
    if (err instanceof HttpError) throw err
    throw new Error(err.name === 'AbortError' ? 'The provider took too long to answer.' : `Could not reach the provider: ${err.message}`)
  } finally { clearTimeout(t) }
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function explain(provider: string, err: any): Error {
  if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
    return new Error(`${provider} rejected the API key (${err.message}). It may be wrong, expired or revoked - paste a fresh key in Settings -> AI Configuration.`)
  }
  if (err instanceof HttpError && err.status === 429) {
    return new Error(`${provider} says you have hit its free-tier limit. Wait a minute, or switch provider in Settings.`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

// Live, chat-capable model ids for a provider, newest/most-suitable first.
export async function discoverModels(provider: string, apiKey: string, force = false): Promise<string[]> {
  const hit = modelCache.get(provider)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.ids

  let ids: string[]
  if (provider === 'gemini') {
    const data = await fetchJson(`${GEMINI_BASE}/models?pageSize=200`, { 'x-goog-api-key': apiKey })
    ids = (data.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, ''))
  } else if (OPENAI_COMPATIBLE[provider]) {
    const data = await fetchJson(`${OPENAI_COMPATIBLE[provider].baseUrl}/models`, { Authorization: `Bearer ${apiKey}` })
    const list: any[] = Array.isArray(data) ? data : (data.data ?? data.models ?? [])
    ids = list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map(m => String(m.id ?? m.name))
  } else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  ids = ids.filter(id => !NOT_CHAT.test(id))
  if (ids.length === 0) throw new Error('The provider returned no chat models for this key.')
  // Stable sort: models matching an earlier PREFER pattern first, provider order kept inside a group.
  const rank = (id: string) => { const i = PREFER.findIndex(r => r.test(id)); return i < 0 ? PREFER.length : i }
  ids = ids.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map(x => x.id)
  modelCache.set(provider, { at: Date.now(), ids })
  return ids
}

// The model to call: the student's saved choice if it still exists, otherwise
// the best live model, otherwise the last-resort fallback.
async function resolveModel(provider: string, apiKey: string, force = false): Promise<string> {
  const saved = (getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(`${provider}_model`) as any)?.value as string | undefined
  const fallback = provider === 'gemini' ? GEMINI_FALLBACK : OPENAI_COMPATIBLE[provider]?.fallback
  try {
    const ids = await discoverModels(provider, apiKey, force)
    return saved && ids.includes(saved) ? saved : ids[0]
  } catch (err: any) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) throw explain(provider, err)
    return saved ?? fallback
  }
}

export async function listModels(userId: string, provider: string): Promise<{ success: boolean; models: string[]; selected?: string; error?: string }> {
  const apiKey = getApiKey(userId, provider)
  if (!apiKey) return { success: false, models: [], error: `Add your ${provider} key first to see its models.` }
  try {
    const models = await discoverModels(provider, apiKey, true)
    return { success: true, models, selected: await resolveModel(provider, apiKey) }
  } catch (err: any) {
    return { success: false, models: [], error: explain(provider, err).message }
  }
}

const isModelGone = (e: any) => e instanceof HttpError && (e.status === 404 || (e.status === 400 && /model|decommission|deprecat|retired|not found/i.test(e.message)))

async function callProvider(provider: string, apiKey: string, systemPrompt: string, history: ChatMessage[], message: string): Promise<string> {
  if (provider !== 'gemini' && !OPENAI_COMPATIBLE[provider]) throw new Error(`Unknown provider: ${provider}`)
  const attempt = async (model: string) => provider === 'gemini'
    ? callGemini(apiKey, model, systemPrompt, history, message)
    : callOpenAI(apiKey, systemPrompt, history, message, OPENAI_COMPATIBLE[provider].baseUrl, model)

  const model = await resolveModel(provider, apiKey)
  try {
    return await attempt(model)
  } catch (err: any) {
    if (!isModelGone(err)) throw explain(provider, err)
    // The model was retired since we last looked: re-discover once and retry.
    const fresh = await resolveModel(provider, apiKey, true)
    if (fresh === model) throw explain(provider, err)
    try { return await attempt(fresh) } catch (e2: any) { throw explain(provider, e2) }
  }
}

async function callGemini(apiKey: string, model: string, systemPrompt: string, history: ChatMessage[], userMessage: string): Promise<string> {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  // Without an explicit timeout, fetch() will wait indefinitely if a
  // request stalls (a common real-world case: flaky wifi, a captive
  // portal, an overloaded provider). That leaves the chat UI's loading
  // spinner stuck forever with no error and no way to recover short of
  // restarting the app. 45s is generous for an LLM response while still
  // eventually failing instead of hanging.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)

  let res: Response
  try {
    res = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
        signal: controller.signal,
      }
    )
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Gemini took too long to respond. Check your internet connection and try again.')
    }
    throw new Error(`Could not reach Gemini: ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new HttpError(res.status, err.error?.message ?? `Gemini error ${res.status}`)
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
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
      signal: controller.signal,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('The AI provider took too long to respond. Check your internet connection and try again.')
    }
    throw new Error(`Could not reach the AI provider: ${err.message}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new HttpError(res.status, err.error?.message ?? `API error ${res.status}`)
  }

  const data = await res.json() as any
  return data.choices?.[0]?.message?.content ?? 'No response.'
}
