import React from 'react'
import { parseDiagram, layoutDiagram, type DiagramSide } from '../../lib/diagram'

const COLOR: Record<DiagramSide, string> = { tech: 'var(--sql-color)', business: 'var(--business-color)', bridge: 'var(--bp-color)' }
const NAME: Record<DiagramSide, string> = { tech: 'Technology', business: 'Business', bridge: 'Both' }

/** Draws a lesson's ```diagram block as SVG in the theme's colours. Text only, never markup from the lesson. */
export default function Diagram({ source }: { source: string }) {
  const spec = parseDiagram(source)
  if (!spec) return <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>This diagram could not be shown.</p>
  const l = layoutDiagram(spec)
  const id = `dg-${l.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  return (
    <figure style={{ margin: '12px 0' }}>
      <svg role="img" aria-labelledby={`${id}-t ${id}-d`} viewBox={`0 0 ${l.width} ${l.height}`} style={{ width: '100%', maxWidth: l.width * 1.15, height: 'auto', display: 'block' }}>
        <title id={`${id}-t`}>{l.title}</title>
        <desc id={`${id}-d`}>{l.description}</desc>
        <defs>
          <marker id={`${id}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-muted)" /></marker>
        </defs>
        {l.edges.map((e, i) => (
          <g key={i}>
            <path d={e.d} fill="none" stroke="var(--text-muted)" strokeWidth={1.4} markerEnd={`url(#${id}-a)`} />
            {e.label && <text x={e.lx} y={e.ly} textAnchor={e.anchor} fontSize={10} fill="var(--text-secondary)" stroke="var(--bg-surface)" strokeWidth={3} paintOrder="stroke">{e.label}</text>}
          </g>
        ))}
        {l.nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="var(--bg-surface)" stroke={COLOR[n.side]} strokeWidth={2} />
            {n.lines.map((t, i) => <text key={i} x={n.x + n.w / 2} y={n.y + n.h / 2 + (i - (n.lines.length - 1) / 2) * 14 + 4} textAnchor="middle" fontSize={12} fill="var(--text-primary)">{t}</text>)}
          </g>
        ))}
      </svg>
      <figcaption style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{l.title}</span>
        {l.sides.map((s) => <span key={s}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COLOR[s], marginRight: 4 }} />{NAME[s]}</span>)}
      </figcaption>
    </figure>
  )
}
