// Facade panel count (tool cycle 12, R7 tool 3 "panel sizes", R7_SYNTHESIS §2 facade row: "9 plate types" for C38c,
// "about 32 sloped facet sizes" for the Compass Turn, "4 plates + 1 groove panel" for the Datum Bundle). An embedded
// reading in the facade node: how many distinct panel sizes the form needs, how many faces slope, and how many are
// warped (not flat), read from the outlines every check already uses.
//
// Method (team): one panel = one face of one storey, slab to slab, before it is split into facade units. The toolkit
// holds each storey's outline at mid-height (imported and free-form storeys) or its block (parametric towers), so the
// outline at each slab is read from the storeys either side, face by face (faces matched by direction, within the
// twist reader's 15° per storey, and by distance):
// - where the outline moves steadily over two or more storeys (a slope, a morph, a turn), the slab edge lies half way;
// - where a movement starts or stops, the kink is put at the slab (the storey on the still side stays vertical, the
//   moving storey is extended along its own rate);
// - a movement in one storey only is a step at the slab: a terrace or an overhang, the panels either side vertical.
// A parametric Tapered shaft or Twisting tower is read as the smooth surface its blocks step along (its blocks group
// storeys when it has more than 48). Sizes count once for mirror images.
import { floorRing, readsStoreys, towerFloors } from './massing'
import { quadWarp } from './planMorph'
import { TWIST_MAX_PER_STOREY } from './twist'
import type { RuleResult, Tower } from './types'

type P = [number, number]

/** Two panels are one size when their parallel edges, height and skew agree within this (m, team assumption). */
export const PANEL_TOL = 0.01
/** A panel is flat when its fourth corner lies within this of the plane through the other three (m, team assumption). */
export const WARP_TOL = 0.01
/**
 * Width of one facade unit (m): the towers' declared 1.5 m unit (R7_SYNTHESIS §1, a design choice). A turning face warps
 * as a hyperbolic paraboloid, so a unit's warp is the face's times unit ÷ face width; flatness is judged per unit.
 */
export const UNIT = 1.5
/** A face leaning more than this from vertical counts as sloped (deg, team). */
export const SLOPE_MIN = 0.1
/** Faces shorter than this are left out, as the facade faces (m). */
export const MIN_FACE = 0.5
/** An outline point moving less than this between storeys is still (m; slicing noise). */
const STILL = 0.005
/** Rates of two storey bands are "steady" when their ratio lies within this factor (team). */
const STEADY = 4

interface Edge { a: P; b: P; L: number; nx: number; ny: number; ang: number; off: number; up?: Edge | null; down?: Edge | null; s: number }
interface Storey { z0: number; z1: number; mid: number; podium: boolean; edges: Edge[] }

export interface Panel {
  tower: string
  z0: number
  z1: number
  /** Widths of its bottom and top edges (m). */
  bottom: number
  top: number
  /** Height in its own plane (m) and the shift of its top along the face (m). */
  slant: number
  skew: number
  /** Lean from vertical (deg; positive leans in). */
  lean: number
  /** Out-of-plane offset of its fourth corner (m), and of one facade unit's (UNIT wide) within it. */
  warp: number
  unitWarp: number
}

export interface PanelReading {
  panels: Panel[]
  faces: number
  sizes: number
  sloped: number
  slopedSizes: number
  /** Faces whose facade units are warped (unit warp over WARP_TOL). */
  warped: number
  maxLean: number
  /** Largest warp of a facade unit and of a whole face (m). */
  maxUnitWarp: number
  maxWarp: number
}

const sub = (p: P, q: P): P => [p[0] - q[0], p[1] - q[1]]
const len = (p: P) => Math.hypot(p[0], p[1])
const sArea = (r: P[]) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2

/** Repeated and nearly collinear points dropped (1 cm, as the massing reader). */
function straight(ring: P[]): P[] {
  let r = ring.filter((p, i) => len(sub(p, ring[(i + 1) % ring.length])) > 0.01)
  for (let changed = true; changed && r.length > 3;) {
    changed = false
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], q = r[i], b = r[(i + 1) % r.length], L = len(sub(b, a))
      if (L < 1e-9 || Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / L < 0.01) { r = r.filter((_, k) => k !== i); changed = true; break }
    }
  }
  return r
}

