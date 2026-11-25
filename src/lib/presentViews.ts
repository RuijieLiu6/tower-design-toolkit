// Camera presets for scripted presentation renders (board renders, 24 Nov): eye level at named street points around the
// competition block, the protected viewpoints (the City's view-cone origins) looking at the design on the default Real
// Vancouver site, and one fixed axonometric. Pure: positions in the project's model frame (x east along the grid, y north
// along the grid, z up, metres), so the renderer (components/PresentRender.tsx) and the tests read the same numbers.
import { VTC_EDGES, VTC_SITE } from '../engine/publicRealm'
import { ALL_VIEWPOINTS, CONE_VIEWPOINTS, UTM_ORIGIN, type Viewpoint } from '../engine/silhouetteViewpoint'

export { ALL_VIEWPOINTS }
import { CONES, bisector, pointInRing } from '../engine/viewCones'

type P2 = [number, number]
type P3 = [number, number, number]

export interface PerspectiveShot { kind: 'perspective'; position: P3; target: P3; /** Vertical field of view (degrees). */ fov: number }
/** Parallel projection: `height` is the frame's height in metres. */
export interface AxoShot { kind: 'axo'; position: P3; target: P3; height: number }
export type Shot = PerspectiveShot | AxoShot

export interface PresentView {
  id: string
  label: string
  /** Which project the view is taken in: the competition block or Real Vancouver (the design on the default site). */
  project: 'vtc' | 'city'
  /** Scale figures (x, y in the model frame) standing on the ground, so eye-level views show people. */
  people?: P2[]
  note: string
}

/** Eye height above the pavement (research C04; the same 1.6 m as View from here). */
export const EYE = 1.6
const row = (id: string) => VTC_EDGES.find((e) => e.id === id)?.row ?? 20
const S = VTC_SITE
/** Far sidewalk of the retail high street (south): the property line less the right-of-way plus 2 m. */
const RETAIL_FAR = S.yMin - row('south') + 2
/** Near sidewalk, 2 m off the block's property line. */
const RETAIL_NEAR = S.yMin - 2

/** Eye-level views on the competition site. The block is 144.8 × 79.2 m, centred on the origin (brief p.15). */
export const STREET_VIEWS: (PresentView & { shot: PerspectiveShot })[] = [
  {
    id: 'retail-street-west', label: 'Retail high street, looking east along the frontage', project: 'vtc',
    note: 'From the far (south) sidewalk of the retail high street near the arterial corner, at 1.6 m eye height.',
    shot: { kind: 'perspective', position: [-62, RETAIL_FAR, EYE], target: [12, S.yMin, 26], fov: 64 },
    people: [[-50, RETAIL_FAR + 1.2], [-38, RETAIL_NEAR - 0.6], [-30, RETAIL_NEAR + 0.4], [-18, RETAIL_NEAR - 1], [-6, RETAIL_FAR + 0.6], [5, RETAIL_NEAR]],
  },
  {
    id: 'retail-street-east', label: 'Retail high street, looking west toward the station', project: 'vtc',
    note: 'From the far (south) sidewalk of the retail high street near the east corner, at 1.6 m eye height.',
    shot: { kind: 'perspective', position: [60, RETAIL_FAR, EYE], target: [-14, S.yMin, 26], fov: 64 },
    people: [[48, RETAIL_FAR + 1], [36, RETAIL_NEAR - 0.4], [26, RETAIL_NEAR + 0.5], [14, RETAIL_NEAR - 1.2], [2, RETAIL_FAR + 0.5]],
  },
  {
    id: 'transit-plaza', label: 'Transit plaza, looking at the block corner', project: 'vtc',
    note: 'From the transit plaza on the neighbouring block to the south-west (context "Transit plaza"), at 1.6 m eye height.',
    shot: { kind: 'perspective', position: [-118, -82, EYE], target: [-60, -30, 26], fov: 66 },
    people: [[-108, -76], [-104, -70], [-96, -62], [-86, -50], [-78, -44], [-74, -36]],
  },
  {
    id: 'north-plaza', label: 'Plaza across the north street, looking south', project: 'vtc',
    note: 'From the plaza north-west of the block, across the north (local) street, at 1.6 m eye height.',
    shot: { kind: 'perspective', position: [-52, 74, EYE], target: [4, S.yMax, 22], fov: 66 },
    people: [[-46, 68], [-40, 64], [-30, 57], [-20, S.yMax + 2], [-8, S.yMax + 1.5]],
  },
]

