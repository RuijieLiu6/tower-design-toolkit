// Plan geometry shared by the 3D model and the board drawing: where the lift shafts and exit stairs sit in the core.
// Layout is a team assumption (LOD 100 space reservation): shafts on a grid in the core, kept clear of the exit
// stairs; a group that starts at a sky lobby reuses the position of a shaft that ended below it.
import { stairEnclosure, stairSpots, storeyLoads, type EgressPresets } from './egress'
import type { LiftClass, LiftPresets, Rise } from './lifts'
import { coreSide, towerFloors } from './massing'
import type { Floor, Tower } from './types'

export interface ShaftCell {
  x: number
  y: number
  z0: number
  z1: number
  /** Lift group id (R1, S1, P1) or FF / SV for the firefighter and service lifts. */
  group: string
  cls: LiftClass | 'service'
  kind: 'local' | 'shuttle' | 'service'
  /** Levels where this car stops (for doors in plan). */
  stops: Set<number>
  /** Outside the core box: the core is too small for its shafts at this layout. */
  outside: boolean
}

export interface CoreLayout {
  core: number
  side: number
  shafts: ShaftCell[]
  /** Shafts that do not fit inside the core box. */
  overflow: number
}

export function coreLayout(t: Tower, lift: { rises: Rise[] }, liftP: LiftPresets, e: EgressPresets): CoreLayout {
  const c = coreSide(t)
  // Square shafts 200 mm apart, inside the 400 mm core walls.
  const side = Math.sqrt(liftP.shaftM2), pitch = side + 0.2, inner = Math.max(0, c - 0.8)
  const all = towerFloors(t)
  const top = all.length ? all[all.length - 1].z1 : t.height

  // 1. Slots: one per car; a car whose lobby is a sky lobby reuses a slot whose shaft ended below it.
  const slotTop: number[] = []
  type Item = Omit<ShaftCell, 'x' | 'y' | 'outside'> & { slot: number }
  const items: Item[] = []
  for (const g of [...lift.rises].sort((a, b) => a.baseZ - b.baseZ || a.id.localeCompare(b.id))) {
    const stops = new Set([...g.floors.map((f) => f.level), g.baseLevel])
    for (let k = 0; k < g.cars; k++) {
      const z0 = Math.max(0, g.baseZ - 1.5), z1 = g.topZ + 5
      let slot = slotTop.findIndex((zTop) => zTop < z0 - 0.5)
      if (slot < 0) { slot = slotTop.length; slotTop.push(z1) } else slotTop[slot] = z1
      items.push({ slot, z0, z1, group: g.id, cls: g.cls, kind: g.kind, stops })
    }
  }
  const allLevels = new Set(all.map((f) => f.level))
  for (const id of ['FF', 'SV']) { items.push({ slot: slotTop.length, z0: 0, z1: top + 5, group: id, cls: 'service', kind: 'service', stops: allLevels }); slotTop.push(top + 5) }

  // 2. Cells: a grid inside the core, row by row from the top left, skipping the in-core exit stairs (at their widest);
  //    if the core is full, further cells ring the core and are flagged as outside.
  const loads = storeyLoads(t, e, { homeM2: liftP.homeM2, hotelM2PerKey: liftP.hotelM2PerKey }).filter((s) => !s.podium)
  const widest = Math.max(0, ...loads.map((s) => s.stairMm))
  const enc = stairEnclosure(widest || 1100, loads[0]?.f2f ?? t.f2f, e)
  const stairRects = stairSpots(t, Math.max(2, Math.round(e.stairs)), enc.a, enc.b).filter((s) => s.inCore)
    .map((s) => ({ x0: s.x - enc.a / 2, x1: s.x + enc.a / 2, y0: s.y - enc.b / 2, y1: s.y + enc.b / 2 }))
  const clear = (x: number, y: number) => stairRects.every((r) => x + side / 2 <= r.x0 || x - side / 2 >= r.x1 || y + side / 2 <= r.y0 || y - side / 2 >= r.y1)
  const m0 = Math.max(0, Math.floor((inner + 0.2) / pitch))
  const cells: { x: number; y: number; outside: boolean }[] = []
  const used = new Set<string>()
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`
  // The lattice keeps one parity as it grows, so inner cells stay put.
  const parity = m0 > 0 ? m0 : 1
  for (let grow = 0; cells.length < slotTop.length && grow < 60; grow++) {
    const m = parity + 2 * grow
    const ring: { x: number; y: number }[] = []
    for (let r = 0; r < m; r++) for (let q = 0; q < m; q++) {
      const x = (q - (m - 1) / 2) * pitch, y = ((m - 1) / 2 - r) * pitch
      if (used.has(key(x, y)) || !clear(x, y)) continue
      ring.push({ x, y })
    }
    if (grow > 0 || m0 === 0) ring.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
    for (const p of ring) {
      used.add(key(p.x, p.y))
      const inside = Math.abs(p.x) + side / 2 <= inner / 2 + 1e-6 && Math.abs(p.y) + side / 2 <= inner / 2 + 1e-6
      cells.push({ ...p, outside: !inside })
    }
  }
  const shafts: ShaftCell[] = items.map((it) => { const cell = cells[it.slot] ?? { x: 0, y: 0, outside: true }; return { ...it, x: cell.x, y: cell.y, outside: cell.outside } })
  return { core: c, side, shafts, overflow: new Set(shafts.filter((s) => s.outside).map((s) => `${s.x},${s.y}`)).size }
}

/** A representative floor of the tower's main use: the middle floor of that use (not plant, not a sky lobby). */
export function typicalFloor(t: Tower): Floor | null {
  const tower = towerFloors(t).filter((f) => !f.podium && f.z0 > 0.5 && f.use !== 'mechanical' && !f.skyLobby)
  if (!tower.length) return towerFloors(t)[0] ?? null
  const count = new Map<string, number>()
  for (const f of tower) count.set(f.use, (count.get(f.use) ?? 0) + 1)
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const of = tower.filter((f) => f.use === main)
  return of[Math.floor(of.length / 2)]
}

/** Standard drawing scales, largest first. */
export const SCALES = [100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]

/** Largest standard scale at which an extent (m) fits a sheet area (mm). */
export function fitScale(extentW: number, extentD: number, areaW: number, areaH: number): number {
  return SCALES.find((s) => (extentW * 1000) / s <= areaW && (extentD * 1000) / s <= areaH) ?? SCALES[SCALES.length - 1]
}
