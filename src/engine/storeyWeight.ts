// Storey weight by use (gap G6, research R5 §3): the seismic weight of every floor level from its plate and use, the
// open deck at that floor, the facade and the core walls, so the Type 2 weight-irregularity line reads weight instead of
// floor area, and the off-centre gravity check (G5) and the across-wind screen (G8) get a weight centre and a building
// density. NBC 2020 4.1.8.2: W = dead load + 25% of the snow load (+ 60% of storage and tank contents, not modelled);
// partitions need not exceed 0.5 kPa in W. Screening only: no member sizing, no transfer slabs, no snow drift.
//
// Each storey carries its own floor: its plate, plus the open deck at its floor level that lies over the storey below
// (a setback terrace, the podium roof, or the garden of an open garden storey), and half the walls of the storeys below
// and above it. The floor on grade is the base and carries no seismic weight; the roof over the top storey is a level of
// its own. Decks are planted (soil by depth) at an open garden storey of an imported tower (a plate at most half the
// storeys below and above it, as the core alone where the garden is open under a slab) and at a public-amenity floor
// (the use the harness and the Program step give a sky garden or commons); every other deck is hard (pavers).
// Deck uses (gap G32, `Tower.deckUses`): where the designer says what a deck is for, that wins over the storey's use: a
// planted deck carries its own soil (else the presets' depth), an occupied deck or one no one uses is hard. A level whose
// entries name facings is split into its decks (engine/sw/decks.ts `towerDecks`), each weighed at its own centre.
// A core that steps with the tiers (gap G18, `Tower.coreSteps`): each storey's walls are those of its own core, and the
// off-centre lines measure each storey's weight centre from its own core.
import { blockSpans, coreSide, coreSideAt, coreStepsOf, rectCorners, spanAt, towerFloors } from './massing'
import { deckUseOf, towerDecks } from './sw/decks'
import type { DeckUse, Floor, Tower, UseId } from './types'

type P = [number, number]

/** Presets the designer can change (team assumptions, R5 §3.3). */
export interface WeightPresets {
  /** Soil depth on planted decks (mm, saturated weight). */
  soilMm: number
  /** Which open decks are planted: those of open garden storeys and public-amenity floors (default), every deck and the roof, or none. */
  planted: 'gardens' | 'all' | 'none'
  /** Facade weight per m² of wall (kPa). */
  facadeKpa: number
  /** Core wall thickness (m). */
  coreWall: number
}
export const DEFAULT_WEIGHT_PRESETS: WeightPresets = { soilMm: 600, planted: 'gardens', facadeKpa: 0.6, coreWall: 0.6 }

/** Reinforced normal-density concrete (kN/m³): common practice, unverified (R5 §3.3). */
export const GAMMA_C = 24
/**
 * Slab thickness (m), superimposed dead load and partitions (kPa) by use (R5 §3.3). Slabs 0.20 / 0.25 m and SDL 1.0 /
 * 1.2 kPa are team values; partitions 0.5 kPa is the NBC 4.1.8.2 cap for W (verified). Retail, civic and public amenity
 * take the office row, plant floors 3.5 kPa of equipment and no partitions (team).
 */
export const USE_LOADS: Record<UseId, { slab: number; sdl: number; part: number }> = {
  residential: { slab: 0.2, sdl: 1.0, part: 0.5 },
  hotel: { slab: 0.2, sdl: 1.2, part: 0.5 },
  office: { slab: 0.25, sdl: 1.0, part: 0.5 },
  retail: { slab: 0.25, sdl: 1.0, part: 0.5 },
  civic: { slab: 0.25, sdl: 1.0, part: 0.5 },
  amenity: { slab: 0.25, sdl: 1.0, part: 0.5 },
  mechanical: { slab: 0.25, sdl: 3.5, part: 0 },
}
/** 25% of the Vancouver roof snow load S = 1.64 kPa (NBC 4.1.6.2, Table C-2; C_b recalled), on exposed decks (kPa). */
export const SNOW_W = 0.41
/** Planted deck: slab (m), drainage, protection, membrane and topping (kPa); pavers on pedestals or roofing on hard decks (kPa). Team. */
export const PLANTED_SLAB = 0.3
export const PLANTED_BUILDUP = 1.0
export const HARD_DECK = 1.2
/** Saturated soil (kPa) for a depth in mm: the upper end of the Alberta guide's intensive band, 0.0159·d (R5 §3.3, arith on S23). */
export const soilKpa = (mm: number) => 0.0159 * Math.max(0, mm)
const G = 9.81

