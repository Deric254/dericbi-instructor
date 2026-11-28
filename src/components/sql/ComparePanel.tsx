
/** What the grader sends back for a wrong answer: both results (first rows) and which rows have no partner. */
export interface Comparison {
  actual_rows?: any[]; expected_rows?: any[]
  actual_columns?: string[]; expected_columns?: string[]
  actual_match?: boolean[]; expected_match?: boolean[]
  actual_total?: number; expected_total?: number
}

export function hasComparison(c: Comparison | null | undefined): c is Required<Comparison> {
  return !!c && Array.isArray(c.actual_columns) && Array.isArray(c.expected_columns) && Array.isArray(c.actual_rows) && Array.isArray(c.expected_rows)
}

function Side({ title, tone, columns, otherColumns, rows, match, total }: {
  title: string; tone: 'error' | 'warning'; columns: string[]; otherColumns: string[]; rows: any[]; match: boolean[]; total: number
}) {
  const unmatched = tone === 'error' ? 'var(--error-dim)' : 'var(--warning-dim)'
  const other = new Set(otherColumns.map((c) => c.toLowerCase()))
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
        {title} · {total} row{total === 1 ? '' : 's'}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>No rows.</div>
        ) : (
          <table className="data-table" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={other.has(c.toLowerCase()) ? undefined : { background: unmatched }} title={other.has(c.toLowerCase()) ? undefined : 'This column is not in the other result'}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={match[i] ? undefined : { background: unmatched }}>
                  {columns.map((c) => (
                    <td key={c}>{row[c] === null || row[c] === undefined ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span> : String(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > rows.length && <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-muted)' }}>Showing the first {rows.length} of {total} rows.</div>}
      </div>
    </div>
  )
}

/** Your result next to the expected one, with the rows and columns that do not line up highlighted. */
export default function ComparePanel({ comparison }: { comparison: Required<Comparison> }) {
  const { actual_rows, expected_rows, actual_columns, expected_columns, actual_match, expected_match, actual_total, expected_total } = comparison
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        Highlighted rows or columns have no match on the other side.
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Side title="Your result" tone="error" columns={actual_columns} otherColumns={expected_columns} rows={actual_rows} match={actual_match} total={actual_total} />
        <Side title="Expected" tone="warning" columns={expected_columns} otherColumns={actual_columns} rows={expected_rows} match={expected_match} total={expected_total} />
      </div>
    </div>
  )
}
