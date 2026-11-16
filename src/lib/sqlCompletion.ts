// Auto-complete for the SQL editors: the student's own table and column names first, then keywords and
// functions. After "alias." or "table." only that table's columns are offered.

export type Schema = Record<string, string[]>
export type Suggestion = { label: string; kind: 'table' | 'column' | 'keyword' | 'function'; detail?: string; insert?: string }

const KEYWORDS = [
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'INNER JOIN',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'ASC', 'DESC', 'UNION', 'UNION ALL', 'EXISTS',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'OVER', 'PARTITION BY', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'DROP TABLE', 'PRIMARY KEY', 'NOT NULL', 'DEFAULT', 'REFERENCES',
]
const FUNCTIONS = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'COALESCE', 'IFNULL', 'NULLIF', 'LENGTH', 'UPPER', 'LOWER', 'SUBSTR', 'REPLACE',
  'TRIM', 'DATE', 'DATETIME', 'STRFTIME', 'JULIANDAY', 'CAST', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
]
const NOT_ALIASES = new Set(['where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'on', 'group', 'order', 'limit', 'union', 'having', 'using', 'natural', 'set', 'values'])

/** Which words in the query stand for which table: `FROM patients p JOIN billing AS b` gives p and b. */
export function tableAliases(sql: string, schema: Schema): Record<string, string> {
  const byLower: Record<string, string> = {}
  Object.keys(schema).forEach((t) => { byLower[t.toLowerCase()] = t })
  const out: Record<string, string> = {}
  Object.keys(schema).forEach((t) => { out[t.toLowerCase()] = t })
  const re = /\b(?:from|join)\s+"?([A-Za-z_]\w*)"?(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    const table = byLower[m[1].toLowerCase()]
    if (table && m[2] && !NOT_ALIASES.has(m[2].toLowerCase())) out[m[2].toLowerCase()] = table
  }
  return out
}

/** Suggestions for the cursor position. `before` is the text of the whole query up to the cursor. */
export function buildSuggestions(sql: string, before: string, schema: Schema): Suggestion[] {
  const dot = /([A-Za-z_]\w*)\.\w*$/.exec(before)
  if (dot) {
    const table = tableAliases(sql, schema)[dot[1].toLowerCase()]
    return table ? (schema[table] ?? []).map((c) => ({ label: c, kind: 'column' as const, detail: table })) : []
  }
  const items: Suggestion[] = []
  for (const [t, cols] of Object.entries(schema)) {
    items.push({ label: t, kind: 'table', detail: `table · ${cols.length} columns` })
  }
  const seen = new Set<string>()
  for (const [t, cols] of Object.entries(schema)) {
    for (const c of cols) { if (!seen.has(c)) { seen.add(c); items.push({ label: c, kind: 'column', detail: t }) } }
  }
  KEYWORDS.forEach((k) => items.push({ label: k, kind: 'keyword' }))
  FUNCTIONS.forEach((f) => items.push({ label: f, kind: 'function', insert: `${f}($0)` }))
  return items
}

let current: Schema = {}
export function setSqlSchema(schema: Schema | null | undefined): void { current = schema ?? {} }

/** Ask the app which tables and columns the sandbox has, and remember them for auto-complete. Never throws. */
export async function refreshSqlSchema(userId: string | undefined, sandboxId: string): Promise<void> {
  if (!userId) return
  try {
    const res = await window.api.sql.schema(sandboxId, userId)
    if (res?.success) setSqlSchema(res.tables)
  } catch { /* auto-complete is a convenience: without a schema the editor still works */ }
}

const registered = new WeakSet<object>()

/** Call from the editor's beforeMount. Safe to call many times; registers once per Monaco instance. */
export function registerSqlCompletion(monaco: any): void {
  if (!monaco?.languages || registered.has(monaco)) return
  registered.add(monaco)
  const kinds = monaco.languages.CompletionItemKind
  const kindOf = { table: kinds.Struct, column: kinds.Field, keyword: kinds.Keyword, function: kinds.Function }
  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    provideCompletionItems(model: any, position: any) {
      const word = model.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      const before = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
      const suggestions = buildSuggestions(model.getValue(), before, current).map((s, i) => ({
        label: s.label, kind: kindOf[s.kind], detail: s.detail, range,
        insertText: s.insert ?? s.label,
        insertTextRules: s.insert ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
        sortText: `${s.kind === 'keyword' || s.kind === 'function' ? '1' : '0'}${String(i).padStart(4, '0')}`,
      }))
      return { suggestions }
    },
  })
}
