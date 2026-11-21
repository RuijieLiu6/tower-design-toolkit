// Skyline silhouette (vtc-entry R10 juries, 21 Nov: "the rule does not reach the skyline"; capability (a), a silhouette
// reader). The toolkit read form in plan, skin and street, never at city scale, so a step that reads on the plan but
// moves the outline by a few metres looked as strong as one that changes the tower's shape from across the city.
//
// Method (team): the tower part above the podium (from the city the podium sits among its neighbours) is cut into
// height slices at every mass boundary (towerMasses: blocks, drawn masses, or runs of imported storey outlines). Each
// slice is projected on the axis across the line of sight from 8 compass views (true bearings, the project's north
// applied); a view and its opposite see the same outline, mirrored, so four axes are computed and reported as pairs.
// Up the tower, wherever the outline's left or right edge moves, that is a step; steps that keep moving the edges the
// same way with straight runs of at most MERGE_GAP_M between them read as one change (a taper, or a slope of small
// steps). A change's size is how far its two edges move in all (|left| + |right|): the change of width when the
// outline narrows or widens (the juror's arithmetic, 76.4 → 70.0 m), and twice the slide when a block slides sideways
// without changing width. Its angular size at a viewing distance d is atan(size / d).
//
// Legibility (sourced, then a team derivation): Shang & Bishop (2000) measured the visual size (horizontal × vertical
// angle) at which people recognise an object in a landscape without being told it is there: about 100 min² at 13%
// contrast (50 at 30%, 250 at 7%), with visual acuity (1′, at full contrast) as the floor, as read in Garnero &
// Fabrizio (2015), who use 100 min² for their skyline case studies. A step is a long, thin feature whose width limits
// recognition, so the team reads that area as a square: 10′ a side. No urban-design source with a practical arcminute
// threshold for skyline features was found (search of 21 Nov 2026), so this stays a labelled team assumption.
import { towerMasses } from './massing'
import type { RuleResult, RuleState, Source, Tower } from './types'

type P = [number, number]

/** The 8 views, by true bearing of the viewer from the tower. */
export const VIEWS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
/** Default viewing distance (m): across downtown, as in the juries' arithmetic. */
export const DEFAULT_VIEW_M = 2000
/** Distances every reading also reports (m). */
export const COMPARE_VIEW_M = [500, 2000, 5000] as const
/** Smallest change that reads on the skyline (arcminutes): Shang & Bishop's 100 min² read as a square (team). */
export const LEGIBLE_ARCMIN = 10
/** Visual acuity, the physiological floor (arcminutes). */
export const ACUITY_ARCMIN = 1
/** Views (of 8) that must see a legible change for a pass. */
export const LEGIBLE_VIEWS = 5
/** Steps moving the outline the same way with a straight run of at most this between them read as one change (m, team). */
export const MERGE_GAP_M = 10
/** Edge movements under this are slicing noise (m). */
const MIN_STEP_M = 0.05
/** A turn of the widest outline under this reads as an aspect change, not a twist (degrees, team). */
export const TWIST_DEG = 15

export interface SilhouetteOptions {
  /** Viewing distance (m); default 2 km. */
  distance?: number
  /** True north, degrees clockwise from the model's +Y (the competition model: 45). */
  northDeg?: number
}

/** One height slice of the tower part: the plan rings standing there (project frame). */
export interface Slice { z0: number; z1: number; rings: P[][] }
/** One silhouette change, bottom-up: its height span, how far the two edges move, and the change of width. */
export interface Change { z0: number; z1: number; size: number; dw: number; arcmin: number }
export interface AxisReading {
  /** The two opposite views that share this outline, e.g. "N/S". */
  pair: string
  views: [string, string]
  /** Bearing of the first view (degrees from true north). */
  bearing: number
  /** Outline edges per slice on the axis across the line of sight (m). */
  edges: { z0: number; z1: number; l: number; r: number }[]
  changes: Change[]
  largest: Change | null
  /** Changes at or above the legibility threshold from the reading's distance. */
  legible: number
  /** Width of the top slice over the width of the bottom one. */
  topBase: number
}
export interface SilhouetteReading {
  tower: Tower
  distance: number
  /** The tower part read: bottom and top (m above grade). */
  base: number
  top: number
  axes: AxisReading[]
  /** Views (of 8) with a legible change. */
  legibleViews: number
  largest: (Change & { pair: string }) | null
  /** Turn of the widest outline from the bottom slice to the top (degrees, signed: positive clockwise seen from above). */
  turn: { deg: number; z0: number; z1: number } | null
  topBase: { mean: number; min: number; max: number }
  state: RuleState
  rules: RuleResult[]
}

