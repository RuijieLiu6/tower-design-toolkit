import { bandCounts, bandF2f, blockSpans, blocksOf, legacyBlocks, rectCorners, spanAt, summarize, typicalIndex, type BlockSpan } from './blocks'
import { importedFloors } from './imported'
import { convexHull, ringArea } from './importGeom'
import type { Block, CoreStep, Floor, ImportedStorey, Tower, UseId } from './types'

// Block geometry lives in ./blocks (no dependencies, usable in workers); re-exported here for every other reader.
export { bandCounts, bandF2f, blockSpans, blocksOf, fitBlocks, legacyBlocks, podiumRun, rectCorners, spanAt, summarize, typicalBlock, typicalIndex, type BlockSpan, type BoxFields } from './blocks'

export const PODIUM_F2F = 4.5

// --- Stacked blocks (after Vista's proposal parts, Ruijie Liu) ------------------------------------------------------
// A parametric tower is a stack of rectangular blocks, bottom-up. Each block has its own height, width, depth, plan
// offset and rotation relative to the tower; the leading run of podium blocks is the podium. Old towers without
// `blocks` read as two blocks (podium and tower), so every saved project keeps its floors exactly.

/** A tower with these blocks, its derived fields kept in step (and their snapshot, see `blocksOf`). */
export function withBlocks(t: Tower, blocks: Block[]): Tower {
  const box = summarize(blocks, t)
  return { ...t, blocks, ...box, boxFromBlocks: box }
}

/** Old save → two explicit blocks (idempotent; imported towers are left alone). */
export function migrateTower(t: Tower): Tower {
  if (t.imported || t.blocks?.length) return t
  return withBlocks(t, legacyBlocks(t))
}

/**
 * Apply an edit to a tower. With blocks, edits of the old box fields (height, width, depth, podium) are fitted onto the
 * blocks (`fitBlocks` in ./blocks), so every existing control keeps working; a new block list replaces the blocks.
 */
export function applyTowerPatch(t: Tower, patch: Partial<Tower>): Tower {
  const next = { ...t, ...patch }
  if (next.imported) return next
  if (patch.blocks) return withBlocks(next, patch.blocks)
  if (!next.blocks?.length) return next
  return withBlocks(next, blocksOf(next))
}

// --- Imported massing read storey by storey (T10) ---------------------------------------------------------------------
// An imported (not drawn) tower is read from the storey outlines already stored on it, not from the convex hull of the
// whole mesh: that hull runs from the ground to the top, so a tower on a podium read as a podium-sized prism to full
// height (streetwall, step-back, separation, facade, energy and both wind checks). Drawn masses keep their hull.
type P = [number, number]

/** Storeys an imported (not drawn) tower is read from: those with an outline; null for any other tower. */
function outlinedStoreys(t: Tower): ImportedStorey[] | null {
  if (!t.imported || t.drawn) return null
  const s = t.imported.storeys?.filter((x) => x.loops?.length) ?? []
  return s.length ? s : null
}

/** True when the tower's footprint, masses and floor rings come from its storey outlines (an imported, not drawn, tower). */
export function readsStoreys(t: Tower): boolean {
  return !!outlinedStoreys(t)?.some((s) => s.hasFloor)
}

const hullCache = new WeakMap<ImportedStorey, P[]>()
/** Convex hull of one storey's outlines in the tower frame, nearly collinear points dropped (cached per storey record). */
function storeyHull(s: ImportedStorey): P[] {
  let h = hullCache.get(s)
  if (!h) {
    h = straighten(convexHull(s.loops.flat() as P[]))
    hullCache.set(s, h)
  }
  return h
}

/** Drops hull points within 1 cm of the line through their neighbours (slicing leaves points along straight walls). */
function straighten(r: P[]): P[] {
  if (r.length <= 3) return r
  const out = r.filter((q, i) => {
    const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    return len < 1e-9 || Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len > 0.01
  })
  return out.length >= 3 ? out : r
}

/** Distance from a point to a closed ring's edges. */
function toRing(p: P, r: P[]): number {
  let d = Infinity
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1]
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)))
    d = Math.min(d, Math.hypot(p[0] - a[0] - ex * k, p[1] - a[1] - ey * k))
  }
  return d
}
/** Two convex outlines are the same when every corner of each lies within `tol` metres of the other's edges. */
const sameOutline = (a: P[], b: P[], tol = 0.05) => a.every((p) => toRing(p, b) <= tol) && b.every((p) => toRing(p, a) <= tol)

