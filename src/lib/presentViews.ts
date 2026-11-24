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
