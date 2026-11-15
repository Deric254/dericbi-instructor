// The arithmetic and storage behind resizable panes (SplitPane.tsx). Kept free of React and the DOM so it can be
// tested on its own: whatever a student drags, a stale saved value or a tiny window, the answer is always a
// layout in which BOTH panes stay usable.

export const SPLIT_STORAGE_PREFIX = 'dbi.split.v1.'
export const SPLIT_RESET_EVENT = 'dbi-split-reset'

/** Keep a split inside its limits. `total` is the space both panes share, in px. Returns the first pane's share (0-1). */
export function clampRatio(ratio: number, total: number, minFirst: number, minSecond: number): number {
  if (!Number.isFinite(total) || total <= 0) return Number.isFinite(ratio) ? Math.min(0.9, Math.max(0.1, ratio)) : 0.5
  const a = Math.max(0, minFirst)
  const b = Math.max(0, minSecond)
  // Not enough room for both minimums (a very small window): share what exists in proportion to the minimums.
  if (a + b >= total) return a + b === 0 ? 0.5 : a / (a + b)
  const wanted = Number.isFinite(ratio) ? ratio : 0.5
  const lo = a / total
  const hi = 1 - b / total
  return Math.min(hi, Math.max(lo, wanted))
}

/** Pixel size of the first pane for a given ratio, never breaking either minimum. */
export function firstPaneSize(ratio: number, total: number, minFirst: number, minSecond: number): number {
  return Math.round(clampRatio(ratio, total, minFirst, minSecond) * total)
}

/** A value read back from storage, or null when it is missing, not a number, or absurd. */
export function parseStoredRatio(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null
}

/** Ratio for "the first pane should be this many px wide". */
export function ratioFromPx(px: number, total: number): number {
  return total > 0 && Number.isFinite(px) ? px / total : 0.5
}

/** Move the divider by `deltaPx` (keyboard / touch nudges). */
export function nudgeRatio(ratio: number, deltaPx: number, total: number, minFirst: number, minSecond: number): number {
  if (!(total > 0)) return ratio
  return clampRatio(ratio + deltaPx / total, total, minFirst, minSecond)
}

/** Should a side-by-side layout fold into a stack because the window is narrow? */
export function shouldStack(width: number, stackBelow: number): boolean {
  return stackBelow > 0 && width > 0 && width < stackBelow
}

export function storageKey(id: string, orientation: 'horizontal' | 'vertical'): string {
  return `${SPLIT_STORAGE_PREFIX}${id}.${orientation}`
}

// localStorage can be missing, full or blocked (private windows, policies). A layout is a convenience, so every
// access is guarded and the app simply uses its defaults when storage is unavailable.
export function readRatio(key: string): number | null {
  try { return parseStoredRatio(window.localStorage.getItem(key)) } catch { return null }
}
export function writeRatio(key: string, ratio: number): void {
  try { window.localStorage.setItem(key, String(Math.round(ratio * 10000) / 10000)) } catch { /* not saved; fine */ }
}
export function clearRatio(key: string): void {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

/** Forget every saved layout and tell mounted panes to return to their defaults. */
export function resetAllLayouts(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(SPLIT_STORAGE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(SPLIT_RESET_EVENT)) } catch { /* ignore */ }
}