export interface StoreyWeight {
  /** Floor level (the roof: one above the top storey). */
  level: number
  roof: boolean
  /** Height of this floor (m above grade). */
  z: number
  /** Seismic weight (kN). */
  W: number
  /** Plate area as the toolkit reads it (m²), and the open deck carried at this floor (m²). */
  area: number
  deck: number
  deckKind: 'none' | 'hard' | 'planted'
  /** The deck's kind came from the deck-use input (`Tower.deckUses`), with the soil on its planted part (mm; null: none planted); absent: from the storey's use and the presets. */
  deckUse?: { soilMm: number | null }
  /** An open garden storey (imported tower): its deck is planted unless the presets say none. */
  garden: boolean
  podium: boolean
  /** A short run (one or two storeys) just above the podium, wider than the typical tower storey: the podium's top in all but name. */
  transitional: boolean
  /** The floor over a podium or transitional storey (their roof): its diaphragm and stiffness are not the tower's alone. */
  onPodium: boolean
  use: UseId
  /** Weight centre in the tower's own frame (m). */
  cx: number
  cy: number
  /** Extent of the floor slab along the tower's own x and y (m): the plate, or the plate below where a deck is carried. */
  dx: number
  dy: number
  /** The core of the storey above this floor (its own storey; the roof: the top storey's): centre in the tower frame and side (m). Absent: the tower's core (`WeightResult.core`). */
  coreX?: number
  coreY?: number
  coreSide?: number
}

export interface CoreCentre { x: number; y: number; side: number; how: string }

export interface WeightResult {
  /** Suspended floors bottom-up, then the roof. */
  levels: StoreyWeight[]
  /** Sum of the levels' weights (kN). */
  total: number
  /** Building density ΣW / (g ΣA·h) (kg/m³), for the across-wind screen. */
  density: number
  core: CoreCentre
  /** The core of the storey on grade, under the first suspended floor (absent: `core`). */
  ground?: StoreyCore
  presets: WeightPresets
}

interface Plate { area: number; c: P; perim: number; pc: P; ext: P; ring: P[]; key: string }

const shoelace = (r: P[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0 } return a / 2 }

/** Area centroid, perimeter, perimeter centroid and extents of a plate's loops (outer rings counter-clockwise, holes clockwise). */
function plateOf(loops: P[][], area: number): Plate {
  let a = 0, cx = 0, cy = 0, len = 0, px = 0, py = 0
  const xs: number[] = [], ys: number[] = []
  for (const r of loops) for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], k = x0 * y1 - x1 * y0, L = Math.hypot(x1 - x0, y1 - y0)
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k
    len += L; px += ((x0 + x1) / 2) * L; py += ((y0 + y1) / 2) * L
    xs.push(x0); ys.push(y0)
  }
  const mean: P = xs.length ? [xs.reduce((s, x) => s + x, 0) / xs.length, ys.reduce((s, y) => s + y, 0) / ys.length] : [0, 0]
  const c: P = Math.abs(a) > 1e-6 ? [cx / (3 * a), cy / (3 * a)] : mean
  const ring = loops.reduce<P[]>((best, r) => (Math.abs(shoelace(r)) > Math.abs(shoelace(best)) ? r : best), loops[0] ?? [])
  const key = loops.map((r) => r.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')).join('|')
  return { area, c, perim: len, pc: len > 0 ? [px / len, py / len] : c, ext: xs.length ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] : [0, 0], ring, key }
}

/** One floor's plate in the tower's own frame: an imported storey's outlines (else the stored hull), or the block at mid-height. */
export function floorPlate(t: Tower, f: Floor): Plate {
  if (t.imported) {
    const s = t.imported.storeys?.find((x) => x.level === f.level)
    const loops = s?.loops?.filter((r) => r.length >= 3) as P[][] | undefined
    if (loops?.length) return plateOf(loops, f.area)
    if (t.imported.hull?.length >= 3) return plateOf([t.imported.hull as P[]], f.area)
  }
  const b = spanAt(blockSpans(t), (f.z0 + f.z1) / 2)?.block
  return plateOf([b ? rectCorners(b.dx, b.dy, b.width, b.depth, b.rotation) : rectCorners(0, 0, t.width, t.depth, 0)], f.area)
}

