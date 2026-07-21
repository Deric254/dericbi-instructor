import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

// ─────────────────────────────────────────────
// SKILL RATINGS
// ─────────────────────────────────────────────

export interface SkillRating {
  skill: string
  score: number
  updated_at: string
}

export function getSkillRatings(userId: string): SkillRating[] {
  const db = getDb()
  return db.prepare(`
    SELECT skill, score, updated_at FROM skill_ratings WHERE user_id = ?
  `).all(userId) as SkillRating[]
}

export function updateSkillScore(userId: string, skill: string, delta: number): void {
  const db = getDb()
  db.prepare(`
    UPDATE skill_ratings
    SET score = MIN(100, MAX(0, score + ?)), updated_at = datetime('now')
    WHERE user_id = ? AND skill = ?
  `).run(delta, userId, skill)
}

export function setSkillScore(userId: string, skill: string, score: number): void {
  const db = getDb()
  db.prepare(`
    UPDATE skill_ratings
    SET score = ?, updated_at = datetime('now')
    WHERE user_id = ? AND skill = ?
  `).run(Math.min(100, Math.max(0, score)), userId, skill)
}

// ─────────────────────────────────────────────
// LEARNING MEMORY
// ─────────────────────────────────────────────

export interface LearningMemoryEntry {
  id: string
  memory_type: string
  skill: string
  topic: string
  detail: string
  weight: number
  created_at: string
}

export function addMemory(userId: string, entry: {
  memory_type: 'mistake' | 'strength' | 'weakness' | 'preference' | 'milestone'
  skill: string
  topic: string
  detail: string
  weight?: number
}): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO learning_memory (id, user_id, memory_type, skill, topic, detail, weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(), userId, entry.memory_type, entry.skill,
    entry.topic, entry.detail, entry.weight ?? 1.0
  )
}

export function getMemory(userId: string, options?: {
  skill?: string
  memory_type?: string
  limit?: number
}): LearningMemoryEntry[] {
  const db = getDb()
  let query = 'SELECT * FROM learning_memory WHERE user_id = ?'
  const params: any[] = [userId]

  if (options?.skill) { query += ' AND skill = ?'; params.push(options.skill) }
  if (options?.memory_type) { query += ' AND memory_type = ?'; params.push(options.memory_type) }

  query += ' ORDER BY weight DESC, created_at DESC'
  if (options?.limit) {
    // Never interpolate a value from an IPC call directly into SQL — IPC
    // payloads aren't runtime-type-checked (TypeScript types only apply at
    // compile time), so options.limit could in principle be a crafted
    // string here, not the number the type declares. Coercing to a bounded
    // integer closes that off entirely rather than trusting the caller.
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(options.limit)) || 20))
    query += ` LIMIT ${safeLimit}`
  }

  return db.prepare(query).all(...params) as LearningMemoryEntry[]
}

export function getMemorySummary(userId: string): string {
  const memories = getMemory(userId, { limit: 20 })
  if (memories.length === 0) return ''

  const lines = memories.map(m => {
    const prefix = m.memory_type === 'mistake' ? '⚠ Struggled with'
      : m.memory_type === 'strength' ? '✓ Strong at'
      : m.memory_type === 'weakness' ? '✗ Weak on'
      : m.memory_type === 'milestone' ? '★ Achieved'
      : 'Note:'
    return `${prefix} ${m.topic} (${m.skill}): ${m.detail}`
  })

  return lines.join('\n')
}

// ─────────────────────────────────────────────
// ANALYST RANK
// ─────────────────────────────────────────────

