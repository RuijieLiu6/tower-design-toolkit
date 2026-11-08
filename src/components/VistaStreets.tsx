// Context style roads: Vista's OpenStreetMap street network (public/data/vista_streets.json, tools/build_vista_streets.py;
// (c) OpenStreetMap contributors, ODbL) as asphalt carriageways with centre dashes, paving sidewalks and illustrative
// bridge decks, after Vista's streetscape.js and traffic-network.js. Widths, sidewalks and deck heights are estimates.
import { dataFetch } from '../lib/loadProgress'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Manifest } from '../lib/cityLayers'
import { contextPavingMaterial, type VistaTextures } from './ContextStyle'

export interface Streets { seg: Float32Array; width: Float32Array; bits: Uint8Array; way: Uint32Array; count: number }
export const DECK = 1, LEFT = 2, RIGHT = 4, MAJOR = 8
/** Vista's surface offsets above the ground (m); sidewalks go under the asphalt so overlaps at corners show asphalt. */
const LIFT = { asphalt: 0.035, sidewalk: 0.02, marking: 0.065 }
const PATCH = 12, SIDEWALK = 2.4, DASH = 3, DASH_EVERY = 18, DASH_WIDTH = 0.15, DECK_DEPTH = 1.4

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
 */
export function deckHeights(s: Streets, ground: (x: number, y: number) => number): Float32Array {
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
  for (let i = 0; i < s.count; i++) {
    if (!(s.bits[i] & DECK)) continue
    z[i * 2] = nodes.get(key(s.seg[i * 4], s.seg[i * 4 + 1]))!.z
    z[i * 2 + 1] = nodes.get(key(s.seg[i * 4 + 2], s.seg[i * 4 + 3]))!.z
  }
  return z
}

interface Builder { pos: number[]; nrm: number[] }
const builder = (): Builder => ({ pos: [], nrm: [] })
/** A flat strip between offsets o0 and o1 across a segment, from t0 to t1 along it, with heights per corner. */
function strip(b: Builder, ax: number, ay: number, ux: number, uy: number, len: number, t0: number, t1: number, o0: number, o1: number, h: (x: number, y: number, t: number) => number) {
  const nx = -uy, ny = ux
  const p = (t: number, o: number) => { const x = ax + ux * len * t + nx * o, y = ay + uy * len * t + ny * o; return [x, y, h(x, y, t)] }
  const a = p(t0, o0), c = p(t1, o0), d = p(t1, o1), e = p(t0, o1)
  b.pos.push(...a, ...c, ...d, ...a, ...d, ...e)
  for (let k = 0; k < 6; k++) b.nrm.push(0, 0, 1)
}
const geometry = (b: Builder) => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3))
  return g
}

/**
 * Carriageways everywhere; sidewalks and centre dashes only within `detail` metres of `centre` (Vista draws its detail
 * around the viewpoint too), so the triangle count stays bounded on 1,400 km of streets.
 */
