import fs from 'fs'
import { getContentPath } from './setup.service'

// Lesson ids with two spellings (stat-/stats-, py-/python-): resolve either to the lesson that really exists. Nothing is renamed.
// The groups of interchangeable prefixes live in content/path/aliases.json.

/** Prefix groups from the file; a missing or broken file means no aliases, never an error. */
export function loadPrefixGroups(file = getContentPath('path/aliases.json')): string[][] {
  try {
    const raw = (JSON.parse(fs.readFileSync(file, 'utf8')) as { prefix_groups?: unknown }).prefix_groups
    if (!Array.isArray(raw)) return []
    return raw.filter((g): g is string[] => Array.isArray(g) && g.length >= 2 && g.every((p) => typeof p === 'string' && /^[a-z0-9]+$/.test(p)))
  } catch { return [] }
}

/** The id as stored if it exists; otherwise the same id with another prefix of its group; otherwise null. */
export function resolveLessonId(exists: (id: string) => boolean, id: unknown, groups: string[][] = loadPrefixGroups()): string | null {
  if (typeof id !== 'string' || !id) return null
  if (exists(id)) return id
  const cut = id.indexOf('-')
  if (cut < 1) return null
  const prefix = id.slice(0, cut); const rest = id.slice(cut)
  for (const g of groups) {
    if (!g.includes(prefix)) continue
    for (const other of g) if (other !== prefix && exists(other + rest)) return other + rest
  }
  return null
}
