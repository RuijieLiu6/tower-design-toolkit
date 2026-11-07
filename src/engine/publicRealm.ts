// Public realm checks for the competition site (research P06-M01 to M04; jury "human-scale experience", 40%).
// Deterministic geometry on Layer 0 massing plus a few per-street inputs. Thresholds come from the draft City-wide
// Design and Development Guidelines (CDDG, Council report RTS 18459 Appendix A, approved 28 Jul 2026, final text not
// yet posted), so every clause value carries that caveat; presets without a source are team assumptions.
// Research: 04 Tool Plan/research/modules-completion/P06/revise-r2_P06.json (single pass since 22 Oct).
import { towerFloors, towerFootprint, towerMasses } from './massing'
import type { RuleResult, RuleState, Tower, UseId } from './types'

// ---------- site ----------
/** Competition block in the model frame (from the supplied context model, local only). Brief p.15: about 79.2 × 144.8 m. */
export const VTC_SITE = { xMin: -72.39, xMax: 72.39, yMin: -39.67, yMax: 39.58 }
export const SITE_AREA = (VTC_SITE.xMax - VTC_SITE.xMin) * (VTC_SITE.yMax - VTC_SITE.yMin)

export type EdgeId = 'south' | 'west' | 'north' | 'east'
export type StreetType = 'retail' | 'arterial' | 'local'
export interface SiteEdge {
  id: EdgeId
  street: string
  type: StreetType
  /** Right-of-way, property line to property line (m), measured from the context model blocks. */
  row: number
  /** Unit normal pointing out of the site, into the street. */
  out: [number, number]
}
/**
 * Streets around the block. South and west names are the context model's labels (brief p.18 ground plan); north and
 * east are unnamed 20.1 m (66 ft) streets, typed "local" (team assumption). Widths measured block line to block line.
 */
export const VTC_EDGES: SiteEdge[] = [
  { id: 'south', street: 'Retail high street', type: 'retail', row: 24.3, out: [0, -1] },
  { id: 'west', street: 'Arterial street', type: 'arterial', row: 30.2, out: [-1, 0] },
  { id: 'north', street: 'North street (local)', type: 'local', row: 20.1, out: [0, 1] },
  { id: 'east', street: 'East street (local)', type: 'local', row: 20.1, out: [1, 0] },
]
/** The station is on the neighbouring block to the south-west (brief p.18; context "Transit plaza"). */
export const STATION_CORNER: [number, number] = [VTC_SITE.xMin, VTC_SITE.yMin]

export function edgeLength(id: EdgeId): number {
  return id === 'south' || id === 'north' ? VTC_SITE.xMax - VTC_SITE.xMin : VTC_SITE.yMax - VTC_SITE.yMin
}
/** Position of the property line along the edge's outward axis. */
function edgeLine(id: EdgeId): number {
  return id === 'south' ? VTC_SITE.yMin : id === 'north' ? VTC_SITE.yMax : id === 'west' ? VTC_SITE.xMin : VTC_SITE.xMax
}

// ---------- inputs ----------
export interface FrontageInput {
  /** Share of the building frontage on this street that is active use (retail, cafe, civic, hotel lobby, transit). */
  active: number
  /** Entrances on the active frontage. */
  entrances: number
  /** Share of the active frontage with weather protection. */
  canopy: number
  /** Driveways and loading doors crossing this street's sidewalk. */
  crossings: number
}
export interface PublicRealmInput {
  frontage: Record<EdgeId, FrontageInput>
  /** Share of the unbuilt site that is public (secured by right-of-way), the rest being drop-off, loading or private. */
  openPublicShare: number
  link: { enabled: boolean; axis: 'ns' | 'ew'; offset: number; width: number; openToSky: boolean; srw: boolean }
  station: { lifts: number; stairs: number; activeEdges: boolean }
}
/** Starting values for a first design (team assumptions, to be edited). Loading and parking come off the local streets. */
export const DEFAULT_PUBLIC_REALM: PublicRealmInput = {
  frontage: {
    south: { active: 0.9, entrances: 9, canopy: 0.9, crossings: 0 },
    west: { active: 0.7, entrances: 5, canopy: 0.7, crossings: 0 },
    north: { active: 0.6, entrances: 4, canopy: 0.5, crossings: 1 },
    east: { active: 0.5, entrances: 3, canopy: 0.5, crossings: 1 },
  },
  openPublicShare: 0.85,
  link: { enabled: true, axis: 'ns', offset: 50, width: 9.1, openToSky: true, srw: true },
  station: { lifts: 1, stairs: 1, activeEdges: true },
}

// ---------- geometry ----------
type Pt = [number, number]
interface Mass { poly: Pt[]; height: number; base: number; kind: 'podium' | 'tower'; tower: Tower }

/** Plan outlines of a tower's blocks above the podium (an imported mass: its hull). */
function shafts(t: Tower): [number, number][][] {
  if (t.imported) return [towerFootprint(t)]
  const up = towerMasses(t).filter((m) => !m.podium)
  return up.length ? up.map((m) => m.ring) : [towerFootprint(t)]
}

/** Plan footprints: every stacked block of each tower (podium blocks first), rotated and shifted with it. */
export function masses(towers: Tower[]): Mass[] {
  const out: Mass[] = []
  for (const t of towers) {
    if (t.imported) {
      if (t.podiumHeight > 0) out.push({ poly: towerFootprint(t, true), height: t.podiumHeight, base: 0, kind: 'podium', tower: t })
      out.push({ poly: towerFootprint(t), height: t.height, base: t.podiumHeight > 0 ? t.podiumHeight : 0, kind: 'tower', tower: t })
      continue
    }
    for (const m of towerMasses(t)) out.push({ poly: m.ring, height: m.z1, base: m.z0, kind: m.podium ? 'podium' : 'tower', tower: t })
  }
  return out
}

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const k = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy)
}
function cross(a: Pt, b: Pt, c: Pt): number { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) }
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
/** Least distance between two polygons (0 if they overlap or their edges cross). */
export function polyDistance(A: Pt[], B: Pt[]): number {
  if (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A))) return 0
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    if (segmentsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return 0
  }
  let d = Infinity
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    d = Math.min(d, segDist(A[i], B[j], B[(j + 1) % B.length]), segDist(B[j], A[i], A[(i + 1) % A.length]))
  }
  return d
}

