// Mobility and servicing (research P09-M02 parking, loading and bicycle by-law check; P09-M05 servicing and access
// placement), round 3. The Parking By-law sections could not be opened: the City's by-law site answers automated
// requests with HTTP 403 (research rounds 1-3, and again on 22 Oct 2026; not bypassed). So every by-law rate below is
// either a search extract (unverified), a range where secondary sources disagree, or unresolved. No unchecked row can
// show a pass: research P09-M02 keeps them grey until two people have transcribed and checked the section.

import { netToGross, towerFloors } from './massing'
import { edgeLength, STATION_CORNER, VTC_EDGES, VTC_SITE, type EdgeId, type StreetType } from './publicRealm'
import type { RuleResult, RuleState, Tower, UseId } from './types'

const BYLAW = 'Parking By-law No. 6059'
export const SECTION = {
  s4: { label: `${BYLAW}, Section 4 (off-street parking), June 2026 consolidation`, url: 'https://bylaws.vancouver.ca/parking/Sec04.pdf' },
  s5: { label: `${BYLAW}, Section 5 (off-street loading), May 2026 consolidation`, url: 'https://bylaws.vancouver.ca/parking/sec05.pdf' },
  s6: { label: `${BYLAW}, Section 6 (bicycle spaces), Feb 2026 consolidation`, url: 'https://bylaws.vancouver.ca/parking/sec06.pdf' },
}
const NOT_OPENED = 'not opened: the City by-law site returns HTTP 403 to automated requests (research P09, 22 Oct 2026 re-check), not bypassed'

/** Downtown non-residential maximum: 1 space per 115 m² GFA, s.4.2.5 (search extract, research P09-S05; unverified). */
export const DOWNTOWN_MAX_M2 = 115

export interface AccessPoint {
  id: string
  kind: 'loading' | 'ramp' | 'dropoff'
  edge: EdgeId
  /** Position along the edge, 0 = west or south end, 1 = east or north end. */
  at: number
}

export interface MobilityInput {
  /** Provided counts (null = not entered). */
  carStalls: number | null
  accessibleStalls: number | null
  loadingB: number | null
  loadingC: number | null
  bikeA: number | null
  bikeB: number | null
  /** Dock screening (P09-M05): no sourced Vancouver freight-trip rate exists, so both stay blank until entered. */
  trucksPerHour: number | null
  dwellMin: number | null
  access: AccessPoint[]
}

export const DEFAULT_MOBILITY: MobilityInput = {
  carStalls: null, accessibleStalls: null, loadingB: null, loadingC: null, bikeA: null, bikeB: null,
  trucksPerHour: null, dwellMin: null,
  // Starting sketch: loading and the parking ramp off the local streets, away from the station corner (team assumption).
  access: [
    { id: 'a1', kind: 'loading', edge: 'north', at: 0.7 },
    { id: 'a2', kind: 'ramp', edge: 'east', at: 0.6 },
  ],
}

export interface Program {
  gfa: Record<UseId, number>
  nonResGfa: number
  dwellings: number
  hotelKeys: number
}

/** GFA by use, with dwellings and keys estimated from net area (lift presets: m² per home and per key, team assumptions). */
export function program(towers: Tower[], homeM2: number, hotelM2PerKey: number): Program {
  const gfa = { retail: 0, office: 0, hotel: 0, residential: 0, civic: 0, amenity: 0, mechanical: 0 } as Record<UseId, number>
  let dwellings = 0, hotelKeys = 0
  for (const t of towers) {
    const ntg = netToGross(t)
    for (const f of towerFloors(t)) {
      gfa[f.use] += f.area
      if (f.use === 'residential') dwellings += (f.area * ntg) / Math.max(1, homeM2)
      if (f.use === 'hotel') hotelKeys += (f.area * ntg) / Math.max(1, hotelM2PerKey)
    }
  }
  // Commercial floor area for the maximum: office, retail, hotel and civic; plant and public amenity left out (team reading).
  const nonResGfa = gfa.office + gfa.retail + gfa.hotel + gfa.civic
  return { gfa, nonResGfa, dwellings: Math.floor(dwellings), hotelKeys: Math.floor(hotelKeys) }
}

