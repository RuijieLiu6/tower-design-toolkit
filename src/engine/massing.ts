import { bandCounts, bandF2f, blockSpans, blocksOf, legacyBlocks, rectCorners, spanAt, summarize, typicalIndex, type BlockSpan } from './blocks'
import { importedFloors } from './imported'
import type { Block, Floor, Tower, UseId } from './types'

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

/** One prism per block (an imported tower: its hull over its full height), for shadows, cones, containment and export. */
export interface Mass { ring: [number, number][]; z0: number; z1: number; podium: boolean; blockId: string }
export function towerMasses(t: Tower): Mass[] {
  if (t.imported) return [{ ring: towerFootprint(t), z0: 0, z1: t.height, podium: false, blockId: 'imported' }]
  return blockSpans(t).filter((s) => s.z1 > s.z0).map((s) => ({ ring: s.ring, z0: s.z0, z1: s.z1, podium: s.podium, blockId: s.block.id }))
}

/** Plate outline of one floor in the project frame: the block at the floor's mid-height (an imported tower: its hull). */
export function floorRing(t: Tower, f: Pick<Floor, 'z0' | 'z1'>): [number, number][] {
  if (t.imported) return towerFootprint(t)
  return spanAt(blockSpans(t), (f.z0 + f.z1) / 2)?.ring ?? towerFootprint(t)
}

/** Floors of one tower: podium floors first, then tower floors allocated to program bands bottom-up. */
export function towerFloors(t: Tower): Floor[] {
  // Imported massing: floors come from slicing the model (engine/imported.ts).
  if (t.imported) return importedFloors(t)
  const spans = blockSpans(t)
  const podium = spans.filter((s) => s.podium)
  const podiumTop = podium.length ? podium[podium.length - 1].z1 : 0
  const height = spans.length ? spans[spans.length - 1].z1 : 0
  const floors: Floor[] = []
  // Podium blocks: whole floors near the podium floor-to-floor in each block.
  for (const s of podium) {
    const h = s.z1 - s.z0
    const n = h > 0 ? Math.max(1, Math.round(h / PODIUM_F2F)) : 0
    const f2f = n ? h / n : 0
    for (let i = 0; i < n; i++) floors.push({ level: floors.length + 1, z0: s.z0 + i * f2f, z1: s.z0 + (i + 1) * f2f, use: t.podiumUse, area: s.block.width * s.block.depth, podium: true })
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
 * podium block when asked), the convex hull of the whole mass for an imported one. Per-level plates: `floorRing`;
 * every block: `towerMasses`.
 */
export function towerFootprint(t: Tower, podium = false): [number, number][] {
  if (t.imported?.hull.length) {
    const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    return t.imported.hull.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
  }
  if (!t.blocks?.length) return podium ? rectCorners(t.x, t.y, t.podiumWidth, t.podiumDepth, t.rotation) : rectCorners(t.x, t.y, t.width, t.depth, t.rotation)
  const spans = blockSpans(t)
  const pool = podium ? spans.filter((s) => s.podium) : spans
  if (podium) {
    const widest = pool.reduce<BlockSpan | null>((a, b) => (!a || b.block.width * b.block.depth > a.block.width * a.block.depth ? b : a), null)
    if (widest) return widest.ring
  }
  return (spans[typicalIndex(blocksOf(t))] ?? spans[spans.length - 1]).ring
}
