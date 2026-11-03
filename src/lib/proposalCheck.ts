// What a proposed tower position would mean, before it is confirmed (Vista v10.1 "confirm before placing"): the
// footprint, whether it fits the site, and its view-cone overlap. Pure, and built from the existing checks (vtcRules
// containment, the tower cone check behind useResults), so every line keeps its evidence flag. Nothing here touches
// the store.
import { rectCorners, towerFootprint, towerMasses } from '../engine/massing'
import { checkTowerCones } from '../engine/towerCones'
import type { Flag, RuleState, Tower } from '../engine/types'
import { CITY_ORIGIN } from '../store'
import { edgeDistance, overall, pointInRing, type ConeCheck, type ConeState } from '../engine/viewCones'
import { vtcRules, type FsrTier } from '../engine/vtcRules'
import type { Pt } from './edgeSnap'
import type { SiteBoundary } from './siteGeometry'
import type { Pose } from './towerEdit'

export interface FitLine { id: 'site' | 'land'; state: RuleState; text: string; flag: Flag; source: string }

export interface ProposalReport {
  /** Plan outline at the proposed pose (project frame). */
  footprint: Pt[]
  /** Tower base at the proposed pose (m): 0 on the competition site, the terrain or the hand-set base in Real Vancouver. */
  base: number
  baseNote: string
  fit: FitLine[]
  /** Real Vancouver only: every protected view cone against the proposed footprint and top. */
  cones: ConeCheck[]
  overall: ConeState | null
}

export interface ProposalInput {
  project: 'vtc' | 'city'
  tower: Tower
  pose: Pose
  site: SiteBoundary | null
  ground: {
    mode: 'terrain' | 'manual'
    elevation: number
    /** Terrain under a plan outline (cityLayers.groundUnder over the loaded grids), or null before the terrain loads. */
    under: ((corners: Pt[]) => { value: number; min: number; max: number } | null) | null
  }
  rules: { fsrTier: FsrTier; transitLink: boolean }
}

const TERRAIN = 'City LiDAR 2022 ground (1 m) where available, NRCan MRDEM-30 elsewhere; CGVD28'
const round1 = (v: number) => Math.round(v * 10) / 10

export function proposalReport({ project, tower, pose, site, ground, rules }: ProposalInput): ProposalReport {
  const t: Tower = { ...tower, ...pose }
  const footprint = towerFootprint(t)
  // Every stacked block (or the imported hull), as the containment and cone checks see the tower.
  const outlines = towerMasses(t).map((m) => m.ring as Pt[])
  const fit: FitLine[] = []

  if (project === 'vtc') {
    // The competition rule itself, run on this tower alone.
    const r = vtcRules([t], rules).find((x) => x.id === 'containment')
    if (r) fit.push({ id: 'site', state: r.state, text: r.state === 'pass' ? 'Inside the competition block' : `${r.value} (${r.threshold})`, flag: r.flag, source: `${r.source.label}, ${r.source.page ?? ''}` })
    return { footprint, base: 0, baseNote: 'Site grade (0 m, the competition model has no datum)', fit, cones: [], overall: null }
  }

  // Real Vancouver: the base follows the terrain under the proposed footprint (as it will after the move), or is set by hand.
  // Same corners as the base follow-up in CityContext (the shaft rectangle).
  const under = ground.under ? ground.under(rectCorners(t.x, t.y, t.width, t.depth, t.rotation)) : null
  const following = ground.mode === 'terrain' && under
  const base = following ? round1(under.value) : ground.elevation
  const baseNote = following ? `Terrain under the footprint, ${round1(under.min)}–${round1(under.max)} m` : ground.mode === 'manual' ? 'Base set by hand' : 'Terrain not loaded yet: current base'

  if (site) {
    const corners = outlines.flat()
    const closed = [...site.ring, site.ring[0]]
    const out = corners.filter((p) => !pointInRing(p, site.ring))
    const by = out.length ? Math.max(...out.map((p) => edgeDistance(p, closed))) : 0
    fit.push(out.length
      ? { id: 'site', state: 'fail', text: `Extends past the site by up to ${by.toFixed(1)} m (${site.label})`, flag: site.flag, source: site.source }
      : { id: 'site', state: 'pass', text: `Inside the site (${site.label})`, flag: site.flag, source: site.source })
  } else {
    fit.push({ id: 'site', state: 'unknown', text: 'No site boundary for Real Vancouver yet (the site tools will supply one)', flag: 'unresolved', source: 'lib/siteGeometry.ts: no site set for this project' })
  }
  const land = ground.under ? ground.under(outlines.flat()) : null
  fit.push(!land
    ? { id: 'land', state: 'unknown', text: 'No terrain under the footprint yet', flag: 'unresolved', source: TERRAIN }
    : land.min <= 0
      ? { id: 'land', state: 'fail', text: `Partly over water: terrain down to ${round1(land.min)} m (0 m or below is water)`, flag: 'unverified', source: TERRAIN }
      : { id: 'land', state: 'pass', text: `On land: terrain ${round1(land.min)}–${round1(land.max)} m`, flag: 'unverified', source: TERRAIN })

  // The same check as Results & evidence (useResults), on the base the tower would get here.
  const cones = checkTowerCones(t, base, CITY_ORIGIN)
  return { footprint, base, baseNote, fit, cones, overall: overall(cones) }
}
