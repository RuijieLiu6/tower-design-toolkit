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
//
// Sky through the tower (gap G23, vtc-entry R3-6 jury on A21a): the outline reading sees where the edges move, not
// whether sky shows through an opening, so a garden gap of three open storeys round a 24 m core read as nothing until
// it wrapped a corner. Method (team): an open band is a run of storeys whose plates are each at most OPEN_PLATE_SHARE of
// the storeys just below and just above the run (an open garden storey, a gap round the core, a recessed band). In each
// of the 8 views, horizontal lines of sight cross every storey of the band at its mid-height, over the width where the
// tower stands both below and above the band (the two storeys framing it). A line passes when it meets no plate of its
// storey and not the core (engine/storeyWeight.ts, the core placed or read from the model, core steps applied). Plates
// are prisms storey by storey, so every line is tested exactly by projecting the plates and the core onto the axis
// across the view: a line misses a plate when it passes outside the plate's extent. Glass blocks: a glazed enclosure the
// storey outline marks (ImportedStorey.glazed) is opaque and reported apart; unmarked, every plate is opaque. A line that
// passes is sky unless a context prism given to the reading stands behind the tower on it (the design's other towers in
// the app and the evidence; city buildings only when given). Passing lines that touch form one opening; its angular
// area from the viewing distance is read against Shang & Bishop's 100 min² (the outline reading's source, here as the
// area it is; team step).
//
// Sky through screens and glass (gap G33, A25c/A25d): screens counted as clear and glass as blocked, so a screened or
// glazed opening got no credit for what it lets through. Optional transmittances (0–1, the share of the sky seen through
// along a line of sight): one for the marked glass (per glazed part, ImportedStorey.glazedT, else the reading's glassT),
// and screens across each open storey from its floor up to a height (in the app the wind settings' deck screen, its open
// share as the transmittance; team step, one screen per line of sight: a line through screens on both sides of the deck
// sees about t², which the user can enter instead). The sky seen through them is reported apart from the clear sky, as a
// share of the opening behind them. The judgement stays on clear sky unless the user sets a transmittance for the sky
// reading (glass, or screens marked as set); it then counts each opening's sky at its transmittance.
import { floorRing, readsStoreys, towerFloors, towerMasses } from './massing'
import { storeyCore } from './storeyWeight'
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

/** Plates at most this share of the storeys just below and above a run of storeys make the run an open band (team; A21a's garden storeys are 0.75 of the shaft, its gap wrapped round a corner 0.68). */
export const OPEN_PLATE_SHARE = 0.8
/** Smallest opening of sky that reads (arcmin²): Shang & Bishop's recognition threshold, read as the area it is (team step). */
export const SKY_ARCMIN2 = LEGIBLE_ARCMIN * LEGIBLE_ARCMIN
/** Views (of 8) that must see a legible opening of sky for a pass. */
export const SKY_VIEWS = 2

/** A neighbouring mass the sky-through reading checks behind the tower (project frame, m above grade). */
export interface ContextPrism { ring: [number, number][]; z0: number; z1: number; name?: string }
/** The masses to check behind the tower and, in words, what they are (e.g. "the design's other towers"). */
export interface SkyContext { prisms: ContextPrism[]; what: string }
/** Screens across the open storeys (gap G33): from each open storey's floor up `h` m, letting `t` (0–1) of the sky through along a line of sight. */
export interface SkyScreens {
  h: number
  t: number
  /** The user set `t` for the sky reading: the judgement then counts the sky seen through the screens. */
  set?: boolean
  /** Where the screens came from, in words (e.g. "the wind settings' deck screen"). */
  from?: string
}

export interface SilhouetteOptions {
  /** Viewing distance (m); default 2 km. */
  distance?: number
  /** True north, degrees clockwise from the model's +Y (the competition model: 45). */
  northDeg?: number
  /** Masses to check behind the tower for the sky-through reading; absent: "not checked". */
  context?: SkyContext | null
  /**
   * Transmittance (0–1) of the marked glass for the sky reading, for every glazed part without its own
   * (ImportedStorey.glazedT); absent: glass blocks. A transmittance set here counts in the judgement (gap G33).
   */
  glassT?: number | null
  /** Screens across the open storeys (gap G33); absent: not modelled (their sky reads as clear). */
  screens?: SkyScreens | null
}

