import React from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store'
import InstructorPanel from './InstructorPanel'
import type { InstructorContext } from '../../hooks/useInstructor'
import type { NavSection } from '../../types'

/**
 * Pages that already embed their own exercise/lesson-specific InstructorPanel
 * docked in the layout (with rich context: the exact exercise, the user's
 * code, etc). The floating instructor stays out of the way there so a user
 * never sees two separate AI Instructor conversations at once.
 *
 * Every other page — which had no instructor access at all before — gets
 * this floating one via the "AI Instructor" button in the titlebar, so
 * there's always exactly one way to reach it, on every single page.
 */
export const SECTIONS_WITH_OWN_INSTRUCTOR = new Set<NavSection>([
  'sql', 'powerbi', 'statistics', 'business', 'simulations', 'projects', 'settings',
])

// A little contextual flavor per section, so "general" advice still feels
// like it knows roughly where the user is, without needing per-page wiring.
const SECTION_CONTEXT: Partial<Record<NavSection, InstructorContext>> = {
  excel:      { type: 'lesson', lesson: 'Excel' },
  python:     { type: 'lesson', lesson: 'Python' },
  playground: { type: 'playground' },
}

export default function GlobalInstructor() {
  const { activeSection, instructorOpen, setInstructorOpen } = useUIStore()

  if (!instructorOpen || SECTIONS_WITH_OWN_INSTRUCTOR.has(activeSection)) return null

  const context: InstructorContext = SECTION_CONTEXT[activeSection] ?? { type: 'general' }

  return (
    <div style={{
      position: 'fixed',
      top: 'calc(var(--titlebar-height) + 12px)',
      right: 16,
      bottom: 16,
      width: 360,
      zIndex: 9500,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setInstructorOpen(false)}
        title="Close"
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 1,
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-full)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <X size={12} />
      </button>
      <InstructorPanel context={context} />
    </div>
  )
}