/** For a street edge: a polygon's setback from the property line and its extent along the edge (clipped to the site). */
function onEdge(poly: Pt[], e: SiteEdge): { setback: number; from: number; to: number } {
  const n = e.out, line = edgeLine(e.id)
  const along = (p: Pt) => (n[0] === 0 ? p[0] : p[1])
  const across = (p: Pt) => (n[0] === 0 ? p[1] : p[0]) * (n[0] + n[1])
  const setback = Math.min(...poly.map((p) => line * (n[0] + n[1]) - across(p)))
  const lo = n[0] === 0 ? VTC_SITE.xMin : VTC_SITE.yMin, hi = n[0] === 0 ? VTC_SITE.xMax : VTC_SITE.yMax
  return { setback, from: Math.max(lo, Math.min(...poly.map(along))), to: Math.min(hi, Math.max(...poly.map(along))) }
}

// ---------- open space raster ----------
const CELL = 0.5
export interface OpenSpace {
  /** Unbuilt site area (m²). */
  open: number
  /** Public share of it (m²), after the input share. */
  publicArea: number
  /** Largest clear rectangle of open ground: the best candidate for a contiguous, well-proportioned POPS. */
  largest: { area: number; x0: number; x1: number; y0: number; y1: number } | null
  /** A 6.1 × 6.1 m clear square within 15 m of the station corner. */
  transitPlaza: boolean
  /** Building footprint at grade (m²). */
  built: number
}

export function openSpace(towers: Tower[], input: PublicRealmInput): OpenSpace {
  const ms = masses(towers)
  // Cells divide the site exactly (about 0.5 m).
  const nx = Math.ceil((VTC_SITE.xMax - VTC_SITE.xMin) / CELL), ny = Math.ceil((VTC_SITE.yMax - VTC_SITE.yMin) / CELL)
  const cx = (VTC_SITE.xMax - VTC_SITE.xMin) / nx, cy = (VTC_SITE.yMax - VTC_SITE.yMin) / ny
  const free = new Uint8Array(nx * ny)
  let open = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Pt = [VTC_SITE.xMin + (i + 0.5) * cx, VTC_SITE.yMin + (j + 0.5) * cy]
    if (!ms.some((m) => inside(p, m.poly))) { free[j * nx + i] = 1; open++ }
  }
  // Largest clear axis-aligned rectangle (histogram method over the grid rows).
  let largest: OpenSpace['largest'] = null
  const hgt = new Int32Array(nx)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) hgt[i] = free[j * nx + i] ? hgt[i] + 1 : 0
    const st: number[] = []
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? hgt[i] : 0
      while (st.length && hgt[st[st.length - 1]] >= h) {
        const top = st.pop()!, height = hgt[top], left = st.length ? st[st.length - 1] + 1 : 0
        const area = height * (i - left) * cx * cy
        if (height > 0 && (!largest || area > largest.area)) largest = { area, x0: VTC_SITE.xMin + left * cx, x1: VTC_SITE.xMin + i * cx, y0: VTC_SITE.yMin + (j - height + 1) * cy, y1: VTC_SITE.yMin + (j + 1) * cy }
      }
      st.push(i)
    }
  }
  // Transit plaza: any 6.1 m clear square whose corner lies within 15 m of the station corner.
  const sq = Math.ceil(6.1 / Math.min(cx, cy)), reach = Math.round(15 / Math.min(cx, cy))
  let transitPlaza = false
  for (let j = 0; j <= reach && !transitPlaza; j++) for (let i = 0; i <= reach && !transitPlaza; i++) {
    let ok = i + sq <= nx && j + sq <= ny
    for (let b = j; ok && b < j + sq; b++) for (let a = i; ok && a < i + sq; a++) if (!free[b * nx + a]) ok = false
    transitPlaza = ok
  }
  const area = open * cx * cy
  return { open: area, publicArea: area * Math.max(0, Math.min(1, input.openPublicShare)), largest, transitPlaza, built: SITE_AREA - area }
}

// ---------- rule helpers ----------
const fmt = (v: number) => Math.round(v).toLocaleString()
const f1 = (v: number) => v.toFixed(1)
const CDDG = { label: 'City-wide Design and Development Guidelines, draft Appendix A to Council report RTS 18459 (approved 28 Jul 2026; final text not yet posted)', url: 'https://council.vancouver.ca/20260728/documents/r2.pdf' }
const cddg = (page: string) => ({ ...CDDG, page })
const BRIEF = 'Vancouver Tall Challenge brief (Buildner 2026)'
const rule = (r: RuleResult) => r

/** Table 2.2b (Downtown and Broadway Plan Area): maximum podium height by right-of-way width. */
export function podiumBand(row: number): number {
  return row <= 27.5 ? 15.2 : row <= 30.5 ? 18.3 : 23.0
}

// Table 1.5 tower separation by use pair (m).
type SepUse = 'residential' | 'hotel' | 'employment'
const SEP: Record<string, number> = { 'residential|residential': 24.4, 'hotel|residential': 24.4, 'employment|residential': 18.3, 'hotel|hotel': 15.2, 'employment|hotel': 15.2, 'employment|employment': 15.2 }
const sepUses = (t: Tower): SepUse[] => {
  const s = new Set<SepUse>()
  for (const f of towerFloors(t)) {
    if (f.podium || f.use === 'mechanical') continue
    s.add(f.use === 'residential' ? 'residential' : f.use === 'hotel' ? 'hotel' : 'employment')
  }
  return [...s]
}
function sepNeeded(a: SepUse[], b: SepUse[]): number {
  let need = 0
  for (const x of a) for (const y of b) need = Math.max(need, SEP[[x, y].sort().join('|')] ?? 15.2)
  return need
}

export interface Neighbour { label: string; footprint: Pt[]; height: number }

// ---------- M02: streetwall and tower form ----------
export interface EdgeWall { edge: SiteEdge; wallHeight: number; max: number; stepBack: number | null; setback: number; continuity: number; ratio: number; state: RuleState }

