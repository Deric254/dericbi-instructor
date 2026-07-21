import { ipcMain, dialog, app } from 'electron'
import * as AuthService from '../services/auth.service'
import * as ProgressService from '../services/progress.service'
import * as SqlService from '../services/sql.service'
import * as AiService from '../services/ai.service'
import * as LicenseService from '../services/license.service'
import { registerPortfolioHandlers } from '../services/portfolio.service'
import { getDb } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

let _handlersRegistered = false

/**
 * Wraps ipcMain.handle so every failure is logged with its channel name
 * before propagating to the renderer. Without this, a thrown error in a
 * packaged app (no devtools console open by default) leaves no trace
 * anywhere — the renderer just sees a rejected promise with a generic
 * "Error invoking remote method" message and there's nothing to debug from.
 * The renderer's own error message is unaffected: this only adds logging,
 * it still rethrows the original error so existing behavior is preserved.
 */
function safeHandle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await listener(event, ...args)
    } catch (err) {
      console.error(`[ipc:${channel}]`, err)
      throw err
    }
  })
}

// ─────────────────────────────────────────────
// AUTH HANDLERS
// ─────────────────────────────────────────────

export function registerAuthHandlers() {
  safeHandle('auth:register', async (_, params) => {
    return AuthService.register(params)
  })

  safeHandle('auth:login', async (_, params) => {
    const result = await AuthService.login(params)
    if (result.success && result.user) {
      ProgressService.checkAndAwardAchievements(result.user.id)
    }
    return result
  })

  safeHandle('auth:validate-session', async (_, token: string) => {
    const user = AuthService.validateSession(token)
    return { valid: !!user, user }
  })

  safeHandle('auth:logout', async (_, token: string) => {
    AuthService.logout(token)
    return { success: true }
  })

  safeHandle('auth:update-profile', async (_, { userId, updates }) => {
    return AuthService.updateUser(userId, updates)
  })

  safeHandle('auth:change-password', async (_, { userId, currentPassword, newPassword }) => {
    return AuthService.changePassword(userId, currentPassword, newPassword)
  })

  safeHandle('auth:set-security-question', async (_, { userId, question, answer }) => {
    AuthService.setSecurityQuestion(userId, question, answer)
    return { success: true }
  })

  safeHandle('auth:get-security-question', async (_, email: string) => {
    return AuthService.getSecurityQuestion(email)
  })

  safeHandle('auth:reset-password', async (_, params) => {
    return AuthService.resetPasswordWithAnswer(params)
  })
}

// ─────────────────────────────────────────────
// LICENSE HANDLERS
// ─────────────────────────────────────────────

export function registerLicenseHandlers() {
  safeHandle('license:status', async () => {
    return LicenseService.getStatus()
  })

  safeHandle('license:activate', async (_, licenseKey: string) => {
    return LicenseService.activate(licenseKey)
  })

  safeHandle('license:deactivate', async () => {
    return LicenseService.deactivate()
  })
}

// ─────────────────────────────────────────────
// PROGRESS HANDLERS
// ─────────────────────────────────────────────

export function registerProgressHandlers() {
  safeHandle('progress:dashboard', async (_, userId: string) => {
    return ProgressService.getDashboardStats(userId)
  })

  safeHandle('progress:skills', async (_, userId: string) => {
    return ProgressService.getSkillRatings(userId)
  })

  safeHandle('progress:rank', async (_, userId: string) => {
    return ProgressService.getRankInfo(userId)
  })

  safeHandle('progress:memory', async (_, { userId, options }) => {
    return ProgressService.getMemory(userId, options)
  })

  safeHandle('progress:achievements', async (_, userId: string) => {
    const db = getDb()
    const earned = db.prepare(`
      SELECT a.*, ua.earned_at
      FROM achievements a
      JOIN user_achievements ua ON a.id = ua.achievement_id
      WHERE ua.user_id = ?
      ORDER BY ua.earned_at DESC
    `).all(userId)

    const all = db.prepare('SELECT * FROM achievements ORDER BY points ASC').all()
    const earnedIds = new Set((earned as any[]).map(a => a.id))
    const locked = (all as any[]).filter(a => !earnedIds.has(a.id))

    return { earned, locked }
  })
}

