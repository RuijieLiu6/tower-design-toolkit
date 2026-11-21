// Terraces, roofs and open storeys at height, found from a tower's storey outlines (research R5 §1.1, tool gap G4).
//
// Each storey's plate is compared with the plate of the storey above it: the part not covered is a deck at the top of
// the storey (an imported tower: the storey outlines it stores; a parametric tower: the blocks at each floor, so block
// tops and setbacks). A deck edge on the lower plate's outline is open (the drop); an edge on the upper plate's outline
// is a wall rising from the deck, and how far it rises is read up the storeys. A deck that a higher plate covers again
// (an open storey whose plate is the core only, a loggia, a cantilever) has a slab above it. Deck types as R5:
//   roof (T1): open to the sky, nothing rising from it;
//   setback (T2): open to the sky, a tower face rising over one or more of its edges;
//   openStorey (T3): slab above, open on two opposite sides or all round;
//   loggia (T4): slab above, open on one side.
// Team assumptions (labelled): a deck counts from 10 m² and a mean width (2 × area / perimeter) of 1.5 m, so the slivers
// a taper or twist leaves at each storey are not read as terraces; a deck is covered when a higher plate lies over more
// than half its sample points; sample points sit on a 2 m grid (R5 §1.3), coarser on decks over 1,600 m² so each deck
// keeps at most 400 points.
import { pc, type MultiPoly, type Poly } from '../../vendor/polygon-clipping'
import { blockSpans } from '../blocks'
import { towerFloors, towerMasses } from '../massing'
import type { DeckUse, Tower } from '../types'

type Pt = [number, number]
export type DeckType = 'roof' | 'setback' | 'openStorey' | 'loggia'
export interface DeckEdge {
  a: Pt
  b: Pt
  L: number
  /** Open (the drop at the deck's edge) or closed (a wall of the storey above rising from the deck). */
  open: boolean
  /** Outward normal of the deck at this edge, true azimuth (degrees clockwise from true north). */
  az: number
  /** A closed edge: how far the wall rises above the deck (m). */
  dH?: number
}
export interface Deck {
  id: string
  towerId: string
  tower: string
  /** The storey whose floor the deck is (a roof: one above the top storey). */
  level: number
  /** Deck level above grade (m). */
  z: number
  type: DeckType
  /** Open edges face every way (no gap over 120° between their facings). */
  allRound: boolean
  area: number
  /** The outline, outer ring first then holes (project frame, outer counter-clockwise). */
  rings: Pt[][]
  edges: DeckEdge[]
  /** Headroom to the slab above (m); null when open to the sky. */
  cover: number | null
  /** Sample points (project frame) and their grid spacing (m). */
  pts: Pt[]
  step: number
}

/** One storey's plate in the project frame (a parametric tower: one per block interval, `top` its last floor's level). */
export interface Slab { level: number; z0: number; z1: number; poly: MultiPoly; key: string; top?: number }

export const DECK_MIN_AREA = 10, DECK_MIN_WIDTH = 1.5, DECK_MAX_PTS = 400, DECK_STEP = 2

const area = (r: Pt[]) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2 } // > 0 counter-clockwise
const open = (r: Pt[]): Pt[] => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r)
const keyOf = (rings: Pt[][]) => JSON.stringify(rings.map((r) => r.map(([x, y]) => [Math.round(x * 100), Math.round(y * 100)])))
function unionOf(rings: Pt[][]): MultiPoly {
  if (!rings.length) return []
  if (rings.length === 1) return [[rings[0]]]
  return (pc.union as unknown as (...g: Poly[]) => MultiPoly)(...rings.map((r) => [r] as Poly))
}

