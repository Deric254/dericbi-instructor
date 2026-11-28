import { useEffect, useState } from 'react'
import type { FreshnessReport } from '../../types'

/** The dated tax and legal figures the lessons quote: where each came from, how old it is, and who to confirm it with. */
export default function FreshnessCard() {
  const [report, setReport] = useState<FreshnessReport | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { window.api.freshness.report().then(setReport).catch(() => setFailed(true)) }, [])
  if (failed) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Could not load the list of dated figures.</div>
  if (!report) return null
  if (report.items.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No dated figures are listed.</div>
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: report.due ? 'var(--warning)' : 'var(--text-primary)' }}>
        {report.due ? `${report.due} of ${report.items.length} figures are past their re-check date.` : `${report.items.length} figures are listed, none past its re-check date (${report.review_every_days} days).`}
      </div>
      <ul style={{ margin: '6px 0 0 18px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {report.items.map((i) => (
          <li key={i.id}>
            <strong style={{ color: 'var(--text-primary)' }}>{i.lesson_title}</strong>: {i.text.replace(/\*\*/g, '')}. Source: {i.source}. {i.confirmed ? `Confirmed ${i.confirmed_on}.` : 'Not yet confirmed with the official body.'} {i.age_days} days old{i.due ? ', re-check due' : ''}. Check with <a href={i.official_url} target="_blank" rel="noreferrer">{i.official}</a>.
          </li>
        ))}
      </ul>
    </div>
  )
}