/** Tower frame → project frame (the tower's position and rotation). */
function placeRing(t: Tower, r: P[]): P[] {
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return r.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
}

/** The median floored tower storey by area (the "typical floor", as `typicalPlate` and `towerPatch` in ./imported). */
function typicalStorey(st: ImportedStorey[]): ImportedStorey | undefined {
  const fl = st.filter((s) => s.hasFloor && !s.podium).sort((a, b) => a.area - b.area)
  return fl[Math.floor(fl.length / 2)]
}

/** One prism per block (an imported tower: one per run of equal storeys), for shadows, cones, containment and export. */
export interface Mass { ring: [number, number][]; z0: number; z1: number; podium: boolean; blockId: string }
export function towerMasses(t: Tower): Mass[] {
  if (t.drawn && t.imported) return [{ ring: towerFootprint(t), z0: t.drawn.base, z1: t.height, podium: false, blockId: 'drawn' }]
  if (t.imported) {
    const st = outlinedStoreys(t)
    if (!st) return [{ ring: towerFootprint(t), z0: 0, z1: t.height, podium: false, blockId: 'imported' }]
    // Runs of consecutive storeys with the same outline and podium flag. The last run reaches the top of the mass, so a
    // crown above the last storey stays in the shadow and view-cone checks.
    const runs: (Omit<Mass, 'ring'> & { local: P[] })[] = []
    for (const s of st) {
      const local = storeyHull(s), cur = runs[runs.length - 1]
      if (local.length < 3) continue
      if (cur && cur.podium === s.podium && Math.abs(cur.z1 - s.z0) < 0.01 && sameOutline(cur.local, local)) { cur.z1 = s.z1; continue }
      runs.push({ local, z0: s.z0, z1: s.z1, podium: s.podium, blockId: `storey-${s.level}` })
    }
    const last = runs[runs.length - 1]
    if (!last) return [{ ring: towerFootprint(t), z0: 0, z1: t.height, podium: false, blockId: 'imported' }]
    last.z1 = Math.max(last.z1, t.height)
    return runs.map(({ local, ...m }) => ({ ...m, ring: placeRing(t, local) }))
  }
  return blockSpans(t).filter((s) => s.z1 > s.z0).map((s) => ({ ring: s.ring, z0: s.z0, z1: s.z1, podium: s.podium, blockId: s.block.id }))
}

/** Plate outline of one floor in the project frame: the block at the floor's mid-height (an imported tower: that storey's hull). */
export function floorRing(t: Tower, f: Pick<Floor, 'z0' | 'z1'>): [number, number][] {
  if (t.imported) {
    const mid = (f.z0 + f.z1) / 2
    const s = outlinedStoreys(t)?.find((x) => mid >= x.z0 && mid < x.z1)
    return s && storeyHull(s).length >= 3 ? placeRing(t, storeyHull(s)) : towerFootprint(t)
  }
  return spanAt(blockSpans(t), (f.z0 + f.z1) / 2)?.ring ?? towerFootprint(t)
}

/** Floors of one tower: podium floors first, then tower floors allocated to program bands bottom-up. */
export function towerFloors(t: Tower): Floor[] {
  // Imported massing: floors come from slicing the model (engine/imported.ts).
  const floors = t.imported ? importedFloors(t) : parametricFloors(t)
  // Floors given a use one by one in Program (Sinnie, 13 Nov: "select floors and adjust the programming type").
  const own = t.floorUses
  if (!own) return floors
  return floors.map((f) => { const u = own[f.level]; return u && !f.skyLobby && u !== f.use ? { ...f, use: u } : f })
}

