// Higher Buildings area and ceiling (book node #1 "built.hbp-area", 21 Nov 2026): a fix to Relaxations & aviation and to
// the energy node's en-hbp-height line. Read from the Higher Buildings Policy (rev. 31 Mar 2026) pp.3–5, as summarised in
// 04 Tool Plan/vtc-entry/research/books/hbp-dobson-report.md:
// - Higher buildings only inside the Figure 1 areas (p.3, 2.1(b)): the tower footprint against the digitized policy area
//   (src/data/higherBuildings.json, the City's May 2026 exhibit map; boundary not yet checked against Figure 1).
// - Each area's ceiling from the Figure 1 legend (p.5): the CBD up to the view corridors, else up to 600 ft; shoulders of
//   550 and 500 ft; identified sites of about 400–700 ft (2.1(c)–(d)). The legend is low resolution, read by eye, and the
//   part-to-ceiling mapping below is provisional: unverified, for a person to confirm with Figure 1 open.
// - The Queen Elizabeth Park view (View 3, cones 3.2.x) may be entered only inside the CBD outline (p.5 legend).
// - About 700 ft only on a site fronting W Georgia, Burrard or Granville (2.1(c), which itself says "about").
// Membership is not approval; the City decides at rezoning.
import data from '../data/higherBuildings.json'
import { towerFootprint } from './massing'
import { siteRelation, toLocal, type PolicyPart, type SiteRelation } from './policyArea'
import { distanceToRing, normalizeRing, overlapArea, type Pt } from './site'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'

export const HBP_SOURCE: Source = { label: 'City of Vancouver, Higher Buildings Policy (rev. 31 Mar 2026)', url: 'https://guidelines.vancouver.ca/policy-higher-buildings-for-rezonings.pdf' }
/** EPSG:26910 origin of the parts' local frame (CITY_ORIGIN in store.ts; lib/higherBuildings.ts uses the same). */
export const HBP_ORIGIN: [number, number] = [491300, 5458600]
export const FT = 0.3048
/** The CBD figure where no view corridor binds (Figure 1 legend, p.5): the highest area ceiling. */
export const HBP_CBD_FT = 600

export const HBP_PARTS: PolicyPart[] = data.layers[0].parts.map((p) => ({
  id: p.id, label: p.label, sizeClass: p.sizeClass as PolicyPart['sizeClass'], areaM2: p.areaM2, toleranceM: p.toleranceM,
  ring: toLocal(p.ring, HBP_ORIGIN),
}))

export interface PartCeiling { ft: number; basis: string; cbd?: boolean }
/** Provisional mapping of the digitized parts to the Figure 1 legend (hbp-dobson-report §4 P1): unverified. */
export const HBP_CEILINGS: Record<string, PartCeiling> = {
  'hbp-current-01': { ft: 600, basis: 'CBD outline: up to the view corridors, else up to 600 ft', cbd: true },
  'hbp-current-02': { ft: 550, basis: 'shoulder, likely 550 ft' },
  'hbp-current-03': { ft: 500, basis: 'shoulder, likely 500 ft' },
  'hbp-current-04': { ft: 550, basis: 'shoulder, 550 ft' },
  'hbp-current-05': { ft: 500, basis: 'shoulder, likely 500 ft' },
  'hbp-current-06': { ft: 500, basis: 'Burrard Bridge site, about 500 ft' },
  'hbp-current-07': { ft: 515, basis: 'Georgia Gateway West, about 515 ft' },
  'hbp-current-08': { ft: 700, basis: 'possibly the identified site of about 700 ft (2.1(c))' },
  'hbp-current-09': { ft: 500, basis: 'Burrard Bridge site, about 500 ft' },
  'hbp-current-10': { ft: 425, basis: 'Granville gateway, about 425 ft' },
  'hbp-current-11': { ft: 425, basis: 'Granville gateway, about 425 ft' },
  'hbp-current-12': { ft: 425, basis: 'Georgia Gateway, about 400–425 ft (the upper figure used)' },
  'hbp-current-13': { ft: 425, basis: 'Georgia Gateway, about 400–425 ft (the upper figure used)' },
  'hbp-current-14': { ft: 425, basis: 'Georgia Gateway, about 400–425 ft (the upper figure used)' },
}

