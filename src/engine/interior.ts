// Interior and activity programme (research P12-M04 occupancy bases, P12-M03 depth from glazing): typical floor
// layouts by use (unit mix for homes, keys for hotels, lease depth for offices) and an activity programme for public
// floors. When a tower has `interior` set, the lift check, egress and economics read the counts from here instead of
// their area proxies; without it they keep the proxies (flagged as such). Every preset is a team assumption.
import { coreSide } from './massing'
import type { Floor, Flag, RuleResult, RuleState, Source, Tower } from './types'

export type UnitType = 'studio' | 'one' | 'two' | 'three'
export const UNIT_TYPES: UnitType[] = ['studio', 'one', 'two', 'three']
export const UNIT_LABEL: Record<UnitType, string> = { studio: 'Studio', one: '1 bedroom', two: '2 bedrooms', three: '3 bedrooms' }
export const UNIT_SHORT: Record<UnitType, string> = { studio: 'S', one: '1B', two: '2B', three: '3B' }
/** Bedrooms or sleeping areas per unit (egress counts 2 persons per bedroom or sleeping area). */
export const BEDROOMS: Record<UnitType, number> = { studio: 1, one: 1, two: 2, three: 3 }

export interface Activity { id: string; name: string; share: number; designM2: number; egressM2: number; hours: string }

export interface InteriorInput {
  /** Share of homes by type (normalised). */
  mix: Record<UnitType, number>
  /** Net unit areas (m²). */
  sizes: Record<UnitType, number>
  /** Corridor around the core on home and hotel floors (m). */
  corridor: number
  /** Hotel key module width along the facade (m) and the deepest useful room (m). */
  keyWidth: number
  keyDepth: number
  /** Window head height below the ceiling slab (m below the floor above): head = floor-to-floor − this. */
  headDrop: number
  /** Activities on amenity / sky lobby floors that are not the public sky room. */
  amenity: Activity[]
  /** Activities in the public sky room. */
  skyRoom: Activity[]
}

const TEAM: Source = { label: 'Team assumption (research P12)' }
const VBBL_TABLE: Source = { label: 'VBBL 2019 Table 3.1.17.1 (as used by the egress check)' }
const VBBL_P9: Source = { label: 'VBBL 2019 Division B 9.9 (2 persons per bedroom or sleeping area, as read in research P12)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/2099100982' }
const PNNL: Source = { label: 'PNNL prototype scorecards (US DOE), 90.1-2004 rows, as read in research P12', url: 'https://www.energycodes.gov/sites/default/files/2023-10/PNNL_Prototype_Scorecards.xlsx' }
const LEED5: Source = { label: 'LEEDuser: NC-v5 EQc2 Occupant Experience (secondary source, research P12)', url: 'https://leeduser.buildinggreen.com/credit/NC-v5/EQc2' }
const HOUSING_MIX: Source = { label: 'City of Vancouver Family Room: Housing Mix Policy for Rezoning Projects (not opened; from memory)' }

export const DEFAULT_INTERIOR: InteriorInput = {
  mix: { studio: 0.1, one: 0.4, two: 0.35, three: 0.15 },
  sizes: { studio: 40, one: 55, two: 80, three: 105 },
  corridor: 1.8,
  keyWidth: 4.0,
  keyDepth: 8.5,
  headDrop: 1.2,
  amenity: [
    // Egress 4.6 m²/person = the egress check's amenity preset (team); switch to 1.2 (dining) if the lounge serves food.
    { id: 'lounge', name: 'Residents’ lounge', share: 0.4, designM2: 2.8, egressM2: 4.6, hours: '07:00–23:00' },
    { id: 'fitness', name: 'Fitness room', share: 0.3, designM2: 4.6, egressM2: 4.6, hours: '05:00–23:00' },
    { id: 'cowork', name: 'Co-working room', share: 0.3, designM2: 4.6, egressM2: 9.3, hours: '07:00–22:00' },
  ],
  skyRoom: [
    { id: 'gallery', name: 'Viewing gallery', share: 0.5, designM2: 2.0, egressM2: 0.4, hours: 'as the sky room' },
    { id: 'cafe', name: 'Café', share: 0.3, designM2: 1.6, egressM2: 1.2, hours: 'as the sky room' },
    { id: 'community', name: 'Community room', share: 0.2, designM2: 1.4, egressM2: 1.2, hours: 'bookable, 09:00–22:00' },
  ],
}