/** A tower's storey plates bottom-up: an imported tower's storey outlines, else its blocks at each floor. */
export function storeySlabs(t: Tower): Slab[] {
  const st = t.imported?.storeys?.filter((s) => s.loops?.length) ?? []
  if (t.imported && st.length) {
    const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const place = (r: [number, number][]): Pt[] => r.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
    const memo = new Map<string, MultiPoly>()
    return [...st].sort((p, q) => p.z0 - q.z0).filter((x) => x.z1 > 0).map((x) => {
      const loops = x.loops.filter((r) => r.length >= 3).map(place)
      const key = keyOf(loops)
      let poly = memo.get(key)
      if (!poly) {
        const outers = loops.filter((r) => area(r) > 0), holes = loops.filter((r) => area(r) < 0)
        poly = unionOf(outers)
        if (poly.length && holes.length) poly = (pc.difference as unknown as (...g: (Poly | MultiPoly)[]) => MultiPoly)(poly, ...holes.map((h) => [h] as Poly))
        memo.set(key, poly)
      }
      return { level: x.level, z0: x.z0, z1: x.z1, poly, key }
    })
  }
  if (t.imported) return towerMasses(t).map((m, i) => ({ level: i + 1, z0: m.z0, z1: m.z1, poly: [[m.ring as Pt[]]], key: keyOf([m.ring as Pt[]]) }))
  // A parametric tower: one slab between each pair of block tops and bottoms, so a deck sits at its block's top even
  // where the floors do not meet it; each slab takes the level of the first floor standing in it.
  const spans = blockSpans(t).filter((s) => s.z1 > s.z0)
  const floors = towerFloors(t).filter((f) => f.z1 > 0)
  const zs = [...new Set(spans.flatMap((s) => [s.z0, s.z1]).map((z) => Math.round(z * 1000) / 1000))].filter((z) => z >= 0).sort((a, b) => a - b)
  const out: Slab[] = []
  for (let k = 0; k + 1 < zs.length; k++) {
    const z0 = zs[k], z1 = zs[k + 1], mid = (z0 + z1) / 2
    const rings = spans.filter((s) => s.z0 <= mid && mid < s.z1).map((s) => s.ring as Pt[])
    if (!rings.length) continue
    const inside = floors.filter((x) => (x.z0 + x.z1) / 2 >= z0 && (x.z0 + x.z1) / 2 < z1)
    const f = inside[0] ?? floors.find((x) => x.z1 > z0)
    out.push({ level: f?.level ?? floors.length + 1, z0, z1, poly: unionOf(rings), key: keyOf(rings), top: inside.length ? inside[inside.length - 1].level : f?.level })
  }
  return out
}

/** Point inside a polygon with holes (even-odd over all its rings). */
export function inPoly(p: Pt, poly: Poly): boolean {
  let o = false
  for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o
  }
  return o
}
export const inMulti = (p: Pt, m: MultiPoly) => m.some((poly) => inPoly(p, poly))
/** Distance from a point to a segment. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey
  const k = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2)) : 0
  return Math.hypot(p[0] - a[0] - ex * k, p[1] - a[1] - ey * k)
}
function boundaryDist(p: Pt, m: MultiPoly): number {
  let d = Infinity
  for (const poly of m) for (const r0 of poly) { const r = open(r0 as Pt[]); for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % r.length])) }
  return d
}
/** True azimuth of a project-frame direction (dx, dy), with true north `northDeg` clockwise from +y. */
export const trueAz = (dx: number, dy: number, northDeg: number) => ((((Math.atan2(dx, dy) * 180) / Math.PI - northDeg) % 360) + 360) % 360
/** Smallest angle between two azimuths (0–180°). */
export const angDiff = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return d > 180 ? 360 - d : d }

/** Sample points of a deck on a square grid (2 m, coarser on big decks), at least one. */
function samplePoints(rings: Pt[][], a: number): { pts: Pt[]; step: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  let step = Math.max(DECK_STEP, Math.sqrt(a / DECK_MAX_PTS))
  for (let pass = 0; pass < 3; pass++, step /= 2) {
    const pts: Pt[] = []
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) if (inPoly([x, y], rings)) pts.push([x, y])
    if (pts.length) return { pts, step }
  }
  // a very thin deck: the middle of its longest edge, a little inside
  const r = rings[0]
  let best = 0, bl = -1
  for (let i = 0; i < r.length; i++) { const b = r[(i + 1) % r.length], l = Math.hypot(b[0] - r[i][0], b[1] - r[i][1]); if (l > bl) { bl = l; best = i } }
  const a0 = r[best], b0 = r[(best + 1) % r.length], L = Math.max(1e-9, bl)
  return { pts: [[(a0[0] + b0[0]) / 2 - ((b0[1] - a0[1]) / L) * 0.25, (a0[1] + b0[1]) / 2 + ((b0[0] - a0[0]) / L) * 0.25]], step: 1 }
}

/**
 * Every roof, terrace and open storey of a tower. `northDeg` is true north clockwise from the project frame's +y (0 in
 * Real Vancouver, 45 on the competition site).
 */
