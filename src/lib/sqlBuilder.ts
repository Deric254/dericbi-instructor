// Helpers for the "My Databases" screen: turn the table designer's form into CREATE TABLE text.
// Pure functions so they can be tested without a screen.

export interface ColumnDraft { name: string; type: 'INTEGER' | 'TEXT' | 'REAL' | 'DATE' | 'BOOLEAN'; pk: boolean; notNull: boolean }

export const quoteIdent = (n: string): string => `"${n.replace(/"/g, '""')}"`

/** Returns the CREATE TABLE statement, or an error the student can act on. */
export function buildCreateTable(tableName: string, cols: ColumnDraft[]): { sql?: string; error?: string } {
  const t = tableName.trim()
  if (!t) return { error: 'Give the table a name, e.g. patients.' }
  const used = cols.filter((c) => c.name.trim())
  if (!used.length) return { error: 'Add at least one column.' }
  const seen = new Set<string>()
  for (const c of used) {
    const k = c.name.trim().toLowerCase()
    if (seen.has(k)) return { error: `Two columns are called "${c.name.trim()}". Column names must be different.` }
    seen.add(k)
  }
  const pks = used.filter((c) => c.pk)
  const single = pks.length === 1
  const lines = used.map((c) => {
    let line = `  ${quoteIdent(c.name.trim())} ${c.type}`
    if (single && c.pk) line += ' PRIMARY KEY'
    if (c.notNull && !(single && c.pk)) line += ' NOT NULL'
    return line
  })
  if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => quoteIdent(c.name.trim())).join(', ')})`)
  return { sql: `CREATE TABLE ${quoteIdent(t)} (\n${lines.join(',\n')}\n);` }
}

/** Starter statements a beginner can drop into the editor, adapted to a table when one is known. */
export function snippets(table?: { name: string; columns: { name: string }[] }): { label: string; sql: string }[] {
  const t = table ? quoteIdent(table.name) : 'my_table'
  const cols = table?.columns.map((c) => quoteIdent(c.name)) ?? ['id', 'name']
  const first = cols[1] ?? cols[0]
  return [
    { label: 'Add rows', sql: `INSERT INTO ${t} (${cols.join(', ')})\nVALUES (${cols.map(() => '?').join(', ')});` },
    { label: 'Change rows', sql: `UPDATE ${t}\nSET ${first} = ?\nWHERE ${cols[0]} = ?;` },
    { label: 'Delete rows', sql: `DELETE FROM ${t}\nWHERE ${cols[0]} = ?;` },
    { label: 'Add a column', sql: `ALTER TABLE ${t} ADD COLUMN new_column TEXT;` },
    { label: 'Speed up lookups', sql: `CREATE INDEX idx_${table?.name ?? 'my_table'}_${(table?.columns[1] ?? table?.columns[0])?.name ?? 'name'}\nON ${t} (${first});` },
    { label: 'Remove table', sql: `DROP TABLE ${t};` },
  ]
}
