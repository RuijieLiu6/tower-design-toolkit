// Relaxations, zoning and aviation obligations (Context Model C01-M06, research r2). Two parts:
// - Relaxations are not caps: the Higher Buildings Policy lets selected rezonings enter the Queen Elizabeth Park view
//   (cones 3.2.x); Exceptional Downtown Sites (PVG 3.4, 8,000 m² or more) may also enter B1, B2 and D. Some views get no
//   relief (A, E, 9.x, J1, G, H). Masks are switched on by the user, never applied automatically, and nothing here is a
//   permit determination.
// - Aviation is rule-based: CAR 601.23 makes a structure over 150 m above ground an obstacle (over 90 m within 6 km of
//   an aerodrome), 601.24 asks for notice; AC 601-007 says when to submit an aeronautical assessment. YVR's zoning
//   covers Richmond only. NAV CANADA outcomes are case by case. Aerodrome positions are secondary transcriptions.
import { maxHeightAt } from './heightSurface'
import { towerFootprint } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { CONES, limitAt } from './viewCones'

// --- Sources (research C01 r2; "opened" ones were read by the researcher) -----------------------------------------
const PVG: Source = { label: 'City of Vancouver, Public Views Guidelines (amended 4 Feb 2026)', url: 'https://guidelines.vancouver.ca/guidelines-public-views.pdf' }
const HBP: Source = { label: 'City of Vancouver, Higher Buildings Policy (rev. 31 Mar 2026)', url: 'https://guidelines.vancouver.ca/policy-higher-buildings-for-rezonings.pdf' }
const GRANVILLE: Source = { label: 'Council report RTS 16361, Granville Street Plan (approved 4 Jun 2025)', page: 'PDF p.29: row 12.2 deleted from PVG Table 1', url: 'https://council.vancouver.ca/20250604/documents/pspc1.pdf' }
const CAR: Source = { label: 'Canadian Aviation Regulations SOR/96-433 (current to 2026-09-30)', url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-96-433/section-601.23.html' }
const AC: Source = { label: 'Transport Canada AC 601-007, When to Submit an Aeronautical Assessment Form (Issue 01, 2024)', url: 'https://tc.canada.ca/sites/default/files/2025-06/AC-601-007-issue-01.pdf' }
const YVR: Source = { label: 'Vancouver International Airport Zoning Regulations SOR/80-902 (current to 2026-09-30)', url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-80-902/FullText.html' }
const TP1247: Source = { label: 'Transport Canada TP 1247, Aviation: Land Use in the Vicinity of Aerodromes (2019)', url: 'https://tc.canada.ca/en/aviation/publications/aviation-land-use-vicinity-aerodromes-tp-1247' }
const NAVNEWS: Source = { label: 'Daily Hive, 24 Jul 2026: NAV CANADA concerns could shrink the Bay Parkade tower (news report)', url: 'https://dailyhive.com/vancouver/holborn-bay-parkade-vancouver-supertall-tower-nav-canada-federal-aviation' }
const CYHC_SRC: Source = { label: 'Wikipedia, Vancouver Harbour Flight Centre (secondary; cites the Canada Flight Supplement)', url: 'https://en.wikipedia.org/wiki/Vancouver_Harbour_Flight_Centre' }
const HELI_SRC: Source = { label: 'Wikipedia, List of airports in the Lower Mainland (secondary)', url: 'https://en.wikipedia.org/wiki/List_of_airports_in_the_Lower_Mainland' }

export const NOT_A_DETERMINATION = 'Screening from published rules, not a permit or aeronautical determination: the City, Transport Canada and NAV CANADA decide for a real site.'

// --- Relaxations -------------------------------------------------------------------------------------------------------
export type Instrument = 'hbp' | 'eds'
export interface Relaxation { id: Instrument; label: string; cones: string[]; clause: string; source: Source; eligibility: string; flag: Flag }
export const RELAXATIONS: Record<Instrument, Relaxation> = {
  hbp: { id: 'hbp', label: 'Higher Buildings Policy', cones: ['3.2.1', '3.2.2', '3.2.3', '3.2.4'], clause: 'HBP 2.1; process s.3', source: HBP,
    eligibility: 'Selected rezonings in the policy’s Figure 1 areas; heights of about 550–700 ft in the CBD are guidance, not caps. Figure 1 is not digitised here, and other Council-approved corridors are not listed in the research.', flag: 'verified' },
  eds: { id: 'eds', label: 'Exceptional Downtown Site', cones: ['B1', 'B2', 'D'], clause: 'PVG 3.4.1–3.4.2', source: { ...PVG, page: '3.4, pp.7–8' },
    eligibility: 'Downtown sites of 8,000 m² or more may also enter B1, B2 and D, keeping the views to the Lions. View 12.2 was removed from Table 1 on 4 Jun 2025.', flag: 'verified' },
}
/** Views no relaxation route touches (PVG 3.4, as read in research C01). */
export const NO_RELIEF = ['A', 'E', '9.1', '9.2', 'J1', 'G1', 'G2', 'H']
export const EDS_MIN_SITE = 8000

export function instrumentsFor(coneId: string): Instrument[] {
  return (Object.keys(RELAXATIONS) as Instrument[]).filter((k) => RELAXATIONS[k].cones.includes(coneId))
}
export type ConeRoute = 'hbp' | 'eds' | 'none' | 'unlisted'
/** How a cone can be relaxed: by an instrument, never (no-relief list), or not identified in the research. */
export const coneRoute = (coneId: string): ConeRoute => (RELAXATIONS.hbp.cones.includes(coneId) ? 'hbp' : RELAXATIONS.eds.cones.includes(coneId) ? 'eds' : NO_RELIEF.includes(coneId) ? 'none' : 'unlisted')

export interface RelaxAt {
  covering: string[]
  /** Covering cones an enabled instrument relaxes. */
  relaxed: string[]
  /** Covering cones that still bind. */
  binding: string[]
  /** Lowest estimated limit before and after the enabled relaxations (geodetic m); null where unknown or none. */
  before: number | null
  after: number | null
  afterState: 'none' | 'unknown' | 'limit'
}

/** The height-limit answer at a point with some relaxations switched on (EPSG:26910). */
export function relaxationAt(p: [number, number], on: Instrument[]): RelaxAt {
  const h = maxHeightAt(p)
  const covering = h.covering.map((c) => c.id)
  const relaxed = covering.filter((id) => instrumentsFor(id).some((k) => on.includes(k)))
  const bindingCones = h.covering.filter((c) => !relaxed.includes(c.id))
  let after: number | null = null, unknown = false
  for (const c of bindingCones) { const z = limitAt(c, p); if (z === null) unknown = true; else after = after === null ? z : Math.min(after, z) }
  return {
    covering, relaxed, binding: bindingCones.map((c) => c.id), before: h.state === 'limit' ? h.limit : null,
    after: unknown ? null : after, afterState: !bindingCones.length ? 'none' : unknown ? 'unknown' : 'limit',
  }
}

// --- Aviation ----------------------------------------------------------------------------------------------------------
export interface Aerodrome { id: string; name: string; kind: 'water' | 'heliport'; lat: number; lon: number; status: string; source: Source }
export const AERODROMES: Aerodrome[] = [
  { id: 'CYHC', name: 'Vancouver Harbour Flight Centre (water aerodrome)', kind: 'water', lat: 49.29444, lon: -123.11139, status: 'registered; whether its water channels are defined is unknown', source: CYHC_SRC },
  { id: 'CBC7', name: 'Vancouver Harbour (Public) Heliport', kind: 'heliport', lat: 49.28694, lon: -123.10611, status: 'certification, final-approach area and instrument approach unknown', source: HELI_SRC },
  { id: 'CBK4', name: 'Vancouver General Hospital heliport', kind: 'heliport', lat: 49.26167, lon: -123.12222, status: 'certification and instrument approach unknown', source: HELI_SRC },
]

/** Latitude and longitude (NAD83/WGS84) to UTM zone 10N metres (EPSG:26910), Krüger series. */
export function toUtm10(lat: number, lon: number): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = (-123 * Math.PI) / 180
  const n = f / (2 - f), A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64)
  const al = [n / 2 - (2 * n * n) / 3 + (5 * n ** 3) / 16, (13 * n * n) / 48 - (3 * n ** 3) / 5, (61 * n ** 3) / 240]
  const phi = (lat * Math.PI) / 180, dl = (lon * Math.PI) / 180 - lon0
  const c = (2 * Math.sqrt(n)) / (1 + n)
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)))
  const xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t))
  let E = eta, N = xi
  al.forEach((aj, j) => { const k = 2 * (j + 1); E += aj * Math.cos(k * xi) * Math.sinh(k * eta); N += aj * Math.sin(k * xi) * Math.cosh(k * eta) })
  return [500000 + k0 * A * E, k0 * A * N]
}

