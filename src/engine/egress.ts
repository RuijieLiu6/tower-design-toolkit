// Egress sizing (research P11-M06, occupancy mapping from P11-M09): occupant load per storey, exit stair width,
// stair core area, exits per floor, exit separation, travel distance and flight rise.
// Values are VBBL 2019 Part 3 (consolidated 1 Jul 2024), equal to VBBL 2007; VBBL 2025 and BCBC 2024 are unread,
// so every rule carries an edition note. Early check, not a code review: a code consultant decides.
import { coreSide, towerFloors } from './massing'
import type { Floor, RuleResult, StairPlacement, Tower } from './types'
import { floorCounts } from './interior'

export interface EgressPresets {
  /** Exit stairs per floor (at least two, 3.4.2.1). */
  stairs: number
  /** Riser (m). At most 0.18 with a run of at least 0.28 keeps the 8 mm per person stair rate (3.4.3.2). */
  riser: number
  /** Tread run (m). */
  tread: number
  /** Average bedrooms per home (2 persons per sleeping room, 3.1.17.1). */
  bedroomsPerHome: number
  /** Office floors have a public corridor, so exits need be only 9 m apart (3.4.2.3). Team assumption: open plan. */
  officeCorridor: boolean
  /** m² per person on amenity and civic floors. Team mapping: 4.6 (the personal-services factor) until a floor is
   *  programmed; 1.2 if it is a dining room, 0.4 if people stand. */
  amenityFactor: number
}

export const DEFAULT_EGRESS_PRESETS: EgressPresets = { stairs: 2, riser: 0.18, tread: 0.28, bedroomsPerHome: 1.5, officeCorridor: false, amenityFactor: 4.6 }

/** Table 3.1.17.1 occupant load factors, m² per person (VBBL 2019 = VBBL 2007; research P11-S62, P11-S47). */
export const LOAD_FACTOR = { office: 9.3, personalServices: 4.6, mercantileFirst: 3.7, mercantileUpper: 5.6, dining: 1.2, standing: 0.4, publicCorridor: 3.7 }
export const STAIR_MIN_MM = 1100
export const TRAVEL_LIMIT_M = 45
export const FLIGHT_MAX_M = 3.7

const VBBL_EXITS = { label: 'Vancouver Building By-law 2019, Part 3, Section 3.4 Exits (same in VBBL 2007; VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/463712062' }
const VBBL_GENERAL = { label: 'Vancouver Building By-law 2019, Table 3.1.17.1 occupant loads (same in VBBL 2007; VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/519280133' }

/** Inputs shared with the lift presets: area per home and per hotel key. */
export interface LoadInputs { homeM2: number; hotelM2PerKey: number }

export interface StoreyLoad {
  level: number
  z: number
  f2f: number
  use: Floor['use']
  podium: boolean
  skyLobby: boolean
  publicRoom: boolean
  net: number
  load: number
  basis: string
  /** Width each stair needs for this storey alone (mm). */
  needMm: number
  /** Width each stair must have where it passes this storey: the largest need at or above it (mm). */
  stairMm: number
}

/** Net area of a floor: its plate less the core (team assumption; the code measures the floor area served). */
function netOf(f: Floor, t: Tower): number {
  return Math.max(0, f.area - t.coreShare * t.width * t.depth)
}

/**
 * Loads on a public sky room floor: the visitor room at its Table 3.1.17.1 load (`table`) or a lower posted limit
 * (`visitors`), plus the rest of the floor (lift lobby, back of house) as a public corridor.
 */
export function skyRoomLoads(t: Tower, net: number): { visitors: number; table: number; remainder: number; floor: number } {
  const r = t.skyRoom
  if (!r) { const f = net / LOAD_FACTOR.publicCorridor; return { visitors: 0, table: 0, remainder: f, floor: f } }
  const table = (net * r.visitorShare) / (r.loadBasis === 'standing' ? LOAD_FACTOR.standing : LOAD_FACTOR.dining)
  const visitors = r.postedLimit != null && r.postedLimit >= 0 ? Math.min(table, r.postedLimit) : table
  const remainder = (net * (1 - r.visitorShare)) / LOAD_FACTOR.publicCorridor
  return { visitors, table, remainder, floor: visitors + remainder }
}

/**
 * The largest posted visitor limit at which the sky room no longer widens the exit stairs: its floor then needs no
 * more than the widest of the other tower storeys (or the 1100 mm minimum). Null without a room.
 */
