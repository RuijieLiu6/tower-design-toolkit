// Open-storey soft and weak storey check (tool cycle 12; R7 synthesis §3 tool 5, R7d TP4), embedded in the Structure
// node's System & seismic tab beside the other SC4 irregularities. It finds the storeys where the plate opens (open
// garden storeys whose plate is the core alone, a gate that splits the plate, a void, any band whose plate drops to half
// of the storeys round it) and the storeys above a core top (a frame sitting on the core), and reads BCBC 2024 Table
// 4.1.8.6 Types 1 (stiffness), 4 and 5 (in-plane discontinuity, out-of-plane offset) and 6 (weak storey) there.
// No storey stiffness or strength is modelled, so the reading is a proxy (confidence C), stated on every line: the
// sway and across-wind lines assume the stiffness 46/H gives; the core alone supplies a share s of it (the core-alone
// line, (f_core / f_46/H)²), and the frame, belts and floors are taken to supply the rest. At an open storey the frame's
// share goes with the floors, in proportion to the plate that stays outside the core; above a core top only the frame
// is left. A pass is given only where the proxy itself clears the threshold, and it says so.
import { f1Empirical } from './acrossWind'
import { storeyShapes, partsOf, type ContinuityReading } from './continuity'
import { towerFloors } from './massing'
import { MIN_FLOOR_AREA } from './imported'
import { storeyWeights, tubeI, wallAt, type CoreStiffness, type WeightResult } from './storeyWeight'
import type { Floor, RuleResult, RuleState, Source, Tower } from './types'

/** A band of storeys reads open when its plate is at most this share of the storeys below and above it (team: the open-garden rule of the storey weights). */
export const OPEN_SHARE = 0.5
/** Longest band of open storeys read as one opening (team). */
export const OPEN_BAND_MAX = 8
/** Type 1: storey stiffness under 70% of an adjacent storey, or under 80% of the mean of the three storeys above or below (NBC 2020 Table 4.1.8.6, research P10, machine-read). */
export const TYPE1_ADJ = 0.7
export const TYPE1_AVG = 0.8

export interface OpenBand {
  from: number; to: number; z0: number; z1: number
  kind: 'garden' | 'gate' | 'void' | 'open'
  /** The storey under the band and the storey over it (null: the band reaches the top). */
  below: number; above: number | null
  /** Plate kept outside the core, against the storey below's (0–1, the band's least). */
  share: number
  /** Storey height of the storey below over the band's tallest storey (≤ 1). */
  tall: number
  /** The core's bending stiffness at the band over the storey below's (I ratio). */
  core: number
  /** The core's wall area at the band over the storey above's. */
  walls: number
  /** The core square lies inside the band's plate. */
  coreIn: boolean
  /** The band stands above the core top (no core walls there). */
  overTop: boolean
}
export interface CrownReading { coreTop: number; from: number; below: number; share: number }
export interface StoreyRatio { what: string; lo: number; hi: number }
export interface OpenStoreyReading {
  bands: OpenBand[]
  crown: CrownReading | null
  /** The core alone's share of the 46/H stiffness, (f_core / f_46/H)², and what the frame, belts and floors are taken to give. */
  s: number
  frame: number
  /** Type 1 by the proxy: each band's (and the crown's) stiffness over the storey below, low and high reading. */
  ratios: StoreyRatio[]
}

const KIND: Record<OpenBand['kind'], [string, string]> = { garden: ['open garden storey', 'open garden storeys'], gate: ['gate (the plate splits)', 'gate storeys (the plate splits)'], void: ['void (no plate)', 'void storeys (no plate)'], open: ['open storey', 'open storeys'] }
const kindText = (b: Pick<OpenBand, 'kind' | 'from' | 'to'>) => KIND[b.kind][b.from === b.to ? 0 : 1]
const lv = (a: number, b: number) => (a === b ? `L${a}` : `L${a}–L${b}`)
const pc = (x: number) => `${Math.round(x * 100)}%`
const range = (r: StoreyRatio) => (Math.abs(r.hi - r.lo) < 0.005 ? pc(r.lo) : `${pc(r.lo)}–${pc(r.hi)}`)

