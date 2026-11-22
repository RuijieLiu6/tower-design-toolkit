// Opening field (tool cycle 12, R7 Ridge Gate; R7_SYNTHESIS §3 tool 4): the core may end below an opening
// (`Tower.coreTop`), and the storeys it no longer reaches need their own way out and their own lifts, or are plant.
//
// What this file reads (team method, each line says it):
// - the core top in words, for the structure lines (continuity, core alone);
// - "ear-exits" (egress): every part of a storey the core does not reach (each storey above the core top, as many
//   parts as its plate has outer outlines) against two exits per floor area (VBBL 3.4.2.1), counting the exit stairs the
//   design declares in each part (`Tower.earStairs`); a plant-only part with fewer is a code consultant's case;
// - "core-top-lifts" (core and lifts): the lift shafts end at the core top, so no lift serves the storeys above it; an
//   occupied storey there fails, plant only is a Check (the firefighter lift reaches the top floor, BCBC 3.2.6.5).
import { coreTopLevel, coreTopZ, floorRing, floorsAboveCore, towerFloors } from './massing'
import { coreCentre, storeyCore } from './storeyWeight'
import { isStructureOnlyRing } from './structureOnly'
import type { Floor, RuleResult, RuleState, Source, Tower, UseId } from './types'
import { USES } from './types'

type P = [number, number]

/** Levels in runs: "L75–L78, L80". */
export function levelRuns(levels: number[]): string {
  const lv = [...new Set(levels)].sort((a, b) => a - b), out: string[] = []
  for (let i = 0; i < lv.length; i++) {
    let j = i
    while (j + 1 < lv.length && lv[j + 1] === lv[j] + 1) j++
    out.push(j > i ? `L${lv[i]}–L${lv[j]}` : `L${lv[i]}`)
    i = j
  }
  return out.join(', ')
}

const sArea = (r: P[]) => r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2
function inRing(p: P, r: P[]): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function toRing(p: P, r: P[]): number {
  let d = Infinity
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1]
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)))
    d = Math.min(d, Math.hypot(p[0] - a[0] - ex * k, p[1] - a[1] - ey * k))
  }
  return d
}
const centroid = (r: P[]): P => {
  const a = sArea(r)
  if (Math.abs(a) < 1e-9) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
  let cx = 0, cy = 0
  for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], k = x0 * y1 - x1 * y0; cx += (x0 + x1) * k; cy += (y0 + y1) * k }
  return [cx / (6 * a), cy / (6 * a)]
}

/** The core top in words for the structure lines, or '' when the core runs to the roof. */
export function coreTopText(t: Tower, floors: Floor[] = towerFloors(t)): string {
  const above = floorsAboveCore(t, floors)
  if (!above.length) return ''
  return `The core ends at +${coreTopZ(t)!.toFixed(1)} m (Structure › Lateral & sway › Core top), above L${coreTopLevel(t)}: ${levelRuns(above.map((f) => f.level))} have no core, and its walls run from their own top to the foundation.`
}

/**
 * The parts of a floor's plate in the tower's own frame: its outer outlines (an imported storey's outer rings, with
 * holes and structure-only parts left out; a parametric tower's block at mid-height). Each separate outline is a part a
 * person must leave.
 */