/** Where the footprint stands: the geographic relationship, or 'assumed' on the competition site (no real policy area). */
export type HbpWhere = SiteRelation | 'assumed'
export interface HbpReading {
  where: HbpWhere
  /** The part holding most of the footprint, else the nearest part (null on the competition site). */
  part: { id: string; label: string; ceiling: PartCeiling } | null
  /** Distance to the nearest part (m); 0 when they meet. */
  nearestM: number | null
  /** Share of the footprint inside the drawn area (0–1). */
  share: number | null
  /** May the route enter QE View 3 here: only with the whole footprint inside the CBD outline. */
  qe3: 'yes' | 'no' | 'uncertain'
  /** How far the footprint's outline lies beyond the nearest part's tolerance band (m; ≤ 0 = in the band or across the edge). */
  clearOfBandM: number | null
}

/** Node contract (21 Nov): lines within this distance of a part's band, or this share of a ceiling, need the City's map (team assumption). */
export const NEAR_EDGE_M = 5
export const NEAR_CEILING = 0.05

/** The footprint (the parts' local frame) against the policy area; null = the competition site. */
export function hbpReading(footprint: Pt[] | null): HbpReading {
  if (!footprint) return { where: 'assumed', part: null, nearestM: null, share: null, qe3: 'uncertain', clearOfBandM: null }
  const ring = normalizeRing(footprint)
  const rel = siteRelation(ring, HBP_PARTS)
  let best: PolicyPart | null = null, bestA = 0
  for (const p of HBP_PARTS) { const a = overlapArea(ring, [p.ring]); if (a > bestA) { bestA = a; best = p } }
  const pick = best ?? HBP_PARTS.find((p) => p.id === rel.nearest?.id) ?? null
  const part = pick ? { id: pick.id, label: pick.label, ceiling: HBP_CEILINGS[pick.id] } : null
  const cbd = part?.ceiling.cbd === true
  const qe3 = cbd && rel.relation === 'within' ? 'yes' : cbd && rel.relation !== 'outside' ? 'uncertain' : 'no'
  // The outline sampled every 1 m against every part's edge, less that part's band.
  let clear = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])))
    for (let k = 0; k < n; k++) {
      const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]
      for (const p of HBP_PARTS) clear = Math.min(clear, distanceToRing(q, p.ring) - p.toleranceM)
    }
  }
  return { where: rel.relation, part, nearestM: rel.nearest?.distanceM ?? null, share: rel.share, qe3, clearOfBandM: rel.relation === 'overlapping' ? Math.min(0, clear) : clear }
}

/** Why a line needs the City's map: the footprint near the digitized edge (node contract); undefined otherwise. */
export function edgeSpecialist(r: HbpReading): string | undefined {
  if (r.where === 'assumed' || r.clearOfBandM === null || r.clearOfBandM > NEAR_EDGE_M) return undefined
  return r.clearOfBandM <= 0
    ? 'The footprint reaches the band around the digitized edge or crosses it: check it on the City’s Figure 1 map.'
    : `The footprint lies within ${NEAR_EDGE_M} m of the band around the digitized edge: check it on the City’s Figure 1 map.`
}
/** Why a ceiling line needs the City's figure: the top within 5% of a ceiling read from a low-resolution legend. */
export function ceilingSpecialist(topFt: number, ceilingFt: number, typed = false): string | undefined {
  if (typed || Math.abs(topFt - ceilingFt) > NEAR_CEILING * ceilingFt) return undefined
  return `The top is within ${Math.round(NEAR_CEILING * 100)}% of a ceiling read from a low-resolution legend: confirm the figure on the City’s Figure 1.`
}

