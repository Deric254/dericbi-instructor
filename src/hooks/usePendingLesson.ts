import { useEffect, useRef } from 'react'
import { useUIStore } from '../store'

/**
 * "Continue where you left off" on the Dashboard names a lesson. Each academy calls this with its lesson list and the
 * function that opens a lesson; once the list has loaded, the named lesson opens straight away. An unknown or locked
 * lesson is ignored, so the student simply lands on the lesson list. The request never outlives the page.
 */
export function usePendingLesson(lessons: { id: string; user_status?: string }[], open: (lessonId: string) => void): void {
  const pending = useUIStore((s) => s.pendingLessonId)
  const setPending = useUIStore((s) => s.setPendingLesson)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!pending || lessons.length === 0) return
    setPending(null)
    const lesson = lessons.find((l) => l.id === pending)
    if (lesson && lesson.user_status !== 'locked') openRef.current(lesson.id)
  }, [pending, lessons, setPending])

  useEffect(() => () => setPending(null), [setPending])
}