const AERO_XY = AERODROMES.map((d) => ({ ...d, xy: toUtm10(d.lat, d.lon) }))

/** Distance from a point (EPSG:26910) to each aerodrome, nearest first. */
export function aerodromeDistances(p: [number, number]) {
  return AERO_XY.map((d) => ({ ...d, d: Math.hypot(d.xy[0] - p[0], d.xy[1] - p[1]) })).sort((x, y) => x.d - y.d)
}

/** AC 601-007 notification height (m above the aerodrome) at distance d, the lowest of the possible categories while the
 *  category is unknown: water aerodrome without channels 60 m AGL (4.7), with channels 2% to 3,000 m (4.5.2, 4.7(2));
 *  heliport 4% to 1,500 m (4.5.4); anywhere 60 m AGL (4.4). */
export function notificationHeight(kind: Aerodrome['kind'], d: number): number {
  const candidates = [60]
  if (kind === 'water' && d <= 3000) candidates.push(0.02 * d)
  if (kind === 'heliport' && d <= 1500) candidates.push(0.04 * d)
  return Math.min(...candidates)
}

const r1 = (v: number) => Math.round(v * 10) / 10
const km = (m: number) => `${(m / 1000).toFixed(1)} km`

/** Aviation checklist for one tower. `where` is the tower centre in EPSG:26910, or null for the hypothetical VTC site. */
export function aviationChecklist(t: Tower, where: [number, number] | null): RuleResult[] {
  const H = t.imported ? t.imported.top : t.height
  const near = where ? aerodromeDistances(where) : null
  const within6 = near ? near.filter((d) => d.d <= 6000) : null
  const out: RuleResult[] = []
  const add = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string) => out.push({ id, label, value, threshold, state, flag, source, ...(note ? { note } : {}) })

  add('car-150', 'Aviation obstacle by height', `${r1(H)} m above ground`, 'over 150 m above ground is an obstacle (CAR 601.23(1)(d))', H > 150 ? 'warn' : 'pass', 'verified', { ...CAR, page: '601.23(1)(d)' },
    H > 150 ? 'Every 244–305 m tower is an obstacle: give notice (601.24) and plan marking and lighting to Standard 621.' : undefined)
  if (within6) add('car-90-6km', 'Obstacle near an aerodrome', within6.length ? `${within6.map((d) => `${d.id} ${km(d.d)}`).join(', ')}` : 'no listed aerodrome within 6 km', 'over 90 m above ground within 6 km of an aerodrome centre (CAR 601.23(1)(b))',
    within6.length && H > 90 ? 'warn' : 'pass', 'unverified', { ...CAR, page: '601.23(1)(b)' }, 'Aerodrome positions are secondary transcriptions (Wikipedia citing the Canada Flight Supplement); confirm in the CFS.')
  else add('car-90-6km', 'Obstacle near an aerodrome', 'hypothetical site: CBD assumed', 'over 90 m above ground within 6 km of an aerodrome centre (CAR 601.23(1)(b))', H > 90 ? 'warn' : 'pass', 'team_assumption', { ...CAR, page: '601.23(1)(b)' },
    'Any CBD site is within about 2 km of the harbour water aerodrome (CYHC) and heliport (CBC7) (research C01).')
  add('car-vfr', 'Obstacle near a VFR route', 'not assessed', 'over 90 m above ground within 3.7 km of a recognised VFR route (CAR 601.23(1)(c))', 'unknown', 'unresolved', { ...CAR, page: '601.23(1)(c)' }, 'VFR route charts are not machine-readable here.')
  add('car-ols', 'Above an obstacle limitation surface', 'no published surface found downtown', 'above an OLS (CAR 601.23(1)(a); TP 312E ch.4)', 'unknown', 'unresolved', { ...CAR, page: '601.23(1)(a)' },
    'None found for the harbour water aerodrome or heliport (research C01). The City reportedly holds a NAV CANADA height layer: request it.')
  const obstacle = H > 150 || (H > 90 && (within6 ? within6.length > 0 : true))
  add('car-notice', 'Notice to Transport Canada', obstacle ? 'required: submit the aeronautical assessment form (26-0427)' : 'not triggered by height alone', 'notice for every obstacle (CAR 601.24)',
    obstacle ? 'warn' : 'pass', 'verified', { ...CAR, page: '601.24' })
  const notif = near?.filter((d) => d.d <= 3000).map((d) => ({ d, h: notificationHeight(d.kind, d.d) })) ?? []
  const lowest = notif.length ? notif.reduce((m, x) => (x.h < m.h ? x : m)) : null
  add('ac-601-007', 'Aeronautical assessment form', lowest ? `notification surface about ${r1(lowest.h)} m near ${lowest.d.id} (${km(lowest.d.d)})` : 'basic surface 60 m above ground', 'submit above the notification surface (AC 601-007 4.4, 4.5, 4.7)',
    H > (lowest?.h ?? 60) ? 'warn' : 'pass', 'unverified', { ...AC, page: '4.4–4.7' },
    'While the aerodrome categories are unknown (water channels, heliport certification and approach), the lowest possible surface is used.')
  add('nav-canada', 'NAV CANADA land-use review', 'case by case: no published downtown surface', 'enter any height NAV CANADA gives as a cap; allow for cranes', 'unknown', 'unresolved', NAVNEWS,
    'In July 2026 NAV CANADA asked the Bay Parkade supertall to drop about 27 m (to about 288 m); the surface or procedure was not disclosed. Ask the City for its NAV CANADA height layer.')
  add('yvr-zoning', 'YVR airport zoning', 'does not cover downtown Vancouver', 'SOR/80-902 Part II lands (Richmond and the Strait)', 'pass', 'verified', { ...YVR, page: 's.3; Parts II and IV' },
    'Municipalities control height outside aerodromes unless an airport zoning regulation exists, and none can be made for a non-certified aerodrome (TP 1247).')
  return out
}

