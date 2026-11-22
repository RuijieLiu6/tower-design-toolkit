// Viewpoint silhouette (vtc-entry R7 tool 1, R7d test TP1; tool cycle 12, 21 Nov): the skyline silhouette read from
// the places the city looks from, not only from 8 compass views at 2 km. R7 found that C38c's steps read about 15′
// from 2 km but about 6′ from Queen Elizabeth Park, the policy's own skyline viewpoint, so a move sized to 2 km can
// vanish from the view that matters (R7d §0, §7).
//
// Method (team):
// - Where the tower stands: Real Vancouver's frame is EPSG:26910 less the local origin; the competition block is placed
//   on the default Real Vancouver site (Granville / W Pender / Howe / Dunsmuir), turned so its long side runs along the
//   real block's, as "Open in Real Vancouver" places it (lib/defaultSite.ts competitionToCity). Its grade there is the
//   site's LiDAR ground (defaultSite.json, unverified).
// - Viewpoints: every City view-cone origin (src/data/viewcones.json; cones sharing an origin are one viewpoint, Lv read
//   as the eye level), three named places R7d §2 reads (approximate positions, team), and any place given by bearing and
//   distance from the tower.
// - From a viewpoint the tower is seen along the line to its centre. Each height slice (engine/silhouette.ts slices)
//   gives the outline's two edges across that line (m, parallel projection) and their horizontal angles (exact, per
//   vertex). Changes are read with the outline reading's own rule (axisChanges); every angular size uses the slant
//   distance to its height. The narrowest and widest heights are the slices with the least and most width.
// - Sky through the tower, storey by storey: a place across the view is sky when the tower stands somewhere above it and
//   somewhere below it at that place, no plate, glass or core of that storey covers it (the core placed as in
//   engine/storeyWeight.ts), and either the storey is in an open band (the 8-view reading's rule: plates at most 80% of
//   the storeys framing the band; the sky beside a core or a neck) or the place lies between parts of that storey (a
//   gate between two ears under a bridge, which the band rule leaves out because the bridge is small). A twist's waist is
//   neither: it reads as outline changes. What stands behind is checked against the masses given (the design's other
//   towers, the competition context in the harness). Glass blocks here; slivers under 5 cm are slicing noise.
// - Terrain line: from Queen Elizabeth Park R7d §2 read the North Shore ridge behind the default site at 1.70° above the
//   eye's horizontal (MRDEM-30 terrain, refraction k = 0.13, our arithmetic). Where it applies, openings below it are seen
//   against the mountainside, not the sky, and are reported apart. Elevation angles use the same curvature and refraction.
// - Contrast setting: Shang & Bishop's recognition threshold (as read in Garnero & Fabrizio pp. 4, 6) is about 100 min² at
//   13% contrast and 250 at 7%; read as a square, 10′ and 16′ (team, R7d §7). Clear: 10′ / 100 arcmin²; overcast (glass
//   and sky close in tone, R7d §4): 16′ / 250 arcmin². A viewpoint reads when its largest change or its largest opening
//   of sky reaches the line. A design reading, never a fail.
import siteData from '../data/defaultSite.json'
import { towerFloors } from './massing'
import { toUtm10 } from './relaxAviation'
import { arcmin, arcmin2, axisChanges, behindExtent, cut, merge, meet, openBands, openingsOf, place, SILHOUETTE_SOURCE, silhouetteSlices, skyStoreys, type AxisReading, type Change, type Iv, type SkyContext, type SkyRow } from './silhouette'
import { ringMetrics } from './site'
import { storeyCore } from './storeyWeight'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { CONE_ATTRIBUTION, CONES, edgeDistance, pointInRing } from './viewCones'

type P = [number, number]

/** Local origin of the Real Vancouver frame in EPSG:26910 (the store's CITY_ORIGIN; a test keeps the two equal). */
export const UTM_ORIGIN: P = [491300, 5458600]
/** Refraction coefficient and Earth radius for elevation angles (R7d §2 uses k = 0.13). */
export const REFRACTION_K = 0.13
const EARTH_R = 6371000
/** Eye above the ground for a viewpoint given by bearing and distance (m, team). */
export const EYE_M = 1.6

// --- Contrast -------------------------------------------------------------------------------------------------------

export type Contrast = 'clear' | 'overcast'
/** The pass line by contrast: the smallest change (arcmin) and opening of sky (arcmin²) that read. */
export const CONTRAST: Record<Contrast, { arcmin: number; arcmin2: number; pct: number; label: string }> = {
  clear: { arcmin: 10, arcmin2: 100, pct: 13, label: 'clear sky (13% contrast)' },
  overcast: { arcmin: 16, arcmin2: 250, pct: 7, label: 'overcast (7% contrast)' },
}
export const R7D_SOURCE: Source = {
  label: 'vtc-entry research R7d, What a landmark tower in downtown Vancouver must answer to (21 Nov 2026): §2 terrain line from QE Park, §4 low contrast under grey skies, §7 legibility rules of thumb',
  page: '§2, §4, §7 (project file)',
}
export const CONTRAST_NOTE = 'Contrast setting (team, R7d §7): Shang & Bishop measured the visual size at which people recognise an object in a landscape at about 100 min² at 13% contrast and 250 min² at 7% (as read in Garnero & Fabrizio, preprint pp. 4, 6). Read as a square, a change of outline reads at 10′ (clear) or 16′ (overcast, when glass and sky are close in tone); an opening of sky is read as the area it is (100 or 250 arcmin²). Which days are overcast in Vancouver was not found.'