/** Angular size (arcminutes) of a feature `m` metres across seen from `d` metres. */
export const arcmin = (m: number, d: number) => (Math.atan(Math.abs(m) / Math.max(1, d)) * 180 * 60) / Math.PI
/** Size (m) that subtends `a` arcminutes from `d` metres. */
export const metresAt = (a: number, d: number) => d * Math.tan((a * Math.PI) / (180 * 60))

/** The tower part's height slices (podium blocks left out, unless the tower is all podium). */
export function silhouetteSlices(t: Tower): Slice[] {
  const all = towerMasses(t).filter((m) => m.z1 - m.z0 > 1e-6 && m.ring.length >= 3)
  const shaft = all.some((m) => !m.podium) ? all.filter((m) => !m.podium) : all
  const zs = [...new Set(shaft.flatMap((m) => [m.z0, m.z1]).map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b)
  const out: Slice[] = []
  for (let i = 0; i + 1 < zs.length; i++) {
    const z0 = zs[i], z1 = zs[i + 1]
    if (z1 - z0 < 0.01) continue
    const mid = (z0 + z1) / 2
    const rings = shaft.filter((m) => m.z0 <= mid && mid < m.z1).map((m) => m.ring as P[])
    if (rings.length) out.push({ z0, z1, rings })
  }
  return out
}

/** Unit axis across the line of sight for a viewer at true `bearing` from the tower (model frame: +Y is model north). */
function across(bearing: number, northDeg: number): P {
  const m = ((bearing + northDeg) * Math.PI) / 180
  return [Math.cos(m), -Math.sin(m)]
}
function extent(rings: P[][], u: P): { l: number; r: number } {
  let l = Infinity, r = -Infinity
  for (const ring of rings) for (const [x, y] of ring) { const s = x * u[0] + y * u[1]; if (s < l) l = s; if (s > r) r = s }
  return { l, r }
}

const sgn = (v: number) => (Math.abs(v) < MIN_STEP_M ? 0 : Math.sign(v))

/** The changes up one axis: edge steps, merged while they keep moving the same way across short straight runs. */
export function axisChanges(edges: AxisReading['edges'], distance: number): Change[] {
  const out: (Change & { dl: number; dr: number })[] = []
  for (let i = 1; i < edges.length; i++) {
    const dl = edges[i].l - edges[i - 1].l, dr = edges[i].r - edges[i - 1].r
    if (Math.abs(dl) < MIN_STEP_M && Math.abs(dr) < MIN_STEP_M) continue
    const z = edges[i].z0, last = out[out.length - 1]
    const same = last && z - last.z1 <= MERGE_GAP_M + 1e-6 && sgn(dl) * sgn(last.dl) >= 0 && sgn(dr) * sgn(last.dr) >= 0
    if (same) { last.dl += dl; last.dr += dr; last.z1 = z; continue }
    out.push({ z0: z, z1: z, dl, dr, size: 0, dw: 0, arcmin: 0 })
  }
  return out.map(({ dl, dr, z0, z1 }) => { const size = Math.abs(dl) + Math.abs(dr); return { z0, z1, size, dw: dr - dl, arcmin: arcmin(size, distance) } })
}

/** Directions (degrees, mod 180) of a slice's diameter: the axis along which its outline is widest, ties kept. */
function widestAxes(rings: P[][]): number[] | null {
  const pts = rings.flat()
  let best = 0
  const pairs: { len: number; ang: number }[] = []
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    pairs.push({ len, ang: ((((Math.atan2(dx, dy) * 180) / Math.PI) % 180) + 180) % 180 })
    best = Math.max(best, len)
  }
  if (best <= 0) return null
  // Near-ties (a square's two diagonals) are kept as candidates; a round plan has no widest direction.
  const near = pairs.filter((p) => p.len >= best * 0.99).sort((a, b) => a.ang - b.ang)
  const groups: { len: number; ang: number }[][] = []
  for (const p of near) {
    const g = groups.find((x) => x.some((q) => Math.abs(angDiff(q.ang, p.ang)) <= 3))
    if (g) g.push(p); else groups.push([p])
  }
  if (groups.length > 4) return null
  return groups.map((g) => g.reduce((m, p) => (p.len > m.len ? p : m)).ang)
}
/** Smallest signed difference b − a between two axis directions (mod 180), in (−90, 90]. */
function angDiff(a: number, b: number): number {
  let d = (((b - a) % 180) + 180) % 180
  if (d > 90) d -= 180
  return Math.abs(d) < 1e-9 ? 0 : d
}
/** The widest direction followed up the tower, nearest candidate to the one below: the net turn and where it happens. */
export function widestTurn(slices: Slice[]): SilhouetteReading['turn'] {
  let prev: number | null = null, total = 0, z0 = NaN, z1 = NaN
  for (const s of slices) {
    const c = widestAxes(s.rings)
    if (!c?.length) continue
    if (prev === null) { prev = c[0]; continue }
    const p: number = prev
    const next = c.reduce((m, a) => (Math.abs(angDiff(p, a)) < Math.abs(angDiff(p, m)) ? a : m), c[0])
    const d = angDiff(p, next)
    if (Math.abs(d) > 0.05) { total += d; if (Number.isNaN(z0)) z0 = s.z0; z1 = s.z0 }
    prev = next
  }
  if (prev === null) return null
  // Directions are bearings (clockwise from +Y), so the turn reads clockwise-positive seen from above; a block rotated
  // counter-clockwise (a positive Block.rotation) turns it anticlockwise.
  return { deg: total, z0: Number.isNaN(z0) ? 0 : z0, z1: Number.isNaN(z1) ? 0 : z1 }
}