export function streetwallCheck(towers: Tower[], input: PublicRealmInput, neighbours: Neighbour[] = []): { rules: RuleResult[]; edges: EdgeWall[] } {
  const rules: RuleResult[] = []
  const os = openSpace(towers, input)
  const enhanced = (os.largest?.area ?? 0) >= 300
  const edges: EdgeWall[] = VTC_EDGES.map((e) => {
    // The streetwall on this street is the nearest mass; a tower within 1.5 m of its podium face rises in the wall.
    let wallHeight = 0, stepBack: number | null = null, setback = Infinity, covered = 0
    for (const t of towers) {
      const tw = onEdge(towerFootprint(t), e)
      if (t.podiumHeight > 0) {
        const pd = onEdge(towerFootprint(t, true), e)
        const sb = tw.setback - pd.setback
        stepBack = stepBack === null ? sb : Math.min(stepBack, sb)
        wallHeight = Math.max(wallHeight, sb >= 1.5 ? t.podiumHeight : t.height)
        setback = Math.min(setback, pd.setback)
        if (pd.setback <= 1) covered += Math.max(0, pd.to - pd.from)
      } else {
        wallHeight = Math.max(wallHeight, t.height)
        setback = Math.min(setback, tw.setback)
        if (tw.setback <= 1) covered += Math.max(0, tw.to - tw.from)
      }
    }
    const frontage = edgeLength(e.id)
    const base = podiumBand(e.row)
    const max = base < 21.3 && frontage > 60.7 && enhanced ? 21.3 : base
    return { edge: e, wallHeight, max, stepBack, setback, continuity: Math.min(1, covered / frontage), ratio: wallHeight / e.row, state: wallHeight <= max + 1e-6 ? 'pass' : 'fail' }
  })

  for (const w of edges) {
    const base = podiumBand(w.edge.row)
    rules.push(rule({
      id: `pr-podium-${w.edge.id}`,
      label: `Streetwall on the ${w.edge.street.toLowerCase()}`,
      value: `${f1(w.wallHeight)} m on a ${f1(w.edge.row)} m street (height to width ${w.ratio.toFixed(2)})`,
      threshold: `≤ ${f1(w.max)} m${w.max > base ? ` (Table 2.2b gives ${f1(base)} m; S2.2.8b allows 21.3 m with enhanced open space)` : ' (Table 2.2b)'}`,
      state: w.state,
      flag: 'verified',
      source: cddg('Table 2.2b, S2.2.6 and S2.2.8'),
      note: `${w.stepBack !== null && w.stepBack < 1.5 ? `The tower is within ${f1(Math.max(0, w.stepBack))} m of the podium face here, so it counts as streetwall (a step-back of at least 1.5 m reads as a break). ` : ''}Table 2.2b applies to mixed-use and non-residential tower podiums; S2.2.7 (18.3 m) only to exclusively residential ones.${w.max > base ? ' Enhanced open space is taken as present from the largest open piece (300 m² or more); planting and vehicle-free use are not checked (team).' : ''}`,
    }))
  }

  const steps = edges.filter((w) => w.stepBack !== null).map((w) => w.stepBack as number)
  if (steps.length) {
    const least = Math.min(...steps)
    rules.push(rule({
      id: 'pr-stepback', label: 'Tower step-back above the podium', value: `${f1(least)} m at the least`,
      threshold: '≥ 1.5 m planar change, 1.5–3.0 m reads as a break (CDDG tip)', state: least >= 1.5 ? 'pass' : 'warn', flag: 'team_assumption',
      source: cddg('G2.2.2 and design tip'), note: 'G2.2.2 asks for a setback above the podium without a number; the 1.5–3.0 m figure is a CDDG design tip, not a standard.',
    }))
  }

  rules.push(...towerFormRules(towers, neighbours))

  // Streetwall continuity (team preset), on the streets where a continuous wall is expected.
  for (const w of edges.filter((x) => x.edge.type !== 'local')) {
    rules.push(rule({
      id: `pr-continuity-${w.edge.id}`, label: `Streetwall continuity on the ${w.edge.street.toLowerCase()}`, value: `${Math.round(w.continuity * 100)}% within 1 m of the property line (nearest face ${f1(Math.max(0, w.setback))} m back)`,
      threshold: '≥ 80% (team preset)', state: w.continuity >= 0.8 ? 'pass' : w.continuity >= 0.5 ? 'warn' : 'fail', flag: 'team_assumption', source: cddg('G2.2.1'),
      note: 'G2.2.1 asks to keep continuity where a continuous streetwall is wanted, with no percentage. A deliberate setback for a plaza can be the better move; say so on the boards.',
    }))
  }
  return { rules, edges }
}

// ---------- M01: frontage ----------
export interface EdgeFrontage { edge: SiteEdge; length: number; activeLength: number; spacing: number | null; target: number; state: RuleState }

/** Building frontage on each street: the street-facing extent of the podium (or tower) footprints. */
/**
 * The tower-form lines that need no street: floorplate, plan dimension, slenderness, separation and massing variation
 * (and, on the competition block, the tower's width against the frontage it faces). The competition's streetwall check
 * uses them in place; on Real Vancouver they are the whole node until the study site's streets are typed (node audit,
 * 7 Nov: Streetwall & tower form ran on the competition site only, though most of its tower rules need no street).
 */
