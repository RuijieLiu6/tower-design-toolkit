// Lining a tower up with the lot it is placed on (Ruijie, 3 Nov: "when placing the tower, try to align the tower with
// the surrounding context property lines"). Pure plan geometry in the project frame (m), plus the lot lookup.
//
// The rule, as documented in the Guide:
// - A lot's lines are read from its minimum-area rectangle. One side of that rectangle always lies on a lot line, so a
//   rectangular lot gives its own sides, and an irregular corner lot gives its dominant pair of lines.
// - The tower turns to that rectangle's axes. Of the four quarter turns it takes the one that fits the lot, then the
//   one with its long side along the lot's long side, then the one nearest its current rotation.
// - It is then placed centred on the click and moved just enough to lie inside the lot lines when it fits. Its edges
//   go flush with a lot line when they come within snapping reach.
// - It is never resized. A footprint bigger than the lot keeps the alignment and is said to span more than one lot.
// - With no lot under the click (a street, water), the nearest lot lines within 30 m set the angle. With none, the
//   rotation is kept.
import { towerMasses } from '../engine/massing'
import { distanceToRing } from '../engine/site'
import type { Tower } from '../engine/types'
import { snapFootprint, type Pt } from './edgeSnap'
import type { Pose } from './towerEdit'

/** No lot under the click: lot lines this close still set the angle (m). */
export const NEARBY_LOT_M = 30
/** Lot lines within this angle (deg) of the tower's axes count as the lines it lined up with (highlighted). */
const PARALLEL_DEG = 2

const tidy = (v: number) => { const r = Math.round(v * 1e6) / 1e6; return r === 0 ? 0 : r }
const norm180 = (d: number) => { let a = ((d % 360) + 360) % 360; if (a > 180) a -= 360; return tidy(a) }

/** Ray-casting point in ring, counting points on (or within 1 cm of) the boundary as inside. */
export function inLot(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside || distanceToRing(p, ring) <= 0.01
}

/** Convex hull (monotone chain), counter-clockwise, first point not repeated. */
export function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = [], upper: Pt[] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A lot's frame: its minimum-area rectangle's angle (deg, [0, 90)), centre and half sizes along u (at angle) and v. */
export interface LotFrame { angle: number; centre: Pt; hu: number; hv: number }

export function lotFrame(ring: Pt[]): LotFrame {
  const h = hull(ring)
  let best: LotFrame | null = null, bestArea = Infinity
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const c = Math.cos(ang), s = Math.sin(ang)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, y] of h) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v) }
    const area = (u1 - u0) * (v1 - v0)
    if (area < bestArea - 1e-9) {
      bestArea = area
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
      const deg = (ang * 180) / Math.PI
      const turned = Math.round((deg - (((deg % 90) + 90) % 90)) / 90) & 3 // quarter turns from [0, 90)
      const odd = turned % 2 === 1
      best = { angle: (((deg % 90) + 90) % 90), centre: [cu * c - cv * s, cu * s + cv * c], hu: (odd ? v1 - v0 : u1 - u0) / 2, hv: (odd ? u1 - u0 : v1 - v0) / 2 }
    }
  }
  return best ?? { angle: 0, centre: ring[0] ?? [0, 0], hu: 0, hv: 0 }
}

/** The tower's plan extents in its own frame at rotation 0 (every stacked block, or the imported hull). */
export interface FootBox { x0: number; x1: number; y0: number; y1: number }
export function footBox(t: Tower): FootBox {
  const pts = towerMasses({ ...t, x: 0, y: 0, rotation: 0 }).flatMap((m) => m.ring)
  if (!pts.length) return { x0: -t.width / 2, x1: t.width / 2, y0: -t.depth / 2, y1: t.depth / 2 }
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) }
}

/** The footprint box as seen in the lot frame when the tower is turned k quarter turns from the lot's axes. */
function boxInLot(b: FootBox, k: number): FootBox {
  switch (((k % 4) + 4) % 4) {
    case 0: return b
    case 1: return { x0: -b.y1, x1: -b.y0, y0: b.x0, y1: b.x1 }
    case 2: return { x0: -b.x1, x1: -b.x0, y0: -b.y1, y1: -b.y0 }
    default: return { x0: b.y0, x1: b.y1, y0: -b.x1, y1: -b.x0 }
  }
}

const fitsIn = (f: FootBox, lot: LotFrame) => f.x1 - f.x0 <= 2 * lot.hu + 1e-6 && f.y1 - f.y0 <= 2 * lot.hv + 1e-6

/** Which of the four rotations parallel to the lot: one that fits first, then long side along long side, then nearest `current`. */
export function chooseRotation(lot: LotFrame, box: FootBox, current: number): number {
  let best = { k: 0, score: -Infinity }
  for (let k = 0; k < 4; k++) {
    const f = boxInLot(box, k)
    const longAlong = (f.x1 - f.x0 >= f.y1 - f.y0) === (lot.hu >= lot.hv)
    const turn = Math.abs(norm180(lot.angle + 90 * k - current))
    const score = (fitsIn(f, lot) ? 1000 : 0) + (longAlong ? 500 : 0) - turn
    if (score > best.score) best = { k, score }
  }
  return norm180(lot.angle + 90 * best.k)
}

export interface LotPlacement {
  pose: Pose
  /** True: inside the lot; false: bigger than the lot (spans more than one) or no position inside an irregular lot. */
  fits: boolean
  /** Bigger than the lot along either axis (never resized). */
  spans: boolean
  /** The lot lines the tower now runs parallel to (highlighted in 3D). */
  segments: [Pt, Pt][]
}

