// One solar-access run for the current design: the Downtown test on every public space, the sun-hours map and the
// evidence lines. Runs in a Web Worker (workers/solarWorker.ts) and directly in tests.
import type { VtcContext } from '../context'
import { sampleCityTerrain } from './solarCity'
import type { RuleResult, RuleState, Tower } from './types'
import { dayWindow, solarPosition, studyWindow, type StudyWindow } from './solar'
import { emptyOccluders, gridOver, type Pt } from './shadow'
import { cenotaphSpace, centroidOf, cityBaseline, distanceTo, elevationOf, liftOccluders, MISSING_SPACES, SPACES_SOURCE, table1Spaces, unknownNear, type CityInput } from './solarCity'
import {
  evaluateSpace, ruleForClass, ruleState, RULES, solarRuleResults, summariseHours, sunHoursMap, towerOccluders, vtcOccluders, vtcSpaces,
  type CitySummary, type Interval, type Reading, type SpaceResult, type SunHours,
} from './solarRules'

import type { MapDate } from './solarDates'
export { MAP_DATES, type MapDate } from './solarDates'

export interface SolarJobInput {
  project: 'vtc' | 'city'
  towers: Tower[]
  ctx: VtcContext | null
  /** Real Vancouver: buildings with LiDAR heights, unknown-height footprints and terrain (null while loading). */
  city?: CityInput | null
  /** Real Vancouver: the towers' base elevation (the project's ground setting, CGVD28 m). */
  groundElevation?: number
  /** Names the baseline (e.g. "vtc:1"): baseline masks are kept between runs while it stays the same. */
  ctxKey?: string
  readings: Record<string, Reading>
  mapDate: MapDate
  /** Map cell size (m). */
  cell?: number
  /** Half width of the map around its centre (m). */
  half?: number
}

export interface SpaceSummary {
  id: string
  name: string
  rings: Pt[][]
  inTable1: boolean
  reading: Reading
  state: RuleState
  area: number
  swept: number
  firstNew: string | null
  lastNew: string | null
  coverage: { existing: number; added: number; cumulative: number }
  basic: { label: string; added: number }[]
  detailed: Interval[]
  window: string
  /** Elevation the space was tested at (m; 0 on the flat VTC model). */
  z: number
}

/** Terrain heights at every 4th map node, for draping the map on the ground in Real Vancouver. */
export interface MapTerrain { x0: number; y0: number; step: number; nx: number; ny: number; z: Float32Array }

export interface SolarJobOutput {
  project: 'vtc' | 'city'
  lines: RuleResult[]
  spaces: SpaceSummary[]
  map: SunHours | null
  /** Elevation of the map's receiver plane (m). */
  planeZ: number
  mapTerrain: MapTerrain | null
  centre: Pt
  ms: number
}

function mapWindow(d: MapDate): { win: StudyWindow; cutoff: number } {
  if (d === 'equinox') return { win: studyWindow('equinox'), cutoff: 0 }
  const [m, day] = d === 'mar21' ? [3, 21] : d === 'jun21' ? [6, 21] : [12, 21]
  return { win: dayWindow(m, day), cutoff: 10 } // research P02-M03: 10° cut-off for whole-day hours
}

let cacheKey = ''
let cache = new Map<string, Uint8Array>()
function cacheFor(key: string) {
  if (key !== cacheKey) { cacheKey = key; cache = new Map() }
  return cache
}

/** Radius around a space within which baseline buildings can shadow it on 22 Sep (taller than any downtown tower). */
const BASELINE_RADIUS = 1500

