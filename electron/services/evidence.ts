import fs from 'fs'
import { getContentPath } from './setup.service'

/**
 * The evidence library: real cases, history and quotes that lessons show beside an idea. Each entry names its source and the date it was
 * checked, and lives in content/evidence/library.json so a fact is corrected in one place. Lessons only point at an entry by id and
 * cannot carry their own facts. Entries that are not well formed are left out, and a missing or broken file means no evidence, never a crash.
 */
export type EvidenceKind = 'case' | 'history' | 'quote'
export interface EvidenceEntry {
  id: string; kind: EvidenceKind; title: string; text: string; takeaway: string; concepts: string[]
  who?: string; work?: string
  source: { publisher: string; title: string; url: string }
  checked: string
}

const KINDS: EvidenceKind[] = ['case', 'history', 'quote']
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export function validEntry(e: any): e is EvidenceEntry {
  return !!e && str(e.id, 80) && KINDS.includes(e.kind) && str(e.title, 160) && str(e.text, 1200) && str(e.takeaway, 400)
    && Array.isArray(e.concepts) && e.concepts.every((c: unknown) => typeof c === 'string')
    && !!e.source && str(e.source.publisher, 160) && str(e.source.title, 240) && typeof e.source.url === 'string' && /^https:\/\/[^\s]+$/.test(e.source.url)
    && typeof e.checked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.checked) && !Number.isNaN(Date.parse(e.checked))
    && (e.kind !== 'quote' || (str(e.who, 120) && str(e.work, 200)))
}

export function loadEvidence(file = getContentPath('evidence/library.json')): EvidenceEntry[] {
  try {
    const raw = (JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: unknown }).entries
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    return raw.filter((e) => { if (!validEntry(e) || seen.has(e.id)) return false; seen.add(e.id); return true }) as EvidenceEntry[]
  } catch { return [] }
}
