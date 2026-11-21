import CryptoJS from 'crypto-js'
import { safeStorage } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { getMemorySummary, getSkillRatings } from './progress.service'

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
      // column_info is stored as [{name, type}] (see setup.service). Joining those objects
      // directly printed "[object Object], [object Object]" into the tutor's prompt, so the
      // AI never actually saw the real column names it is told to quote.
      if (Array.isArray(parsed) && parsed.length) {
        cols = parsed.map((c: any) => (typeof c === 'string' ? c : c?.name)).filter(Boolean).join(', ')
      }
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
DericBI Instructor is a hands-on learning platform with a Start Here foundations track, six core subjects, a Data Engineering academy and a Business Problem Solver academy. A true complete beginner starts with Start Here, then works through roughly this order:
1. SQL - querying real databases (SELECT, JOINs, subqueries, window functions)
2. Excel - formulas, PivotTables, Power Query, dashboards
3. Python - pandas, data cleaning, visualisation, basic ML
4. Power BI - data modelling, DAX, report design
5. Statistics - probability, hypothesis testing, regression, A/B testing
6. Business Thinking - storytelling, KPIs, stakeholder communication
Then the Data Engineering academy (advanced, SQL-based): profiling, deduplication, integrity, incremental loads, dimensional modelling, pipeline observability, AI feature data, LLM cost analytics, governance. Its practice company is Northwind Global (tables customers, orders, raw_events, pipeline_runs, ml_features, llm_requests); use those tables, not the hospital ones, when a student is inside it.
The Business Problem Solver academy (SQL and Python practicals) teaches how to find money and explain problems in a real business: auditing data, modelling it, connecting and mapping sources, reconciling them, then stock, margins, customers, suppliers, cash, investigating a question, monitoring, scale and an owner's briefing. Its practice company is Mwangi Trading Co. (tables shop_sales, shop_sale_items, shop_products, shop_customers, shop_suppliers, shop_purchases, shop_batches, shop_payments, shop_refunds, shop_expenses, shop_supplier_invoices, shop_bank, shop_actions; stock counted on 2025-12-31). Use those tables, not the hospital ones, when a student is inside it, and always separate what the evidence supports from what it cannot prove.

The Start Here academy (eight short lessons, SQL used as a calculator and a first look at tables) teaches from first principles how a business works: what value is, reading a table, revenue cost and profit, cash versus profit, percent and average, customers and their problems, price and margin, and breaking a big question into measurable parts. It uses the same practice company, Mwangi Trading Co. (shop_ tables). Teach these learners in plain language, one idea at a time, starting from what is certainly true, and ask them to say the idea back in their own words. A Start Here lesson only completes once its quiz is passed at 80% and its practicals are passed.

The Founder Track (twelve lessons, after Start Here) teaches how to start a business in Kenya: finding a real problem, interviewing customers, sizing an opportunity bottom-up, the offer and price, unit economics and break-even, cash runway, the first sale, the smallest version, funding options, registration, tax and contracts, hiring, and measure-decide-iterate. Its calculations are done in SQL with the numbers given in each question. The tax, registration, payroll and funding figures in those lessons are dated November 2026 and come from named sources; never state them as current law, and tell the learner to confirm with KRA, the Business Registration Service, NSSF, SHA or a licensed adviser. You are not a lawyer or a tax adviser. Real-world tasks (customer interviews, asking for a sale) are done by the learner outside the app; never invent results for them.

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
- End coaching responses with one focused question that moves the student forward.${modeInstruction(context.mode)}`
}

/** Tutor modes: fixed instructions for how to answer one message. Anything else is ignored. */
function modeInstruction(mode: InstructorContext['mode']): string {
  if (mode === 'simpler') return `

=== THIS REPLY: EXPLAIN IT SIMPLER ===
Explain the idea the student is on again in plain everyday words, one idea at a time, starting from what is certainly true. Use one small example from a Kenyan small business and no jargon. End by asking them to say it back in their own words.`
  if (mode === 'ask') return `

=== THIS REPLY: ASK ME QUESTIONS ===
Ask exactly one question that tests whether the student understands the current lesson (not a question that only repeats a definition). Do not answer it. When they reply, say what was right, what is missing, and ask the next question.`
  if (mode === 'check') return `

=== THIS REPLY: CHECK MY EXPLANATION ===
The student's message is their own explanation of the idea. Say what they explained correctly, name what is missing or unclear, and ask one question that would fix it. Do not rewrite it for them and do not give the full answer.`
  return ''
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
  mode?: 'simpler' | 'ask' | 'check'
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
  conversationId?: string
  /** True when no provider could answer (as opposed to a missing key): the screen should carry on without the tutor. */
  unavailable?: boolean
}