/** Relaxation lines for one tower: the cones over its footprint and what the switched-on routes do to them. */
export function relaxationChecklist(t: Tower, on: Instrument[], ground: number, siteArea: number | null, origin: [number, number], siteAreaSource?: string): RuleResult[] {
  const fp = towerFootprint(t).map(([x, y]) => [x + origin[0], y + origin[1]] as [number, number])
  const centre: [number, number] = [t.x + origin[0], t.y + origin[1]]
  const pts = [centre, ...fp]
  const at = pts.map((p) => relaxationAt(p, on))
  const covering = [...new Set(at.flatMap((a) => a.covering))]
  const top = ground + (t.imported ? t.imported.top : t.height)
  const out: RuleResult[] = []
  if (!covering.length) {
    out.push({ id: 'relax-none-needed', label: 'View relaxations', value: 'no protected view covers this footprint', threshold: 'relaxations matter only inside a cone', state: 'pass', flag: 'team_assumption', source: { ...PVG, page: 'Table 1' }, note: 'From the modelled cone plans (estimates).' })
    return out
  }
  const byRoute = (r: ConeRoute) => covering.filter((c) => coneRoute(c) === r)
  const hbp = byRoute('hbp'), eds = byRoute('eds'), none = byRoute('none'), unlisted = byRoute('unlisted')
  if (hbp.length) out.push({ id: 'relax-hbp', label: 'Higher Buildings Policy route', value: `could allow entering ${hbp.join(', ')}${on.includes('hbp') ? ' (switched on)' : ''}`, threshold: 'a rezoning under the policy; heights are guidance, not caps', state: 'unknown', flag: 'verified', source: { ...HBP, page: '2.1' }, note: RELAXATIONS.hbp.eligibility })
  if (eds.length) out.push({ id: 'relax-eds', label: 'Exceptional Downtown Site route', value: `could allow entering ${eds.join(', ')}${on.includes('eds') ? ' (switched on)' : ''}`, threshold: `site of ${EDS_MIN_SITE.toLocaleString()} m² or more, views to the Lions kept`,
    state: siteArea === null ? 'unknown' : siteArea >= EDS_MIN_SITE ? 'warn' : 'fail', flag: 'verified', source: { ...PVG, page: '3.4.1–3.4.2' },
    note: siteArea === null ? 'The site area is not known in Real Vancouver: choose a study site in the Site step, or type the parcel area.' : `Site ${Math.round(siteArea).toLocaleString()} m²${siteAreaSource ? ` (${siteAreaSource})` : ''}.` })
  if (none.length) out.push({ id: 'relax-no-route', label: 'Views with no relaxation route', value: none.join(', '), threshold: 'no relief under PVG 3.4 (A, E, 9.x, J1, G, H)', state: 'warn', flag: 'verified', source: { ...PVG, page: '3.4' }, note: 'These bind whatever route is used.' })
  if (unlisted.length) out.push({ id: 'relax-unlisted', label: 'Views the research found no route for', value: unlisted.join(', '), threshold: 'treated as binding', state: 'unknown', flag: 'unresolved', source: { ...PVG, page: 'Table 1; 3.4' } })
  const afters = at.map((a) => a.after), unknownAfter = at.some((a) => a.afterState === 'unknown')
  const limit = afters.filter((x): x is number => x !== null)
  const after = limit.length ? Math.min(...limit) : null
  out.push({
    id: 'relax-limit', label: on.length ? 'Estimated limit with the routes switched on' : 'Estimated limit (no relaxation switched on)',
    value: unknownAfter ? 'a binding cone has no estimate' : after === null ? 'no binding cone left' : `${r1(after)} m geodetic; top ${r1(top)} m`,
    threshold: 'top of the tower at or below the lowest binding cone (estimate)', state: unknownAfter ? 'unknown' : after === null ? 'pass' : top <= after ? 'pass' : 'fail',
    flag: 'team_assumption', source: { ...PVG, page: 'cl. 3.1.1; lower boundary Z = Lv + k·D (estimate)' }, note: 'Estimates from the view-cone model; the City View Cone Assessment governs.',
  })
  return out
}