/** A tower's footprint in the parts' frame: project coordinates plus the project origin, less the parts' origin. */
export function hbpFootprint(t: Tower, origin: readonly [number, number]): Pt[] {
  return towerFootprint(t).map(([x, y]) => [x + origin[0] - HBP_ORIGIN[0], y + origin[1] - HBP_ORIGIN[1]] as Pt)
}

export interface HbpOptions {
  /** The Higher Buildings route is switched on (Details › Relaxations). */
  routeOn: boolean
  /** A typed site-specific ceiling (ft), e.g. a Council-approved figure; null = the area's. */
  ceilingFt: number | null
  /** Names of the site's streets (the study site's frontages), or null while unknown. */
  streets: string[] | null
}

/** The ceiling in use and its basis, or null where none applies (outside the area, no typed value). */
export function hbpCeiling(r: HbpReading, typedFt: number | null): { ft: number; basis: string; flag: Flag; typed: boolean } | null {
  if (typedFt !== null && typedFt > 0) return { ft: typedFt, basis: 'the site-specific ceiling you typed', flag: 'unverified', typed: true }
  if (r.where === 'assumed') return { ft: HBP_CBD_FT, basis: 'assumed CBD site: up to the view corridors, else up to 600 ft', flag: 'team_assumption', typed: false }
  if (r.where === 'outside' || !r.part) return null
  return { ft: r.part.ceiling.ft, basis: r.part.ceiling.basis, flag: 'unverified', typed: false }
}

const PRIMARY = /\b(W(EST)?\s+)?GEORGIA\b|\bBURRARD\b|\bGRANVILLE\b/i
const r1 = (v: number) => Math.round(v * 10) / 10
const NOT_APPROVAL = 'Membership is not approval: the City decides at rezoning.'
const BOUNDARY = 'Rule text verified (HBP p.3, 2.1(b)); the boundary is the City\'s May 2026 exhibit map digitized by the Toolkit (10–40 m bands), not yet checked against Figure 1: unverified.'
const CEILINGS_NOTE = 'The 600 / 550 / 500 ft ceilings are a visual read of Figure 1\'s low-resolution legend and the part mapping is provisional: unverified, for a person to confirm with Figure 1 open. In the CBD the view corridors bind first (see the limit line). Above 550 ft the review adds two international experts (s.3, p.5). Above every ceiling, the case rests on 2.1(a): a significant skyline benchmark.'

