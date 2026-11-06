// "Tower position" (Ruijie, 6 Nov): "if it is about positioning a tower then I would turn it into an icon of a tower on
// site and name it tower position and once the user click on it they will enter this platform which the view is locked
// and on right side of the screen you have a property tab which shows the location information and you could enter
// the exact number from there which on the screen you could directly click on the tower to freely change the position.
// No need to confirm every time." While the tool is open: the view frames the site at a fixed scale (zoom and pan off,
// orbit free), a press on a tower drags it on the ground, a click on the ground moves the selected tower there (lined
// up with the lot; Shift: free), and the right panel's Properties tab shows and takes its position. Every move is
// written at once, one undo step (lib/towerEdit.ts). Pure helpers here; components/TowerPosition3D.tsx does the view.
import { create } from 'zustand'
import { towerFootprint } from '../engine/massing'
import type { Tower } from '../engine/types'
import type { Ray3 } from './blockEdit'
import { planeHit } from './blockEdit'

type Pt = [number, number]

interface PositionState {
  /** The Tower position tool is open (Form step). */
  on: boolean
  /** The view stays framed on the site: zoom and pan off, orbit free. */
  locked: boolean
  /** Bumped to frame the site again. */
  frame: number
}
export const useTowerPosition = create<PositionState>(() => ({ on: false, locked: true, frame: 0 }))

export function inRing(p: Pt, ring: Pt[]): boolean {
  let k = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) k = !k
  }
  return k
}

/**
 * The first point where the ray enters a tower's prism (its footprint at grade from `z0` to `z1`), sampled on
 * horizontal planes from the top down: good to a fraction of a storey, enough to pick and grab a tower.
 */
export function hitPrism(ring: Pt[], z0: number, z1: number, ray: Ray3, steps = 32): { point: [number, number, number]; k: number } | null {
  if (ring.length < 3 || z1 <= z0) return null
  for (let i = 0; i <= steps; i++) {
    const z = z1 - ((z1 - z0) * i) / steps
    const p = planeHit(ray, z)
    if (p && inRing(p, ring)) return { point: [p[0], p[1], z], k: (z - ray.o[2]) / ray.d[2] }
  }
  return null
}

/** The nearest tower under the ray (towers on their base `baseZ`), with where it was met. */
export function towerUnderRay(towers: Tower[], baseZ: number, ray: Ray3): { tower: Tower; point: [number, number, number] } | null {
  let best: { tower: Tower; point: [number, number, number]; k: number } | null = null
  for (const t of towers) {
    const h = hitPrism(towerFootprint(t, true) as Pt[], baseZ, baseZ + t.height, ray)
    if (h && (!best || h.k < best.k)) best = { tower: t, ...h }
  }
  return best && { tower: best.tower, point: best.point }
}

/** A view framing the site and the tower: centre and radius (project frame, m). */
export function siteFrame(site: Pt[] | null, t: Tower | null, baseZ: number): { centre: [number, number, number]; radius: number } {
  const pts: Pt[] = [...(site ?? []), ...(t ? (towerFootprint(t, true) as Pt[]) : [])]
  if (!pts.length) return { centre: [0, 0, baseZ], radius: 150 }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)))
  // Air around the site (the streets and neighbours), and the tower's height in view.
  return { centre: [cx, cy, baseZ + (t ? t.height * 0.25 : 0)], radius: Math.max(site?.length ? 80 : 150, r * 1.6, t ? t.height * 0.85 : 0) }
}
