// Opening field (tool cycle 12, R7 Ridge Gate; R7_SYNTHESIS §3 tool 4): the core may end below an opening
// (`Tower.coreTop`), and the storeys it no longer reaches need their own way out and their own lifts, or are plant.
//
// What this file reads (team method, each line says it):
// - the core top in words, for the structure lines (continuity, core alone);
// - "ear-exits" (egress): every part of a storey the core does not reach (each storey above the core top, as many
//   parts as its plate has outer outlines) against two exits per floor area (VBBL 3.4.2.1), counting the exit stairs the
//   design declares in each part (`Tower.earStairs`); a plant-only part with fewer is a code consultant's case;
// - "core-top-lifts" (core and lifts): the lift shafts end at the core top, so no lift serves the storeys above it; an
//   occupied storey there fails, plant only is a Check (the firefighter lift reaches the top floor, BCBC 3.2.6.5);
// - openings (`Tower.apertures`): a slab of space `width` wide from sill to head along a line of sight, read against the
//   storey outlines it crosses: "aperture-core" (the core inside it), "aperture-sky" (its own clear area and its angular
//   size straight on from the viewpoint it is aimed at; the clear outline is handed on as `outline`), "aperture-bridge"
//   (what spans its head, read as a tie between the ears beside it, by a depth rule of thumb). The ears beside an
//   opening that the core does not reach join "ear-exits".
import { coreTopLevel, coreTopZ, floorRing, floorsAboveCore, hasCoreAt, towerFloors } from './massing'
import { arcmin2, DEFAULT_VIEW_M, SILHOUETTE_SOURCE, SKY_ARCMIN2 } from './silhouette'
import { coreCentre, storeyCore } from './storeyWeight'
import { isStructureOnlyRing, structureParts } from './structureOnly'
import type { Aperture, Floor, RuleResult, RuleState, Source, Tower, UseId } from './types'
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
 * The parts of tower storeys that the core does not reach (tool cycle 12): every part of a storey above the core top,
 * and every part beside an opening (a storey whose mid-height lies inside one) that does not hold the core. Parts are
 * named by the compass point of their centre seen from the core ("E ear"); a storey of one part is "the storey".
 */