export function floorParts(t: Tower, f: Pick<Floor, 'level' | 'z0' | 'z1'>): P[][] {
  if (t.imported) {
    const s = t.imported.storeys.find((x) => x.level === f.level)
    const loops = ((s?.loops ?? []) as P[][]).filter((r) => r.length >= 3 && Math.abs(sArea(r)) > 1e-6 && !(s && isStructureOnlyRing(s, r)))
    // counter-clockwise rings are outer; a clockwise ring inside one is a hole, else an outer ring wound the other way
    return loops.filter((r) => sArea(r) > 0 || !loops.some((o) => o !== r && sArea(o) > 0 && inRing(r[0], o)))
  }
  const a = (-t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [floorRing(t, f).map(([x, y]) => { const dx = x - t.x, dy = y - t.y; return [dx * c - dy * s, dx * s + dy * c] as P })]
}

/** Does a plate outline hold or touch the square core (centre inside it, or the outline within the core's corners' reach)? */
export function partHoldsCore(ring: P[], core: { x: number; y: number; side: number }): boolean {
  if (!(core.side > 0)) return false
  const c: P = [core.x, core.y]
  return inRing(c, ring) || toRing(c, ring) <= (core.side / 2) * Math.SQRT2 + 0.05
}

/** Compass point (8) of a direction in the tower's own frame, for a project whose true north is `north`° clockwise from +y. */
export function compassOf(t: Pick<Tower, 'rotation'>, d: P, north = 0): string {
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const px = d[0] * c - d[1] * s, py = d[0] * s + d[1] * c
  const b = (((Math.atan2(px, py) * 180) / Math.PI - north) % 360 + 360) % 360
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]
}

/** One part of a storey the core does not reach. */
export interface EarPart { level: number; use: UseId; name: string; area: number; centre: P }

/**
 * The parts of tower storeys that the core does not reach (tool cycle 12): every part of a storey above the core top.
 * Parts are named by the compass point of their centre seen from the core ("E ear"); a storey of one part is "the storey".
 */
export function earParts(t: Tower, o: { north?: number; floors?: Floor[] } = {}): EarPart[] {
  const floors = o.floors ?? towerFloors(t)
  const above = floorsAboveCore(t, floors).filter((f) => !f.podium)
  if (!above.length) return []
  const base = coreCentre(t, floors), at = storeyCore(t, base)
  const out: EarPart[] = []
  for (const f of above) {
    const parts = floorParts(t, f)
    const core = at(f.level)
    for (const r of parts) {
      if (partHoldsCore(r, core)) continue
      const c = centroid(r)
      const name = parts.length > 1 ? `${compassOf(t, [c[0] - core.x, c[1] - core.y], o.north ?? 0)} ear` : 'the storey'
      out.push({ level: f.level, use: f.use, name, area: Math.abs(sArea(r)), centre: c })
    }
  }
  return out
}

/**
 * Exits from the storeys the core does not reach (egress, line "ear-exits"): each part against two exits (3.4.2.1),
 * counting the exit stairs the design declares in each part (`Tower.earStairs`). None when the core reaches every storey.
 */
export function earExitLines(t: Tower, o: { source: Source; north?: number; floors?: Floor[] }): RuleResult[] {
  const ears = earParts(t, o)
  if (!ears.length) return []
  const n = Math.max(0, Math.round(Number.isFinite(t.earStairs) ? (t.earStairs as number) : 0))
  const groups = new Map<string, EarPart[]>()
  for (const e of ears) groups.set(e.name, [...(groups.get(e.name) ?? []), e])
  const occupied = ears.filter((e) => e.use !== 'mechanical')
  const plantOnly = !occupied.length
  const state: RuleState = n >= 2 ? 'pass' : plantOnly ? 'warn' : 'fail'
  const levels = levelRuns(ears.map((e) => e.level))
  const parts = [...groups.entries()].map(([name, g]) => `${name === 'the storey' ? 'one part' : name} (${levelRuns(g.map((e) => e.level))}${g.every((e) => e.use === 'mechanical') ? ', plant' : `, ${[...new Set(g.map((e) => USES[e.use].label.toLowerCase()))].join(', ')}`})`)
  const where = coreTopZ(t) != null ? `above the core top (+${coreTopZ(t)!.toFixed(1)} m)` : 'beside the core'
  const occWord = occupied.length ? `${levelRuns(occupied.map((e) => e.level))} ${[...new Set(occupied.map((e) => USES[e.use].label.toLowerCase()))].join(', ')}` : ''
  return [{
    id: `ear-exits-${t.id}`,
    label: 'Exits where the core does not reach',
    value: `${levels} ${where}: ${parts.join('; ')}; ${n} exit stair${n === 1 ? '' : 's'} declared in each part`,
    threshold: 'each part of a storey: at least 2 exits (3.4.2.1); the core’s stairs do not reach it',
    state,
    flag: 'verified',
    source: { ...o.source, page: '3.4.2.1' },
    specialist: n >= 2
      ? 'Each ear stair must continue to grade as an exit: below the core top it enters the tower (into the core’s stairs by a fire-separated route, or a shaft of its own). A code consultant confirms the route.'
      : plantOnly
        ? 'A plant-only part with fewer than two exits rests on an exception for service spaces this toolkit has not read: a code consultant confirms it, and how its stair reaches grade.'
        : 'Occupied storeys the core does not reach need two exits each, continued to grade: a code consultant confirms the route.',
    note: `The core’s exit stairs end where the core ends, so ${where === 'beside the core' ? 'these parts' : 'the storeys above it'} are left by their own stairs only (Structure › Lateral & sway › Core top: exit stairs in each ear). ${state === 'pass' ? `${n} declared in each part.` : plantOnly ? `Plant only: ${n ? 'one declared stair is a single way out' : 'no stair is declared, so the plant has no way in or out'}; declare two in each part, or have a code consultant accept fewer for a service space.` : `${occWord} are occupied with ${n} way${n === 1 ? '' : 's'} out: declare two exit stairs in each part, make those storeys plant, or carry the core up to them (Core top).`} Separation, width and travel on these storeys are not read (the egress lines above read the core’s stairs on the storeys it reaches). Parts are each storey’s separate outlines (team geometry); the bridge, if any, is not a route.`,
  }]
}

