import { ipcMain, dialog } from 'electron'
import * as AuthService from '../services/auth.service'
import * as ProgressService from '../services/progress.service'
import * as SqlService from '../services/sql.service'
import * as AiService from '../services/ai.service'
import { registerPortfolioHandlers } from '../services/portfolio.service'
import { getDb } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

let _handlersRegistered = false

// ─────────────────────────────────────────────
// AUTH HANDLERS
// ─────────────────────────────────────────────

export function registerAuthHandlers() {
  ipcMain.handle('auth:register', async (_, params) => {
    return AuthService.register(params)
  })

  ipcMain.handle('auth:login', async (_, params) => {
    const result = await AuthService.login(params)
    if (result.success && result.user) {
      ProgressService.checkAndAwardAchievements(result.user.id)
    }
    return result
  })

  ipcMain.handle('auth:validate-session', async (_, token: string) => {
    const user = AuthService.validateSession(token)
    return { valid: !!user, user }
  })

  ipcMain.handle('auth:logout', async (_, token: string) => {
    AuthService.logout(token)
    return { success: true }
  })

  ipcMain.handle('auth:update-profile', async (_, { userId, updates }) => {
    return AuthService.updateUser(userId, updates)
  })

  ipcMain.handle('auth:change-password', async (_, { userId, currentPassword, newPassword }) => {
    return AuthService.changePassword(userId, currentPassword, newPassword)
  })

  ipcMain.handle('auth:set-security-question', async (_, { userId, question, answer }) => {
    AuthService.setSecurityQuestion(userId, question, answer)
    return { success: true }
  })

  ipcMain.handle('auth:get-security-question', async (_, email: string) => {
    return AuthService.getSecurityQuestion(email)
  })

  ipcMain.handle('auth:reset-password', async (_, params) => {
    return AuthService.resetPasswordWithAnswer(params)
  })
}

// ─────────────────────────────────────────────
// PROGRESS HANDLERS
// ─────────────────────────────────────────────

export function registerProgressHandlers() {
  ipcMain.handle('progress:dashboard', async (_, userId: string) => {
    return ProgressService.getDashboardStats(userId)
  })

  ipcMain.handle('progress:skills', async (_, userId: string) => {
    return ProgressService.getSkillRatings(userId)
  })

  ipcMain.handle('progress:rank', async (_, userId: string) => {
    return ProgressService.getRankInfo(userId)
  })

  ipcMain.handle('progress:memory', async (_, { userId, options }) => {
    return ProgressService.getMemory(userId, options)
  })

  ipcMain.handle('progress:achievements', async (_, userId: string) => {
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

  ipcMain.handle('lessons:list', async (_, { userId, module }) => {
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

  ipcMain.handle('lessons:get', async (_, { userId, lessonId }) => {
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

  ipcMain.handle('lessons:start', async (_, { userId, lessonId }) => {
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

  ipcMain.handle('lessons:complete', async (_, { userId, lessonId, timeSpentS }) => {
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

  ipcMain.handle('exercises:get', async (_, exerciseId: string) => {
    return db.prepare('SELECT * FROM exercises WHERE id = ?').get(exerciseId)
  })

  ipcMain.handle('exercises:submit', async (_, { userId, exerciseId, answer, timeSpentS, sandboxId }) => {
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

  ipcMain.handle('exercises:hint', async (_, { exerciseId, hintLevel }) => {
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

  ipcMain.handle('sql:execute', async (_, { sandboxId, query, userId }) => {
    return await SqlService.executeSQL({ sandboxId, query, userId })
  })

  ipcMain.handle('sql:load-dataset', async (_, { sandboxId, datasetId, type, userId }) => {
    if (type === 'bundled') {
      return await SqlService.loadBundledDataset(sandboxId, datasetId)
    } else {
      return await SqlService.loadImportedDataset(sandboxId, userId, datasetId)
    }
  })

  ipcMain.handle('sql:history', async (_, { userId, limit }) => {
    return db.prepare(`
      SELECT * FROM sql_query_history WHERE user_id = ?
      ORDER BY executed_at DESC LIMIT ?
    `).all(userId, limit ?? 50)
  })

  ipcMain.handle('sql:datasets', async (_, userId: string) => {
    const bundled = db.prepare('SELECT * FROM bundled_datasets ORDER BY domain, name').all()
    const imported = db.prepare(`
      SELECT * FROM imported_datasets WHERE user_id = ? ORDER BY imported_at DESC
    `).all(userId)
    return { bundled, imported }
  })

  ipcMain.handle('sql:close-sandbox', async (_, sandboxId: string) => {
    SqlService.closeSandbox(sandboxId)
    return { success: true }
  })
}

// ─────────────────────────────────────────────
// FILE IMPORT HANDLERS
// ─────────────────────────────────────────────

export function registerFileHandlers() {
  ipcMain.handle('files:pick', async () => {
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

  ipcMain.handle('files:import', async (_, { userId, filePath, fileName }) => {
    return await SqlService.importFile(userId, filePath, fileName)
  })

  ipcMain.handle('files:profile', async (_, { userId, datasetId }) => {
    const db = getDb()
    const dataset = db.prepare('SELECT profile_json FROM imported_datasets WHERE id = ? AND user_id = ?').get(datasetId, userId) as any
    return dataset?.profile_json ? JSON.parse(dataset.profile_json) : null
  })

  ipcMain.handle('files:delete', async (_, { userId, datasetId }) => {
    const db = getDb()
    db.prepare('DELETE FROM imported_datasets WHERE id = ? AND user_id = ?').run(datasetId, userId)
    return { success: true }
  })
}

// ─────────────────────────────────────────────
// AI HANDLERS
// ─────────────────────────────────────────────

export function registerAiHandlers() {
  ipcMain.handle('ai:chat', async (_, params) => {
    return AiService.chat(params)
  })

  ipcMain.handle('ai:exercise-feedback', async (_, params) => {
    return AiService.getExerciseFeedback(params)
  })

  ipcMain.handle('ai:save-key', async (_, { userId, provider, key }) => {
    AiService.saveApiKey(userId, provider, key)
    return { success: true }
  })

  ipcMain.handle('ai:has-key', async (_, { userId, provider }) => {
    const key = AiService.getApiKey(userId, provider)
    return { has_key: !!key }
  })

  ipcMain.handle('ai:get-provider', async (_, userId: string) => {
    return { provider: AiService.getActiveProvider(userId) }
  })

  ipcMain.handle('ai:set-provider', async (_, { provider }) => {
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

  ipcMain.handle('settings:get', async (_, key: string) => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any
    return { value: row?.value ?? null }
  })

  ipcMain.handle('settings:set', async (_, { key, value }) => {
    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value)
    return { success: true }
  })

  ipcMain.handle('settings:get-all', async () => {
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as any[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  })
}

// ─────────────────────────────────────────────
// REGISTER ALL
// ─────────────────────────────────────────────

export function registerAllHandlers() {
  if (_handlersRegistered) return
  _handlersRegistered = true

  registerAuthHandlers()
  registerProgressHandlers()
  registerLessonHandlers()
  registerExerciseHandlers()
  registerSqlHandlers()
  registerFileHandlers()
  registerAiHandlers()
  registerSettingsHandlers()
  registerPortfolioHandlers()

  console.log('[IPC] All handlers registered')
}
