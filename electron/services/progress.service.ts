import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { SKILLS, SKILLS_CAPSTONE } from './skills'
import { knownLessonIds } from './placement'

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
        // `distinct` counts each exercise once, however many times it was solved
        let q = `SELECT COUNT(${condition.distinct ? 'DISTINCT exercise_id' : '*'}) as c FROM exercise_attempts WHERE user_id = ? AND is_correct = 1`
        const params: any[] = [userId]
        if (condition.skill) {
          q += ' AND exercise_id IN (SELECT id FROM exercises WHERE lesson_id IN (SELECT id FROM lessons WHERE module = ?))'
          params.push(condition.skill)
        }
        if (condition.exercise_type) {
          q += ' AND exercise_id IN (SELECT id FROM exercises WHERE exercise_type = ?)'
          params.push(condition.exercise_type)
        }
        const count = (db.prepare(q).get(...params) as any).c
        met = count >= condition.count
        break
      }
      case 'lesson_complete': {
        met = !!db.prepare("SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND status = 'complete'").get(userId, condition.lesson_id)
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
  plan: LearningPlan
}

export interface RecentActivity {
  type: string
  description: string
  timestamp: string
}

// ─────────────────────────────────────────────
// WHAT TO DO NEXT: continue point, streak, progress per academy, exercises worth another go
// ─────────────────────────────────────────────

export interface LearningPlan {
  next: { lesson_id: string; title: string; module: string; status: 'in_progress' | 'available' | 'new' } | null
  streak_days: number
  active_today: boolean
  modules: { module: string; complete: number; total: number }[]
  review: { exercise_id: string; title: string; lesson_title: string; module: string }[]
}

const MODULE_ORDER = ['sql', 'excel', 'python', 'powerbi', 'statistics', 'business', 'dataeng', 'bizsolver', 'foundations', 'founder', 'simulation']
const moduleRank = (m: string) => { const i = MODULE_ORDER.indexOf(m); return i === -1 ? MODULE_ORDER.length : i }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Days in a row (ending today, or yesterday if today has no activity yet) on which the student did something. */
export function streakFrom(timestampsUtc: string[], now: Date = new Date()): { streak: number; activeToday: boolean } {
  const days = new Set<string>()
  for (const ts of timestampsUtc) {
    const d = new Date(`${String(ts).trim().replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? '' : 'Z'}`)
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d)) // the student's own calendar day, not UTC's
  }
  const activeToday = days.has(dayKey(now))
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  if (!activeToday) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1) }
  return { streak, activeToday }
}