// --- Where the tower stands -------------------------------------------------------------------------------------------

const SITE_RING = siteData.ring as P[]
function longSideDeg(ring: P[]): number {
  let best = 0, deg = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI }
  })
  return ((deg % 180) + 180) % 180
}
const SITE_CENTRE = ringMetrics(SITE_RING).centre as P
const SITE_TURN = longSideDeg(SITE_RING)
/** The default site's ground (geodetic m, CGVD28): the mean of its corners, City LiDAR 2022 (defaultSite.json, unverified). */
export const DEFAULT_SITE_GROUND: number = siteData.flags.groundCGVD28.value.cornerMean

/** Where a project's frame sits in EPSG:26910 and the tower's grade there. */
export interface ViewSite {
  /** EPSG:26910 of a project-frame point p: origin + R(turnDeg)·p (R turns counter-clockwise). */
  origin: P
  turnDeg: number
  /** Grade under the tower (geodetic m, CGVD28). */
  ground: number
  /** The competition block placed on the default Real Vancouver site. */
  competition: boolean
  label: string
}

/** The competition block on the default Real Vancouver site; Real Vancouver as it is (ground: the tower's base, default the site's). */
export function viewSite(project: 'vtc' | 'city', ground?: number | null): ViewSite {
  if (project === 'vtc') {
    return { origin: [UTM_ORIGIN[0] + SITE_CENTRE[0], UTM_ORIGIN[1] + SITE_CENTRE[1]], turnDeg: SITE_TURN, ground: DEFAULT_SITE_GROUND, competition: true,
      label: `the competition block placed on the default Real Vancouver site (${siteData.label}), turned ${SITE_TURN.toFixed(1)}° to its street grid, grade ${DEFAULT_SITE_GROUND.toFixed(1)} m` }
  }
  const g = ground != null && Number.isFinite(ground) ? ground : DEFAULT_SITE_GROUND
  return { origin: UTM_ORIGIN, turnDeg: 0, ground: g, competition: false, label: `Real Vancouver (EPSG:26910), tower grade ${g.toFixed(1)} m` }
}
function toUtm(s: ViewSite): (p: P) => P {
  const a = (s.turnDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
  return ([x, y]) => [s.origin[0] + x * c - y * sn, s.origin[1] + x * sn + y * c]
}

// --- Viewpoints -------------------------------------------------------------------------------------------------------

export interface Viewpoint {
  id: string
  name: string
  kind: 'cone' | 'named' | 'custom'
  /** EPSG:26910 (m). */
  at: P
  /** Eye level (geodetic m, CGVD28). */
  eye: number
  /** The City view cones that start here. */
  cones: string[]
  /** The terrain line behind the default site seen from here (degrees above the eye's horizontal), where it was read. */
  terrainDeg?: number
  flag: Flag
  source: Source
  note?: string
}
/** A viewpoint given from the tower: the viewer's bearing from it (degrees clockwise from grid north), the distance (m) and, optionally, the eye level (geodetic m). */
export interface ViewpointAt { name?: string; bearing: number; distance: number; eye?: number }
export type ViewpointRef = string | Viewpoint | ViewpointAt

const CONE_SOURCE: Source = { label: `City of Vancouver ViewCone layer: view point and its elevation Lv (src/data/viewcones.json). ${CONE_ATTRIBUTION}` }
const QE_TERRAIN_DEG = 1.7
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** One viewpoint per City view-cone origin (cones whose origins lie within 5 m are one viewpoint); Queen Elizabeth Park is 'qe'. */
export const CONE_VIEWPOINTS: Viewpoint[] = (() => {
  const groups: { at: P; eye: number; ids: string[]; name: string }[] = []
  for (const c of CONES) {
    const o = c.ring[0]
    const g = groups.find((x) => Math.hypot(x.at[0] - o[0], x.at[1] - o[1]) < 5)
    if (g) g.ids.push(c.id)
    else groups.push({ at: [o[0], o[1]], eye: c.Lv, ids: [c.id], name: c.name })
  }
  return groups.map((g): Viewpoint => {
    const ids = [...g.ids].sort(natural), qe = ids.includes('3.2.3')
    return {
      id: qe ? 'qe' : `cone-${ids[0]}`, name: g.name, kind: 'cone', at: g.at, eye: g.eye, cones: ids, flag: 'unverified', source: CONE_SOURCE,
      ...(qe ? { terrainDeg: QE_TERRAIN_DEG } : {}),
      note: `The City's view point for cone${ids.length > 1 ? 's' : ''} ${ids.join(', ')}; Lv ${g.eye} m read as the eye level (team).${qe ? ` Terrain line behind the default site ${QE_TERRAIN_DEG.toFixed(2)}° (R7d §2: MRDEM-30 terrain to about 30 km, k = 0.13, our arithmetic).` : ''}`,
    }
  }).sort((a, b) => (a.id === 'qe' ? -1 : b.id === 'qe' ? 1 : natural(a.cones[0], b.cones[0])))
})()

const NAMED_SOURCE: Source = { label: 'Approximate position read from a public map by the team (21 Nov 2026); R7d §2 names these places as skyline viewpoints. Not surveyed.' }
const named = (id: string, name: string, lat: number, lon: number): Viewpoint => ({
  id, name, kind: 'named', at: toUtm10(lat, lon), eye: 5, cones: [], flag: 'team_assumption', source: NAMED_SOURCE,
  note: `Position about ${lat.toFixed(4)}, ${lon.toFixed(4)} (team pick, not R7d's own, which was not recorded); eye about 5 m (ground near sea level, not read, plus 1.6 m: team).`,
})
/** Named viewpoints R7d §2 reads from (approximate team picks); its third, Granville Island, is a City view-cone origin (cone 10). */
export const NAMED_VIEWPOINTS: Viewpoint[] = [
  named('kits-point', 'Kits Point', 49.2775, -123.1462),
  named('lonsdale-quay', 'Lonsdale Quay', 49.31, -123.0827),
]
export const ALL_VIEWPOINTS: Viewpoint[] = [...CONE_VIEWPOINTS, ...NAMED_VIEWPOINTS]

/** A viewpoint by id ('qe', 'cone-K', 'kits-point'), by any cone id ('3.2.3'), as given, or from a bearing and distance from the tower. */
export function resolveViewpoint(ref: ViewpointRef, centre: P, site: ViewSite): Viewpoint | null {
  if (typeof ref === 'string') return ALL_VIEWPOINTS.find((v) => v.id === ref || v.cones.includes(ref)) ?? null
  if ('at' in ref) return ref
  if (!Number.isFinite(ref.bearing) || !(ref.distance > 0)) return null
  const b = (ref.bearing * Math.PI) / 180
  const eye = ref.eye != null && Number.isFinite(ref.eye) ? ref.eye : site.ground + EYE_M
  const bearing = ((ref.bearing % 360) + 360) % 360
  return {
    id: `at-${Math.round(bearing)}-${Math.round(ref.distance)}`, name: ref.name?.trim() || `${Math.round(bearing)}°, ${km(ref.distance)} away`, kind: 'custom',
    at: [centre[0] + ref.distance * Math.sin(b), centre[1] + ref.distance * Math.cos(b)], eye, cones: [], flag: 'team_assumption',
    source: { label: 'A viewpoint set by the user: bearing from the tower (grid north) and distance' },
    note: ref.eye != null ? undefined : `Eye ${EYE_M} m above the tower's grade (team).`,
  }
}

// --- The reading ------------------------------------------------------------------------------------------------------

/** One height slice seen from the viewpoint: edges across the line of sight (m, from the line through the tower centre, + to the viewer's right) and their horizontal angles (degrees). */
export interface VpEdge { z0: number; z1: number; l: number; r: number; al: number; ar: number }
export interface VpWidth { m: number; arcmin: number; z0: number; z1: number }
export interface VpCell { l: number; r: number; z0: number; z1: number }
export interface VpOpening {
  z0: number; z1: number
  /** Lateral extent across the view (m) and its width. */
  l: number; r: number; width: number
  /** Opening (m², arcmin²) and, of it, the part seen against the sky (above the terrain line where it applies). */
  area: number; arcmin2: number; sky: number; skyArcmin2: number
  cells: VpCell[]
}
export interface ViewpointReading {
  viewpoint: Viewpoint
  /** Bearing from the viewer to the tower (degrees clockwise from grid north). */
  bearing: number
  /** Horizontal distance from the viewer to the tower centre (m). */
  distance: number
  eye: number
  ground: number
  /** The view cones from this origin that the tower stands in. */
  inCones: string[]
  contrast: Contrast
  /** The pass line: arcmin and arcmin², and their size in m and m² at the tower's distance. */
  line: { arcmin: number; arcmin2: number; m: number; m2: number }
  edges: VpEdge[]
  changes: Change[]
  largest: Change | null
  narrowest: VpWidth | null
  widest: VpWidth | null
  sky: { read: boolean; openings: VpOpening[]; area: number; arcmin2: number; behind: { area: number; names: string[] } | null; largest: VpOpening | null }
  /** The terrain line behind the tower: its angle and the height where it crosses the tower (m above grade). */
  terrain: { deg: number; z: number } | null
  /** The crown: height above grade and elevation angle (degrees). */
  top: { z: number; deg: number }
  reads: { outline: boolean; sky: boolean }
  state: RuleState
}
export interface ViewpointOptions {
  site: ViewSite
  contrast?: Contrast
  /** Masses to check behind the sky through the tower (project frame). */
  context?: SkyContext | null
}

const DEG = 180 / Math.PI
const km = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`)

/** Geometry shared by the reading and the outline export. */
function frame(t: Tower, ref: ViewpointRef, site: ViewSite) {
  const U = toUtm(site)
  const slices = silhouetteSlices(t, true)
  // the line of sight runs to the centre of the tower part above the podium (the whole tower when it is all podium)
  const pts = silhouetteSlices(t).flatMap((s) => s.rings.flat()).map(U)
  if (!pts.length) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const C: P = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const vp = resolveViewpoint(ref, C, site)
  if (!vp) return null
  const dx = C[0] - vp.at[0], dy = C[1] - vp.at[1], D = Math.hypot(dx, dy)
  if (D < 1) return null
  const v: P = [dx / D, dy / D], u: P = [v[1], -v[0]]
  const rel = (p: P): P => { const q = U(p); return [q[0] - C[0], q[1] - C[1]] }
  const lat = (p: P) => p[0] * u[0] + p[1] * u[1], dep = (p: P) => D + p[0] * v[0] + p[1] * v[1]
  const az = (p: P) => Math.atan2(lat(p), dep(p)) * DEG
  const drop = (q: number) => (q * q * (1 - REFRACTION_K)) / (2 * EARTH_R)
  /** Apparent elevation (degrees) of height z above the tower's grade at horizontal distance q (default: the tower centre's). */
  const elev = (z: number, q = D) => Math.atan2(site.ground + z - vp.eye - drop(q), q) * DEG
  const slant = (z: number) => Math.hypot(D, site.ground + z - vp.eye)
  // The terrain line applies where it was read: toward the default site (the competition block, or a Real Vancouver tower on that block).
  const local: P = [C[0] - UTM_ORIGIN[0], C[1] - UTM_ORIGIN[1]]
  const onSite = site.competition || pointInRing(local, [...SITE_RING, SITE_RING[0]]) || edgeDistance(local, [...SITE_RING, SITE_RING[0]]) <= 30
  const terrain = vp.terrainDeg != null && onSite ? { deg: vp.terrainDeg, z: vp.eye + D * Math.tan(vp.terrainDeg / DEG) + drop(D) - site.ground } : null
  return { U, C, vp, D, u, v, rel, lat, dep, az, elev, slant, terrain, slices, bearing: ((Math.atan2(dx, dy) * DEG) + 360) % 360 }
}

/** The tower's silhouette from one viewpoint: outline changes, narrowest and widest widths, sky through it, against the contrast line. */
export function viewpointReading(t: Tower, ref: ViewpointRef, o: ViewpointOptions): ViewpointReading | null {
  const f = frame(t, ref, o.site)
  if (!f) return null
  const { vp, D, rel, lat, az, elev, slant, terrain } = f
  const contrast: Contrast = o.contrast ?? 'clear'
  const c = CONTRAST[contrast]
  const line = { arcmin: c.arcmin, arcmin2: c.arcmin2, m: D * Math.tan(c.arcmin / (60 * DEG)), m2: c.arcmin2 / (10800 / (Math.PI * D)) ** 2 }
  // The tower part above the podium, as the outline reading reads it.
  const edges: VpEdge[] = silhouetteSlices(t).map((s) => {
    const ps = s.rings.flat().map(rel)
    return { z0: s.z0, z1: s.z1, l: Math.min(...ps.map(lat)), r: Math.max(...ps.map(lat)), al: Math.min(...ps.map(az)), ar: Math.max(...ps.map(az)) }
  })
  const changes = axisChanges(edges, D).map((ch) => ({ ...ch, arcmin: arcmin(ch.size, slant((ch.z0 + ch.z1) / 2)) }))
  const largest = changes.reduce<Change | null>((m, x) => (!m || x.size > m.size ? x : m), null)
  const widthAt = (pick: (a: number, b: number) => boolean): VpWidth | null => {
    if (!edges.length) return null
    let k = 0
    edges.forEach((e, i) => { if (pick(e.r - e.l, edges[k].r - edges[k].l)) k = i })
    const w = edges[k].r - edges[k].l
    let a = k, b = k
    while (a > 0 && Math.abs(edges[a - 1].r - edges[a - 1].l - w) < 0.05 && Math.abs(edges[a - 1].z1 - edges[a].z0) < 0.01) a--
    while (b + 1 < edges.length && Math.abs(edges[b + 1].r - edges[b + 1].l - w) < 0.05 && Math.abs(edges[b].z1 - edges[b + 1].z0) < 0.01) b++
    const z0 = edges[a].z0, z1 = edges[b].z1
    return { m: w, arcmin: arcmin(w, slant((z0 + z1) / 2)), z0, z1 }
  }
  const narrowest = widthAt((w, best) => w < best - 1e-9), widest = widthAt((w, best) => w > best + 1e-9)
  const sky = skyFrom(t, f, o.context ?? null, terrain)
  const inCones = vp.cones.filter((id) => {
    const cone = CONES.find((k) => k.id === id)
    if (!cone) return false
    const local = (p: P): P => { const q = f.U(p); return [q[0], q[1]] }
    return pointInRing(f.C, cone.ring) || f.slices.some((s) => s.rings.some((r) => r.some((p) => pointInRing(local(p as P), cone.ring))))
  })
  const topZ = f.slices.length ? f.slices[f.slices.length - 1].z1 : 0
  const reads = { outline: !!largest && largest.arcmin >= c.arcmin - 1e-9, sky: !!sky.largest && sky.largest.skyArcmin2 >= c.arcmin2 - 1e-9 }
  return {
    viewpoint: vp, bearing: f.bearing, distance: D, eye: vp.eye, ground: o.site.ground, inCones, contrast, line, edges, changes, largest, narrowest, widest, sky, terrain,
    top: { z: topZ, deg: elev(topZ) }, reads, state: edges.length ? (reads.outline || reads.sky ? 'pass' : 'warn') : 'unknown',
  }
}

type Frame = NonNullable<ReturnType<typeof frame>>

/** Sky through the tower from the viewpoint, storey by storey: framed above and below at the same place across the view, covered by nothing of that storey. */
function skyFrom(t: Tower, f: Frame, ctx: SkyContext | null, terrain: { deg: number; z: number } | null): ViewpointReading['sky'] {
  const none = { read: false, openings: [], area: 0, arcmin2: 0, behind: null, largest: null }
  const st = skyStoreys(t)
  if (!st || !st.length) return none
  const { rel, lat, v, D, slant } = f
  const ext = (rings: P[][]): Iv[] => merge(rings.filter((r) => r.length >= 3).map((r) => { const s = r.map((p) => lat(rel(p))); return [Math.min(...s), Math.max(...s)] as Iv }))
  const covered = st.map((s) => ext([...s.rings, ...s.glazed]))
  const below: Iv[][] = [], above: Iv[][] = new Array(st.length)
  let acc: Iv[] = []
  for (let i = 0; i < st.length; i++) { below.push(acc); acc = merge([...acc, ...covered[i]]) }
  acc = []
  for (let i = st.length - 1; i >= 0; i--) { above[i] = acc; acc = merge([...acc, ...covered[i]]) }
  // the storeys of the open bands (plates at most OPEN_PLATE_SHARE of the storeys framing them)
  const band = st.map(() => false)
  for (const [a, b] of openBands(st)) for (let i = a; i <= b; i++) band[i] = true
  let coreAt: ReturnType<typeof storeyCore> | null = null
  const holes = st.map((s, i) => {
    if (s.podium || !covered[i].length && !band[i]) return [] as Iv[]
    const lo = covered[i].length ? covered[i][0][0] : Infinity, hi = covered[i].length ? covered[i][covered[i].length - 1][1] : -Infinity
    let h = cut(meet(below[i], above[i]), covered[i]).filter(([l, r]) => r - l >= 0.05 && (band[i] || (l >= lo - 1e-9 && r <= hi + 1e-9)))
    if (h.length) {
      // the core stands in the open storeys too (the plates may leave it out)
      coreAt ??= storeyCore(t)
      const k = coreAt(s.level), r = k.side / 2
      h = cut(h, ext([place(t, [[k.x - r, k.y - r], [k.x + r, k.y - r], [k.x + r, k.y + r], [k.x - r, k.y + r]])]))
    }
    return h
  })
  if (!holes.some((h) => h.length)) return { read: true, openings: [], area: 0, arcmin2: 0, behind: ctx ? { area: 0, names: [] } : null, largest: null }
  // what stands behind: context prisms beyond the tower's far face on the line of sight
  const dot = (p: P, w: P) => p[0] * w[0] + p[1] * w[1]
  const far = Math.max(...st.flatMap((s) => s.rings.flat().map((p) => dot(rel(p), v))))
  const prisms = (ctx?.prisms ?? []).filter((p) => p.ring.length >= 3).map((p) => ({ ...p, rel: p.ring.map((q) => rel(q as P)) }))
  const u: P = [v[1], -v[0]]
  const names = new Set<string>()
  let behindArea = 0
  const rows: SkyRow[] = st.map((s, i) => {
    const mid = (s.z0 + s.z1) / 2
    const back = ctx ? merge(prisms.filter((p) => p.z0 <= mid && mid < p.z1).flatMap((p) => {
      const iv = behindExtent(p.rel, u, v, far)
      if (iv && meet(holes[i], [iv]).length) names.add(p.name ?? 'a neighbour')
      return iv ? [iv] : []
    })) : []
    behindArea += meet(holes[i], back).reduce((a, [l, r]) => a + r - l, 0) * (s.z1 - s.z0)
    return { z0: s.z0, z1: s.z1, seg: cut(holes[i], back).map((iv) => ({ iv, w: 1 })) }
  })
  const zt = terrain?.z ?? -Infinity
  const openings: VpOpening[] = openingsOf(rows, D).map((op) => {
    const cells = op.cells.map(({ l, r, z0, z1 }) => ({ l, r, z0, z1 }))
    const sky = cells.reduce((a, x) => a + (x.r - x.l) * Math.max(0, x.z1 - Math.max(x.z0, zt)), 0)
    const d = slant((op.z0 + op.z1) / 2)
    return { z0: op.z0, z1: op.z1, l: Math.min(...cells.map((x) => x.l)), r: Math.max(...cells.map((x) => x.r)), width: op.width, area: op.area, arcmin2: arcmin2(op.area, d), sky, skyArcmin2: arcmin2(sky, d), cells }
  }).sort((a, b) => b.skyArcmin2 - a.skyArcmin2 || b.area - a.area)
  const area = openings.reduce((a, x) => a + x.area, 0)
  return { read: true, openings, area, arcmin2: openings.reduce((a, x) => a + x.arcmin2, 0), behind: ctx ? { area: behindArea, names: [...names] } : null, largest: openings[0] ?? null }
}

// --- The outline in a plain form (for drawing "the view from …") ------------------------------------------------------

export interface ViewOutline {
  viewpoint: { id: string; name: string; at: P; eye: number }
  bearing: number
  distance: number
  ground: number
  contrast: Contrast
  line: ViewpointReading['line']
  /**
   * The whole tower as seen (podium included): one polygon per run of touching slices, the outline's outer edges.
   * metres: [x, y], x across the view (m, + to the viewer's right, 0 on the line to the tower centre), y above the
   * tower's grade. angles: [azimuth, elevation] in degrees (right of the line to the tower centre; above the eye's
   * horizontal, with curvature and refraction).
   */
  outline: { metres: P[]; angles: P[] }[]
  /** The same slices as rectangles of what stands at each height (gaps between parts left open), metres and angles. */
  parts: { metres: P[]; angles: P[] }[]
  /** Sky through the tower: each opening as rectangles (one per storey row), metres and angles, with its area. */
  openings: { area: number; arcmin2: number; sky: number; cells: { metres: P[]; angles: P[] }[] }[]
  terrain: { deg: number; z: number } | null
  top: { z: number; deg: number }
}

/** The tower's outline and openings from a viewpoint as plain 2D points (metres and angles), for drawing the view. */
export function viewpointOutline(t: Tower, ref: ViewpointRef, o: ViewpointOptions): ViewOutline | null {
  const f = frame(t, ref, o.site)
  const r = viewpointReading(t, ref, o)
  if (!f || !r) return null
  const { rel, lat, az, elev, D } = f
  const r2 = (x: number) => Math.round(x * 100) / 100, r5 = (x: number) => Math.round(x * 1e5) / 1e5
  const m = (x: number, y: number): P => [r2(x), r2(y)]
  const a = (x: number, y: number): P => [r5(x), r5(y)]
  const rect = (l: number, rr: number, z0: number, z1: number, al: number, ar: number) => ({ metres: [m(l, z0), m(rr, z0), m(rr, z1), m(l, z1)], angles: [a(al, elev(z0)), a(ar, elev(z0)), a(ar, elev(z1)), a(al, elev(z1))] })
  const rows = f.slices.map((s) => {
    const parts = s.rings.map((ring) => { const ps = ring.map((p) => rel(p as P)); return { l: Math.min(...ps.map(lat)), r: Math.max(...ps.map(lat)), al: Math.min(...ps.map(az)), ar: Math.max(...ps.map(az)) } }).sort((x, y) => x.l - y.l)
    const spans: typeof parts = []
    for (const p of parts) { const last = spans[spans.length - 1]; if (last && p.l <= last.r + 1e-6) { last.r = Math.max(last.r, p.r); last.ar = Math.max(last.ar, p.ar); last.al = Math.min(last.al, p.al) } else spans.push({ ...p }) }
    return { z0: s.z0, z1: s.z1, spans }
  })
  // outer outline polygons over runs of touching slices
  const outline: ViewOutline['outline'] = []
  let run: typeof rows = []
  const flush = () => {
    if (!run.length) return
    const ex = run.map((x) => ({ z0: x.z0, z1: x.z1, l: Math.min(...x.spans.map((s) => s.l)), r: Math.max(...x.spans.map((s) => s.r)), al: Math.min(...x.spans.map((s) => s.al)), ar: Math.max(...x.spans.map((s) => s.ar)) }))
    const right = ex.flatMap((e) => [[e.r, e.z0, e.ar], [e.r, e.z1, e.ar]]), left = [...ex].reverse().flatMap((e) => [[e.l, e.z1, e.al], [e.l, e.z0, e.al]])
    const ring = [...right, ...left]
    outline.push({ metres: ring.map(([x, z]) => m(x, z)), angles: ring.map(([, z, w]) => a(w, elev(z))) })
    run = []
  }
  for (const x of rows) { if (run.length && Math.abs(run[run.length - 1].z1 - x.z0) > 0.01) flush(); run.push(x) }
  flush()
  const parts = rows.flatMap((x) => x.spans.map((s) => rect(s.l, s.r, x.z0, x.z1, s.al, s.ar)))
  const openings = r.sky.openings.map((op) => ({ area: r2(op.area), arcmin2: r2(op.arcmin2), sky: r2(op.sky), cells: op.cells.map((c) => rect(c.l, c.r, c.z0, c.z1, Math.atan2(c.l, D) * DEG, Math.atan2(c.r, D) * DEG)) }))
  return { viewpoint: { id: r.viewpoint.id, name: r.viewpoint.name, at: r.viewpoint.at, eye: r.eye }, bearing: r.bearing, distance: D, ground: r.ground, contrast: r.contrast, line: r.line, outline, parts, openings, terrain: r.terrain, top: r.top }
}

// --- Result lines -----------------------------------------------------------------------------------------------------

const one = (v: number) => v.toFixed(1)
const arc = (x: number) => `${x < 9.95 ? x.toFixed(1) : Math.round(x)}′`
const a2 = (x: number) => (x < 0.05 ? '0' : x < 9.95 ? x.toFixed(1) : Math.round(x).toLocaleString('en-CA'))
const zs = (z0: number, z1: number) => (z1 - z0 < 0.5 ? `+${Math.round(z0)} m` : `+${Math.round(z0)}–${Math.round(z1)} m`)
const how = (c: Change) => (Math.abs(c.dw) >= 0.5 * c.size ? (c.dw < 0 ? 'narrows' : 'widens') : 'slides')
const brg = (b: number) => `${Math.round(b) % 360}°`
const cones = (v: Viewpoint) => (v.cones.length ? ` (${v.cones.length > 2 ? `${v.cones[0]}–${v.cones[v.cones.length - 1]}` : v.cones.join(', ')})` : '')

/** The pass line in words, for a reading's distance. */
export function lineWords(r: Pick<ViewpointReading, 'line' | 'distance' | 'contrast'>): string {
  const c = CONTRAST[r.contrast], other = CONTRAST[r.contrast === 'clear' ? 'overcast' : 'clear']
  return `a change of ≥ ${c.arcmin}′ (${one(r.line.m)} m from ${km(r.distance)}) or ≥ ${c.arcmin2} arcmin² of sky through the tower (${Math.round(r.line.m2)} m²), ${c.label}; ${r.contrast === 'clear' ? 'overcast' : 'clear'}: ${other.arcmin}′ / ${other.arcmin2} arcmin²`
}

/** One viewpoint's reading in words (the judged line's value, and each entry of the reported line). */
export function readingWords(r: ViewpointReading, short = false): string {
  const c = r.largest
  const verdict = r.reads.outline && r.reads.sky ? 'reads by its outline and its sky' : r.reads.outline ? 'reads by its outline' : r.reads.sky ? 'reads by its sky' : `under the line (${r.line.arcmin}′ / ${r.line.arcmin2} arcmin²)`
  const change = c ? `${how(c)} ${one(c.size)} m at ${zs(c.z0, c.z1)}, ${arc(c.arcmin)}` : 'straight outline'
  const width = r.narrowest && r.widest ? `width ${one(r.narrowest.m)}–${one(r.widest.m)} m (${arc(r.narrowest.arcmin)}–${arc(r.widest.arcmin)})` : ''
  const o = r.sky.largest
  const sky = !r.sky.read ? 'sky not read' : !o ? 'no sky through' : `sky ${a2(o.sky)} m², ${a2(o.skyArcmin2)} arcmin²${o.area - o.sky > 0.05 ? ` (+${a2(o.area - o.sky)} m² against the mountainside)` : ''}`
  if (short) return `${r.viewpoint.name}${cones(r.viewpoint)} ${km(r.distance)} at ${brg(r.bearing)}: ${c ? `${arc(c.arcmin)} (${one(c.size)} m)` : 'no change'}, ${!r.sky.read ? 'sky not read' : o ? `sky ${a2(o.skyArcmin2)} arcmin²` : 'no sky'}${r.state === 'pass' ? ', reads' : ''}`
  const terrain = r.terrain ? `; terrain line behind at ${r.terrain.deg.toFixed(2)}° crosses the tower at +${one(r.terrain.z)} m (top at ${r.top.deg.toFixed(2)}°)` : ''
  return `${verdict}: largest change ${change} from ${km(r.distance)} at ${brg(r.bearing)}; ${width}; ${sky}${terrain}`
}

export const VIEWPOINT_NOTE = 'Team method: the tower is seen along the line from the viewpoint to its centre; each height slice above the podium gives the outline\'s edges across that line, and changes merge as in the 8-view reading. Angular sizes use the slant distance. Sky through the tower: a place across the view is sky when the tower stands above and below it there, no plate, glass or core of that storey covers it, and the storey is in an open band (plates at most 80% of the storeys framing it) or the place lies between parts of that storey (a gate between two ears under a bridge); a twist’s waist reads as outline changes, not sky; what stands behind is checked only against the masses given. Where R7d read the terrain line behind (QE Park toward the default site, 1.70°), openings below it are seen against the mountainside and are not counted as sky. The competition block stands on the default Real Vancouver site for this reading. Not modelled: terrain and buildings between the viewpoint and the tower, haze, light and the towers in front. A design reading, never a fail.'

/** The viewpoint readings as result lines: Queen Elizabeth Park judged (the policy's skyline viewpoint), every other viewpoint reported. */
export function viewpointRules(qe: ViewpointReading | null, others: ViewpointReading[]): RuleResult[] {
  const out: RuleResult[] = []
  const label = 'Skyline silhouette from Queen Elizabeth Park'
  if (!qe || !qe.edges.length) {
    out.push({ id: 'sil-qe', label, value: 'no tower storeys to read', threshold: 'a change of ≥ 10′ or ≥ 100 arcmin² of sky through the tower from the cone 3.2 origin (clear sky)', state: 'unknown', flag: 'unresolved', source: SILHOUETTE_SOURCE, note: VIEWPOINT_NOTE })
  } else {
    out.push({
      id: 'sil-qe', label, value: `${readingWords(qe)}${qe.inCones.length ? `; stands in view${qe.inCones.length > 1 ? 's' : ''} ${qe.inCones.join(', ')}` : ''}`,
      threshold: `${lineWords(qe)}, from the City's cone 3.2 origin (eye ${one(qe.eye)} m)`, state: qe.state, flag: 'team_assumption', source: SILHOUETTE_SOURCE,
      note: `${VIEWPOINT_NOTE} ${CONTRAST_NOTE}`,
      ...(qe.distance < 1000 ? { specialist: 'the viewpoint is nearer than 1 km: the base and the buildings in front dominate the view' } : {}),
    })
  }
  const rest = others.filter((r) => r.edges.length).sort((a, b) => a.distance - b.distance)
  if (rest.length) {
    out.push({
      id: 'sil-viewpoints', label: 'Skyline silhouette from the other view-cone origins and named viewpoints', value: rest.map((r) => readingWords(r, true)).join(' · '),
      threshold: `reported, not judged; reads = a change of ≥ ${rest[0].line.arcmin}′ or ≥ ${rest[0].line.arcmin2} arcmin² of sky through the tower from that viewpoint, ${CONTRAST[rest[0].contrast].label}`,
      state: 'unknown', flag: 'team_assumption', source: R7D_SOURCE,
      note: 'Viewpoints: every City view-cone origin (cones sharing an origin are one viewpoint; Lv read as the eye level) and the named places R7d §2 reads from (approximate team positions), nearest first, with the bearing from the viewer to the tower. Each entry: the largest change and its angular size, and the largest opening of sky.',
    })
  }
  return out
}