/** A run of open storeys, framed by the storeys just below and above it. */
export interface SkyBand { z0: number; z1: number; levels: [number, number]; /** Largest plate of the run over the smaller framing plate. */ share: number }
/** One opening of sky: lines of sight that pass and touch, within one band. */
export interface SkyOpening { z0: number; z1: number; /** Lateral extent across the view (m). */ width: number; /** Sky (m²) and its angular area from the reading's distance (arcmin²). */ area: number; arcmin2: number }
export interface SkyView {
  view: string
  bearing: number
  /** Face of the open bands the lines of sight cross (m², framed above and below) and the share of it that passes. */
  cast: number
  share: number
  /** Sky through the tower (m²) and its angular area (arcmin²). */
  area: number
  arcmin2: number
  /** Of it, the part with a context prism behind (m²) and their names; null when nothing was given to check. */
  behind: { area: number; names: string[] } | null
  /** Seen only through marked glass, counted as blocked (m²). */
  glass: number
  /**
   * Sky behind screens or transmitting glass, clear of what stands behind (gap G33): per kind, the opening behind them
   * (m²) and the sky seen through it (m², the opening at its transmittance); null when neither is given.
   */
  seen: { screen: { area: number; sky: number }; glass: { area: number; sky: number } } | null
  /** Openings of sky clear of what stands behind, largest first. */
  openings: SkyOpening[]
  legible: boolean
}
export interface SkyThrough {
  /** False for a drawn mass or a model without storey outlines: its storeys are not known. */
  read: boolean
  bands: SkyBand[]
  views: SkyView[]
  legibleViews: number
  /** What was checked behind the tower; null: not checked. */
  context: string | null
  /** The screens read (gap G33), or null. */
  screens: SkyScreens | null
  /** Some marked glass has a transmittance (gap G33). */
  glassLit: boolean
  /** The judgement counts the sky seen through screens and glass at its transmittance (a transmittance set by the user). */
  counted: boolean
  state: RuleState
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
  /** Sky seen through the tower's open storeys from the 8 views (gap G23). */
  sky: SkyThrough
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

// --- Sky through the tower (gap G23) ----------------------------------------------------------------------------------

/** One storey for the sky-through reading: its plate rings and marked glass (project frame). */
interface SkyStorey { level: number; z0: number; z1: number; area: number; podium: boolean; rings: P[][]; glazed: P[][]; glazedT: (number | null)[] }
type Iv = [number, number]

/** Angular area (arcmin²) of `m2` square metres seen face-on from `d` metres (small angles). */
export const arcmin2 = (m2: number, d: number) => m2 * (10800 / (Math.PI * Math.max(1, d))) ** 2

/** Tower frame → project frame. */
function place(t: Tower, r: P[]): P[] {
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return r.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c])
}

/** The storeys read: an imported tower's storey outlines, or a parametric tower's floors; null for a drawn mass or an import without outlines. */
function skyStoreys(t: Tower): SkyStorey[] | null {
  if (t.drawn) return null
  if (t.imported) {
    if (!readsStoreys(t)) return null
    const ok = (r: P[]) => r.length >= 3
    return [...t.imported.storeys].sort((a, b) => a.z0 - b.z0).map((s) => ({
      level: s.level, z0: s.z0, z1: s.z1, area: s.area, podium: s.podium,
      rings: ((s.loops ?? []) as P[][]).filter(ok).map((r) => place(t, r)),
      glazed: ((s.glazed ?? []) as P[][]).filter(ok).map((r) => place(t, r)),
      glazedT: ((s.glazed ?? []) as P[][]).flatMap((r, j) => (ok(r) ? [s.glazedT?.[j] ?? null] : [])),
    }))
  }
  return towerFloors(t).map((f) => ({ level: f.level, z0: f.z0, z1: f.z1, area: f.area, podium: f.podium, rings: [floorRing(t, f)], glazed: [], glazedT: [] }))
}