/** Class A bicycle spaces under the two secondary readings the research found (they disagree; s.6 table not opened). */
export function bikeAReadings(p: Program): { council2008: number; vendorLow: number; vendorHigh: number; low: number; high: number } {
  // Council 2008 minimums via Memon (research P09-S12): 1.25 per dwelling, 1 per 500 m² commercial.
  const council2008 = Math.ceil(1.25 * p.dwellings + p.nonResGfa / 500)
  // Vendor summary (P09-S13, no by-law date): 1.5, 2.5 or 3 per dwelling by size (sizes unknown here, so 1.5 to 3),
  // office 1 per 170 m², retail 1 per 340 m², hotel 1 per 30 rooms.
  const com = p.gfa.office / 170 + p.gfa.retail / 340 + p.hotelKeys / 30
  const vendorLow = Math.ceil(1.5 * p.dwellings + com), vendorHigh = Math.ceil(3 * p.dwellings + com)
  return { council2008, vendorLow, vendorHigh, low: Math.min(council2008, vendorLow), high: Math.max(council2008, vendorHigh) }
}

/** Erlang C: probability that an arriving truck waits, for c bays, offered load a = lambda / mu (research P09-S22). */
export function erlangC(c: number, a: number): number {
  if (c <= 0) return 1
  if (a >= c) return 1
  let sum = 0, term = 1
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; sum += term }
  const last = term * (a / c) // a^c / c!
  const top = last / (1 - a / c)
  return top / (sum + top)
}

export const STREET_STATE: Record<StreetType, RuleState> = { retail: 'fail', arterial: 'warn', local: 'pass' }

/** Plan position of an access point on the site boundary. */
export function accessXY(a: AccessPoint): [number, number] {
  const { xMin, xMax, yMin, yMax } = VTC_SITE
  const t = Math.max(0, Math.min(1, a.at))
  if (a.edge === 'south') return [xMin + t * (xMax - xMin), yMin]
  if (a.edge === 'north') return [xMin + t * (xMax - xMin), yMax]
  if (a.edge === 'west') return [xMin, yMin + t * (yMax - yMin)]
  return [xMax, yMin + t * (yMax - yMin)]
}

/** Distance along the edge to the nearer block corner (the intersection). */
export const cornerDistance = (a: AccessPoint) => Math.min(a.at, 1 - a.at) * edgeLength(a.edge)

const f0 = (v: number) => Math.round(v).toLocaleString()
const KIND = { loading: 'Loading', ramp: 'Parking ramp', dropoff: 'Drop-off' }

