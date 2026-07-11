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
}

export interface RecentActivity {
  type: string
  description: string
  timestamp: string
}

// ─────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────

export type LessonModule = 'sql' | 'excel' | 'python' | 'powerbi' | 'statistics' | 'business' | 'simulation'
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
  | 'dashboard'
  | 'sql'
  | 'excel'
  | 'python'
  | 'powerbi'
  | 'statistics'
  | 'business'
  | 'simulations'
  | 'playground'
  | 'datasets'
  | 'projects'
  | 'portfolio'
  | 'achievements'
  | 'settings'
  | 'admin'
