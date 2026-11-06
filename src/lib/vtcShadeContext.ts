// Shading obstacles around the competition block for the PV check: each supplied context building reduced to the
// convex hull of its plan and its top height, plus the future towers. From the competition context (lib/vtcContextSource:
// the entrant's own copy of the base model, or public/local on a developer's computer; never published); without it, PV
// shading counts the project's own towers only.
import { useEffect } from 'react'
import type { VtcContext } from '../context'
import type { Obstacle } from '../engine/energyCarbon'
import { loadVtcContext, useVtcSource } from './vtcContextSource'

type Ctx = { buildings?: { positions?: number[]; footprint?: [number, number][]; z1?: number | null }[]; future_towers?: { footprint: [number, number][]; z1: number | null }[] }

/** Convex hull (monotone chain) of 2D points. */
export function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

const shades = new WeakMap<VtcContext, { obstacles: Obstacle[]; loaded: boolean }>()
function obstaclesOf(vtc: VtcContext): { obstacles: Obstacle[]; loaded: boolean } {
  let hit = shades.get(vtc)
  if (hit) return hit
  const ctx = vtc as unknown as Ctx
  const out: Obstacle[] = []
  for (const b of ctx.buildings ?? []) {
    if (b.footprint && b.z1) { out.push({ footprint: b.footprint, height: b.z1 }); continue }
    const pos = b.positions
    if (!pos || pos.length < 9) continue
    const pts: [number, number][] = []
    let top = 0
    for (let i = 0; i + 2 < pos.length; i += 3) { pts.push([pos[i], pos[i + 1]]); top = Math.max(top, pos[i + 2]) }
    const fp = hull(pts)
    if (fp.length >= 3 && top > 3) out.push({ footprint: fp, height: top })
  }
  for (const f of ctx.future_towers ?? []) if (f.z1) out.push({ footprint: f.footprint, height: f.z1 })
  hit = { obstacles: out, loaded: out.length > 0 }
  shades.set(vtc, hit)
  return hit
}

const NONE = { obstacles: [] as Obstacle[], loaded: false }

/** Obstacles for the competition site (empty until loaded, or always empty off the competition site). */
export function useVtcShadeContext(enabled: boolean): { obstacles: Obstacle[]; loaded: boolean } {
  const ctx = useVtcSource((s) => s.ctx)
  useEffect(() => { if (enabled) void loadVtcContext() }, [enabled])
  return enabled && ctx ? obstaclesOf(ctx) : NONE
}
