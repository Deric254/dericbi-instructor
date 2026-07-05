import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