const toWorld = (lot: LotFrame, u: number, v: number): Pt => {
  const a = (lot.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [lot.centre[0] + u * c - v * s, lot.centre[1] + u * s + v * c]
}
const toLot = (lot: LotFrame, p: Pt): Pt => {
  const a = (lot.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = p[0] - lot.centre[0], dy = p[1] - lot.centre[1]
  return [dx * c + dy * s, -dx * s + dy * c]
}

/** Every mass outline at a pose (project frame). */
const ringsAt = (t: Tower, p: Pose) => towerMasses({ ...t, ...p }).map((m) => m.ring as Pt[])

/** All of the tower inside the lot: every footprint corner in the lot, and no lot corner poking into the footprint. */
function contained(rings: Pt[][], ring: Pt[], dx = 0, dy = 0): boolean {
  const moved = dx || dy ? rings.map((r) => r.map(([x, y]) => [x + dx, y + dy] as Pt)) : rings
  if (!moved.flat().every((q) => inLot(q, ring))) return false
  return !ring.some((q) => moved.some((r) => strictlyInside(q, r)))
}
function strictlyInside(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside && distanceToRing(p, ring) > 0.01
}

/** Lot edges parallel to a rotation (mod 90°). */
export function parallelEdges(ring: Pt[], rotation: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue
    const d = (((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI - rotation) % 90 + 135) % 90 - 45
    if (Math.abs(d) <= PARALLEL_DEG) out.push([a, b])
  }
  return out
}

/**
 * Put the tower on a lot: turned to the lot's lines, centred on the click, moved just enough to lie inside the lot
 * when it fits (the nearest such spot on an irregular lot), its edges flush with a lot line within `tol` metres.
 */
export function placeOnLot(t: Tower, click: Pt, ring: Pt[], tol: number): LotPlacement {
  const lot = lotFrame(ring)
  const box = footBox(t)
  const rotation = chooseRotation(lot, box, t.rotation)
  const k = Math.round(norm180(rotation - lot.angle) / 90)
  const f = boxInLot(box, k)
  const spans = !fitsIn(f, lot)
  const [cu, cv] = toLot(lot, click)
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? v : Math.min(hi, Math.max(lo, v)))
  const uLo = -lot.hu - f.x0, uHi = lot.hu - f.x1, vLo = -lot.hv - f.y0, vHi = lot.hv - f.y1
  const at = (u: number, v: number): Pose => { const [x, y] = toWorld(lot, u, v); return { x: tidy(x), y: tidy(y), rotation } }
  // Outlines at one pose, translated for the others (the masses don't change shape as the tower slides).
  const origin = at(0, 0), base = ringsAt(t, origin)
  const fitsAt = (p: Pose) => contained(base, ring, p.x - origin.x, p.y - origin.y)
  let pose = spans ? at(cu, cv) : at(clamp(cu, uLo, uHi), clamp(cv, vLo, vHi))
  let fits = !spans && fitsAt(pose)
  if (!spans && !fits) {
    // An irregular lot: the nearest centre (on a grid over the rectangle's range) where the whole tower is inside.
    const step = Math.max(0.5, Math.max(uHi - uLo, vHi - vLo) / 60)
    let best: { p: Pose; d: number } | null = null
    for (let u = uLo; u <= uHi + 1e-9; u += step) for (let v = vLo; v <= vHi + 1e-9; v += step) {
      const d = Math.hypot(u - cu, v - cv)
      if (best && d >= best.d) continue
      const p = at(u, v)
      if (fitsAt(p)) best = { p, d }
    }
    if (best) { pose = best.p; fits = true } else pose = at(cu, cv)
  }
  if (fits) {
    // Flush with a lot line when within reach, as long as the tower stays inside.
    const s = snapFootprint(ringsAt(t, pose), [{ ring, kind: 'parcel' }], tol)
    if (s && (s.dx || s.dy)) {
      const snapped = { ...pose, x: tidy(pose.x + s.dx), y: tidy(pose.y + s.dy) }
      if (fitsAt(snapped)) pose = snapped
    }
  }
  return { pose, fits, spans, segments: parallelEdges(ring, rotation) }
}

// ---------- finding the lot ----------

export interface Lots { rings: Pt[][]; label: (i: number) => string; boxes?: Float64Array }

function boxesOf(lots: Lots): Float64Array {
  if (lots.boxes) return lots.boxes
  const b = new Float64Array(lots.rings.length * 4)
  lots.rings.forEach((r, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    b.set([x0, y0, x1, y1], i * 4)
  })
  lots.boxes = b
  return b
}

/** The lot under a point (the smallest, where City parcels overlap), or null. */
export function lotAt(lots: Lots, p: Pt): number | null {
  const b = boxesOf(lots)
  let best: number | null = null, bestArea = Infinity
  for (let i = 0; i < lots.rings.length; i++) {
    if (p[0] < b[i * 4] || p[0] > b[i * 4 + 2] || p[1] < b[i * 4 + 1] || p[1] > b[i * 4 + 3]) continue
    if (!inLot(p, lots.rings[i])) continue
    const area = (b[i * 4 + 2] - b[i * 4]) * (b[i * 4 + 3] - b[i * 4 + 1])
    if (area < bestArea) { bestArea = area; best = i }
  }
  return best
}

/** The nearest lot within `max` metres of a point, with its distance. */
export function nearestLot(lots: Lots, p: Pt, max = NEARBY_LOT_M): { index: number; distance: number } | null {
  const b = boxesOf(lots)
  let best: { index: number; distance: number } | null = null
  for (let i = 0; i < lots.rings.length; i++) {
    if (p[0] < b[i * 4] - max || p[0] > b[i * 4 + 2] + max || p[1] < b[i * 4 + 1] - max || p[1] > b[i * 4 + 3] + max) continue
    const d = distanceToRing(p, lots.rings[i])
    if (d <= max && (!best || d < best.distance)) best = { index: i, distance: d }
  }
  return best
}