/** Open garden storeys of an imported tower: a tower storey whose plate is at most half of the storeys below and above it. */
function gardens(t: Tower, floors: Floor[]): boolean[] {
  return floors.map((f, i) => !!t.imported && !f.podium && i > 0 && i < floors.length - 1 && f.area <= 0.5 * floors[i - 1].area && f.area <= 0.5 * floors[i + 1].area)
}

/**
 * The typical tower storey: the commonest outline among the floored storeys above the podium (two storeys or more), else
 * the median storey by area. Its index in `floors`, or -1 with no tower storey.
 */
export function typicalStorey(floors: Floor[], plates: Plate[]): number {
  const tower = floors.map((f, i) => i).filter((i) => !floors[i].podium)
  if (!tower.length) return -1
  const groups = new Map<string, number[]>()
  for (const i of tower) groups.set(plates[i].key, [...(groups.get(plates[i].key) ?? []), i])
  const best = [...groups.values()].sort((a, b) => b.length - a.length || b.reduce((s, i) => s + floors[i].z1 - floors[i].z0, 0) - a.reduce((s, i) => s + floors[i].z1 - floors[i].z0, 0))[0]
  if (best.length >= 2) return best[0]
  const byArea = [...tower].sort((a, b) => floors[a].area - floors[b].area)
  return byArea[Math.floor(byArea.length / 2)]
}

/** Transitional storeys: the run of one or two storeys just above the podium (or the ground), when it is wider than the typical storey. */
function transitionalStoreys(floors: Floor[], plates: Plate[], typ: number): boolean[] {
  const out = floors.map(() => false)
  const k0 = floors.findIndex((f) => !f.podium)
  if (k0 < 0 || typ < 0 || plates[k0].key === plates[typ].key) return out
  let k1 = k0
  while (k1 + 1 < floors.length && plates[k1 + 1].key === plates[k0].key) k1++
  if (k1 - k0 + 1 <= 2 && k1 + 1 < floors.length && floors[k0].area > 1.1 * floors[typ].area) for (let i = k0; i <= k1; i++) out[i] = true
  return out
}

/**
 * The core centre in the tower's own frame. A core centre the user placed (`Tower.coreCentre`) wins. A drawn mass with a
 * placed core: that core. A parametric tower: the tower origin, where the toolkit draws its core (every block offset from
 * it). An imported tower has no core in the model, and the tower origin (the model's plan centre on import) is not where
 * a tower on an off-centre podium has it, so the core is read from the model: the plate of an open garden storey that is
 * the core alone, else the centre of the typical tower storey (the commonest outline above the podium).
 */
export function coreCentre(t: Tower, floors: Floor[] = towerFloors(t), plates: Plate[] = floors.map((f) => floorPlate(t, f))): CoreCentre {
  const side = coreSide(t)
  if (t.coreCentre && t.coreCentre.length === 2 && t.coreCentre.every(Number.isFinite)) return { x: t.coreCentre[0], y: t.coreCentre[1], side, how: `the core centre placed by hand (x ${t.coreCentre[0].toFixed(1)}, y ${t.coreCentre[1].toFixed(1)} m in the tower's own frame)` }
  const core = t.drawn?.core
  if (core) {
    const a = (-t.rotation * Math.PI) / 180, dx = core.x + core.w / 2 - t.x, dy = core.y + core.d / 2 - t.y
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a), side, how: 'the core placed on the drawn mass' }
  }
  if (!t.imported) return { x: 0, y: 0, side, how: 'the modelled core at the tower centre' }
  const g = gardens(t, floors)
  const coreOnly = floors.findIndex((f, i) => g[i] && f.area <= 1.2 * coreSideAt(t, f.level) ** 2)
  if (coreOnly >= 0) return { x: plates[coreOnly].c[0], y: plates[coreOnly].c[1], side, how: `the core-only plate of the open garden storey L${floors[coreOnly].level}` }
  const typ = typicalStorey(floors, plates)
  const k = typ >= 0 ? typ : 0
  const c = plates[k]?.c ?? [0, 0]
  const off = Math.hypot(c[0], c[1])
  return { x: c[0], y: c[1], side, how: `the centre of the typical tower storey, L${floors[k]?.level ?? 1} (no core in the imported model; place it by hand under Structure if it sits elsewhere${off > 0.5 ? `; the tower origin is ${off.toFixed(1)} m away` : ''})` }
}

