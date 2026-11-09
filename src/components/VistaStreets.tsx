// Context style roads: Vista's OpenStreetMap street network (public/data/vista_streets.json, tools/build_vista_streets.py;
// (c) OpenStreetMap contributors, ODbL) as asphalt carriageways with centre dashes, paving sidewalks and illustrative
// bridge decks, after Vista's streetscape.js and traffic-network.js. Widths, sidewalks and deck heights are estimates.
// Since 9 Nov the strips on the ground are draped on the terrain as drawn (lib/terrainDrape.ts): before, 12 m patches
// set at their corners' ground let the drawn ground show through the asphalt. Round joins fill the outside of every bend
// and corner (streetJoins).
import { dataFetch } from '../lib/loadProgress'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Manifest } from '../lib/cityLayers'
import { contextPavingMaterial, type VistaTextures } from './ContextStyle'
import { drapePolygon, stripPolygon, type DrapeStats, type DrawnSurface } from '../lib/terrainDrape'

export interface Streets { seg: Float32Array; width: Float32Array; bits: Uint8Array; way: Uint32Array; count: number }
export const DECK = 1, LEFT = 2, RIGHT = 4, MAJOR = 8
/** Vista's surface offsets above the ground (m); sidewalks go under the asphalt so overlaps at corners show asphalt. */
const LIFT = { asphalt: 0.035, sidewalk: 0.02, marking: 0.065 }
const PATCH = 12, SIDEWALK = 2.4, DASH = 3, DASH_EVERY = 18, DASH_WIDTH = 0.15, DECK_DEPTH = 1.4, DECK_RAMP = 5, DECK_CLEAR = 0.5

let cache: Promise<Streets | null> | null = null
/** The street layer, read once (null when the manifest has none). */
export function loadStreets(manifest: Manifest): Promise<Streets | null> {
  cache ??= (async () => {
    const layer = manifest.layers.find((l) => l.id === 'vista_streets')
    if (!layer) return null
    const r = await dataFetch(layer.file, 'streets')
    if (!r.ok) throw new Error(`${layer.file}: HTTP ${r.status}`)
    const j = (await r.json()) as { version: number; origin: number[]; segments: number[][] }
    if (j.version !== 1 || j.origin[0] !== 491300 || j.origin[1] !== 5458600) throw new Error('Vista streets: unsupported frame')
    const n = j.segments.length
    const out: Streets = { seg: new Float32Array(n * 4), width: new Float32Array(n), bits: new Uint8Array(n), way: new Uint32Array(n), count: n }
    j.segments.forEach((s, i) => { for (let k = 0; k < 4; k++) out.seg[i * 4 + k] = s[k] / 10; out.width[i] = s[4] / 10; out.bits[i] = s[5]; out.way[i] = s[6] })
    return out
  })()
  cache.catch(() => { cache = null })
  return cache
}

