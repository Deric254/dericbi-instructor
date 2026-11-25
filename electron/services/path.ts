import fs from 'fs'
import { getDb } from '../db/database'
import { getContentPath } from './setup.service'

/**
 * The master track: one learning order across every academy, in phases that each end with a gate. Everything about it lives in
 * content/path/master-track.json (phases, lesson order, which academy counts as technical or business, the pass line), so changing
 * the programme later means editing that file, not the app. Lessons the file names that no longer exist are simply left out, and
 * lessons it does not name are never blocked.
 */
export type Side = 'tech' | 'business' | 'bridge'
export interface TrackItem { lesson?: string; planned?: string; side?: Side; summary?: string; optional?: boolean }
export interface TrackPhase { id: string; title: string; weeks: string; focus: string; project: string | null; gate: string; items: TrackItem[] }
export interface Track { version: string; title: string; pass_pct: number; gate_min_words: number; sides: Record<string, Side>; phases: TrackPhase[]; later: TrackItem[] }

const MAX_EVIDENCE = 2000
const SIDES: Side[] = ['tech', 'business', 'bridge']

/** Read and check the track file. A missing or broken file means "no path", never a crash. */
export function loadTrack(file = getContentPath('path/master-track.json')): Track | null {
  try {
    const t = JSON.parse(fs.readFileSync(file, 'utf8')) as Track
    const ok = Array.isArray(t.phases) && t.phases.length > 0 && Number.isFinite(t.pass_pct) && t.sides && typeof t.sides === 'object'
      && t.phases.every((p) => p && typeof p.id === 'string' && Array.isArray(p.items))
      && new Set(t.phases.map((p) => p.id)).size === t.phases.length
    return ok ? { ...t, later: Array.isArray(t.later) ? t.later : [], gate_min_words: Number.isFinite(t.gate_min_words) ? t.gate_min_words : 15 } : null
  } catch { return null }
}

const sideOfModule = (t: Track, module: string): Side => (SIDES.includes(t.sides[module]) ? t.sides[module] : 'tech')

interface LessonRow { id: string; title: string; module: string; status: string | null; best: number | null; has_quiz: number }
function lessonRows(userId: string, ids: string[]): Map<string, LessonRow> {
  const out = new Map<string, LessonRow>()
  const q = getDb().prepare(`
    SELECT l.id, l.title, l.module, COALESCE(lp.status, 'locked') AS status,
           (SELECT MAX(pct) FROM quiz_results r WHERE r.user_id = ? AND r.lesson_id = l.id) AS best,
           (json_valid(l.quiz) AND json_array_length(l.quiz) > 0) AS has_quiz
    FROM lessons l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
    WHERE l.id = ?`)
  for (const id of ids) { const r = q.get(userId, userId, id) as LessonRow | undefined; if (r) out.set(id, r) }
  return out
}

export interface SideScore { required: number; done: number; quiz_avg: number | null; score: number | null; ready: boolean }

/** How much of one side of a phase is done, scaled by how well the quizzes went. null score = the phase has no lessons for that side yet. */
function scoreSide(rows: Array<{ done: boolean; best: number | null }>, pass: number): SideScore {
  const required = rows.length
  if (required === 0) return { required: 0, done: 0, quiz_avg: null, score: null, ready: true }
  const done = rows.filter((r) => r.done).length
  const scored = rows.filter((r) => r.done && r.best !== null) as Array<{ best: number }>
  const quiz_avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.best, 0) / scored.length) : null
  const score = Math.round((done / required) * (quiz_avg ?? 100))
  return { required, done, quiz_avg, score, ready: done === required && (quiz_avg === null || quiz_avg >= pass) }
}

export const isStrict = (userId: string): boolean =>
  (getDb().prepare('SELECT strict FROM path_state WHERE user_id = ?').get(userId) as { strict: number } | undefined)?.strict === 1

export function setStrict(userId: string, on: boolean): void {
  getDb().prepare(`
    INSERT INTO path_state (user_id, strict) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET strict = excluded.strict, updated_at = datetime('now')
  `).run(userId, on ? 1 : 0)
}