export function postedLimitForRoom(t: Tower, e: EgressPresets, li: LoadInputs = { homeM2: 75, hotelM2PerKey: 40 }): { limit: number; widthMm: number } | null {
  if (!t.skyRoom) return null
  const f = towerFloors(t).find((x) => x.skyLobby && x.level === t.skyRoom!.level)
  if (!f) return null
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2
  const n = Math.max(2, Math.round(e.stairs))
  const others = storeyLoads(t, e, li).filter((s) => !s.podium && s.z > 0.5 && s.level !== f.level)
  const widthMm = Math.max(STAIR_MIN_MM, ...others.map((s) => s.needMm))
  return { limit: Math.max(0, Math.floor((widthMm * n) / rate - skyRoomLoads(t, netOf(f, t)).remainder)), widthMm }
}

export interface StairSpot { x: number; y: number; inCore: boolean }

/** Centres of the exit stairs on the plate (team assumption on geometry), for enclosures a × b. */
export function stairSpots(t: Tower, n: number, a: number, b: number, placement: StairPlacement = t.stairPlacement ?? 'core'): StairSpot[] {
  // In the core, stairs sit against the inner face of its 400 mm walls (team assumption, as drawn on the board plan).
  const c = Math.max(0, coreSide(t) - 0.8)
  const inCore = (i: number, j: number): StairSpot => ({ x: i * Math.max(0, c / 2 - a / 2), y: j * Math.max(0, c / 2 - b / 2), inCore: true })
  const atEdge = (i: number, j: number): StairSpot => ({ x: i * Math.max(0, t.width / 2 - a / 2), y: j * Math.max(0, t.depth / 2 - b / 2), inCore: false })
  const order = [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const
  const k = Math.min(4, Math.max(2, n))
  if (placement === 'perimeter') return order.slice(0, k).map(([i, j]) => atEdge(i, j))
  if (placement === 'mixed') return order.slice(0, k).map(([i, j], m) => (m === 1 ? atEdge(i, j) : inCore(i, j)))
  return order.slice(0, k).map(([i, j]) => inCore(i, j))
}

export const PLACEMENT_LABEL: Record<StairPlacement, string> = {
  core: 'both in the core',
  mixed: 'one in the core, one at the far plate corner',
  perimeter: 'at opposite plate corners',
}

/** Occupant load per storey and the stair width each storey needs (3.1.17.1, 3.4.3.2). */
export function storeyLoads(t: Tower, e: EgressPresets, li: LoadInputs): StoreyLoad[] {
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2
  const n = Math.max(2, Math.round(e.stairs))
  const out: StoreyLoad[] = towerFloors(t).map((f) => {
    const net = netOf(f, t)
    const publicRoom = !!(f.skyLobby && t.skyRoom && t.skyRoom.level === f.level)
    const c = floorCounts(t, f)
    let load = 0, basis = ''
    if (publicRoom) {
      const r = t.skyRoom!, l = skyRoomLoads(t, net)
      load = l.floor
      basis = r.postedLimit != null && l.visitors < l.table
        ? `public sky room, posted limit ${Math.round(l.visitors)} visitors (Table load ${Math.round(l.table)})`
        : `public sky room, ${r.loadBasis} ${r.loadBasis === 'standing' ? LOAD_FACTOR.standing : LOAD_FACTOR.dining} m²/person on ${Math.round(r.visitorShare * 100)}% of the floor`
    }
    else if (f.skyLobby && c?.publicEgress !== undefined) { load = c.publicEgress; basis = 'sky lobby activities (interior programme)' }
    else if (f.skyLobby) { const k = Math.max(0.3, e.amenityFactor); load = net / k; basis = `sky lobby as amenity, ${k} m²/person` }
    else if (f.use === 'office') { load = net / LOAD_FACTOR.office; basis = 'office, 9.3 m²/person' }
    else if (f.use === 'retail') { const k = f.z0 < 0.5 ? LOAD_FACTOR.mercantileFirst : LOAD_FACTOR.mercantileUpper; load = net / k; basis = `mercantile, ${k} m²/person` }
    else if (f.use === 'residential' && c?.bedrooms !== undefined) { load = c.bedrooms * 2; basis = `${c.homes} homes, ${c.bedrooms} bedrooms × 2 persons (interior layout)` }
    else if (f.use === 'residential') { load = (net / li.homeM2) * e.bedroomsPerHome * 2; basis = `homes × ${e.bedroomsPerHome} bedrooms × 2 persons` }
    else if (f.use === 'hotel' && c?.keys !== undefined) { load = c.keys * 2; basis = `${c.keys} hotel keys × 2 persons (interior layout)` }
    else if (f.use === 'hotel') { load = (net / li.hotelM2PerKey) * 2; basis = 'hotel keys × 2 persons' }
    else if (f.use === 'amenity' && c?.publicEgress !== undefined) { load = c.publicEgress; basis = 'amenity activities (interior programme)' }
    else if (f.use === 'amenity' || f.use === 'civic') { const k = Math.max(0.3, e.amenityFactor); load = net / k; basis = `${f.use === 'civic' ? 'civic' : 'amenity'}, ${k} m²/person` }
    else { load = 0; basis = 'plant (service space)' }
    const needMm = Math.max(STAIR_MIN_MM, (load * rate) / n)
    return { level: f.level, z: f.z0, f2f: f.z1 - f.z0, use: f.use, podium: f.podium, skyLobby: !!f.skyLobby, publicRoom, net, load, basis, needMm, stairMm: needMm }
  })
  // Width need not accumulate for floors one above the other (3.4.3.2.(4)), but a stair must be wide enough
  // for every storey it serves, so below a heavily loaded floor it keeps that floor's width down to grade.
  // The core stairs serve the tower floors; podium floors get exits of their own (team assumption, see the podium rules).
  let run = STAIR_MIN_MM
  for (let i = out.length - 1; i >= 0; i--) { if (!out[i].podium) run = Math.max(run, out[i].needMm); out[i].stairMm = run }
  return out
}

/** Plan of one switchback stair enclosure (m): two flights per storey, landings as deep as the stair is wide (team assumption). */
export function stairEnclosure(widthMm: number, f2f: number, e: EgressPresets): { a: number; b: number; area: number; flightRise: number } {
  const w = widthMm / 1000
  const risers = Math.ceil(f2f / Math.max(0.1, e.riser) - 1e-9)
  const perFlight = Math.ceil(risers / 2)
  const run = Math.max(0, perFlight - 1) * e.tread
  const a = 2 * w + 0.1, b = run + 2 * w
  return { a, b, area: a * b, flightRise: (perFlight * f2f) / risers }
}

/** Stair area at each level, split into stairs inside the core and stairs at the plate edge (used by the core & lift check). */
export function stairAreaByLevel(t: Tower, e: EgressPresets, li: LoadInputs): { core: Map<number, number>; edge: Map<number, number> } {
  const n = Math.max(2, Math.round(e.stairs))
  const spots = stairSpots(t, n, 1, 1)
  const inCore = spots.filter((s) => s.inCore).length, atEdge = spots.length - inCore
  const core = new Map<number, number>(), edge = new Map<number, number>()
  for (const s of storeyLoads(t, e, li)) {
    const area = stairEnclosure(s.stairMm, s.f2f, e).area
    core.set(s.level, inCore * area)
    edge.set(s.level, atEdge * area)
  }
  return { core, edge }
}

export interface EgressResult {
  storeys: StoreyLoad[]
  stairs: number
  placement: StairPlacement
  /** Stair centres on the typical tower plate, at the governing width. */
  spots: StairSpot[]
  /** The plate corner farthest from any stair, for the plan diagram. */
  farCorner: [number, number]
  governing: StoreyLoad | null
  widthMm: number
  enclosure: { a: number; b: number; area: number }
  separation: number
  separationNeeded: number
  travel: number
  podiumTravel: number | null
  rules: RuleResult[]
}

const fmt = (v: number) => Math.round(v).toLocaleString()

export function egressCheck(t: Tower, e: EgressPresets = DEFAULT_EGRESS_PRESETS, li: LoadInputs = { homeM2: 75, hotelM2PerKey: 40 }): EgressResult {
  const storeys = storeyLoads(t, e, li)
  const n = Math.max(2, Math.round(e.stairs))
  const above = storeys.filter((s) => s.z > 0.5)
  const towerAbove = above.filter((s) => !s.podium)
  const governing = towerAbove.reduce<StoreyLoad | null>((m, s) => (!m || s.needMm > m.needMm ? s : m), null)
  // Upper podium floors exit by stairs; the ground floor exits through street doors.
  const podiumBusiest = storeys.filter((s) => s.podium && s.z > 0.5).reduce<StoreyLoad | null>((m, s) => (!m || s.load > m.load ? s : m), null)
  const widthMm = governing?.stairMm ?? STAIR_MIN_MM
  const typical = storeys.find((s) => !s.podium && s.z > 0.5) ?? storeys[0]
  const enclosure = stairEnclosure(widthMm, typical?.f2f ?? t.f2f, e)
  const narrow = stairEnclosure(STAIR_MIN_MM, typical?.f2f ?? t.f2f, e)

  // Geometry (team assumption): stairs at the chosen spots on a plate with a square core centred on it.
  const c = coreSide(t)
  const placement = t.stairPlacement ?? 'core'
  const spots = stairSpots(t, n, enclosure.a, enclosure.b, placement)
  let separation = 0
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) separation = Math.max(separation, Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y))
  const halfDiag = Math.hypot(t.width, t.depth) / 2
  const openUses = above.filter((s) => !s.podium && (s.use === 'office' ? !e.officeCorridor : s.use !== 'residential' && s.use !== 'hotel' && s.use !== 'mechanical'))
  const separationNeeded = openUses.length ? halfDiag : Math.min(halfDiag, 9)
  // Travel: farthest plate corner to the nearest stair, straight line (a proxy; the research method is a visibility graph).
  const corners = (W: number, D: number) => ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([i, j]) => {
    const x = (i * W) / 2, y = (j * D) / 2
    return { x, y, d: Math.min(...spots.map((s) => Math.hypot(x - s.x, y - s.y))) }
  })
  const towerCorners = corners(t.width, t.depth)
  const far = towerCorners.reduce((m, k) => (k.d > m.d ? k : m))
  const travel = far.d
  const podiumTravel = t.podiumHeight > 0 ? Math.max(...corners(t.podiumWidth, t.podiumDepth).map((k) => k.d)) : null
  const edgeSpots = spots.filter((s) => !s.inCore).length
  const maxFlight = Math.max(...storeys.map((s) => stairEnclosure(s.stairMm, s.f2f, e).flightRise))
  const rate = e.riser <= 0.18 && e.tread >= 0.28 ? 8 : 9.2

  const rules: RuleResult[] = []
  rules.push({
    id: `stair-width-${t.id}`,
    label: 'Exit stair width',
    value: `${n} stairs × ${fmt(widthMm)} mm, ${PLACEMENT_LABEL[placement]}${governing ? `; set by level ${governing.level} (${fmt(governing.load)} people)` : ''}`,
    threshold: `≥ ${STAIR_MIN_MM} mm and ≥ ${rate} mm per person ÷ ${n} stairs, storey by storey`,
    state: 'pass',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.3.2 and Table 3.4.3.2.-A' },
    note: `Sized to the busiest storey; width does not accumulate down the tower (3.4.3.2.(4)), but each stair keeps the widest need of the storeys it serves. ${rate === 8 ? 'Risers ≤ 180 mm and treads ≥ 280 mm keep the 8 mm rate.' : 'Steeper stairs use 9.2 mm per person.'} Whether width accumulates in VBBL 2025 is unresolved.`,
  })
  if (governing && governing.needMm > STAIR_MIN_MM + 1) {
    const below = above.filter((s) => s.z < governing.z && !s.podium).length
    const extra = n * (stairEnclosure(governing.needMm, typical.f2f, e).area - narrow.area)
    rules.push({
      id: `stair-driver-${t.id}`,
      label: 'One floor sets the stair width',
      value: `Level ${governing.level} (${governing.basis.split(',')[0]}) needs ${fmt(governing.needMm)} mm stairs from there down`,
      threshold: `${STAIR_MIN_MM} mm everywhere else`,
      state: 'warn',
      flag: 'team_assumption',
      source: { label: 'Team design flag on the 3.4.3.2 sizing (not a code limit)' },
      note: `${fmt(governing.load)} people (${governing.basis}). Wider stairs add about ${fmt(extra)} m² of core on each of the ${below} tower floors below. Options: post a lower occupant load, add a third stair, or an alternative solution with phased evacuation (fire engineer).`,
    })
  }
  rules.push({
    id: `exits-${t.id}`,
    label: 'Exits per floor',
    value: `${n} exit stairs`,
    threshold: 'at least 2 (3.4.2.1)',
    state: n >= 2 ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.1' },
  })
  rules.push({
    id: `separation-${t.id}`,
    label: 'Exit separation',
    value: `${separation.toFixed(1)} m between the stairs`,
    threshold: `≥ ${separationNeeded.toFixed(1)} m (half the plate diagonal${openUses.length ? '' : '; 9 m cap with public corridors'})`,
    state: separation >= separationNeeded - 0.05 ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.3' },
    note: `Stairs ${PLACEMENT_LABEL[placement]}${placement === 'core' ? ` of a ${c.toFixed(1)} m core` : ''} (team assumption on geometry). ${openUses.length ? `Open-plan floors (${[...new Set(openUses.map((s) => s.use))].join(', ')}) need half the ${(2 * halfDiag).toFixed(1)} m diagonal; floors with a public corridor need only 9 m. ` : ''}${placement === 'core' ? 'A central core often fails this on open floors: move a stair to the plate edge, split or widen the core, or show a public corridor.' : `${edgeSpots} stair${edgeSpots > 1 ? 's' : ''} at the plate edge take about ${fmt(edgeSpots * enclosure.area)} m² of lettable floor and ${(edgeSpots * (enclosure.a + enclosure.b)).toFixed(0)} m of facade per floor.`}`,
  })
  rules.push({
    id: `travel-${t.id}`,
    label: 'Travel distance, tower floors',
    value: `${travel.toFixed(1)} m from the farthest corner`,
    threshold: `≤ ${TRAVEL_LIMIT_M} m, sprinklered (3.4.2.5.(1)(c))`,
    state: travel <= TRAVEL_LIMIT_M ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.2.5' },
    note: 'Straight-line distance to the nearer stair, a proxy (unverified method): the real path bends around the core and furniture. Every new building is sprinklered (3.2.2.18.(3)).',
  })
  if (podiumBusiest) {
    const width = podiumBusiest.load * rate
    rules.push({
      id: `podium-exits-${t.id}`,
      label: 'Podium exits',
      value: `Level ${podiumBusiest.level}: ${fmt(podiumBusiest.load)} people need about ${(width / 1000).toFixed(1)} m of exit stair width`,
      threshold: `${rate} mm per person, at least 2 exits, none counted for more than half`,
      state: 'warn',
      flag: 'verified',
      source: { ...VBBL_EXITS, page: '3.4.3.2' },
      note: `${podiumBusiest.basis}. The tower core stairs are sized for the tower floors only (team assumption), so the podium needs exits of its own: about ${Math.ceil(width / 2 / 100) / 10} m each if there are two, or more, narrower exits at its edges.`,
    })
  }
  if (podiumTravel !== null) {
    rules.push({
      id: `travel-podium-${t.id}`,
      label: 'Travel distance, podium floors',
      value: `${podiumTravel.toFixed(1)} m to the core stairs`,
      threshold: `≤ ${TRAVEL_LIMIT_M} m`,
      state: podiumTravel <= TRAVEL_LIMIT_M ? 'pass' : 'fail',
      flag: 'verified',
      source: { ...VBBL_EXITS, page: '3.4.2.5' },
      note: podiumTravel <= TRAVEL_LIMIT_M ? 'The tower stairs reach the whole podium.' : 'The podium needs its own exits: the tower core stairs are too far from its corners.',
    })
  }
  rules.push({
    id: `flight-${t.id}`,
    label: 'Rise per stair flight',
    value: `${maxFlight.toFixed(2)} m (two flights per storey)`,
    threshold: `≤ ${FLIGHT_MAX_M} m (3.4.6.3)`,
    state: maxFlight <= FLIGHT_MAX_M ? 'pass' : 'fail',
    flag: 'verified',
    source: { ...VBBL_EXITS, page: '3.4.6.3' },
  })
  rules.push({
    id: `loads-${t.id}`,
    label: 'Occupant load basis',
    value: governing ? `Busiest storey: level ${governing.level}, ${fmt(governing.load)} people` : '—',
    threshold: 'Table 3.1.17.1 factors',
    state: 'pass',
    flag: 'verified',
    source: VBBL_GENERAL,
    note: `Office 9.3, personal services 4.6, mercantile 3.7 (first storey) or 5.6, dining 1.2, standing 0.4, public corridor 3.7 m² per person; 2 persons per sleeping room. Team mapping: amenity, civic and tenant sky-lobby floors at ${e.amenityFactor} m² per person until programmed, hotel keys as 2 persons, plant floors as 0, net area = floor less the core.`,
  })

  return { storeys, stairs: n, placement, spots, farCorner: [far.x, far.y], governing, widthMm, enclosure, separation, separationNeeded, travel, podiumTravel, rules }
}