/**
 * The open bands of the tower storeys and the crown over a core top (`coreTop`, m above grade, where the core walls end;
 * absent: the core runs to the roof), with the stiffness proxy. `core` is the core-alone reading (storeyWeight.ts).
 */
export function openStoreys(t: Tower, o: { core: CoreStiffness; H: number; floors?: Floor[]; weights?: WeightResult; coreTop?: number }): OpenStoreyReading {
  const floors = o.floors ?? towerFloors(t)
  const w = o.weights ?? storeyWeights(t)
  const T = storeyShapes(t, floors).filter((s) => !s.podium)
  const emp = f1Empirical(o.H)
  const s = emp.central > 0 ? (o.core.f1 / emp.central) ** 2 : 0
  const frame = Math.max(0, 1 - s), base = Math.max(1, s)
  const top = T.length ? T[T.length - 1].z1 : o.H
  const coreAt = (level: number) => {
    const l = w.levels.filter((x) => !x.roof && x.level <= level).pop() ?? w.levels[0]
    return { side: l?.coreSide ?? w.core.side, x: l?.coreX ?? w.core.x, y: l?.coreY ?? w.core.y, z: l?.z ?? 0 }
  }
  const I = (level: number) => { const c = coreAt(level); return tubeI(c.side, wallAt(w.presets, c.z, top)) }
  const wallArea = (level: number) => { const c = coreAt(level); return 4 * c.side * wallAt(w.presets, c.z, top) }
  const outside = (k: number) => Math.max(0, T[k].area - coreAt(T[k].level).side ** 2)
  const parts = T.map((x) => partsOf(x.loops))
  const h = (k: number) => Math.max(0.1, T[k].z1 - T[k].z0)
  const inPlate = (k: number) => {
    const c = coreAt(T[k].level), d = c.side / 2 - 0.05
    const pts: [number, number][] = [[c.x - d, c.y - d], [c.x + d, c.y - d], [c.x + d, c.y + d], [c.x - d, c.y + d]]
    return pts.every((p) => insideAny(p, T[k].loops))
  }

  const bands: OpenBand[] = []
  const coreTop = o.coreTop != null && Number.isFinite(o.coreTop) ? o.coreTop : Infinity
  const band = (i: number, j: number, kind?: OpenBand['kind']) => {
    const ks = Array.from({ length: j - i + 1 }, (_, n) => i + n)
    const core1 = coreAt(T[i].level).side ** 2
    const k0: OpenBand['kind'] = kind ?? (ks.every((k) => T[k].area < MIN_FLOOR_AREA) ? 'void' : ks.every((k) => T[k].area <= 1.2 * core1) ? 'garden' : ks.some((k) => parts[k] > 1) ? 'gate' : 'open')
    const below = i - 1, above = j + 1 < T.length ? j + 1 : null
    bands.push({
      from: T[i].level, to: T[j].level, z0: T[i].z0, z1: T[j].z1, kind: k0, below: T[below].level, above: above != null ? T[above].level : null,
      share: Math.min(...ks.map((k) => Math.min(1, outside(k) / Math.max(1, outside(below))))),
      tall: Math.min(...ks.map((k) => Math.min(1, h(below) / h(k)))),
      core: Math.min(...ks.map((k) => (T[k].z0 >= coreTop - 0.01 ? 0 : I(T[k].level) / Math.max(1e-9, I(T[below].level))))),
      walls: above != null ? Math.min(...ks.map((k) => wallArea(T[k].level) / Math.max(1e-9, wallArea(T[above].level)))) : 1,
      coreIn: ks.every(inPlate),
      overTop: ks.every((k) => T[k].z0 >= coreTop - 0.01),
    })
  }
  // Bands whose plate drops to half of the storeys round them (closed above: a crown that only shrinks is a setback).
  const inBand = new Set<number>()
  for (let i = 1; i < T.length - 1; i++) {
    const lo = T[i - 1].area
    if (!(T[i].area <= OPEN_SHARE * lo)) continue
    let j = i
    while (j + 1 < T.length && T[j + 1].area <= OPEN_SHARE * lo && j + 1 - i < OPEN_BAND_MAX) j++
    if (j + 1 >= T.length) break
    const hi = T[j + 1].area
    if (T.slice(i, j + 1).every((x) => x.area <= OPEN_SHARE * hi)) { band(i, j); for (let k = i; k <= j; k++) inBand.add(k) }
    i = j
  }
  // Gates: the plate splits into separate parts where the storey below is whole (to the top too).
  for (let i = 1; i < T.length; i++) {
    if (inBand.has(i) || !(parts[i] > 1 && parts[i - 1] < parts[i])) continue
    let j = i
    while (j + 1 < T.length && parts[j + 1] > 1 && !inBand.has(j + 1) && j + 1 - i < OPEN_BAND_MAX) j++
    band(i, j, 'gate')
    i = j
  }
  bands.sort((a, b) => a.from - b.from)

  // The crown over a core top: the storeys that start at or above it stand on the frame alone.
  let crown: CrownReading | null = null
  if (Number.isFinite(coreTop)) {
    const k = T.findIndex((x) => x.z0 >= coreTop - 0.01)
    if (k > 0) crown = { coreTop, from: T[k].level, below: T[k - 1].level, share: Math.min(1, T[k].area / Math.max(1, outside(k - 1))) }
  }

  const ratios: StoreyRatio[] = bands.map((b) => {
    const r = (s * b.core + frame * b.share) / base
    return { what: `${lv(b.from, b.to)} ${kindText(b)}`, lo: r * b.tall ** 3, hi: r * b.tall }
  })
  if (crown) { const r = (frame * crown.share) / base; ratios.push({ what: `above the core top (+${crown.coreTop.toFixed(1)} m, L${crown.from} up)`, lo: r, hi: r }) }
  return { bands, crown, s, frame, ratios }
}

