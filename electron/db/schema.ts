// DericBI Instructor — Complete Database Schema
// All DDL statements in migration order

export const SCHEMA_VERSION = 1

export const CREATE_TABLES = `

-- ─────────────────────────────────────────────
-- SCHEMA VERSION TRACKING
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL
);

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  experience_level TEXT NOT NULL DEFAULT 'beginner',
  -- beginner | junior | analyst | senior | consultant
  learning_goals  TEXT NOT NULL DEFAULT '[]',  -- JSON array
  avatar_color    TEXT NOT NULL DEFAULT '#6366f1',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- SESSIONS (persistent login)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  device_name TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

-- ─────────────────────────────────────────────
-- SKILL RATINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_ratings (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill      TEXT NOT NULL,
  -- sql | excel | python | powerbi | statistics | business_thinking
  score      REAL NOT NULL DEFAULT 0,   -- 0–100
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, skill)
);

-- ─────────────────────────────────────────────
-- LEARNING MEMORY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_memory (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type  TEXT NOT NULL,
  -- mistake | strength | weakness | preference | milestone
  skill        TEXT NOT NULL,
  topic        TEXT NOT NULL,
  detail       TEXT NOT NULL,
  weight       REAL NOT NULL DEFAULT 1.0,  -- importance 0–2
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_surfaced TEXT
);

-- ─────────────────────────────────────────────
-- LESSONS CATALOG
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id            TEXT PRIMARY KEY,
  module        TEXT NOT NULL,
  -- sql | excel | python | powerbi | statistics | business | simulation
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  level         TEXT NOT NULL,
  -- beginner | intermediate | advanced | expert
  prerequisites TEXT NOT NULL DEFAULT '[]',  -- JSON array of lesson IDs
  estimated_min INTEGER NOT NULL DEFAULT 30,
  theory_md     TEXT NOT NULL DEFAULT '',
  content_path  TEXT,  -- path to full content JSON file
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- LESSON PROGRESS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_progress (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'locked',
  -- locked | available | in_progress | complete
  started_at   TEXT,
  completed_at TEXT,
  time_spent_s INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  UNIQUE(user_id, lesson_id)
);

-- ─────────────────────────────────────────────
-- EXERCISES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercises (
  id               TEXT PRIMARY KEY,
  lesson_id        TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  exercise_type    TEXT NOT NULL,
  -- sql_query | python_code | formula | mcq | analysis | freeform
  title            TEXT NOT NULL,
  prompt           TEXT NOT NULL,
  context_md       TEXT NOT NULL DEFAULT '',
  dataset_id       TEXT,  -- which bundled dataset to load
  hint_1           TEXT,
  hint_2           TEXT,
  hint_3           TEXT,
  solution         TEXT NOT NULL DEFAULT '',
  evaluation_mode  TEXT NOT NULL DEFAULT 'exact',
  -- exact | result_match | ai_review | manual
  expected_output  TEXT,  -- JSON for result_match mode
  points           INTEGER NOT NULL DEFAULT 10,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────
-- EXERCISE ATTEMPTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id    TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  answer         TEXT NOT NULL,
  is_correct     INTEGER NOT NULL DEFAULT 0,  -- 0|1
  hints_used     INTEGER NOT NULL DEFAULT 0,
  score          REAL NOT NULL DEFAULT 0,
  ai_feedback    TEXT,
  time_spent_s   INTEGER NOT NULL DEFAULT 0,
  attempted_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- BUNDLED DATASETS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bundled_datasets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  domain      TEXT NOT NULL,
  -- hospital | sales | hr | ngo | inventory | operations | marketing
  file_path   TEXT NOT NULL,  -- path in resources/content/datasets/
  table_name  TEXT NOT NULL,  -- SQLite table name when loaded
  row_count   INTEGER,
  column_info TEXT NOT NULL DEFAULT '[]',  -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- USER IMPORTED DATASETS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imported_datasets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type    TEXT NOT NULL,  -- csv | xlsx | sqlite | json | parquet
  stored_path  TEXT NOT NULL,
  table_name   TEXT NOT NULL,
  row_count    INTEGER,
  column_count INTEGER,
  column_info  TEXT NOT NULL DEFAULT '[]',  -- JSON
  quality_score REAL,
  profile_json TEXT,  -- full data profile JSON
  imported_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- SQL SANDBOX SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sql_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dataset_id  TEXT,   -- bundled or imported
  context     TEXT NOT NULL DEFAULT 'playground',
  -- playground | exercise | simulation
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sql_query_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sql_sessions(id) ON DELETE SET NULL,
  query       TEXT NOT NULL,
  success     INTEGER NOT NULL DEFAULT 1,
  row_count   INTEGER,
  error_msg   TEXT,
  exec_ms     INTEGER,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- PYTHON SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS python_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context     TEXT NOT NULL DEFAULT 'playground',
  runtime     TEXT NOT NULL DEFAULT 'pyodide',  -- pyodide | local
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS python_code_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES python_sessions(id) ON DELETE SET NULL,
  code        TEXT NOT NULL,
  output      TEXT,
  error_msg   TEXT,
  success     INTEGER NOT NULL DEFAULT 1,
  exec_ms     INTEGER,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  project_type    TEXT NOT NULL,
  -- guided | simulation | consultant | portfolio
  domain          TEXT,
  status          TEXT NOT NULL DEFAULT 'in_progress',
  -- in_progress | complete | submitted
  problem_statement TEXT,
  methodology       TEXT,
  findings          TEXT,
  recommendations   TEXT,
  score             REAL,
  ai_evaluation     TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

-- ─────────────────────────────────────────────
-- PORTFOLIO ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_items (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  skills_used  TEXT NOT NULL DEFAULT '[]',  -- JSON array
  exports      TEXT NOT NULL DEFAULT '[]',  -- JSON array of {format, path, created_at}
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- SIMULATION SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulation_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  simulation_id   TEXT NOT NULL,  -- maps to content/simulations/
  role            TEXT NOT NULL,
  -- hospital_analyst | sales_analyst | hr_analyst | etc
  status          TEXT NOT NULL DEFAULT 'active',
  -- active | paused | complete
  current_step    INTEGER NOT NULL DEFAULT 0,
  state_json      TEXT NOT NULL DEFAULT '{}',
  score           REAL,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

-- ─────────────────────────────────────────────
-- ACHIEVEMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'award',
  condition   TEXT NOT NULL,  -- JSON condition descriptor
  points      INTEGER NOT NULL DEFAULT 50,
  rarity      TEXT NOT NULL DEFAULT 'common'
  -- common | rare | epic | legendary
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, achievement_id)
);

-- ─────────────────────────────────────────────
-- ANALYST RANK
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analyst_ranks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_rank TEXT NOT NULL DEFAULT 'analyst_trainee',
  -- analyst_trainee | junior_analyst | data_analyst | senior_analyst
  -- bi_analyst | lead_analyst | analytics_consultant | principal_consultant
  total_points INTEGER NOT NULL DEFAULT 0,
  rank_history TEXT NOT NULL DEFAULT '[]',  -- JSON array of {rank, promoted_at}
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- AI CONVERSATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context     TEXT NOT NULL DEFAULT 'general',
  -- general | lesson | exercise | playground | simulation
  context_id  TEXT,  -- lesson_id, exercise_id, etc.
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,  -- user | assistant | system
  content         TEXT NOT NULL,
  tokens_used     INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- API KEYS (encrypted)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  -- gemini | openai | openrouter
  key_encrypted TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  last_used    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, provider)
);

-- ─────────────────────────────────────────────
-- APP SETTINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user       ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token      ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_skill_ratings_user  ON skill_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_memory_user ON learning_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user       ON exercise_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exercise   ON exercise_attempts(exercise_id);
CREATE INDEX IF NOT EXISTS idx_query_history_user  ON sql_query_history(user_id);
CREATE INDEX IF NOT EXISTS idx_python_history_user ON python_code_history(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user       ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv    ON ai_messages(conversation_id);
`
