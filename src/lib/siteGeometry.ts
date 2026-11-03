// The site boundary and the parcels a tower snaps to, per project, in the project's local frame (m). One small store
// that the site tools write and the tower gizmo reads (lib/towerEdit.ts, lib/proposalCheck.ts), so neither imports the
// other.
//
// HOOK for the "Integrate Vista" session (items 2–4 on 3 Nov: draw a site, pick buildings as the site, match parcels):
// when Real Vancouver gets a site, call setSiteBoundary('city', { ring, label, flag, source }); when parcels are
// matched under it, call setSiteParcels('city', rings). Until then Real Vancouver has no site boundary (the confirm
// card says so) and snapping falls back to the City parcel layer (public/data/parcels.bin) around the tower.
import { create } from 'zustand'
import { rectCorners } from '../engine/massing'
import type { Flag } from '../engine/types'
import { SITE } from '../engine/vtcRules'
import { decodeFootprints } from './cityLayers'
import type { Pt, SnapTarget } from './edgeSnap'

type Project = 'vtc' | 'city'

export interface SiteBoundary {
  /** Closed outline (first point not repeated), project frame, m. */
  ring: Pt[]
  /** What the boundary is, e.g. "Drawn study boundary" or "Parcels 012-345-678 + 1". */
  label: string
  flag: Flag
  source: string
}

interface SiteGeometry {
  site: Record<Project, SiteBoundary | null>
  /** Parcel outlines matched to the site by the site tools; null = none supplied (snapping uses the City layer). */
  parcels: Record<Project, Pt[][] | null>
}

/** The competition block exactly as the containment rule reads it (engine/vtcRules SITE), centred on the model origin. */
export const VTC_SITE: SiteBoundary = {
  ring: rectCorners(0, 0, SITE.width, SITE.depth, 0),
  label: 'Competition block, 144.8 m × 79.2 m',
  flag: 'team_assumption',
  source: 'Vancouver Tall Challenge brief (Buildner 2026) p.15, site "approximately 79.2 m × 144.8 m"',
}

export const useSiteGeometry = create<SiteGeometry>(() => ({ site: { vtc: VTC_SITE, city: null }, parcels: { vtc: null, city: null } }))

export function setSiteBoundary(project: Project, boundary: SiteBoundary | null) {
  useSiteGeometry.setState((s) => ({ site: { ...s.site, [project]: boundary } }))
}

export function setSiteParcels(project: Project, rings: Pt[][] | null) {
  useSiteGeometry.setState((s) => ({ parcels: { ...s.parcels, [project]: rings } }))
}

// ---------- the City parcel layer, for snapping (the Context layers panel draws the same file) ----------

interface Boxed { ring: Pt[]; x0: number; y0: number; x1: number; y1: number }
const box = (ring: Pt[]): Boxed => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { ring, x0, y0, x1, y1 }
}

let cityParcels: Boxed[] | null = null
let loading: Promise<void> | null = null

/** Fetch the City parcel outlines once (140 kB). Snapping works without them; it just has fewer lines to catch. */
export function loadCityParcels(): Promise<void> {
  loading ??= fetch('./data/parcels.bin')
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`parcels.bin: HTTP ${r.status}`))))
    .then((b) => { cityParcels = decodeFootprints(b).map((f) => box(f.outer)) })
    .catch(() => { loading = null })
  return loading
}

/** For tests: supply the City parcel outlines directly. */
export function setCityParcelsForTest(rings: Pt[][] | null) { cityParcels = rings ? rings.map(box) : null }

/** Lines to snap to within `r` of (x, y): the site boundary first, then parcels (the site tools' own, else the City layer). */
export function snapTargets(project: Project, x: number, y: number, r: number): SnapTarget[] {
  const g = useSiteGeometry.getState()
  const near = (b: Boxed) => b.x1 >= x - r && b.x0 <= x + r && b.y1 >= y - r && b.y0 <= y + r
  const out: SnapTarget[] = []
  const site = g.site[project]
  if (site && near(box(site.ring))) out.push({ ring: site.ring, kind: 'site' })
  const own = g.parcels[project]
  const parcels = own ? own.map(box) : project === 'city' ? cityParcels ?? [] : []
  for (const p of parcels) if (near(p)) out.push({ ring: p.ring, kind: 'parcel' })
  return out
}