function insideAny(p: [number, number], g: [number, number][][]): boolean {
  let o = false
  for (const r of g) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o
  }
  return o
}

const BCBC: Source = { label: 'BC Building Code 2024, Division B, Table 4.1.8.6 (NBC 2020 the same)' }
const SRC_T1: Source = { ...BCBC, page: 'pp.4-482–4-484 (the table; Type 1’s 70% / 80% as research P10 machine-read them from NBC 2020); Aoyama (ed.) p.12 (no abrupt change of storey stiffness), pp.32–33 (a shear model gathers the drift in a few storeys)' }
const SRC_T6: Source = { ...BCBC, page: 'pp.4-482–4-484 (Type 6; the definition is recalled from NBC 2020, not in the readers’ notes: verify); Aoyama (ed.) pp.402, 405, 423 (first-storey walls with large openings the most stressed)' }
const SRC_T45: Source = { ...BCBC, page: 'pp.4-482–4-484 (Types 4 and 5) and 4.1.8.10(4); Ching et al., Building Structures Illustrated, p.43 (PDF page: where the outer tube opens, the core takes the storey shear)' }

/**
 * The open-storey lines for System & seismic: soft storey (Type 1), weak storey (Type 6) and the lateral path through
 * open storeys and over a core top (Types 4 and 5). `cont` (the column-continuity reading) says where columns start.
 */