/** Runs [a, b] of storeys whose plates are each at most OPEN_PLATE_SHARE of the storeys just below (a − 1) and above (b + 1); none wholly inside the podium. */
export function openBands(st: Pick<SkyStorey, 'area' | 'podium'>[]): [number, number][] {
  const out: [number, number][] = []
  for (let a = 1; a < st.length - 1; a++) {
    if (!(st[a - 1].area > 0)) continue
    const lim = OPEN_PLATE_SHARE * st[a - 1].area
    if (!(st[a].area <= lim)) continue
    let b = a
    while (b + 1 < st.length && st[b + 1].area <= lim) b++
    const top = st[b + 1]
    if (!top || top.podium) continue
    if (Math.max(...st.slice(a, b + 1).map((s) => s.area)) <= OPEN_PLATE_SHARE * top.area) { out.push([a, b]); a = b }
  }
  return out
}

const dot = (p: P, u: P) => p[0] * u[0] + p[1] * u[1]
/** Sorted, merged intervals. */
function merge(iv: Iv[]): Iv[] {
  const s = iv.filter(([l, r]) => r > l).sort((a, b) => a[0] - b[0]), out: Iv[] = []
  for (const [l, r] of s) { const last = out[out.length - 1]; if (last && l <= last[1] + 1e-9) last[1] = Math.max(last[1], r); else out.push([l, r]) }
  return out
}
/** Each ring's extent across the view (a line misses a plate when it passes outside its extent), merged. */
const extents = (rings: P[][], u: P): Iv[] => merge(rings.map((r) => { let l = Infinity, h = -Infinity; for (const p of r) { const s = dot(p, u); if (s < l) l = s; if (s > h) h = s } return [l, h] as Iv }))
/** a ∩ b. */
function meet(a: Iv[], b: Iv[]): Iv[] {
  const out: Iv[] = []
  for (const [l, r] of a) for (const [m, n] of b) { const x = Math.max(l, m), y = Math.min(r, n); if (y - x > 1e-9) out.push([x, y]) }
  return merge(out)
}
/** a less b. */
function cut(a: Iv[], b: Iv[]): Iv[] {
  let cur = a
  for (const [m, n] of b) cur = cur.flatMap(([l, r]): Iv[] => (n <= l || m >= r ? [[l, r]] : [...(m > l ? [[l, m] as Iv] : []), ...(n < r ? [[n, r] as Iv] : [])]))
  return cur.filter(([l, r]) => r - l > 1e-9)
}
const span = (a: Iv[]) => a.reduce((s, [l, r]) => s + r - l, 0)

/** Inside a ring or within 5 cm of its edges. */
function insideOrOn(p: P, r: P[]): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
    const ex = xi - xj, ey = yi - yj, k = Math.max(0, Math.min(1, ((p[0] - xj) * ex + (p[1] - yj) * ey) / (ex * ex + ey * ey || 1)))
    if (Math.hypot(p[0] - xj - ex * k, p[1] - yj - ey * k) <= 0.05) return true
  }
  return c
}

/** Extent across the view of the part of a context prism's outline beyond the tower (p·v ≥ far), or null. */
function behindExtent(ring: P[], u: P, v: P, far: number): Iv | null {
  const s: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], da = dot(a, v) - far, db = dot(b, v) - far
    if (da >= 0) s.push(dot(a, u))
    if ((da < 0) !== (db < 0)) { const k = da / (da - db); s.push(dot([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], u)) }
  }
  return s.length ? [Math.min(...s), Math.max(...s)] : null
}

/** One row of passing lines: its height span and the lines that pass, each with the share of sky it lets through (1: clear). */
type SkyRow = { z0: number; z1: number; seg: { iv: Iv; w: number }[] }
/** Passing lines of one band's rows (bottom-up) grouped where they touch, within a row or from one row to the next; area at each line's share of sky. */
function openingsOf(rows: SkyRow[], d: number): SkyOpening[] {
  const nodes = rows.flatMap((r, row) => r.seg.filter((x) => x.w > 0 && x.iv[1] - x.iv[0] > 1e-9).map((x) => ({ row, iv: x.iv, w: x.w })))
  const up = nodes.map((_, i) => i)
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])))
  for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], o = Math.min(a.iv[1], b.iv[1]) - Math.max(a.iv[0], b.iv[0])
    if ((b.row === a.row + 1 && o > 1e-6) || (i !== j && b.row === a.row && o > -1e-9)) up[find(i)] = find(j)
  }
  const groups = new Map<number, typeof nodes>()
  nodes.forEach((n, i) => { const g = find(i); groups.set(g, [...(groups.get(g) ?? []), n]) })
  return [...groups.values()].map((g) => {
    const area = g.reduce((s, n) => s + (n.iv[1] - n.iv[0]) * (rows[n.row].z1 - rows[n.row].z0) * n.w, 0)
    return { z0: Math.min(...g.map((n) => rows[n.row].z0)), z1: Math.max(...g.map((n) => rows[n.row].z1)), width: Math.max(...g.map((n) => n.iv[1])) - Math.min(...g.map((n) => n.iv[0])), area, arcmin2: arcmin2(area, d) }
  })
}