/** Every reading for a tower: Queen Elizabeth Park and the others (all cone origins, the named viewpoints and any given). */
export function viewpointReadings(t: Tower, o: ViewpointOptions & { viewpoints?: ViewpointRef[] }): { qe: ViewpointReading | null; others: ViewpointReading[] } {
  const qe = viewpointReading(t, 'qe', o)
  const refs: ViewpointRef[] = [...ALL_VIEWPOINTS.filter((v) => v.id !== 'qe'), ...(o.viewpoints ?? [])]
  const others = refs.map((ref) => viewpointReading(t, ref, o)).filter((r): r is ViewpointReading => !!r)
  return { qe, others }
}

// --- Datum levels (R7 tool 9, R7c T-M5, cheap form) --------------------------------------------------------------------
// Levels a step could take, offered in the silhouette view: neighbours' roofs within reach, the tower's own belts (plant,
// outrigger and sky-lobby storeys) and the ridge line from Queen Elizabeth Park where it was read. Each is given with the
// nearest change of the outline, so a step can be moved onto it by hand. A reading, not a judgement.

/** Neighbours' roofs farther than this from the tower are not offered (m, team). */
export const DATUM_REACH_M = 400
/** At most this many neighbours' roofs, the nearest first (team: keeps the view legible). */
const DATUM_NEIGHBOURS = 8
export interface Datum { z: number; kind: 'roof' | 'belt' | 'ridge'; label: string; /** The nearest outline change (m above grade) and how far the datum is above it. */ step: { z: number; dz: number } | null }
export interface Roof { ring: [number, number][]; z1: number; name?: string }