/** One storey's core (tower frame, m). */
export interface StoreyCore { side: number; x: number; y: number }

/**
 * The core of each floor level (gap G18): below the first core step, and on a tower without steps, the core share's
 * core at the core centre; from a step up, the step's side at its centre, or at the centre of the core below.
 */
export function storeyCore(t: Tower, base: CoreCentre = coreCentre(t)): (level: number) => StoreyCore {
  const steps = coreStepsOf(t)
  const cores: StoreyCore[] = []
  let c: P = [base.x, base.y]
  for (const s of steps) { if (s.centre?.length === 2 && s.centre.every(Number.isFinite)) c = [s.centre[0], s.centre[1]]; cores.push({ side: s.side, x: c[0], y: c[1] }) }
  const own: StoreyCore = { side: base.side, x: base.x, y: base.y }
  return (level) => { let k = -1; for (let i = 0; i < steps.length; i++) if (steps[i].fromLevel <= level) k = i; return k < 0 ? own : cores[k] }
}

/** Two storey cores that are the same within 5 cm (a core share's side read back from a typed one). */
export const sameCore = (a: StoreyCore, b: StoreyCore) => Math.abs(a.side - b.side) < 0.05 && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05

/** The core as boxes up the tower (tower frame): one per run of storeys sharing a core; without core steps, one box from the ground to the top. */
export function coreBoxes(t: Tower, floors: Floor[] = towerFloors(t)): (StoreyCore & { z0: number; z1: number })[] {
  const base = coreCentre(t, floors)
  const top = floors.length ? floors[floors.length - 1].z1 : t.height
  const own = { side: base.side, x: base.x, y: base.y }
  if (!coreStepsOf(t).length || !floors.length) return [{ ...own, z0: 0, z1: top }]
  const at = storeyCore(t, base)
  const out: (StoreyCore & { z0: number; z1: number })[] = []
  for (const f of floors) {
    const c = at(f.level), last = out[out.length - 1]
    if (last && sameCore(last, c)) { last.z1 = f.z1; continue }
    out.push({ ...c, z0: out.length ? f.z0 : 0, z1: f.z1 })
  }
  return out
}

/** One deck's share of a floor under the deck-use input: area (m²), centre (tower frame) and its entry, null for none matching. */
interface DeckPart { area: number; c: P; use: DeckUse | null }
/** The decks at each level whose deck-use entries name a facing, from the storey outlines, in the tower frame. */
function deckPartsOf(t: Tower, north: number): Map<number, DeckPart[]> {
  const out = new Map<number, DeckPart[]>()
  const faced = new Set((t.deckUses ?? []).filter((u) => u?.facing != null && u.facing.trim() !== '').map((u) => u.level))
  if (!faced.size) return out
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  for (const d of towerDecks(t, north)) {
    if (!faced.has(d.level)) continue
    let A = 0, cx = 0, cy = 0
    for (const r of d.rings) for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], k = x0 * y1 - x1 * y0; A += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k }
    const X = Math.abs(A) > 1e-9 ? cx / (3 * A) : d.pts[0]?.[0] ?? t.x, Y = Math.abs(A) > 1e-9 ? cy / (3 * A) : d.pts[0]?.[1] ?? t.y
    const dx = X - t.x, dy = Y - t.y
    out.set(d.level, [...(out.get(d.level) ?? []), { area: d.area, c: [dx * c + dy * s, -dx * s + dy * c], use: deckUseOf(t, d) }])
  }
  return out
}

/**
 * Seismic weight of every suspended floor and the roof (R5 equation 6.1), with weight centres in the tower frame.
 * `north` (true north clockwise from the project frame's +y) matters only to deck uses that name a facing.
 */
