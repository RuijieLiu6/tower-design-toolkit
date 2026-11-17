// Floors picked in Program (Sinnie, 13 Nov: "users should be able to see division of floors so when im in program i can
// select floors and adjust the programming type"). One tower at a time; a click picks a floor, Shift extends the range
// from the last pick, Ctrl / Cmd adds or removes one. The picked floors take a use of their own (Tower.floorUses), which
// every check reads through engine/massing.ts towerFloors.
import { create } from 'zustand'
import { towerFloors, towerFootprint } from '../engine/massing'
import { towerOccluders } from '../engine/solarRules'
import type { Band, Floor, Tower, UseId } from '../engine/types'
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

/** Gives the picked floors a use of their own (one undo step), then folds the result into the bands. */
export function setPickedUse(use: UseId) {
  const { tower, levels } = useFloorPick.getState()
  const t = towerById(tower)
  if (!t || !levels.length) return
  const own = { ...(t.floorUses ?? {}) }
  for (const l of levels) own[l] = use
  useStore.getState().updateTower(t.id, { floorUses: own })
  foldIntoBands(t.id)
}

/**
 * The bands rebuilt from the floors as they now stand (17 Nov, Sinnie: "when I make changes directly on the viewport,
 * it should also reflect on the equalizer on the side"): every run of tower floors with one use becomes a band whose
 * share is its count of floors, so the Program sliders show what the model shows and the per-floor overrides are no
 * longer needed above the podium (podium floors keep theirs: the bands do not cover the podium). Sky lobbies and plant
 * floors are replacements of a band's floor, so they take the use of the floor under them. The shares round-trip
 * exactly through bandCounts (largest remainder) when every band shares the tower's floor-to-floor; a tower whose
 * bands set their own floor-to-floor keeps its overrides instead.
 */
export function bandsFromFloors(t: Tower): { bands: Band[]; floorUses: Partial<Record<number, UseId>> | undefined } | null {
  if (t.imported || !t.floorUses || t.bands.some((b) => b.f2f && b.f2f > 0 && Math.abs(b.f2f - t.f2f) > 1e-6)) return null
  const floors = towerFloors(t).filter((f) => !f.podium)
  if (!floors.length) return null
  const plant = new Set(t.plantLevels ?? [])
  const uses: UseId[] = []
  floors.forEach((f, i) => {
    const replaced = f.skyLobby || plant.has(f.level) || (t.plantEvery > 0 && (i + 1) % t.plantEvery === 0 && f.use === 'mechanical')
    uses.push(replaced ? (uses[i - 1] ?? (floors.find((g, k) => k > i && !g.skyLobby && g.use !== 'mechanical')?.use ?? f.use)) : f.use)
  })
  const bands: Band[] = []
  for (const u of uses) { const last = bands[bands.length - 1]; if (last && last.use === u) last.share += 1 / uses.length; else bands.push({ use: u, share: 1 / uses.length }) }
  // podium floors keep their own uses; the tower floors are the bands now
  const keep: Partial<Record<number, UseId>> = {}
  const podiumLevels = new Set(towerFloors(t).filter((f) => f.podium).map((f) => f.level))
  for (const [k, v] of Object.entries(t.floorUses)) if (podiumLevels.has(Number(k)) && v) keep[Number(k)] = v
  return { bands, floorUses: Object.keys(keep).length ? keep : undefined }
}
export function foldIntoBands(id: string) {
  const t = towerById(id)
  if (!t) return
  const r = bandsFromFloors(t)
  if (r) useStore.getState().updateTower(t.id, { bands: r.bands, floorUses: r.floorUses })
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
    // A parametric tower's casters each run from the ground to their block's top, so every block below a floor's top
    // "holds" it: the floor's own plate is the block with the lowest top above it (17 Nov, Sinnie: a twisted or tapered
    // shaft showed a second, straight mass, every floor having taken the smallest plate, the top block's). Ties (two
    // blocks ending together) keep the old rule: the larger for podium floors, the smaller above.
    const own = holds.reduce((a, p) => (p.z1 < a.z1 - 1e-6 || (Math.abs(p.z1 - a.z1) <= 1e-6 && (f.podium ? area(p.ring) > area(a.ring) : area(p.ring) < area(a.ring))) ? p : a))
    const rings = t.imported ? holds.map((p) => p.ring) : [own.ring]
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

// Dev hook for browser checks (scratchpad fold-check.mjs).
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tdtFp: unknown }).__tdtFp = { pickLevels, setPickedUse, foldIntoBands, bandsFromFloors }