export const RELAX_AVIATION_FALSE_ASSUMPTIONS: { claim: string; correction: string; source: Source }[] = [
  { claim: 'YVR or harbour obstacle surfaces cap downtown heights.', correction: 'YVR zoning (SOR/80-902) covers Richmond lands only; no zoning was found for the harbour water aerodrome or heliport.', source: { ...YVR, page: 'Part II' } },
  { claim: 'The Higher Buildings Policy supplies height caps.', correction: 'It is a relaxation: higher buildings may enter the QE view and named corridors; its heights are approximate guidance. PVG 3.4.2 lets Exceptional Downtown Sites also enter B1, B2 and D.', source: { ...HBP, page: '2.1' } },
  { claim: 'No aviation rule applies downtown; it is case by case only.', correction: 'There is no zoning surface, but CAR 601.23 makes any structure over 150 m above ground an obstacle (over 90 m within 6 km of an aerodrome), and 601.24 requires notice and Standard 621 marking.', source: { ...CAR, page: '601.23–601.24' } },
  { claim: 'The water aerodrome’s notification surface is 60 m above ground.', correction: 'That holds only without defined water channels. With channels it is runway-type: 2% out to 3,000 m (AC 601-007 4.7(2)). Classify CYHC and CBC7 from the CWAS and CFS.', source: { ...AC, page: '4.7' } },
  { claim: 'View 12.2 (Granville Bridge) can be entered by an Exceptional Downtown Site.', correction: 'Row 12.2 was deleted from PVG Table 1 on 4 Jun 2025.', source: GRANVILLE },
]

export { CONES }
export const TP1247_SOURCE = TP1247