/** The Higher Buildings lines for one tower: area (in or out), the ceiling, and the about-700 ft street rule. */
export function hbpAreaLines(t: Tower, r: HbpReading, o: HbpOptions): RuleResult[] {
  const H = t.imported ? t.imported.top : t.height
  const ft = H / FT
  const out: RuleResult[] = []
  const add = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, page: string, note: string, specialist?: string) =>
    out.push({ id, label, value, threshold, state, flag, source: { ...HBP_SOURCE, page }, note, ...(specialist ? { specialist } : {}) })
  const name = r.part?.label ?? 'the policy area'

  // 1. Inside or outside (2.1(b)).
  const areaT = 'higher buildings only inside the Figure 1 areas (HBP 2.1(b))'
  if (r.where === 'assumed') add('hbp-area', 'Higher Buildings area', 'assumed site: no real policy area', areaT, 'unknown', 'team_assumption', 'p.3, 2.1(b); p.5 Figure 1',
    'The competition site is hypothetical, so it lies in no Figure 1 area; the ceiling line reads it as a CBD site (team assumption). Open Real Vancouver for an inside or outside reading.')
  else {
    const share = Math.round((r.share ?? 0) * 100)
    const value = r.where === 'within' ? `inside: ${name}`
      : r.where === 'overlapping' ? `partly inside: ${name} (${share}% of the footprint)`
      : r.where === 'outside' ? `outside (nearest: ${name}, ${Math.round(r.nearestM ?? 0)} m)`
      : `on the edge of ${name}: the digitized boundary cannot settle it`
    const state: RuleState = r.where === 'within' ? 'pass' : r.where === 'uncertain' ? 'unknown' : r.where === 'outside' && o.routeOn ? 'fail' : 'warn'
    add('hbp-area', 'Higher Buildings area', value, areaT, state, 'unverified', 'p.3, 2.1(b); p.5 Figure 1',
      `${r.where === 'outside' && o.routeOn ? 'The Higher Buildings route is switched on, but the policy opens only inside its areas. ' : ''}${BOUNDARY} ${NOT_APPROVAL}`, edgeSpecialist(r))
  }

  // 2. The ceiling (Figure 1 legend, p.5; identified sites 2.1(c)–(d)).
  const c = hbpCeiling(r, o.ceilingFt)
  const ceilT = 'top at or below the area\'s Figure 1 ceiling (HBP p.5 legend; 2.1(c)–(d))'
  if (!c) add('hbp-ceiling', 'Higher Buildings ceiling', `top ${r1(H)} m (${Math.round(ft)} ft): no Figure 1 ceiling outside the area`, ceilT, 'unknown', 'unverified', 'p.5 Figure 1 legend',
    `Outside the area the base zoning and the view cones govern; type a site-specific ceiling under Details › Relaxations if the City has given one. ${CEILINGS_NOTE}`)
  else {
    const cm = c.ft * FT
    add('hbp-ceiling', 'Higher Buildings ceiling', `top ${r1(H)} m (${Math.round(ft)} ft) vs ceiling ${r1(cm)} m (${Math.round(c.ft)} ft)${r.where === 'assumed' ? ', assumed site' : ''}`,
      `${ceilT}: ${c.basis}`, H <= cm + 1e-6 ? 'pass' : 'warn', c.flag, 'p.5 Figure 1 legend; p.3, 2.1(c)–(d)', CEILINGS_NOTE,
      ceilingSpecialist(ft, c.ft, c.typed || r.where === 'assumed') ?? edgeSpecialist(r))
  }

  // 3. About 700 ft only on W Georgia, Burrard or Granville (2.1(c)): asked once the top or the ceiling passes 600 ft.
  if (ft > HBP_CBD_FT || (c && c.ft > HBP_CBD_FT)) {
    const streetT = 'about 700 ft only on a site fronting W Georgia, Burrard or Granville (HBP 2.1(c))'
    const note = 'Above the CBD\'s 600 ft only the identified site of about 700 ft remains, on one of the three named streets; 2.1(c) itself says "about". Frontage is read from the study site\'s streets (City centre lines).'
    if (r.where === 'assumed') add('hbp-street', 'About 700 ft: street frontage', 'assumed site: the brief names no real street', streetT, 'unknown', 'team_assumption', 'p.3, 2.1(c)', note)
    else if (!o.streets) add('hbp-street', 'About 700 ft: street frontage', 'the site\'s streets are not known yet', streetT, 'unknown', 'unresolved', 'p.3, 2.1(c)', note)
    else {
      const hit = o.streets.filter((s) => PRIMARY.test(s))
      add('hbp-street', 'About 700 ft: street frontage', hit.length ? `fronts ${hit.join(', ')}` : `fronts none of them${o.streets.length ? ` (${o.streets.join(', ')})` : ''}`, streetT,
        hit.length ? 'pass' : 'warn', 'verified', 'p.3, 2.1(c)', note)
    }
  }
  return out
}

/** Convenience: the lines for a tower on either project (competition: the assumed site; Real Vancouver: its footprint). */
export function hbpChecklist(t: Tower, project: 'vtc' | 'city', origin: readonly [number, number], o: HbpOptions): RuleResult[] {
  return hbpAreaLines(t, hbpReading(project === 'city' ? hbpFootprint(t, origin) : null), o)
}