const one = (v: number) => v.toFixed(1)
const arc = (a: number) => `${a < 9.95 ? a.toFixed(1) : Math.round(a)}′`
const km = (d: number) => (d >= 1000 ? `${Math.abs(d / 1000 - Math.round(d / 1000)) < 0.05 ? Math.round(d / 1000) : (d / 1000).toFixed(1)} km` : `${Math.round(d)} m`)
const at = (c: Pick<Change, 'z0' | 'z1'>) => (c.z1 - c.z0 < 0.5 ? `+${Math.round(c.z0)} m` : `+${Math.round(c.z0)}–${Math.round(c.z1)} m`)
const how = (c: Change) => (Math.abs(c.dw) >= 0.5 * c.size ? (c.dw < 0 ? 'narrows' : 'widens') : 'slides')

export const SILHOUETTE_SOURCE: Source = {
  label: 'Shang & Bishop 2000, Visual thresholds for detection, recognition and visual impact in landscape settings (J. Environ. Psychol. 20:125–140), as read in Garnero & Fabrizio 2015, Visibility analysis in urban spaces (Environ. Plan. B 42, doi:10.1068/b130119p)',
  page: 'Garnero & Fabrizio preprint pp. 4, 6',
  url: 'http://hdl.handle.net/2318/1505034',
}
const METHOD: Source = { label: 'Tower Design Toolkit: outline read from the storey masses in 8 compass views (team method, engine/silhouette.ts)' }
export const LEGIBLE_NOTE = `Team derivation: Shang & Bishop's uninformed-recognition threshold is a visual size (horizontal × vertical angle) of about 100 min² at 13% contrast (50 at 30%, 250 at 7%), as read in Garnero & Fabrizio; a step is a long, thin feature whose width limits recognition, so the area is read as a square, ${LEGIBLE_ARCMIN}′ a side (about 7′ at 30% contrast, 16′ at 7%). Visual acuity (${ACUITY_ARCMIN}′) is the physiological floor. No urban-design source with a practical skyline threshold was found, so this is a team assumption. Contrast against the sky, haze and the towers in front are not modelled. A design reading, never a fail.`

