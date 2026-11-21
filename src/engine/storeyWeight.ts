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
import { blockSpans, coreSide, rectCorners, spanAt, towerFloors } from './massing'
import type { Floor, Tower, UseId } from './types'

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
  /** An open garden storey (imported tower): its deck is planted unless the presets say none. */
  garden: boolean
  podium: boolean
  /** The floor over a podium storey (the podium roof): its diaphragm and stiffness are not the tower's alone. */
  onPodium: boolean
  use: UseId
  /** Weight centre in the tower's own frame (m). */
  cx: number
  cy: number
  /** Extent of the floor slab along the tower's own x and y (m): the plate, or the plate below where a deck is carried. */
  dx: number
  dy: number
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
  presets: WeightPresets
}

interface Plate { area: number; c: P; perim: number; pc: P; ext: P; ring: P[] }

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
  return { area, c, perim: len, pc: len > 0 ? [px / len, py / len] : c, ext: xs.length ? [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] : [0, 0], ring }
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
 * The core centre in the tower's own frame. A parametric tower: the tower origin, where the toolkit draws its core (every
 * block offset from it). A drawn mass with a placed core: that core. An imported tower: the toolkit draws an assumed core
 * at the tower origin (the model's plan centre on import), which is not where a tower on an off-centre podium has it, so
 * the core is read from the model: the plate of an open garden storey that is the core alone, else the centre of the lowest tower storey (where
 * the core rises from the podium or the ground).
 */
export function coreCentre(t: Tower, floors: Floor[] = towerFloors(t), plates: Plate[] = floors.map((f) => floorPlate(t, f))): CoreCentre {
  const side = coreSide(t)
  const core = t.drawn?.core
  if (core) {
    const a = (-t.rotation * Math.PI) / 180, dx = core.x + core.w / 2 - t.x, dy = core.y + core.d / 2 - t.y
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a), side, how: 'the core placed on the drawn mass' }
  }
  if (!t.imported) return { x: 0, y: 0, side, how: 'the modelled core at the tower centre' }
  const g = gardens(t, floors)
  const coreOnly = floors.findIndex((f, i) => g[i] && f.area <= 1.2 * side * side)
  if (coreOnly >= 0) return { x: plates[coreOnly].c[0], y: plates[coreOnly].c[1], side, how: `the core-only plate of the open garden storey L${floors[coreOnly].level}` }
  const i = floors.findIndex((f) => !f.podium)
  const k = i >= 0 ? i : 0
  const c = plates[k]?.c ?? [0, 0]
  const off = Math.hypot(c[0], c[1])
  return { x: c[0], y: c[1], side, how: `the centre of the lowest tower storey, L${floors[k]?.level ?? 1} (no core in the imported model${off > 0.5 ? `; the toolkit's assumed core at the tower origin is ${off.toFixed(1)} m away` : ''})` }
}

