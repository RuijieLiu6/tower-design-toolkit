// The workspace dock's layout of the project workflow (Ruijie, 7 Nov: "Arrange the workflow along a clear primary
// direction. Place branches in aligned secondary rows and route return connections around the main path"). Its own
// layout, never the landing page's positions: every node takes one column in the order Start reaches it, the main path
// (Start's first way through to Enter) sits on row 0, branches drop to row 1 in their own columns, unwired nodes wait at
// the end on row 1, and return connections arc above the main path, stacked in levels so overlapping loops stay apart.
// Pure, so it is tested without a screen (dockLayout.test.ts).
import { edgeKey, returnEdges, walk, type Board } from '../workflowGraph'

export type DockEdgeKind = 'main' | 'branch' | 'return'
export interface DockEdge { key: string; a: string; b: string; kind: DockEdgeKind; level: number }
export interface DockLayout {
  /** Column and row of every node, Start (column 0) and Enter (last column) included. */
  at: Map<string, { col: number; row: number }>
  cols: number
  rows: number
  edges: DockEdge[]
  /** Nodes on the board with no way from Start. */
  unwired: string[]
  /** Return levels used (0 = none). */
  levels: number
}

export function dockLayout(b: Board): DockLayout {
  const back = returnEdges(b.edges)
  const forward = b.edges.filter((e) => !back.has(edgeKey(e)))
  // the main path: from Start, always the first forward wire out, until Enter (or a dead end)
  const main: string[] = ['start'], onMain = new Set(['start'])
  for (let cur = 'start'; ;) {
    const e = forward.find((x) => x.a === cur && !onMain.has(x.b))
    if (!e) break
    main.push(e.b); onMain.add(e.b); cur = e.b
    if (cur === 'enter') break
  }
  const run = walk(b.edges)
  const unwired = b.nodes.filter((x) => !run.includes(x))
  const order = ['start', ...run, ...unwired, 'enter']
  const at = new Map<string, { col: number; row: number }>()
  order.forEach((id, col) => at.set(id, { col, row: onMain.has(id) || id === 'enter' ? 0 : 1 }))
  // return connections: one level each, the lowest whose span doesn't overlap another's on that level
  const rets = b.edges.filter((e) => back.has(edgeKey(e))).map((e) => {
    const c1 = at.get(e.a)?.col ?? 0, c2 = at.get(e.b)?.col ?? 0
    return { e, lo: Math.min(c1, c2), hi: Math.max(c1, c2) }
  }).sort((x, y) => (x.hi - x.lo) - (y.hi - y.lo) || x.lo - y.lo)
  const taken: { lo: number; hi: number }[][] = []
  const levelOf = new Map<string, number>()
  for (const r of rets) {
    let lv = 0
    while (taken[lv]?.some((s) => !(r.hi <= s.lo || r.lo >= s.hi))) lv++
    ;(taken[lv] ??= []).push({ lo: r.lo, hi: r.hi })
    levelOf.set(edgeKey(r.e), lv + 1)
  }
  const edges: DockEdge[] = b.edges.map((e) => {
    const k = edgeKey(e)
    if (back.has(k)) return { key: k, a: e.a, b: e.b, kind: 'return', level: levelOf.get(k) ?? 1 }
    const both = (at.get(e.a)?.row ?? 1) === 0 && (at.get(e.b)?.row ?? 1) === 0 && main.indexOf(e.b) === main.indexOf(e.a) + 1
    return { key: k, a: e.a, b: e.b, kind: both ? 'main' : 'branch', level: 0 }
  })
  const rows = [...at.values()].some((p) => p.row === 1) ? 2 : 1
  return { at, cols: order.length, rows, edges, unwired, levels: taken.length }
}