function parametricFloors(t: Tower): Floor[] {
  const spans = blockSpans(t)
  const podium = spans.filter((s) => s.podium)
  const podiumTop = podium.length ? podium[podium.length - 1].z1 : 0
  const height = spans.length ? spans[spans.length - 1].z1 : 0
  const floors: Floor[] = []
  // Podium blocks: whole floors near the podium floor-to-floor in each block.
  for (const s of podium) {
    const h = s.z1 - s.z0
    const n = h > 0 ? Math.max(1, Math.round(h / (s.block.f2f && s.block.f2f > 0 ? s.block.f2f : PODIUM_F2F))) : 0
    const f2f = n ? h / n : 0
    for (let i = 0; i < n; i++) floors.push({ level: floors.length + 1, z0: s.z0 + i * f2f, z1: s.z0 + (i + 1) * f2f, use: s.block.use ?? t.podiumUse, area: s.block.width * s.block.depth, podium: true })
  }
  // Above the podium: floors at each band's floor-to-floor (the tower's unless the band sets its own), each taking the
  // block at its mid-height; band counts by largest remainder (engine/blocks.ts bandCounts).
  const counts = bandCounts(t, height - podiumTop)
  const f2f = bandF2f(t)
  let z = podiumTop
  let level = floors.length
  let towerIndex = 0
  const sky = new Set(t.skyLobbies ?? [])
  const plantAt = new Set(t.plantLevels ?? [])
  const above = spans.slice(podium.length)
  t.bands.forEach((b, bi) => {
    const h = f2f[bi]
    for (let k = 0; k < counts[bi]; k++) {
      level++
      towerIndex++
      // Schematic: a sky lobby replaces the program floor at that level (counted as public amenity, team assumption);
      // plant floors replace it at every Nth tower floor and at the levels placed one by one.
      const plant = (t.plantEvery > 0 && towerIndex % t.plantEvery === 0) || plantAt.has(level)
      const isSky = sky.has(level) && z > 0.5
      const blk = (spanAt(above.length ? above : spans, z + h / 2)?.block) ?? null
      floors.push({ level, z0: z, z1: z + h, use: isSky ? 'amenity' : plant ? 'mechanical' : b.use, area: blk ? blk.width * blk.depth : t.width * t.depth, podium: false, ...(isSky ? { skyLobby: true } : {}) })
      z += h
    }
  })
  return floors
}

/** Core box side length (square, centred on the tower) from the core share of the typical tower plate. */
export function coreSide(t: Tower): number {
  return Math.sqrt(Math.max(0, Math.min(0.6, t.coreShare)) * t.width * t.depth)
}

/** Net-to-gross on a typical tower floor if only the core is deducted (team assumption). */
export function netToGross(t: Tower): number {
  return 1 - Math.max(0, Math.min(0.6, t.coreShare))
}

// --- Core steps (gap G18) -------------------------------------------------------------------------------------------
// A core that steps with the tiers: from each step's level up, a square core of its own side (and centre, when given).
// Below the first step, and on every tower without steps, the core is the one the core share sets (`coreSide`).

/** The tower's core steps, valid (a side over 1 m, a finite level) and sorted by level; the last of equal levels wins. */
export function coreStepsOf(t: Tower): CoreStep[] {
  const ok = (t.coreSteps ?? []).filter((s) => s && Number.isFinite(s.fromLevel) && Number.isFinite(s.side) && s.side > 1)
  const byLevel = new Map<number, CoreStep>()
  for (const s of ok) byLevel.set(Math.round(s.fromLevel), s)
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([fromLevel, s]) => ({ ...s, fromLevel }))
}

/** The core step that applies on one floor level, or null below the first step (the core share's core). */
export function coreStepAt(t: Tower, level: number): CoreStep | null {
  let out: CoreStep | null = null
  for (const s of coreStepsOf(t)) if (s.fromLevel <= level) out = s
  return out
}

/** Side of the square core on one floor level (m): its step's, else the core share's. */
export function coreSideAt(t: Tower, level: number): number {
  return coreStepAt(t, level)?.side ?? coreSide(t)
}

/**
 * Core area on one floor level (m²): its step's square where the core steps with the tiers, else the core share of
 * the typical plate, as before. Deducted from that floor's own area (an imported tower: its own storey plate).
 */
export function coreAreaAt(t: Tower, level: number): number {
  const s = coreStepAt(t, level)
  return s ? s.side * s.side : t.coreShare * t.width * t.depth
}

/**
 * Net-to-gross on one floor if only the core is deducted. Without core steps: the tower's share (`netToGross`), as
 * before. With them, every floor deducts its own core from its own plate (the floor's area), so a stepped-in core
 * gives the upper tiers back their floor.
 */
export function netToGrossAt(t: Tower, f: Pick<Floor, 'level' | 'area'>): number {
  if (!t.coreSteps?.length || !coreStepsOf(t).length || !(f.area > 0)) return netToGross(t)
  const c = coreSideAt(t, f.level)
  return Math.max(0, Math.min(1, 1 - (c * c) / f.area))
}

/**
 * A floor's area split by use (gap G14): each part in `useAreas` in its own use ('none' left out of every use), the
 * rest in the floor's use. Parts are taken in order and never exceed the floor. No parts: the whole floor in its use.
 */