/** What the sky-through reading checks behind one tower: the design's other towers, plus any context given; null (not checked) with neither. */
export function skyContext(towers: Tower[], t: Tower, extra?: SkyContext | null): SkyContext | null {
  const rest = towers.filter((o) => o.id !== t.id)
  const others: ContextPrism[] = rest.flatMap((o) => towerMasses(o).map((m) => ({ ring: m.ring, z0: m.z0, z1: m.z1, name: o.name })))
  if (!rest.length && !extra) return null
  const what = [rest.length ? "the design's other towers" : '', extra?.what ?? ''].filter(Boolean).join(' and ')
  return { prisms: [...others, ...(extra?.prisms ?? [])], what }
}

/** Sky seen through the tower's open storeys from the 8 views (gap G23). */
export function skyThrough(t: Tower, o: SilhouetteOptions = {}): SkyThrough {
  const d = o.distance && o.distance > 0 ? o.distance : DEFAULT_VIEW_M
  const north = o.northDeg ?? 0
  const ctx = o.context ?? null
  const st = skyStoreys(t)
  // screens and glass transmittances (gap G33), each 0–1
  const t01 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.min(1, Math.max(0, x)))
  const scr: SkyScreens | null = o.screens && o.screens.h > 0 && t01(o.screens.t) != null ? { ...o.screens, t: t01(o.screens.t)! } : null
  const glassT = t01(o.glassT)
  const glassLit = !!st && st.some((s) => s.glazed.some((_, j) => (t01(s.glazedT[j]) ?? glassT ?? 0) > 0))
  const counted = (!!scr?.set && scr.t > 0) || glassLit
  const seen0 = (): SkyView['seen'] => (scr || glassLit ? { screen: { area: 0, sky: 0 }, glass: { area: 0, sky: 0 } } : null)
  const empty = (k: number): SkyView => ({ view: VIEWS[k], bearing: k * 45, cast: 0, share: 0, area: 0, arcmin2: 0, behind: ctx ? { area: 0, names: [] } : null, glass: 0, seen: seen0(), openings: [], legible: false })
  const tail = { screens: scr, glassLit, counted }
  if (!st) return { read: false, bands: [], views: VIEWS.map((_, k) => empty(k)), legibleViews: 0, context: ctx?.what ?? null, ...tail, state: 'unknown' }
  const runs = openBands(st)
  const bands: SkyBand[] = runs.map(([a, b]) => ({ z0: st[a].z0, z1: st[b].z1, levels: [st[a].level, st[b].level], share: Math.max(...st.slice(a, b + 1).map((s) => s.area)) / Math.min(st[a - 1].area, st[b + 1].area) }))
  const coreAt = runs.length ? storeyCore(t) : null
  const views: SkyView[] = VIEWS.map((_, k) => {
    if (!coreAt) return empty(k)
    const m = ((k * 45 + north) * Math.PI) / 180
    // u across the line of sight (as the outline reading), v along it, from the viewer toward the tower.
    const u: P = [Math.cos(m), -Math.sin(m)], v: P = [-Math.sin(m), -Math.cos(m)]
    let cast = 0, area = 0, glass = 0, behindArea = 0
    const seen = seen0()
    const names = new Set<string>(), openings: SkyOpening[] = []
    for (const [a, b] of runs) {
      const framed = meet(extents(st[a - 1].rings, u), extents(st[b + 1].rings, u))
      const far = Math.max(...st.slice(a - 1, b + 2).flatMap((s) => s.rings.flat().map((p) => dot(p, v))))
      const rows: SkyRow[] = []
      for (let i = a; i <= b; i++) {
        const s = st[i], h = s.z1 - s.z0, mid = (s.z0 + s.z1) / 2
        const c = coreAt(s.level), r = c.side / 2
        const core = place(t, [[c.x - r, c.y - r], [c.x + r, c.y - r], [c.x + r, c.y + r], [c.x - r, c.y + r]])
        const inGlass = (ring: P[]) => s.glazed.some((g) => ring.every((p) => insideOrOn(p, g)))
        const opaque = extents([...s.rings.filter((ring) => !inGlass(ring)), core], u)
        const glazed = extents([...s.glazed, ...s.rings.filter(inGlass)], u)
        const through = cut(cut(framed, opaque), glazed)
        const behind = ctx ? merge(ctx.prisms.filter((p) => p.z0 <= mid && mid < p.z1 && p.ring.length >= 3).flatMap((p) => {
          const iv = behindExtent(p.ring, u, v, far)
          if (iv && meet(through, [iv]).length) names.add(p.name ?? 'a neighbour')
          return iv ? [iv] : []
        })) : []
        // screens across the lower hs of the storey (gap G33); the clear sky is the part above them
        const hs = scr ? Math.min(h, scr.h) : 0
        const glassOnly = cut(meet(framed, glazed), opaque)
        cast += span(framed) * h
        area += span(through) * (h - hs)
        glass += span(glassOnly) * h
        behindArea += span(meet(through, behind)) * (h - hs)
        const sky = cut(through, behind)
        // glass with a transmittance: each glazed part's lines, the lowest transmittance where parts overlap
        const lit: { iv: Iv[]; t: number }[] = []
        if (glassLit) {
          let taken: Iv[] = []
          const parts = s.glazed.map((g, j) => ({ iv: extents([g], u), t: t01(s.glazedT[j]) ?? glassT ?? 0 })).sort((x, y) => x.t - y.t)
          for (const p of parts) { const piece = cut(meet(glassOnly, p.iv), taken); taken = merge([...taken, ...piece]); if (p.t > 0) lit.push({ iv: cut(piece, behind), t: p.t }) }
        }
        const ts = scr?.t ?? 0
        if (seen) {
          seen.screen.area += span(sky) * hs; seen.screen.sky += span(sky) * hs * ts
          for (const g of lit) { seen.glass.area += span(g.iv) * h; seen.glass.sky += span(g.iv) * g.t * (h - hs + hs * ts) }
        }
        // rows for the openings: clear lines at 1; behind screens or glass only when the user set the transmittance
        const ms = scr?.set ? ts : 0
        const litSeg = (m: number) => lit.flatMap((g) => g.iv.map((iv) => ({ iv, w: g.t * m })))
        if (hs > 0) rows.push({ z0: s.z0, z1: s.z0 + hs, seg: [...sky.map((iv) => ({ iv, w: ms })), ...litSeg(ms)] })
        if (hs < h) rows.push({ z0: s.z0 + hs, z1: s.z1, seg: [...sky.map((iv) => ({ iv, w: 1 })), ...litSeg(1)] })
      }
      openings.push(...openingsOf(rows, d))
    }
    openings.sort((x, y) => y.area - x.area)
    return { view: VIEWS[k], bearing: k * 45, cast, share: cast > 0 ? area / cast : 0, area, arcmin2: arcmin2(area, d), behind: ctx ? { area: behindArea, names: [...names] } : null, glass, seen, openings,
      legible: !!openings[0] && openings[0].arcmin2 >= SKY_ARCMIN2 - 1e-9 }
  })
  const legibleViews = views.filter((x) => x.legible).length
  return { read: true, bands, views, legibleViews, context: ctx?.what ?? null, ...tail, state: legibleViews >= SKY_VIEWS ? 'pass' : 'warn' }
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
  const sky = skyThrough(t, { ...o, distance })
  const reading: Omit<SilhouetteReading, 'rules'> = { tower: t, distance, base, top, axes, legibleViews, largest, turn, topBase, sky, state }
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
  return [legible, byAxis, distances, counts, taper, turn, ...skyRules(r)]
}

