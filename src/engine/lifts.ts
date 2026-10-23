// Core and lift check (research P11-M01 lift traffic sizing, P11-M02 sky lobbies, with the core-ratio work in P08-M02 and P10-M05).
// Deterministic up-peak round-trip-time estimate per lift group, then the core area those lifts need, level by level.
// Early sizing, not certification: waiting and destination times need simulation (roadmap).
// Research: 04 Tool Plan/research/modules-completion/P11/revise-r2_P11.json (single pass since 22 Oct; see flags there).
import { DEFAULT_EGRESS_PRESETS, skyRoomLoads, stairAreaByLevel, type EgressPresets } from './egress'
import { netToGross, towerFloors } from './massing'
import { floorCounts } from './interior'
import { coreLayout } from './plan'
import type { Floor, RuleResult, RuleState, Tower } from './types'

export interface LiftPresets {
  /** Office net area per person (m²). Stopes: "expected 1 per 10" at 22 Bishopsgate (P11-S22); UQ uses 12 (P11-S25). */
  officeM2PerPerson: number
  /** Share of the office population present at peak. 22 Bishopsgate used 80% (P11-S22, project example). */
  utilisation: number
  /** Persons per home. Arup used 1.5–4.0 by bedroom count (P11-S26). */
  personsPerHome: number
  /** Net area per home, used to estimate the home count until units are tagged (team assumption). */
  homeM2: number
  /** Net area per hotel key (team assumption). */
  hotelM2PerKey: number
  /** Persons per hotel key (team assumption). */
  personsPerKey: number
  /** Served floors per single-deck rise. CIBSE Guide D via Peters: up to 15 (P11-S23). */
  maxFloorsPerRise: number
  /** Rated persons per car: 1600 kg / 21 persons, an EN 81 placeholder (CSA B44 tables not retrieved). */
  carPersons: number
  /** Average car load as a share of rated persons (the 80% hand-calculation convention, P11-S55/S56 unopened). */
  loadFactor: number
  /** Door open + close + start delay per stop (s, team assumption). */
  doorTime: number
  /** Passenger transfer time, each way (s per person, team assumption). */
  transferTime: number
  /** Acceleration (m/s², team assumption). */
  accel: number
  /** Footprint of one passenger shaft (m², team assumption). */
  shaftM2: number
  /** Lift lobby area per car on a served floor (m², team assumption). */
  lobbyM2PerCar: number
  /** Firefighter plus goods/stretcher lifts with their lobbies, full height (m², team assumption). */
  serviceCoreM2: number
  /** Risers, electrical and comms rooms and core washrooms (m², team assumption). Exit stairs come from the egress check. */
  servicesM2: number
  /** Rated speed of the full-height firefighter lift (m/s, team assumption). */
  firefighterSpeed: number
  /** Core walls and partitions, as a share added to the core's rooms (team assumption until the structure module sizes the walls). */
  wallAllowance: number
}

export const DEFAULT_LIFT_PRESETS: LiftPresets = {
  officeM2PerPerson: 10, utilisation: 0.8, personsPerHome: 2, homeM2: 75, hotelM2PerKey: 40, personsPerKey: 1.5,
  maxFloorsPerRise: 15, carPersons: 21, loadFactor: 0.8, doorTime: 5, transferTime: 1.2, accel: 1,
  shaftM2: 7.5, lobbyM2PerCar: 4.5, serviceCoreM2: 24, servicesM2: 40, firefighterSpeed: 6, wallAllowance: 0.15,
}

export type LiftClass = 'office' | 'residential' | 'hotel' | 'public'
export const CLASS_LABEL: Record<LiftClass, string> = { office: 'Office', residential: 'Residential', hotel: 'Hotel', public: 'Public' }
/** Peak 5-minute visitors are this many times the hourly average over 12 (team assumption). */
export const VISITOR_PEAK = 1.5
export const MAX_CARS = 8

/** Rated speed by the travel of a local rise (team assumption, calibrated to Arup's 3.5 / 5.0 / 6.0 m/s rises, P11-S26). */
export function speedFor(travel: number): number {
  return travel <= 90 ? 3.5 : travel <= 160 ? 5 : travel <= 250 ? 6 : 7
}

