// Edits made by the Schematic Plan and Section design tools (LOD 100). Pure functions: each returns the patch the store
// applies once, on release, so a drag is one undo step. Geometry follows engine/blocks.ts: blocks stack bottom-up; a
// block's width runs along its own x axis and its depth along y, both turned by the block's and the tower's rotation.
import { DEFAULT_EGRESS_PRESETS, egressCheck, type EgressPresets } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck, type LiftPresets } from './lifts'
import { applyTowerPatch, blockSpans, blocksOf, coreSide, towerFloors } from './massing'
import type { Block, Floor, RuleResult, Tower } from './types'

export const MIN_SIDE = 6
export const MIN_HEIGHT = 3
export const MIN_CORE_SHARE = 0.04
export const MAX_CORE_SHARE = 0.6

export type Edge = 'e' | 'w' | 'n' | 's'

const local = (b: Block, edge: Edge): [number, number] => {
  const a = (b.rotation * Math.PI) / 180
  // Unit vector of the edge's outward normal in the tower frame.
  return edge === 'e' ? [Math.cos(a), Math.sin(a)] : edge === 'w' ? [-Math.cos(a), -Math.sin(a)] : edge === 'n' ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)]
}

/** Move one edge of block i outward by d metres (inward if negative); the opposite edge stays where it is. */
export function resizeBlockEdge(t: Tower, i: number, edge: Edge, d: number): Block[] {
  const blocks = blocksOf(t).map((b) => ({ ...b }))
  const b = blocks[i]
  if (!b) return blocks
  const key = edge === 'e' || edge === 'w' ? 'width' : 'depth'
  const next = Math.max(MIN_SIDE, b[key] + d)
  const moved = next - b[key]
  const [nx, ny] = local(b, edge)
  b[key] = next
  b.dx += (nx * moved) / 2
  b.dy += (ny * moved) / 2
  return blocks
}

/** Move block i by (ddx, ddy) in the tower frame. */
export function moveBlock(t: Tower, i: number, ddx: number, ddy: number): Block[] {
  return blocksOf(t).map((b, k) => (k === i ? { ...b, dx: b.dx + ddx, dy: b.dy + ddy } : { ...b }))
}

/** Turn block i to `deg` (relative to the tower). */
export function rotateBlock(t: Tower, i: number, deg: number): Block[] {
  const r = ((deg % 360) + 540) % 360 - 180
  return blocksOf(t).map((b, k) => (k === i ? { ...b, rotation: r } : { ...b }))
}

/**
 * Heights a block top snaps to: the current floor lines, and beyond the top of the stack whole floors at the top
 * floor's height (podium blocks: multiples of their own floor height from their base).
 */
export function floorLines(t: Tower, extra = 40): number[] {
  const fl = towerFloors(t)
  const lines = [0, ...fl.map((f) => f.z1)]
  const last = fl[fl.length - 1]
  const h = last ? last.z1 - last.z0 : t.f2f
  for (let k = 1; k <= extra; k++) lines.push((last?.z1 ?? 0) + k * h)
  return lines
}

/** Set the top of block i to height z (the blocks above keep their own heights and ride up or down). */
export function setBlockTop(t: Tower, i: number, z: number, snap = true): Block[] {
  const spans = blockSpans(t)
  const s = spans[i]
  if (!s) return blocksOf(t).map((b) => ({ ...b }))
  let top = Math.max(s.z0 + MIN_HEIGHT, z)
  if (snap) {
    // Floor lines of the stack as it stands, plus whole floors above it; ignore lines that would squash the block.
    const lines = floorLines(t).filter((v) => v >= s.z0 + MIN_HEIGHT - 1e-9)
    if (lines.length) top = lines.reduce((a, v) => (Math.abs(v - top) < Math.abs(a - top) ? v : a))
  }
  return blocksOf(t).map((b, k) => (k === i ? { ...b, height: top - s.z0 } : { ...b }))
}

