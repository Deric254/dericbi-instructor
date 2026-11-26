import React, { useEffect, useState } from 'react'
import { BookOpen, Quote, ExternalLink } from 'lucide-react'
import type { EvidenceEntry } from '../../types'

let cache: Promise<EvidenceEntry[]> | null = null
const load = (): Promise<EvidenceEntry[]> => (cache ??= window.api.evidence.list().catch(() => { cache = null; return [] }))

const KIND = { case: 'Case', history: 'From history', quote: 'In their words' } as const

/** Shows one entry of the evidence library, by id, with its source and the date it was checked. An id that is not in the library shows nothing. */
export default function EvidenceCard({ id }: { id: string }) {
  const [entry, setEntry] = useState<EvidenceEntry | null | undefined>(undefined)
  useEffect(() => { let on = true; load().then((l) => { if (on) setEntry(l.find((e) => e.id === id) ?? null) }); return () => { on = false } }, [id])
  if (!entry) return null
  const quote = entry.kind === 'quote'
  return (
    <aside className="card" aria-label={`${KIND[entry.kind]}: ${entry.title}`} style={{ margin: '12px 0', borderLeft: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {quote ? <Quote size={12} /> : <BookOpen size={12} />} {KIND[entry.kind]}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, margin: '4px 0' }}>{entry.title}</div>
      {quote ? (
        <blockquote style={{ margin: '4px 0', fontStyle: 'italic', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
          &ldquo;{entry.text}&rdquo;<footer style={{ fontStyle: 'normal', fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{entry.who}, {entry.work}</footer>
        </blockquote>
      ) : <p style={{ margin: '4px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{entry.text}</p>}
      <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}><strong>What it means for you:</strong> {entry.takeaway}</p>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Source: {entry.source.publisher}, {entry.source.title} <a href={entry.source.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }} aria-label={`Open the source: ${entry.source.title}`}><ExternalLink size={10} /></a> · checked {entry.checked}
      </div>
    </aside>
  )
}