export const RANKS = [
  { id: 'analyst_trainee',       label: 'Analyst Trainee',       min_points: 0    },
  { id: 'junior_analyst',        label: 'Junior Analyst',        min_points: 200  },
  { id: 'data_analyst',          label: 'Data Analyst',          min_points: 500  },
  { id: 'senior_analyst',        label: 'Senior Analyst',        min_points: 1000 },
  { id: 'bi_analyst',            label: 'BI Analyst',            min_points: 1800 },
  { id: 'lead_analyst',          label: 'Lead Analyst',          min_points: 3000 },
  { id: 'analytics_consultant',  label: 'Analytics Consultant',  min_points: 5000 },
  { id: 'principal_consultant',  label: 'Principal Consultant',  min_points: 8000 },
]

export interface RankInfo {
  current_rank: string
  current_rank_label: string
  total_points: number
  next_rank?: { id: string; label: string; points_needed: number }
  progress_pct: number
}

export function getRankInfo(userId: string): RankInfo {
  const db = getDb()
  const row = db.prepare('SELECT * FROM analyst_ranks WHERE user_id = ?').get(userId) as any

  if (!row) {
    return {
      current_rank: 'analyst_trainee',
      current_rank_label: 'Analyst Trainee',
      total_points: 0,
      progress_pct: 0,
    }
  }

  const currentRankDef = RANKS.find(r => r.id === row.current_rank) ?? RANKS[0]
  const currentIndex = RANKS.indexOf(currentRankDef)
  const nextRankDef = RANKS[currentIndex + 1]

  let progress_pct = 0
  let next_rank

  if (nextRankDef) {
    const pointsInCurrentTier = row.total_points - currentRankDef.min_points
    const tierSize = nextRankDef.min_points - currentRankDef.min_points
    progress_pct = Math.min(100, Math.round((pointsInCurrentTier / tierSize) * 100))
    next_rank = {
      id: nextRankDef.id,
      label: nextRankDef.label,
      points_needed: nextRankDef.min_points - row.total_points,
    }
  } else {
    progress_pct = 100
  }

  return {
    current_rank: row.current_rank,
    current_rank_label: currentRankDef.label,
    total_points: row.total_points,
    next_rank,
    progress_pct,
  }
}

export function addPoints(userId: string, points: number): void {
  const db = getDb()

  db.prepare(`
    UPDATE analyst_ranks
    SET total_points = total_points + ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(points, userId)

  // Check for rank promotion
  const row = db.prepare('SELECT * FROM analyst_ranks WHERE user_id = ?').get(userId) as any
  const newRank = [...RANKS].reverse().find(r => row.total_points >= r.min_points)

  if (newRank && newRank.id !== row.current_rank) {
    const history = JSON.parse(row.rank_history || '[]')
    history.push({ rank: newRank.id, promoted_at: new Date().toISOString() })

    db.prepare(`
      UPDATE analyst_ranks
      SET current_rank = ?, rank_history = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(newRank.id, JSON.stringify(history), userId)
  }
}

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────