/** Shuttle speed: as a local rise, but 8 m/s above 150 m (22 Bishopsgate shuttles ran at 8.0 m/s, P11-S22, project example). */
export function shuttleSpeed(travel: number): number {
  return travel > 150 ? 8 : speedFor(travel)
}

/** Flight time over distance d with acceleration a and rated speed v (no jerk). */
export function flightTime(d: number, v: number, a: number): number {
  return d >= (v * v) / a ? d / v + v / a : 2 * Math.sqrt(d / a)
}

/** Probable stops S and highest reversal floor H for n equally used floors and P passengers (classic up-peak). */
export function stopsAndReversal(n: number, P: number): { S: number; H: number } {
  if (n <= 1) return { S: 1, H: 1 }
  const S = n * (1 - Math.pow(1 - 1 / n, P))
  let sum = 0
  for (let i = 1; i < n; i++) sum += Math.pow(i / n, P)
  return { S, H: n - sum }
}

export interface RttInput { n: number; P: number; dExpress: number; dFloor: number; v: number; a: number; doorTime: number; transferTime: number }

/**
 * Up-peak round trip time. Classic form 2H·tv + (S+1)·ts + 2P·tp, written with an express run from the lobby
 * to the first served floor, a kinematic stop loss, and a correction for stops that end a long run
 * (team derivation; the Peters 2000 general analysis is unread). A shuttle is the n = 1 case.
 */
export function upPeakRtt(r: RttInput): { rtt: number; S: number; H: number } {
  const { S, H } = stopsAndReversal(r.n, r.P)
  const tv = r.dFloor / r.v
  const loss = flightTime(r.dFloor, r.v, r.a) - tv
  const ts = loss + r.doorTime
  const longLoss = Math.max(0, r.v / r.a - loss)
  const longStops = r.dExpress > 2 * r.dFloor ? 2 : 1
  const travel = (2 * (r.dExpress + (H - 1) * r.dFloor)) / r.v
  return { rtt: travel + (S + 1) * ts + 2 * r.P * r.transferTime + longStops * longLoss, S, H }
}

function bandState(cls: LiftClass, hc5: number, interval: number): RuleState {
  // Public lifts use the residential band (team assumption: no sourced criteria for public floors at height).
  if (cls === 'office') return interval > 30 || hc5 < 12 ? 'fail' : hc5 < 13 ? 'warn' : 'pass'
  if (hc5 >= 8 && interval <= 40) return 'pass'
  return hc5 >= 7 && interval <= 60 ? 'warn' : 'fail'
}

/** A planned lift group: a local rise stopping at `floors`, or a shuttle from grade to a sky lobby. */
export interface Group {
  kind: 'local' | 'shuttle'
  cls: LiftClass
  /** Floors where the cars stop for passengers (a shuttle: its sky lobby). */
  floors: Floor[]
  /** Lobby the cars start from: null = main lobby at grade, else a sky lobby floor. */
  base: Floor | null
  /** Floors whose occupants ride this group (a shuttle: the whole zone above its sky lobby). */
  riders: Floor[]
  /** Sky-room visitors arriving in a peak 5 minutes, carried on top of the riders. */
  visitors5?: number
}

export interface Rise extends Group {
  id: string
  label: string
  baseZ: number
  baseLevel: number
  firstZ: number
  topZ: number
  population: number
  popBasis: string
  speed: number
  cars: number
  /** Average persons per trip at the design demand (at most loadFactor x carPersons). */
  P: number
  /** Round trip time at that load (s). */
  rtt: number
  hc5: number
  interval: number
  state: RuleState
  /** Floors the cars pass without stopping, between their lobby and the first served floor. */
  expressFloors: number
}

export interface CoreLevel { level: number; z: number; passenger: number; lobby: number; service: number; stairs: number; services: number; walls: number; total: number }