export function floorAreasByUse(f: Pick<Floor, 'use' | 'area' | 'useAreas'>): Partial<Record<UseId, number>> {
  if (!f.useAreas?.length) return { [f.use]: f.area }
  const out: Partial<Record<UseId, number>> = {}
  let left = Math.max(0, f.area)
  for (const p of f.useAreas) {
    const a = Math.min(left, Number.isFinite(p.area) ? Math.max(0, p.area) : 0)
    left -= a
    if (p.use !== 'none' && a > 0) out[p.use] = (out[p.use] ?? 0) + a
  }
  out[f.use] = (out[f.use] ?? 0) + left
  return out
}

/** Area of a floor left to its own use once its parts in other uses are taken out (gap G14); the whole floor without parts. */
export function ownUseArea(f: Pick<Floor, 'area' | 'useAreas'>): number {
  if (!f.useAreas?.length) return f.area
  return Math.max(0, f.area - f.useAreas.reduce((s, p) => s + (Number.isFinite(p.area) ? Math.max(0, p.area) : 0), 0))
}

export function gfaByUse(towers: Tower[]): Record<UseId, number> {
  const out = { retail: 0, office: 0, hotel: 0, residential: 0, civic: 0, amenity: 0, mechanical: 0 } as Record<UseId, number>
  for (const t of towers) for (const f of towerFloors(t)) for (const [u, a] of Object.entries(floorAreasByUse(f)) as [UseId, number][]) out[u] += a
  return out
}

/**
 * Plan outline of a tower in the project frame: the typical block's rectangle for a parametric tower (the largest
 * podium block when asked). An imported tower: the hull of its median tower storey (of its podium storeys when asked);
 * a drawn mass, or an import without storey outlines: the convex hull of the whole mass. Per-level plates: `floorRing`;
 * every block: `towerMasses`.
 */
export function towerFootprint(t: Tower, podium = false): [number, number][] {
  const st = outlinedStoreys(t)?.filter((s) => s.hasFloor)
  if (st?.length) {
    const pod = podium ? st.filter((s) => s.podium) : []
    const typ = pod.length ? undefined : typicalStorey(st)
    const local = pod.length ? straighten(convexHull(pod.flatMap(storeyHull))) : typ ? storeyHull(typ) : null
    if (local && local.length >= 3) return placeRing(t, local)
  }
  if (t.imported?.hull.length) return placeRing(t, t.imported.hull)
  if (!t.blocks?.length) return podium ? rectCorners(t.x, t.y, t.podiumWidth, t.podiumDepth, t.rotation) : rectCorners(t.x, t.y, t.width, t.depth, t.rotation)
  const spans = blockSpans(t)
  const pool = podium ? spans.filter((s) => s.podium) : spans
  if (podium) {
    const widest = pool.reduce<BlockSpan | null>((a, b) => (!a || b.block.width * b.block.depth > a.block.width * a.block.depth ? b : a), null)
    if (widest) return widest.ring
  }
  return (spans[typicalIndex(blocksOf(t))] ?? spans[spans.length - 1]).ring
}

/**
 * Plan outline of the whole mass, every height together, in the project frame: an imported tower's stored hull of its
 * whole mesh, else the convex hull of all its blocks. For the readers that want everything the tower covers at once
 * (the site fit, the City buildings it replaces, the single-prism cone summary), now that `towerFootprint` of an
 * imported tower is its typical storey (T10).
 */
export function massOutline(t: Tower): [number, number][] {
  if (t.imported?.hull.length) return placeRing(t, t.imported.hull)
  return convexHull(towerMasses(t).flatMap((m) => m.ring))
}

// --- True storey outlines for the public-realm checks (G10) -----------------------------------------------------------
// `towerFootprint` and `towerMasses` hull each storey, so a podium in separate parts (a forum or lane cut between a
// pavilion and the main podium) still read as one block: open space, POPS, the mid-block link and the frontage never saw
// the cut. These are the storeys' own outlines, several parts, non-convex shapes and courtyards kept. They are not
// joined by a polygon union (polygon-clipping fails or takes a quarter of a second on a twisting free form's storeys):
// each different storey keeps its polygons, those lying within a larger one are dropped, and the readers take the union
// (a point under any part is covered; lengths along a street are merged).