export function towerFormRules(towers: Tower[], neighbours: Neighbour[] = [], opts: { frontage: boolean } = { frontage: true }): RuleResult[] {
  const rules: RuleResult[] = []
  for (const t of towers) {
    const plate = t.width * t.depth
    const uses = new Set(towerFloors(t).filter((f) => !f.podium && f.use !== 'mechanical').map((f) => f.use))
    const resMax = t.height >= 150 ? 1115 : t.height >= 90 ? 746 : 670
    const limits: [string, number][] = []
    if ([...uses].some((u) => u !== 'residential')) limits.push(['employment and hotel floors', 1395])
    if (uses.has('residential')) limits.push(['residential floors', resMax])
    const worst = limits.reduce<[string, number] | null>((m, l) => (!m || l[1] < m[1] ? l : m), null)
    rules.push(rule({
      id: `pr-plate-${t.id}`, label: `Tower floorplate: ${t.name}`, value: `${fmt(plate)} m² average`,
      threshold: limits.map(([k, v]) => `${k} ≤ ${fmt(v)} m²`).join('; ') || '—',
      state: worst && plate > worst[1] ? 'warn' : 'pass', flag: 'verified', source: cddg('Table 2.3 and S2.3.3'),
      note: `Employment and hotel towers about 930–1,395 m²; very tall residential (about 150 m and up) 930–1,115 m². Larger plates are reviewed case by case. Splitting a stacked tower by use portion is our reading.${worst && plate > worst[1] ? ` About ${Math.round((plate / worst[1] - 1) * 100)}% above the ${worst[0]} maximum: a slimmer plate or more towers.` : ''}`,
    }))
    const dim = Math.max(t.width, t.depth)
    rules.push(rule({
      id: `pr-dim-${t.id}`, label: `Tower plan dimension: ${t.name}`, value: `${f1(dim)} m`,
      threshold: '≤ 29.0 m, or clear volumetric articulation', state: dim <= 29.0 ? 'pass' : 'warn', flag: 'verified', source: cddg('S2.3.1, S2.3.2, G2.3.2'),
      note: dim <= 29 ? 'Slender in plan.' : 'Over 29.0 m: mixed-use and non-residential towers must show clear volumetric articulation (S2.3.2). The box model has none; describe it on the boards.',
    }))
    if (opts.frontage) {
    const share = Math.max(t.width / edgeLength('south'), t.depth / edgeLength('west'))
    rules.push(rule({
      id: `pr-share-${t.id}`, label: `Tower width against the frontage: ${t.name}`, value: `${Math.round(share * 100)}% of the frontage it faces`,
      threshold: 'below about 60% (CDDG tip: wider reads as a slab)', state: share <= 0.6 ? 'pass' : 'warn', flag: 'team_assumption', source: cddg('design tip, section 2.3'),
      note: 'A rule of thumb in the CDDG, not a standard: about 47.5 m on the 79.2 m side, 86.9 m on the 144.8 m side (our arithmetic).',
    }))
    }
    const slender = t.height / Math.max(1, Math.min(t.width, t.depth))
    rules.push(rule({
      id: `pr-slender-${t.id}`, label: `Tower slenderness: ${t.name}`, value: `${f1(slender)} : 1 (height to width)`,
      threshold: '6:1 to 8:1 or more for tall towers (CDDG tip)', state: slender >= 6 ? 'pass' : 'warn', flag: 'team_assumption', source: cddg('design tip, section 2.3'),
    }))
  }

  // Tower separation: every own pair, and own towers to the context's future towers (use unknown: residential assumed).
  const pairs: { a: string; b: string; d: number; need: number; h: number }[] = []
  for (let i = 0; i < towers.length; i++) {
    // Closest pair of blocks above the podium (shifted or twisted blocks can come closer than the typical plate).
    const A = shafts(towers[i])
    for (let j = i + 1; j < towers.length; j++) {
      const B = shafts(towers[j])
      pairs.push({ a: towers[i].name, b: towers[j].name, d: Math.min(...A.flatMap((a) => B.map((b) => polyDistance(a, b)))), need: sepNeeded(sepUses(towers[i]), sepUses(towers[j])), h: Math.max(towers[i].height, towers[j].height) })
    }
    for (const nb of neighbours) pairs.push({ a: towers[i].name, b: nb.label, d: Math.min(...A.map((a) => polyDistance(a, nb.footprint))), need: sepNeeded(sepUses(towers[i]), ['residential']), h: Math.max(towers[i].height, nb.height) })
  }
  if (pairs.length) {
    const worst = pairs.reduce((m, p) => (p.d - p.need < m.d - m.need ? p : m))
    rules.push(rule({
      id: 'pr-separation', label: 'Tower separation', value: `${f1(worst.d)} m between ${worst.a} and ${worst.b} (closest to its limit)`,
      threshold: `≥ ${f1(worst.need)} m for this use pair (Table 1.5)`, state: worst.d >= worst.need ? 'pass' : 'fail', flag: 'verified', source: cddg('Table 1.5, S1.5.1–S1.5.4'),
      note: `${pairs.length} pair${pairs.length > 1 ? 's' : ''} checked: ${pairs.map((p) => `${p.a}–${p.b} ${f1(p.d)} m`).join(', ')}. Residential to residential or hotel 24.4 m, residential to employment 18.3 m, others 15.2 m. Future towers in the context have no stated use, so residential is assumed (team).`,
    }))
    const tight = pairs.filter((p) => p.h > 150).reduce<(typeof pairs)[number] | null>((m, p) => (!m || p.d / p.h < m.d / m.h ? p : m), null)
    if (tight) rules.push(rule({
      id: 'pr-separation-tall', label: 'Separation for very tall towers', value: `${f1(tight.d)} m for a ${fmt(tight.h)} m tower (${(tight.d / tight.h).toFixed(2)} of its height)`,
      threshold: 'consider more than Table 1.5 above typical heights (no number)', state: 'unknown', flag: 'unverified', source: cddg('G1.5.1'),
      note: 'G1.5.1 asks for more separation where towers exceed typical heights; it gives no value, so this is reported, not judged.',
    }))
  }

  // Massing variation along the street (S2.2.1): a box podium has none.
  const longest = Math.max(0, ...towers.filter((t) => t.podiumHeight > 0).map((t) => Math.max(t.podiumWidth, t.podiumDepth)), ...towers.map((t) => Math.max(t.width, t.depth)))
  rules.push(rule({
    id: 'pr-variation', label: 'Massing variation along the street', value: `${f1(longest)} m of unbroken facade in the model`,
    threshold: 'a plane change about every 25.0–45.7 m', state: longest <= 45.7 ? 'pass' : 'warn', flag: 'verified', source: cddg('S2.2.1'),
    note: 'The massing model is a box, so it shows no plane changes; add steps of 1.5 m or more at least every 45.7 m and show them on the boards.',
  }))

  return rules
}

/** Streetwall & tower form on Real Vancouver: the tower rules, and the street rules marked open. */
export function cityStreetwallCheck(towers: Tower[]): { rules: RuleResult[]; edges: EdgeWall[] } {
  if (!towers.length) return { rules: [], edges: [] }
  return {
    edges: [],
    rules: [
      rule({
        id: 'pr-streets', label: 'Streetwall height, continuity and step-back', value: 'needs the study site’s street types and right-of-way widths',
        threshold: 'Table 2.2b podium bands by right-of-way width; a continuous wall on retail and arterial streets', state: 'unknown', flag: 'unresolved', source: cddg('Table 2.2b, S2.2'),
        note: 'The streets around a Real Vancouver study site are not typed in the Toolkit yet (no City street classification in its data), so the street rules run on the competition site only. The tower rules here need no street.',
      }),
      ...towerFormRules(towers, [], { frontage: false }),
    ],
  }
}