const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`

/**
 * Deck heights at both ends of every deck segment. Ends shared with a road on the ground are anchors at the ground
 * there; the rest of each deck is a harmonic (length-weighted) interpolation between them, never less than 1 m above
 * the ground or the sea under it. A deck with no approach (cut by the model's edge) stands 5 m above its ground.
 * Along each deck, the straight run between its ends also clears the ground under it by `clear` (sampled every metre;
 * 9 Nov: a waterfront deck ran up to 2.4 m into the drawn ground just past its approach): its free ends are raised as
 * far as needed, never its anchors, so it still meets the roads on the ground where they join. The clearance ramps up
 * from nothing at an anchor to `clear` 5 m away (a deck leaves its approach on the ground).
 */
export function deckHeights(s: Streets, ground: (x: number, y: number) => number, clear = DECK_CLEAR): Float32Array {
  const z = new Float32Array(s.count * 2).fill(NaN)
  const nodes = new Map<string, { x: number; y: number; z: number; anchor: boolean; edges: [string, number][] }>()
  const node = (x: number, y: number) => { const k = key(x, y); let v = nodes.get(k); if (!v) { v = { x, y, z: NaN, anchor: false, edges: [] }; nodes.set(k, v) } return [k, v] as const }
  const onGround = new Set<string>()
  for (let i = 0; i < s.count; i++) {
    const [ax, ay, bx, by] = s.seg.subarray(i * 4, i * 4 + 4)
    if (!(s.bits[i] & DECK)) { onGround.add(key(ax, ay)); onGround.add(key(bx, by)); continue }
    const [ka, a] = node(ax, ay), [kb, b] = node(bx, by), w = 1 / Math.max(0.5, Math.hypot(bx - ax, by - ay))
    a.edges.push([kb, w]); b.edges.push([ka, w])
  }
  for (const [k, v] of nodes) { v.anchor = onGround.has(k); v.z = ground(v.x, v.y) + (v.anchor ? 0 : 5) }
  const free = [...nodes.values()].filter((v) => !v.anchor)
  for (let it = 0; it < 300; it++) {
    for (const v of free) {
      let sw = 0, sz = 0
      for (const [k, w] of v.edges) { sw += w; sz += w * nodes.get(k)!.z }
      if (sw) v.z = sz / sw
    }
  }
  for (const v of nodes.values()) v.z = Math.max(v.z, Math.max(0, ground(v.x, v.y)) + (v.anchor ? 0 : 1))
  // Clearance along each deck: raise the free end(s) so the straight run stays `clear` above the ground under it. Only
  // upward, a few rounds, since a raised node changes its neighbours' runs too.
  for (let round = 0; round < 4; round++) {
    let moved = false
    for (let i = 0; i < s.count; i++) {
      if (!(s.bits[i] & DECK)) continue
      const ax = s.seg[i * 4], ay = s.seg[i * 4 + 1], bx = s.seg[i * 4 + 2], by = s.seg[i * 4 + 3], len = Math.hypot(bx - ax, by - ay)
      if (!(len > 1e-3)) continue
      const a = nodes.get(key(ax, ay))!, b = nodes.get(key(bx, by))!
      if (a.anchor && b.anchor) continue
      const n = Math.max(2, Math.ceil(len))
      let needA = a.z, needB = b.z
      for (let k = 1; k < n; k++) {
        const t = k / n, ramp = Math.min(1, (a.anchor ? t * len : Infinity) / DECK_RAMP, (b.anchor ? (1 - t) * len : Infinity) / DECK_RAMP)
        const g = Math.max(0, ground(ax + (bx - ax) * t, ay + (by - ay) * t)) + clear * ramp, z = a.z + (b.z - a.z) * t
        if (z >= g) continue
        // raise the free end(s): one free end takes the whole deficit, two free ends rise together
        if (a.anchor) needB = Math.max(needB, a.z + (g - a.z) / t)
        else if (b.anchor) needA = Math.max(needA, b.z + (g - b.z) / (1 - t))
        else { needA = Math.max(needA, a.z + (g - z)); needB = Math.max(needB, b.z + (g - z)) }
      }
      if (needA > a.z + 1e-6) { a.z = needA; moved = true }
      if (needB > b.z + 1e-6) { b.z = needB; moved = true }
    }
    if (!moved) break
  }
  for (let i = 0; i < s.count; i++) {
    if (!(s.bits[i] & DECK)) continue
    z[i * 2] = nodes.get(key(s.seg[i * 4], s.seg[i * 4 + 1]))!.z
    z[i * 2 + 1] = nodes.get(key(s.seg[i * 4 + 2], s.seg[i * 4 + 3]))!.z
  }
  return z
}

type Builder = number[]
/** A flat strip between offsets o0 and o1 across a segment, from t0 to t1 along it, with heights per corner (decks). */
function strip(b: Builder, ax: number, ay: number, ux: number, uy: number, len: number, t0: number, t1: number, o0: number, o1: number, h: (x: number, y: number, t: number) => number) {
  const nx = -uy, ny = ux
  const p = (t: number, o: number) => { const x = ax + ux * len * t + nx * o, y = ay + uy * len * t + ny * o; return [x, y, h(x, y, t)] }
  const a = p(t0, o0), c = p(t1, o0), d = p(t1, o1), e = p(t0, o1)
  b.push(...a, ...c, ...d, ...a, ...d, ...e)
}
/** Positions only: the road materials shade flat (normals from the surface itself, so a draped piece shades as its terrain triangle). */
const geometry = (b: Builder) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b, 3))
  g.computeBoundingSphere()
  return g
}

/**
 * The drawn terrain the roads drape on (lib/terrainDrape.ts), in three parts so the roads change detail with the ground:
 * `outside`, the 30 m top outside the 1 m patches (drawn at both details); `near`, the 1 m patches (drawn up close);
 * `far`, the 30 m top where the patches are (drawn from afar). `ground` gives the drawn height at each detail, for the
 * ends of bridge decks.
 */
export interface StreetDrape {
  outside: DrawnSurface; near: DrawnSurface; far: DrawnSurface
  ground: { near: (x: number, y: number) => number; far: (x: number, y: number) => number }
  /** Whether a box lies on the drawn surfaces above (else, off the model's top, the strip follows `ground.near` as before). */
  onTop?: (x0: number, y0: number, x1: number, y1: number) => boolean
}
type Layers = { asphalt: Builder; sidewalk: Builder; marking: Builder; sides: Builder }
const layers = (): Layers => ({ asphalt: [], sidewalk: [], marking: [], sides: [] })
export type StreetSet = Record<keyof Layers, THREE.BufferGeometry>

/** A round join is fanned in pieces at most this wide (radians); wedges narrower than JOIN_MIN are left (under 2 cm at 5 m). */
const JOIN_STEP = Math.PI / 12, JOIN_MIN = (0.2 * Math.PI) / 180, SAME_WAY = 0.01

/**
 * Round joins where street pieces meet at an angle. Every piece is a rectangle cut square at its ends, so at a bend or a
 * corner the outside of the turn was left open: a wedge of ground showed between the two pieces' asphalt and sidewalks
 * (9 Nov: light teeth along curves, V notches where streets end at a park; 43,000 of the 87,000 two-piece joints in the
 * network bend 2 degrees or more). At each shared end, for every pair of neighbouring pieces (counter-clockwise) more than
 * a half turn apart, this fans the open wedge from one piece's edge to the next about the shared end (the radius going
 * from one half width to the other), and the sidewalk wedge too where both pieces have a sidewalk on that side. Inside
 * a turn the rectangles already overlap, so nothing is added there. Dead ends stay square. Only pieces `use` accepts
 * (the draped ones; decks keep their own heights) and sidewalks only of pieces `detailed` accepts. Returns flat polygons
 * (x, y lists, counter-clockwise), each convex.
 */
export function streetJoins(s: Streets, use: (i: number) => boolean, detailed: (i: number) => boolean) {
  const at = new Map<string, number[]>()
  for (let i = 0; i < s.count; i++) {
    if (!use(i)) continue
    for (const e of [0, 1]) {
      const k = key(s.seg[i * 4 + e * 2], s.seg[i * 4 + e * 2 + 1])
      let l = at.get(k)
      if (!l) at.set(k, (l = []))
      l.push(i * 2 + e)
    }
  }
  const asphalt: number[][] = [], sidewalk: number[][] = []
  for (const ends of at.values()) {
    if (ends.length < 2) continue
    type Arm = { x: number; y: number; a: number; half: number; left: boolean; right: boolean }
    const all: Arm[] = ends.map((code) => {
      const i = code >> 1, e = code & 1, o = 1 - e
      const x = s.seg[i * 4 + e * 2], y = s.seg[i * 4 + e * 2 + 1], d = detailed(i)
      // an arm points away from the shared end: a piece that ends here runs backwards, so its sides swap
      const left = e === 0 ? LEFT : RIGHT, right = e === 0 ? RIGHT : LEFT
      return { x, y, a: Math.atan2(s.seg[i * 4 + o * 2 + 1] - y, s.seg[i * 4 + o * 2] - x), half: s.width[i] / 2, left: d && (s.bits[i] & left) !== 0, right: d && (s.bits[i] & right) !== 0 }
    }).sort((p, q) => p.a - q.a)
    // pieces drawn twice (or nearly on top of each other) are one arm: the wider, with either one's sidewalks
    const arms: Arm[] = []
    for (const r of all) {
      const last = arms[arms.length - 1]
      if (last && r.a - last.a < SAME_WAY) { last.half = Math.max(last.half, r.half); last.left ||= r.left; last.right ||= r.right } else arms.push({ ...r })
    }
    if (arms.length > 1 && arms[0].a + 2 * Math.PI - arms[arms.length - 1].a < SAME_WAY) {
      const f = arms.shift()!, l = arms[arms.length - 1]
      l.half = Math.max(l.half, f.half); l.left ||= f.left; l.right ||= f.right
    }
    if (arms.length < 2) continue
    for (let k = 0; k < arms.length; k++) {
      const p = arms[k], q = arms[(k + 1) % arms.length]
      const sweep = q.a - p.a + (k === arms.length - 1 ? 2 * Math.PI : 0) - Math.PI
      if (sweep <= JOIN_MIN) continue
      fan(asphalt, p.x, p.y, p.a + Math.PI / 2, sweep, p.half, q.half)
      if (p.left && q.right) fan(sidewalk, p.x, p.y, p.a + Math.PI / 2, sweep, p.half + SIDEWALK, q.half + SIDEWALK)
    }
  }
  return { asphalt, sidewalk }
}
/**
 * The wedge about (x, y) from angle a0 through `sweep`, the radius going from r0 to r1: one convex polygon (the centre
 * and its arc) when the radius stays the same (pieces of one width; under a half turn), else one triangle per step.
 */
function fan(out: number[][], x: number, y: number, a0: number, sweep: number, r0: number, r1: number) {
  const n = Math.max(1, Math.ceil(sweep / JOIN_STEP))
  const at = (k: number) => { const t = k / n, a = a0 + sweep * t, r = r0 + (r1 - r0) * t; return [x + Math.cos(a) * r, y + Math.sin(a) * r] }
  if (Math.abs(r1 - r0) < 1e-6) {
    const poly = [x, y]
    for (let k = 0; k <= n; k++) poly.push(...at(k))
    out.push(poly)
    return
  }
  let prev = at(0)
  for (let k = 1; k <= n; k++) { const cur = at(k); out.push([x, y, ...prev, ...cur]); prev = cur }
}

/**
 * Carriageways everywhere; sidewalks and centre dashes only within `detail` metres of `centre` (Vista draws its detail
 * around the viewpoint too). Every strip on the ground is draped on the drawn terrain (exact to its triangles, plus LIFT);
 * bridge decks keep their own heights (deckHeights), anchored at the drawn ground of each detail. Segments of no length
 * or with non-finite coordinates are left out.
 */
export function streetGeometry(s: Streets, drape: StreetDrape, centre: [number, number], detail: number) {
  const decks = { near: deckHeights(s, drape.ground.near), far: deckHeights(s, drape.ground.far) }
  const out = { outside: layers(), near: layers(), far: layers() }
  const stats = { segments: 0, skipped: 0, joins: 0, pieces: 0, triangles: 0 }
  // which pieces are draped on the ground (and which with sidewalks), for the round joins between them
  const draped = new Uint8Array(s.count), near = new Uint8Array(s.count)
  const st: DrapeStats = { pieces: 0, triangles: 0 }
  const onGround = (poly: number[], lift: number, layer: Exclude<keyof Layers, 'sides'>) => {
    drapePolygon(poly, drape.outside, lift, out.outside[layer], st)
    drapePolygon(poly, drape.near, lift, out.near[layer], st)
    drapePolygon(poly, drape.far, lift, out.far[layer], st)
  }
  for (let i = 0; i < s.count; i++) {
    const ax = s.seg[i * 4], ay = s.seg[i * 4 + 1], bx = s.seg[i * 4 + 2], by = s.seg[i * 4 + 3], len = Math.hypot(bx - ax, by - ay)
    if (!(len > 1e-3) || ![ax, ay, bx, by, s.width[i]].every(Number.isFinite) || !(s.width[i] > 0)) { stats.skipped++; continue }
    stats.segments++
    const ux = (bx - ax) / len, uy = (by - ay) / len, half = s.width[i] / 2
    const deck = (s.bits[i] & DECK) !== 0
    const detailed = Math.hypot((ax + bx) / 2 - centre[0], (ay + by) / 2 - centre[1]) <= detail
    const major = detailed && (s.bits[i] & MAJOR) !== 0 && s.width[i] >= 7
    // A world-aligned dash phase, so collinear segments do not restart the pattern (Vista streetscape.js).
    const dashes: [number, number][] = []
    if (major) {
      const start = ax * ux + ay * uy, end = start + len
      for (let k = Math.floor(start / DASH_EVERY); k * DASH_EVERY < end; k++) {
        const a = Math.max(start, k * DASH_EVERY), b = Math.min(end, k * DASH_EVERY + DASH)
        if (b - a >= 0.15) dashes.push([(a - start) / len, (b - start) / len])
      }
    }
    const reach = half + SIDEWALK
    if (!deck && drape.onTop && !drape.onTop(Math.min(ax, bx) - reach, Math.min(ay, by) - reach, Math.max(ax, bx) + reach, Math.max(ay, by) + reach)) {
      // Off the model's top (the fogged backdrop, drawn within 1 m of its grid): 12 m strips at their corners' ground, as before.
      const h = (lift: number) => (x: number, y: number) => drape.ground.near(x, y) + lift
      const n = Math.max(1, Math.ceil(len / PATCH)), L = out.outside
      for (let k = 0; k < n; k++) strip(L.asphalt, ax, ay, ux, uy, len, k / n, (k + 1) / n, -half, half, h(LIFT.asphalt))
      continue
    }
    if (!deck) {
      draped[i] = 1; near[i] = detailed ? 1 : 0
      onGround(stripPolygon(ax, ay, ux, uy, len, 0, 1, -half, half), LIFT.asphalt, 'asphalt')
      if (detailed && s.bits[i] & LEFT) onGround(stripPolygon(ax, ay, ux, uy, len, 0, 1, half, half + SIDEWALK), LIFT.sidewalk, 'sidewalk')
      if (detailed && s.bits[i] & RIGHT) onGround(stripPolygon(ax, ay, ux, uy, len, 0, 1, -half - SIDEWALK, -half), LIFT.sidewalk, 'sidewalk')
      for (const [t0, t1] of dashes) onGround(stripPolygon(ax, ay, ux, uy, len, t0, t1, -DASH_WIDTH / 2, DASH_WIDTH / 2), LIFT.marking, 'marking')
      continue
    }
    // A bridge deck: its own heights at each detail (never draped on the ground), with illustrative slab edges. Between its
    // nodes it runs straight, but rises over ground that would come within DECK_CLEAR of it (0 at an end on the ground,
    // full 5 m away), in 2 m pieces: a deck between two approaches can clear a rise without leaving either junction.
    for (const v of ['near', 'far'] as const) {
      const za = decks[v][i * 2], zb = decks[v][i * 2 + 1], L = out[v], gr = drape.ground[v]
      const aOn = Math.abs(za - gr(ax, ay)) < 0.02, bOn = Math.abs(zb - gr(bx, by)) < 0.02
      const prof = (t: number) => {
        const ramp = Math.min(1, (aOn ? t * len : Infinity) / DECK_RAMP, (bOn ? (1 - t) * len : Infinity) / DECK_RAMP)
        // the ground under its centre at an end that meets a road, ramping to the highest ground across its width (centre and
        // both edges) 5 m away: the deck meets the road at the junction, then clears a cross slope as a level deck must
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, gc = gr(x, y)
        const g = gc + (Math.max(gc, gr(x - uy * half, y + ux * half), gr(x + uy * half, y - ux * half)) - gc) * ramp
        return Math.max(za + (zb - za) * t, g + DECK_CLEAR * ramp)
      }
      const n = Math.max(1, Math.ceil(len / 2)), z = Array.from({ length: n + 1 }, (_, k) => prof(k / n))
      const h = (lift: number) => (_x: number, _y: number, t: number) => { const f = t * n, k = Math.min(n - 1, Math.floor(f)); return z[k] + (z[k + 1] - z[k]) * (f - k) + lift }
      for (let k = 0; k < n; k++) strip(L.asphalt, ax, ay, ux, uy, len, k / n, (k + 1) / n, -half, half, h(LIFT.asphalt))
      for (const [t0, t1] of dashes) strip(L.marking, ax, ay, ux, uy, len, t0, t1, -DASH_WIDTH / 2, DASH_WIDTH / 2, h(LIFT.marking))
      for (const o of [-half, half]) {
        const nx = -uy * o, ny = ux * o
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, top0 = z[k] + LIFT.asphalt, top1 = z[k + 1] + LIFT.asphalt
          const q = [ax + ux * len * t0 + nx, ay + uy * len * t0 + ny], r = [ax + ux * len * t1 + nx, ay + uy * len * t1 + ny]
          // wound so each side faces outward
          if (o > 0) L.sides.push(q[0], q[1], top0, r[0], r[1], top1 - DECK_DEPTH, r[0], r[1], top1, q[0], q[1], top0, q[0], q[1], top0 - DECK_DEPTH, r[0], r[1], top1 - DECK_DEPTH)
          else L.sides.push(q[0], q[1], top0, r[0], r[1], top1, r[0], r[1], top1 - DECK_DEPTH, q[0], q[1], top0, r[0], r[1], top1 - DECK_DEPTH, q[0], q[1], top0 - DECK_DEPTH)
        }
      }
    }
  }
  const joins = streetJoins(s, (i) => draped[i] === 1, (i) => near[i] === 1)
  for (const p of joins.asphalt) onGround(p, LIFT.asphalt, 'asphalt')
  for (const p of joins.sidewalk) onGround(p, LIFT.sidewalk, 'sidewalk')
  stats.joins = joins.asphalt.length + joins.sidewalk.length
  stats.pieces = st.pieces; stats.triangles = st.triangles
  const geo = (L: Layers): StreetSet => ({ asphalt: geometry(L.asphalt), sidewalk: geometry(L.sidewalk), marking: geometry(L.marking), sides: geometry(L.sides) })
  return { outside: geo(out.outside), near: geo(out.near), far: geo(out.far), decks: s.bits.reduce((c, b) => c + (b & DECK ? 1 : 0), 0), stats }
}

/** The Context style's streets (drawn only when the Context style is on), at the terrain detail drawn now (`far`). */
export default function VistaStreets({ manifest, drape, centre, tex, far }: { manifest: Manifest; drape: StreetDrape | null; centre: [number, number]; tex: VistaTextures; far: boolean }) {
  const [streets, setStreets] = useState<Streets | null>(null)
  useEffect(() => { let live = true; loadStreets(manifest).then((s) => live && setStreets(s), () => {}); return () => { live = false } }, [manifest])
  // Detail follows the selected tower in 400 m steps, so dragging it does not rebuild the streets every frame.
  const cx = Math.round(centre[0] / 400) * 400, cy = Math.round(centre[1] / 400) * 400
  const g = useMemo(() => (streets && drape ? streetGeometry(streets, drape, [cx, cy], 1200) : null), [streets, drape, cx, cy])
  useEffect(() => () => { if (g) for (const set of [g.outside, g.near, g.far]) for (const k of ['asphalt', 'sidewalk', 'marking', 'sides'] as const) set[k].dispose() }, [g])
  const mats = useMemo(() => {
    const asphalt = contextPavingMaterial(tex, true), sidewalk = contextPavingMaterial(tex, false)
    asphalt.flatShading = true; sidewalk.flatShading = true
    return {
      asphalt, sidewalk,
      marking: new THREE.MeshStandardMaterial({ color: '#f1eee4', roughness: 0.9, flatShading: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      sides: new THREE.MeshStandardMaterial({ color: '#bdbab2', roughness: 1, flatShading: true }),
    }
  }, [tex])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  if (!g) return null
  const set = (v: 'outside' | 'near' | 'far') => (
    <group key={v} name={`streets:${v}`}>
      <mesh name="streets:sidewalk" geometry={g[v].sidewalk} material={mats.sidewalk} receiveShadow raycast={() => null} />
      <mesh name="streets:asphalt" geometry={g[v].asphalt} material={mats.asphalt} receiveShadow raycast={() => null} />
      <mesh name="streets:marking" geometry={g[v].marking} material={mats.marking} receiveShadow raycast={() => null} />
      <mesh name="streets:sides" geometry={g[v].sides} material={mats.sides} castShadow receiveShadow raycast={() => null} />
    </group>
  )
  return <>{set('outside')}{set(far ? 'far' : 'near')}</>
}

/**
 * Vista's Plain look draws its street network as thin lines (explorer.js: GL lines in COLLAGE_COLORS.roads, half a metre
 * up), not surfaces. Same network as the Context streets; decks at their interpolated heights, the rest on the ground.
 */
/**
 * Trails (OpenStreetMap paths, tracks and bridleways; tools/build_osm_green.py) as faint dashed lines on the ground, so
 * park and forest land shows its trail network (5 Nov: Pacific Spirit Regional Park read as an empty patch). Display only.
 */
export function TrailLines({ manifest, ground, color }: { manifest: Manifest; ground: (x: number, y: number) => number; color: string }) {
  const [segs, setSegs] = useState<Int32Array | null>(null)
  useEffect(() => {
    let live = true
    const layer = manifest.layers.find((l) => l.id === 'trails')
    if (!layer) return
    dataFetch(layer.file, 'trails').then((r) => (r.ok ? r.json() : null)).then((j: { version: number; origin: number[]; segments: number[][] } | null) => {
      if (!live || !j || j.version !== 1 || j.origin[0] !== 491300 || j.origin[1] !== 5458600) return
      const a = new Int32Array(j.segments.length * 4)
      j.segments.forEach((s, i) => a.set([s[0], s[1], s[2], s[3]], i * 4))
      setSegs(a)
    }, () => {})
    return () => { live = false }
  }, [manifest])
  const line = useMemo(() => {
    if (!segs) return null
    const n = segs.length / 4, pos = new Float32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const ax = segs[i * 4] / 10, ay = segs[i * 4 + 1] / 10, bx = segs[i * 4 + 2] / 10, by = segs[i * 4 + 3] / 10
      pos.set([ax, ay, Math.max(0, ground(ax, ay)) + 0.4, bx, by, Math.max(0, ground(bx, by)) + 0.4], i * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const l = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.75, toneMapped: false }))
    l.computeLineDistances(); l.name = 'trails'; l.raycast = () => {}
    return l
  }, [segs, ground, color])
  useEffect(() => () => { line?.geometry.dispose(); (line?.material as THREE.Material | undefined)?.dispose() }, [line])
  return line ? <primitive object={line} /> : null
}

export function VistaStreetLines({ manifest, ground, color }: { manifest: Manifest; ground: (x: number, y: number) => number; color: string }) {
  const [streets, setStreets] = useState<Streets | null>(null)
  useEffect(() => { let live = true; loadStreets(manifest).then((s) => live && setStreets(s), () => {}); return () => { live = false } }, [manifest])
  const geom = useMemo(() => {
    if (!streets) return null
    const z = deckHeights(streets, ground), pos = new Float32Array(streets.count * 6)
    for (let i = 0; i < streets.count; i++) {
      const [ax, ay, bx, by] = streets.seg.subarray(i * 4, i * 4 + 4), deck = streets.bits[i] & DECK
      pos.set([ax, ay, (deck ? z[i * 2] : Math.max(0, ground(ax, ay))) + 0.5, bx, by, (deck ? z[i * 2 + 1] : Math.max(0, ground(bx, by))) + 0.5], i * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [streets, ground])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return <lineSegments geometry={geom} raycast={() => null}><lineBasicMaterial color={color} toneMapped={false} /></lineSegments>
}