export function getLearningPlan(userId: string, now: Date = new Date()): LearningPlan {
  const db = getDb()

  // 1. The lesson they were in the middle of; 2. otherwise the next one that is open to them.
  let next: LearningPlan['next'] = null
  const midway = db.prepare(`
    SELECT l.id, l.title, l.module FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
    WHERE lp.user_id = ? AND lp.status = 'in_progress' ORDER BY lp.started_at DESC LIMIT 1
  `).get(userId) as any
  if (midway) next = { lesson_id: midway.id, title: midway.title, module: midway.module, status: 'in_progress' }
  else {
    const allOpen = db.prepare(`
      SELECT l.id, l.title, l.module, l.sort_order, lp.status AS progress
      FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
      WHERE (lp.status = 'available' OR (lp.status IS NULL AND l.prerequisites = '[]'))
    `).all(userId) as any[]
    // Lessons the learner showed they already know (placement check) stay open but are not suggested as next.
    const known = new Set(knownLessonIds(userId))
    const candidates = allOpen.filter((c) => !known.has(c.id))
    // Stay in the academy they just worked in; only when it has nothing open fall back to the fixed academy order.
    const last = db.prepare(`
      SELECT l.module FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
      WHERE lp.user_id = ? AND lp.status = 'complete' ORDER BY lp.completed_at DESC LIMIT 1
    `).get(userId) as any
    const here = last ? candidates.filter((c) => c.module === last.module) : []
    // Someone who has not finished anything yet is pointed at Start Here; everyone else keeps the order above.
    const fresh = last ? [] : candidates.filter((c) => c.module === 'foundations')
    // Having just finished Start Here, the natural next step is the Founder Track.
    const founderNext = last?.module === 'foundations' ? candidates.filter((c) => c.module === 'founder') : []
    const open = (here.length ? here : founderNext.length ? founderNext : fresh.length ? fresh : candidates).sort((a, b) => moduleRank(a.module) - moduleRank(b.module) || a.sort_order - b.sort_order)[0]
    if (open) next = { lesson_id: open.id, title: open.title, module: open.module, status: open.progress ? 'available' : 'new' }
  }

  const stamps = (db.prepare(`
    SELECT ts FROM (
      SELECT substr(attempted_at, 1, 16) AS ts FROM exercise_attempts WHERE user_id = ?
      UNION SELECT substr(executed_at, 1, 16) FROM sql_query_history WHERE user_id = ?
      UNION SELECT substr(completed_at, 1, 16) FROM lesson_progress WHERE user_id = ? AND completed_at IS NOT NULL
      UNION SELECT substr(started_at, 1, 16) FROM lesson_progress WHERE user_id = ? AND started_at IS NOT NULL
    ) WHERE ts >= date('now', '-400 days') LIMIT 20000
  `).all(userId, userId, userId, userId) as any[]).map((r) => r.ts as string)
  const { streak, activeToday } = streakFrom(stamps, now)

  const modules = (db.prepare(`
    SELECT l.module, COUNT(*) AS total, SUM(CASE WHEN lp.status = 'complete' THEN 1 ELSE 0 END) AS complete
    FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
    GROUP BY l.module
  `).all(userId) as any[]).map((r) => ({ module: r.module as string, complete: Number(r.complete ?? 0), total: Number(r.total) }))
    .sort((a, b) => moduleRank(a.module) - moduleRank(b.module))

  // Exercises whose latest try was wrong and never got right, left for at least a day (so it is a return visit, not a retry).
  const review = db.prepare(`
    SELECT e.id AS exercise_id, e.title, l.title AS lesson_title, l.module
    FROM exercises e
    JOIN lessons l ON l.id = e.lesson_id
    JOIN exercise_attempts a ON a.exercise_id = e.id AND a.user_id = ?
    WHERE e.evaluation_mode IN ('exact', 'result_match')
      AND a.is_correct = 0
      AND a.attempted_at = (SELECT MAX(x.attempted_at) FROM exercise_attempts x WHERE x.exercise_id = e.id AND x.user_id = ?)
      AND a.attempted_at <= datetime('now', '-1 day')
      AND NOT EXISTS (SELECT 1 FROM exercise_attempts c WHERE c.exercise_id = e.id AND c.user_id = ? AND c.is_correct = 1)
    GROUP BY e.id ORDER BY a.attempted_at ASC LIMIT 3
  `).all(userId, userId, userId) as LearningPlan['review']

  return { next, streak_days: streak, active_today: activeToday, modules, review }
}

export interface SkillMapLesson { id: string; title: string; module: string; status: string }
export interface SkillMapEntry {
  id: number; title: string; problem: string
  lessons: SkillMapLesson[]; complete: number; total: number
}
export interface SkillMap { skills: SkillMapEntry[]; capstone: SkillMapLesson | null }

/** The eight business skills with the student's progress on every lesson that builds each one. */
export function getSkillMap(userId: string): SkillMap {
  const db = getDb()
  const rows = db.prepare(`
    SELECT l.id, l.title, l.module, l.prerequisites, lp.status AS progress
    FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
  `).all(userId) as any[]
  const byId = new Map<string, SkillMapLesson>(rows.map((r) => [r.id, {
    id: r.id, title: r.title, module: r.module,
    status: r.progress ?? (r.prerequisites === '[]' || r.prerequisites === '' ? 'available' : 'locked'),
  }]))
  const skills = SKILLS.map((s) => {
    const lessons = s.lessons.map((id) => byId.get(id)).filter((l): l is SkillMapLesson => !!l)
    return { id: s.id, title: s.title, problem: s.problem, lessons, complete: lessons.filter((l) => l.status === 'complete').length, total: lessons.length }
  })
  return { skills, capstone: byId.get(SKILLS_CAPSTONE) ?? null }
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
    plan: getLearningPlan(userId),
  }
}