/** Edges of a storey's rings; the outward normal is to the right of the ring's direction (outer rings counter-clockwise, holes clockwise). */
function edgesOf(rings: P[][], s: number): Edge[] {
  const out: Edge[] = []
  for (const ring of rings) {
    const r = straight(ring)
    if (r.length < 3) continue
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = len(sub(b, a))
      if (L < 0.01) continue
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L
      out.push({ a, b, L, nx, ny, ang: Math.atan2(ny, nx), off: a[0] * nx + a[1] * ny, s })
    }
  }
  return out
}

/** The storeys a tower's faces are read from: its storey outlines (imported) or its block at each floor (parametric). */
function storeysOf(t: Tower): Storey[] {
  if (readsStoreys(t)) {
    return (t.imported?.storeys ?? []).filter((s) => s.hasFloor && s.loops?.length).map((s, i) => ({ z0: s.z0, z1: s.z1, mid: (s.z0 + s.z1) / 2, podium: s.podium, edges: edgesOf(s.loops as P[][], i) }))
  }
  return towerFloors(t).map((f, i) => {
    const r = floorRing(t, f) as P[]
    return { z0: f.z0, z1: f.z1, mid: (f.z0 + f.z1) / 2, podium: f.podium, edges: edgesOf([sArea(r) < 0 ? [...r].reverse() : r], i) }
  })
}

const MAX_TURN = (TWIST_MAX_PER_STOREY * Math.PI) / 180
/** The face of the next storey this face continues into: same direction (within 15°), overlapping along it, nearest. */
function match(e: Edge, cands: Edge[]): Edge | null {
  const dx = (e.b[0] - e.a[0]) / e.L, dy = (e.b[1] - e.a[1]) / e.L
  let best: Edge | null = null, bc = Infinity
  for (const f of cands) {
    let d = Math.abs(f.ang - e.ang)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (d > MAX_TURN) continue
    const p0 = (f.a[0] - e.a[0]) * dx + (f.a[1] - e.a[1]) * dy, p1 = (f.b[0] - e.a[0]) * dx + (f.b[1] - e.a[1]) * dy
    if (Math.min(e.L, Math.max(p0, p1)) - Math.max(0, Math.min(p0, p1)) <= 1e-6) continue
    const c = Math.abs(f.off - e.off) + 0.1 * (len(sub(f.a, e.a)) + len(sub(f.b, e.b))) + e.L * d
    if (c < bc) { bc = c; best = f }
  }
  return best
}

interface Band { lo: Edge; hi: Edge; dz: number; ra: P; rb: P; still: boolean }
function band(lo: Edge | null | undefined, hi: Edge | null | undefined, st: Storey[]): Band | null {
  if (!lo || !hi) return null
  const dz = st[hi.s].mid - st[lo.s].mid, da = sub(hi.a, lo.a), db = sub(hi.b, lo.b)
  return { lo, hi, dz, ra: [da[0] / dz, da[1] / dz], rb: [db[0] / dz, db[1] / dz], still: len(da) < STILL && len(db) < STILL }
}
/** Two moving bands are steady when each outline point moves the same way at a rate within a factor of 4. */
function steady(x: Band, y: Band): boolean {
  for (const [p, q, mp, mq] of [[x.ra, y.ra, len(sub(x.hi.a, x.lo.a)), len(sub(y.hi.a, y.lo.a))], [x.rb, y.rb, len(sub(x.hi.b, x.lo.b)), len(sub(y.hi.b, y.lo.b))]] as [P, P, number, number][]) {
    if (mp < STILL && mq < STILL) continue
    if (mp < STILL || mq < STILL) return false
    const r = len(p) / len(q)
    if (p[0] * q[0] + p[1] * q[1] <= 0 || r > STEADY || r < 1 / STEADY) return false
  }
  return true
}
const along = (e: { a: P; b: P }, r: Band, dz: number) => ({ a: [e.a[0] + r.ra[0] * dz, e.a[1] + r.ra[1] * dz] as P, b: [e.b[0] + r.rb[0] * dz, e.b[1] + r.rb[1] * dz] as P })
const half = (e: Edge, f: Edge) => ({ a: [(e.a[0] + f.a[0]) / 2, (e.a[1] + f.a[1]) / 2] as P, b: [(e.b[0] + f.b[0]) / 2, (e.b[1] + f.b[1]) / 2] as P })