export function streetGeometry(s: Streets, ground: (x: number, y: number) => number, centre: [number, number], detail: number) {
  const decks = deckHeights(s, ground)
  const asphalt = builder(), sidewalk = builder(), marking = builder(), sides = builder()
  for (let i = 0; i < s.count; i++) {
    const ax = s.seg[i * 4], ay = s.seg[i * 4 + 1], bx = s.seg[i * 4 + 2], by = s.seg[i * 4 + 3]
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, half = s.width[i] / 2
    const deck = (s.bits[i] & DECK) !== 0, za = decks[i * 2], zb = decks[i * 2 + 1]
    const h = (lift: number) => (x: number, y: number, t: number) => (deck ? za + (zb - za) * t : ground(x, y)) + lift
    const n = Math.max(1, Math.ceil(len / PATCH))
    const near = Math.hypot((ax + bx) / 2 - centre[0], (ay + by) / 2 - centre[1]) <= detail
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n
      strip(asphalt, ax, ay, ux, uy, len, t0, t1, -half, half, h(LIFT.asphalt))
      if (near && !deck) {
        if (s.bits[i] & LEFT) strip(sidewalk, ax, ay, ux, uy, len, t0, t1, half, half + SIDEWALK, h(LIFT.sidewalk))
        if (s.bits[i] & RIGHT) strip(sidewalk, ax, ay, ux, uy, len, t0, t1, -half - SIDEWALK, -half, h(LIFT.sidewalk))
      }
    }
    if (near && (s.bits[i] & MAJOR) && s.width[i] >= 7) {
      // A world-aligned dash phase, so collinear segments do not restart the pattern (Vista streetscape.js).
      const start = ax * ux + ay * uy, end = start + len
      for (let k = Math.floor(start / DASH_EVERY); k * DASH_EVERY < end; k++) {
        const a = Math.max(start, k * DASH_EVERY), b = Math.min(end, k * DASH_EVERY + DASH)
        if (b - a >= 0.15) strip(marking, ax, ay, ux, uy, len, (a - start) / len, (b - start) / len, -DASH_WIDTH / 2, DASH_WIDTH / 2, h(LIFT.marking))
      }
    }
    if (deck) {
      // Illustrative slab edges under both deck sides.
      for (const o of [-half, half]) {
        const nx = -uy * o, ny = ux * o, top0 = za + LIFT.asphalt, top1 = zb + LIFT.asphalt
        const q = [ax + nx, ay + ny], r = [bx + nx, by + ny], sx = o > 0 ? -uy : uy, sy = o > 0 ? ux : -ux
        sides.pos.push(q[0], q[1], top0, r[0], r[1], top1, r[0], r[1], top1 - DECK_DEPTH, q[0], q[1], top0, r[0], r[1], top1 - DECK_DEPTH, q[0], q[1], top0 - DECK_DEPTH)
        for (let k = 0; k < 6; k++) sides.nrm.push(sx, sy, 0)
      }
    }
  }
  return { asphalt: geometry(asphalt), sidewalk: geometry(sidewalk), marking: geometry(marking), sides: geometry(sides), decks: s.bits.reduce((c, b) => c + (b & DECK ? 1 : 0), 0) }
}

/** The Context style's streets (drawn only when the Context style is on). */
export default function VistaStreets({ manifest, ground, centre, tex }: { manifest: Manifest; ground: (x: number, y: number) => number; centre: [number, number]; tex: VistaTextures }) {
  const [streets, setStreets] = useState<Streets | null>(null)
  useEffect(() => { let live = true; loadStreets(manifest).then((s) => live && setStreets(s), () => {}); return () => { live = false } }, [manifest])
  // Detail follows the selected tower in 400 m steps, so dragging it does not rebuild the streets every frame.
  const cx = Math.round(centre[0] / 400) * 400, cy = Math.round(centre[1] / 400) * 400
  const g = useMemo(() => (streets ? streetGeometry(streets, ground, [cx, cy], 1200) : null), [streets, ground, cx, cy])
  useEffect(() => () => { if (g) for (const k of ['asphalt', 'sidewalk', 'marking', 'sides'] as const) g[k].dispose() }, [g])
  const mats = useMemo(() => ({
    asphalt: contextPavingMaterial(tex, true), sidewalk: contextPavingMaterial(tex, false),
    marking: new THREE.MeshStandardMaterial({ color: '#f1eee4', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    sides: new THREE.MeshStandardMaterial({ color: '#bdbab2', roughness: 1 }),
  }), [tex])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  if (!g) return null
  return (
    <>
      <mesh geometry={g.sidewalk} material={mats.sidewalk} receiveShadow raycast={() => null} />
      <mesh geometry={g.asphalt} material={mats.asphalt} receiveShadow raycast={() => null} />
      <mesh geometry={g.marking} material={mats.marking} receiveShadow raycast={() => null} />
      <mesh geometry={g.sides} material={mats.sides} castShadow receiveShadow raycast={() => null} />
    </>
  )
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