export function runSolarJob(i: SolarJobInput): SolarJobOutput {
  const t0 = Date.now()
  const city = i.project === 'city'
  const northDeg = city ? 0 : (i.ctx?.meta.true_north_deg_clockwise_from_plus_y ?? 45)
  const zb = city ? (i.groundElevation ?? 0) : 0
  const opts = { northDeg, cache: i.ctxKey ? cacheFor(`${i.project}:${i.ctxKey}:${zb}`) : undefined }
  const prop = towerOccluders(i.towers)
  const centre: Pt = !city || !i.towers.length ? [0, 0] : [i.towers[0].x, i.towers[0].y]
  const window = (s: { t1: { cls: Parameters<typeof ruleForClass>[0]; note?: '4.1' | '4.2' | '4.3' } | null; rule?: keyof typeof RULES }) => studyWindow(s.rule ? RULES[s.rule].window : s.t1 ? RULES[ruleForClass(s.t1.cls, s.t1.note)].window : 'equinox')

  const results: SpaceResult[] = []
  const elevation = new Map<string, number>()
  let base = emptyOccluders()
  let cityInfo: CitySummary | undefined
  let cenotaph: { a: SpaceResult; b: SpaceResult; z: number } | null = null

  if (!city) {
    base = i.ctx ? vtcOccluders(i.ctx) : base
    for (const s of i.ctx ? vtcSpaces(i.ctx) : []) { results.push(evaluateSpace(s, base, prop, window(s), opts)); elevation.set(s.id, 0) }
  } else {
    const terrain = i.city?.terrain ?? null
    const eq = studyWindow('equinox')
    const minAlt = Math.min(solarPosition(eq.startUtc).altitude, solarPosition(eq.endUtc).altitude)
    const top = zb + Math.max(0, ...i.towers.map((t) => Math.max(t.height, t.imported?.top ?? 0)))
    let beyond = 0
    for (const s of table1Spaces()) {
      const zr = elevationOf(s.rings, terrain) ?? zb
      // A space beyond the longest shadow of the window (at its own elevation) cannot get new shadow.
      const reach = Math.max(0, top - zr) / Math.tan((minAlt * Math.PI) / 180)
      if (!i.towers.some((t) => distanceTo(s.rings, [t.x, t.y]) - Math.hypot(t.width, t.depth) / 2 <= reach)) { beyond++; continue }
      const b = i.city ? cityBaseline(i.city, centroidOf(s.rings), BASELINE_RADIUS, zr) : emptyOccluders()
      results.push(evaluateSpace(s, b, liftOccluders(prop, zb - zr), window(s), opts))
      elevation.set(s.id, zr)
    }
    // 4.3.1: the cenotaph circle on 11 Nov under both clock readings; shown, never judged (its clock is unresolved).
    const cen = cenotaphSpace()
    if (cen && i.towers.length) {
      const zr = elevationOf(cen.rings, terrain) ?? zb
      const b = i.city ? cityBaseline(i.city, centroidOf(cen.rings), BASELINE_RADIUS, zr) : emptyOccluders()
      const p = liftOccluders(prop, zb - zr)
      cenotaph = { a: evaluateSpace(cen, b, p, studyWindow('cenotaphA'), opts), b: evaluateSpace(cen, b, p, studyWindow('cenotaphB'), opts), z: zr }
    }
    if (i.city) base = cityBaseline(i.city, centre, (i.half ?? 640) + 700, zb)
    cityInfo = i.city
      ? {
          tested: results.length, beyond, missing: MISSING_SPACES.map((m) => m.name),
          withHeight: base.prisms.length, unknownHeight: unknownNear(i.city, centre, (i.half ?? 640) + 700), terrain: !!terrain, towerBase: zb, source: SPACES_SOURCE,
        }
      : undefined
  }

  const half = i.half ?? 640, cell = i.cell ?? 5
  const { win, cutoff } = mapWindow(i.mapDate)
  const grid = gridOver(centre[0] - half, centre[1] - half, centre[0] + half, centre[1] + half, cell)
  const map = sunHoursMap(base, prop, grid, win, { ...opts, cutoffDeg: cutoff })
  // The evidence line always reports the City window, whatever date the map shows.
  const equinoxMap = i.mapDate === 'equinox' ? map : sunHoursMap(base, prop, gridOver(centre[0] - 300, centre[1] - 300, centre[0] + 300, centre[1] + 300, 10), studyWindow('equinox'), opts)
  const hours = summariseHours(equinoxMap, centre, 300)

  let mapTerrain: MapTerrain | null = null
  const terrain = city ? i.city?.terrain ?? null : null
  if (terrain) {
    const step = cell * 4, nx = Math.floor(grid.nx / 4) + 1, ny = Math.floor(grid.ny / 4) + 1
    const z = new Float32Array(nx * ny)
    for (let r = 0; r < ny; r++) for (let k = 0; k < nx; k++) z[r * nx + k] = sampleCityTerrain(terrain, grid.x0 + k * step, grid.y0 + r * step) ?? zb
    mapTerrain = { x0: grid.x0, y0: grid.y0, step, nx, ny, z }
  }

  const lines = solarRuleResults(results, i.readings, { project: i.project, towers: i.towers, hours, city: cityInfo })
  if (cenotaph) {
    const m2 = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`
    lines.push({
      id: 'solar-cenotaph', label: 'Victory Square Cenotaph circle (11 Nov)', value: `new shadow ${m2(cenotaph.a.swept)} reading 10–12 PST (UTC-8); ${m2(cenotaph.b.swept)} reading 10–12 on the clock (UTC-7)`,
      threshold: 'should not shadow the cenotaph circle (s.4.3.1, p.10)', state: 'unknown', flag: 'unresolved',
      source: { label: 'Solar Access Guidelines for the Downtown Peninsula (City of Vancouver, July 2026)', page: '4.3.1, p.10' },
      note: 'Shown, not judged: 4.3.1 says "PST" while section 5 sets studies to PT, UTC-7, and it does not say whether total or only new shadow counts. The circle is a 9 m stand-in at the centre of the Victory Square park polygon (unverified).',
    })
  }
  return {
    lines,
    spaces: results.map((r) => {
      const reading: Reading = r.space.rule ? 'park' : r.space.t1 ? (ruleForClass(r.space.t1.cls, r.space.t1.note) === 'minimise' ? 'minimise' : 'park') : (i.readings[r.space.id] ?? 'unresolved')
      return {
        id: r.space.id, name: r.space.name, rings: r.space.rings, inTable1: !!r.space.t1 || !!r.space.rule, reading,
        state: r.space.rule ? ruleState(r, RULES[r.space.rule]) : reading === 'unresolved' ? 'unknown' : ruleState(r, RULES[reading]),
        area: r.area, swept: r.swept, firstNew: r.firstNew, lastNew: r.lastNew, coverage: r.coverage, basic: r.basic, detailed: r.detailed, window: r.window.label,
        z: elevation.get(r.space.id) ?? zb,
      }
    }),
    project: i.project, map, planeZ: zb, mapTerrain, centre, ms: Date.now() - t0,
  }
}