export function storeyWeights(t: Tower, p: WeightPresets = DEFAULT_WEIGHT_PRESETS, north = 0): WeightResult {
  const floors = towerFloors(t)
  const plates = floors.map((f) => floorPlate(t, f))
  const core = coreCentre(t, floors, plates)
  const garden = gardens(t, floors)
  const transitional = transitionalStoreys(floors, plates, typicalStorey(floors, plates))
  // Core walls per metre of height (kN/m), storey by storey: a core that steps carries its own walls (G18).
  const at = storeyCore(t, core)
  const cores = floors.map((f) => at(f.level))
  const coreKpm = (k: number) => 4 * cores[k].side * p.coreWall * GAMMA_C
  const coreC = (k: number): P => [cores[k].x, cores[k].y]
  const plantedQ = PLANTED_SLAB * GAMMA_C + soilKpa(p.soilMm) + PLANTED_BUILDUP + SNOW_W
  const plantedAt = (mm: number | undefined) => PLANTED_SLAB * GAMMA_C + soilKpa(mm ?? p.soilMm) + PLANTED_BUILDUP + SNOW_W
  // deck uses by level (gap G32): the entries with no facing apply to the whole deck at their level
  const uses = (t.deckUses ?? []).filter((u) => u && Number.isFinite(u.level))
  const whole = (level: number) => uses.find((u) => u.level === level && (u.facing == null || u.facing.trim() === '')) ?? null
  const parts = uses.length ? deckPartsOf(t, north) : new Map<number, DeckPart[]>()
  const hardQ = (u: UseId) => USE_LOADS[u].slab * GAMMA_C + HARD_DECK + SNOW_W
  const plateQ = (u: UseId) => USE_LOADS[u].slab * GAMMA_C + USE_LOADS[u].sdl + USE_LOADS[u].part
  const perimOf = (i: number) => (garden[i] ? 0 : plates[i].perim)
  const levels: StoreyWeight[] = []
  const n = floors.length
  const push = (parts: { w: number; c: P }[], l: Omit<StoreyWeight, 'W' | 'cx' | 'cy' | 'coreX' | 'coreY' | 'coreSide'>, k: number) => {
    const W = parts.reduce((s, x) => s + x.w, 0)
    const cx = W > 0 ? parts.reduce((s, x) => s + x.w * x.c[0], 0) / W : 0, cy = W > 0 ? parts.reduce((s, x) => s + x.w * x.c[1], 0) / W : 0
    levels.push({ ...l, W, cx, cy, coreX: cores[k].x, coreY: cores[k].y, coreSide: cores[k].side })
  }
  for (let i = 0; i < n; i++) {
    const f = floors[i], pl = plates[i]
    if (f.z0 <= 0.5) continue // the floor on grade is the base
    const zPrev = i > 0 ? floors[i - 1].z0 : 0, zNext = i < n - 1 ? floors[i + 1].z0 : f.z1
    const hLow = Math.max(0, (f.z0 - zPrev) / 2), hUp = Math.max(0, (zNext - f.z0) / 2)
    const below = i > 0 ? plates[i - 1] : null
    const deck = below ? Math.max(0, below.area - pl.area) : 0
    const preset = deck > 0 && p.planted !== 'none' && (p.planted === 'all' || garden[i] || f.use === 'amenity')
    const deckC: P = below && deck > 0 ? [(below.area * below.c[0] - pl.area * pl.c[0]) / deck, (below.area * below.c[1] - pl.area * pl.c[1]) / deck] : pl.c
    // the deck's parts: by the deck-use input where it speaks to this level, else by the storey's use and the presets
    const q = (u: DeckUse | null) => (u ? (u.use === 'planted' ? plantedAt(u.soilMm) : hardQ(f.use)) : preset ? plantedQ : hardQ(f.use))
    const all = whole(f.level), split = deck > 0 ? parts.get(f.level) ?? [] : []
    const dps: { w: number; c: P; planted: boolean; from: DeckUse | null }[] = []
    if (deck > 0) {
      if (split.length) {
        let rest = deck, rx = deck * deckC[0], ry = deck * deckC[1]
        for (const d of split) { const u = d.use ?? all; dps.push({ w: d.area * q(u), c: d.c, planted: u ? u.use === 'planted' : preset, from: u }); rest -= d.area; rx -= d.area * d.c[0]; ry -= d.area * d.c[1] }
        if (rest > 1) dps.push({ w: rest * q(all), c: [rx / rest, ry / rest], planted: all ? all.use === 'planted' : preset, from: all })
      } else dps.push({ w: deck * q(all), c: deckC, planted: all ? all.use === 'planted' : preset, from: all })
    }
    const planted = dps.some((x) => x.planted)
    const given = dps.filter((x) => x.from)
    const soil = given.filter((x) => x.from!.use === 'planted').map((x) => x.from!.soilMm ?? p.soilMm)
    push([
      { w: pl.area * plateQ(f.use), c: pl.c },
      ...dps.map((x) => ({ w: x.w, c: x.c })),
      { w: below ? perimOf(i - 1) * hLow * p.facadeKpa : 0, c: below?.pc ?? pl.c },
      { w: perimOf(i) * hUp * p.facadeKpa, c: pl.pc },
      { w: i > 0 ? coreKpm(i - 1) * hLow : 0, c: i > 0 ? coreC(i - 1) : coreC(i) },
      { w: coreKpm(i) * hUp, c: coreC(i) },
    ], { level: f.level, roof: false, z: f.z0, area: pl.area, deck, deckKind: deck > 0 ? (planted ? 'planted' : 'hard') : 'none', ...(given.length ? { deckUse: { soilMm: soil.length ? Math.max(...soil) : null } } : {}), garden: garden[i], podium: f.podium, transitional: transitional[i], onPodium: !f.podium && !transitional[i] && i > 0 && (floors[i - 1].podium || transitional[i - 1]), use: f.use,
      dx: below && deck > 0 ? Math.max(pl.ext[0], below.ext[0]) : pl.ext[0], dy: below && deck > 0 ? Math.max(pl.ext[1], below.ext[1]) : pl.ext[1] }, i)
  }
  if (n) {
    const f = floors[n - 1], pl = plates[n - 1], h = Math.max(0, (f.z1 - f.z0) / 2)
    const u = whole(f.level + 1) ?? uses.find((x) => x.level === f.level + 1) ?? null
    const planted = u ? u.use === 'planted' : p.planted === 'all'
    push([
      { w: pl.area * (u ? (planted ? plantedAt(u.soilMm) : hardQ(f.use)) : planted ? plantedQ : hardQ(f.use)), c: pl.c },
      { w: perimOf(n - 1) * h * p.facadeKpa, c: pl.pc },
      { w: coreKpm(n - 1) * h, c: coreC(n - 1) },
    ], { level: f.level + 1, roof: true, z: f.z1, area: pl.area, deck: pl.area, deckKind: planted ? 'planted' : 'hard', ...(u ? { deckUse: { soilMm: planted ? u.soilMm ?? p.soilMm : null } } : {}), garden: false, podium: f.podium, transitional: transitional[n - 1], onPodium: false, use: f.use, dx: pl.ext[0], dy: pl.ext[1] }, n - 1)
  }
  const total = levels.reduce((s, l) => s + l.W, 0)
  const volume = floors.reduce((s, f) => s + f.area * Math.max(0, f.z1 - f.z0), 0)
  return { levels, total, density: volume > 0 ? (total * 1000) / (G * volume) : 0, core, ...(n ? { ground: cores[0] } : {}), presets: p }
}