export interface LiftResult {
  rises: Rise[]
  skyLobbies: Floor[]
  plate: number
  modelledCore: number
  /** Core needed at its worst level (whole core: passenger shafts, lobbies, service lifts, stairs and risers). */
  requiredMax: number
  maxLevel: number | null
  /** Core needed at the top floor. */
  requiredTop: number
  breakdownMax: Omit<CoreLevel, 'level' | 'z' | 'total'>
  profile: CoreLevel[]
  totalCars: number
  shaftsAtGrade: number
  /** Exit stairs at the plate edge on the worst level (m²): outside the core, deducted from net-to-gross. */
  edgeStairs: number
  /** Shafts that do not fit inside the core walls in plan (engine/plan.ts grid layout). */
  planOverflow: number
  ntg: number
  rules: RuleResult[]
  /** The same tower without sky lobbies, for comparison (only when it has sky lobbies). */
  direct?: LiftResult
}

const CLASS_OF: Partial<Record<Floor['use'], LiftClass>> = { office: 'office', residential: 'residential', hotel: 'hotel' }

function popOf(f: Floor, ntg: number, p: LiftPresets, t?: Tower): number {
  const net = f.area * ntg
  // An interior layout gives real home and key counts (engine/interior.ts); otherwise the area proxy.
  const c = t ? floorCounts(t, f) : null
  if (f.use === 'residential') return (c?.homes ?? net / p.homeM2) * p.personsPerHome
  if (f.use === 'hotel') return (c?.keys ?? net / p.hotelM2PerKey) * p.personsPerKey
  // Office floors, and public uses that join a group (team assumption: office density).
  return (net / p.officeM2PerPerson) * p.utilisation
}

/** Split served floors into rises by use, each at most `max` floors. Public uses join the group below (or above if lowest). */
function splitByUse(served: Floor[], max: number): { cls: LiftClass; floors: Floor[] }[] {
  const cls: (LiftClass | null)[] = served.map((f) => CLASS_OF[f.use] ?? null)
  for (let i = 0; i < cls.length; i++) if (!cls[i] && i > 0) cls[i] = cls[i - 1]
  for (let i = cls.length - 1; i >= 0; i--) if (!cls[i]) cls[i] = cls[i + 1] ?? 'office'
  const segments: { cls: LiftClass; floors: Floor[] }[] = []
  served.forEach((f, i) => {
    const last = segments[segments.length - 1]
    if (last && last.cls === cls[i]) last.floors.push(f)
    else segments.push({ cls: cls[i] as LiftClass, floors: [f] })
  })
  const out: { cls: LiftClass; floors: Floor[] }[] = []
  for (const s of segments) {
    const k = Math.ceil(s.floors.length / max)
    const size = Math.floor(s.floors.length / k), extra = s.floors.length % k
    let at = 0
    for (let j = 0; j < k; j++) {
      const n = size + (j < extra ? 1 : 0)
      out.push({ cls: s.cls, floors: s.floors.slice(at, at + n) })
      at += n
    }
  }
  return out
}

/**
 * Plan the lift groups. The main lobby is at grade: podium floors and a tower floor at grade are not up-peak stops,
 * and plant floors are not served. Each sky lobby starts a zone: a shuttle runs from grade to it and the zone's
 * local rises start there, so their shafts do not run down through the floors below.
 */
export function planRises(t: Tower, p: LiftPresets): Group[] {
  const all = towerFloors(t)
  const sky = all.filter((f) => f.skyLobby)
  const served = all.filter((f) => !f.podium && f.z0 > 0.5 && f.use !== 'mechanical' && !f.skyLobby)
  const max = Math.max(1, Math.round(p.maxFloorsPerRise))
  const bases: (Floor | null)[] = [null, ...sky]
  const out: Group[] = []
  bases.forEach((base, k) => {
    const lo = base ? base.z0 : 0, hi = k + 1 < bases.length ? (bases[k + 1] as Floor).z0 : Infinity
    const zone = served.filter((f) => f.z0 > lo + 0.01 && f.z0 < hi - 0.01)
    if (!zone.length) return
    const locals = splitByUse(zone, max)
    if (base) {
      // The shuttle carries the zone's dominant use, by served floors.
      const count = new Map<LiftClass, number>()
      for (const l of locals) count.set(l.cls, (count.get(l.cls) ?? 0) + l.floors.length)
      const cls = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
      out.push({ kind: 'shuttle', cls, floors: [base], base: null, riders: zone })
    }
    for (const l of locals) out.push({ kind: 'local', cls: l.cls, floors: l.floors, base, riders: l.floors })
  })
  // A public sky room adds visitors: on the tenants' shuttle (shared) or on public lifts of their own (dedicated).
  const room = t.skyRoom ? sky.find((f) => f.level === t.skyRoom!.level) : undefined
  if (room && t.skyRoom) {
    const v5 = skyRoomVisitors5(t, room)
    if (t.skyRoom.access === 'dedicated') out.push({ kind: 'shuttle', cls: 'public', floors: [room], base: null, riders: [], visitors5: v5 })
    else { const sh = out.find((g) => g.kind === 'shuttle' && g.floors[0].level === room.level); if (sh) sh.visitors5 = v5 }
  }
  return out
}

