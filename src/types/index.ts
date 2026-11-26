// ─────────────────────────────────────────────
// USER & AUTH
// ─────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  experience_level: 'beginner' | 'junior' | 'analyst' | 'senior' | 'consultant'
  learning_goals: string[]
  avatar_color: string
  is_admin?: boolean
  created_at: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

// ─────────────────────────────────────────────
// SKILL & PROGRESS
// ─────────────────────────────────────────────

export type SkillId = 'sql' | 'excel' | 'python' | 'powerbi' | 'statistics' | 'business_thinking'

export interface SkillRating {
  skill: SkillId
  score: number
  updated_at: string
}

export interface RankInfo {
  current_rank: string
  current_rank_label: string
  total_points: number
  next_rank?: {
    id: string
    label: string
    points_needed: number
  }
  progress_pct: number
}

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
  plan?: LearningPlan
}

export type PathSide = 'tech' | 'business' | 'bridge'
export interface PathSideScore { required: number; done: number; quiz_avg: number | null; score: number | null; ready: boolean }
export type PathItem =
  | { kind: 'lesson'; id: string; title: string; module: string; side: PathSide; optional: boolean; status: string; done: boolean; best: number | null; provisional: boolean; light: 'green' | 'amber' | 'red' | null }
  | { kind: 'planned'; id: string; title: string; summary: string; side: PathSide; optional: boolean }
export interface PathPhase {
  id: string; index: number; title: string; weeks: string; focus: string; project: string | null; gate: string
  gate_evidence: string; gate_saved_at: string | null; items: PathItem[]; tech: PathSideScore; business: PathSideScore; complete: boolean; open: boolean
}
export interface EvidenceEntry {
  id: string; kind: 'case' | 'history' | 'quote'; title: string; text: string; takeaway: string; concepts: string[]
  who?: string; work?: string; source: { publisher: string; title: string; url: string }; checked: string
}
export interface TutorModeInfo { id: string; label: string; primary: boolean; ask: string | null; needs_input: boolean }
export interface TutorCheck { results: Array<{ id: string; why: string; ok: boolean; reason: string }>; allOk: boolean; ran: number }
export interface JumpGap { kind: 'concept' | 'lesson'; id: string; name: string; definition: string }
export interface JumpCheck {
  lesson_id: string; title: string; status: string; light: 'green' | 'amber' | 'red'; held: boolean
  gaps: JumpGap[]; questions: Array<{ ref: string; question: string; options: string[] }>
}
export type JumpResult =
  | { success: false; reason: 'unknown' | 'invalid' | 'held' }
  | { success: true; started: boolean; passed: boolean; provisional: boolean; correct?: number; total?: number }
export interface LadderData {
  levels: Array<{ level: number; name: string; meaning: string; available: boolean }>
  concepts: Array<{ id: string; name: string; level: number }>
}
export interface PathData {
  title: string; pass_pct: number; gate_min_words: number; strict: boolean; phases: PathPhase[]
  current_phase: string | null; weaker: 'tech' | 'business' | null
  next: { lesson_id: string; title: string; module: string; side: PathSide; reason: string } | null
  later: string[]
}

export interface LearningPlan {
  next: { lesson_id: string; title: string; module: string; status: 'in_progress' | 'available' | 'new' } | null
  streak_days: number
  active_today: boolean
  modules: { module: string; complete: number; total: number }[]
  review: { exercise_id: string; title: string; lesson_title: string; module: string }[]
}

export interface RecentActivity {
  type: string
  description: string
  timestamp: string
}

// ─────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────

export type LessonModule = 'sql' | 'excel' | 'python' | 'powerbi' | 'statistics' | 'business' | 'dataeng' | 'bizsolver' | 'foundations' | 'founder' | 'aiml' | 'techfirst' | 'simulation'
export type LessonLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'complete'

export interface Lesson {
  id: string
  module: LessonModule
  title: string
  description: string
  level: LessonLevel
  prerequisites: string[]
  estimated_min: number
  theory_md: string
  quiz?: string  // raw JSON string: {question, options, correct_index, explanation}[] — parse before use
  sort_order: number
  user_status: LessonStatus
  path_locked?: number  // 1 when the learner's strict master track holds this lesson back
  completed_at?: string
  time_spent_s?: number
}