/** The tower's skyline silhouette from 8 views at a viewing distance (default 2 km). */
export function silhouetteReading(t: Tower, o: SilhouetteOptions = {}): SilhouetteReading {
  const distance = o.distance && o.distance > 0 ? o.distance : DEFAULT_VIEW_M
  const north = o.northDeg ?? 0
  const slices = silhouetteSlices(t)
  const base = slices[0]?.z0 ?? 0, top = slices[slices.length - 1]?.z1 ?? 0
  const axes: AxisReading[] = [0, 1, 2, 3].map((k) => {
    const bearing = k * 45, u = across(bearing, north)
    const edges = slices.map((s) => ({ z0: s.z0, z1: s.z1, ...extent(s.rings, u) }))
    const changes = axisChanges(edges, distance)
    const largest = changes.reduce<Change | null>((m, c) => (!m || c.size > m.size ? c : m), null)
    const w0 = edges.length ? edges[0].r - edges[0].l : 0, w1 = edges.length ? edges[edges.length - 1].r - edges[edges.length - 1].l : 0
    return { pair: `${VIEWS[k]}/${VIEWS[k + 4]}`, views: [VIEWS[k], VIEWS[k + 4]], bearing, edges, changes, largest, legible: changes.filter((c) => c.arcmin >= LEGIBLE_ARCMIN - 1e-9).length, topBase: w0 > 0 ? w1 / w0 : 1 }
  })
  const legibleViews = 2 * axes.filter((a) => a.legible > 0).length
  const largest = axes.reduce<SilhouetteReading['largest']>((m, a) => (a.largest && (!m || a.largest.size > m.size + 1e-9) ? { ...a.largest, pair: a.pair } : m), null)
  const turn = widestTurn(slices)
  const ratios = axes.map((a) => a.topBase)
  const topBase = { mean: ratios.reduce((s, v) => s + v, 0) / ratios.length, min: Math.min(...ratios), max: Math.max(...ratios) }
  const state: RuleState = legibleViews >= LEGIBLE_VIEWS ? 'pass' : 'warn'
  const reading: Omit<SilhouetteReading, 'rules'> = { tower: t, distance, base, top, axes, legibleViews, largest, turn, topBase, state }
  return { ...reading, rules: silhouetteRules(reading) }
}