/** Peak 5-minute visitor arrivals at a public sky room: posted capacity × visits per hour ÷ 12 × peak factor (team assumption). */
export function skyRoomVisitors5(t: Tower, room: Floor): number {
  if (!t.skyRoom) return 0
  const net = Math.max(0, room.area - t.coreShare * t.width * t.depth)
  const perHour = skyRoomLoads(t, net).visitors * (60 / Math.max(10, t.skyRoom.visitMinutes))
  return (perHour / 12) * VISITOR_PEAK
}

/** Suggest a level for the next sky lobby: a change of use near the middle of the remaining span, else the middle. */
export function suggestSkyLobby(t: Tower): number | null {
  const all = towerFloors(t).filter((f) => !f.podium && f.z0 > 0.5)
  if (all.length < 10) return null
  const taken = new Set(t.skyLobbies ?? [])
  const last = Math.max(0, ...[...taken].map((l) => all.findIndex((f) => f.level === l)))
  const from = taken.size ? last + 1 : 0
  const span = all.slice(from)
  if (span.length < 10) return null
  const target = from + Math.floor(span.length / 2)
  let best: number | null = null
  for (let i = from + 5; i < all.length - 5; i++) {
    if (all[i].use !== all[i - 1].use && all[i - 1].use !== 'mechanical' && Math.abs(i - target) <= span.length * 0.2) {
      if (best === null || Math.abs(i - target) < Math.abs(best - target)) best = i
    }
  }
  return all[best ?? target].level
}

const fmt = (v: number) => Math.round(v).toLocaleString()
const UQ = { label: 'UQ DS-11 Vertical Transportation Design Standard, Rev 2.0 (2023); Peters, Lift Planning for High-Rise Buildings (2017)', url: 'https://coo.uq.edu.au/files/31545/DS-11_Vertical%20Transportation_R2.pdf' }