export function mobilityCheck(towers: Tower[], input: MobilityInput, o: { project: 'vtc' | 'city'; transitLink: boolean; homeM2: number; hotelM2PerKey: number }): { rules: RuleResult[]; program: Program; bike: ReturnType<typeof bikeAReadings>; maxStalls: number } {
  const p = program(towers, o.homeM2, o.hotelM2PerKey)
  const rules: RuleResult[] = []
  const maxStalls = Math.floor(p.nonResGfa / DOWNTOWN_MAX_M2)
  const prov = (v: number | null, what: string) => (v == null ? `${what}: not entered` : `${v} ${what}`)

  rules.push({
    id: 'mob-min', label: 'Minimum parking', value: prov(input.carStalls, 'stalls provided'), threshold: 'none: no minimum applies downtown (since 2018) or citywide (since 30 Jun 2024)',
    state: 'pass', flag: 'verified',
    source: { label: 'Council vote 26 Jun 2024, effective 30 Jun 2024 (Global News; Storeys), research P09-S01, S02', url: 'https://storeys.com/vancouver-eliminates-minimum-parking-requirements/' },
    note: 'Fewer stalls cannot create a by-law deficiency. Accessible and visitor spaces, loading and bicycle spaces are still required. News reports of the decision; the by-law text was not opened.',
  })
  const over = input.carStalls != null && input.carStalls > maxStalls
  rules.push({
    id: 'mob-max', label: 'Downtown parking maximum (non-residential)', value: input.carStalls == null ? `Up to ${f0(maxStalls)} stalls for ${f0(p.nonResGfa)} m² commercial` : `${input.carStalls} of up to ${f0(maxStalls)} stalls`,
    threshold: `at most 1 per ${DOWNTOWN_MAX_M2} m² non-residential GFA (s.4.2.5)`,
    state: over ? 'warn' : 'unknown', flag: 'unverified', source: { label: `${SECTION.s4.label}, s.4.2.5`, url: SECTION.s4.url },
    note: `Rate from a search extract; section ${NOT_OPENED}. Rounding rule unread. Applies if the block is in the Downtown area (unresolved: an organizer question). ${over ? 'Stalls above the maximum need a relaxation.' : 'Within the extract, but shown grey until the section is checked.'} Residential maximum: unresolved.`,
  })
  rules.push({
    id: 'mob-toa', label: 'Residential parking near rapid transit', value: p.gfa.residential > 0 ? `${f0(p.dwellings)} homes (estimate); station on the next block` : 'No residential floors',
    threshold: 'none can be required within a Transit-Oriented Area (800 m of rapid transit)', state: 'unknown', flag: 'unverified',
    source: { label: 'Province of BC, Transit-Oriented Areas (page updated 22 Jul 2026), research P09-S24', url: 'https://www2.gov.bc.ca/gov/content/housing-tenancy/local-governments-and-housing/housing-initiatives/transit-oriented-areas' },
    note: 'The rule itself is from an opened page; whether this station is on the TOA list (OIC 678-2023) was not checked. Accessible spaces, commercial uses and loading can still be required.',
  })
  for (const [id, label, note] of [
    ['mob-accessible', 'Accessible and van-accessible parking', 'Still required after 2024 (P09-S01, S24); the rate and the van-accessible split were not found.'],
    ['mob-visitor', 'Visitor parking', 'Still required after 2024 (P09-S02); the rate was not found.'],
    ['mob-ev', 'EV-ready stalls', 'Likely mandatory for residential stalls (reviewer), rate unknown; a 2009 paper calls outlets voluntary (dated). Until loaded, plan the electrical room for every supplied residential stall energized (team assumption).'],
  ] as const) {
    rules.push({ id, label, value: id === 'mob-accessible' ? prov(input.accessibleStalls, 'accessible stalls provided') : 'Required count unknown', threshold: 'rate unresolved (Section 4)', state: 'unknown', flag: 'unresolved', source: { label: SECTION.s4.label, url: SECTION.s4.url }, note: `${note} Section ${NOT_OPENED}.` })
  }
  rules.push({
    id: 'mob-loading', label: 'Loading bays (Class A, B, C)', value: `${input.loadingB == null ? '–' : input.loadingB} Class B, ${input.loadingC == null ? '–' : input.loadingC} Class C provided`,
    threshold: 'table s.5.2 by use, GFA and units: unresolved', state: 'unknown', flag: 'unresolved', source: { label: `${SECTION.s5.label}, s.5.2`, url: SECTION.s5.url },
    note: `Section ${NOT_OPENED}. For scale only: the superseded 2012 text asked for no Class B bay under 100 dwellings and one at 100-299 (this design: about ${f0(p.dwellings)} homes, ${f0(p.gfa.office + p.gfa.retail)} m² office and retail). Bay sizes differ between versions (Class B 10.2 × 3.4 m in a May 2026 extract, 8.5 × 3.0 × 3.8 m in 2012), so bays are drawn as outlines pending Section 5.`,
  })
  rules.push({
    id: 'mob-passenger', label: 'Passenger spaces (drop-off)', value: p.hotelKeys ? `${f0(p.hotelKeys)} hotel keys (estimate)` : 'No hotel floors',
    threshold: 'rows by use incl. hotels: unresolved', state: 'unknown', flag: 'unresolved', source: { label: SECTION.s5.label, url: SECTION.s5.url },
    note: `A reviewer reports Section 5 passenger-space rows including hotels; rate, size and triggers not confirmed. Section ${NOT_OPENED}.`,
  })
  const b = bikeAReadings(p)
  const bikeShort = input.bikeA != null && input.bikeA < b.low
  rules.push({
    id: 'mob-bike-a', label: 'Class A bicycle spaces (secured room)',
    value: input.bikeA == null ? `${f0(b.low)}–${f0(b.high)} spaces under two readings` : `${input.bikeA} provided; readings give ${f0(b.low)}–${f0(b.high)}${input.bikeA >= b.high ? ' (meets both)' : ''}`,
    threshold: 'Section 6 rate table: unresolved (secondary sources disagree)', state: bikeShort ? 'warn' : 'unknown', flag: 'unverified',
    source: { label: `${SECTION.s6.label}; readings from Council 2008 via Memon (P09-S12) and a vendor summary (P09-S13)`, url: SECTION.s6.url },
    note: `Council 2008 (dated): 1.25 per home + 1 per 500 m² commercial = ${f0(b.council2008)}. Vendor (no by-law date): 1.5-3 per home by size + office 1/170 m², retail 1/340 m², hotel 1/30 rooms = ${f0(b.vendorLow)}-${f0(b.vendorHigh)}. Home count from net area at the lift presets' m² per home (team). Only the official table can settle it; section ${NOT_OPENED}.`,
  })
  rules.push({
    id: 'mob-bike-b', label: 'Class B bicycle spaces (visitor racks)', value: input.bikeB == null ? 'Required count unknown' : `${input.bikeB} provided (about ${(input.bikeB * 0.6).toFixed(1)} m of rack frontage)`,
    threshold: 'triggered at size thresholds: unresolved', state: 'unknown', flag: 'unresolved', source: { label: SECTION.s6.label, url: SECTION.s6.url },
    note: `Racks need at least 0.6 m per bicycle (s.6 extract, unverified); a vendor lists 6 spaces at 2,000 m² office (partial list). Section ${NOT_OPENED}.`,
  })
  if (o.project === 'vtc') {
    rules.push({
      id: 'mob-transit', label: 'Below-grade transit connection', value: o.transitLink ? 'Designed (declared)' : 'Not yet declared', threshold: 'a direct below-grade link to the station (competition requirement)',
      state: o.transitLink ? 'pass' : 'unknown', flag: 'verified', source: { label: 'Vancouver Tall Challenge 2026 brief (Buildner)', page: 'p.19 "a below-grade secondary transit entrance connecting directly to the station on the neighboring site"' },
      note: 'Same rule as in VTC hard rules; switch it in Design > Project settings. Station-entrance capacity (P09-M03) is not built yet.',
    })
    // Access placement (P09-M05): lane first, then side streets; none on the retail high street. The block has no lane.
    for (const a of input.access) {
      const e = VTC_EDGES.find((x) => x.id === a.edge)!
      const d = cornerDistance(a)
      const [x, y] = accessXY(a)
      const toStation = Math.hypot(x - STATION_CORNER[0], y - STATION_CORNER[1])
      rules.push({
        id: `mob-access-${a.id}`, label: `${KIND[a.kind]} access on the ${e.street.toLowerCase()}`, value: `${f0(d)} m from the corner, ${f0(toStation)} m from the station corner`,
        threshold: 'from a lane, else a side street; no curb cut on the retail high street', state: STREET_STATE[e.type], flag: 'team_assumption',
        source: { label: 'Research P09-M05 (street-class ranking; lane access sought in the 1997 Transportation Plan, via Memon P09-S12); cut-offs are team presets' },
        note: `${e.type === 'retail' ? 'A curb cut here breaks the retail edge and crosses the busiest sidewalk. ' : e.type === 'arterial' ? 'An arterial crossing adds conflict with through traffic and the station walk. ' : ''}The block has no lane, so local streets come first. Spacing from the intersection has no Vancouver standard on file (unresolved): nearer the corner leaves less room for waiting trucks.`,
      })
    }
  }
  // Dock screening (P09-M05): Erlang C with the user's arrival rate and dwell; thresholds are presets.
  const bays = (input.loadingB ?? 0) + (input.loadingC ?? 0)
  if (input.trucksPerHour == null || input.dwellMin == null || !bays) {
    rules.push({ id: 'mob-dock', label: 'Dock queue (screening)', value: !bays ? 'Enter the loading bays' : 'Enter trucks per hour and dwell time', threshold: 'utilisation < 0.70 and P(wait) ≤ 0.10 (team presets)', state: 'unknown', flag: 'unresolved', source: { label: 'Erlang C queue (research P09-S22); no sourced Vancouver freight-trip rate, so arrivals and dwell are yours to enter' } })
  } else {
    const mu = 60 / Math.max(1, input.dwellMin), a = input.trucksPerHour / mu, rho = a / bays, pw = erlangC(bays, a)
    const state: RuleState = rho >= 1 ? 'fail' : pw > 0.3 ? 'fail' : rho < 0.7 && pw <= 0.1 ? 'pass' : 'warn'
    rules.push({
      id: 'mob-dock', label: 'Dock queue (screening)', value: `${bays} bays: utilisation ${rho.toFixed(2)}, ${rho >= 1 ? 'queue grows without end' : `P(wait) ${(pw * 100).toFixed(0)}%`}`,
      threshold: 'utilisation < 0.70 and P(wait) ≤ 0.10 (team presets)', state, flag: 'team_assumption', source: { label: 'Erlang C (M/M/c) screening formula, research P09-S22; thresholds are team presets' },
      note: 'Random arrivals and exponential dwell: a screening approximation that can err either way. Booked deliveries wait less.',
    })
  }
  return { rules, program: p, bike: b, maxStalls }
}