/** Type 2 by weight: the worst ratio between adjacent levels; a roof lighter than the floor below is exempt (Table 4.1.8.6). */
export function worstWeightStep(levels: StoreyWeight[]): { ratio: number; lower: StoreyWeight; upper: StoreyWeight } | null {
  let worst: { ratio: number; lower: StoreyWeight; upper: StoreyWeight } | null = null
  for (let i = 1; i < levels.length; i++) {
    const lo = levels[i - 1], hi = levels[i]
    if (hi.roof && hi.W <= lo.W) continue
    const r = Math.max(lo.W, hi.W) / Math.max(1e-9, Math.min(lo.W, hi.W))
    if (!worst || r > worst.ratio) worst = { ratio: r, lower: lo, upper: hi }
  }
  return worst
}

export const levelName = (l: Pick<StoreyWeight, 'level' | 'roof'>) => (l.roof ? 'roof' : `L${l.level}`)

// --- Off-centre gravity load and accidental torsion (gap G5, research R5 §2) ---------------------------------------

/** ACI 209 standard-condition creep coefficient (range 1.30–4.15): unverified, via search summaries (R5 S27). */
export const CREEP_PHI = 2.35

export interface Offset { level: number; roof: boolean; z: number; W: number; ex: number; ey: number; e: number; ratio: number; across: number; D: number }
export interface GravityReading {
  /** Tower levels (podium and transitional storeys, and the floor over them, left out), bottom-up. */
  levels: Offset[]
  /** The level with the largest e/D, the ratio read for loading along either plan axis (|e_y|/D_y or |e_x|/D_x). */
  worst: Offset | null
  /** The level with the largest offset |e|. */
  largest: Offset | null
  /** Net offset of the tower levels' weight from the core, E = ΣW·e / ΣW (m), and E/D on the lowest tower level. */
  net: { ex: number; ey: number; e: number; ratio: number }
  /** Gravity-induced overturning about the core centre, |ΣW·e| (kN·m). */
  QG: number
  /** Sustained top sway of a cantilever core with EI from f1 = 46/H (m): elastic and long term with creep. Each level's
   *  moment about its own storey's core (storey by storey): with core steps, the jog between their centres is left out. */
  sway: { el: number; lt: number; EI: number }
  /**
   * With the jog between stepped cores (gap G30): at every height the core carries the weights above it about its own
   * section's centre, so an upper core set off the one below adds W·(offset) to every section beneath it. `sections`
   * bottom-up (the storey on grade first), `QG` the base overturning about the ground core (kN·m), `sway` the top sway
   * from those section moments; `moved` when some section's centre sits 5 cm or more off the one below. Without core
   * steps it equals the storey-by-storey reading.
   */
  jog: { sections: JogSection[]; QG: number; sway: { el: number; lt: number }; moved: boolean }
}