// ─────────────────────────────────────────────
// LESSON HANDLERS
// ─────────────────────────────────────────────

export function registerLessonHandlers() {
  const db = getDb()

  safeHandle('lessons:list', async (_, { userId, module }) => {
    let query = `
      SELECT l.*,
        COALESCE(lp.status, 'locked') as user_status,
        lp.completed_at,
        lp.time_spent_s
      FROM lessons l
      LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
    `
    const params: any[] = [userId]

    if (module) {
      query += ' WHERE l.module = ?'
      params.push(module)
    }

    query += ' ORDER BY l.module, l.sort_order'
    return db.prepare(query).all(...params)
  })

  safeHandle('lessons:get', async (_, { userId, lessonId }) => {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId)
    if (!lesson) return null

    const progress = db.prepare(`
      SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?
    `).get(userId, lessonId)

    const exercises = db.prepare(`
      SELECT id, title, prompt, exercise_type, points, sort_order, hint_1
      FROM exercises WHERE lesson_id = ? ORDER BY sort_order
    `).all(lessonId)

    return { lesson, progress, exercises }
  })

  safeHandle('lessons:start', async (_, { userId, lessonId }) => {
    const existing = db.prepare(`
      SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?
    `).get(userId, lessonId) as any

    if (!existing) {
      db.prepare(`
        INSERT INTO lesson_progress (id, user_id, lesson_id, status, started_at)
        VALUES (?, ?, ?, 'in_progress', datetime('now'))
      `).run(uuidv4(), userId, lessonId)
    } else if (existing.status === 'available' || existing.status === 'locked') {
      db.prepare(`
        UPDATE lesson_progress SET status = 'in_progress', started_at = datetime('now')
        WHERE user_id = ? AND lesson_id = ?
      `).run(userId, lessonId)
    }

    return { success: true }
  })

  safeHandle('lessons:complete', async (_, { userId, lessonId, timeSpentS }) => {
    db.prepare(`
      UPDATE lesson_progress
      SET status = 'complete', completed_at = datetime('now'), time_spent_s = ?
      WHERE user_id = ? AND lesson_id = ?
    `).run(timeSpentS ?? 0, userId, lessonId)

    // Award points
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId) as any
    if (lesson) {
      const points = lesson.level === 'beginner' ? 25
        : lesson.level === 'intermediate' ? 50
        : lesson.level === 'advanced' ? 100
        : 200
      ProgressService.addPoints(userId, points)
      ProgressService.updateSkillScore(userId, lesson.module, 2)
    }

    // Unlock next lessons
    unlockNextLessons(userId, lessonId)

    const newAchievements = ProgressService.checkAndAwardAchievements(userId)
    return { success: true, new_achievements: newAchievements }
  })
}

function unlockNextLessons(userId: string, completedLessonId: string) {
  const db = getDb()
  const allLessons = db.prepare('SELECT * FROM lessons').all() as any[]

  for (const lesson of allLessons) {
    const prereqs: string[] = JSON.parse(lesson.prerequisites || '[]')
    if (!prereqs.includes(completedLessonId)) continue

    // Check if all prereqs are complete
    const allComplete = prereqs.every(prereqId => {
      const progress = db.prepare(`
        SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?
      `).get(userId, prereqId) as any
      return progress?.status === 'complete'
    })

    if (allComplete) {
      db.prepare(`
        INSERT OR IGNORE INTO lesson_progress (id, user_id, lesson_id, status)
        VALUES (?, ?, ?, 'available')
      `).run(uuidv4(), userId, lesson.id)
    }
  }
}

// ─────────────────────────────────────────────
// EXERCISE HANDLERS
// ─────────────────────────────────────────────