/** The whole path for one learner: every phase with its lessons, the two side scores, the gate, which phase is open and what to do next. */
export function getPath(userId: string, track: Track | null = loadTrack()) {
  if (!track) return null
  const db = getDb()
  const gates = new Map((db.prepare('SELECT phase_id, evidence, updated_at FROM path_gates WHERE user_id = ?').all(userId) as Array<{ phase_id: string; evidence: string; updated_at: string }>).map((g) => [g.phase_id, g]))
  const allIds = track.phases.flatMap((p) => p.items.map((i) => i.lesson).filter((x): x is string => !!x))
  const rows = lessonRows(userId, allIds)

  let openSeen = false
  const phases = track.phases.map((p, idx) => {
    const items = p.items.map((it) => {
      if (it.lesson && rows.has(it.lesson)) {
        const r = rows.get(it.lesson)!
        const side = sideOfModule(track, r.module)
        return { kind: 'lesson' as const, id: it.lesson, title: r.title, module: r.module, side, optional: !!it.optional, status: r.status, done: r.status === 'complete', best: r.best }
      }
      // Not a lesson the app has: either still to be written (planned) or removed since. It never blocks anything.
      const side: Side = SIDES.includes(it.side as Side) ? (it.side as Side) : 'tech'
      return { kind: 'planned' as const, id: it.planned ?? it.lesson ?? '', title: it.planned ?? it.lesson ?? '', summary: it.summary ?? '', side, optional: !!it.optional }
    })
    const built = items.filter((i) => i.kind === 'lesson' && !i.optional) as Array<Extract<typeof items[number], { kind: 'lesson' }>>
    const forSide = (s: 'tech' | 'business') => built.filter((i) => i.side === s || i.side === 'bridge').map((i) => ({ done: i.done, best: i.best }))
    const tech = scoreSide(forSide('tech'), track.pass_pct)
    const business = scoreSide(forSide('business'), track.pass_pct)
    const gate = gates.get(p.id)
    const complete = tech.ready && business.ready && !!gate && built.length > 0
    // A phase is open when every phase before it is complete.
    const open = !openSeen
    if (!complete) openSeen = true
    return { id: p.id, index: idx, title: p.title, weeks: p.weeks, focus: p.focus, project: p.project, gate: p.gate, gate_evidence: gate?.evidence ?? '', gate_saved_at: gate?.updated_at ?? null, items, tech, business, complete, open }
  })

  const current = phases.find((p) => !p.complete) ?? null
  let next: { lesson_id: string; title: string; module: string; side: Side; reason: string } | null = null
  let weaker: 'tech' | 'business' | null = null
  if (current) {
    const a = current.tech.score, b = current.business.score
    if (a !== null && b !== null && a !== b) weaker = a < b ? 'tech' : 'business'
    const ready = current.items.filter((i) => i.kind === 'lesson' && !i.optional && !i.done && (i.status === 'available' || i.status === 'in_progress')) as Array<Extract<typeof current.items[number], { kind: 'lesson' }>>
    const pick = (weaker ? ready.find((i) => i.side === weaker || i.side === 'bridge') : undefined) ?? ready.find((i) => i.status === 'in_progress') ?? ready[0]
    if (pick) next = { lesson_id: pick.id, title: pick.title, module: pick.module, side: pick.side, reason: weaker && (pick.side === weaker || pick.side === 'bridge') ? `Your ${weaker === 'tech' ? 'Technology' : 'Business'} side is behind, so this comes first.` : 'The next lesson in your phase.' }
  }
  return { title: track.title, pass_pct: track.pass_pct, gate_min_words: track.gate_min_words, strict: isStrict(userId), phases, current_phase: current?.id ?? null, weaker, next, later: track.later.map((i) => i.lesson ?? '').filter(Boolean) }
}

export type GateOutcome = { success: true } | { success: false; reason: 'unavailable' | 'locked' | 'invalid' | 'short' }

/** Record the evidence for a phase gate (what the learner built and how they defended it), in their own words. */
export function saveGate(userId: string, phaseId: unknown, evidence: unknown, track: Track | null = loadTrack()): GateOutcome {
  const path = track ? getPath(userId, track) : null
  const phase = path?.phases.find((p) => p.id === phaseId)
  if (!path || !track || !phase) return { success: false, reason: 'unavailable' }
  if (!phase.open) return { success: false, reason: 'locked' }
  if (typeof evidence !== 'string' || evidence.length > MAX_EVIDENCE) return { success: false, reason: 'invalid' }
  if (evidence.trim().split(/\s+/).filter(Boolean).length < track.gate_min_words) return { success: false, reason: 'short' }
  getDb().prepare(`
    INSERT INTO path_gates (user_id, phase_id, evidence) VALUES (?, ?, ?)
    ON CONFLICT(user_id, phase_id) DO UPDATE SET evidence = excluded.evidence, updated_at = datetime('now')
  `).run(userId, phase.id, evidence.trim())
  return { success: true }
}

/** Lessons a strict learner may not start yet: those in a phase after the open one, unless already started. Empty when the path is off. */
export function pathLocked(userId: string, track: Track | null = loadTrack()): Set<string> {
  const locked = new Set<string>()
  if (!track || !isStrict(userId)) return locked
  const path = getPath(userId, track)
  if (!path || !path.current_phase) return locked
  const from = path.phases.findIndex((p) => p.id === path.current_phase)
  for (const p of path.phases.slice(from + 1)) for (const i of p.items) if (i.kind === 'lesson' && i.status !== 'complete' && i.status !== 'in_progress') locked.add(i.id)
  return locked
}