export function liftCheck(t: Tower, p: LiftPresets = DEFAULT_LIFT_PRESETS, e: EgressPresets = DEFAULT_EGRESS_PRESETS, opts: { skipDirect?: boolean } = {}): LiftResult {
  const ntgModel = netToGross(t)
  const plate = t.width * t.depth
  const modelledCore = t.coreShare * plate
  const all = towerFloors(t)
  const ground = all.find((f) => f.z0 < 0.5)
  const P = p.loadFactor * p.carPersons
  let nLocal = 0, nShuttle = 0, nPublic = 0

  const rises: Rise[] = planRises(t, p).map((g) => {
    const first = g.floors[0], top = g.floors[g.floors.length - 1]
    const baseZ = g.base ? g.base.z0 : 0
    const n = g.floors.length
    const dFloor = n > 1 ? (top.z0 - first.z0) / (n - 1) : first.z1 - first.z0
    const speed = g.kind === 'shuttle' ? shuttleSpeed(top.z0 - baseZ) : speedFor(top.z0 - baseZ)
    const target = g.cls === 'office' ? 13 : 8
    // Visitors count as the population whose target share they would be (team assumption: same band as the group).
    const population = g.riders.reduce((s, f) => s + popOf(f, ntgModel, p, t), 0) + (g.visitors5 ? g.visitors5 / (target / 100) : 0)
    const rttAt = (load: number) => upPeakRtt({ n, P: load, dExpress: first.z0 - baseZ, dFloor, v: speed, a: p.accel, doorTime: p.doorTime, transferTime: p.transferTime }).rtt
    // Handling capacity is measured at the full design load P. The interval is taken at the design demand
    // (13% office, 8% residential/hotel in 5 min): the average car load there is computed, capped at P,
    // so a small population is not assumed to fill every car.
    const rttFull = rttAt(P)
    const demand = (population * target) / 100 / 300
    let cars = MAX_CARS, hc5 = 0, interval = 0, load = P, rtt = rttFull, state: RuleState = 'fail'
    for (let N = 1; N <= MAX_CARS; N++) {
      hc5 = population > 0 ? ((300 * P * N) / rttFull / population) * 100 : 100
      load = P
      for (let k = 0; k < 50; k++) {
        const next = Math.min(P, Math.max(1, (demand * rttAt(load)) / N))
        if (Math.abs(next - load) < 1e-4) { load = next; break }
        load = next
      }
      rtt = rttAt(load)
      interval = rtt / N
      state = bandState(g.cls, hc5, interval)
      if (state === 'pass') { cars = N; break }
    }
    const homes = g.riders.filter((f) => f.use === 'residential').reduce((s, f) => s + (floorCounts(t, f)?.homes ?? (f.area * ntgModel) / p.homeM2), 0)
    const keys = g.riders.filter((f) => f.use === 'hotel').reduce((s, f) => s + (floorCounts(t, f)?.keys ?? (f.area * ntgModel) / p.hotelM2PerKey), 0)
    const counted = t.interior ? ' (from the interior layout)' : ''
    const visitorsNote = g.visitors5 ? `about ${fmt(g.visitors5)} sky-room visitors per peak 5 min` : ''
    const popBasis = g.cls === 'public' ? visitorsNote
      : g.kind === 'shuttle' ? `everyone on levels ${g.riders[0].level}–${g.riders[g.riders.length - 1].level}${visitorsNote ? ` plus ${visitorsNote}` : ''}`
      : g.cls === 'residential' ? `${counted ? '' : 'about '}${fmt(homes)} homes${counted} × ${p.personsPerHome} persons`
      : g.cls === 'hotel' ? `${counted ? '' : 'about '}${fmt(keys)} keys${counted} × ${p.personsPerKey} persons`
      : `1 per ${p.officeM2PerPerson} m² net × ${Math.round(p.utilisation * 100)}% present`
    const expressFloors = all.filter((f) => f.z0 > baseZ + 0.5 && f.z0 < first.z0 - 0.01).length
    const id = g.cls === 'public' ? `P${++nPublic}` : g.kind === 'shuttle' ? `S${++nShuttle}` : `R${++nLocal}`
    const label = g.cls === 'public' ? `${id} Public lifts to the sky room L${first.level}` : g.kind === 'shuttle' ? `${id} Shuttle to sky lobby L${first.level}${g.visitors5 ? ' (shared with sky-room visitors)' : ''}` : `${id} ${CLASS_LABEL[g.cls]}: levels ${first.level}–${top.level}${g.base ? ` (from sky lobby L${g.base.level})` : ''}`
    return { ...g, id, label, baseZ, baseLevel: g.base ? g.base.level : ground?.level ?? 1, firstZ: first.z0, topZ: top.z0, population, popBasis, speed, cars, P: load, rtt, hc5, interval, state, expressFloors }
  })

  // Core needed at each level above grade: shafts that pass or stop there, lift lobbies of the groups that stop there
  // (none at a sky lobby, whose hall is the lobby), service and firefighter lifts, stairs and risers, plus a wall allowance.
  const stops = rises.map((r) => new Set(r.floors.map((f) => f.level)))
  const stairsAt = stairAreaByLevel(t, e, { homeM2: p.homeM2, hotelM2PerKey: p.hotelM2PerKey })
  const profile: CoreLevel[] = all.filter((f) => f.z0 > 0.5).map((f) => {
    const passenger = rises.filter((r) => f.z0 >= r.baseZ - 0.01 && f.z0 <= r.topZ + 0.01).reduce((s, r) => s + r.cars, 0) * p.shaftM2
    const lobby = f.skyLobby ? 0 : rises.filter((_, i) => stops[i].has(f.level)).reduce((s, r) => s + r.cars, 0) * p.lobbyM2PerCar
    const stairs = stairsAt.core.get(f.level) ?? 0
    const rooms = passenger + lobby + p.serviceCoreM2 + stairs + p.servicesM2
    const walls = rooms * p.wallAllowance
    return { level: f.level, z: f.z0, passenger, lobby, service: p.serviceCoreM2, stairs, services: p.servicesM2, walls, total: rooms + walls }
  })
  const worst = profile.reduce<CoreLevel | null>((m, c) => (!m || c.total > m.total ? c : m), null)
  const requiredMax = worst?.total ?? (p.serviceCoreM2 + p.servicesM2) * (1 + p.wallAllowance)
  const requiredTop = profile[profile.length - 1]?.total ?? requiredMax
  const totalCars = rises.reduce((s, r) => s + r.cars, 0)
  const shaftsAtGrade = rises.filter((r) => r.baseZ < 0.5).reduce((s, r) => s + r.cars, 0) + 2
  const effective = Math.max(modelledCore, requiredMax)
  // Stairs at the plate edge are outside the core but still not lettable.
  const edgeStairs = worst ? stairsAt.edge.get(worst.level) ?? 0 : 0
  const ntg = plate > 0 ? 1 - (effective + edgeStairs) / plate : 0
  const skyLobbies = all.filter((f) => f.skyLobby)

  const rules: RuleResult[] = []
  for (const r of rises) {
    const office = r.cls === 'office'
    const pub = r.cls === 'public'
    const capacity5 = (300 * (p.loadFactor * p.carPersons) * r.cars) / upPeakRtt({ n: 1, P: p.loadFactor * p.carPersons, dExpress: r.firstZ - r.baseZ, dFloor: r.floors[0].z1 - r.floors[0].z0, v: r.speed, a: p.accel, doorTime: p.doorTime, transferTime: p.transferTime }).rtt
    rules.push({
      id: `rise-${t.id}-${r.id}`,
      label: r.label,
      value: pub ? `${r.cars} car${r.cars > 1 ? 's' : ''} · ${r.speed} m/s · ${fmt(capacity5)} people per 5 min · interval ${r.interval.toFixed(0)} s`
        : `${r.cars} car${r.cars > 1 ? 's' : ''} · ${r.speed} m/s · HC5 ${r.hc5.toFixed(1)}% · interval ${r.interval.toFixed(0)} s`,
      threshold: pub ? `≥ ${fmt(r.visitors5 ?? 0)} visitors per 5 min, interval ≤ 40 s (team)` : office ? 'HC5 ≥ 13%, interval ≤ 30 s (up-peak)' : 'HC ≥ 8%, interval ≤ 40 s (indicative)',
      state: r.state,
      flag: office && r.kind === 'local' ? 'verified' : 'team_assumption',
      source: office ? UQ : pub ? { label: 'Team assumption: no sourced lift criteria for public floors at height (research P06, P11)' } : { label: 'UQ DS-11 residential band (two-way) applied to an up-peak estimate: team assumption until the two-way template is built' },
      note: pub ? `${r.popBasis}; one stop at the sky room, no transfer; round trip ${r.rtt.toFixed(0)} s. Separate public lifts keep visitors out of the tenant shuttles and lobbies but add shafts from grade.` : `${fmt(r.population)} people (${r.popBasis}); ${r.kind === 'shuttle' ? 'one stop, then one transfer to a local rise' : `${r.floors.length} floors served`}${r.expressFloors ? `, ${r.expressFloors} passed express` : ''}; round trip ${r.rtt.toFixed(0)} s with ${r.P.toFixed(1)} people per trip at the design demand; average wait about ${(r.interval / 2).toFixed(0)} s (estimate, simulation not performed).${r.kind === 'shuttle' ? ' Shuttle criteria are not sourced: the band of the use it carries is applied (team assumption); double-deck shuttles are roadmap.' : ''}${r.state !== 'pass' ? ` Even ${MAX_CARS} cars miss the band: split the rise or add a sky lobby.` : ''}`,
    })
  }

  const locals = rises.filter((r) => r.kind === 'local')
  const maxFloors = Math.max(0, ...locals.map((r) => r.floors.length))
  rules.push({
    id: `rise-floors-${t.id}`,
    label: 'Floors per rise',
    value: `${maxFloors} floors in the longest rise`,
    threshold: '≤ 15 (amber 16)',
    state: maxFloors <= 15 ? 'pass' : maxFloors === 16 ? 'warn' : 'fail',
    flag: 'verified',
    source: { label: 'CIBSE Guide D as cited by Peters, Lift Planning for High-Rise Buildings (2017)', url: 'https://liftescalatorlibrary.org/paper_indexing/papers/00000157.pdf' },
    note: 'A review flag, not a ban: Arup used 21–28-floor fast residential rises (505 George St). Guide D itself is unread, and its 2015 edition is superseded (false assumption corrected in research).',
  })

  const ratio = requiredMax > 0 ? modelledCore / requiredMax : 1
  // Area is not enough: the shafts must also fit inside the core walls in plan.
  const planOverflow = coreLayout(t, { rises }, p, e).overflow
  rules.push({
    id: `core-fit-${t.id}`,
    label: 'Core holds the lifts',
    value: `${fmt(modelledCore)} m² modelled vs ${fmt(requiredMax)} m² needed${worst ? ` at level ${worst.level}` : ''}`,
    threshold: 'modelled core ≥ needed (amber within 10%)',
    state: ratio < 0.9 ? 'fail' : ratio < 0.999 || planOverflow > 0 ? 'warn' : 'pass',
    flag: 'team_assumption',
    source: { label: `Team presets: shaft ${p.shaftM2} m² and lobby ${p.lobbyM2PerCar} m² per car, service lifts ${p.serviceCoreM2} m², risers and services ${p.servicesM2} m², walls +${Math.round(p.wallAllowance * 100)}%; exit stairs from the egress check` },
    note: `${t.coreAuto ? 'Core sized to the lifts and stairs (auto). ' : ''}Needed at the worst level = ${fmt(worst?.passenger ?? 0)} passenger shafts + ${fmt(worst?.lobby ?? 0)} lobby + ${p.serviceCoreM2} service lifts + ${fmt(worst?.stairs ?? 0)} exit stairs + ${p.servicesM2} risers and services + ${fmt(worst?.walls ?? 0)} walls. Passenger shafts alone are not the lift core (false assumption corrected in research P11). At the top floor about ${fmt(requiredTop)} m² is enough, so the core could step in plan as groups end.${planOverflow > 0 ? ` In plan, ${planOverflow} shaft${planOverflow > 1 ? 's do' : ' does'} not fit inside the core walls on a grid clear of the stairs (see the board floor plan).` : ''}`,
  })

  rules.push({
    id: `ntg-${t.id}`,
    label: 'Net-to-gross, typical tower floor',
    value: `${Math.round(ntg * 100)}% (core ${fmt(effective)} m²${edgeStairs > 0 ? ` + ${fmt(edgeStairs)} m² of stairs at the plate edge` : ''} of a ${fmt(plate)} m² plate)`,
    threshold: '≥ 75% (amber 70–75%)',
    state: ntg >= 0.75 ? 'pass' : ntg >= 0.7 ? 'warn' : 'fail',
    flag: 'verified',
    source: { label: 'Stopes, Designing a Vertical Transportation Strategy in the Largest and Tallest Building in the City of London (22 Bishopsgate)', url: 'https://liftescalatorlibrary.org/paper_indexing/papers/00000193.pdf' },
    note: `UK practitioner guidance; Canadian measurement conventions differ. Uses the larger of the modelled and needed core, core-only deduction. Published samples: core about 23% of gross in 40 Japanese towers and 26% in 40 tapered supertalls (Ilgin, research P08). This estimate counts lifts, exit stairs, a services allowance and a ${Math.round(p.wallAllowance * 100)}% wall allowance only, so it reads lean until the structure and services modules size the walls and risers.`,
  })

  // Firefighter elevator: VBBL 2019 3.2.6.5 (and 2007): reach every floor with at most one change, 1 min run to the top floor it serves.
  const topFloor = all[all.length - 1]
  const runD = topFloor ? topFloor.z0 : 0
  const ffTime = flightTime(runD, p.firefighterSpeed, p.accel)
  let vMin = 0.5
  while (vMin < 12 && flightTime(runD, vMin, p.accel) > 60) vMin += 0.5
  rules.push({
    id: `firefighter-${t.id}`,
    label: 'Firefighter lift run to the top floor',
    value: `${ffTime.toFixed(0)} s at ${p.firefighterSpeed} m/s to level ${topFloor?.level ?? '—'}`,
    threshold: '≤ 60 s, at most one change of lift',
    state: ffTime <= 60 ? 'pass' : 'fail',
    flag: 'verified',
    source: { label: 'Vancouver Building By-law 2019, 3.2.6.5 (same in VBBL 2007; VBBL 2025 unread, edition check pending)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/59509560' },
    note: `One full-height 900 kg firefighter lift needs at least ${vMin.toFixed(1)} m/s here (acceleration ${p.accel} m/s², no jerk). Otherwise the by-law allows one change floor${skyLobbies.length ? ', which a sky lobby can host if the authority agrees' : ''}. Speed is a team preset.`,
  })

  rules.push({
    id: `stretcher-${t.id}`,
    label: 'Stretcher-capable car',
    value: '1600 kg car, platform about 1.4 × 2.4 m',
    threshold: 'One car per storey takes a 2010 × 610 mm stretcher',
    state: 'pass',
    flag: 'unverified',
    source: { label: 'Vancouver Building By-law 2019, 3.5.4.1 (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/681033337' },
    note: 'The rule is from the by-law; the car platform size is a placeholder until CSA B44 car tables are retrieved.',
  })

  rules.push({
    id: `seismic-${t.id}`,
    label: 'Seismic, rope sway and stack effect',
    value: 'Not assessed',
    threshold: 'CSA B44-16 limits on rise and speed',
    state: 'unknown',
    flag: 'unresolved',
    source: { label: 'Technical Safety BC: Elevating Devices (CSA B44-16 in force since 30 Apr 2020)', url: 'https://www.technicalsafetybc.ca/technologies/elevating-devices' },
    note: 'The CSA B44-16 seismic clause and post-earthquake lift availability are unread. A vertical-transportation consultant decides.',
  })

  return {
    rises, skyLobbies, plate, modelledCore, requiredMax, requiredTop, profile, totalCars, shaftsAtGrade, edgeStairs, planOverflow, ntg, rules,
    maxLevel: worst?.level ?? null,
    breakdownMax: { passenger: worst?.passenger ?? 0, lobby: worst?.lobby ?? 0, service: p.serviceCoreM2, stairs: worst?.stairs ?? 0, services: p.servicesM2, walls: worst?.walls ?? 0 },
    direct: skyLobbies.length && !opts.skipDirect ? liftCheck({ ...t, skyLobbies: [], skyRoom: null }, p, e) : undefined,
  }
}

