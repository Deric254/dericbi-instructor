import fs from 'fs'
import { getDb } from '../db/database'
import { getContentPath } from './setup.service'
import { loadConcepts, type Concept } from './concepts'

/**
 * The mastery ladder: how deeply a learner holds each idea, worked out from the work they have actually done, never from a counter
 * that can drift. The levels and their meaning live in content/path/ladder.json. A level is only reached when every level below it is.
 * Levels marked unavailable are shown honestly as "not yet" and are never awarded.
 */
export interface LadderLevel { level: number; name: string; meaning: string; available: boolean }

export function loadLadder(file = getContentPath('path/ladder.json')): LadderLevel[] | null {
  try {
    const l = (JSON.parse(fs.readFileSync(file, 'utf8')) as { levels: LadderLevel[] }).levels
    const ok = Array.isArray(l) && l.length > 0 && l.every((x, i) => x && x.level === i + 1 && typeof x.name === 'string' && typeof x.meaning === 'string')
    return ok ? l : null
  } catch { return null }
}

/** Level 1: the learner's explanation held up. A concept with no explain-back counts once a lesson that teaches it is complete. */
export function understood(userId: string, c: Concept): boolean {
  const db = getDb()
  if (c.explain) return !!db.prepare('SELECT 1 FROM explain_results WHERE user_id = ? AND concept_id = ? AND passed = 1').get(userId, c.id)
  return c.lessons.some((l) => !!db.prepare("SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND status = 'complete'").get(userId, l))
}

function practicalsPassed(userId: string, lessonId: string): boolean {
  const r = getDb().prepare(`
    SELECT COUNT(*) AS total,
           SUM(EXISTS (SELECT 1 FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = ? AND a.is_correct = 1)) AS passed
    FROM exercises e WHERE e.lesson_id = ?`).get(userId, lessonId) as { total: number; passed: number | null }
  return r.total > 0 && (r.passed ?? 0) === r.total
}

/** Every concept with the level reached. `phaseOfLesson` maps a lesson to the phase that holds it, so a saved gate can raise level 4. */
export function conceptLevels(userId: string, phaseOfLesson: Map<string, string> = new Map(), concepts: Concept[] = loadConcepts(), ladder: LadderLevel[] | null = loadLadder()) {
  const db = getDb()
  const top = ladder ? ladder.filter((l) => l.available).length : 4
  const gates = new Set((db.prepare('SELECT phase_id FROM path_gates WHERE user_id = ?').all(userId) as Array<{ phase_id: string }>).map((g) => g.phase_id))
  return concepts.map((c) => {
    const steps = [
      () => understood(userId, c),
      () => c.lessons.some((l) => practicalsPassed(userId, l)),
      () => c.lessons.some((l) => !!db.prepare('SELECT 1 FROM field_tasks WHERE user_id = ? AND lesson_id = ?').get(userId, l)),
      () => c.lessons.some((l) => gates.has(phaseOfLesson.get(l) ?? '')),
    ]
    let level = 0
    while (level < Math.min(steps.length, top) && steps[level]()) level++
    return { id: c.id, name: c.name, level }
  })
}
