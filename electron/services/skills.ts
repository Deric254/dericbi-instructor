// The eight professional skills the Business Problem Solver builds, and every lesson in the app that practises each one.
// Lessons are only referenced here: no lesson text is changed, and a lesson may serve more than one skill.

export interface SkillDef {
  id: number
  title: string
  /** The business problem this skill solves, in the owner's words. */
  problem: string
  /** The lessons that build it: the Business Problem Solver lesson first, then supporting lessons from other academies. */
  lessons: string[]
}

export const SKILLS: SkillDef[] = [
  { id: 1, title: 'Audit the data', problem: 'What do we actually have, and can we trust it?', lessons: ['bp-audit', 'de-profiling'] },
  { id: 2, title: 'Model the business', problem: 'How do sales, stock, suppliers and money fit together?', lessons: ['bp-model', 'de-modeling', 'de-warehouse', 'powerbi-datamodel'] },
  { id: 3, title: 'Connect a source', problem: 'How do we bring in a new spreadsheet or system without guessing what a column means?', lessons: ['bp-connect', 'de-cleaning', 'de-pipelines-etl', 'de-python-pipelines', 'py-cleaning'] },
  { id: 4, title: 'Unify and reconcile', problem: 'Is this the same supplier, and do the two sources agree?', lessons: ['bp-unify', 'de-dedup', 'de-integrity', 'py-merging', 'sql-joins'] },
  { id: 5, title: 'Find the money', problem: 'Where is cash stuck, leaking or being earned?', lessons: ['bp-stock', 'bp-margins', 'bp-cash', 'business-metrics', 'business-unit-economics', 'sql-groupby'] },
  { id: 6, title: 'Investigate a question', problem: 'Why did profit fall, and what does the evidence rule out?', lessons: ['bp-investigate', 'py-eda', 'de-trends', 'business-kpi'] },
  { id: 7, title: 'Remember and monitor', problem: 'What should raise an alert, and did the last recommendation work?', lessons: ['bp-monitor', 'de-observability', 'de-testing', 'stats-timeseries'] },
  { id: 8, title: 'Scale and secure', problem: 'Can it run for a thousand businesses without leaking or doubling data?', lessons: ['bp-scale', 'de-incremental', 'de-orchestration', 'de-governance', 'powerbi-rls'] },
]

/** The capstone that combines all eight skills. */
export const SKILLS_CAPSTONE = 'bp-capstone'
