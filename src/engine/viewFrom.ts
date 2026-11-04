// "View from here" (Context Model: views from cones and rooftops; research C04 viewpoint rig, C02 curvature).
// Pure maths: picking a roof, eye heights, earth curvature, a ray-cast skyline profile over the City's LiDAR roofs and
// terrain, and which protected view cones a sightline crosses. All heights are geodetic (CGVD28), like the context data.

export type Pt = [number, number]

/** Eye height above the standing surface: 1.6 m, editable (research C04 r3: ground z + 1.6 m where no Lv is given). */
export const EYE_HEIGHT = 1.6
/** Refraction coefficient for line-of-sight drawing (research C02 r3: k = 0.13). */
export const REFRACTION_K = 0.13
const EARTH_R = 6371000

/** Drop of a distant point below the eye's horizontal plane: d² / 2R × (1 − k) (research C02 r3, hand-checked values). */
export function curvatureDrop(d: number, k = REFRACTION_K): number {
  return ((d * d) / (2 * EARTH_R)) * (1 - k)
}

export interface FootprintLike { outer: Pt[]; holes: Pt[][] }
export interface HeightsLike { ground: Float32Array; roof: Float32Array; max: Float32Array; points: Uint16Array }

export function inRing([x, y]: Pt, ring: Pt[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const inFootprint = (p: Pt, f: FootprintLike) => inRing(p, f.outer) && !f.holes.some((h) => inRing(p, h))

export const hasHeight = (h: HeightsLike | null, i: number) => !!h && Number.isFinite(h.ground[i]) && Number.isFinite(h.roof[i]) && h.roof[i] > h.ground[i]

/** Spatial index of footprints by 50 m cells, so picking and ray casting stay fast over 6,700 buildings. */
export interface FootprintIndex { cell: number; cells: Map<string, number[]>; footprints: FootprintLike[] }
export function indexFootprints(footprints: FootprintLike[], cell = 50): FootprintIndex {
  const cells = new Map<string, number[]>()
  footprints.forEach((f, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of f.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
      const k = `${cx},${cy}`
      const l = cells.get(k)
      if (l) l.push(i); else cells.set(k, [i])
    }
  })
  return { cell, cells, footprints }
}
export function footprintAt(idx: FootprintIndex, x: number, y: number): number | null {
  const l = idx.cells.get(`${Math.floor(x / idx.cell)},${Math.floor(y / idx.cell)}`)
  if (!l) return null
  for (const i of l) if (inFootprint([x, y], idx.footprints[i])) return i
  return null
}

export type Pick =
  | { kind: 'roof'; index: number; ground: number; roof: number; max: number; points: number; eye: number }
  | { kind: 'unknown'; index: number; reason: string }
  | { kind: 'street' }

/** What a click lands on: a roof with a LiDAR height, a building without one (can't stand there), or the street. */
export function pickAt(idx: FootprintIndex, heights: HeightsLike | null, x: number, y: number, eye = EYE_HEIGHT): Pick {
  const i = footprintAt(idx, x, y)
  if (i == null) return { kind: 'street' }
  if (!hasHeight(heights, i)) return { kind: 'unknown', index: i, reason: 'This building has no roof height in the model shown (in the City model: no LiDAR 2022 roof and no City 2009 height; placeholders are display only), so a camera cannot be placed on it. Pick a solid building, or the street.' }
  const h = heights!
  // Roof P90 (the 90th percentile of roof points) is the standing surface; the maximum includes parapets and plant.
  return { kind: 'roof', index: i, ground: h.ground[i], roof: h.roof[i], max: h.max[i], points: h.points[i], eye: h.roof[i] + eye }
}

/** Eye elevation on a floor of a design tower: ground + floor level + eye height (floor z0 from the tower's storeys). */
export const floorEye = (ground: number, floorZ0: number, eye = EYE_HEIGHT) => ground + floorZ0 + eye
/** Eye elevation on a tower roof: ground + architectural top + eye height. */
export const topEye = (ground: number, height: number, eye = EYE_HEIGHT) => ground + height + eye

export interface Obstacle { poly: Pt[]; top: number; label: string }

export interface Ray {
  /** Bearing, degrees clockwise from grid north. */
  bearing: number
  /** Highest elevation angle (degrees) of buildings and terrain closer than the far field, and what made it. */
  near: { angle: number; label: string; distance: number }
  /** Highest elevation angle of the far terrain (the mountains), with its height and distance. */
  far: { angle: number; height: number; distance: number } | null
  /** Far terrain rises above everything nearer. */
  farVisible: boolean
}

export interface SkylineInput {
  eye: [number, number, number]
  /** Terrain height (geodetic) at a local point, or null outside the data. */
  terrain: (x: number, y: number) => number | null
  idx: FootprintIndex
  heights: HeightsLike | null
  /** Extra obstacles (the design towers), tops geodetic. */
  towers: Obstacle[]
  /** Terrain at or above this height counts as "mountains" (team preset). */
  farMin: number
  maxDistance?: number
}

/** Elevation angle of a point at distance d and height z, seen from eye height e, with curvature and refraction. */
export const elevAngle = (z: number, e: number, d: number) => (Math.atan2(z - curvatureDrop(d) - e, d) * 180) / Math.PI

/** Cast one ray: buildings (LiDAR roofs and design towers) and near terrain set the skyline; far high terrain is the mountains. */
export function castRay(inp: SkylineInput, bearing: number): Ray {
  const [ex, ey, ez] = inp.eye
  const a = (bearing * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a)
  const maxD = inp.maxDistance ?? 25000
  let near = { angle: -90, label: 'nothing', distance: 0 }
  let far: Ray['far'] = null
  let d = 5
  const own = footprintAt(inp.idx, ex, ey)
  while (d <= maxD) {
    const x = ex + dx * d, y = ey + dy * d
    const t = inp.terrain(x, y)
    if (t != null) {
      const ang = elevAngle(t, ez, d)
      if (t >= inp.farMin) { if (!far || ang > far.angle) far = { angle: ang, height: t, distance: d } }
      else if (ang > near.angle) near = { angle: ang, label: 'terrain', distance: d }
    }
    if (d < 6000) {
      const i = footprintAt(inp.idx, x, y)
      if (i != null && i !== own && hasHeight(inp.heights, i)) {
        const ang = elevAngle(inp.heights!.roof[i], ez, d)
        if (ang > near.angle) near = { angle: ang, label: 'a building', distance: d }
      }
      for (const o of inp.towers) if (inRing([x, y], o.poly)) {
        const ang = elevAngle(o.top, ez, d)
        if (ang > near.angle) near = { angle: ang, label: o.label, distance: d }
      }
    }
    d += d < 1500 ? 5 : d < 6000 ? 15 : 60
  }
  return { bearing, near, far, farVisible: !!far && far.angle > near.angle }
}

/** Skyline profile around the full circle (every `step` degrees). */
export function skyline(inp: SkylineInput, step = 5): Ray[] {
  const out: Ray[] = []
  for (let b = 0; b < 360; b += step) out.push(castRay(inp, b))
  return out
}

/** Protected cones whose plan polygon the sightline crosses (eye to `length` metres along the bearing), nearest first. */
export function conesCrossed(eye: Pt, bearing: number, length: number, cones: { id: string; name: string; ring: Pt[] }[]): { id: string; name: string; from: number; inside: boolean }[] {
  const a = (bearing * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a)
  const out: { id: string; name: string; from: number; inside: boolean }[] = []
  for (const c of cones) {
    const inside = inRing(eye, c.ring)
    let first = inside ? 0 : Infinity
    for (let i = 0, j = c.ring.length - 1; i < c.ring.length; j = i++) {
      const [x1, y1] = c.ring[j], [x2, y2] = c.ring[i]
      const sx = x2 - x1, sy = y2 - y1, den = dx * sy - dy * sx
      if (Math.abs(den) < 1e-12) continue
      const t = ((x1 - eye[0]) * sy - (y1 - eye[1]) * sx) / den, u = ((x1 - eye[0]) * dy - (y1 - eye[1]) * dx) / den
      if (t >= 0 && t <= length && u >= 0 && u <= 1) first = Math.min(first, t)
    }
    if (first < Infinity) out.push({ id: c.id, name: c.name, from: first, inside })
  }
  return out.sort((p, q) => p.from - q.from)
}

/** Compass words for a bearing. */
export const compass = (b: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((b % 360) + 360) % 360) / 22.5) % 16]
