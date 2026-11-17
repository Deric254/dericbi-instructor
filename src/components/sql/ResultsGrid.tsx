import React, { useEffect, useState } from 'react'

/** Rows drawn straight away; the rest are one click away. Keeps a 10,000-row result instant instead of freezing the window. */
export const FIRST_ROWS = 300
const MORE_ROWS = 1000

/** The table of a query result: NULLs shown as such, long results revealed in steps. */
export default function ResultsGrid({ rows, columns }: { rows: any[]; columns: string[] }) {
  const [limit, setLimit] = useState(FIRST_ROWS)
  useEffect(() => { setLimit(FIRST_ROWS) }, [rows])
  if (rows.length === 0) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Query returned 0 rows.</div>
  }
  const shown = Math.min(limit, rows.length)
  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <table className="data-table" style={{ minWidth: '100%' }}>
        <thead>
          <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{row[col] === null || row[col] === undefined ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span> : String(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {shown < rows.length && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
          <span>Showing {shown.toLocaleString()} of {rows.length.toLocaleString()} rows.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setLimit(shown + MORE_ROWS)}>Show {Math.min(MORE_ROWS, rows.length - shown).toLocaleString()} more</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLimit(rows.length)}>Show all</button>
        </div>
      )}
    </div>
  )
}
