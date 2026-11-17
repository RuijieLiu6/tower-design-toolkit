// Plan §4: unsourced thresholds fail. Runs every built engine on the default design of both projects (and a variant
// that exercises sky rooms, sky lobbies and plant floors) and fails on any result without a source, a stated
// threshold or a known flag, or a "verified" result with nothing a reader could check.
import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_REALM, frontageCheck, groundPlaneCheck, streetwallCheck } from '../engine/publicRealm'
import { DEFAULT_ECON } from '../engine/economics'
import { DEFAULT_MOBILITY, mobilityCheck } from '../engine/mobility'
import { DEFAULT_FACADE, facadeCheck } from '../engine/facade'
import { cityInNature, DEFAULT_NATURE } from '../engine/cityInNature'
import { egressCheck } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { skyRoomCheck } from '../engine/skyRoom'
import { structureCheck } from '../engine/structure'
import { vtcRules, SITE } from '../engine/vtcRules'
import { windProcedure, windStudyRules } from '../engine/windStructure'
import { plazaMask, siteRaster, windStudy } from '../engine/windComfort'
import { DEFAULT_WIND_PRESETS, readingsOf, SRC as WIND_COMFORT_SRC, windRules } from '../engine/windComfortInput'
import { aseTower, daylightTower, DEFAULT_ZONES, maskFloor, newCache, prep } from '../engine/daylightSW'
import { DEFAULT_DAYLIGHT_PRESETS, daylightRules, readingsOf as daylightReadings } from '../engine/daylightSWInput'
import hourly from '../data/sunWindHourly.json'
import { ventStudy, ventTowerQuick, DEFAULT_VENT } from '../engine/ventilationSW'
import { DEFAULT_VENT_PRESETS, readingsOf as ventReadings, ventRules } from '../engine/ventilationSWInput'
import { DEFAULT_ENERGY, energyHourly, finishPlate, zoneGlazing as swZoneGlazing, type EnergyFloor } from '../engine/energySW'
import { DEFAULT_ENERGY_PRESETS, energyRules } from '../engine/energySWInput'
import type { RuleResult, Tower } from '../engine/types'
import { DEFAULT_SKY_ROOM, useStore } from '../store'
import { lintRow, lintRule, lintRules as lintAll, type LintIssue } from './evidenceLint'

let checked = 0
const lintRules = (node: string, rules: RuleResult[]) => { checked += rules.length; return lintAll(node, rules) }

const init = useStore.getInitialState()
const variants = (list: Tower[]): Tower[] => [...list, ...list.map((t) => ({ ...t, id: `${t.id}-sky`, skyLobbies: [20, 40], skyRoom: { ...DEFAULT_SKY_ROOM, level: 40 }, plantEvery: 15 }))]

