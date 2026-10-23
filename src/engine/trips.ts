// Trips & station entrance (research P09-M01 person-trip generation and mode split; P09-M03 tier 0 transit connection
// and station-entrance comfort). Populations come from the lift check (which uses the interior layout's homes and keys
// when it is on); retail and civic floor area from the mobility node's program. AM peak hour is the design case: office
// arrivals by train meet station alightings in the below-grade link. Comfort only, never egress (research P09-M03).
import type { Flag, RuleResult, RuleState, Source } from './types'

export const SRC = {
  diary2008: { label: 'TransLink 2008 Regional Trip Diary, final report: trips ending in Vancouver-CBD, AM peak 06:31–09:30 (Exhibits 3.4–3.5)', url: 'https://www.translink.ca/-/media/translink/documents/about-translink/customer-service/trip-diary/2008-translink-trip-diary-survey-report.pdf' },
  tspr2025: { label: 'TransLink Transit Service Performance Review 2025, SkyTrain hourly station alightings (Monday–Friday average, inferred)', url: 'https://www.translink.ca/tspr' },
  memon: { label: 'Memon (2009), City of Vancouver Parking By-law: 1997 Transportation Plan basis of about one in four driving to work downtown', url: 'https://www.tac-atc.ca/wp-content/uploads/Memon.pdf' },
  tcqsm: { label: 'TCQSM 3rd ed., ch. 10 station capacity (not opened): Fruin walkway boundaries 1.4 / 0.9 m² per person as cited in research P09' },
  nfpa130: { label: 'NFPA 130 (not read): station egress, hand-off to the code & life-safety node' },
  expo: { label: 'Expo Line capacity, secondary source (Wikipedia, research P09-S62): 12,000 passengers per hour per direction before 2009', url: 'https://en.wikipedia.org/wiki/Expo_Line_(SkyTrain)' },
  team: { label: 'Team assumption (research P09: employee densities, trip rates and peak-hour shares are unsourced; ITE is paywalled)' },
} satisfies Record<string, Source>

export interface Shares { transit: number; autoDriver: number; other: number }
/** 2008 diary, trips ending in Vancouver-CBD, AM peak: persons 125,230, transit 57,460, auto driver 41,430 (research P09-S65). */
export const CBD_AM: Shares = { transit: 57460 / 125230, autoDriver: 41430 / 125230, other: 1 - (57460 + 41430) / 125230 }

/** SkyTrain stations near the downtown blocks: 2025 Monday–Friday 8–9 AM average alightings (research P09-S58). */
export const STATIONS: { name: string; alightAm: number }[] = [
  { name: 'Stadium–Chinatown', alightAm: 1613 }, { name: 'Burrard', alightAm: 4306 }, { name: 'Granville', alightAm: 3353 },
  { name: 'Waterfront', alightAm: 3974 }, { name: 'Vancouver City Centre', alightAm: 2246 }, { name: 'Yaletown–Roundhouse', alightAm: 674 },
]

export interface TripPresets {
  /** Share of present employees arriving in the AM peak hour (the diary's AM period is three hours). */
  officePeakShare: number
  /** Share of residents leaving in the AM peak hour. */
  residentPeakShare: number
  /** Share of hotel guests leaving in the AM peak hour. */
  hotelPeakShare: number
  /** AM peak-hour person arrivals per 100 m² of retail and civic floor area. */
  retailPer100m2: number
  /** Residents' trips: no residence-end row for downtown was found, so these are a scenario. */
  residentShares: Shares
  /** Share of the tower's train riders who use the below-grade link rather than the street. */
  linkShare: number
  station: string
  /** Share of the proxy station's alightings that take the new entrance. */
  entranceShare: number
  throughPerHour: number
  headwayMin: number
  /** Seconds over which one train's alighting riders pass the entrance. */
  dispersalS: number
  walkSpeed: number
  /** Space per person at the chosen walkway band (m²). */
  bandM2: number
  clearWidth: number
  /** Optional line capacity, passengers per hour per direction (0 = not entered). */
  lineCapacity: number
}

export const DEFAULT_TRIPS: TripPresets = {
  officePeakShare: 0.45, residentPeakShare: 0.12, hotelPeakShare: 0.1, retailPer100m2: 1,
  residentShares: { transit: 0.3, autoDriver: 0.2, other: 0.5 },
  linkShare: 0.7, station: 'Stadium–Chinatown', entranceShare: 0.3, throughPerHour: 0, headwayMin: 2.5, dispersalS: 60, walkSpeed: 1.0, bandM2: 1.4, clearWidth: 4, lineCapacity: 0,
}

