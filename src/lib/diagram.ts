/**
 * Lesson diagrams. A lesson writes a small JSON spec in a ```diagram block; this turns it into a layout the page draws as SVG. Nothing
 * from the spec is ever run or inserted as markup: it is checked, measured, and drawn with text nodes only. A spec that is not valid
 * gives null, and the page then shows a plain note instead of a broken picture.
 *
 *   { "title": "...", "nodes": [{ "id": "a", "label": "Bits", "side": "tech" }], "edges": [["a", "b", "optional label"]] }
 *
 * `side` is the one visual grammar of the whole system: business, tech or bridge (both), always the same colours.
 */
export type DiagramSide = 'business' | 'tech' | 'bridge'
export interface DiagramSpec { title: string; nodes: Array<{ id: string; label: string; side: DiagramSide }>; edges: Array<[string, string, string?]> }
export interface LaidNode { id: string; lines: string[]; x: number; y: number; w: number; h: number; side: DiagramSide }
export interface LaidEdge { from: string; to: string; label: string; d: string; lx: number; ly: number; anchor: 'start' | 'middle' | 'end' }
export interface DiagramLayout { title: string; width: number; height: number; nodes: LaidNode[]; edges: LaidEdge[]; sides: DiagramSide[]; description: string }

export const MAX_NODES = 12
export const MAX_LABEL = 40
const SIDES: DiagramSide[] = ['business', 'tech', 'bridge']
const NODE_W = 132, NODE_H = 44, COL_GAP = 18, ROW_GAP = 36, PAD = 14, LINE_CHARS = 19, LOOP = 30

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** Read and check a spec. Anything that is not exactly the shape above is refused. */
export function parseDiagram(source: string): DiagramSpec | null {
  let raw: any
  try { raw = JSON.parse(source) } catch { return null }
  if (!raw || typeof raw !== 'object' || !text(raw.title, 120) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null
  if (raw.nodes.length < 2 || raw.nodes.length > MAX_NODES) return null
  const ids = new Set<string>()
  for (const n of raw.nodes) {
    if (!n || !text(n.id, 40) || !text(n.label, MAX_LABEL) || !SIDES.includes(n.side) || ids.has(n.id)) return null
    ids.add(n.id)
  }
  const edges: Array<[string, string, string?]> = []
  for (const e of raw.edges) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 3 || !ids.has(e[0]) || !ids.has(e[1]) || e[0] === e[1]) return null
    if (e.length === 3 && !text(e[2], 30)) return null
    edges.push(e.length === 3 ? [e[0], e[1], e[2]] : [e[0], e[1]])
  }
  if (edges.length === 0) return null
  return { title: raw.title.trim(), nodes: raw.nodes.map((n: any) => ({ id: n.id, label: n.label.trim(), side: n.side })), edges }
}

/** Split a label into at most two lines at word breaks. */
function wrap(label: string): string[] {
  if (label.length <= LINE_CHARS) return [label]
  const words = label.split(/\s+/)
  let first = ''
  for (const w of words) { if ((first + ' ' + w).trim().length > LINE_CHARS && first) break; first = (first + ' ' + w).trim() }
  const rest = label.slice(first.length).trim()
  return rest ? [first, rest.length > LINE_CHARS + 1 ? rest.slice(0, LINE_CHARS - 1) + '\u2026' : rest] : [first]
}

/**
 * Place each idea in a row by how far it is from where the flow starts, top to bottom, so a diagram stays readable in a narrow lesson
 * pane. A step back (a loop) goes round the right-hand side and never changes the rows.
 */
export function layoutDiagram(spec: DiagramSpec): DiagramLayout {
  const layer = new Map(spec.nodes.map((n) => [n.id, 0]))
  for (let pass = 0; pass < spec.nodes.length; pass++) {
    let changed = false
    for (const [a, b] of spec.edges) {
      if ((layer.get(a) as number) + 1 > (layer.get(b) as number) && (layer.get(a) as number) + 1 < spec.nodes.length) { layer.set(b, (layer.get(a) as number) + 1); changed = true }
    }
    if (!changed) break
  }
  const rows = Math.max(...layer.values()) + 1
  const byRow: string[][] = Array.from({ length: rows }, () => [])
  for (const n of spec.nodes) byRow[layer.get(n.id) as number].push(n.id)
  const widest = Math.max(...byRow.map((r) => r.length))
  const rowW = (n: number) => n * NODE_W + (n - 1) * COL_GAP
  const innerW = rowW(widest)
  const nodes: LaidNode[] = []
  byRow.forEach((ids, r) => {
    const left = PAD + (innerW - rowW(ids.length)) / 2
    ids.forEach((id, c) => {
      const n = spec.nodes.find((x) => x.id === id)!
      nodes.push({ id, lines: wrap(n.label), x: left + c * (NODE_W + COL_GAP), y: PAD + r * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H, side: n.side })
    })
  })
  const at = new Map(nodes.map((n) => [n.id, n]))
  const hasBack = spec.edges.some(([a, b]) => at.get(b)!.y <= at.get(a)!.y)
  const edges: LaidEdge[] = spec.edges.map(([from, to, label]) => {
    const a = at.get(from)!, b = at.get(to)!
    let d: string, lx: number, ly: number
    if (b.y > a.y) {
      const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y, my = (y1 + y2) / 2
      d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; lx = (x1 + x2) / 2 + (x1 === x2 ? 4 : 0); ly = my - 3
      if (x1 === x2) return { from, to, label: label ?? '', d, lx: x1 + 6, ly: my + 3, anchor: 'start' as const }
    } else {
      // a step back or sideways: go round the right-hand side so it never crosses a box
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2, out = Math.max(x1, x2) + LOOP
      d = `M${x1},${y1} C${out},${y1} ${out},${y2} ${x2},${y2}`; lx = out - 4; ly = (y1 + y2) / 2
      return { from, to, label: label ?? '', d, lx, ly, anchor: 'end' as const }
    }
    return { from, to, label: label ?? '', d, lx, ly, anchor: 'middle' as const }
  })
  const width = PAD * 2 + innerW + (hasBack ? LOOP : 0)
  const height = PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP
  const label = (id: string) => spec.nodes.find((n) => n.id === id)!.label
  const description = spec.edges.map(([a, b, l]) => `${label(a)} ${l ? `(${l}) ` : ''}leads to ${label(b)}`).join('. ') + '.'
  return { title: spec.title, width, height, nodes, edges, sides: SIDES.filter((s) => spec.nodes.some((n) => n.side === s)), description }
}