/** Candidate step levels for a tower: neighbours' roofs within reach (project frame, m above grade), its belts and the QE ridge line. */
export function datumLevels(t: Tower, o: { steps: number[]; base: number; top: number; roofs?: Roof[]; ridge?: { z: number } | null }): Datum[] {
  const { base, top } = o
  const inSpan = (z: number) => z > base + 0.5 && z < top - 0.5
  const pts = silhouetteSlices(t).flatMap((s) => s.rings.flat())
  if (!pts.length) return []
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const near = (o.roofs ?? []).filter((r) => r.ring.length >= 3 && inSpan(r.z1)).map((r) => {
    const x = r.ring.reduce((a, p) => a + p[0], 0) / r.ring.length, y = r.ring.reduce((a, p) => a + p[1], 0) / r.ring.length
    return { ...r, d: Math.hypot(x - cx, y - cy) }
  }).filter((r) => r.d <= DATUM_REACH_M && r.d > 1).sort((a, b) => a.d - b.d).slice(0, DATUM_NEIGHBOURS)
  // roofs within a metre of each other are one level
  const groups: { z: number; names: string[] }[] = []
  for (const r of near) {
    const who = r.name ?? `a neighbour ${Math.round(r.d)} m away`, g = groups.find((x) => Math.abs(x.z - r.z1) < 1)
    if (g) g.names.push(who); else groups.push({ z: r.z1, names: [who] })
  }
  const out: Omit<Datum, 'step'>[] = groups.map((g) => ({ z: g.z, kind: 'roof', label: `${g.names.length > 1 ? 'roofs' : 'roof'} of ${g.names.join(' and ')}` }))
  const floors = towerFloors(t)
  const belts: [number[] | undefined, string][] = [[t.plantLevels, 'plant belt'], [t.outriggerFloors, 'outrigger belt'], [t.skyLobbies, 'sky lobby']]
  for (const [levels, what] of belts) for (const lv of levels ?? []) {
    const f = floors.find((x) => x.level === lv)
    if (f && inSpan(f.z0) && !out.some((x) => x.kind === 'belt' && Math.abs(x.z - f.z0) < 0.05)) out.push({ z: f.z0, kind: 'belt', label: `L${lv} ${what}` })
  }
  if (o.ridge && inSpan(o.ridge.z)) out.push({ z: o.ridge.z, kind: 'ridge', label: 'the ridge line from Queen Elizabeth Park' })
  return out.sort((a, b) => a.z - b.z).map((d) => {
    const s = o.steps.reduce<number | null>((m, z) => (m === null || Math.abs(z - d.z) < Math.abs(m - d.z) ? z : m), null)
    return { ...d, step: s === null ? null : { z: s, dz: d.z - s } }
  })
}