export function openStoreyLines(r: OpenStoreyReading, cont?: ContinuityReading): RuleResult[] {
  const none = !r.bands.length && !r.crown
  const nothing = 'no open storey, gate, void or core top read'
  const proxy = `proxy: the core alone gives ${pc(Math.min(1, r.s))} of the stiffness 46/H assumes${r.frame > 0 ? `, the frame, belts and floors the other ${pc(r.frame)}` : ', so the frame is not counted on'}`
  const method = 'Open bands: tower storeys whose plate is at most half of the storeys below and above them (up to 8 storeys, closed above; team), a plate that splits into separate parts (a gate), or a storey with no plate; the core top is the height where the core walls end (an input). '
    + `No storey stiffness or strength is modelled. The sway and across-wind lines assume the stiffness 46/H gives; the core alone supplies ${pc(Math.min(1, r.s))} of it (the core-alone line, (f_core / f_46/H)²)${r.frame > 0 ? `, and the frame, belts and floors are taken to supply the other ${pc(r.frame)}` : ''}. `
    + 'At an open storey the frame’s share goes with the floors, in proportion to the plate kept outside the core; the core’s own share follows its bending stiffness there; a storey taller than the one below loses (h_below / h)¹ to (h_below / h)³ of it (a flexural to a shear storey). Above a core top only the frame is left, at most its share times the plate kept. '
  const conf = ' Confidence C: a whole-building frequency proxy turned into storey ratios; the engineer’s storey stiffness and strength from a flexural-shear or 3D model replace it.'
  const out: RuleResult[] = []

  // Type 1, soft storey
  const soft = r.ratios.filter((x) => x.lo < TYPE1_AVG)
  const softState: RuleState = none || !soft.length ? 'pass' : 'warn'
  out.push({ ...(softState === 'warn' ? { specialist: 'An open storey or a frame on a core is a candidate soft storey: the structural engineer clears it with a storey-stiffness (flexural-shear) model and carries Type 1 in the dynamic analysis.' } : {}),
    id: 'soft-storey', label: 'Soft storey at open storeys (Type 1)',
    value: none ? nothing : `${r.ratios.map((x) => `${x.what}: ≈ ${range(x)} of the storey below`).join('; ')} (${proxy})`,
    threshold: `storey stiffness ≥ ${pc(TYPE1_ADJ)} of an adjacent storey and ≥ ${pc(TYPE1_AVG)} of the mean of the three storeys above or below`,
    state: softState, flag: 'team_assumption', source: SRC_T1,
    note: none ? `${method}None is read in this model, so no open storey brings a Type 1 here; storey heights and stiffness elsewhere are not compared (no storey stiffness model).${conf}`
      : method + (r.bands.length ? `Bands: ${r.bands.map((b) => `${lv(b.from, b.to)} ${kindText(b)} (plate kept outside the core ${pc(b.share)} of L${b.below}'s; core stiffness ${pc(b.core)} of L${b.below}'s${b.tall < 0.995 ? `; storey height ratio ${b.tall.toFixed(2)}` : ''})`).join('; ')}. ` : '')
        + (r.crown ? `The crown from L${r.crown.from} stands over the core top at +${r.crown.coreTop.toFixed(1)} m: the frame alone, at most ${pc(r.frame)} × ${pc(r.crown.share)} of L${r.crown.below}'s stiffness${r.frame > 0 ? '' : ' (the core alone reaches 46/H here, so the model gives the frame no share and the crown’s frame is unread)'}. ` : '')
        + (soft.length ? `Under ${pc(TYPE1_AVG)}: ${soft.map((x) => x.what).join(', ')}. ` : `Every ratio clears ${pc(TYPE1_AVG)} on the proxy alone. `) + conf })

  // Type 6, weak storey
  const under = r.bands.filter((b) => b.above != null)
  const weakBands = under.filter((b) => (r.frame > 0 ? b.share < 0.995 : b.walls < 0.995))
  const weakState: RuleState = none || !weakBands.length ? 'pass' : 'warn'
  out.push({ ...(weakState === 'warn' ? { specialist: 'A storey weaker than the one above concentrates the yielding there: the structural engineer checks the storey shear strength of the open storeys against the storeys above, or keeps the frame through them.' } : {}),
    id: 'weak-storey', label: 'Weak storey at open storeys (Type 6)',
    value: none ? nothing : !under.length ? `no open band under a fuller storey${r.crown ? '; the crown over the core top is weaker than the storey below it, not the one above (no Type 6 from the core top itself)' : ''}`
      : weakBands.length ? `${weakBands.map((b) => `${lv(b.from, b.to)} under L${b.above}: ${r.frame > 0 ? `the core walls alone carry the storey shear the frame shares above (≈ ${pc(r.frame * (1 - b.share))} of the stiffness lost)` : `core walls ${pc(b.walls)} of L${b.above}'s`}`).join('; ')} (${proxy})`
        : `${under.map((b) => lv(b.from, b.to)).join(', ')}: the core walls carry the storey shear above and below, with no less wall (${proxy})`,
    threshold: 'storey shear strength ≥ that of the storey above (the sum of the SFRS elements sharing the storey shear)',
    state: weakState, flag: 'unverified', source: SRC_T6,
    note: 'Strength is not modelled; its proxy follows the stiffness one. Where the frame, belts and floors carry part of the stiffness (and so of the storey shear), an open storey under a fuller storey keeps only the core walls: weaker than the storey above unless the core alone carries the whole storey shear. Where the core alone reaches 46/H, the frame is taken as gravity framing and the reading compares the core walls’ area (4 × side × thickness) with the storey above. '
      + 'A stiff top storey (a bridge or truss) over open crown storeys would make them weak too: not read. The definition is recalled from NBC 2020 (not in the readers’ notes); verify it on the table’s page.' + conf })

  // Types 4 and 5, the lateral path
  const startsOver = (b: OpenBand) => (cont?.starts ?? []).filter((x) => x.level > b.from && x.level <= (b.above ?? b.to) && !x.ring)
  const breaks = r.bands.filter((b) => !b.coreIn && !b.overTop)
  const framed = r.frame > 0 ? r.bands : []
  const lpState: RuleState = none || (!breaks.length && !framed.length && !r.crown) ? 'pass' : 'warn'
  const bandText = (b: OpenBand) => {
    const st = startsOver(b)
    return `${lv(b.from, b.to)}: ${b.overTop ? 'above the core top, no core walls' : !b.coreIn ? 'the core walls do not stand inside the open storey’s plate (they break)' : 'the core walls continue'}${r.frame > 0 ? `; the frame loses its floors there (Type 4)${st.length ? ` and its columns start over it at ${st.map((x) => `L${x.level}${x.carry ? ` (on ${x.carry.text})` : ''}`).join(', ')} (Type 5)` : ''}` : ''}`
  }
  out.push({ ...(lpState === 'warn' ? { specialist: 'A lateral system that changes at an open storey or a core top is a discontinuity in the force path: the structural engineer carries Types 4 and 5 in the analysis, or keeps the frame and its columns through the opening.' } : {}),
    id: 'open-discontinuity', label: 'Lateral path through open storeys (Types 4, 5)',
    value: none ? nothing : [...r.bands.map(bandText), ...(r.crown ? [`above the core top (L${r.crown.from} up): the frame’s storey shear ends on the core top (Type 5; the lateral system changes there)`] : [])].join('; '),
    threshold: 'no in-plane discontinuity or out-of-plane offset in the SFRS; core walls continuous from their top to the foundation (4.1.8.10(4))',
    state: lpState, flag: 'unverified', source: SRC_T45,
    note: 'The core walls are the listed SFRS the shortlist reads; the continuity line checks their steps. Here the open storeys: a core that does not stand inside an open storey’s plate breaks its walls; where the frame, belts and floors carry part of the stiffness (46/H against the core alone), an open storey takes the frame’s floors away (a softer resisting element in the storey below, Type 4), and columns that start over the opening offset the force path (Type 5; the column-starts line). '
      + 'Where the outer frame opens, the core takes the storey shear (Ching p.43). Over a core top the frame above carries its storey shear into the core’s top, a discontinuity in the force path; the change of lateral system itself is read on its own line. Definitions of Types 4 and 5 as the continuity line reads them; the open-storey reading is a proxy.' + conf })
  return out
}