export interface Population { office: number; residents: number; hotelGuests: number; retailCivicM2: number; basis: string }
export interface UseTrips { use: string; persons: number; direction: 'in' | 'out'; transit: number; autoDriver: number; other: number; basis: 'destination-end (2008 diary)' | 'unsourced scenario' }

export interface TripResult {
  uses: UseTrips[]
  am: { in: number; out: number; transitIn: number; autoDriverIn: number }
  station: { name: string; alightAm: number; linkIn: number; stationIn: number; trainsPerHour: number; perTrain: number; flowPerS: number; required: number; ratio: number; spacePerPerson: number }
  parking: { arrivals: number; maxStalls: number | null }
  transitLevel: { persons: number; share: number }
  rules: RuleResult[]
}

const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })
const fmt = (x: number) => Math.round(x).toLocaleString('en-CA')
const pct = (x: number) => `${Math.round(x * 100)}%`

export function tripCheck(pop: Population, p: TripPresets = DEFAULT_TRIPS, o: { maxStalls?: number | null } = {}): TripResult {
  const split = (use: string, persons: number, direction: 'in' | 'out', s: Shares, basis: UseTrips['basis']): UseTrips => ({ use, persons, direction, transit: persons * s.transit, autoDriver: persons * s.autoDriver, other: persons * s.other, basis })
  const uses: UseTrips[] = [
    split('Office (employees arriving)', pop.office * p.officePeakShare, 'in', CBD_AM, 'destination-end (2008 diary)'),
    split('Retail and civic visitors', (pop.retailCivicM2 / 100) * p.retailPer100m2, 'in', CBD_AM, 'destination-end (2008 diary)'),
    split('Residents leaving', pop.residents * p.residentPeakShare, 'out', p.residentShares, 'unsourced scenario'),
    split('Hotel guests leaving', pop.hotelGuests * p.hotelPeakShare, 'out', p.residentShares, 'unsourced scenario'),
  ].filter((u) => u.persons > 0)
  const sum = (d: 'in' | 'out', k: 'persons' | 'transit' | 'autoDriver') => uses.filter((u) => u.direction === d).reduce((s, u) => s + u[k], 0)
  const am = { in: sum('in', 'persons'), out: sum('out', 'persons'), transitIn: sum('in', 'transit'), autoDriverIn: sum('in', 'autoDriver') }

  // Station entrance, tier 0 (research P09-M03): everything arriving by train surges once per train.
  const st = STATIONS.find((s) => s.name === p.station) ?? STATIONS[0]
  const linkIn = am.transitIn * p.linkShare
  const stationIn = st.alightAm * p.entranceShare
  const trainsPerHour = 60 / Math.max(0.5, p.headwayMin)
  const perTrain = (linkIn + stationIn) / trainsPerHour
  const flowPerS = perTrain / Math.max(10, p.dispersalS) + p.throughPerHour / 3600
  const q = p.walkSpeed / p.bandM2 // persons per metre per second at the chosen band
  const required = flowPerS / q
  const ratio = required / Math.max(0.1, p.clearWidth)
  const spacePerPerson = flowPerS > 0 ? (p.walkSpeed * p.clearWidth) / flowPerS : Infinity
  const transitLevel = { persons: linkIn, share: am.in > 0 ? linkIn / am.in : 0 }
  const maxStalls = o.maxStalls ?? null

  const rules: RuleResult[] = [
    rule('trips-am', 'AM peak-hour person trips', `${fmt(am.in)} in, ${fmt(am.out)} out`, 'reported, not judged', 'unknown', 'team_assumption', SRC.team, `From ${pop.basis}. Office: ${pct(p.officePeakShare)} of present employees arrive in the peak hour; residents ${pct(p.residentPeakShare)} and hotel guests ${pct(p.hotelPeakShare)} leave; retail and civic ${p.retailPer100m2} arrivals per 100 m². All peak-hour shares and rates are unsourced presets.`),
    rule('mode-destination', 'Mode split, trips into the tower', `transit ${pct(CBD_AM.transit)}, auto driver ${pct(CBD_AM.autoDriver)}, other ${pct(CBD_AM.other)}`, 'a destination-end row for attractions (office, retail, civic)', 'unknown', 'team_assumption', { ...SRC.diary2008, page: 'Exhibits 3.4–3.5, AM peak' }, 'Trips ending in Vancouver-CBD in fall 2008: residents of the region only, weekday, coarse geography, no confidence interval on expanded trips; “other” holds auto passenger, walk and bike together. Shown as context and used as the default split, never as a target.'),
    rule('mode-residence', 'Mode split, trips by residents and guests', `transit ${pct(p.residentShares.transit)}, auto driver ${pct(p.residentShares.autoDriver)}, other ${pct(p.residentShares.other)}`, 'a residence-end row for downtown residents', 'unknown', 'unverified', SRC.team, 'Unsourced scenario: no residence-end mode share for downtown residents was found (2023 diary report has no results; Census tables give no mode). Enter your own row with its source.'),
    rule('auto-office', 'Office commuters driving', pct(CBD_AM.autoDriver), '≤ 25% (1997 downtown planning basis); > 40% poor (preset)', CBD_AM.autoDriver <= 0.25 ? 'pass' : CBD_AM.autoDriver > 0.4 ? 'fail' : 'warn', 'team_assumption', SRC.memon, 'The 25% is the 1997 Transportation Plan basis reported by Memon, possibly superseded; the 33% comes from the 2008 destination row, before any travel-demand measures (P09-M07).'),
    rule('parking-demand', 'Parking demand (AM arrivals by car)', `${fmt(am.autoDriverIn)} cars${maxStalls !== null ? ` vs a maximum of ${fmt(maxStalls)} stalls` : ''}`, 'auto-driver arrivals × peak accumulation (1.0, upper bound); no occupancy factor on driver trips', maxStalls !== null && am.autoDriverIn > maxStalls ? 'warn' : 'unknown', 'team_assumption', SRC.diary2008, `Feeds the Parking, loading & bikes node, whose downtown maximum is unverified (by-law s.4.2.5 extract). Driver trips are vehicles already, so no occupancy factor is applied (research P09-M01 correction).`),
    rule('station-load', 'Load on the new station entrance', `${fmt(linkIn + stationIn)} people in the AM peak hour: ${fmt(linkIn)} from the tower, ${fmt(stationIn)} station riders (${pct(p.entranceShare)} of ${fmt(st.alightAm)} alighting at ${st.name}, 8–9 AM)`, 'for liaison with the station owner; no threshold', 'unknown', 'verified', { ...SRC.tspr2025, page: `2025 MF, ${st.name}, 8–9 AM alightings` }, `The neighbouring station is hypothetical, so ${st.name} is a proxy you choose. Station counts are not entrance counts; the entrance share (${pct(p.entranceShare)}) and the tower's link share (${pct(p.linkShare)}) are team assumptions.`),
    rule('passage-width', 'Link passage width (comfort)', `needs ${required.toFixed(1)} m for one train's riders passing in ${p.dispersalS} s; ${p.clearWidth.toFixed(1)} m given (${spacePerPerson === Infinity ? '—' : spacePerPerson.toFixed(2)} m² per person)`, `space per person ≥ ${p.bandM2} m² on the walkway (Fruin C/D); < 0.9 m² is LOS E`, ratio > 1 ? 'warn' : 'unknown', 'unverified', SRC.tcqsm, `Unverified scale, comfort only, not egress-compliant: no width is shown green until an egress study is attached. ${fmt(perTrain)} people per train every ${p.headwayMin} min (headway entered), walking ${p.walkSpeed} m/s.`),
    rule('egress', 'Station egress', 'not assessed', 'NFPA 130 or the authority’s criteria for evacuation and points of safety', 'unknown', 'unresolved', SRC.nfpa130, 'Egress may govern the passage and stair widths regardless of comfort; handed to the code & life-safety node and the station owner.'),
    rule('transit-level', 'Lift lobby at the transit level', `${fmt(linkIn)} of ${fmt(am.in)} AM arrivals (${pct(transitLevel.share)}) come up from the station link`, 'reported to the core & lift check', 'unknown', 'team_assumption', SRC.team, 'The lift up-peak check boards everyone at grade; with a below-grade entrance this share starts one level lower, so the lifts should also stop at the link level (or a shuttle escalator brings riders up).'),
  ]
  if (p.lineCapacity > 0) rules.push(rule('line-context', 'Tower riders on the line', `${fmt(am.transitIn)} of ${fmt(p.lineCapacity)} per hour per direction (${(am.transitIn / p.lineCapacity * 100).toFixed(1)}%)`, 'context only, no threshold', 'unknown', 'unverified', SRC.expo, 'Line capacity entered by you; the secondary source gives 12,000 per hour per direction for the Expo Line before 2009.'))
  return { uses, am, station: { name: st.name, alightAm: st.alightAm, linkIn, stationIn, trainsPerHour, perTrain, flowPerS, required, ratio, spacePerPerson }, parking: { arrivals: am.autoDriverIn, maxStalls }, transitLevel, rules }
}