// ---------------------------------------------------------------- geometry
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Room { rect: Rect; label: string; area: number; kind: UnitType | 'key' | 'leftover' }

/** Four pinwheel bands between the corridor ring and the facade (tower-local metres, centred). */
export function bands(t: Tower, corridor: number): { rects: Rect[]; depth: number; inner: number } {
  const c = coreSide(t)
  const inner = Math.min(t.width, t.depth, c + 2 * corridor)
  const dx = (t.width - inner) / 2, dy = (t.depth - inner) / 2
  const W = t.width / 2, D = t.depth / 2
  // North band runs the full width minus the east band; east runs down, etc., so each corner belongs to one band.
  const rects: Rect[] = [
    { x0: -W, y0: D - dy, x1: W - dx, y1: D },
    { x0: W - dx, y0: -D + dy, x1: W, y1: D },
    { x0: -W + dx, y0: -D, x1: W, y1: -D + dy },
    { x0: -W, y0: -D, x1: -W + dx, y1: D - dy },
  ]
  return { rects, depth: Math.min(dx, dy), inner }
}
const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)
const along = (r: Rect) => Math.max(r.x1 - r.x0, r.y1 - r.y0)
/** Cut a band into consecutive pieces of the given lengths (along its long side). */
function cut(r: Rect, lengths: number[]): Rect[] {
  const horiz = r.x1 - r.x0 >= r.y1 - r.y0
  const out: Rect[] = []
  let p = horiz ? r.x0 : r.y0
  for (const L of lengths) { out.push(horiz ? { x0: p, y0: r.y0, x1: p + L, y1: r.y1 } : { x0: r.x0, y0: p, x1: r.x1, y1: p + L }); p += L }
  return out
}

/** Largest-remainder split of n items by shares. */
export function splitCount(n: number, shares: Record<UnitType, number>): Record<UnitType, number> {
  const tot = UNIT_TYPES.reduce((s, u) => s + Math.max(0, shares[u]), 0) || 1
  const raw = UNIT_TYPES.map((u) => (n * Math.max(0, shares[u])) / tot)
  const out = Object.fromEntries(UNIT_TYPES.map((u, i) => [u, Math.floor(raw[i])])) as Record<UnitType, number>
  let left = n - UNIT_TYPES.reduce((s, u) => s + out[u], 0)
  UNIT_TYPES.map((u, i) => [raw[i] - Math.floor(raw[i]), u] as const).sort((a, b) => b[0] - a[0]).forEach(([, u]) => { if (left > 0) { out[u]++; left-- } })
  return out
}

export interface HomeFloor { kind: 'homes'; units: Record<UnitType, number>; homes: number; bedrooms: number; net: number; used: number; rooms: Room[]; depth: number }
export interface HotelFloor { kind: 'hotel'; keys: number; m2PerKey: number; net: number; rooms: Room[]; depth: number }
export interface OfficeFloor { kind: 'office'; leaseDepth: number; within6: number; withinHead: number; head: number; net: number }
export interface PublicFloor { kind: 'public'; activities: (Activity & { area: number; design: number; egress: number })[]; design: number; egress: number; net: number; room: boolean }
export type FloorLayout = HomeFloor | HotelFloor | OfficeFloor | PublicFloor

/** Floor area outside the core and corridor ring. */
export function ringNet(t: Tower, corridor: number): number { return bands(t, corridor).rects.reduce((s, r) => s + area(r), 0) }

