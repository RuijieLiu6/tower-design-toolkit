import { importedFloors } from './imported'
import type { Floor, Tower, UseId } from './types'

export const PODIUM_F2F = 4.5

/** Floors of one tower: podium floors first, then tower floors allocated to program bands bottom-up. */
export function towerFloors(t: Tower): Floor[] {
  // Imported massing: floors come from slicing the model (engine/imported.ts).
  if (t.imported) return importedFloors(t)
  const floors: Floor[] = []
  const podiumFloors = t.podiumHeight > 0 ? Math.max(1, Math.round(t.podiumHeight / PODIUM_F2F)) : 0
  const podiumF2F = podiumFloors ? t.podiumHeight / podiumFloors : 0
  for (let i = 0; i < podiumFloors; i++) {
    floors.push({ level: i + 1, z0: i * podiumF2F, z1: (i + 1) * podiumF2F, use: t.podiumUse, area: t.podiumWidth * t.podiumDepth, podium: true })
  }
  const towerFloorCount = Math.max(0, Math.floor((t.height - t.podiumHeight) / t.f2f))
  const total = t.bands.reduce((s, b) => s + Math.max(0, b.share), 0) || 1
  // Largest-remainder allocation so the band counts add up exactly.
  const raw = t.bands.map((b) => (Math.max(0, b.share) / total) * towerFloorCount)
  const counts = raw.map(Math.floor)
  let left = towerFloorCount - counts.reduce((a, b) => a + b, 0)
  raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { counts[i]++; left-- } })
  let z = t.podiumHeight
  let level = podiumFloors
  let towerIndex = 0
  const sky = new Set(t.skyLobbies ?? [])
  t.bands.forEach((b, bi) => {
    for (let k = 0; k < counts[bi]; k++) {
      level++
      towerIndex++
      // Schematic: a sky lobby replaces the program floor at that level (counted as public amenity, team assumption);
      // plant floors replace it at every Nth tower floor.
      const plant = t.plantEvery > 0 && towerIndex % t.plantEvery === 0
      const isSky = sky.has(level) && z > 0.5
      floors.push({ level, z0: z, z1: z + t.f2f, use: isSky ? 'amenity' : plant ? 'mechanical' : b.use, area: t.width * t.depth, podium: false, ...(isSky ? { skyLobby: true } : {}) })
      z += t.f2f
    }
  })
  return floors
}

/** Core box side length (square, centred) from the core share of the tower plate. */
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

/** Footprint corners of a rectangle centred at (x, y), rotated by deg. */
export function rectCorners(x: number, y: number, w: number, d: number, deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as [number, number][]).map(([u, v]) => [x + u * c - v * s, y + u * s + v * c])
}

/**
 * Plan outline of a tower in the project frame: the rectangle for a parametric tower (podium rectangle when asked),
 * the convex hull of the whole mass for an imported one.
 */
export function towerFootprint(t: Tower, podium = false): [number, number][] {
  if (t.imported?.hull.length) {
    const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    return t.imported.hull.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
  }
  return podium ? rectCorners(t.x, t.y, t.podiumWidth, t.podiumDepth, t.rotation) : rectCorners(t.x, t.y, t.width, t.depth, t.rotation)
}