/** The reading as result lines (one judged line, the rest reported). */
export function silhouetteRules(r: Omit<SilhouetteReading, 'rules'>): RuleResult[] {
  const { distance: d, largest, axes } = r
  const tMetres = metresAt(LEGIBLE_ARCMIN, d)
  const threshold = `a change of ≥ ${LEGIBLE_ARCMIN}′ (${one(tMetres)} m from ${km(d)}) in at least ${LEGIBLE_VIEWS} of 8 views`
  if (!axes[0]?.edges.length) {
    return [{ id: 'sil-legible', label: 'Skyline silhouette: a legible change', value: 'no tower storeys to read', threshold, state: 'unknown', flag: 'unresolved', source: SILHOUETTE_SOURCE, note: LEGIBLE_NOTE }]
  }
  const reported = 'reported, not judged'
  const span = `+${Math.round(r.base)} to +${Math.round(r.top)} m`
  const legible: RuleResult = {
    id: 'sil-legible', label: 'Skyline silhouette: a legible change',
    value: !largest
      ? `0 of 8 views: the outline is straight from ${span}`
      : `${r.legibleViews} of 8 views; largest: ${how(largest)} ${one(largest.size)} m at ${at(largest)} seen from ${largest.pair}, ${arc(largest.arcmin)} from ${km(d)}${largest.arcmin < LEGIBLE_ARCMIN ? ` (under ${LEGIBLE_ARCMIN}′)` : ''}`,
    threshold, state: r.state, flag: 'team_assumption', source: SILHOUETTE_SOURCE, note: LEGIBLE_NOTE,
  }
  const byAxis: RuleResult = {
    id: 'sil-views', label: 'Largest silhouette change by view',
    value: axes.map((a) => (a.largest ? `${a.pair} ${one(a.largest.size)} m at ${at(a.largest)} (${arc(a.largest.arcmin)})` : `${a.pair} none`)).join(' · '),
    threshold: `${reported}; angles from ${km(d)}`, state: 'unknown', flag: 'team_assumption', source: METHOD,
    note: 'A view and its opposite see the same outline, mirrored. Size: how far the outline\'s two edges move (the change of width when it narrows or widens; twice the slide when a block slides sideways). The podium is left out: from the city it sits among its neighbours.',
  }
  const distances: RuleResult = {
    id: 'sil-distance', label: `Largest silhouette change from ${COMPARE_VIEW_M.map(km).join(' · ')}`,
    value: largest
      ? `${COMPARE_VIEW_M.map((x) => arc(arcmin(largest.size, x))).join(' · ')}${(COMPARE_VIEW_M as readonly number[]).includes(d) ? '' : ` (${arc(largest.arcmin)} from ${km(d)})`}; legible ${legibleFrom(largest.size)}`
      : 'no change from any distance',
    threshold: `≥ ${LEGIBLE_ARCMIN}′ reads (acuity floor ${ACUITY_ARCMIN}′)`, state: 'unknown', flag: 'team_assumption', source: SILHOUETTE_SOURCE,
  }
  const counts: RuleResult = {
    id: 'sil-count', label: 'Distinct legible silhouette changes',
    value: axes.map((a) => `${a.pair} ${a.legible} of ${a.changes.length}`).join(' · '),
    threshold: `${reported}; legible = ≥ ${LEGIBLE_ARCMIN}′ from ${km(d)} (${one(tMetres)} m); steps that move the outline the same way with ≤ ${MERGE_GAP_M} m between them count as one`,
    state: 'unknown', flag: 'team_assumption', source: METHOD,
  }
  const taper: RuleResult = {
    id: 'sil-taper', label: 'Silhouette width, top to base',
    value: `${r.topBase.mean.toFixed(2)}${r.topBase.max - r.topBase.min >= 0.005 ? ` (${r.topBase.min.toFixed(2)}–${r.topBase.max.toFixed(2)} by view)` : ''}, ${span}`,
    threshold: `${reported}; 1.00 = as wide at the top as at the base`, state: 'unknown', flag: 'team_assumption', source: METHOD,
  }
  const tw = r.turn
  const turn: RuleResult = {
    id: 'sil-turn', label: 'Turn of the widest outline with height',
    value: !tw ? 'no widest direction (a round plan)' : Math.abs(tw.deg) < 0.5 ? '0°: the tower looks widest from the same views all the way up'
      : `${Math.round(Math.abs(tw.deg))}° ${tw.deg > 0 ? 'clockwise' : 'anticlockwise'} over +${Math.round(tw.z0)}–${Math.round(tw.z1)} m${Math.abs(tw.deg) < TWIST_DEG ? ' (an aspect change, not a twist)' : ''}`,
    threshold: `${reported}; a twist turns it by tens of degrees, a change of plan proportions by a few (under ${TWIST_DEG}°)`, state: 'unknown', flag: 'team_assumption', source: METHOD,
  }
  return [legible, byAxis, distances, counts, taper, turn]
}

/** The distances (of 500 m, 2 km, 5 km) from which a change of `size` metres is legible, in words. */
function legibleFrom(size: number): string {
  const reach = size / Math.tan((LEGIBLE_ARCMIN * Math.PI) / (180 * 60)) // where it subtends exactly the threshold
  const ok = COMPARE_VIEW_M.filter((x) => arcmin(size, x) >= LEGIBLE_ARCMIN - 1e-9)
  return ok.length ? `up to about ${km(reach)} (from ${ok.map(km).join(', ')})` : `only within about ${km(reach)}`
}
