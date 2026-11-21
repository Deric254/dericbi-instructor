import * as fs from 'fs'
import { getContentPath } from './setup.service'

export interface ExplainRubric { prompt: string; need: number; points: Array<{ hint: string; any: string[] }> }
export interface Concept { id: string; name: string; definition: string; depends_on: string[]; lessons: string[]; explain?: ExplainRubric }

/** The concept map (content/concepts/concepts.json): the plain-language ideas the curriculum is built on. */
export function loadConcepts(): Concept[] {
  return (JSON.parse(fs.readFileSync(getContentPath('concepts/concepts.json'), 'utf8')) as { concepts: Concept[] }).concepts
}