/** Core sized by its side (m): the share of the typical plate it stands for, and the core switched to manual. */
export function coreSideEdit(t: Tower, side: number): Pick<Tower, 'coreShare' | 'coreAuto'> {
  const share = (side * side) / Math.max(1, t.width * t.depth)
  return { coreShare: Math.min(MAX_CORE_SHARE, Math.max(MIN_CORE_SHARE, Math.round(share * 1000) / 1000)), coreAuto: false }
}

export type LevelKind = 'sky' | 'plant' | 'outrigger'
const LEVEL_KEY = { sky: 'skyLobbies', plant: 'plantLevels', outrigger: 'outriggerFloors' } as const

/** Turn a tower level into (or back from) a sky lobby, a plant floor or an outrigger floor. */
export function toggleLevel(t: Tower, level: number, kind: LevelKind): Partial<Tower> {
  const key = LEVEL_KEY[kind]
  const cur = new Set(t[key] ?? [])
  if (cur.has(level)) cur.delete(level); else cur.add(level)
  return { [key]: [...cur].sort((a, b) => a - b) }
}

/** Set one band's own floor-to-floor (m), or clear it (undefined: the tower's). */
export function setBandF2f(t: Tower, bandIndex: number, f2f: number | undefined): Pick<Tower, 'bands'> {
  return { bands: t.bands.map((b, k) => (k !== bandIndex ? { ...b } : f2f && f2f > 0 ? { ...b, f2f: Math.round(f2f * 100) / 100 } : { use: b.use, share: b.share })) }
}

/** The tower as a drag would leave it (no auto-core solve: the store runs that once on release). */
export function preview(t: Tower, patch: Partial<Tower>): Tower {
  return applyTowerPatch(t, patch)
}

export interface PlanChecks {
  floor: Floor | null
  coreSide: number
  /** Gross plate minus the core at this floor. */
  ntgFloor: number | null
  rules: RuleResult[]
}

/**
 * Live checks beside the Plan tool, from the same engines as the Inspector: core needed vs modelled and net-to-gross
 * (lift check), exit separation and travel (egress check). The floor's own net-to-gross deducts the core only.
 */
export function planChecks(t: Tower, level: number | null, lp: LiftPresets = DEFAULT_LIFT_PRESETS, ep: EgressPresets = DEFAULT_EGRESS_PRESETS): PlanChecks {
  const fl = towerFloors(t)
  const floor = (level !== null ? fl.find((f) => f.level === level) : null) ?? null
  const c = coreSide(t)
  const lift = liftCheck(t, lp, ep, { skipDirect: true })
  const egress = egressCheck(t, ep, { homeM2: lp.homeM2, hotelM2PerKey: lp.hotelM2PerKey })
  const pick = (list: RuleResult[], prefix: string) => list.filter((r) => r.id === `${prefix}-${t.id}`)
  return {
    floor, coreSide: c,
    ntgFloor: floor && floor.area > 0 ? Math.max(0, 1 - (c * c) / floor.area) : null,
    rules: [...pick(lift.rules, 'core-fit'), ...pick(lift.rules, 'ntg'), ...pick(egress.rules, 'separation'), ...pick(egress.rules, 'travel')],
  }
}

/** Live checks beside the Section tool: floor count, height, floor heights by band and the lift-rise rules. */
export function sectionChecks(t: Tower, lp: LiftPresets = DEFAULT_LIFT_PRESETS, ep: EgressPresets = DEFAULT_EGRESS_PRESETS) {
  const fl = towerFloors(t)
  const lift = liftCheck(t, lp, ep, { skipDirect: true })
  const egress = egressCheck(t, ep, { homeM2: lp.homeM2, hotelM2PerKey: lp.hotelM2PerKey })
  return {
    floors: fl.length,
    height: fl.length ? fl[fl.length - 1].z1 : 0,
    gfa: fl.reduce((s, f) => s + f.area, 0),
    rules: [...lift.rules.filter((r) => r.id === `rise-floors-${t.id}` || r.id === `core-fit-${t.id}` || r.id === `firefighter-${t.id}`), ...egress.rules.filter((r) => r.id === `flight-${t.id}` || r.id === `stair-width-${t.id}`)],
  }
}
