import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import {
  SPLIT_RESET_EVENT, clampRatio, clearRatio, firstPaneSize, nudgeRatio, ratioFromPx,
  readRatio, shouldStack, storageKey, writeRatio,
} from '../../lib/splitLayout'

interface Props {
  /** Unique name for this split; the chosen size is remembered under it. */
  id: string
  first: ReactNode
  second: ReactNode
  /** horizontal = side by side, vertical = one above the other. */
  direction?: 'horizontal' | 'vertical'
  /** Share of the space the first pane gets until the student changes it (0-1). */
  defaultRatio?: number
  /** Or: a starting size for the first pane in px (used instead of defaultRatio). */
  defaultFirstPx?: number
  /** Or: a starting size for the SECOND pane in px (handy for a side panel). */
  defaultSecondPx?: number
  /** Neither pane can be dragged smaller than these (px). */
  minFirst?: number
  minSecond?: number
  /** A side-by-side split folds into a stack when the area is narrower than this (px). 0 = never. */
  stackBelow?: number
  style?: CSSProperties
}

const HANDLE = 8

/**
 * Two panes with a draggable divider. Purely presentational: it only decides how much room each pane gets, so
 * the lesson, editor, results and AI tutor inside keep every behaviour they had.
 *  - drag with mouse, finger or pen; arrow keys nudge (Shift = bigger steps); double-click or Home resets
 *  - neither pane can be squeezed below its minimum, whatever is dragged or saved
 *  - the size is remembered per split; unreadable saved values fall back to the default
 *  - folds into a stack on narrow windows; the window can be resized freely
 */
export function SplitPane({
  id, first, second, direction = 'horizontal', defaultRatio = 0.5, defaultFirstPx, defaultSecondPx,
  minFirst = 200, minSecond = 200, stackBelow = 0, style,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [version, setVersion] = useState(0) // bumps when layouts are reset

  const stacked = direction === 'horizontal' && shouldStack(size.w, stackBelow)
  const eff: 'horizontal' | 'vertical' = stacked ? 'vertical' : direction
  const total = Math.max(0, (eff === 'horizontal' ? size.w : size.h) - HANDLE)
  // A stacked layout has less to give each pane, so relax the minimums rather than overflow.
  const mA = stacked ? Math.min(minFirst, 140) : minFirst
  const mB = stacked ? Math.min(minSecond, 140) : minSecond
  const key = storageKey(id, eff)

  const startRatio = (): number => {
    if (defaultFirstPx !== undefined && total > 0) return ratioFromPx(defaultFirstPx, total)
    if (defaultSecondPx !== undefined && total > 0) return 1 - ratioFromPx(defaultSecondPx, total)
    return defaultRatio
  }
  const initial = useCallback((): number => {
    const saved = readRatio(key)
    if (saved !== null) return saved
    return startRatio()
  }, [key, defaultFirstPx, defaultSecondPx, defaultRatio, total])

  const [ratio, setRatio] = useState<number>(() => readRatio(storageKey(id, direction)) ?? defaultRatio)

  // Measure the area (and keep measuring as the window or neighbouring panes change).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pick up the saved/default size when the orientation changes (stacking) or once the real size is known.
  const sized = total > 0
  const seeded = useRef<string>('')
  useEffect(() => {
    if (!sized) return
    const token = `${key}|${version}`
    if (seeded.current === token) return
    seeded.current = token
    setRatio(initial())
  }, [sized, key, version, initial])

  useEffect(() => {
    const onReset = () => { clearRatio(storageKey(id, 'horizontal')); clearRatio(storageKey(id, 'vertical')); setVersion((v) => v + 1) }
    window.addEventListener(SPLIT_RESET_EVENT, onReset)
    return () => window.removeEventListener(SPLIT_RESET_EVENT, onReset)
  }, [id])

  const commit = (r: number) => { const c = clampRatio(r, total, mA, mB); setRatio(c); return c }
  const reset = () => { clearRatio(key); setRatio(clampRatio(startRatio(), total, mA, mB)) }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
    e.preventDefault()
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !box.current || !(total > 0)) return
    const rect = box.current.getBoundingClientRect()
    const pos = eff === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top
    commit((pos - HANDLE / 2) / total)
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* already released */ }
    writeRatio(key, clampRatio(ratio, total, mA, mB))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 96 : 24
    const back = eff === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const fwd = eff === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    if (e.key === back || e.key === fwd) {
      e.preventDefault()
      writeRatio(key, commit(nudgeRatio(ratio, e.key === back ? -step : step, total, mA, mB)))
    } else if (e.key === 'Home') { e.preventDefault(); reset() }
  }

  const px = total > 0 ? firstPaneSize(ratio, total, mA, mB) : null
  const horizontal = eff === 'horizontal'
  const pane: CSSProperties = { minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }
  const percent = Math.round(clampRatio(ratio, total, mA, mB) * 100)

  return (
    <div ref={box} style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flex: 1, minWidth: 0, minHeight: 0, height: '100%', width: '100%', overflow: 'hidden', ...style }}>
      <div style={{ ...pane, flex: px !== null ? `0 0 ${px}px` : `0 0 ${ratio * 100}%` }}>{first}</div>
      <div
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-label="Resize panels (arrow keys to adjust, Home to reset)"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onDoubleClick={reset} onKeyDown={onKeyDown}
        style={{
          flex: `0 0 ${HANDLE}px`, cursor: horizontal ? 'col-resize' : 'row-resize', touchAction: 'none', userSelect: 'none',
          background: dragging ? 'var(--accent)' : 'var(--border)', opacity: dragging ? 0.9 : 0.55, transition: dragging ? 'none' : 'opacity 120ms, background 120ms',
          outline: 'none',
        }}
        onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.opacity = '0.55' }}
        onFocus={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--accent)' }}
        onBlur={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.background = 'var(--border)' }}
      />
      <div style={{ ...pane, flex: '1 1 0' }}>{second}</div>
    </div>
  )
}

/**
 * The common "learning window beside the workspace" layout (Python, Excel). The lesson gets the larger share by
 * default; with no lesson open the workspace simply fills the screen.
 */
export function LessonWorkspace({ id, hasLesson, lesson, workspace }: { id: string; hasLesson: boolean; lesson: ReactNode; workspace: ReactNode }) {
  if (!hasLesson) return <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}><div style={{ flex: 1, minWidth: 0 }}>{workspace}</div></div>
  return (
    <SplitPane id={id} defaultRatio={0.36} minFirst={260} minSecond={380} stackBelow={820}
      first={lesson}
      second={<div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{workspace}</div>} />
  )
}

/**
 * A main area with an optional side panel (the AI tutor, a data profile...). With no panel the main area simply
 * fills the space; with one, a draggable divider sits between them.
 */
export function AsideSplit({ id, main, aside, asidePx = 290, minAside = 240, minMain = 340, stackBelow = 640 }: {
  id: string; main: ReactNode; aside: ReactNode | null | false; asidePx?: number; minAside?: number; minMain?: number; stackBelow?: number
}) {
  if (!aside) return <div style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{main}</div>
  return (
    <SplitPane id={id} defaultSecondPx={asidePx} minFirst={minMain} minSecond={minAside} stackBelow={stackBelow}
      first={<div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{main}</div>}
      second={<div style={{ flex: 1, minHeight: 0 }}>{aside}</div>} />
  )
}