/**
 * Core share that just holds the lifts, stairs and services at their worst level, rounded up to 0.5%.
 * A bigger core leaves less net area, so fewer people, fewer lifts and narrower stairs: the core needed falls as the
 * core grows, so the share where they meet is found by bisection (simple iteration can swing between two values).
 */
export function autoCoreShare(t: Tower, p: LiftPresets = DEFAULT_LIFT_PRESETS, e: EgressPresets = DEFAULT_EGRESS_PRESETS): number {
  const plate = t.width * t.depth
  if (plate <= 0) return t.coreShare
  const gap = (share: number) => liftCheck({ ...t, coreShare: share }, p, e, { skipDirect: true }).requiredMax - share * plate
  let lo = 0.05, hi = 0.6
  if (gap(lo) <= 0) return lo
  if (gap(hi) > 0) return hi
  for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (gap(mid) > 0) lo = mid; else hi = mid }
  // Round up to 0.5%, then step up if a whole car or a stair step tips the balance, or the shafts do not fit in plan.
  let share = Math.min(0.6, Math.ceil(hi * 200 - 1e-9) / 200)
  const overflows = (s: number) => liftCheck({ ...t, coreShare: s }, p, e, { skipDirect: true }).planOverflow > 0
  while (share < 0.6 && (gap(share) > 0 || overflows(share))) share = Math.min(0.6, share + 0.005)
  return share
}

/** The tower with its core sized to the lifts when it is in auto mode. */
export function withAutoCore(t: Tower, p: LiftPresets = DEFAULT_LIFT_PRESETS, e: EgressPresets = DEFAULT_EGRESS_PRESETS): Tower {
  return t.coreAuto ? { ...t, coreShare: autoCoreShare(t, p, e) } : t
}
