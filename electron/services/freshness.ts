import fs from 'fs'
import { getContentPath } from './setup.service'
import { getDb } from '../db/database'

/**
 * Figures the lessons quote that change with the law or the market (content/path/freshness.json). Each one names its source, the date of
 * that source and the official body to check it with. The report says which are due for a re-check, so nothing dated is trusted for ever.
 */
export interface FreshFact { id: string; lesson: string; text: string; source: string; as_of: string; official: string; official_url: string; confirmed: boolean; confirmed_on: string | null }
export interface FreshItem extends FreshFact { lesson_title: string; age_days: number; due: boolean }
export interface FreshnessReport { review_every_days: number; items: FreshItem[]; due: number }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (s: string) => Date.parse(s + 'T00:00:00Z')
const okDate = (s: unknown): s is string => typeof s === 'string' && ISO.test(s) && !Number.isNaN(day(s))
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export function validFact(f: any): f is FreshFact {
  return !!f && str(f.id) && str(f.lesson) && str(f.text) && str(f.source) && okDate(f.as_of) && str(f.official) && /^https:\/\//.test(String(f.official_url))
    && typeof f.confirmed === 'boolean' && (f.confirmed ? okDate(f.confirmed_on) : f.confirmed_on === null || f.confirmed_on === undefined)
}

/** Loads the file; facts that are not well formed are left out, and a missing or broken file means no facts, never a crash. */
export function loadFreshness(file = getContentPath('path/freshness.json')): { review_every_days: number; facts: FreshFact[] } {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { review_every_days?: unknown; facts?: unknown }
    const every = typeof j.review_every_days === 'number' && j.review_every_days >= 1 && j.review_every_days <= 3650 ? Math.floor(j.review_every_days) : 120
    const seen = new Set<string>()
    const facts = (Array.isArray(j.facts) ? j.facts : []).filter((f) => validFact(f) && !seen.has(f.id) && !!seen.add(f.id)) as FreshFact[]
    return { review_every_days: every, facts }
  } catch { return { review_every_days: 120, facts: [] } }
}

/** Age is counted from the later of the source date and the date someone confirmed the figure. */
export function freshnessReport(now = new Date(), file?: string): FreshnessReport {
  const { review_every_days, facts } = loadFreshness(file)
  const titles = new Map((getDb().prepare('SELECT id, title FROM lessons').all() as Array<{ id: string; title: string }>).map((r) => [r.id, r.title]))
  const items = facts.map((f) => {
    const from = Math.max(day(f.as_of), f.confirmed && f.confirmed_on ? day(f.confirmed_on) : 0)
    const age_days = Math.max(0, Math.floor((now.getTime() - from) / 86_400_000))
    return { ...f, lesson_title: titles.get(f.lesson) ?? f.lesson, age_days, due: age_days >= review_every_days }
  }).sort((a, b) => Number(b.due) - Number(a.due) || b.age_days - a.age_days)
  return { review_every_days, items, due: items.filter((i) => i.due).length }
}