/** Heights where the outline moves in any of the 8 views (m above grade), from the silhouette reading's axes. */
export function stepHeights(axes: AxisReading[]): number[] {
  const zs = axes.flatMap((a) => a.edges.flatMap((e, i) => (i > 0 && (Math.abs(e.l - a.edges[i - 1].l) >= 0.05 || Math.abs(e.r - a.edges[i - 1].r) >= 0.05) ? [e.z0] : [])))
  return [...new Set(zs.map((z) => Math.round(z * 1000) / 1000))].sort((x, y) => x - y)
}

/** The datum levels as one reported line. */
export function datumRule(ds: Datum[]): RuleResult {
  const at = (z: number) => `+${z.toFixed(1)} m`
  return {
    id: 'sil-datums', label: 'Step levels on offer: neighbours’ roofs, belts, the ridge line',
    value: ds.length ? ds.map((d) => `${at(d.z)} ${d.label}${d.step ? (Math.abs(d.step.dz) < 0.05 ? ' (a change of the outline is there)' : ` (nearest change ${at(d.step.z)}, ${Math.abs(d.step.dz).toFixed(1)} m ${d.step.dz > 0 ? 'below' : 'above'})`) : ''}`).join(' · ')
      : 'none within the tower’s height above the podium',
    threshold: `reported, not judged; neighbours’ roofs within ${DATUM_REACH_M} m (the ${DATUM_NEIGHBOURS} nearest), the tower’s plant, outrigger and sky-lobby storeys, and the QE Park ridge line where it was read`,
    state: 'unknown', flag: 'team_assumption', source: R7D_SOURCE,
    note: 'R7c T-M5 (datum snap): a step that meets a neighbour’s roof or a belt ties the tower to its context and to its structure. These are candidate levels only: move a step onto one in Massing blocks or in the model. The competition context’s future towers (186, 244 and 305 m) are its own roofs; on Real Vancouver only the design’s other towers are offered unless the city’s buildings are given.',
  }
}