/** How long one chat may spend across all providers, and how long any single attempt may take. */
export const aiLimits = { totalMs: 70_000, attemptMs: 30_000, minAttemptMs: 8_000 }

/** Providers to try, in order: the chosen one first, then every other provider that has a saved key. */
function providerChain(userId: string, active: string): string[] {
  const others = Object.keys(PROVIDERS).filter((p) => p !== active && getApiKey(userId, p))
  return [...(PROVIDERS[active] && getApiKey(userId, active) ? [active] : []), ...others]
}

const emptyReply = (provider: string) => PROVIDERS[provider].kind === 'gemini' ? 'No response from Gemini.' : 'No response.'

function allFailedMessage(failures: { label: string; reason: string }[]): string {
  const detail = failures.map((f) => failures.length > 1 ? `${f.label}: ${f.reason}` : f.reason).join(' | ')
  return `The AI tutor could not answer just now, but everything else still works - lessons, exercises and the playground are all ready for you. ${detail} Try again in a minute, or check your keys in Settings → AI Configuration.`
}

export async function chat(params: {
  userId: string
  conversationId?: string
  message: string
  history: ChatMessage[]
  context: InstructorContext
}): Promise<ChatResult> {
  const db = getDb()
  const active = getActiveProvider(params.userId)
  if (!PROVIDERS[active]) return { success: false, error: `Unknown provider: ${active}` }

  const chain = providerChain(params.userId, active)
  if (!chain.length) {
    return {
      success: false,
      error: `No API key configured for ${active}. Add your key in Settings → AI Configuration.`,
    }
  }

  const systemPrompt = buildSystemPrompt(params.userId, params.context)
  const deadline = Date.now() + aiLimits.totalMs
  const failures: { label: string; reason: string }[] = []
  let response = ''
  let provider = ''
  let emptyFrom = ''
  let onlyEmpty = true

  // One provider failing (expired key, busy, offline, retired model) must never end the conversation:
  // the next provider that has a key is tried before the student is told anything.
  for (const [index, name] of chain.entries()) {
    const remaining = deadline - Date.now()
    if (index > 0 && remaining < aiLimits.minAttemptMs) break
    const cfg = PROVIDERS[name]
    const apiKey = getApiKey(params.userId, name) as string
    const timeoutMs = Math.max(aiLimits.minAttemptMs, Math.min(aiLimits.attemptMs, remaining))
    try {
      const text = await callWithModelRecovery(name, apiKey, (model) =>
        cfg.kind === 'gemini'
          ? callGemini(apiKey, systemPrompt, params.history, params.message, model, timeoutMs)
          : callOpenAI(apiKey, systemPrompt, params.history, params.message, cfg.baseUrl, model, timeoutMs), timeoutMs)
      if (text.trim()) { response = text; provider = name; break }
      failures.push({ label: cfg.label, reason: 'It sent back an empty answer.' })
      emptyFrom = emptyFrom || name
    } catch (err: unknown) {
      onlyEmpty = false
      const reason = (err as any)?.message ?? 'Something went wrong.'
      failures.push({ label: cfg.label, reason: /[.!?]$/.test(reason) ? reason : `${reason}.` })
    }
  }

  // Every provider that answered at all answered with nothing: show the plain "No response." line, not an error.
  if (!provider && emptyFrom && onlyEmpty) { response = emptyReply(emptyFrom); provider = emptyFrom }
  if (!provider) return { success: false, unavailable: true, error: allFailedMessage(failures) }

  // Only a real exchange is saved, so a failed attempt leaves no half-conversation behind.
  const conversationId = params.conversationId ?? (() => {
    const id = uuidv4()
    db.prepare(`
      INSERT INTO ai_conversations (id, user_id, context, context_id)
      VALUES (?, ?, ?, ?)
    `).run(id, params.userId, params.context.type, null)
    return id
  })()
  db.prepare(`INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`)
    .run(uuidv4(), conversationId, params.message)
  db.prepare(`INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)`)
    .run(uuidv4(), conversationId, response)
  db.prepare(`UPDATE api_keys SET last_used = datetime('now') WHERE user_id = ? AND provider = ?`)
    .run(params.userId, provider)

  return { success: true, message: response, provider, conversationId }
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
// PROVIDERS AND LIVE MODEL DISCOVERY
// ─────────────────────────────────────────────
//
// Model names expire: providers retire them every few months. So the app never relies on a pinned name.
//   1. A model the user chose (app_settings "{provider}_model") is used first.
//   2. Otherwise the provider is asked which models it offers right now and the best chat model is used.
//   3. If a saved model has been retired (the provider says "model not found"), the list is fetched again,
//      the saved choice is replaced and the request is retried once - the student never sees the failure.
//   4. Only if the provider's list cannot be fetched at all does `lastResortModel` apply. It is a
//      fallback, not the source of truth.

interface ProviderConfig {
  kind: 'gemini' | 'openai'
  label: string
  baseUrl: string
  /** Where the provider lists its models, when that is not `${baseUrl}/models`. */
  modelsUrl?: string
  lastResortModel: string
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  gemini:      { kind: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', lastResortModel: 'gemini-flash-latest' },
  xai:         { kind: 'openai', label: 'xAI Grok',      baseUrl: 'https://api.x.ai/v1',                              lastResortModel: 'grok-4' },
  openai:      { kind: 'openai', label: 'OpenAI',        baseUrl: 'https://api.openai.com/v1',                        lastResortModel: 'gpt-4o-mini' },
  openrouter:  { kind: 'openai', label: 'OpenRouter',    baseUrl: 'https://openrouter.ai/api/v1',                     lastResortModel: 'openai/gpt-4o-mini' },
  nvidia:      { kind: 'openai', label: 'Nvidia NIM',    baseUrl: 'https://integrate.api.nvidia.com/v1',              lastResortModel: 'meta/llama-3.3-70b-instruct' },
  groq:        { kind: 'openai', label: 'Groq',          baseUrl: 'https://api.groq.com/openai/v1',                   lastResortModel: 'llama-3.3-70b-versatile' },
  cerebras:    { kind: 'openai', label: 'Cerebras',      baseUrl: 'https://api.cerebras.ai/v1',                       lastResortModel: 'llama-3.3-70b' },
  mistral:     { kind: 'openai', label: 'Mistral AI',    baseUrl: 'https://api.mistral.ai/v1',                        lastResortModel: 'mistral-small-latest' },
  cohere:      { kind: 'openai', label: 'Cohere',        baseUrl: 'https://api.cohere.ai/compatibility/v1',           lastResortModel: 'command-a-03-2025' },
  huggingface: { kind: 'openai', label: 'Hugging Face',  baseUrl: 'https://router.huggingface.co/v1',                 lastResortModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  github:      { kind: 'openai', label: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', modelsUrl: 'https://models.github.ai/catalog/models', lastResortModel: 'openai/gpt-4o-mini' },
}

/** An error from a provider that keeps the HTTP status, so the caller can tell "model retired" from "no internet". */
class ProviderError extends Error {
  constructor(message: string, public status?: number) { super(message) }
  /** The provider is saying the model name itself is the problem (retired, renamed, not available to this key). */
  get isModelProblem(): boolean {
    if (this.status !== 400 && this.status !== 404 && this.status !== 410) return false
    return /model|decommission|deprecat|not found|does not exist|no longer/i.test(this.message)
  }
}

// Ids that are not conversational chat models.
const NOT_CHAT = /embed|whisper|tts|audio|speech|transcrib|moderation|guard|rerank|dall-e|image|imagen|veo|\bocr\b|safety|realtime|search|computer-use|davinci|babbage|deep-research|codex|aqa|robotics|\blive\b|diffusion/i

function isChatModel(id: string): boolean { return !!id && !NOT_CHAT.test(id) }

/** Gemini: newest stable Flash first (cheap and fast, right for tutoring), then other Gemini models. */
function geminiRank(id: string): number {
  const version = parseFloat(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? '0')
  const flash = /flash/.test(id) && !/lite/.test(id) ? 1 : 0
  const stable = /preview|exp|thinking/.test(id) ? 0 : 1
  return flash * 1000 + stable * 100 + version
}

function dbSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any
  return row?.value || null
}
function saveModel(provider: string, model: string): void {
  getDb().prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(`${provider}_model`, model)
}

function authFailureMessage(label: string): string {
  return `${label} rejected the API key - it is probably expired or revoked. Create a new key with ${label} and save it in Settings → AI Configuration.`
}

async function fetchWithTimeout(url: string, init: any, ms: number, label: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new ProviderError(`${label[0].toUpperCase()}${label.slice(1)} took too long to respond. Check your internet connection and try again.`)
    throw new ProviderError(`Could not reach ${label}: ${err?.message ?? err}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Ask the provider which chat models it offers right now. Best choice first. */
async function discoverModels(provider: string, apiKey: string, timeoutMs = 15_000): Promise<string[]> {
  const cfg = PROVIDERS[provider]
  if (!cfg) throw new ProviderError(`Unknown provider: ${provider}`)

  let res: Response
  if (cfg.kind === 'gemini') {
    // The key goes in a header, never in the URL (URLs end up in logs and error messages).
    res = await fetchWithTimeout(`${cfg.baseUrl}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } }, timeoutMs, cfg.label)
  } else {
    res = await fetchWithTimeout(cfg.modelsUrl ?? `${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, timeoutMs, cfg.label)
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError(authFailureMessage(cfg.label), res.status)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new ProviderError(body?.error?.message ?? `${cfg.label} could not list its models (error ${res.status}).`, res.status)
  }
  const body = await res.json().catch(() => ({})) as any

  if (cfg.kind === 'gemini') {
    const ids: string[] = (body.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((id: string) => /^gemini/.test(id) && isChatModel(id))
    return [...new Set(ids)].sort((a, b) => geminiRank(b) - geminiRank(a))
  }

  const rows: any[] = Array.isArray(body) ? body : (body.data ?? body.models ?? [])
  const chat = rows
    .map((m, i) => ({ id: String(m?.id ?? m?.name ?? ''), created: Number(m?.created) || 0, i }))
    .filter((m) => isChatModel(m.id))
  // Newest first; providers that give no date keep the order they listed them in.
  chat.sort((a, b) => (b.created - a.created) || (a.i - b.i))
  return [...new Set(chat.map((m) => m.id))]
}

export interface ModelListResult {
  success: boolean
  models?: string[]
  /** The model that will be used: the saved one if the provider still offers it, otherwise the best current one. */
  selected?: string
  error?: string
}

/** For the Settings screen: the live list of models this key can use. Never changes any setting. */
export async function listModels(userId: string, provider: string): Promise<ModelListResult> {
  const cfg = PROVIDERS[provider]
  if (!cfg) return { success: false, error: `Unknown provider: ${provider}` }
  const apiKey = getApiKey(userId, provider)
  if (!apiKey) return { success: false, error: `No API key configured for ${cfg.label}. Add your key first.` }
  try {
    const models = await discoverModels(provider, apiKey)
    if (!models.length) return { success: false, error: `${cfg.label} did not list any chat models for this key.` }
    const saved = dbSetting(`${provider}_model`)
    return { success: true, models, selected: saved && models.includes(saved) ? saved : models[0] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/** Run `call` with a working model, discovering or replacing the model when needed (see the header above). */
async function callWithModelRecovery(provider: string, apiKey: string, call: (model: string) => Promise<string>, timeoutMs = 15_000): Promise<string> {
  const cfg = PROVIDERS[provider]
  let model = dbSetting(`${provider}_model`)
  if (!model) {
    try {
      model = (await discoverModels(provider, apiKey, Math.min(15_000, timeoutMs)))[0] ?? null
      if (model) saveModel(provider, model)
    } catch (err: any) {
      // A rejected key will fail the chat call too, with the same clear message - let that happen below.
      model = null
    }
  }
  const first = model ?? cfg.lastResortModel
  try {
    return await call(first)
  } catch (err) {
    if (!(err instanceof ProviderError) || !err.isModelProblem) throw err
    let replacement: string | undefined
    try { replacement = (await discoverModels(provider, apiKey, Math.min(15_000, timeoutMs))).find((m) => m !== first) } catch { /* keep the original error */ }
    if (!replacement) throw err
    saveModel(provider, replacement)
    return call(replacement)
  }
}

async function callGemini(apiKey: string, systemPrompt: string, history: ChatMessage[], userMessage: string, model: string, timeoutMs: number): Promise<string> {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  // Without an explicit timeout, fetch() waits indefinitely if a request stalls (flaky wifi, captive portal,
  // overloaded provider) and the chat spinner would hang forever. 45s is generous for an LLM response.
  const res = await fetchWithTimeout(
    `${PROVIDERS.gemini.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    },
    timeoutMs,
    'Gemini',
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    if (res.status === 401 || res.status === 403) throw new ProviderError(authFailureMessage('Gemini'), res.status)
    throw new ProviderError(err.error?.message ?? `Gemini error ${res.status}`, res.status)
  }

  const data = await res.json() as any
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callOpenAI(apiKey: string, systemPrompt: string, history: ChatMessage[], userMessage: string, baseUrl: string, model: string, timeoutMs: number): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const res = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    },
    timeoutMs,
    'the AI provider',
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('The AI provider rejected the API key - it is probably expired or revoked. Create a new key and save it in Settings → AI Configuration.', res.status)
    }
    throw new ProviderError(err.error?.message ?? `API error ${res.status}`, res.status)
  }

  const data = await res.json() as any
  return data.choices?.[0]?.message?.content ?? ''
}