export const SKY_NOTE = `Team method: a run of storeys whose plates are at most ${Math.round(OPEN_PLATE_SHARE * 100)}% of the storeys just below and above it is an open band; horizontal lines of sight cross each of its storeys straight on from 8 compass views, over the width where the tower stands both below and above the band, and a line is sky when it meets no plate, no glass and not the core (the core placed by hand or read from the model). An opening is the passing lines that touch; it reads when its angular area reaches Shang & Bishop's ${SKY_ARCMIN2} min² recognition threshold (13% contrast, as read in Garnero & Fabrizio), a team step from the outline reading's source. Glass counts as blocked and screens as clear unless a transmittance is given (gap G33: then the sky seen through them is reported apart, as a share of the opening behind them, and counts in the judgement only when the user sets it; reflections and frit patterns are not modelled); trees, haze and the towers in front are not modelled; what stands behind is checked only against the masses given to the reading (the design's other towers), never the city's buildings unless given. A design reading, never a fail.`

/** The sky-through reading as result lines: one judged, one reported. */
function skyRules(r: Omit<SilhouetteReading, 'rules'>): RuleResult[] {
  const s = r.sky, d = r.distance
  const a2 = (v: number) => (v < 0.05 ? '0' : v < 9.95 ? v.toFixed(1) : Math.round(v).toLocaleString('en-CA'))
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const zs = (z0: number, z1: number) => `+${Math.round(z0)}–${Math.round(z1)} m`
  const side = metresAt(LEGIBLE_ARCMIN, d)
  const threshold = `an opening of ≥ ${SKY_ARCMIN2} arcmin² (about ${one(side)} × ${one(side)} m from ${km(d)}) of sky framed by the tower above and below, in at least ${SKY_VIEWS} of 8 views`
  const judged = { id: 'sil-sky', label: 'Sky through the tower', threshold, source: SILHOUETTE_SOURCE, note: SKY_NOTE }
  const byView = { id: 'sil-sky-views', label: 'Sky through the tower by view', threshold: `reported, not judged; arcmin² of sky through the tower from ${km(d)} (share of the lines of sight across the open bands that pass)`, state: 'unknown' as RuleState, flag: 'team_assumption' as const, source: METHOD }
  if (!s.read) {
    const why = 'not read: the storeys of a drawn mass, or of a model without storey outlines, are not known'
    return [{ ...judged, value: why, state: 'unknown', flag: 'unresolved' }, { ...byView, value: why }]
  }
  const bandsAt = s.bands.map((b) => zs(b.z0, b.z1)).join(', ')
  const top = Math.max(0, ...s.views.map((v) => v.openings[0]?.arcmin2 ?? 0))
  let value: string
  if (!s.bands.length) value = `0 of 8 views: no open storey (no run of storeys with plates at most ${pct(OPEN_PLATE_SHARE)} of the storeys below and above it)`
  else if (top <= 0) {
    const glass = s.views.reduce<SkyView | null>((m, v) => (v.glass > (m?.glass ?? 0) ? v : m), null)
    const hidden = s.views.filter((v) => v.area > 0)
    value = hidden.length
      ? `0 of 8 views: the lines through the open storeys at ${bandsAt} pass the tower but meet ${[...new Set(hidden.flatMap((v) => v.behind?.names ?? []))].join(', ') || 'a neighbour'} behind it`
      : `0 of 8 views: the open storeys at ${bandsAt} show no sky; every line through them meets a plate${glass ? ', glass' : ''}${s.views.some((v) => (v.seen?.screen.area ?? 0) > 0) ? ', a screen' : ''} or the core${glass ? ` (${a2(arcmin2(glass.glass, d))} arcmin² behind glass from ${s.views.filter((v) => Math.abs(v.glass - glass.glass) < 1e-6).map((v) => v.view).join(', ')}, counted as blocked)` : ''}`
  } else {
    const best = s.views.filter((v) => v.openings[0] && v.openings[0].arcmin2 >= top * 0.995)
    const o = best[0].openings[0]
    const hits = s.views.filter((v) => v.behind && v.behind.area > 0)
    const behind = !s.context ? 'not checked' : hits.length ? `${hits.map((v) => `${v.behind!.names.join(', ')} from ${v.view}`).join('; ')} (${s.context} checked)` : `sky (${s.context} checked)`
    value = `${s.legibleViews} of 8 views; largest opening ${a2(o.arcmin2)} arcmin² (${one(o.width)} × ${one(o.z1 - o.z0)} m at ${zs(o.z0, o.z1)}) seen from ${best.map((v) => v.view).join(', ')}, ${km(d)}${o.arcmin2 < SKY_ARCMIN2 ? ` (under ${SKY_ARCMIN2})` : ''}; behind: ${behind}`
  }
  if (s.counted && s.bands.length) value += `; counts the sky through ${[s.screens?.set && s.screens.t > 0 ? 'screens' : '', s.glassLit ? 'glass' : ''].filter(Boolean).join(' and ')} at the transmittance set`
  const seenLine: RuleResult[] = s.screens || s.glassLit ? [seenRule(s, d, a2, pct)] : []
  return [
    { ...judged, value, state: s.state, flag: 'team_assumption' },
    ...seenLine,
    {
      ...byView,
      value: !s.bands.length ? 'no open storey to look through'
        : s.views.map((v) => `${v.view} ${a2(v.arcmin2)} (${pct(v.share)})${v.behind && v.behind.area > 0 ? `, ${pct(v.behind.area / v.area)} with ${v.behind.names.join(', ')} behind` : ''}${v.glass > 0 ? `, ${a2(arcmin2(v.glass, d))} behind glass` : ''}${seenOf(v) ? `, ${a2(arcmin2(seenOf(v)!.sky, d))} of ${a2(arcmin2(seenOf(v)!.area, d))} seen through screens or glass` : ''}`).join(' · '),
      note: s.bands.length ? `Open bands: ${s.bands.map((b) => `L${b.levels[0]}${b.levels[1] !== b.levels[0] ? `–L${b.levels[1]}` : ''} (${zs(b.z0, b.z1)}, plates ${pct(b.share)} of the storeys framing them)`).join('; ')}. A view and its opposite share the lines through the tower; only what stands behind differs.` : undefined,
    },
  ]
}