export function earParts(t: Tower, o: { north?: number; floors?: Floor[] } = {}): EarPart[] {
  const floors = o.floors ?? towerFloors(t)
  const ap = aperturesOf(t)
  const inOpening = (f: Floor) => ap.some((a) => (f.z0 + f.z1) / 2 > a.z0 && (f.z0 + f.z1) / 2 < a.z1)
  const above = floors.filter((f) => !f.podium && (!hasCoreAt(t, f.level) || inOpening(f)))
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
  const allAbove = ears.every((e) => !hasCoreAt(t, e.level))
  const where = allAbove ? `above the core top (+${coreTopZ(t)!.toFixed(1)} m)` : 'beside an opening'
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
    note: `The core’s exit stairs do not reach ${allAbove ? 'the storeys above the core top' : 'these parts (beside an opening, clear of the core, or above the core top)'}, so they are left by their own stairs only (Structure › Lateral & sway › Core top: exit stairs in each ear). ${state === 'pass' ? `${n} declared in each part.` : plantOnly ? `Plant only: ${n ? 'one declared stair is a single way out' : 'no stair is declared, so the plant has no way in or out'}; declare two in each part, or have a code consultant accept fewer for a service space.` : `${occWord} are occupied with ${n} way${n === 1 ? '' : 's'} out: declare two exit stairs in each part, make those storeys plant, or carry the core up to them (Core top).`} Separation, width and travel on these storeys are not read (the egress lines above read the core’s stairs on the storeys it reaches). Parts are each storey’s separate outlines (team geometry); the bridge, if any, is not a route.`,
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

// --- Openings (tool cycle 12) -----------------------------------------------------------------------------------------

type Iv = [number, number]
const merge = (iv: Iv[]): Iv[] => {
  const s = iv.filter(([l, r]) => r > l).sort((a, b) => a[0] - b[0]), out: Iv[] = []
  for (const [l, r] of s) { const last = out[out.length - 1]; if (last && l <= last[1] + 1e-9) last[1] = Math.max(last[1], r); else out.push([l, r]) }
  return out
}
const cut = (a: Iv[], b: Iv[]): Iv[] => {
  let cur = a
  for (const [m, n] of b) cur = cur.flatMap(([l, r]): Iv[] => (n <= l || m >= r ? [[l, r]] : [...(m > l ? [[l, m] as Iv] : []), ...(n < r ? [[n, r] as Iv] : [])]))
  return cur.filter(([l, r]) => r - l > 1e-9)
}
const meet = (a: Iv[], b: Iv[]): Iv[] => merge(a.flatMap(([l, r]) => b.map(([m, n]) => [Math.max(l, m), Math.min(r, n)] as Iv)))
const span = (a: Iv[]) => a.reduce((s, [l, r]) => s + r - l, 0)

/** The tower's openings, valid (a width, a head above the sill), bottom-up. */
export function aperturesOf(t: Pick<Tower, 'apertures'>): Aperture[] {
  return (t.apertures ?? []).filter((a) => a && Number.isFinite(a.z0) && Number.isFinite(a.z1) && a.z1 > a.z0 + 0.1 && Number.isFinite(a.width) && a.width > 0.1).sort((a, b) => a.z0 - b.z0)
}

/** One storey band the opening crosses: its heights inside the opening and what stays clear across it (m from the axis). */
export interface ApertureRow { level: number; z0: number; z1: number; clear: Iv[]; plate: Iv[]; structure: Iv[]; core: Iv[] }
export interface ApertureReading {
  aperture: Aperture
  /** Unit vectors in the tower frame: along the line of sight, and across it (to the left looking along the bearing). */
  dir: P
  across: P
  /** The point on the axis (tower frame) the offsets are measured from. */
  centre: P
  rows: ApertureRow[]
  /** Height of the opening inside the model's storeys (m), and above the tower's top (m). */
  covered: number
  aboveTop: number
  /** Width × height (m²), and what stays clear of plates, structure-only parts and the core (m²). */
  gross: number
  clearArea: number
  /** The clear part as rectangles in the opening's plane: u across from the axis (m), z above grade (m). For the silhouette's viewpoint reading. */
  outline: { u0: number; u1: number; z0: number; z1: number }[]
  /** The core inside the opening: its side and the heights it stands there (null when it never does). */
  core: { side: number; z0: number; z1: number; height: number } | null
  /** What spans the head: storeys from the head up whose outlines cover the whole width (null: nothing). */
  head: { z0: number; z1: number; depth: number; structureOnly: boolean } | null
  /** The ears either side of the opening (the compass point of each side) and their levels. */
  ears: { side: -1 | 1; name: string; levels: number[] }[]
  /** Viewing distance (m) and the clear area's angular size straight on (arcmin²). */
  distance: number
  arcmin2: number
}

/** The line of sight of an opening in the tower frame (unit vector): its true bearing with the project's north, else its axis. */
export function apertureDir(t: Pick<Tower, 'rotation'>, a: Aperture, north = 0): P {
  if (Number.isFinite(a.bearing)) {
    const b = (((a.bearing as number) + north) * Math.PI) / 180, px = Math.sin(b), py = Math.cos(b)
    const r = (-t.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
    return [px * c - py * s, px * s + py * c]
  }
  const x = ((a.axis ?? 0) * Math.PI) / 180
  return [Math.cos(x), Math.sin(x)]
}

/**
 * Reads one opening against the tower (tower frame): each storey band it crosses, cut by the plates (imported outlines,
 * or the parametric block), the structure-only parts and the core of that storey, projected on the axis across the line
 * of sight (a line along the bearing misses a connected outline exactly when it passes outside the outline's extent).
 */
export function apertureReading(t: Tower, a: Aperture, north = 0): ApertureReading {
  const floors = towerFloors(t)
  const base = coreCentre(t, floors), at = storeyCore(t, base)
  const dir = apertureDir(t, a, north), across: P = [-dir[1], dir[0]]
  // the core of the highest storey with a core at or below the sill
  const below = floors.filter((f) => f.z0 <= a.z0 + 0.01 && hasCoreAt(t, f.level))
  const cAt = at(below.length ? below[below.length - 1].level : floors[0]?.level ?? 1)
  const centre: P = a.centre?.length === 2 && a.centre.every(Number.isFinite) ? [a.centre[0], a.centre[1]] : [cAt.x, cAt.y]
  const off = (p: P) => (p[0] - centre[0]) * across[0] + (p[1] - centre[1]) * across[1]
  const ext = (r: P[]): Iv => { let l = Infinity, h = -Infinity; for (const p of r) { const v = off(p); if (v < l) l = v; if (v > h) h = v } return [l, h] }
  const half = a.width / 2, strip: Iv[] = [[-half, half]]
  // storey bands: an imported tower's storeys (floors or not), else the floors, plus parametric structure-only blocks
  type Band = { level: number; z0: number; z1: number; plates: P[][]; structure: P[][]; floor: boolean }
  const bands: Band[] = []
  if (t.imported) {
    for (const s of [...t.imported.storeys].sort((x, y) => x.z0 - y.z0)) {
      const loops = (s.loops as P[][]).filter((r) => r.length >= 3)
      bands.push({ level: s.level, z0: s.z0, z1: s.z1, plates: loops.filter((r) => !isStructureOnlyRing(s, r)), structure: loops.filter((r) => isStructureOnlyRing(s, r)), floor: s.hasFloor })
    }
  } else {
    for (const f of floors) bands.push({ level: f.level, z0: f.z0, z1: f.z1, plates: floorParts(t, f), structure: [], floor: true })
    for (const sp of structureParts(t)) bands.push({ level: 0, z0: sp.z0, z1: sp.z1, plates: [], structure: [sp.ring], floor: false })
    bands.sort((x, y) => x.z0 - y.z0)
  }
  const coreOf = (b: Band): Iv[] => {
    if (!b.level || !hasCoreAt(t, b.level)) return []
    const c = at(b.level)
    if (!(c.side > 0)) return []
    const h = c.side / 2
    return [ext([[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x + h, c.y + h], [c.x - h, c.y + h]])]
  }
  const rows: ApertureRow[] = []
  for (const b of bands) {
    const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1)
    if (z1 - z0 < 0.01) continue
    const plate = meet(merge(b.plates.map(ext)), strip), structure = meet(merge(b.structure.map(ext)), strip), core = meet(coreOf(b), strip)
    rows.push({ level: b.level, z0, z1, plate, structure, core, clear: cut(cut(cut(strip, plate), structure), core) })
  }
  const covered = rows.reduce((s, r) => s + r.z1 - r.z0, 0)
  const top = bands.length ? Math.max(...bands.map((b) => b.z1)) : 0
  const clearArea = rows.reduce((s, r) => s + span(r.clear) * (r.z1 - r.z0), 0)
  const clash = rows.filter((r) => span(r.core) > 0.01)
  const core = clash.length ? { side: at(clash[0].level).side, z0: Math.min(...clash.map((r) => r.z0)), z1: Math.max(...clash.map((r) => r.z1)), height: clash.reduce((s, r) => s + r.z1 - r.z0, 0) } : null
  // what spans the head: contiguous storeys from the head up whose outlines (plates or structure) cover the whole width;
  // structure-only when no plate crosses the opening there
  let head: ApertureReading['head'] = null
  let z = a.z1
  for (const b of bands) {
    if (b.z1 <= z + 0.01) continue
    if (b.z0 > z + 0.05) break
    if (cut(strip, merge([...b.plates, ...b.structure].map(ext))).length) break
    const so = !b.plates.some((r) => meet([ext(r)], strip).length > 0)
    const z0: number = head ? head.z0 : Math.max(a.z1, b.z0)
    head = { z0, z1: b.z1, depth: b.z1 - z0, structureOnly: (head ? head.structureOnly : true) && so }
    z = b.z1
  }
  // ears: plates wholly on one side of the opening, on the floor storeys inside it
  const side = new Map<-1 | 1, Set<number>>()
  for (const b of bands) {
    const mid = (b.z0 + b.z1) / 2
    if (!b.floor || mid <= a.z0 || mid >= a.z1) continue
    for (const r of b.plates) {
      const [l, h] = ext(r)
      const k: -1 | 1 | 0 = h <= -half + 0.05 ? -1 : l >= half - 0.05 ? 1 : 0
      if (k) side.set(k, (side.get(k) ?? new Set<number>()).add(b.level))
    }
  }
  const nameOf = (k: -1 | 1) => `${compassOf(t, [across[0] * k, across[1] * k], north)} ear`
  const ears = ([-1, 1] as const).filter((k) => side.has(k)).map((k) => ({ side: k, name: nameOf(k), levels: [...side.get(k)!].sort((x, y) => x - y) }))
  const distance = a.distance && a.distance > 0 ? a.distance : DEFAULT_VIEW_M
  return {
    aperture: a, dir, across, centre, rows, covered, aboveTop: Math.max(0, a.z1 - Math.max(a.z0, top)), gross: a.width * (a.z1 - a.z0), clearArea,
    outline: rows.flatMap((r) => r.clear.map(([u0, u1]) => ({ u0, u1, z0: r.z0, z1: r.z1 }))), core, head, ears, distance, arcmin2: arcmin2(clearArea, distance),
  }
}

const m1 = (v: number) => v.toFixed(1)
const km = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`)
const nameAp = (a: Aperture, k: number, n: number) => (a.label ? `${a.label}: ` : n > 1 ? `opening ${k + 1}: ` : '')
const zs = (z0: number, z1: number) => `+${m1(z0)}–${m1(z1)} m`
const worst = (s: RuleState[]): RuleState => (s.includes('fail') ? 'fail' : s.includes('warn') ? 'warn' : s.includes('pass') ? 'pass' : 'unknown')
const TEAM_OPENING: Source = { label: 'Team geometry check on the opening (R7 Ridge Gate: never through the core; vtc-entry G23)' }
/** The overcast line: Shang & Bishop's recognition area at 7% contrast (min²), as read in Garnero & Fabrizio (the silhouette's source). */
export const OVERCAST_ARCMIN2 = 250

/** Parallel-chord truss depth about span/8–13, economical to about 35–45 m (Allen & Iano p.106, read once: unverified). */
export const TRUSS_DEPTH = { low: 8, high: 13, economicalTo: 45 }
const BRIDGE_SOURCE: Source = { label: "Allen & Iano, The Architect's Studio Companion, 5th ed. (truss depth, an analogue); BC Building Code 2024, Division B, 4.1.8.14 (adjacent structures: separate them or connect them; book notes bcbc-2024.md)", page: 'p.106; pp.4-493–494' }

/**
 * The opening lines for the Structure tool's Lateral & sway tab (tool cycle 12): the core clear of the opening, the sky
 * through it, and what spans its head read as a tie between the ears. None without an opening.
 */
export function apertureLines(t: Tower, north = 0): RuleResult[] {
  const list = aperturesOf(t)
  if (!list.length) return []
  const reads = list.map((a) => apertureReading(t, a, north))
  const n = reads.length
  const parametric = !t.imported
  const ct = coreTopZ(t)
  // 1 · the core inside the opening
  const coreStates = reads.map((r) => (r.core ? 'fail' : 'pass') as RuleState)
  const coreValue = reads.map((r, k) => `${nameAp(r.aperture, k, n)}${r.core ? `the ${m1(r.core.side)} m core stands in the opening over ${zs(r.core.z0, r.core.z1)} (${m1(r.core.height)} of ${m1(r.aperture.z1 - r.aperture.z0)} m)` : ct != null && ct <= r.aperture.z0 + 0.05 ? `clear: the core ends at +${m1(ct)} m, at or below the sill (+${m1(r.aperture.z0)} m)` : 'clear: the core stands beside the opening'}`).join('; ')
  // 2 · the sky through it (its own clear area, straight on from the viewpoint it is aimed at)
  const limit = (r: ApertureReading) => (r.aperture.overcast ? OVERCAST_ARCMIN2 : SKY_ARCMIN2)
  const skyStates = reads.map((r) => (r.clearArea > 0 && r.arcmin2 >= limit(r) - 1e-9 ? 'pass' : 'warn') as RuleState)
  const skyValue = reads.map((r, k) => `${nameAp(r.aperture, k, n)}clear ${Math.round(r.clearArea).toLocaleString('en-CA')} of ${Math.round(r.gross).toLocaleString('en-CA')} m² (${m1(r.aperture.width)} × ${m1(r.aperture.z1 - r.aperture.z0)} m); straight on from ${km(r.distance)}: ${Math.round(r.arcmin2)} arcmin²`).join('; ')
  const blockers = (r: ApertureReading) => {
    const w = (f: (x: ApertureRow) => Iv[]) => r.rows.reduce((s, x) => s + span(f(x)) * (x.z1 - x.z0), 0)
    const pl = w((x) => cut(x.plate, x.core)), st = w((x) => cut(cut(x.structure, x.plate), x.core)), co = w((x) => x.core)
    return [pl > 0.5 ? `plates ${Math.round(pl)} m²` : '', st > 0.5 ? `structure-only parts ${Math.round(st)} m²` : '', co > 0.5 ? `the core ${Math.round(co)} m²` : '', r.aboveTop > 0.05 ? `${m1(r.aboveTop)} m of it above the tower's top (not framed)` : ''].filter(Boolean).join(', ')
  }
  // 3 · what spans the head, as a tie between the ears
  const bridgeStates: RuleState[] = [], bridgeValue: string[] = [], bridgeNotes: string[] = []
  reads.forEach((r, k) => {
    const L = r.aperture.width, both = r.ears.length === 2, pre = nameAp(r.aperture, k, n)
    const pair = r.ears.map((e) => e.name).join(' and ')
    if (!r.head) {
      bridgeStates.push('unknown')
      bridgeValue.push(`${pre}${both ? `no bridge over the opening: the ${pair} stand as two separate towers on the storey below` : 'nothing spans the head, and the opening has ears on one side at most: nothing to tie'}`)
      return
    }
    const ratio = L / Math.max(0.01, r.head.depth)
    if (!r.head.structureOnly) {
      bridgeStates.push('warn')
      bridgeValue.push(`${pre}floors span the ${m1(L)} m opening at ${zs(r.head.z0, r.head.z1)}${both ? `, tying the ${pair}` : ''}: their columns start over the opening`)
      bridgeNotes.push('Floors over the opening carry columns that start above it: a transfer over the opening, which the structural engineer designs.')
      return
    }
    const ok = ratio <= TRUSS_DEPTH.high + 1e-9 && L <= TRUSS_DEPTH.economicalTo + 1e-9
    bridgeStates.push(ok ? 'pass' : 'warn')
    bridgeValue.push(`${pre}a ${m1(r.head.depth)} m deep structure-only bridge at ${zs(r.head.z0, r.head.z1)} spans the ${m1(L)} m opening${both ? ` and ties the ${pair}` : ''}: span/depth ${m1(ratio)}`)
    if (!ok) bridgeNotes.push(ratio > TRUSS_DEPTH.high ? `At span/depth ${m1(ratio)} it is shallower than a parallel-chord truss (about span/${TRUSS_DEPTH.low}–${TRUSS_DEPTH.high}): deepen it, or the engineer carries it as a Vierendeel or a deep girder.` : `A ${m1(L)} m span is past the trusses' economical range (${TRUSS_DEPTH.economicalTo} m): narrow the opening or accept a long-span bridge.`)
  })
  const sp = parametric ? 'A parametric box cannot cut an opening: draw the form or import it, so the opening is in the model.' : ''
  const out: RuleResult[] = []
  out.push({
    id: 'aperture-core', label: 'Opening clear of the core',
    value: coreValue,
    threshold: 'the core never inside the opening (an opening through the core reads as a loggia framing it)',
    state: worst(coreStates), flag: 'team_assumption', source: TEAM_OPENING,
    note: `Each opening is a slab of space its width wide, from sill to head, running straight through the plan along its line of sight (${reads.map((r) => (Number.isFinite(r.aperture.bearing) ? `bearing ${m1(r.aperture.bearing!)}°` : `axis ${m1(r.aperture.axis ?? 0)}° in the tower frame`)).join(', ')}), centred ${reads.some((r) => r.aperture.centre) ? 'on the point given' : 'on the core at the sill'}. The core of each storey it crosses (core steps and the core top applied) is tested against it.${worst(coreStates) === 'fail' ? ' End the core below the sill (Structure › Lateral & sway › Core top), or move the opening beside the core.' : ''}`,
  })
  out.push({
    id: 'aperture-sky', label: 'Sky through the opening',
    value: skyValue,
    threshold: `≥ ${SKY_ARCMIN2} arcmin² straight on (Shang & Bishop, 13% contrast); ≥ ${OVERCAST_ARCMIN2} under overcast (7%)${reads.some((r) => r.aperture.overcast) ? ', the overcast line judged' : ''}`,
    state: worst(skyStates), flag: 'team_assumption', source: SILHOUETTE_SOURCE,
    ...(sp ? { specialist: sp } : {}),
    note: `The opening's own clear area: lines along its line of sight through every storey band it crosses, blocked where a plate, a structure-only part or the core stands across it (${reads.map((r) => blockers(r) || 'nothing in the way').join('; ')}). Its angular size straight on is area ÷ distance², in arcmin² (the silhouette reading's conversion), from the viewpoint it is aimed at (its distance) or 2 km. What stands behind it, haze and the viewpoint's own angle are not read here: the clear outline is handed to the silhouette's viewpoint reading.${sp ? ` ${sp}` : ''}`,
  })
  out.push({
    id: 'aperture-bridge', label: 'Bridge as a tie between the ears',
    value: bridgeValue.join('; '),
    threshold: `parallel-chord truss depth about span/${TRUSS_DEPTH.low}–${TRUSS_DEPTH.high}, economical to about 35–${TRUSS_DEPTH.economicalTo} m (p.106); tied ears are one structure (4.1.8.14: separate them or connect them)`,
    state: worst(bridgeStates), flag: 'unverified', source: BRIDGE_SOURCE,
    ...(bridgeStates.some((s) => s !== 'unknown') ? { specialist: 'The bridge ties the ears’ tops: it carries the force that keeps them together under wind and earthquake (their different stiffness, the wind through the gate), and its bearings into the ears take it. A depth rule of thumb, not a member check: the structural engineer designs it.' } : {}),
    note: `Method (screening): what spans the head is the run of storeys from the head up whose outlines cover the opening's whole width; structure-only when no plate crosses the opening there. Its span is the opening's width and its depth the run's height, read against the parallel-chord truss depth of Allen & Iano (p.106, read once, an analogue). With a bridge the ears are connected, one structure for the code (4.1.8.14: adjacent structures are separated by the square root of the sum of their squared deflections, or connected); without one each ear stands alone on the storey below.${bridgeNotes.length ? ` ${bridgeNotes.join(' ')}` : ''}`,
  })
  return out
}