/** The fixed axonometric: from the south-west, the same direction as the ledger's delivery drawings (axo_render.cjs). */
export const AXO_DIR: P3 = [-1.0, -1.35, 0.95]
export function axoShot(top: number, aspect = 3 / 4): AxoShot {
  const h = Math.max(220, top * 1.25)
  const t: P3 = [0, 0, top * 0.46]
  const l = Math.hypot(...AXO_DIR), d = 2000
  // A frame wide enough for the block and its streets, whatever the tower's height.
  const height = Math.max(h, 300 / aspect)
  return { kind: 'axo', position: [t[0] + (AXO_DIR[0] / l) * d, t[1] + (AXO_DIR[1] / l) * d, t[2] + (AXO_DIR[2] / l) * d], target: t, height }
}
export const AXO_VIEW: PresentView = { id: 'axo', label: 'Axonometric from the south-west', project: 'vtc', note: 'Parallel projection, the same direction for every tower; frame height from the tallest tower (1.25 × top, at least 220 m).' }

/** Real Vancouver frame (EPSG:26910 less the local origin) of an EPSG:26910 point. */
export const cityFrame = ([e, n]: P2): P2 => [e - UTM_ORIGIN[0], n - UTM_ORIGIN[1]]

/**
 * From a protected viewpoint toward the tower: the eye at the City's view point (Lv read as the eye level, as the
 * viewpoint reading does), aimed at the tower's lower half, with a lens that makes the frame `frame` × the tower's
 * height tall at the tower (a telephoto at kilometres: about 7° from Queen Elizabeth Park for a 300 m tower).
 */
export function viewpointShot(vp: Viewpoint, centre: P2, ground: number, top: number, frame = 2.2): PerspectiveShot {
  const [x, y] = cityFrame(vp.at)
  const d = Math.hypot(centre[0] - x, centre[1] - y)
  const fov = (2 * Math.atan((frame * top) / 2 / d) * 180) / Math.PI
  return { kind: 'perspective', position: [x, y, vp.eye], target: [centre[0], centre[1], ground + top * 0.42], fov: Math.min(60, Math.max(1, fov)) }
}

/** Bearing (degrees clockwise from grid north) from a to b. */
export const bearing = (a: P2, b: P2) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360

/**
 * Protected viewpoints for a site, best first: Queen Elizabeth Park ('qe') always, then the viewpoints whose cone covers
 * the site, then the rest by how far (degrees) the site lies off the nearest of the viewpoint's cone centrelines, so the
 * "other" viewpoint is the one where the tower stands closest to a protected view. Site in EPSG:26910.
 */
export function viewpointsFor(site: P2, maxKm = 8): { vp: Viewpoint; inCone: boolean; offDeg: number; km: number }[] {
  const rows = CONE_VIEWPOINTS.map((vp) => {
    const cones = CONES.filter((c) => vp.cones.includes(c.id))
    const inCone = cones.some((c) => pointInRing(site, c.ring))
    const to = bearing(vp.at, site)
    const offDeg = Math.min(...cones.map((c) => { const [ux, uy] = bisector(c); const b = (Math.atan2(ux, uy) * 180) / Math.PI; const d = Math.abs(((to - b + 540) % 360) - 180); return d }))
    return { vp, inCone, offDeg, km: Math.hypot(site[0] - vp.at[0], site[1] - vp.at[1]) / 1000 }
  }).filter((r) => r.vp.id === 'qe' || r.km <= maxKm)
  const rank = (r: (typeof rows)[number]) => (r.vp.id === 'qe' ? 0 : r.inCone ? 1 : 2)
  return rows.sort((a, b) => rank(a) - rank(b) || a.offDeg - b.offDeg || a.km - b.km)
}