function allIssues(): LintIssue[] {
  const out: LintIssue[] = []
  for (const project of ['vtc', 'city'] as const) {
    const towers = variants(init.towers[project])
    if (project === 'vtc') {
      out.push(...lintRules('built.vtc-rules', vtcRules(towers, { fsrTier: 2, transitLink: false })))
      out.push(...lintRules('built.vtc-rules', vtcRules(towers, { fsrTier: 1, transitLink: true })))
      out.push(...lintRules('built.pr-streetwall', streetwallCheck(towers, DEFAULT_PUBLIC_REALM).rules))
      out.push(...lintRules('built.pr-frontage', frontageCheck(towers, DEFAULT_PUBLIC_REALM).rules))
      out.push(...lintRules('built.pr-ground', groundPlaneCheck(towers, DEFAULT_PUBLIC_REALM).rules))
    }
    for (const t of towers) {
      const lift = liftCheck(t, init.liftPresets, init.egressPresets)
      const egress = egressCheck(t, init.egressPresets)
      out.push(...lintRules('built.core-lifts', lift.rules))
      out.push(...lintRules('built.egress', egress.rules))
      out.push(...lintRules('built.sky-room', skyRoomCheck(t, lift, egress, init.egressPresets, init.liftPresets).rules))
      const wp = windProcedure(t)
      out.push(...lintRules('wind', wp.rules))
      out.push(...lintRules('structure', structureCheck(t, wp).rules))
    }
    out.push(...lintRules('wind', windStudyRules(Math.max(...towers.map((t) => t.height)))))
    out.push(...lintRules('built.mobility', mobilityCheck(towers, { ...DEFAULT_MOBILITY, carStalls: 100, loadingB: 2, trucksPerHour: 2, dwellMin: 20 }, { project, transitLink: true, homeM2: 75, hotelM2PerKey: 40 }).rules))
    out.push(...lintRules('built.facade', facadeCheck(towers, { ...DEFAULT_FACADE, treated: 0.7, vlt: 0.5, shgc: 0.3 }, project === 'vtc' ? 45 : 0).rules))
    out.push(...lintRules('built.facade', facadeCheck(towers, DEFAULT_FACADE, 0).rules))
    out.push(...lintRules('city-in-nature', cityInNature(DEFAULT_NATURE, project === 'vtc' ? SITE.area : null, null).rules))
  }
  // Pedestrian wind comfort (Sun & Wind Studio port): one case on an empty domain, run once (about a second).
  {
    const plaza = plazaMask([])
    const result = windStudy(siteRaster([], null), { w: 46, d: 46, cx: 0, cy: 0, rot: 0, height: 285, footprint: [[-23, -23], [23, -23], [23, 23], [-23, 23]] }, plaza,
      { annual: false, dir: 270, speed: 4.5, period: { from: '01-01', to: '12-31' }, strat: null })
    const readings = readingsOf(result, 0)
    out.push(...lintRules('built.wind-comfort', windRules({ readings, result, obstacles: { loaded: true, unknownHeights: 0, source: WIND_COMFORT_SRC.vtc }, presets: DEFAULT_WIND_PRESETS, towerName: 'T' })))
  }
  // Daylight sDA / ASE (Sun & Wind Studio port): two floors of a 46 × 46 m tower with her default facade, no neighbours.
  {
    const floors = [0, 1].map((i) => maskFloor({ i, z: i * 4.2, h: 4.2, w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16 }))
    const s = { zones: DEFAULT_ZONES, vt: 0.6, target: 300, posX: 0, posY: 0, bld: [], period: { from: '01-01', to: '12-31' } }
    const P = prep(hourly as never), cache = newCache()
    const D = daylightTower(P, floors, s, cache), A = aseTower(P, floors, s, hourly.days, cache)
    const readings = daylightReadings(D, A, [1, 2])
    out.push(...lintRules('built.daylight-sw', daylightRules({ readings, contextLoaded: true, unknownHeights: 0, glazing: { from: 'studio', note: 'Her default facade' }, presets: DEFAULT_DAYLIGHT_PRESETS, towerName: 'T', period: A.period, left: 0 })))
    // Natural ventilation (Sun & Wind Studio port): the same two floors, her default settings.
    const v = ventStudy(P, { temp: hourly.temp, months: hourly.months, days: hourly.days }, floors, DEFAULT_ZONES, DEFAULT_VENT, { from: '01-01', to: '12-31' }, 8.4)
    const q = ventTowerQuick(floors, DEFAULT_ZONES, DEFAULT_VENT.open, 0, 0)
    // Energy use (Sun & Wind Studio port): the same two floors as offices, her default envelope and systems.
    const ef: EnergyFloor[] = floors.map((f, i) => { const fp = finishPlate({ ...f, mask: { ...f.mask, cells: f.mask.cells.slice() } }, 0, 0); const g = (o: 'N' | 'E' | 'S' | 'W') => swZoneGlazing(DEFAULT_ZONES, i + 1, o)
      return { i, prog: 'office', h: f.h, rot: 0, area: fp.area, facade: fp.facade, garden: false, terrace: 0, roof: i === floors.length - 1 ? fp.area : 0, coveredVoid: 0, glazing: { N: g('N'), E: g('E'), S: g('S'), W: g('W') } } })
    out.push(...lintRules('built.energy-sw', energyRules({ result: energyHourly(P, { tz: hourly.tz, days: hourly.days }, ef, DEFAULT_ENERGY, null), presets: DEFAULT_ENERGY_PRESETS, glazing: { from: 'studio', note: 'Her default facade' }, towerName: 'T', dimmed: false })))
    out.push(...lintRules('built.ventilation-sw', ventRules({ readings: ventReadings(v, q), presets: DEFAULT_VENT_PRESETS, glazing: { from: 'studio', note: 'Her default facade' }, towerName: 'T', period: 'whole year', levels: [1, 2], left: 0 })))
  }
  for (const [k, row] of Object.entries(DEFAULT_ECON)) {
    if (k === 'research') {
      const { cost, charges } = DEFAULT_ECON.research
      for (const [id, r] of [...Object.entries(cost.base), ...Object.entries(cost).filter(([i]) => i !== 'base'), ...Object.entries(charges)]) if (r && 'flag' in r) out.push(...lintRow('built.economics', `research.${id}`, r))
    } else if (k === 'valuePerGfa' || k === 'hardCost') for (const [u, r] of Object.entries(row as Record<string, { flag: never; source: string } | null>)) { if (r) out.push(...lintRow('built.economics', `${k}.${u}`, r)) }
    else out.push(...lintRow('built.economics', k, row as { flag: never; source: string }))
  }
  return out
}

describe('evidence lint: unsourced thresholds fail (plan §4)', () => {
  it('flags a result with no source, no threshold or an uncheckable "verified"', () => {
    const bad: RuleResult = { id: 'x', label: 'X', value: '1', threshold: '', state: 'pass', flag: 'verified', source: { label: 'Somewhere' } }
    expect(lintRule('n', bad).map((i) => i.problem)).toEqual(['no threshold stated', '"verified" without a checkable reference (page, clause, URL or source id)'])
    expect(lintRule('n', { ...bad, threshold: '≤ 1', source: { label: '' } }).map((i) => i.problem)).toContain('no source')
    expect(lintRule('n', { ...bad, threshold: '≤ 1', source: { label: 'Brief', page: 'p.19' } })).toEqual([])
  })
  it('passes every built node on both projects', () => {
    checked = 0
    const issues = allIssues()
    expect(issues.map((i) => `${i.node} › ${i.rule}: ${i.problem}`)).toEqual([])
    // Not a vacuous pass: the engines produced a real set of results.
    expect(checked).toBeGreaterThan(100)
  }, 60_000) // the wind comfort lines come from one flow solve (about a second; longer under a loaded suite)
})
