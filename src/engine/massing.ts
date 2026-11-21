import { bandCounts, bandF2f, blockSpans, blocksOf, legacyBlocks, rectCorners, spanAt, summarize, typicalIndex, type BlockSpan } from './blocks'
import { importedFloors } from './imported'
import { convexHull } from './importGeom'
import type { Block, Floor, ImportedStorey, Tower, UseId } from './types'

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

export function gfaByUse(towers: Tower[]): Record<UseId, number> {
  const out = { retail: 0, office: 0, hotel: 0, residential: 0, civic: 0, amenity: 0, mechanical: 0 } as Record<UseId, number>
  for (const t of towers) for (const f of towerFloors(t)) out[f.use] += f.area
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
