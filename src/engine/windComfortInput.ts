// What the wind comfort port (windComfort.ts, Sinnie Choi's engine) is given from the Toolkit's model, and the
// evidence lines it returns. The engine works in her frame: a 680 × 440 m domain centred on the site origin, 4 m cells,
// +y = her north. Competition site: the domain's origin is the block centre, as in her site.json (the same base model),
// so the context buildings, heritage, plazas, mid-block links and the three future towers go in as they are. Real
// Vancouver: the domain is centred on the selected tower; the City buildings within it go in at their height above the
// project's ground; footprints without a height in any source are counted, never given one (the project's data rule).
import type { VtcContext } from '../context'
import type { Footprint, FootprintHeights } from '../lib/cityLayers'
import { earClip } from '../lib/coneVolume'
import { towerFootprint } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { BANDS, WIND_GRID, type FutureBox, type ObstacleMesh, type WindStrategy, type WindStudyResult, type WindTower } from './windComfort'

export type P = [number, number]

/** A flat face at height z over a plan ring, as one of her meshes (counter-clockwise triangles so its area counts as footprint). */
function faceMesh(ring: P[], z: number, layer: string): ObstacleMesh | null {
  const poly = ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  if (poly.length < 3) return null
  const v: number[] = [], f: number[] = []
  for (const [x, y] of poly) v.push(x, y, z)
  for (const [a, b, c] of earClip(poly)) f.push(a, b, c)
  return { layer, v, f, top: z }
}

export interface WindObstacles {
  meshes: ObstacleMesh[]
  futures: FutureBox[] | null
  plazaMeshes: ObstacleMesh[]
  /** Real Vancouver: footprints in the domain with no height in any source (left out, reported). */
  unknownHeights: number
  /** Where the obstacles came from, for the evidence lines. */
  source: Source
  loaded: boolean
}

export const SRC = {
  engine: { label: 'Sun & Wind Studio, Sinnie Choi (study.js, core.js at c24addb, 16 Nov 2026): 2-D lattice-Boltzmann pedestrian flow, ported with her method and constants', url: 'https://github.com/xubynii/sun-wind-studio' },
  rose: { label: 'CWEC2020 typical year, Vancouver Intl AP (WMO 718920), climate.onebuilding.org, as distilled by Sun & Wind Studio (weather.json: monthly 8-sector roses)', url: 'https://climate.onebuilding.org/' },
  lawson: { label: 'Lawson comfort criteria as applied in Sun & Wind Studio: sitting ≤ 2.5, standing ≤ 4, strolling ≤ 6, walking ≤ 8 m/s mean; no edition cited there (unverified)' },
  vtc: { label: 'Vancouver Tall Challenge base model (Buildner), derived context: neighbours, heritage, plazas, mid-block links, future towers' },
  city: { label: 'City of Vancouver building footprints 2015 with LiDAR 2022 heights where measured, else OpenStreetMap via Vista (heights by source, unverified)' },
  team: { label: 'Team mapping (Ruijie, 16 Nov 2026): the Toolkit podium as her uniform podium reach; canopy, corners and plaza shelter as node presets' },
} satisfies Record<string, Source>

/** Competition site: her site.json layers from the Toolkit's own derived context (the same base model). */
export function vtcObstacles(ctx: VtcContext | null, showFuture: boolean): WindObstacles {
  if (!ctx) return { meshes: [], futures: null, plazaMeshes: [], unknownHeights: 0, source: SRC.vtc, loaded: false }
  const meshes: ObstacleMesh[] = []
  const add = (items: VtcContext['buildings'], layer: string) => {
    for (const b of items) {
      if ('footprint' in b) { const m = faceMesh(b.footprint, b.z1, layer); if (m) meshes.push(m) }
      else {
        let top = 0
        for (let i = 2; i < b.positions.length; i += 3) top = Math.max(top, b.positions[i])
        meshes.push({ layer, v: b.positions, f: b.indices, top })
      }
    }
  }
  add(ctx.buildings, 'existing')
  add(ctx.heritage, 'heritage')
  const futures = showFuture ? ctx.future_towers.filter((f) => f.z1 != null).map((f) => ({ pts: f.footprint, base: f.z0, top: f.z1 as number })) : null
  const plazaMeshes: ObstacleMesh[] = []
  for (const m of ctx.plazas) plazaMeshes.push({ layer: 'plaza', v: m.positions, f: m.indices, top: 0 })
  for (const m of ctx.midblock) plazaMeshes.push({ layer: 'midblock', v: m.positions, f: m.indices, top: 0 })
  return { meshes, futures, plazaMeshes, unknownHeights: 0, source: SRC.vtc, loaded: true }
}

/**
 * Real Vancouver: the City buildings whose outline touches the domain around `centre` (project frame), each as a flat
 * roof at its height above `groundElevation` (the towers' base), shifted so the domain is centred on the tower.
 */