function frontageLength(towers: Tower[], e: SiteEdge): number {
  const spans: [number, number][] = []
  for (const t of towers) {
    // The block standing at grade (an imported mass: podium or hull, as before).
    const poly = t.imported ? (t.podiumHeight > 0 ? towerFootprint(t, true) : towerFootprint(t)) : (towerMasses(t)[0]?.ring ?? towerFootprint(t))
    const o = onEdge(poly, e)
    if (o.to > o.from) spans.push([o.from, o.to])
  }
  spans.sort((a, b) => a[0] - b[0])
  let total = 0, cur: [number, number] | null = null
  for (const s of spans) {
    if (!cur || s[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [s[0], s[1]] } else cur[1] = Math.max(cur[1], s[1])
  }
  if (cur) total += cur[1] - cur[0]
  return total
}

export function frontageCheck(towers: Tower[], input: PublicRealmInput): { rules: RuleResult[]; edges: EdgeFrontage[] } {
  const rules: RuleResult[] = []
  const edges: EdgeFrontage[] = VTC_EDGES.map((e) => {
    const f = input.frontage[e.id]
    const length = frontageLength(towers, e)
    const activeLength = length * Math.max(0, Math.min(1, f.active))
    const target = e.type === 'retail' ? 0.9 : 0.7
    return { edge: e, length, activeLength, spacing: f.entrances > 0 ? activeLength / f.entrances : null, target, state: f.active >= target ? 'pass' : f.active >= 0.5 ? 'warn' : 'fail' }
  })
  for (const x of edges) {
    const f = input.frontage[x.edge.id]
    rules.push(rule({
      id: `pr-active-${x.edge.id}`, label: `Active frontage on the ${x.edge.street.toLowerCase()}`, value: `${Math.round(f.active * 100)}% of ${f1(x.length)} m of building frontage`,
      threshold: `≥ ${Math.round(x.target * 100)}% (team preset for ${x.edge.type === 'retail' ? 'a retail high street' : x.edge.type === 'arterial' ? 'an arterial' : 'other streets'}; below 50% fails)`,
      state: x.state, flag: 'team_assumption', source: cddg('G2.6.1'),
      note: 'G2.6.1 asks for active uses on fronting streets, corners, open spaces and links, with no percentage. Hotel lobbies and transit entrances count active; office and residential lobbies count semi-active (team).',
    }))
    if (x.activeLength > 0) {
      rules.push(rule({
        id: `pr-entrances-${x.edge.id}`, label: `Entrance spacing on the ${x.edge.street.toLowerCase()}`, value: x.spacing === null ? 'No entrances on the active frontage' : `${f1(x.spacing)} m between ${f.entrances} entrances (${f1((f.entrances / x.activeLength) * 100)} per 100 m)`,
        threshold: 'typically 8–12 m on fine-grain active frontage', state: x.spacing === null ? 'fail' : x.spacing <= 12 ? 'pass' : 'warn', flag: 'verified', source: cddg('S3.1.1a'),
        note: '"Typically" makes this discretionary. Major active uses (grocery, cultural venue, hotel lobby) are judged apart and may justify longer spacing.',
      }))
    }
  }
  const act = edges.reduce((s, x) => s + x.activeLength, 0)
  const sheltered = edges.reduce((s, x) => s + x.activeLength * Math.max(0, Math.min(1, input.frontage[x.edge.id].canopy)), 0)
  const cover = act > 0 ? sheltered / act : 0
  rules.push(rule({
    id: 'pr-canopy', label: 'Weather protection along active frontage', value: `${Math.round(cover * 100)}% of ${fmt(act)} m`,
    threshold: '≥ 90% generally continuous (team preset; below 50% fails); canopy 3.0–4.5 m high, at least 1.5 m deep', state: cover >= 0.9 ? 'pass' : cover >= 0.5 ? 'warn' : 'fail', flag: 'team_assumption', source: cddg('G3.2.1, S3.2.1, S3.2.2'),
    note: 'G3.2.1 asks for generally continuous protection where pedestrian activity is high; the percentages are placeholders. The canopy height and depth ranges are CDDG text (S3.2.1–S3.2.2).',
  }))
  const bad = VTC_EDGES.filter((e) => e.type !== 'local' && input.frontage[e.id].crossings > 0)
  rules.push(rule({
    id: 'pr-crossings', label: 'Driveways and loading on the main streets', value: bad.length ? bad.map((e) => `${input.frontage[e.id].crossings} on the ${e.street.toLowerCase()}`).join(', ') : `none (${VTC_EDGES.filter((e) => e.type === 'local').reduce((s, e) => s + input.frontage[e.id].crossings, 0)} on the local streets)`,
    threshold: 'vehicle access from the lane or a side street, none across the retail high street or arterial', state: bad.length ? 'fail' : 'pass', flag: 'verified', source: cddg('G2.10.1; Transportation 2040 W 1.1.6'),
    note: 'The block is consolidated (no lane), so access belongs on the local streets. Brief p.16: servicing and loading should minimise their impact on pedestrians.',
  }))
  const pod = towers.filter((t) => t.podiumHeight > 0)
  const groundF2F = pod.length ? Math.min(...pod.map((t) => towerFloors(t).find((f) => f.podium)?.z1 ?? t.f2f)) : Math.min(...towers.map((t) => t.f2f))
  rules.push(rule({
    id: 'pr-ground-height', label: 'Ground storey height for active uses', value: `${f1(groundF2F)} m floor to floor`,
    threshold: '4.6–6.1 m', state: groundF2F >= 4.6 - 1e-6 && groundF2F <= 6.1 + 1e-6 ? 'pass' : 'warn', flag: 'verified', source: cddg('S2.7.1'),
    note: groundF2F < 4.6 ? 'Lower than the active-use range: raise the ground storey (a taller podium base or one fewer podium floor).' : groundF2F > 6.1 ? 'Taller than the range: explain a mezzanine or a double-height use.' : 'Tall enough for shopfronts and mezzanines.',
  }))
  return { rules, edges }
}

// ---------- M03 + M04: open space and links ----------
export interface LinkGeom { x0: number; x1: number; y0: number; y1: number; through: 'clear' | 'podium' | 'tower' }

export function linkGeometry(towers: Tower[], input: PublicRealmInput): LinkGeom | null {
  const L = input.link
  if (!L.enabled) return null
  const w = Math.max(0.5, L.width)
  const g = L.axis === 'ns'
    ? { x0: L.offset - w / 2, x1: L.offset + w / 2, y0: VTC_SITE.yMin, y1: VTC_SITE.yMax }
    : { x0: VTC_SITE.xMin, x1: VTC_SITE.xMax, y0: L.offset - w / 2, y1: L.offset + w / 2 }
  const corridor: Pt[] = [[g.x0, g.y0], [g.x1, g.y0], [g.x1, g.y1], [g.x0, g.y1]]
  let through: LinkGeom['through'] = 'clear'
  for (const m of masses(towers)) {
    if (polyDistance(corridor, m.poly) === 0) { if (m.kind === 'tower') { through = 'tower'; break } through = 'podium' }
  }
  return { ...g, through }
}

/**
 * Results of other nodes the ground plane reads when they are on (node audit, 7 Nov: these two lines said "Not assessed"
 * although the solar access and wind screen nodes are built). Absent, the line says which node answers it.
 */
export interface GroundCross {
  /** The Solar access & sun hours lines for this project (its worker's last result). */
  solar?: RuleResult[] | null
  /** The pedestrian wind screen's risk zones (screening, not CFD). */
  wind?: { zones: { level: 'low' | 'medium' | 'high'; kind: string; z: number }[]; note: string } | null
}
const FLAG_RANK: Record<string, number> = { false_assumption: 0, unresolved: 1, unverified: 2, team_assumption: 3, verified: 4 }
const weakestFlag = (flags: string[]) => flags.reduce((w, f) => ((FLAG_RANK[f] ?? 2) < (FLAG_RANK[w] ?? 2) ? f : w), 'verified') as RuleResult['flag']

/** The ground-plane line for sun, from the solar access node's lines: its worst state and weakest flag. */
export function sunLine(solar: RuleResult[] | null | undefined): RuleResult {
  const threshold = 'Downtown Peninsula Solar Access Guidelines (22 Sep, 10:00–16:00)'
  const source = { label: 'Solar Access Guidelines, memo RTS 16506 Appendix A (2025), via the Solar access & sun hours node' }
  if (!solar || !solar.length) return { id: 'pr-sun', label: 'Sun on the open space and shadow on protected parks', value: 'Switch on Solar access & sun hours', threshold, state: 'unknown', flag: 'unresolved', source }
  const n = (s: RuleState) => solar.filter((l) => l.state === s).length
  const fail = n('fail'), warn = n('warn'), unknown = n('unknown'), pass = n('pass')
  const state: RuleState = fail ? 'fail' : warn ? 'warn' : unknown ? 'unknown' : 'pass'
  const parts = [pass && `${pass} pass`, warn && `${warn} to check`, fail && `${fail} fail`, unknown && `${unknown} open`].filter(Boolean)
  return { id: 'pr-sun', label: 'Sun on the open space and shadow on protected parks', value: `${parts.join(', ')} of ${solar.length} solar lines`, threshold, state, flag: weakestFlag(solar.map((l) => l.flag)), source,
    note: 'Read from the Solar access & sun hours node: each of its lines keeps its own source and flag there.' }
}

/** The ground-plane line for wind, from the wind screen's zones that reach the ground (podium-roof zones are left out). */
export function windLine(wind: GroundCross['wind'], groundZ = 1): RuleResult {
  const threshold = 'comfort for sitting, standing and walking; gust safety'
  if (!wind) return { id: 'pr-wind', label: 'Wind at the open space, entrances and links', value: 'Switch on Pedestrian wind: massing screen', threshold, state: 'unknown', flag: 'unresolved',
    source: { label: 'No Vancouver criteria opened; Toronto 2022 guide is an external benchmark (research P06, CLIM)' } }
  const ground = wind.zones.filter((z) => z.z <= groundZ)
  const high = ground.filter((z) => z.level === 'high').length, medium = ground.filter((z) => z.level === 'medium').length
  return { id: 'pr-wind', label: 'Wind at the open space, entrances and links', value: high + medium ? `${high} high and ${medium} medium risk zones at the ground` : 'no medium or high risk zone at the ground',
    threshold, state: high + medium ? 'warn' : 'pass', flag: 'team_assumption', source: { label: 'Pedestrian wind: massing screen (research P03-M03; Toronto 2022 analog)' }, note: wind.note }
}

export function groundPlaneCheck(towers: Tower[], input: PublicRealmInput, cross: GroundCross = {}): { rules: RuleResult[]; open: OpenSpace; link: LinkGeom | null; longestGap: number } {
  const rules: RuleResult[] = []
  const os = openSpace(towers, input)
  const share = os.publicArea / SITE_AREA
  rules.push(rule({
    id: 'pr-open-share', label: 'Public open space on the site', value: `${Math.round(share * 100)}% (${fmt(os.publicArea)} m² of ${fmt(SITE_AREA)} m²)`,
    threshold: '≥ 20% of site area', state: share >= 0.2 ? 'pass' : share >= 0.1 ? 'warn' : 'fail', flag: 'team_assumption', source: cddg('S1.9.1 and glossary'),
    note: `Counts the unbuilt site at ${Math.round(input.openPublicShare * 100)}% public (the rest drop-off, loading or private; team). S1.9.1 covers large or unique sites; that the 11,474 m² block is "large" rests on the 2013 large-site trigger (8,000 m²), current policy unread. The 10% mid-sized target (S1.9.2) does not apply (false assumption corrected in research).`,
  }))
  const pops = os.largest ? Math.min(os.largest.area, os.publicArea) : 0
  rules.push(rule({
    id: 'pr-pops', label: 'Privately owned public space (POPS)', value: `${fmt(pops)} m² in the largest clear rectangle of open ground (${Math.round((pops / SITE_AREA) * 100)}%)`,
    threshold: 'about 10% of site area (about 1,147 m²)', state: pops >= 0.1 * SITE_AREA ? 'pass' : pops >= 0.05 * SITE_AREA ? 'warn' : 'fail', flag: 'verified', source: cddg('S1.10.2 and glossary'),
    note: 'Mixed-use and non-residential tower sites with frontage over 60.7 m. Counted inside the 20% total (whether it is extra is unresolved).',
  }))
  if (os.largest) {
    const w = os.largest.x1 - os.largest.x0, h = os.largest.y1 - os.largest.y0
    const aspect = Math.max(w, h) / Math.max(0.1, Math.min(w, h))
    const ok = os.largest.area >= 300 && aspect <= 2
    rules.push(rule({
      id: 'pr-pops-shape', label: 'POPS shape', value: `${f1(w)} × ${f1(h)} m (1:${aspect.toFixed(1)}), ${fmt(os.largest.area)} m²`,
      threshold: 'contiguous, about 300 m² or more, proportion 1:1 to 1:2, free of overhead mass', state: ok ? 'pass' : os.largest.area >= 300 ? 'warn' : 'fail', flag: 'verified', source: cddg('S1.11.1 and glossary (POPS)'),
      note: `${aspect > 2 ? 'Long and narrow: it reads as a setback, not a place. Strips around the podium are not counted as one space. ' : ''}A statutory right-of-way, public access points and no podium or roof space without public stairs and lifts are also required.`,
    }))
  }
  rules.push(rule({
    id: 'pr-transit-plaza', label: 'Transit plaza by the station corner', value: os.transitPlaza ? 'A 6.1 × 6.1 m clear space within 15 m of the south-west corner' : 'No 6.1 × 6.1 m clear space near the south-west corner',
    threshold: 'at least about 6.1 × 6.1 m beside a station entrance', state: os.transitPlaza ? 'pass' : 'fail', flag: 'verified', source: cddg('S4.4.1; section 1.9 note'),
    note: 'The station is on the neighbouring block to the south-west (brief p.18). Transit plazas do not count toward park dedication.',
  }))

  const link = linkGeometry(towers, input)
  rules.push(rule({
    id: 'pr-link', label: 'Mid-block connection', value: link ? `${input.link.axis === 'ns' ? 'North–south' : 'East–west'} link, ${f1(input.link.width)} m wide` : 'None',
    threshold: 'required where the site includes or adjoins a station entrance', state: link ? 'pass' : 'fail', flag: 'verified', source: cddg('S1.12.1b, G1.12.2'),
    note: 'The brief asks for a below-grade secondary transit entrance connecting to the station on the neighbouring site (p.19), so the trigger applies.',
  }))
  if (link) {
    rules.push(rule({
      id: 'pr-link-width', label: 'Mid-block connection width', value: `${f1(input.link.width)} m building face to building face`,
      threshold: '≥ 9.1 m on this site, with a 2.4 m clear path', state: input.link.width >= 9.1 - 1e-6 ? 'pass' : 'warn', flag: 'verified', source: cddg('S1.12.2c, S3.8.1'),
      note: input.link.width >= 9.1 ? 'Wide enough for daylight and active edges.' : 'Narrower than 9.1 m needs a G1.12.1 variation and a justification (false assumption corrected in research: 5.4 m and 7.3 m do not apply here).',
    }))
    const throughPodium = link.through === 'podium'
    const throughTower = link.through === 'tower'
    rules.push(rule({
      id: 'pr-link-sky', label: 'Connection open to the sky', value: throughTower ? 'Passes under the tower' : throughPodium ? (input.link.openToSky ? 'Cuts through the podium, open to the sky' : 'Covered passage under the podium') : 'Clear of the buildings, open to the sky',
      threshold: 'primarily open to the sky; a breezeway only at least 2:1 height to width, lined with active uses, direct and public',
      state: throughTower ? 'fail' : throughPodium ? 'warn' : 'pass', flag: 'verified', source: cddg('S1.12.4, S2.2.10'),
      note: throughTower ? 'Move the link off the tower footprint.' : throughPodium ? (input.link.openToSky ? 'The link splits the podium; the podium floor area is not reduced in this model yet, so FSR is overstated slightly.' : `As a breezeway its clear height must be at least ${f1(2 * input.link.width)} m (2:1).`) : 'Through open ground, as the guidelines prefer.',
    }))
    rules.push(rule({
      id: 'pr-link-srw', label: 'Connection secured for public use', value: input.link.srw ? 'Statutory right-of-way' : 'No right-of-way',
      threshold: 'secured by a statutory right-of-way', state: input.link.srw ? 'pass' : 'fail', flag: 'verified', source: cddg('S1.12.3'),
      note: '24-hour opening is not stated in the guidelines.',
    }))
  }
  // Longest stretch of perimeter without a public through-route: corners count as openings, a link adds one on each side it meets.
  const openings: Record<EdgeId, number[]> = { south: [], north: [], west: [], east: [] }
  if (link && input.link.axis === 'ns') { openings.south.push(input.link.offset); openings.north.push(input.link.offset) }
  if (link && input.link.axis === 'ew') { openings.west.push(input.link.offset); openings.east.push(input.link.offset) }
  let longestGap = 0
  for (const e of VTC_EDGES) {
    const lo = e.out[0] === 0 ? VTC_SITE.xMin : VTC_SITE.yMin, hi = e.out[0] === 0 ? VTC_SITE.xMax : VTC_SITE.yMax
    const pts = [lo, ...openings[e.id].filter((v) => v > lo && v < hi).sort((a, b) => a - b), hi]
    for (let i = 1; i < pts.length; i++) longestGap = Math.max(longestGap, pts[i] - pts[i - 1])
  }
  rules.push(rule({
    id: 'pr-perimeter', label: 'Longest block side without a public route', value: `${f1(longestGap)} m`,
    threshold: '≤ about 100 m (team preset; above 150 m fails)', state: longestGap <= 100 ? 'pass' : longestGap <= 150 ? 'warn' : 'fail', flag: 'team_assumption', source: { label: 'Team preset in research P06-M04; no Vancouver block-length rule found' },
    note: 'The block is 144.8 m long; one north–south link near the middle gives about 72 m.',
  }))
  const s = input.station
  rules.push(rule({
    id: 'pr-station', label: 'Below-grade station entrance: lift and stair', value: `${s.lifts} lift${s.lifts === 1 ? '' : 's'}, ${s.stairs} stair${s.stairs === 1 ? '' : 's'}`,
    threshold: 'at least one elevator and one staircase', state: s.lifts >= 1 && s.stairs >= 1 ? 'pass' : 'fail', flag: 'verified', source: cddg('G4.4.2b'),
    note: `Brief p.19 requires the below-grade secondary transit entrance. ${s.lifts < 2 ? 'One lift: an outage breaks step-free access; two is the team preset.' : 'Two or more lifts keep it step-free during an outage (team preset).'}`,
  }))
  rules.push(rule({
    id: 'pr-station-active', label: 'Below-grade link: active uses and sightlines', value: s.activeEdges ? 'Active uses and a visual connection to the concourse' : 'Blank link',
    threshold: 'active uses next to the entrance and a strong visual connection to the concourse', state: s.activeEdges ? 'pass' : 'fail', flag: 'verified', source: cddg('G4.4.2c–e'),
    note: 'G4.4.2a also pulls in the station plaza fit-out checklist G4.4.1 a–h (paving, seating, shade, weather protection, integrated equipment): a manual evidence list.',
  }))
  rules.push(sunLine(cross.solar))
  rules.push(windLine(cross.wind))
  return { rules, open: os, link, longestGap }
}

// ---------- Real Vancouver: open space over the study site (node audit, 7 Nov) ----------
/** Large-site trigger the competition's 20% share rests on (2013 policy; current policy unread, research P06). */
const LARGE_SITE = 8000

/** The study site in its own frame: centred, turned so its longest side runs along x (axis-aligned rectangles fit it). */
export function siteFrame(ring: Pt[]): { toLocal: (p: Pt) => Pt; angle: number; centre: Pt } {
  let best = 0, angle = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; angle = Math.atan2(b[1] - a[1], b[0] - a[0]) }
  })
  const centre: Pt = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
  const c = Math.cos(-angle), sn = Math.sin(-angle)
  return { angle, centre, toLocal: ([x, y]) => { const dx = x - centre[0], dy = y - centre[1]; return [dx * c - dy * sn, dx * sn + dy * c] } }
}