/** A view's file-safe id. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------- hero views in Real Vancouver (24 Nov)
// Candidate views for the board's main image: the design on the default Real Vancouver site seen from real places.
// Every camera position comes from the toolkit's own data, never placed by eye: a City view-cone origin (its Lv as the
// eye level), a street-centre-line crossing from the City's streets (public/data/city_streets.json), Vista's place label
// for Coal Harbour, or a stated bearing and distance from the tower (the aerial). The lens is set from how tall the frame
// should be at the tower (`frame` × its height); the aim from where the tower should sit in it (`aim`: the height on the
// tower, as a share of its height, at the frame's centre).

export type HeroFrom =
  | { kind: 'cone'; cone: string }
  | { kind: 'viewpoint'; id: string }
  | { kind: 'point'; at: P2; eyeAboveGround: number; source: string }
  | { kind: 'bearing'; bearing: number; distance: number; aboveGround: number }

export interface HeroView {
  id: string
  label: string
  from: HeroFrom
  /** Frame height at the tower, as a multiple of the tower's height (sets the lens). */
  frame: number
  /** Height on the tower (share of its height) at the frame's centre. */
  aim: number
  /** Horizontal offset of the aim point from the tower (m, model frame), to set the tower off centre. */
  shift?: P2
  /**
   * Walk from the given place in this direction (model frame, 10 m steps, up to 1.5 km) to the first point where the
   * drawn surface is the sea (at or below 0.3 m), and stand there: the water's edge, eye 1.6 m above the sea.
   */
  toWater?: P2
  note: string
}

const coneOrigin = (id: string): { at: P2; eye: number; name: string } | null => {
  const c = CONES.find((k) => k.id === id)
  return c ? { at: cityFrame(c.ring[0]), eye: c.Lv, name: c.name } : null
}

export const HERO_VIEWS: HeroView[] = [
  { id: 'charleson', label: 'From Charleson Seawall, across False Creek to the mountains', from: { kind: 'cone', cone: 'B1' }, frame: 2.1, aim: 0.5,
    note: 'South shore of False Creek, the origin of the City\'s protected views B1/B2 (Lv 4.48 m as the eye). Looks north over the water, the downtown skyline and the North Shore terrain.' },
  { id: 'olympic-pier', label: 'From the Olympic Village shipyard pier, across False Creek', from: { kind: 'cone', cone: 'G1' }, frame: 2.1, aim: 0.5,
    note: 'South-east shore of False Creek, the origin of the City\'s protected views G1/G2 (Lv 6 m). Looks north-west over the water and the skyline.' },
  { id: 'qe-park', label: 'From Queen Elizabeth Park, long lens', from: { kind: 'cone', cone: '3.2.3' }, frame: 2.0, aim: 0.55,
    note: 'The City\'s skyline viewpoint (protected views 3.2.1–3.2.4, Lv 124.6 m). A long lens: the city stacks up and the North Shore rises behind.' },
  { id: 'cambie-bridge', label: 'From the Cambie Bridge', from: { kind: 'cone', cone: 'E' }, frame: 2.0, aim: 0.5,
    note: 'On the Cambie Bridge, the origin of the City\'s protected view E (Lv 17.95 m). Looks north-west across the creek mouth into downtown.' },
  { id: 'lonsdale-quay', label: 'From Lonsdale Quay, across the inlet', from: { kind: 'viewpoint', id: 'lonsdale-quay' }, toWater: [0, -1], frame: 2.2, aim: 0.5,
    note: 'North Shore, across Burrard Inlet (the toolkit\'s named skyline viewpoint, an approximate team pick, eye about 5 m). Moved south to the edge of the water. Looks south-west at the downtown skyline; the mountains are behind the camera.' },
  { id: 'coal-harbour', label: 'From Coal Harbour, looking south', from: { kind: 'point', at: [-280.5, 1157.4], eyeAboveGround: 1.6, source: 'Vista place label "Coal Harbour" (public/data/vista_labels.json)' }, toWater: [0, 1], frame: 1.9, aim: 0.5,
    note: 'From the edge of the water north of the Coal Harbour label point, eye 1.6 m above the sea. Looks south-east into downtown; the mountains are behind the camera.' },
  { id: 'aerial-se', label: 'Low aerial from the south-east', from: { kind: 'bearing', bearing: 135, distance: 1400, aboveGround: 380 }, frame: 2.4, aim: 0.42,
    note: 'A drone-height view: 1.4 km south-east of the tower, 380 m above its ground. Looks north-west over downtown to the inlet and the North Shore.' },
  { id: 'pender-richards', label: 'Street level on West Pender at Richards', from: { kind: 'point', at: [455.3, 330.5], eyeAboveGround: 1.6, source: 'crossing of the RICHARDS ST and W PENDER ST centre lines (public/data/city_streets.json)' }, frame: 1.3, aim: 0.45,
    note: 'Two blocks south-east of the site along West Pender, 1.6 m eye height at the crossing of the street centre lines. Looks north-west along the street; the tower stands beside it.' },
]