/** Seismic weight of every suspended floor and the roof (R5 equation 6.1), with weight centres in the tower frame. */
export function storeyWeights(t: Tower, p: WeightPresets = DEFAULT_WEIGHT_PRESETS): WeightResult {
  const floors = towerFloors(t)
  const plates = floors.map((f) => floorPlate(t, f))
  const core = coreCentre(t, floors, plates)
  const garden = gardens(t, floors)
  const Lc = 4 * core.side, coreKpm = Lc * p.coreWall * GAMMA_C // kN per metre of height
  const plantedQ = PLANTED_SLAB * GAMMA_C + soilKpa(p.soilMm) + PLANTED_BUILDUP + SNOW_W
  const hardQ = (u: UseId) => USE_LOADS[u].slab * GAMMA_C + HARD_DECK + SNOW_W
  const plateQ = (u: UseId) => USE_LOADS[u].slab * GAMMA_C + USE_LOADS[u].sdl + USE_LOADS[u].part
  const perimOf = (i: number) => (garden[i] ? 0 : plates[i].perim)
  const levels: StoreyWeight[] = []
  const n = floors.length
  const push = (parts: { w: number; c: P }[], l: Omit<StoreyWeight, 'W' | 'cx' | 'cy'>) => {
    const W = parts.reduce((s, x) => s + x.w, 0)
    const cx = W > 0 ? parts.reduce((s, x) => s + x.w * x.c[0], 0) / W : 0, cy = W > 0 ? parts.reduce((s, x) => s + x.w * x.c[1], 0) / W : 0
    levels.push({ ...l, W, cx, cy })
  }
  for (let i = 0; i < n; i++) {
    const f = floors[i], pl = plates[i]
    if (f.z0 <= 0.5) continue // the floor on grade is the base
    const zPrev = i > 0 ? floors[i - 1].z0 : 0, zNext = i < n - 1 ? floors[i + 1].z0 : f.z1
    const hLow = Math.max(0, (f.z0 - zPrev) / 2), hUp = Math.max(0, (zNext - f.z0) / 2)
    const below = i > 0 ? plates[i - 1] : null
    const deck = below ? Math.max(0, below.area - pl.area) : 0
    const planted = deck > 0 && p.planted !== 'none' && (p.planted === 'all' || garden[i] || f.use === 'amenity')
    const deckC: P = below && deck > 0 ? [(below.area * below.c[0] - pl.area * pl.c[0]) / deck, (below.area * below.c[1] - pl.area * pl.c[1]) / deck] : pl.c
    push([
      { w: pl.area * plateQ(f.use), c: pl.c },
      { w: deck * (planted ? plantedQ : hardQ(f.use)), c: deckC },
      { w: below ? perimOf(i - 1) * hLow * p.facadeKpa : 0, c: below?.pc ?? pl.c },
      { w: perimOf(i) * hUp * p.facadeKpa, c: pl.pc },
      { w: coreKpm * (hLow + hUp), c: [core.x, core.y] },
    ], { level: f.level, roof: false, z: f.z0, area: pl.area, deck, deckKind: deck > 0 ? (planted ? 'planted' : 'hard') : 'none', garden: garden[i], podium: f.podium, onPodium: !f.podium && i > 0 && floors[i - 1].podium, use: f.use,
      dx: below && deck > 0 ? Math.max(pl.ext[0], below.ext[0]) : pl.ext[0], dy: below && deck > 0 ? Math.max(pl.ext[1], below.ext[1]) : pl.ext[1] })
  }
  if (n) {
    const f = floors[n - 1], pl = plates[n - 1], h = Math.max(0, (f.z1 - f.z0) / 2)
    const planted = p.planted === 'all'
    push([
      { w: pl.area * (planted ? plantedQ : hardQ(f.use)), c: pl.c },
      { w: perimOf(n - 1) * h * p.facadeKpa, c: pl.pc },
      { w: coreKpm * h, c: [core.x, core.y] },
    ], { level: f.level + 1, roof: true, z: f.z1, area: pl.area, deck: pl.area, deckKind: planted ? 'planted' : 'hard', garden: false, podium: f.podium, onPodium: false, use: f.use, dx: pl.ext[0], dy: pl.ext[1] })
  }
  const total = levels.reduce((s, l) => s + l.W, 0)
  const volume = floors.reduce((s, f) => s + f.area * Math.max(0, f.z1 - f.z0), 0)
  return { levels, total, density: volume > 0 ? (total * 1000) / (G * volume) : 0, core, presets: p }
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
  /** Tower levels (podium storeys and the podium roof left out), bottom-up. */
  levels: Offset[]
  /** The level with the largest e/D, the ratio read for loading along either plan axis (|e_y|/D_y or |e_x|/D_x). */
  worst: Offset | null
  /** The level with the largest offset |e|. */
  largest: Offset | null
  /** Net offset of the tower levels' weight from the core, E = ΣW·e / ΣW (m), and E/D on the lowest tower level. */
  net: { ex: number; ey: number; e: number; ratio: number }
  /** Gravity-induced overturning about the core centre, |ΣW·e| (kN·m). */
  QG: number
  /** Sustained top sway of a cantilever core with EI from f1 = 46/H (m): elastic and long term with creep. */
  sway: { el: number; lt: number; EI: number }
}

/**
 * Per level, the weight centre's offset from the core centre against the code's accidental arm 0.10·D (NBC 4.1.8.11(11)(a)),
 * the net offset of the whole tower, and the sustained sway it drives (R5 equations 5.2–5.5, textbook cantilever, inference).
 */
export function gravityEccentricity(w: WeightResult, H: number): GravityReading {
  const levels: Offset[] = w.levels.filter((l) => !l.podium && !l.onPodium).map((l) => {
    const ex = l.cx - w.core.x, ey = l.cy - w.core.y
    const rx = l.dy > 0 ? Math.abs(ey) / l.dy : 0, ry = l.dx > 0 ? Math.abs(ex) / l.dx : 0
    return { level: l.level, roof: l.roof, z: l.z, W: l.W, ex, ey, e: Math.hypot(ex, ey), ratio: Math.max(rx, ry), across: rx >= ry ? Math.abs(ey) : Math.abs(ex), D: rx >= ry ? l.dy : l.dx }
  })
  const worst = levels.reduce<Offset | null>((a, b) => (!a || b.ratio > a.ratio ? b : a), null)
  const largest = levels.reduce<Offset | null>((a, b) => (!a || b.e > a.e ? b : a), null)
  const Wt = levels.reduce((s, l) => s + l.W, 0)
  const Mx = levels.reduce((s, l) => s + l.W * l.ex, 0), My = levels.reduce((s, l) => s + l.W * l.ey, 0)
  const Ex = Wt > 0 ? Mx / Wt : 0, Ey = Wt > 0 ? My / Wt : 0
  const first = w.levels.find((l) => !l.podium && !l.onPodium)
  const ratio = first ? Math.max(first.dy > 0 ? Math.abs(Ey) / first.dy : 0, first.dx > 0 ? Math.abs(Ex) / first.dx : 0) : 0
  // EI of a uniform cantilever from its first frequency (5.3); each level's moment W·e at height z moves the top by M·z·(H − z/2)/EI (5.4).
  const f1 = H > 0 ? 46 / H : 0
  const mBar = H > 0 ? (w.total * 1000) / (G * H) : 0
  const EI = mBar * H ** 4 * ((2 * Math.PI * f1) / 3.516) ** 2
  const top = (k: 'ex' | 'ey') => (EI > 0 ? levels.reduce((s, l) => { const z = Math.min(l.z, H); return s + l.W * 1000 * l[k] * z * (H - z / 2) }, 0) / EI : 0)
  const el = Math.hypot(top('ex'), top('ey'))
  return { levels, worst, largest, net: { ex: Ex, ey: Ey, e: Math.hypot(Ex, Ey), ratio }, QG: Math.hypot(Mx, My), sway: { el, lt: el * (1 + CREEP_PHI), EI } }
}