/** Open ground inside a study site (any polygon): area, built footprint and the largest clear rectangle in the site's frame. */
export function cityOpenSpace(towers: Tower[], ring: Pt[], openPublicShare: number): OpenSpace & { siteArea: number } {
  const f = siteFrame(ring)
  const R = ring.map(f.toLocal)
  const ms = masses(towers).map((m) => m.poly.map(f.toLocal))
  const xs = R.map((p) => p[0]), ys = R.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL))
  const cx = (x1 - x0) / nx, cy = (y1 - y0) / ny
  const free = new Uint8Array(nx * ny)
  let siteCells = 0, open = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p: Pt = [x0 + (i + 0.5) * cx, y0 + (j + 0.5) * cy]
    if (!inside(p, R)) continue
    siteCells++
    if (!ms.some((m) => inside(p, m))) { free[j * nx + i] = 1; open++ }
  }
  let largest: OpenSpace['largest'] = null
  const hgt = new Int32Array(nx)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) hgt[i] = free[j * nx + i] ? hgt[i] + 1 : 0
    const st: number[] = []
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? hgt[i] : 0
      while (st.length && hgt[st[st.length - 1]] >= h) {
        const top = st.pop()!, height = hgt[top], left = st.length ? st[st.length - 1] + 1 : 0
        const area = height * (i - left) * cx * cy
        if (height > 0 && (!largest || area > largest.area)) largest = { area, x0: x0 + left * cx, x1: x0 + i * cx, y0: y0 + (j - height + 1) * cy, y1: y0 + (j + 1) * cy }
      }
      st.push(i)
    }
  }
  const cell = cx * cy, area = open * cell, siteArea = siteCells * cell
  return { open: area, publicArea: area * Math.max(0, Math.min(1, openPublicShare)), largest, transitPlaza: false, built: siteArea - area, siteArea }
}