/** A view's sky behind screens and transmitting glass together (m²), or null when there is none. */
const seenOf = (v: SkyView) => (v.seen && v.seen.screen.area + v.seen.glass.area > 1e-9 ? { area: v.seen.screen.area + v.seen.glass.area, sky: v.seen.screen.sky + v.seen.glass.sky } : null)

/** The sky seen through screens and glass (gap G33), reported apart from the clear sky as a share of the opening behind them. */
function seenRule(s: SkyThrough, d: number, a2: (v: number) => string, pct: (v: number) => string): RuleResult {
  const kinds: string[] = []
  const best = (k: 'screen' | 'glass') => s.views.reduce<SkyView | null>((m, v) => (v.seen && v.seen[k].area > (m?.seen?.[k].area ?? 0) + 1e-9 ? v : m), null)
  for (const k of ['screen', 'glass'] as const) {
    const v = best(k)
    const what = k === 'screen' ? `Screens ${one(s.screens?.h ?? 0)} m high at ${pct(s.screens?.t ?? 0)} through${s.screens?.from ? ` (${s.screens.from})` : ''}` : 'Glass with a transmittance'
    if (k === 'screen' && !s.screens) continue
    if (k === 'glass' && !s.glassLit) continue
    if (!v) { kinds.push(`${what}: no opening behind them`); continue }
    const x = v.seen![k]
    kinds.push(`${what}: ${pct(x.sky / x.area)} of the sky behind them seen through, ${a2(arcmin2(x.sky, d))} of ${a2(arcmin2(x.area, d))} arcmin² from ${v.view}`)
  }
  return {
    id: 'sil-sky-seen', label: 'Sky through screens and glass', value: kinds.join(' · '),
    threshold: s.counted ? 'counted in the judgement above at the transmittance set' : 'reported apart from the clear sky; the judgement counts it only when a transmittance is set for the sky reading',
    state: 'unknown', flag: 'team_assumption', source: METHOD,
    note: 'Transmittance: the share of the sky seen through along a line of sight. Screens stand from each open storey’s floor up to their height; one screen per line of sight (a line through screens on both sides of the deck sees about the square: enter that instead). Glass: per glazed part where the model gives one, else the reading’s glass setting.',
  }
}

/** The distances (of 500 m, 2 km, 5 km) from which a change of `size` metres is legible, in words. */
function legibleFrom(size: number): string {
  const reach = size / Math.tan((LEGIBLE_ARCMIN * Math.PI) / (180 * 60)) // where it subtends exactly the threshold
  const ok = COMPARE_VIEW_M.filter((x) => arcmin(size, x) >= LEGIBLE_ARCMIN - 1e-9)
  return ok.length ? `up to about ${km(reach)} (from ${ok.map(km).join(', ')})` : `only within about ${km(reach)}`
}