/** A hero view's camera for the design centred at `centre` (city frame), its ground and height. `groundAt` reads the drawn surface. */
export function heroShot(v: HeroView, centre: P2, ground: number, top: number, groundAt: (p: P2) => number | null): (PerspectiveShot & { eyeNote: string }) | null {
  let at: P2, z: number, eyeNote: string
  if (v.from.kind === 'viewpoint') {
    const id = v.from.id
    const vp = ALL_VIEWPOINTS.find((x) => x.id === id)
    if (!vp) return null
    at = cityFrame(vp.at); z = vp.eye; eyeNote = `${vp.name} (${vp.kind === 'named' ? 'named viewpoint, approximate team pick' : 'City view-cone origin'}), eye ${vp.eye} m`
  } else if (v.from.kind === 'cone') {
    const o = coneOrigin(v.from.cone)
    if (!o) return null
    at = o.at; z = o.eye; eyeNote = `City view-cone ${v.from.cone} origin (${o.name}), eye at its Lv ${o.eye} m (geodetic)`
  } else if (v.from.kind === 'point') {
    at = v.from.at; const g = groundAt(at) ?? ground; z = g + v.from.eyeAboveGround; eyeNote = `${v.from.source}; ground ${g.toFixed(1)} m as drawn + ${v.from.eyeAboveGround} m`
  } else {
    const b = (v.from.bearing * Math.PI) / 180
    at = [centre[0] + v.from.distance * Math.sin(b), centre[1] + v.from.distance * Math.cos(b)]; z = ground + v.from.aboveGround
    eyeNote = `${v.from.bearing}° (grid) and ${v.from.distance} m from the tower, ${v.from.aboveGround} m above its ground`
  }
  if (v.toWater) {
    const l = Math.hypot(...v.toWater) || 1
    for (let k = 0; k <= 150; k++) {
      const q: P2 = [at[0] + (v.toWater[0] / l) * 10 * k, at[1] + (v.toWater[1] / l) * 10 * k]
      const g = groundAt(q)
      if (g != null && g <= 0.3) { at = q; z = Math.max(0, g) + EYE; eyeNote += `; walked ${10 * k} m to the water's edge, eye 1.6 m above the sea`; break }
    }
  }
  const aimXY: P2 = [centre[0] + (v.shift?.[0] ?? 0), centre[1] + (v.shift?.[1] ?? 0)]
  const d = Math.hypot(aimXY[0] - at[0], aimXY[1] - at[1])
  const fov = (2 * Math.atan((v.frame * top) / 2 / d) * 180) / Math.PI
  return { kind: 'perspective', position: [at[0], at[1], z], target: [aimXY[0], aimXY[1], ground + top * v.aim], fov: Math.min(75, Math.max(1, fov)), eyeNote }
}

/**
 * Looking up at the tower from the street (Board 4): eye 1.6 m at `from`, turned toward the tower's centre and pitched up
 * by `pitch` degrees; `fov` is the vertical field of view (a portrait frame shows the street at the bottom and the top of
 * the tower near the top).
 */
export function upShot(from: P2, eyeZ: number, toward: P2, pitch = 43, fov = 96): PerspectiveShot {
  const dx = toward[0] - from[0], dy = toward[1] - from[1], l = Math.hypot(dx, dy) || 1
  const r = (pitch * Math.PI) / 180, k = 10
  return { kind: 'perspective', position: [from[0], from[1], eyeZ], target: [from[0] + (dx / l) * k * Math.cos(r), from[1] + (dy / l) * k * Math.cos(r), eyeZ + k * Math.sin(r)], fov }
}

/**
 * Board 4's street camera on the competition site: the far (south) sidewalk of the retail high street, west of the
 * middle of the block (about 110 m from a tower on the east half), the same point for every tower; it turns to the tower.
 */
export const BOARD4_FROM: P2 = [-56, S.yMin - row('south') + 3.5]
/** Figures in front of the Board 4 camera (model frame, competition site), on the block's own sidewalk and the far one. */
export const BOARD4_PEOPLE: P2[] = [[-38, S.yMin - 2.8], [-30, S.yMin - 2.2], [-20, S.yMin - 1.8], [-12, S.yMin - 2.5], [-47, S.yMin - row('south') + 5]]