/**
 * The slab edges either side of the band lo → hi (lo's top, hi's bottom), at the slab between the two storeys: half way
 * where the outline moves steadily (`smooth`), at the slab where a movement starts or stops, a step where it moves in
 * one storey. With no storey beyond one side (the roof, a gap), a band steady with the other side reads as smooth.
 */
function slabEdges(B: Band, st: Storey[], smoothForm: boolean): { loTop: { a: P; b: P }; hiBottom: { a: P; b: P }; smooth: boolean } {
  const lo = B.lo, hi = B.hi, slab = st[lo.s].z1
  const below = band(lo.down, lo, st), above = band(hi, hi.up, st)
  const movingBelow = !!below && !below.still, movingAbove = !!above && !above.still
  const smooth = B.still || (smoothForm && !st[lo.s].podium && !st[hi.s].podium)
    || (movingBelow && (movingAbove || !above) && steady(B, below!)) || (movingAbove && (movingBelow || !below) && steady(B, above!))
  if (smooth) { const m = half(lo, hi); return { loTop: m, hiBottom: m, smooth } }
  return {
    loTop: movingBelow ? along(lo, below!, slab - st[lo.s].mid) : lo,
    hiBottom: movingAbove ? along(hi, above!, slab - st[hi.s].mid) : hi,
    smooth,
  }
}

const memo = new WeakMap<Tower, Panel[]>()
/** Every storey face of one tower as a panel (faces under 0.5 m left out). */
export function towerPanels(t: Tower): Panel[] {
  const hit = memo.get(t)
  if (hit) return hit
  const st = storeysOf(t)
  const smoothForm = !t.imported && (t.form?.type === 'taper' || t.form?.type === 'twist')
  const contiguous = (i: number) => i + 1 < st.length && Math.abs(st[i].z1 - st[i + 1].z0) < 0.05
  for (let i = 0; i < st.length; i++) for (const e of st[i].edges) {
    e.up = contiguous(i) ? match(e, st[i + 1].edges) : null
    e.down = i > 0 && contiguous(i - 1) ? match(e, st[i - 1].edges) : null
  }
  const out: Panel[] = []
  for (const s of st) for (const e of s.edges) {
    if (e.L < MIN_FACE) continue
    const dn = band(e.down, e, st), up = band(e, e.up, st)
    const below = dn && slabEdges(dn, st, smoothForm), above = up && slabEdges(up, st, smoothForm)
    // no storey on one side (the ground, the roof, a face that starts): carry on along the other side's steady movement
    // (not for a parametric form, whose grouped blocks move unevenly from one storey to the next)
    const B = below ? below.hiBottom : !smoothForm && up && !up.still && above?.smooth ? along(e, up, s.z0 - s.mid) : e
    const T = above ? above.loTop : !smoothForm && dn && !dn.still && below?.smooth ? along(e, dn, s.z1 - s.mid) : e
    const h = s.z1 - s.z0
    const mb: P = [(B.a[0] + B.b[0]) / 2, (B.a[1] + B.b[1]) / 2], mt: P = [(T.a[0] + T.b[0]) / 2, (T.a[1] + T.b[1]) / 2]
    const shift = sub(mt, mb), inward = -(shift[0] * e.nx + shift[1] * e.ny), skew = Math.abs((shift[0] * (e.b[0] - e.a[0]) + shift[1] * (e.b[1] - e.a[1])) / e.L)
    const bottom = len(sub(B.b, B.a)), top = len(sub(T.b, T.a))
    const warp = quadWarp([B.a[0], B.a[1], s.z0], [B.b[0], B.b[1], s.z0], [T.b[0], T.b[1], s.z1], [T.a[0], T.a[1], s.z1])
    out.push({
      tower: t.id, z0: s.z0, z1: s.z1, bottom, top, slant: Math.hypot(h, inward), skew, lean: (Math.atan2(inward, h) * 180) / Math.PI,
      warp, unitWarp: warp * Math.min(1, UNIT / Math.max(bottom, top, 1e-9)),
    })
  }
  memo.set(t, out)
  return out
}

