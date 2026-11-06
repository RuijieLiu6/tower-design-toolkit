// The sun-hours map's area as the user edits it (Ruijie, 4 Nov: placing a building makes a simulation area; "add a
// function to modify the boundary"): a north-up rectangle [x0, y0, x1, y1] in the project's frame, resized by its
// corners and sides or moved by its middle (components/SolarArea.tsx). The solar run (engine/solarJob.ts) takes it.
import type { MapBounds } from '../engine/solarJob'

export type Pt = [number, number]
/** The handles: the four corners, the four sides (by compass point) and the middle. */
export type AreaHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'
export const AREA_HANDLES: AreaHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'move']

/** Smallest and largest side (m): under 100 m the map says little; above 4 km its cells pass 13 m (MAX_MAP_CELLS). */
export const MIN_SIDE = 100
export const MAX_SIDE = 4000

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Where a handle sits on the rectangle. */
export function handleAt(b: MapBounds, h: AreaHandle): Pt {
  const [x0, y0, x1, y1] = b, mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  if (h === 'move') return [mx, my]
  const x = h.includes('w') ? x0 : h.includes('e') ? x1 : mx
  const y = h.includes('s') ? y0 : h.includes('n') ? y1 : my
  return [x, y]
}

/**
 * The rectangle after dragging handle `h` from `from` to `to` (plan points): a corner moves its two sides, a side one
 * side, the middle the whole area. The side opposite a dragged one stays put, and each side stays within
 * MIN_SIDE..MAX_SIDE (a side dragged past its opposite stops at the minimum, it does not flip).
 */
export function dragArea(b: MapBounds, h: AreaHandle, from: Pt, to: Pt): MapBounds {
  const dx = to[0] - from[0], dy = to[1] - from[1]
  let [x0, y0, x1, y1] = b
  if (h === 'move') return [x0 + dx, y0 + dy, x1 + dx, y1 + dy]
  if (h.includes('w')) x0 = clamp(x0 + dx, x1 - MAX_SIDE, x1 - MIN_SIDE)
  if (h.includes('e')) x1 = clamp(x1 + dx, x0 + MIN_SIDE, x0 + MAX_SIDE)
  if (h.includes('s')) y0 = clamp(y0 + dy, y1 - MAX_SIDE, y1 - MIN_SIDE)
  if (h.includes('n')) y1 = clamp(y1 + dy, y0 + MIN_SIDE, y0 + MAX_SIDE)
  return [x0, y0, x1, y1]
}

/** Rounded to the metre, so the area (and the run's cache key) does not change with sub-metre jitter. */
export const roundArea = (b: MapBounds): MapBounds => b.map((v) => Math.round(v)) as MapBounds

/** The outline as points every `step` metres (to drape on the terrain), closed. */
export function areaOutline(b: MapBounds, step = 25): Pt[] {
  const [x0, y0, x1, y1] = b, corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], out: Pt[] = []
  for (let i = 0; i < 4; i++) {
    const a = corners[i], c = corners[(i + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / step))
    for (let k = 0; k < n; k++) out.push([a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n])
  }
  out.push(out[0])
  return out
}