export function homeFloor(t: Tower, i: InteriorInput): HomeFloor {
  const b = bands(t, i.corridor)
  const net = b.rects.reduce((s, r) => s + area(r), 0)
  const tot = UNIT_TYPES.reduce((s, u) => s + Math.max(0, i.mix[u]), 0) || 1
  const avg = UNIT_TYPES.reduce((s, u) => s + (Math.max(0, i.mix[u]) / tot) * i.sizes[u], 0)
  let n = Math.max(0, Math.floor(net / Math.max(1, avg)))
  let units = splitCount(n, i.mix)
  const used = () => UNIT_TYPES.reduce((s, u) => s + units[u] * i.sizes[u], 0)
  while (n > 0 && used() > net) { n--; units = splitCount(n, i.mix) }
  // Lay the units out band by band, largest first, each unit as long as its area over the band depth.
  const list = UNIT_TYPES.slice().reverse().flatMap((u) => Array.from({ length: units[u] }, () => u))
  const rooms: Room[] = []
  let k = 0
  for (const r of b.rects) {
    const d = Math.min(r.x1 - r.x0, r.y1 - r.y0), len = along(r)
    const lengths: number[] = [], kinds: UnitType[] = []
    let sum = 0
    while (k < list.length && sum + i.sizes[list[k]] / d <= len + 1e-6) { const L = i.sizes[list[k]] / d; lengths.push(L); kinds.push(list[k]); sum += L; k++ }
    const pieces = cut(r, [...lengths, Math.max(0, len - sum)])
    kinds.forEach((u, j) => rooms.push({ rect: pieces[j], label: UNIT_SHORT[u], area: i.sizes[u], kind: u }))
    if (len - sum > 0.5) rooms.push({ rect: pieces[pieces.length - 1], label: '', area: (len - sum) * d, kind: 'leftover' })
  }
  // Units that did not fit a band as one piece are dropped from the count (the drawing is the count).
  const placed = Object.fromEntries(UNIT_TYPES.map((u) => [u, rooms.filter((r) => r.kind === u).length])) as Record<UnitType, number>
  const homes = UNIT_TYPES.reduce((s, u) => s + placed[u], 0)
  return { kind: 'homes', units: placed, homes, bedrooms: UNIT_TYPES.reduce((s, u) => s + placed[u] * BEDROOMS[u], 0), net, used: UNIT_TYPES.reduce((s, u) => s + placed[u] * i.sizes[u], 0), rooms, depth: b.depth }
}

export function hotelFloor(t: Tower, i: InteriorInput): HotelFloor {
  const b = bands(t, i.corridor)
  const net = b.rects.reduce((s, r) => s + area(r), 0)
  const rooms: Room[] = []
  for (const r of b.rects) {
    const len = along(r), n = Math.floor(len / Math.max(2.5, i.keyWidth))
    const w = n ? len / n : 0
    cut(r, Array.from({ length: n }, () => w)).forEach((rect) => rooms.push({ rect, label: '', area: w * Math.min(r.x1 - r.x0, r.y1 - r.y0), kind: 'key' }))
  }
  const keys = rooms.length
  return { kind: 'hotel', keys, m2PerKey: keys ? net / keys : 0, net, rooms, depth: b.depth }
}

export function officeFloor(t: Tower, f: Floor, i: InteriorInput): OfficeFloor {
  const c = coreSide(t)
  const leaseDepth = Math.min(t.width, t.depth) / 2 - c / 2
  const head = Math.max(2.2, f.z1 - f.z0 - i.headDrop)
  // Share of the floor outside the core within a distance of the facade (rectangular plate, central core).
  const within = (d: number) => {
    const plate = t.width * t.depth - c * c
    const iw = Math.max(c, t.width - 2 * d), id = Math.max(c, t.depth - 2 * d)
    return plate > 0 ? (t.width * t.depth - iw * id) / plate : 0
  }
  return { kind: 'office', leaseDepth, within6: within(6), withinHead: within(3 * head), head, net: t.width * t.depth - c * c }
}

export function publicFloor(t: Tower, f: Floor, i: InteriorInput, net: number): PublicFloor {
  const room = !!(t.skyRoom && t.skyRoom.level === f.level)
  const list = room ? i.skyRoom : i.amenity
  const tot = list.reduce((s, a) => s + Math.max(0, a.share), 0) || 1
  const activities = list.map((a) => { const A = (net * Math.max(0, a.share)) / tot; return { ...a, area: A, design: A / Math.max(0.3, a.designM2), egress: A / Math.max(0.3, a.egressM2) } })
  return { kind: 'public', activities, design: activities.reduce((s, a) => s + a.design, 0), egress: activities.reduce((s, a) => s + a.egress, 0), net, room }
}

export function floorLayout(t: Tower, f: Floor): FloorLayout | null {
  const i = t.interior
  if (!i || f.podium) return null
  if (f.use === 'residential' && !f.skyLobby) return homeFloor(t, i)
  if (f.use === 'hotel' && !f.skyLobby) return hotelFloor(t, i)
  if (f.use === 'office') return officeFloor(t, f, i)
  if (f.use === 'amenity' || f.skyLobby) return publicFloor(t, f, i, Math.max(0, f.area - t.coreShare * t.width * t.depth))
  return null
}