export function cityObstacles(footprints: Footprint[], heights: FootprintHeights | null, hidden: ReadonlySet<number>, centre: P, groundElevation: number): WindObstacles {
  const meshes: ObstacleMesh[] = []
  let unknown = 0
  const { xmin, xmax, ymin, ymax } = WIND_GRID
  footprints.forEach((fp, i) => {
    if (hidden.has(i)) return
    let inside = false
    for (const [x, y] of fp.outer) { const u = x - centre[0], v = y - centre[1]; if (u >= xmin && u <= xmax && v >= ymin && v <= ymax) { inside = true; break } }
    if (!inside) return
    const g = heights?.ground[i] ?? NaN, r = heights?.roof[i] ?? NaN
    if (!Number.isFinite(g) || !Number.isFinite(r) || r <= g) { unknown++; return }
    const top = r - groundElevation
    if (top < 3) return
    const m = faceMesh(fp.outer.map(([x, y]) => [x - centre[0], y - centre[1]] as P), top, 'existing')
    if (m) meshes.push(m)
  })
  return { meshes, futures: null, plazaMeshes: [], unknownHeights: unknown, source: SRC.city, loaded: !!heights }
}

/** The other design towers as obstacles (her role "context"), relative to `centre`. */
export function towerObstacles(towers: Tower[], centre: P): ObstacleMesh[] {
  const out: ObstacleMesh[] = []
  for (const t of towers) {
    const ring = towerFootprint(t, t.podiumHeight > 0).map(([x, y]) => [x - centre[0], y - centre[1]] as P)
    const m = faceMesh(ring, t.height, 'design')
    if (m) out.push(m)
  }
  return out
}

/** The selected tower in her terms, relative to `centre`: its plan outline (rotated box or imported hull), size, turn and height. */
export function windTowerOf(t: Tower, centre: P): WindTower {
  const footprint = towerFootprint(t).map(([x, y]) => [x - centre[0], y - centre[1]] as P)
  return { w: t.width, d: t.depth, cx: t.x - centre[0], cy: t.y - centre[1], rot: (t.rotation * Math.PI) / 180, height: t.height, footprint }
}

export interface WindPresets {
  annual: boolean
  /** One case: the wind from this bearing (degrees from her north, +y) at this speed (m/s at 10 m). */
  dir: number
  speed: number
  period: { from: string; to: string }
  /** Strategies beyond the model's own podium (her SW.ws): canopy depth (m), corner treatment, plaza shelter 0..1. */
  canopy: number
  corners: WindStrategy['corners']
  shelter: number
  /** Count the three future towers of the competition model. */
  future: boolean
}
export const DEFAULT_WIND_PRESETS: WindPresets = { annual: false, dir: 270, speed: 4.5, period: { from: '01-01', to: '12-31' }, canopy: 0, corners: 'sharp', shelter: 0, future: true }

/** Her strategies from the tower's podium (team mapping: the podium's smaller overhang beyond the tower) and the presets; null when none applies. */
export function strategyOf(t: Tower, p: WindPresets): WindStrategy | null {
  const ext = t.podiumHeight > 0 ? Math.max(0, Math.min((t.podiumWidth - t.width) / 2, (t.podiumDepth - t.depth) / 2)) : 0
  const s: WindStrategy = { podiumH: ext > 0 ? t.podiumHeight : 0, podiumExt: ext, canopy: p.canopy, corners: p.corners, shelter: p.shelter }
  return s.podiumH > 0 || s.canopy > 0 || s.corners !== 'sharp' || s.shelter > 0 ? s : null
}

// ---------------------------------------------------------------------------------------------- evidence lines

export interface WindReadings {
  /** Share of open ground calm enough to sit or stand (Lawson ≤ 4 m/s), with the tower. */
  calm: number
  calmBefore: number
  uncomfortable: number
  total: number
  plazaWorst: number
  plazaMean: number
  hasPlaza: boolean
  worse: number
  better: number
  gustyShare: number
  gustyBeforeShare: number
}
export function readingsOf(r: WindStudyResult, plazaCells: number): WindReadings {
  const total = r.cats.reduce((a, b) => a + b, 0) || 1
  return {
    calm: (r.cats[0] + r.cats[1]) / total, calmBefore: (r.catsB[0] + r.catsB[1]) / total, uncomfortable: r.cats[4] / total, total,
    plazaWorst: r.plazaWorst, plazaMean: r.plazaMean, hasPlaza: plazaCells > 0, worse: r.worse, better: r.better,
    gustyShare: r.annual ? r.gusty / total : 0, gustyBeforeShare: r.annual ? r.gustyB / total : 0,
  }
}

const pc = (v: number) => `${Math.round(v * 100)}%`
const m2 = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

export interface WindRuleInput { readings: WindReadings; result: WindStudyResult; obstacles: Pick<WindObstacles, 'loaded' | 'unknownHeights' | 'source'>; presets: WindPresets; towerName: string }