/**
 * Open space & links on Real Vancouver: the open-space share and the POPS candidate over the study site, sun and wind
 * from their nodes; the link, block perimeter, transit plaza and station lines need the site's streets and its station
 * entrance, which the Toolkit does not know for a Real Vancouver site yet (one open line).
 */
export function cityGroundPlaneCheck(towers: Tower[], ring: Pt[] | null, input: PublicRealmInput, cross: GroundCross = {}): { rules: RuleResult[]; open: OpenSpace | null; link: null; longestGap: number } {
  if (!towers.length) return { rules: [], open: null, link: null, longestGap: 0 }
  const rules: RuleResult[] = []
  if (!ring || ring.length < 3) {
    rules.push(rule({ id: 'pr-open-share', label: 'Public open space on the site', value: 'needs a site area', threshold: '≥ 20% of site area on a large site', state: 'unknown', flag: 'unresolved', source: cddg('S1.9.1 and glossary') }))
  } else {
    const os = cityOpenSpace(towers, ring, input.openPublicShare)
    const A = os.siteArea, share = os.publicArea / A, large = A >= LARGE_SITE
    rules.push(rule({
      id: 'pr-open-share', label: 'Public open space on the site', value: `${Math.round(share * 100)}% (${fmt(os.publicArea)} m² of ${fmt(A)} m²)`,
      threshold: large ? '≥ 20% of site area' : '≥ 20% on a large site (8,000 m² or more)', state: !large ? 'unknown' : share >= 0.2 ? 'pass' : share >= 0.1 ? 'warn' : 'fail',
      flag: large ? 'team_assumption' : 'unresolved', source: cddg('S1.9.1 and glossary'),
      note: `Counts the unbuilt site at ${Math.round(input.openPublicShare * 100)}% public (team, the competition's setting). ${large ? `S1.9.1 covers large or unique sites; that this ${fmt(A)} m² site is "large" rests on the 2013 large-site trigger (8,000 m²), current policy unread.` : 'Under the 2013 large-site trigger (8,000 m²): which open-space share applies is unresolved, so it is reported, not judged.'}`,
    }))
    const pops = os.largest ? Math.min(os.largest.area, os.publicArea) : 0
    rules.push(rule({
      id: 'pr-pops', label: 'Privately owned public space (POPS)', value: `${fmt(pops)} m² in the largest clear rectangle of open ground (${Math.round((pops / A) * 100)}%)`,
      threshold: `about 10% of site area (about ${fmt(0.1 * A)} m²)`, state: pops >= 0.1 * A ? 'pass' : pops >= 0.05 * A ? 'warn' : 'fail', flag: 'verified', source: cddg('S1.10.2 and glossary'),
      note: 'Mixed-use and non-residential tower sites with frontage over 60.7 m. Counted inside the 20% total (whether it is extra is unresolved). Rectangles run along the site’s longest side.',
    }))
    if (os.largest) {
      const w = os.largest.x1 - os.largest.x0, h = os.largest.y1 - os.largest.y0
      const aspect = Math.max(w, h) / Math.max(0.1, Math.min(w, h))
      const ok = os.largest.area >= 300 && aspect <= 2
      rules.push(rule({
        id: 'pr-pops-shape', label: 'POPS shape', value: `${f1(w)} × ${f1(h)} m (1:${aspect.toFixed(1)}), ${fmt(os.largest.area)} m²`,
        threshold: 'contiguous, about 300 m² or more, proportion 1:1 to 1:2, free of overhead mass', state: ok ? 'pass' : os.largest.area >= 300 ? 'warn' : 'fail', flag: 'verified', source: cddg('S1.11.1 and glossary (POPS)'),
        note: `${aspect > 2 ? 'Long and narrow: it reads as a setback, not a place. ' : ''}A statutory right-of-way, public access points and no podium or roof space without public stairs and lifts are also required.`,
      }))
    }
  }
  rules.push(rule({
    id: 'pr-streets-ground', label: 'Mid-block link, block perimeter, transit plaza and station entrance', value: 'need the study site’s streets and its nearest station entrance',
    threshold: 'S1.12 links; S4.4 transit plazas; G4.4.2 station entrances', state: 'unknown', flag: 'unresolved', source: cddg('S1.12, S4.4, G4.4.2'),
    note: 'These run on the competition site, whose streets and station are known. A Real Vancouver site’s streets are not typed in the Toolkit yet.',
  }))
  rules.push(sunLine(cross.solar))
  rules.push(windLine(cross.wind))
  return { rules, open: null, link: null, longestGap: 0 }
}

/** Uses that count as active at grade when nothing else is entered (for display only). */
export const ACTIVE_USES: UseId[] = ['retail', 'civic', 'amenity', 'hotel']
void BRIEF