// ─────────────────────────────────────────────
// EXERCISES
// ─────────────────────────────────────────────

export type ExerciseType = 'sql_query' | 'python_code' | 'formula' | 'mcq' | 'analysis' | 'freeform'

export interface Exercise {
  id: string
  lesson_id: string
  exercise_type: ExerciseType
  title: string
  prompt: string
  context_md: string
  dataset_id?: string
  hint_1?: string
  hint_2?: string
  hint_3?: string
  solution: string
  evaluation_mode: string
  points: number
  sort_order: number
}

export interface ExerciseAttempt {
  is_correct: boolean
  score: number
  feedback?: string
  actual_rows?: any[]
  expected_rows?: any[]
}

// ─────────────────────────────────────────────
// SQL PLAYGROUND
// ─────────────────────────────────────────────

export interface SqlResult {
  success: boolean
  rows?: any[]
  columns?: string[]
  row_count?: number
  exec_ms?: number
  error?: string
  affected_rows?: number
  truncated?: boolean
  notice?: string
}

export interface Dataset {
  id: string
  name: string
  description: string
  domain?: string
  table_name: string
  row_count?: number
  column_info?: string
}

export interface DataProfile {
  row_count: number
  column_count: number
  columns: ColumnProfile[]
  duplicate_rows: number
  quality_score: number
  issues: string[]
}

export interface ColumnProfile {
  name: string
  type: string
  null_count: number
  null_pct: number
  unique_count: number
  sample_values: any[]
}

// ─────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  points: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  earned_at?: string
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────

export type NavSection =
  | 'owner'
  | 'dashboard'
  | 'path'
  | 'sql'
  | 'excel'
  | 'python'
  | 'powerbi'
  | 'statistics'
  | 'business'
  | 'dataeng'
  | 'bizsolver'
  | 'foundations'
  | 'founder'
  | 'aiml'
  | 'techfirst'
  | 'simulations'
  | 'playground'
  | 'datasets'
  | 'projects'
  | 'portfolio'
  | 'achievements'
  | 'settings'
  | 'admin'

// ── Licensing and the Owner Console ──
export interface LicenceState {
  ok: boolean
  kind: 'owner' | 'licensed' | 'expired' | 'unlicensed' | 'unconfigured'
  message: string
  installCode: string
  user?: string
  expires?: string
  daysLeft?: number
  /** Past the end date but inside the grace days: everything still works. */
  grace?: boolean
  graceDaysLeft?: number
  /** Past the grace days: data can be viewed but not changed. */
  readOnly?: boolean
  lifetime?: boolean
}

export type OwnerResult<T extends object = {}> = ({ success: true } & T) | { success: false; error: string; cancelled?: boolean }

export type CustomerStatus = 'none' | 'active' | 'expiring' | 'expired'

export interface OwnerCustomer {
  id: string
  name: string
  contact: string
  code: string
  notes: string
  createdAt: string
  payments: Record<string, { paidAt: string; amount: number | null }>
  status: CustomerStatus
  paidThrough: string | null
  needsRenewal: boolean
  licenceExpires: string | null
  daysLeft: number | null
  lastLicence: { issuedAt: string; expires: string; token: string } | null
  history: { issuedAt: string; expires: string; token: string }[]
}

export interface OwnerOverview {
  signing: { unlocked: boolean; until: number | null }
  settings: { graceDays: number; defaultAmount: number | null; keyPath: string }
  summary: {
    total: number; active: number; expiring: number; expired: number; notIssued: number
    paidThisMonth: number; unpaidThisMonth: number; received: number; month: string
  }
  customers: OwnerCustomer[]
}

export interface OwnerIssueInput { code: string; name: string; contact?: string; notes?: string; months?: number; amount?: number | null; lifetime?: boolean }
export interface IssuedLicence { licence: string; expires: string; name: string; contact: string; customerId: string }