/** One run of storeys sharing a core (gap G30), with the moment at its base about its own centre. */
export interface JogSection {
  /** Level of the first floor on this core (the storey on grade: its level is 0 here), its height (m) and the core. */
  from: number
  z0: number
  x: number
  y: number
  side: number
  /** Offset of this section's centre from the section below (m, tower frame); 0 for the lowest. */
  dx: number
  dy: number
  /** Moment of the tower levels above the section's base about its own centre, |ΣW·(c − c_s)| (kN·m), and the part of
   *  it from the upper cores' offsets, |ΣW·(c_own − c_s)| (kN·m). */
  M: number
  Mjog: number
}

/**
 * Per level, the weight centre's offset from the core centre (its own storey's core, where the core steps) against the
 * code's accidental arm 0.10·D (NBC 4.1.8.11(11)(a)),
 * the net offset of the whole tower, and the sustained sway it drives (R5 equations 5.2–5.5, textbook cantilever, inference).
 */
export function gravityEccentricity(w: WeightResult, H: number): GravityReading {
  const tower = (l: StoreyWeight) => !l.podium && !l.transitional && !l.onPodium
  const levels: Offset[] = w.levels.filter(tower).map((l) => {
    const ex = l.cx - (l.coreX ?? w.core.x), ey = l.cy - (l.coreY ?? w.core.y)
    const rx = l.dy > 0 ? Math.abs(ey) / l.dy : 0, ry = l.dx > 0 ? Math.abs(ex) / l.dx : 0
    return { level: l.level, roof: l.roof, z: l.z, W: l.W, ex, ey, e: Math.hypot(ex, ey), ratio: Math.max(rx, ry), across: rx >= ry ? Math.abs(ey) : Math.abs(ex), D: rx >= ry ? l.dy : l.dx }
  })
  const worst = levels.reduce<Offset | null>((a, b) => (!a || b.ratio > a.ratio ? b : a), null)
  const largest = levels.reduce<Offset | null>((a, b) => (!a || b.e > a.e ? b : a), null)
  const Wt = levels.reduce((s, l) => s + l.W, 0)
  const Mx = levels.reduce((s, l) => s + l.W * l.ex, 0), My = levels.reduce((s, l) => s + l.W * l.ey, 0)
  const Ex = Wt > 0 ? Mx / Wt : 0, Ey = Wt > 0 ? My / Wt : 0
  const first = w.levels.find(tower)
  const ratio = first ? Math.max(first.dy > 0 ? Math.abs(Ey) / first.dy : 0, first.dx > 0 ? Math.abs(Ex) / first.dx : 0) : 0
  // EI of a uniform cantilever from its first frequency (5.3); each level's moment W·e at height z moves the top by M·z·(H − z/2)/EI (5.4).
  const f1 = H > 0 ? 46 / H : 0
  const mBar = H > 0 ? (w.total * 1000) / (G * H) : 0
  const EI = mBar * H ** 4 * ((2 * Math.PI * f1) / 3.516) ** 2
  const top = (k: 'ex' | 'ey') => (EI > 0 ? levels.reduce((s, l) => { const z = Math.min(l.z, H); return s + l.W * 1000 * l[k] * z * (H - z / 2) }, 0) / EI : 0)
  const el = Math.hypot(top('ex'), top('ey'))
  const jog = coreJog(w, H, EI)
  return { levels, worst, largest, net: { ex: Ex, ey: Ey, e: Math.hypot(Ex, Ey), ratio }, QG: Math.hypot(Mx, My), sway: { el, lt: el * (1 + CREEP_PHI), EI }, jog }
}