/** A panel's size, mirror images and up-down flips counted once (10 mm steps). */
const sizeKey = (p: Panel) => [Math.min(p.bottom, p.top), Math.max(p.bottom, p.top), p.slant, p.skew].map((v) => Math.round(v / PANEL_TOL)).join(',') + (p.unitWarp > WARP_TOL ? 'w' : '')

/** The panel count over every tower: storey faces, distinct sizes, sloped faces and their sizes, warped faces. */
export function panelReading(towers: Tower[]): PanelReading {
  const panels = towers.flatMap(towerPanels)
  const sloped = panels.filter((p) => Math.abs(p.lean) > SLOPE_MIN)
  return {
    panels, faces: panels.length, sizes: new Set(panels.map(sizeKey)).size, sloped: sloped.length, slopedSizes: new Set(sloped.map(sizeKey)).size,
    warped: panels.filter((p) => p.unitWarp > WARP_TOL).length, maxLean: panels.reduce((m, p) => Math.max(m, Math.abs(p.lean)), 0),
    maxUnitWarp: panels.reduce((m, p) => Math.max(m, p.unitWarp), 0), maxWarp: panels.reduce((m, p) => Math.max(m, p.warp), 0),
  }
}

const SOURCE = { label: 'Team method (tool cycle 12, R7 tool 3): faces read from the storey outlines the checks use; R7_SYNTHESIS §2 facade row' }

/** The facade node's panel lines: sizes (a reading) and flat panels (warn when any face is warped). */
export function panelLines(r: PanelReading): RuleResult[] {
  const mm = (v: number) => `${Math.round(v * 1000).toLocaleString()} mm`
  return [
    {
      id: 'fa-panels', label: 'Facade panel sizes',
      value: `${r.sizes} size${r.sizes === 1 ? '' : 's'} over ${r.faces.toLocaleString()} storey faces · ${r.sloped ? `${r.sloped.toLocaleString()} sloped face${r.sloped === 1 ? '' : 's'} in ${r.slopedSizes} size${r.slopedSizes === 1 ? '' : 's'}, up to ${r.maxLean.toFixed(1)}°` : 'no sloped faces'}`,
      threshold: 'a reading, no limit: one panel per face per storey; sizes equal within 10 mm, a face leaning over 0.1° counts as sloped (team assumptions)',
      state: 'unknown', flag: 'team_assumption', source: SOURCE,
      note: 'Before the faces are split into facade units. Slab edges come from the storey outlines either side: half way where the outline moves steadily (a slope, morph or turn over two or more storeys), at the slab where a movement starts or stops, and a step (a terrace or overhang) where it moves in one storey only. Mirror images count once; faces under 0.5 m are left out.',
    },
    {
      id: 'fa-planar', label: 'Flat facade panels',
      value: r.warped ? `${r.warped.toLocaleString()} of ${r.faces.toLocaleString()} storey faces warped: a 1.5 m unit up to ${mm(r.maxUnitWarp)} out of plane (a whole face ${mm(r.maxWarp)})` : `All ${r.faces.toLocaleString()} storey faces flat in 1.5 m units`,
      threshold: 'flat: each 1.5 m facade unit’s fourth corner within 10 mm of the plane through the other three (team assumption; the unit is the towers’ declared width)',
      state: r.warped ? 'warn' : 'pass', flag: 'team_assumption', source: SOURCE,
      note: 'A warped unit needs cold-bent or curved glass, or splitting into flat triangles. A turn warps the faces it reaches: a 1.5 m unit by about 1.5 m × the turn per storey in radians, so a turn of about 0.4° a storey reaches 10 mm. A plan morph between shapes with the same edge directions (a square to its octagon) keeps every face flat.',
      ...(r.warped ? { specialist: 'Warped panels: a facade engineer sets how far the glass may be cold-bent.' } : {}),
    },
  ]
}