/** The source of the firefighter-lift reach (book notes bcbc-2024.md, read once: unverified). */
export const FIREFIGHTER_LIFT: Source = { label: 'BC Building Code 2024, Division B, 3.2.6.5 firefighter lift: reaches the top floor within 1 min, one change at most (book notes bcbc-2024.md; VBBL 2025 to confirm)', page: 'pp.3-191–192' }

/**
 * Lifts above the core top (core and lifts, line "core-top-lifts"): the shafts end with the core, so the storeys above
 * are not served. An occupied storey there fails; plant only is a Check (the firefighter lift reaches the top floor).
 */
export function coreTopLiftLines(t: Tower, floors: Floor[] = towerFloors(t)): RuleResult[] {
  const above = floorsAboveCore(t, floors).filter((f) => !f.podium)
  if (!above.length) return []
  const occupied = above.filter((f) => f.use !== 'mechanical')
  const last = coreTopLevel(t)
  const uses = [...new Set(occupied.map((f) => USES[f.use].label.toLowerCase()))].join(', ')
  return [{
    id: `core-top-lifts-${t.id}`,
    label: 'Lifts above the core top',
    value: occupied.length ? `no lift above L${last}: ${levelRuns(occupied.map((f) => f.level))} (${uses}) not served` : `no lift above L${last}: ${levelRuns(above.map((f) => f.level))}, plant only, not served`,
    threshold: 'every occupied storey on a lift; the firefighter lift reaches the top floor within 1 min (3.2.6.5)',
    state: occupied.length ? 'fail' : 'warn',
    flag: 'unverified',
    source: FIREFIGHTER_LIFT,
    specialist: occupied.length
      ? 'Occupied storeys above the core top with no lift: a code consultant (accessibility, firefighting) and the vertical-transportation consultant.'
      : 'Whether the firefighter lift must reach plant storeys above the core top, and how equipment reaches them, is a code consultant’s and a vertical-transportation consultant’s reading.',
    note: `The core ends at +${coreTopZ(t)!.toFixed(1)} m, and its lift shafts with it, so the lift rises stop at L${last}: ${levelRuns(above.map((f) => f.level))} are left out of the lift groups and their people out of the demand. ${occupied.length ? 'Make those storeys plant, carry the core (and its lifts) up to them, or give them a lift of their own.' : 'Plant reached by stair; plan how its equipment is lifted in and replaced.'}`,
  }]
}
