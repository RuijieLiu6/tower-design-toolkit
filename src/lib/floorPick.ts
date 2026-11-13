// Floors picked in Program (Sinnie, 13 Nov: "users should be able to see division of floors so when im in program i can
// select floors and adjust the programming type"). One tower at a time; a click picks a floor, Shift extends the range
// from the last pick, Ctrl / Cmd adds or removes one. The picked floors take a use of their own (Tower.floorUses), which
// every check reads through engine/massing.ts towerFloors.
import { create } from 'zustand'
import { towerFloors, towerFootprint } from '../engine/massing'
import { towerOccluders } from '../engine/solarRules'
import type { Floor, Tower, UseId } from '../engine/types'
import { useStore } from '../store'

type Pt = [number, number]

interface FloorPick { tower: string | null; levels: number[]; anchor: number | null }
export const useFloorPick = create<FloorPick>(() => ({ tower: null, levels: [], anchor: null }))

const range = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i)

export function pickFloor(tower: string, level: number, mode: 'one' | 'range' | 'toggle' = 'one') {
  const s = useFloorPick.getState()
  if (useStore.getState().selectedTower !== tower) useStore.getState().selectTower(tower)
  if (s.tower !== tower || mode === 'one' || s.anchor === null) { useFloorPick.setState({ tower, levels: [level], anchor: level }); return }
  if (mode === 'range') { useFloorPick.setState({ levels: range(s.anchor, level) }); return }
  const has = s.levels.includes(level)
  useFloorPick.setState({ levels: has ? s.levels.filter((l) => l !== level) : [...s.levels, level].sort((a, b) => a - b), anchor: level })
}
export function pickLevels(tower: string, from: number, to: number) {
  if (useStore.getState().selectedTower !== tower) useStore.getState().selectTower(tower)
  useFloorPick.setState({ tower, levels: range(from, to), anchor: from })
}
export const clearFloorPick = () => useFloorPick.setState({ tower: null, levels: [], anchor: null })

const towerById = (id: string | null) => { const s = useStore.getState(); return s.towers[s.project].find((t) => t.id === id) }

/** Gives the picked floors a use of their own (one undo step). */
export function setPickedUse(use: UseId) {
  const { tower, levels } = useFloorPick.getState()
  const t = towerById(tower)
  if (!t || !levels.length) return
  const own = { ...(t.floorUses ?? {}) }
  for (const l of levels) own[l] = use
  useStore.getState().updateTower(t.id, { floorUses: own })
}
/** Hands the picked floors (or every floor) back to the bands. */
export function resetFloorUses(all = false) {
  const { tower, levels } = useFloorPick.getState()
  const t = towerById(tower) ?? towerById(useStore.getState().selectedTower)
  if (!t?.floorUses) return
  if (all) { useStore.getState().updateTower(t.id, { floorUses: undefined }); return }
  const own = { ...t.floorUses }
  for (const l of levels) delete own[l]
  useStore.getState().updateTower(t.id, { floorUses: Object.keys(own).length ? own : undefined })
}

/** Each floor of a tower with its plate outline(s) in the project frame (the solar engine's casters, so imported and
 * drawn masses read as they are built). */
export function floorPlates(t: Tower): { f: Floor; rings: Pt[][] }[] {
  const prisms = towerOccluders([t]).prisms as { ring: Pt[]; z0: number; z1: number }[]
  const area = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }
  const out: { f: Floor; rings: Pt[][] }[] = []
  for (const f of towerFloors(t)) {
    if (f.z1 <= 0) continue
    const mid = (f.z0 + f.z1) / 2
    const holds = prisms.filter((p) => p.z0 <= mid && mid < p.z1)
    if (!holds.length) { out.push({ f, rings: [towerFootprint(t) as Pt[]] }); continue }
    const rings = t.imported ? holds.map((p) => p.ring) : [holds.reduce((a, p) => ((f.podium ? area(p.ring) > area(a.ring) : area(p.ring) < area(a.ring)) ? p : a)).ring]
    out.push({ f, rings })
  }
  return out
}

/** Consecutive floors of one use, bottom-up (the stack's labels and the schedule). */
export function floorRuns(floors: Floor[]): { use: UseId; from: number; to: number; count: number; area: number }[] {
  const out: { use: UseId; from: number; to: number; count: number; area: number }[] = []
  for (const f of floors) {
    const last = out[out.length - 1]
    if (last && last.use === f.use && f.level === last.to + 1) { last.to = f.level; last.count++; last.area += f.area }
    else out.push({ use: f.use, from: f.level, to: f.level, count: 1, area: f.area })
  }
  return out
}
