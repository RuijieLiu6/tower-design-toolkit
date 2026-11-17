// Scale in the selected tower's bar (16 Nov, Sinnie: "add a scale tool to this bar"): the plan grows or shrinks about
// the tower's own centre by a factor, and the height is set on its own, so a tower can be made slimmer, wider or taller
// without redrawing it. Parametric towers scale every stacked block (width, depth and its offset from the centre; heights
// in proportion when the height changes); drawn masses scale their outline and holes about the centroid and keep whole
// storeys. An imported model's geometry is the file's own and is not scaled here. One Undo step per change.
import { blocksOf } from '../engine/blocks'
import { cen, type DrawnMass } from '../engine/drawn'
import { withBlocks } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useStore } from '../store'
import { setDrawn } from './drawn'
import { breakStep } from './project/history'

type Pt = [number, number]

/** Whether this tower's form can be scaled here (an imported file cannot). */
export const canScale = (t: Tower) => !t.imported || !!t.drawn

/** Plan size used by the fields: the tower's bounding width and depth (m). */
export function planSize(t: Tower): { w: number; d: number } {
  if (t.drawn) {
    const xs = t.drawn.pts.map((p) => p[0]), ys = t.drawn.pts.map((p) => p[1])
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) }
  }
  return { w: Math.max(t.width, t.podiumWidth), d: Math.max(t.depth, t.podiumDepth) }
}

/**
 * Scales a tower: `kx`, `ky` multiply the plan (about the centre; 1 keeps it), `height` sets the top (m above its base;
 * omitted keeps it). Returns false when the tower cannot be scaled.
 */
export function scaleTower(id: string, kx: number, ky: number, height?: number): boolean {
  const s = useStore.getState(), t = s.towers[s.project].find((x) => x.id === id)
  if (!t || !canScale(t) || !(kx > 0) || !(ky > 0)) return false
  breakStep()
  if (t.drawn) {
    const m = t.drawn, c = cen(m.pts)
    const sc = (p: Pt): Pt => [c[0] + (p[0] - c[0]) * kx, c[1] + (p[1] - c[1]) * ky]
    const floors = height != null ? Math.max(1, Math.round(height / m.f2f)) : m.floors
    const next: DrawnMass = { ...m, pts: m.pts.map(sc), holes: m.holes?.map((h) => h.map(sc)), floors }
    setDrawn([{ id, m: next }])
  } else {
    const hk = height != null && t.height > 0 ? height / t.height : 1
    const blocks = blocksOf(t).map((b) => ({ ...b, width: b.width * kx, depth: b.depth * ky, dx: b.dx * kx, dy: b.dy * ky, height: b.height * hk }))
    const next = withBlocks(t, blocks)
    useStore.getState().updateTower(id, { blocks: next.blocks, boxFromBlocks: next.boxFromBlocks, height: next.height, width: next.width, depth: next.depth,
      podiumHeight: next.podiumHeight, podiumWidth: next.podiumWidth, podiumDepth: next.podiumDepth })
  }
  breakStep()
  return true
}
