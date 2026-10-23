// Imported massing as a tower (research P14-M04): sliced storeys become the tower's floors, so FSR, VTC rules,
// view cones, lifts and egress run on it the same way they run on a parametric box.

import { bounds, plateAt, planHull, signedVolume, storeySchedule, type MeshData } from './importGeom'
import type { Band, Floor, ImportedMass, ImportedStorey, Tower, UseId } from './types'

/** Plates smaller than this are not floors (spire, mast, crown): team assumption, editable per storey. */
export const MIN_FLOOR_AREA = 25

/** Floors of an imported tower: its sliced storeys, with sky lobbies and plant floors applied like a box tower. */
export function importedFloors(t: Tower): Floor[] {
  const m = t.imported!
  const sky = new Set(t.skyLobbies ?? [])
  let towerIndex = 0
  const out: Floor[] = []
  for (const s of m.storeys) {
    if (!s.hasFloor) continue
    if (!s.podium) towerIndex++
    const plant = !s.podium && t.plantEvery > 0 && towerIndex % t.plantEvery === 0
    const isSky = sky.has(s.level) && s.z0 > 0.5 && !s.podium
    out.push({ level: s.level, z0: s.z0, z1: s.z1, use: isSky ? 'amenity' : plant ? 'mechanical' : s.use, area: s.area, podium: s.podium, ...(isSky ? { skyLobby: true } : {}) })
  }
  return out
}

/** Slices the mesh (tower frame, z = 0 at the entrance floor) into storeys at mid-height. */
export function sliceStoreys(mesh: MeshData, o: { f2f: number; podiumTop: number; podiumF2F: number; top?: number }): ImportedStorey[] {
  const top = o.top ?? bounds(mesh).max[2]
  return storeySchedule(top, o.f2f, o.podiumTop, o.podiumF2F).map((b, i) => {
    const p = plateAt(mesh, (b.z0 + b.z1) / 2)
    return { level: i + 1, z0: round(b.z0), z1: round(b.z1), area: Math.round(p.area * 10) / 10, use: 'office' as UseId, podium: b.podium, hasFloor: p.area >= MIN_FLOOR_AREA, loops: p.loops }
  })
}

/** Program tags by share, bottom-up, the same largest-remainder rule as the parametric bands; podium gets podiumUse. */
export function tagByBands(storeys: ImportedStorey[], bands: Band[], podiumUse: UseId): ImportedStorey[] {
  const tower = storeys.filter((s) => !s.podium && s.hasFloor)
  const total = bands.reduce((s, b) => s + Math.max(0, b.share), 0) || 1
  const raw = bands.map((b) => (Math.max(0, b.share) / total) * tower.length)
  const counts = raw.map(Math.floor)
  let left = tower.length - counts.reduce((a, b) => a + b, 0)
  raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { counts[i]++; left-- } })
  const uses: UseId[] = []
  bands.forEach((b, i) => { for (let k = 0; k < counts[i]; k++) uses.push(b.use) })
  let k = 0
  return storeys.map((s) => (s.podium ? { ...s, use: podiumUse } : s.hasFloor ? { ...s, use: uses[k++] ?? s.use } : s))
}

/** Keeps the user's tags when the storeys are re-sliced: each new storey takes the tag of the old storey at its mid-height. */
export function carryTags(next: ImportedStorey[], prev: ImportedStorey[]): ImportedStorey[] {
  if (!prev.length) return next
  return next.map((s) => {
    const mid = (s.z0 + s.z1) / 2
    const old = prev.find((p) => mid >= p.z0 && mid < p.z1)
    return old ? { ...s, use: old.use, hasFloor: old.hasFloor && s.area >= MIN_FLOOR_AREA ? true : s.hasFloor && old.hasFloor } : s
  })
}

/** Median of the floored tower plates (the "typical floor"). */
export function typicalPlate(storeys: ImportedStorey[], podium = false): number {
  const a = storeys.filter((s) => s.hasFloor && s.podium === podium).map((s) => s.area).sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0
}

/**
 * Tower fields the other checks read. width x depth is an equivalent rectangle of the typical plate (same area,
 * same proportions as the mass's plan bounds): core, lift and stair sizing work on area, so they stay valid
 * (team assumption); the real outline is in `imported.hull`.
 */
export function towerPatch(m: ImportedMass): Partial<Tower> {
  const box = (pts: [number, number][]) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    return { w: Math.max(1, Math.max(...xs) - Math.min(...xs)), d: Math.max(1, Math.max(...ys) - Math.min(...ys)) }
  }
  const hb = box(m.hull.length ? m.hull : [[0, 0], [1, 1]])
  // Proportions of the typical plate's own outline (the median floored storey), else of the whole mass.
  const ratio = (podium: boolean) => {
    const fl = m.storeys.filter((s) => s.hasFloor && s.podium === podium && s.loops.length)
    const s = fl[Math.floor(fl.length / 2)]
    const b = s ? box(s.loops.flat()) : hb
    return b.w / b.d
  }
  const eq = (area: number, r: number) => {
    const a = Math.max(1, area)
    return { w: Math.round(Math.sqrt(a * r) * 10) / 10, d: Math.round(Math.sqrt(a / r) * 10) / 10 }
  }
  const tw = eq(typicalPlate(m.storeys) || hb.w * hb.d, ratio(false)), pd = eq(typicalPlate(m.storeys, true) || 1, ratio(true))
  const hasPodium = m.storeys.some((s) => s.podium)
  return {
    imported: m,
    height: Math.round(m.top * 10) / 10,
    f2f: m.f2f,
    width: tw.w, depth: tw.d,
    podiumHeight: hasPodium ? m.podiumTop : 0,
    podiumWidth: hasPodium ? pd.w : tw.w, podiumDepth: hasPodium ? pd.d : tw.d,
    podiumUse: m.storeys.find((s) => s.podium)?.use ?? 'retail',
  }
}

/** Plate-sum check (P14-M04): sum of plate area x storey height against the mesh volume (sliced part only). */
export function plateSumCheck(m: ImportedMass): { sum: number; volume: number; error: number } | null {
  if (m.volume == null || m.volume <= 0) return null
  const sum = m.storeys.reduce((s, x) => s + x.area * (x.z1 - x.z0), 0)
  return { sum, volume: m.volume, error: (sum - m.volume) / m.volume }
}

/** Mesh volume between z0 and z1 is not cut out; this is the whole closed mesh, so the crown above the last storey counts too. */
export function meshVolume(mesh: MeshData, closed: boolean): number | null {
  if (!closed) return null
  const v = signedVolume(mesh)
  return Math.abs(v)
}

export function hullOf(mesh: MeshData) {
  return planHull(mesh).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number])
}

const round = (v: number) => Math.round(v * 1000) / 1000
