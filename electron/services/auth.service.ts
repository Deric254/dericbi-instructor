import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

export interface User {
  id: string
  name: string
  email: string
  experience_level: string
  learning_goals: string[]
  avatar_color: string
  is_admin?: boolean
  created_at: string
}

export interface AuthResult {
  success: boolean
  user?: User
  token?: string
  error?: string
}

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

export async function register(params: {
  name: string
  email: string
  password: string
  experience_level: string
  learning_goals: string[]
}): Promise<AuthResult> {
  const db = getDb()

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(params.email)
  if (existing) {
    return { success: false, error: 'An account with this email already exists.' }
  }

  const password_hash = await bcrypt.hash(params.password, 12)
  const userId = uuidv4()

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, experience_level, learning_goals)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const initSkills = db.prepare(`
    INSERT INTO skill_ratings (id, user_id, skill, score) VALUES (?, ?, ?, 0)
  `)

  const initRank = db.prepare(`
    INSERT INTO analyst_ranks (id, user_id) VALUES (?, ?)
  `)

  const setup = db.transaction(() => {
    insertUser.run(
      userId,
      params.name,
      params.email,
      password_hash,
      params.experience_level,
      JSON.stringify(params.learning_goals)
    )

    const skills = ['sql', 'excel', 'python', 'powerbi', 'statistics', 'business_thinking']
    for (const skill of skills) {
      initSkills.run(uuidv4(), userId, skill)
    }

    initRank.run(uuidv4(), userId)
  })

  setup()

  // Auto-setup new user: unlock intro lessons, ensure skill ratings + rank exist
  try {
    const { setupNewUser } = require("./setup.service")
    setupNewUser(userId)
  } catch (e: any) {
    console.error("[Auth] setupNewUser failed:", e.message)
  }


  const token = await createSession(userId)
  const user = getUserById(userId)!

  return { success: true, user, token }
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

export async function login(params: {
  email: string
  password: string
}): Promise<AuthResult> {
  const db = getDb()

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(params.email) as any
  if (!row) {
    return { success: false, error: 'No account found with this email.' }
  }

  const valid = await bcrypt.compare(params.password, row.password_hash)
  if (!valid) {
    return { success: false, error: 'Incorrect password.' }
  }

  const token = await createSession(row.id)
  const user = rowToUser(row)

  return { success: true, user, token }
}

// ─────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), userId, tokenHash, expiresAt)

  return token
}

export function validateSession(token: string): User | null {
  const db = getDb()
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const session = db.prepare(`
    SELECT s.*, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ?
      AND s.expires_at > datetime('now')
  `).get(tokenHash) as any

  if (!session) return null

  // Update last_seen
  db.prepare('UPDATE sessions SET last_seen = datetime(\'now\') WHERE token_hash = ?')
    .run(tokenHash)

  return rowToUser(session)
}

export function logout(token: string): void {
  const db = getDb()
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
}

export function logoutAllSessions(userId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

// ─────────────────────────────────────────────
// USER HELPERS
// ─────────────────────────────────────────────

export function getUserById(id: string): User | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  return row ? rowToUser(row) : null
}

export function updateUser(id: string, updates: Partial<{
  name: string
  experience_level: string
  learning_goals: string[]
  avatar_color: string
}>): User | null {
  const db = getDb()
  const fields: string[] = []
  const values: any[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.experience_level !== undefined) { fields.push('experience_level = ?'); values.push(updates.experience_level) }
  if (updates.learning_goals !== undefined) { fields.push('learning_goals = ?'); values.push(JSON.stringify(updates.learning_goals)) }
  if (updates.avatar_color !== undefined) { fields.push('avatar_color = ?'); values.push(updates.avatar_color) }

  if (fields.length === 0) return getUserById(id)

  fields.push('updated_at = datetime(\'now\')')
  values.push(id)

  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getUserById(id)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any

  const valid = await bcrypt.compare(currentPassword, row.password_hash)
  if (!valid) return { success: false, error: 'Current password is incorrect.' }

  const newHash = await bcrypt.hash(newPassword, 12)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId)
  return { success: true }
}

// ─────────────────────────────────────────────
// ROW MAPPER
// ─────────────────────────────────────────────

function rowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    experience_level: row.experience_level,
    learning_goals: JSON.parse(row.learning_goals || '[]'),
    avatar_color: row.avatar_color,
    is_admin: row.is_admin === 1,
    created_at: row.created_at,
  }
}

// ─────────────────────────────────────────────
// FORGOT PASSWORD — Security question based
// (local desktop app — no email server)
// ─────────────────────────────────────────────

export function setSecurityQuestion(userId: string, question: string, answer: string): void {
  const db = getDb()
  const answerHash = require('crypto')
    .createHash('sha256')
    .update(answer.trim().toLowerCase())
    .digest('hex')

  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(`security_q_${userId}`, question)

  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(`security_a_${userId}`, answerHash)
}

export function getSecurityQuestion(email: string): { question: string; userId: string } | null {
  const db = getDb()
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any
  if (!user) return null

  const q = db.prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(`security_q_${user.id}`) as any

  if (!q) return null
  return { question: q.value, userId: user.id }
}

export async function resetPasswordWithAnswer(params: {
  email: string
  answer: string
  newPassword: string
}): Promise<{ success: boolean; error?: string }> {
  const db = getDb()
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(params.email) as any
  if (!user) return { success: false, error: 'No account found with this email.' }

  const storedHash = db.prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(`security_a_${user.id}`) as any

  if (!storedHash) {
    return { success: false, error: 'No security question set for this account. Contact the app administrator.' }
  }

  const answerHash = require('crypto')
    .createHash('sha256')
    .update(params.answer.trim().toLowerCase())
    .digest('hex')

  if (answerHash !== storedHash.value) {
    return { success: false, error: 'Incorrect answer. Try again.' }
  }

  if (params.newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters.' }
  }

  const newHash = await bcrypt.hash(params.newPassword, 12)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id)

  // Invalidate all existing sessions
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)

  return { success: true }
}