export function towerDecks(t: Tower, northDeg: number): Deck[] {
  const slabs = storeySlabs(t)
  const out: Deck[] = []
  for (let i = 0; i < slabs.length; i++) {
    const S = slabs[i], U = slabs[i + 1] && Math.abs(slabs[i + 1].z0 - S.z1) < 0.05 ? slabs[i + 1] : null
    if (!S.poly.length || (U && U.key === S.key)) continue
    const D: MultiPoly = U && U.poly.length ? pc.difference(S.poly, U.poly) : S.poly
    let k = 0
    for (const piece of D) {
      // outer ring counter-clockwise, holes clockwise, so the right-hand normal of every edge points out of the deck
      const rings = piece.map((r0, ri) => { const r = open(r0 as Pt[]); const ccw = area(r) > 0; return ri === 0 ? (ccw ? r : [...r].reverse()) : ccw ? [...r].reverse() : r })
      const A = area(rings[0]) + rings.slice(1).reduce((s, r) => s + area(r), 0)
      let per = 0
      for (const r of rings) for (let q = 0; q < r.length; q++) { const b = r[(q + 1) % r.length]; per += Math.hypot(b[0] - r[q][0], b[1] - r[q][1]) }
      if (A < DECK_MIN_AREA || (2 * A) / Math.max(per, 1e-9) < DECK_MIN_WIDTH) continue
      const edges: DeckEdge[] = []
      for (const r of rings) for (let q = 0; q < r.length; q++) {
        const a = r[q], b = r[(q + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy)
        if (L < 1e-6) continue
        const nx = dy / L, ny = -dx / L, mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const isOpen = !U || boundaryDist(mid, U.poly) > 0.05
        const e: DeckEdge = { a, b, L, open: isOpen, az: trueAz(nx, ny, northDeg) }
        if (!isOpen) {
          // how far the wall rises: up the storeys while they still hold a point just inside it
          const q2: Pt = [mid[0] + nx * 0.5, mid[1] + ny * 0.5]
          let top = S.z1
          for (let j = i + 1; j < slabs.length && inMulti(q2, slabs[j].poly); j++) top = slabs[j].z1
          e.dH = top - S.z1
        }
        edges.push(e)
      }
      const { pts, step } = samplePoints(rings, A)
      // a slab above: a higher plate over more than half the sample points
      const covers: number[] = []
      for (const p of pts) for (let j = i + 1; j < slabs.length; j++) if (inMulti(p, slabs[j].poly)) { covers.push(slabs[j].z0 - S.z1); break }
      const cover = covers.length > pts.length / 2 ? covers.sort((a, b) => a - b)[Math.floor(covers.length / 2)] : null
      const openAz = edges.filter((e) => e.open && e.L >= 1).map((e) => e.az).sort((a, b) => a - b)
      let gap = openAz.length ? 360 - openAz[openAz.length - 1] + openAz[0] : 360
      for (let q = 1; q < openAz.length; q++) gap = Math.max(gap, openAz[q] - openAz[q - 1])
      const opposite = openAz.some((x) => openAz.some((y) => angDiff(x, y) >= 135))
      const type: DeckType = cover != null ? (opposite ? 'openStorey' : 'loggia') : edges.some((e) => !e.open && (e.dH ?? 0) > 0.5) ? 'setback' : 'roof'
      const level = U ? U.level : (S.top ?? S.level) + 1
      out.push({ id: `${t.id}-L${level}${k ? `-${k + 1}` : ''}`, towerId: t.id, tower: t.name, level, z: S.z1, type, allRound: openAz.length > 0 && gap <= 120, area: A, rings, edges, cover, pts, step })
      k++
    }
  }
  return out
}

const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/**
 * The way a deck faces (true azimuth, degrees): the length-weighted outward normal of its open edges; where they cancel
 * (open on opposite sides), away from the walls rising from it; null where both cancel (a roof open all round, a ring
 * around a core).
 */
export function deckFacingAz(d: Deck): number | null {
  const sum = (es: DeckEdge[], sign: number) => {
    let x = 0, y = 0, L = 0
    for (const e of es) { const a = (e.az * Math.PI) / 180; x += sign * e.L * Math.sin(a); y += sign * e.L * Math.cos(a); L += e.L }
    return L > 0 && Math.hypot(x, y) > 0.1 * L ? ((((Math.atan2(x, y) * 180) / Math.PI) % 360) + 360) % 360 : null
  }
  return sum(d.edges.filter((e) => e.open), 1) ?? sum(d.edges.filter((e) => !e.open), -1)
}
/** The deck's facing as one of eight compass words, or null (see deckFacingAz). */
export function deckFacing(d: Deck): string | null {
  const az = deckFacingAz(d)
  return az == null ? null : C8[Math.round(az / 45) % 8]
}
/**
 * What a deck is for (`Tower.deckUses`, gaps G25 and G32): an entry at the deck's level whose facing matches it (a compass
 * word, or degrees within 22.5°), else one at that level with no facing; null when none applies (the deck is occupied).
 */
export function deckUseOf(t: Pick<Tower, 'deckUses'>, d: Deck): DeckUse | null {
  const at = (t.deckUses ?? []).filter((u) => u && u.level === d.level)
  if (!at.length) return null
  const az = deckFacingAz(d), word = az == null ? null : C8[Math.round(az / 45) % 8]
  const faces = (f: string) => { const n = Number(f); return Number.isFinite(n) && f.trim() !== '' ? az != null && angDiff(n, az) <= 22.5 : word != null && f.trim().toUpperCase() === word }
  return at.find((u) => u.facing != null && u.facing.trim() !== '' && faces(u.facing)) ?? at.find((u) => u.facing == null || u.facing.trim() === '') ?? null
}