/** Counts the lift check, egress and economics read when a layout exists (null = use their area proxy). */
export function floorCounts(t: Tower, f: Floor): { homes?: number; bedrooms?: number; keys?: number; publicEgress?: number; publicDesign?: number } | null {
  const l = floorLayout(t, f)
  if (!l) return null
  if (l.kind === 'homes') return { homes: l.homes, bedrooms: l.bedrooms }
  if (l.kind === 'hotel') return { keys: l.keys }
  if (l.kind === 'public' && !l.room) return { publicEgress: l.egress, publicDesign: l.design }
  return null
}

// ---------------------------------------------------------------- results
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

export interface InteriorResult {
  on: boolean
  home: HomeFloor | null; homeFloors: number
  hotel: HotelFloor | null; hotelFloors: number
  office: OfficeFloor | null
  publics: { level: number; layout: PublicFloor }[]
  totals: { homes: number; bedrooms: number; keys: number; units: Record<UnitType, number> }
  rules: RuleResult[]
}

export function interiorCheck(t: Tower, floors: Floor[]): InteriorResult {
  const i = t.interior ?? DEFAULT_INTERIOR
  const on = !!t.interior
  const tw = { ...t, interior: i }
  const homeF = floors.filter((f) => !f.podium && !f.skyLobby && f.use === 'residential')
  const hotelF = floors.filter((f) => !f.podium && !f.skyLobby && f.use === 'hotel')
  const officeF = floors.filter((f) => !f.podium && f.use === 'office')
  const home = homeF.length ? homeFloor(tw, i) : null
  const hotel = hotelF.length ? hotelFloor(tw, i) : null
  const office = officeF.length ? officeFloor(tw, officeF[Math.floor(officeF.length / 2)], i) : null
  const publics = floors.filter((f) => !f.podium && (f.use === 'amenity' || f.skyLobby)).map((f) => ({ level: f.level, layout: publicFloor(tw, f, i, Math.max(0, f.area - t.coreShare * t.width * t.depth)) }))
  const units = Object.fromEntries(UNIT_TYPES.map((u) => [u, (home?.units[u] ?? 0) * homeF.length])) as Record<UnitType, number>
  const totals = { homes: (home?.homes ?? 0) * homeF.length, bedrooms: (home?.bedrooms ?? 0) * homeF.length, keys: (hotel?.keys ?? 0) * hotelF.length, units }
  const rules: RuleResult[] = []
  rules.push(rule('in-feed', 'Counts used by lifts, egress and economics', on ? 'from this layout' : 'area proxies (no layout yet)', 'a layout per use once the unit mix is chosen', on ? 'pass' : 'warn', on ? 'team_assumption' : 'unverified', TEAM,
    on ? 'Homes, bedrooms and hotel keys come from the drawn layout; office and retail keep their area densities.' : 'Lifts use 75 m² per home and 40 m² per key, egress 1.5 bedrooms per home: proxies. Switch on the layout to replace them.'))
  if (home) {
    const fam = home.homes ? (home.units.two + home.units.three) / home.homes : 0
    rules.push(rule('in-homes', 'Homes per floor', `${home.homes} (${UNIT_TYPES.filter((u) => home.units[u]).map((u) => `${home.units[u]} × ${UNIT_SHORT[u]}`).join(', ')}) · ${totals.homes.toLocaleString('en-CA')} in the tower`, 'every unit fits the band between corridor and facade', home.used / Math.max(1, home.net) >= 0.85 ? 'pass' : 'warn', 'team_assumption', TEAM,
      `${Math.round((home.used / Math.max(1, home.net)) * 100)}% of the ${Math.round(home.net)} m² outside the core and corridor is in units; unit depth ${home.depth.toFixed(1)} m (core to facade minus a ${i.corridor} m corridor).`))
    rules.push(rule('in-depth-res', 'Home depth from the facade', `${home.depth.toFixed(1)} m`, 'about 7–12 m so living rooms and bedrooms get daylight (team rule of thumb)', home.depth <= 12 ? 'pass' : 'warn', 'team_assumption', TEAM))
    rules.push(rule('in-family', 'Family homes (2+ bedrooms)', `${Math.round(fam * 100)}% of homes`, '≥ 35% (Housing Mix Policy for rezonings, recalled, not opened)', fam >= 0.35 ? 'pass' : 'warn', 'unverified', HOUSING_MIX, 'Confirm the current policy and whether it applies to this rezoning before relying on it.'))
    rules.push(rule('in-people-res', 'People in the homes', `${Math.round(totals.bedrooms * 2).toLocaleString('en-CA')} for egress (2 per bedroom) · ${Math.round(totals.homes * 2.5).toLocaleString('en-CA')} for design (2.5 per home)`, 'egress uses the larger, design and energy use the typical', 'pass', 'verified', VBBL_P9, 'The 2.5 persons per apartment is the PNNL design density (US 2004 prototype rows, unverified for Vancouver).'))
  }
  if (hotel) {
    rules.push(rule('in-keys', 'Hotel keys per floor', `${hotel.keys} (${Math.round(hotel.m2PerKey)} m² per key incl. share of the floor) · ${totals.keys.toLocaleString('en-CA')} in the tower`, `rooms ${i.keyWidth} m wide along the facade, up to ${i.keyDepth} m deep`, hotel.depth <= i.keyDepth + 1.5 ? 'pass' : 'warn', 'team_assumption', TEAM,
      hotel.depth > i.keyDepth + 1.5 ? `The band is ${hotel.depth.toFixed(1)} m deep: rooms deeper than ${i.keyDepth} m waste floor; a wider corridor or a deeper core would tighten it.` : undefined))
    rules.push(rule('in-people-hotel', 'Hotel guests', `${totals.keys * 2} for egress (2 per room) · ${Math.round(totals.keys * 1.5)} for design (1.5 per room)`, 'egress 2 per sleeping room', 'pass', 'verified', VBBL_P9, 'The 1.5 per room design figure is the PNNL scorecard value (unverified for Vancouver).'))
  }
  if (office) {
    rules.push(rule('in-lease', 'Office lease depth (facade to core)', `${office.leaseDepth.toFixed(1)} m`, '≤ about 12–14 m for a daylit, flexible plate (team)', office.leaseDepth <= 14 ? 'pass' : 'warn', 'team_assumption', TEAM))
    rules.push(rule('in-6m', 'Office floor within 6 m of glazing', `${Math.round(office.within6 * 100)}%`, '≥ 30% (LEED v5 EQc2 option 5, path 3)', office.within6 >= 0.3 ? 'pass' : 'warn', 'unverified', LEED5, 'Secondary source; USGBC text not opened. Voluntary benchmark, not a by-law.'))
    rules.push(rule('in-head', 'Within 3 × window head height', `${Math.round(office.withinHead * 100)}% (head at ${office.head.toFixed(1)} m)`, 'reference line 75% (team reading of the LEED views test)', office.withinHead >= 0.75 ? 'pass' : 'warn', 'team_assumption', LEED5))
  }
  for (const p of publics) {
    const l = p.layout
    rules.push(rule(`in-public-${p.level}`, `${l.room ? 'Public sky room' : 'Amenity floor'}, level ${p.level}`, `${l.activities.map((a) => `${a.name} ${Math.round(a.area)} m²`).join(' · ')}: about ${Math.round(l.design)} people at a comfortable density`, l.room ? 'egress from the sky room check' : `egress load ${Math.round(l.egress)} people`, 'pass', 'team_assumption', l.room ? TEAM : VBBL_TABLE,
      `${l.activities.map((a) => `${a.name}: ${a.hours}`).join('; ')}. Egress densities per activity: Table 3.1.17.1 factors already used by the egress check where one fits (dining 1.2, standing 0.4, office 9.3); lounge and fitness use the team amenity value 4.6.`))
  }
  rules.push(rule('in-design-density', 'Design densities (energy, comfort)', 'PNNL prototype values', 'not used for lifts or egress', 'unknown', 'unverified', PNNL, 'Kept apart on purpose: energy and comfort densities never feed lift or egress sizing (research P12-M04).'))
  return { on, home, homeFloors: homeF.length, hotel, hotelFloors: hotelF.length, office, publics, totals, rules }
}
