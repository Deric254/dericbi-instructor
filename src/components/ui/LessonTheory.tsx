import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Diagram from './Diagram'
import EvidenceCard from './EvidenceCard'

/** A fenced block the lesson uses for a picture or a library entry, or null for ordinary code. */
function blockOf(children: React.ReactNode): { kind: 'diagram' | 'evidence'; body: string } | null {
  const child = React.Children.toArray(children)[0]
  if (!React.isValidElement(child)) return null
  const props = child.props as { className?: string; children?: React.ReactNode }
  const m = /language-(diagram|evidence)\b/.exec(props.className ?? '')
  return m ? { kind: m[1] as 'diagram' | 'evidence', body: String(props.children ?? '').trim() } : null
}

/**
 * The single, shared renderer for every lesson's theory_md content across
 * all six academies (SQL, Excel, Python, Power BI, Statistics, Business).
 *
 * Before this component existed, theory content was rendered five different
 * ways across the app — some with literal "##" and "**" symbols showing up
 * as raw text, one with no line breaks at all, and two subjects (Python,
 * Excel) never displayed their lesson theory in the UI at all. This fixes
 * all of that in one place, so every subject looks and behaves identically.
 */
export default function LessonTheory({ markdown }: { markdown: string }) {
  if (!markdown) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Lesson content will appear here once seeded.
      </p>
    )
  }

  return (
    <div className="lesson-theory">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children, node: _node, ...rest }) => {
            const block = blockOf(children)
            if (block?.kind === 'diagram') return <Diagram source={block.body} />
            if (block?.kind === 'evidence') return <EvidenceCard id={block.body} />
            return <pre {...rest}>{children}</pre>
          },
        }}
      >{markdown}</ReactMarkdown>
    </div>
  )
}