export function checkAndAwardAchievements(userId: string): string[] {
  const db = getDb()
  const awarded: string[] = []

  const allAchievements = db.prepare('SELECT * FROM achievements').all() as any[]
  const earned = new Set(
    (db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(userId) as any[])
      .map(r => r.achievement_id)
  )

  for (const ach of allAchievements) {
    if (earned.has(ach.id)) continue

    const condition = JSON.parse(ach.condition)
    let met = false

    switch (condition.type) {
      case 'login':
        met = true // called on login
        break
      case 'sql_query': {
        const count = (db.prepare('SELECT COUNT(*) as c FROM sql_query_history WHERE user_id = ?').get(userId) as any).c
        met = count >= condition.count
        break
      }
      case 'exercise_complete': {
        let q = 'SELECT COUNT(*) as c FROM exercise_attempts WHERE user_id = ? AND is_correct = 1'
        const params: any[] = [userId]
        if (condition.skill) {
          q += ' AND exercise_id IN (SELECT id FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE module = ?))'
          params.push(condition.skill)
        }
        const count = (db.prepare(q).get(...params) as any).c
        met = count >= condition.count
        break
      }
      case 'python_run': {
        const count = (db.prepare('SELECT COUNT(*) as c FROM python_code_history WHERE user_id = ?').get(userId) as any).c
        met = count >= condition.count
        break
      }
      case 'project_complete': {
        const count = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND status = \'complete\'').get(userId) as any).c
        met = count >= condition.count
        break
      }
      case 'portfolio_item': {
        const count = (db.prepare('SELECT COUNT(*) as c FROM portfolio_items WHERE user_id = ?').get(userId) as any).c
        met = count >= condition.count
        break
      }
      case 'simulation_complete': {
        const count = (db.prepare('SELECT COUNT(*) as c FROM simulation_sessions WHERE user_id = ? AND status = \'complete\'').get(userId) as any).c
        met = count >= condition.count
        break
      }
      case 'all_skills': {
        const ratings = db.prepare('SELECT score FROM skill_ratings WHERE user_id = ?').all(userId) as any[]
        met = ratings.length === 6 && ratings.every(r => r.score >= condition.min_score)
        break
      }
    }

    if (met) {
      db.prepare(`
        INSERT OR IGNORE INTO user_achievements (id, user_id, achievement_id)
        VALUES (?, ?, ?)
      `).run(uuidv4(), userId, ach.id)
      addPoints(userId, ach.points)
      awarded.push(ach.id)
    }
  }

  return awarded
}

// ─────────────────────────────────────────────
// DASHBOARD SUMMARY
// ─────────────────────────────────────────────

export interface DashboardStats {
  lessons_complete: number
  lessons_total: number
  exercises_attempted: number
  exercises_correct: number
  accuracy_pct: number
  total_time_hours: number
  projects_complete: number
  achievements_earned: number
  skill_ratings: SkillRating[]
  rank: RankInfo
  recent_activity: RecentActivity[]
}

export interface RecentActivity {
  type: string
  description: string
  timestamp: string
}

export function getDashboardStats(userId: string): DashboardStats {
  const db = getDb()

  const lessonsComplete = (db.prepare(`
    SELECT COUNT(*) as c FROM lesson_progress
    WHERE user_id = ? AND status = 'complete'
  `).get(userId) as any).c

  const lessonsTotal = (db.prepare('SELECT COUNT(*) as c FROM lessons').get() as any).c

  const attemptStats = db.prepare(`
    SELECT
      COUNT(*) as attempted,
      SUM(is_correct) as correct,
      SUM(time_spent_s) as total_time_s
    FROM exercise_attempts WHERE user_id = ?
  `).get(userId) as any

  const projectsComplete = (db.prepare(`
    SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND status = 'complete'
  `).get(userId) as any).c

  const achievementsEarned = (db.prepare(`
    SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ?
  `).get(userId) as any).c

  const recentActivity = db.prepare(`
    SELECT 'query' as type,
           'Ran a SQL query' as description,
           executed_at as timestamp
    FROM sql_query_history WHERE user_id = ?
    UNION ALL
    SELECT 'exercise' as type,
           'Completed an exercise' as description,
           attempted_at as timestamp
    FROM exercise_attempts WHERE user_id = ?
    ORDER BY timestamp DESC LIMIT 10
  `).all(userId, userId) as RecentActivity[]

  return {
    lessons_complete: lessonsComplete,
    lessons_total: lessonsTotal,
    exercises_attempted: attemptStats.attempted ?? 0,
    exercises_correct: attemptStats.correct ?? 0,
    accuracy_pct: attemptStats.attempted > 0
      ? Math.round((attemptStats.correct / attemptStats.attempted) * 100)
      : 0,
    total_time_hours: Math.round(((attemptStats.total_time_s ?? 0) / 3600) * 10) / 10,
    projects_complete: projectsComplete,
    achievements_earned: achievementsEarned,
    skill_ratings: getSkillRatings(userId),
    rank: getRankInfo(userId),
    recent_activity: recentActivity,
  }
}