/**
 * The sustained sway with the jog between stepped cores (gap G30, structural review R3-10): the core is a cantilever whose
 * centre steps, so the moment at height h about that height's own core centre c(h) is M(h) = Σ W·(c_l − c(h)) over the
 * tower levels above h, and the top moves by ∫ M(h)·(H − h) dh / EI (unit-load method; with one core all the way up this
 * is the storey-by-storey sum W·e·z·(H − z/2) / EI). Same levels, EI and creep as the storey-by-storey reading.
 */
function coreJog(w: WeightResult, H: number, EI: number): GravityReading['jog'] {
  const tower = w.levels.filter((l) => !l.podium && !l.transitional && !l.onPodium)
  const own = (l: StoreyWeight): StoreyCore => ({ x: l.coreX ?? w.core.x, y: l.coreY ?? w.core.y, side: l.coreSide ?? w.core.side })
  // sections bottom-up: the storey on grade, then the core of the storey above each suspended floor
  const g0 = w.ground ?? { x: w.core.x, y: w.core.y, side: w.core.side }
  const raw: { from: number; z0: number; c: StoreyCore }[] = [{ from: 0, z0: 0, c: g0 }]
  for (const l of w.levels) { if (l.roof) continue; const c = own(l), last = raw[raw.length - 1]; if (!sameCore(last.c, c)) raw.push({ from: l.level, z0: l.z, c }) }
  const z1 = (k: number) => (k + 1 < raw.length ? raw[k + 1].z0 : Infinity)
  // ∫ (H − h) dh over [a, b]
  const I = (a: number, b: number) => (b > a ? (b - a) * H - (b * b - a * a) / 2 : 0)
  let tx = 0, ty = 0
  for (const l of tower) {
    const z = Math.min(l.z, H)
    let ix = l.cx * I(0, z), iy = l.cy * I(0, z)
    for (let k = 0; k < raw.length; k++) { const a = raw[k].z0, b = Math.min(z1(k), z); if (b <= a) break; const q = I(a, b); ix -= raw[k].c.x * q; iy -= raw[k].c.y * q }
    tx += l.W * 1000 * ix; ty += l.W * 1000 * iy
  }
  const el = EI > 0 ? Math.hypot(tx, ty) / EI : 0
  const sections: JogSection[] = raw.map((r, k) => {
    const above = tower.filter((l) => l.z > r.z0 + 0.01)
    let mx = 0, my = 0, jx = 0, jy = 0
    for (const l of above) { const c = own(l); mx += l.W * (l.cx - r.c.x); my += l.W * (l.cy - r.c.y); jx += l.W * (c.x - r.c.x); jy += l.W * (c.y - r.c.y) }
    return { from: r.from, z0: r.z0, x: r.c.x, y: r.c.y, side: r.c.side, dx: k ? r.c.x - raw[k - 1].c.x : 0, dy: k ? r.c.y - raw[k - 1].c.y : 0, M: Math.hypot(mx, my), Mjog: Math.hypot(jx, jy) }
  })
  return { sections, QG: sections[0]?.M ?? 0, sway: { el, lt: el * (1 + CREEP_PHI) }, moved: sections.some((s) => Math.hypot(s.dx, s.dy) >= 0.05) }
}