/** Which storeys an outline is read from: the storey at grade, the podium storeys, or the tower storeys above them. */
export type OutlinePart = 'ground' | 'podium' | 'tower'
/** A plan polygon: its outer ring (counter-clockwise), then its holes (clockwise). */
export type PlanPolygon = [number, number][][]

const outlineCache = new WeakMap<ImportedStorey[], Map<OutlinePart, PlanPolygon[]>>()

const openRing = (r: P[]): P[] => (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r)
function inRing(p: P, r: P[]): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const turn = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
/** Two segments cross at a point inside both (touching or running along each other does not count). */
function properCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = turn(c, d, a), d2 = turn(c, d, b), d3 = turn(a, b, c), d4 = turn(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * One storey's loops as polygons: counter-clockwise rings are outer rings, each with the clockwise rings inside it as
 * holes (a courtyard). A clockwise ring inside no outer ring is an outer ring wound the other way (flipped faces).
 * Overlapping outer rings (parts of a model that intersect) stay two polygons: their overlap is covered, not cancelled
 * as even-odd would.
 */
function storeyPolygons(s: ImportedStorey): PlanPolygon[] {
  const rings = s.loops.map(openRing).filter((r) => r.length >= 3)
  const a = rings.map(ringArea)
  const polys: PlanPolygon[] = [], holes: P[][] = []
  rings.forEach((r, i) => {
    if (Math.abs(a[i]) < 1e-6) return
    if (a[i] < 0 && rings.some((o, j) => a[j] > 0 && inRing(r[0], o))) holes.push(r)
    else polys.push([a[i] > 0 ? r : [...r].reverse()])
  })
  for (const h of holes) polys.find((pg) => inRing(h[0], pg[0]))?.push(h)
  return polys
}

interface Sized { pg: PlanPolygon; area: number; box: [number, number, number, number] }
const sized = (pg: PlanPolygon): Sized => {
  const xs = pg[0].map((p) => p[0]), ys = pg[0].map((p) => p[1])
  return { pg, area: ringArea(pg[0]), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
}
/** True when `a` lies within `b` (a polygon without holes): every corner inside it or within 1 cm of it, no edges crossing. */
function within(a: Sized, b: Sized, tol = 0.01): boolean {
  if (b.pg.length > 1) return false
  const [ax0, ay0, ax1, ay1] = a.box, [bx0, by0, bx1, by1] = b.box
  if (ax0 < bx0 - tol || ay0 < by0 - tol || ax1 > bx1 + tol || ay1 > by1 + tol) return false
  const A = a.pg[0], B = b.pg[0]
  if (!A.every((p) => inRing(p, B) || toRing(p, B) <= tol)) return false
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    if (properCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return false
  }
  return true
}

/** Plan polygons of these storeys in the tower frame: each different storey's, less those within a larger one. */
function storeyParts(storeys: ImportedStorey[]): PlanPolygon[] {
  const seen = new Set<string>(), all: Sized[] = []
  for (const s of storeys) {
    const k = JSON.stringify(s.loops)
    if (seen.has(k)) continue
    seen.add(k)
    all.push(...storeyPolygons(s).map(sized))
  }
  all.sort((x, y) => y.area - x.area)
  const kept: Sized[] = []
  for (const c of all) if (!kept.some((k) => within(c, k))) kept.push(c)
  return kept.map((k) => k.pg)
}

/**
 * True plan outline of an imported (not drawn) tower in the project frame (G10): the polygons (outer ring, then holes)
 * of the chosen storeys, several parts and non-convex shapes kept. 'ground' is the lowest storey, 'podium' every podium
 * storey, 'tower' every storey above the podium. Parts may overlap (storeys stacked); the area they cover is their
 * union. Null for a parametric or drawn tower or an import without storey outlines: the callers keep `towerFootprint`.
 * An empty list: no storey of that part.
 */
export function storeyOutline(t: Tower, part: OutlinePart): PlanPolygon[] | null {
  if (!readsStoreys(t)) return null
  const st = outlinedStoreys(t)!
  const key = t.imported!.storeys
  let cache = outlineCache.get(key)
  if (!cache) { cache = new Map(); outlineCache.set(key, cache) }
  let local = cache.get(part)
  if (!local) {
    const z0 = Math.min(...st.map((s) => s.z0))
    local = storeyParts(part === 'ground' ? st.filter((s) => s.z0 <= z0 + 0.01) : st.filter((s) => s.podium === (part === 'podium')))
    cache.set(part, local)
  }
  return local.map((pg) => pg.map((r) => placeRing(t, r)))
}