export function registerExerciseHandlers() {
  const db = getDb()

  safeHandle('exercises:get', async (_, exerciseId: string) => {
    return db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId)
  })

  safeHandle('exercises:submit', async (_, { userId, exerciseId, answer, timeSpentS, sandboxId }) => {
    const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId) as any
    if (!exercise) return { success: false, error: 'Exercise not found' }

    const attemptCount = (db.prepare(`
      SELECT COUNT(*) as c FROM exercise_attempts WHERE user_id = ? AND exercise_id = ?
    `).get(userId, exerciseId) as any).c

    let validationResult: any

    if (exercise.exercise_type === 'sql_query') {
      validationResult = await SqlService.validateSQLAnswer({
        sandboxId: sandboxId ?? `ex_${exerciseId}_${userId}`,
        userQuery: answer,
        solutionQuery: exercise.solution,
        evaluationMode: exercise.evaluation_mode,
        expectedOutput: exercise.expected_output ? JSON.parse(exercise.expected_output) : undefined,
      })
    } else {
      // For other types (MCQ, freeform) — basic exact match for now
      validationResult = {
        correct: answer.trim().toLowerCase() === exercise.solution.trim().toLowerCase(),
        score: answer.trim().toLowerCase() === exercise.solution.trim().toLowerCase() ? 100 : 0,
        feedback: '',
      }
    }

    const attemptId = uuidv4()
    db.prepare(`
      INSERT INTO exercise_attempts
      (id, user_id, exercise_id, attempt_number, answer, is_correct, score, time_spent_s)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId, userId, exerciseId, attemptCount + 1,
      answer, validationResult.correct ? 1 : 0,
      validationResult.score, timeSpentS ?? 0
    )

    if (validationResult.correct) {
      const lesson = db.prepare(`
        SELECT l.module FROM lessons l JOIN exercises e ON e.lesson_id = l.id WHERE e.id = ?
      `).get(exerciseId) as any
      if (lesson) {
        ProgressService.updateSkillScore(userId, lesson.module, 1)
        ProgressService.addPoints(userId, exercise.points)
      }
    } else {
      // Record mistake in learning memory
      const lesson = db.prepare(`
        SELECT l.module, l.title FROM lessons l JOIN exercises e ON e.lesson_id = l.id WHERE e.id = ?
      `).get(exerciseId) as any
      if (lesson) {
        ProgressService.addMemory(userId, {
          memory_type: 'mistake',
          skill: lesson.module,
          topic: lesson.title,
          detail: `Failed exercise: ${exercise.title}`,
          weight: 1.2,
        })
      }
    }

    const newAchievements = ProgressService.checkAndAwardAchievements(userId)
    return { success: true, validation: validationResult, new_achievements: newAchievements }
  })

  safeHandle('exercises:hint', async (_, { exerciseId, hintLevel }) => {
    const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId) as any
    if (!exercise) return { hint: null }

    const hint = hintLevel === 1 ? exercise.hint_1
      : hintLevel === 2 ? exercise.hint_2
      : exercise.hint_3

    return { hint }
  })
}

// ─────────────────────────────────────────────
// SQL PLAYGROUND HANDLERS
// ─────────────────────────────────────────────

export function registerSqlHandlers() {
  const db = getDb()

  safeHandle('sql:execute', async (_, { sandboxId, query, userId }) => {
    return await SqlService.executeSQL({ sandboxId, query, userId })
  })

  safeHandle('sql:load-dataset', async (_, { sandboxId, datasetId, type, userId }) => {
    if (type === 'bundled') {
      return await SqlService.loadBundledDataset(sandboxId, datasetId)
    } else {
      return await SqlService.loadImportedDataset(sandboxId, userId, datasetId)
    }
  })

  safeHandle('sql:history', async (_, { userId, limit }) => {
    return db.prepare(`
      SELECT * FROM sql_query_history WHERE user_id = ?
      ORDER BY executed_at DESC LIMIT ?
    `).all(userId, limit ?? 50)
  })

  safeHandle('sql:datasets', async (_, userId: string) => {
    const bundled = db.prepare('SELECT * FROM bundled_datasets ORDER BY domain, name').all()
    const imported = db.prepare(`
      SELECT * FROM imported_datasets WHERE user_id = ? ORDER BY imported_at DESC
    `).all(userId)
    return { bundled, imported }
  })

  safeHandle('sql:close-sandbox', async (_, sandboxId: string) => {
    SqlService.closeSandbox(sandboxId)
    return { success: true }
  })
}

// ─────────────────────────────────────────────
// FILE IMPORT HANDLERS
// ─────────────────────────────────────────────

export function registerFileHandlers() {
  safeHandle('files:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Dataset',
      filters: [
        { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'json', 'db', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  })

  safeHandle('files:import', async (_, { userId, filePath, fileName }) => {
    return await SqlService.importFile(userId, filePath, fileName)
  })

  safeHandle('files:profile', async (_, { userId, datasetId }) => {
    const db = getDb()
    const dataset = db.prepare('SELECT profile_json FROM imported_datasets WHERE id = ? AND user_id = ?').get(datasetId, userId) as any
    return dataset?.profile_json ? JSON.parse(dataset.profile_json) : null
  })

  safeHandle('files:delete', async (_, { userId, datasetId }) => {
    const db = getDb()
    db.prepare('DELETE FROM imported_datasets WHERE id = ? AND user_id = ?').run(datasetId, userId)
    return { success: true }
  })
}

// ─────────────────────────────────────────────
// AI HANDLERS
// ─────────────────────────────────────────────

export function registerAiHandlers() {
  safeHandle('ai:chat', async (_, params) => {
    return AiService.chat(params)
  })

  safeHandle('ai:exercise-feedback', async (_, params) => {
    return AiService.getExerciseFeedback(params)
  })

  safeHandle('ai:save-key', async (_, { userId, provider, key }) => {
    AiService.saveApiKey(userId, provider, key)
    return { success: true }
  })

  safeHandle('ai:has-key', async (_, { userId, provider }) => {
    const key = AiService.getApiKey(userId, provider)
    return { has_key: !!key }
  })

  safeHandle('ai:get-provider', async (_, userId: string) => {
    return { provider: AiService.getActiveProvider(userId) }
  })

  safeHandle('ai:set-provider', async (_, { provider }) => {
    const db = getDb()
    db.prepare("UPDATE app_settings SET value = ? WHERE key = 'ai_provider'").run(provider)
    return { success: true }
  })
}

// ─────────────────────────────────────────────
// SETTINGS HANDLERS
// ─────────────────────────────────────────────

export function registerSettingsHandlers() {
  const db = getDb()

  safeHandle('settings:get', async (_, key: string) => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any
    return { value: row?.value ?? null }
  })

  safeHandle('settings:set', async (_, { key, value }) => {
    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value)
    return { success: true }
  })

  safeHandle('settings:get-all', async () => {
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as any[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })

  safeHandle('app:get-version', async () => {
    return { version: app.getVersion() }
  })
}

// ─────────────────────────────────────────────
// ADMIN HANDLERS
// ─────────────────────────────────────────────

export function registerAdminHandlers() {
  const db = getDb()

  // Every admin handler double-checks the caller is actually an admin,
  // server-side — never trust a client-side gate alone for anything
  // destructive like deleting a user or resetting progress.
  const requireAdmin = (userId: string) => {
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as any
    if (!row || row.is_admin !== 1) throw new Error('Admin access required')
  }

  safeHandle('admin:check', async (_, userId: string) => {
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as any
    return { is_admin: !!row && row.is_admin === 1 }
  })

  safeHandle('admin:users-list', async (_, { requesterId }) => {
    requireAdmin(requesterId)
    const users = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.experience_level, u.is_admin, u.created_at,
        (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.user_id = u.id AND lp.status = 'complete') as lessons_completed,
        (SELECT COUNT(*) FROM exercise_attempts ea WHERE ea.user_id = u.id) as exercises_attempted,
        (SELECT COUNT(*) FROM exercise_attempts ea WHERE ea.user_id = u.id AND ea.is_correct = 1) as exercises_correct,
        (SELECT MAX(s.last_seen) FROM sessions s WHERE s.user_id = u.id) as last_login
      FROM users u
      ORDER BY u.created_at ASC
    `).all()
    return { users }
  })

  safeHandle('admin:user-detail', async (_, { requesterId, targetUserId }) => {
    requireAdmin(requesterId)
    const user = db.prepare('SELECT id, name, email, experience_level, is_admin, created_at FROM users WHERE id = ?').get(targetUserId)
    if (!user) return { error: 'User not found' }

    const skills = db.prepare('SELECT skill, score FROM skill_ratings WHERE user_id = ?').all(targetUserId)
    const lessonsCompleted = db.prepare(`SELECT module, COUNT(*) as count FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id WHERE lp.user_id = ? AND lp.status = 'complete' GROUP BY module`).all(targetUserId)
    const recentAttempts = db.prepare(`SELECT exercise_id, is_correct, attempted_at FROM exercise_attempts WHERE user_id = ? ORDER BY attempted_at DESC LIMIT 20`).all(targetUserId)

    return { user, skills, lessonsCompleted, recentAttempts }
  })

  safeHandle('admin:reset-user-progress', async (_, { requesterId, targetUserId }) => {
    requireAdmin(requesterId)
    // Wipe learning progress only — never touches the account itself
    // (name, email, password) or their portfolio/projects.
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM lesson_progress WHERE user_id = ?').run(targetUserId)
      db.prepare('DELETE FROM exercise_attempts WHERE user_id = ?').run(targetUserId)
      db.prepare('DELETE FROM skill_ratings WHERE user_id = ?').run(targetUserId)
      db.prepare('DELETE FROM user_achievements WHERE user_id = ?').run(targetUserId)
    })
    tx()
    return { success: true }
  })

  safeHandle('admin:set-admin', async (_, { requesterId, targetUserId, isAdmin }) => {
    requireAdmin(requesterId)
    // Never allow removing the last remaining admin — that would lock
    // everyone out of this panel with no way back in short of editing
    // the database file directly.
    if (!isAdmin) {
      const row = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get() as any
      if (row.c <= 1) {
        return { success: false, error: 'Cannot remove the last remaining admin.' }
      }
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, targetUserId)
    return { success: true }
  })

  safeHandle('admin:delete-user', async (_, { requesterId, targetUserId }) => {
    requireAdmin(requesterId)
    if (requesterId === targetUserId) {
      return { success: false, error: 'You cannot delete your own account from here.' }
    }
    // ON DELETE CASCADE (verified) cleans up every related table —
    // progress, attempts, sessions, portfolio, projects, everything.
    db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId)
    return { success: true }
  })

  safeHandle('admin:content-stats', async (_, { requesterId }) => {
    requireAdmin(requesterId)
    const lessons = db.prepare('SELECT module, COUNT(*) as count FROM lessons GROUP BY module').all()
    const exercises = db.prepare(`
      SELECT l.module, COUNT(*) as count
      FROM exercises e JOIN lessons l ON e.lesson_id = l.id
      GROUP BY l.module
    `).all()
    const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c
    const totalAttempts = (db.prepare('SELECT COUNT(*) as c FROM exercise_attempts').get() as any).c
    const datasets = db.prepare('SELECT id, name, row_count FROM bundled_datasets').all()
    return { lessons, exercises, totalUsers, totalAttempts, datasets }
  })

  safeHandle('admin:system-info', async (_, { requesterId }) => {
    requireAdmin(requesterId)
    const schemaVersion = (db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as any)?.v ?? 0
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      schemaVersion,
      userDataPath: app.getPath('userData'),
    }
  })
}

// ─────────────────────────────────────────────
// REGISTER ALL
// ─────────────────────────────────────────────

export function registerAllHandlers() {
  if (_handlersRegistered) return
  _handlersRegistered = true

  registerAuthHandlers()
  registerLicenseHandlers()
  registerProgressHandlers()
  registerLessonHandlers()
  registerExerciseHandlers()
  registerSqlHandlers()
  registerFileHandlers()
  registerAiHandlers()
  registerSettingsHandlers()
  registerPortfolioHandlers()
  registerAdminHandlers()

  console.log('[IPC] All handlers registered')
}