/** Her key results as the Toolkit's evidence lines (study.js keyItems: calm ground ≥ 80% good, ≥ 60% fair; plaza peak ≤ 4 / ≤ 6 m/s; no uncomfortable ground). */
export function windRules(i: WindRuleInput): RuleResult[] {
  const { readings: r, result: res, presets: p } = i
  const caseNote = p.annual ? `${res.period?.label ?? 'period'}: eight sectors of the seasonal rose, frequency-weighted mean speed` : `wind from ${p.dir}° at ${p.speed} m/s at 10 m`
  const method: Flag = 'unverified'
  const out: RuleResult[] = []
  const contextNote = i.obstacles.loaded ? (i.obstacles.unknownHeights ? `${i.obstacles.unknownHeights} buildings in the domain have no height and are left out (never guessed).` : undefined) : 'No context buildings loaded: the tower stands on open ground, so the result is optimistic.'
  out.push(rule('calm-ground', `Ground calm enough to stand (${i.towerName})`, `${pc(r.calm)} of open ground (was ${pc(r.calmBefore)} without the tower)`, '≥ 80% in the sitting or standing bands good; ≥ 60% fair; below poor (her thresholds)',
    !i.obstacles.loaded ? 'unknown' : r.calm >= 0.8 ? 'pass' : r.calm >= 0.6 ? 'warn' : 'fail', method, SRC.lawson, `${caseNote}. Lawson bands on the mean pedestrian-level speed of her 2-D flow. ${contextNote ?? ''}`.trim()))
  out.push(rule('plaza-peak', 'Plaza peak wind', r.hasPlaza ? `${r.plazaWorst.toFixed(1)} m/s (mean over the plazas ${r.plazaMean.toFixed(1)} m/s)` : 'no plaza or mid-block link in the model', '≤ 4 m/s sitting and standing; ≤ 6 strolling; above 8 uncomfortable',
    !r.hasPlaza || !i.obstacles.loaded ? 'unknown' : r.plazaWorst <= 4 ? 'pass' : r.plazaWorst <= 6 ? 'warn' : 'fail', method, SRC.lawson, r.hasPlaza ? 'The windiest cell on the plazas and mid-block links of the competition context.' : 'Real Vancouver has no plaza layer in this check yet.'))
  out.push(rule('uncomfortable', 'Uncomfortable ground', `${pc(r.uncomfortable)} of open ground over 8 m/s`, 'none (≤ 1%)', !i.obstacles.loaded ? 'unknown' : r.uncomfortable <= 0.01 ? 'pass' : 'fail', method, SRC.lawson, 'Over 8 m/s mean is uncomfortable for any use; there should be none near entrances.'))
  out.push(rule('worse-better', 'Ground made windier or calmer by the tower', `${m2(r.worse)} worse, ${m2(r.better)} calmer`, 'reported, not judged', 'unknown', method, SRC.engine, 'Cells that change Lawson band against the site without the tower.'))
  if (res.annual) out.push(rule('gusty', 'Gusty ground', `${pc(r.gustyShare)} (was ${pc(r.gustyBeforeShare)})`, 'reported, not judged', 'unknown', method, SRC.engine, 'Open ground where the gust (1.8 × mean) tops 6 m/s in more than 5% of hours.'))
  const z = res.a.zone
  if (z) out.push(rule('downwash', 'Downwash allowance', `${z.amp.toFixed(2)}× within ${z.depth.toFixed(0)} m of the windward face${z.note.length ? ` (${z.amp0.toFixed(2)}× before the ${z.note.join(' and ')})` : ''}`, 'reported, not judged', 'unknown', method, SRC.engine, `The tower against the mean roof of its neighbours within 120 m (${z.hn.toFixed(0)} m): her allowance 1 + 0.45 log2(H/hn), at most 2.1×, tapered over 0.22 H upwind.`))
  if (res.vsBase) out.push(rule('strategies', 'Wind strategies', `${m2(res.vsBase.better)} calmer, ${m2(res.vsBase.worse)} windier than the bare tower`, 'reported, not judged', 'unknown', 'team_assumption', SRC.team, `Podium ${res.strat?.podiumH ?? 0} m reaching ${res.strat?.podiumExt ?? 0} m, canopy ${res.strat?.canopy ?? 0} m, ${res.strat?.corners ?? 'sharp'} corners, plaza shelter ${pc(res.strat?.shelter ?? 0)}.`))
  out.push(rule('method', 'Method', 'two-dimensional lattice-Boltzmann flow at pedestrian level, 4 m cells', 'indicative, not CFD', 'unknown', method, SRC.engine, 'Shows where the massing accelerates or shelters the wind, not absolute values (her note). A wind-tunnel study by a wind engineer settles it. Rose: ' + SRC.rose.label))
  return out
}

/** The bands' colours as her app draws them (study.js BAND_COL), for the overlay and the card. */
export const BAND_COLOURS = ['#3E8E7E', '#8FC17A', '#E3C25C', '#E08A3C', '#B8362B'] as const
export const BAND_NAMES = BANDS
