// What the energy port (energySW.ts, Sinnie Choi's engine) is given from the Toolkit's model, and the evidence lines it
// returns. Every floor of the selected tower (plant floors too, as her unconditioned "mep" zone) goes into her frame as
// the daylight port does (daylightSWInput.ts: plates turned to true north, the core at the tower centre); her finishMask
// gives each floor's facade length by orientation and its area; the exposed top of each floor is what the floor above
// does not cover. Glazing comes from the facade node when it is on, else her default zones; the envelope and systems are
// her defaults as presets; lighting is dimmed by the daylight port's monthly daylight share of each floor.
import { coreSideAt, towerFloors } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower, UseId } from './types'
import type { DlFloor } from './daylightSW'
import { floorLoops, noFloorsRule, plateOf, toHer, type GlazingChoice, type P } from './daylightSWInput'
import { DEFAULT_ENERGY, finishPlate, zoneGlazing, type EnergyFloor, type EnergyResult, type EnergySettings, type Prog, type UseKey, USES } from './energySW'

export const SRC = {
  engine: { label: 'Sun & Wind Studio, Sinnie Choi (energy.js, physics.js, study.js, core.js at c24addb, 16 Nov 2026): ISO 13790 simple hourly 5R1C model per program, after ETH Zurich’s RC_BuildingSimulator, ported with her method and constants', url: 'https://github.com/xubynii/sun-wind-studio' },
  climate: { label: 'CWEC2020 typical year, Vancouver Intl AP (WMO 718920), climate.onebuilding.org, hourly as Sun & Wind Studio loads it', url: 'https://climate.onebuilding.org/' },
  targets: { label: 'City of Vancouver rezoning targets as Sun & Wind Studio states them ("Zero Emissions Building Plan, approximate"): TEUI / TEDI / GHGI by program, weighted by floor area (the City’s policy text was not opened: unverified)' },
  iso13790: { label: 'ISO 13790 simple hourly method (5R1C) as Sun & Wind Studio implements it; the standard (since replaced by ISO 52016-1) was not opened: unverified' },
  team: { label: 'Team mapping (Ruijie, 17 Nov 2026): Toolkit uses as her programs (residential → resi, civic and amenity → public, mechanical → her unconditioned plant zone); exposed tops from the plate above; her envelope and systems as presets; glazing from the facade node when on' },
} satisfies Record<string, Source>

/** Toolkit use → her program (team mapping; her "amenity" is an open, unconditioned sky garden, so the Toolkit's conditioned amenity reads as public). */
export const PROG_OF: Record<UseId, Prog> = { retail: 'retail', office: 'office', hotel: 'hotel', residential: 'resi', civic: 'public', amenity: 'public', mechanical: 'mep' }

export interface EnergyPresets extends EnergySettings {
  /** Dim the lighting by the daylight port's monthly daylight share (her page credits it once daylight has run). */
  dimming: boolean
  glazing: 'auto' | 'studio'
  north: 'true' | 'model'
  future: boolean
}
export const DEFAULT_ENERGY_PRESETS: EnergyPresets = { ...DEFAULT_ENERGY, dimming: true, glazing: 'auto', north: 'true', future: true }

export interface EnergyModel { floors: EnergyFloor[]; plates: DlFloor[]; levels: number[]; posX: number; posY: number }
/** Every floor of the tower in her terms: plate, core, facade lengths, area, exposed top, program, glazing by face. */
export function energyModelOf(t: Tower, centre: P, north: number, glazing: GlazingChoice): EnergyModel {
  const all = towerFloors(t)
  const [posX, posY] = toHer(t.x, t.y, centre, north)
  const plates: DlFloor[] = [], levels: number[] = [], progs: Prog[] = []
  for (const f of all) {
    // An imported tower's own storey loops, not its whole hull on every floor (17 Nov review, 6).
    const pl = plateOf(floorLoops(t, f).map((r) => r.map(([x, y]) => toHer(x, y, centre, north))), { i: plates.length, z: f.z0, h: f.z1 - f.z0, core: coreSideAt(t, f.level) })
    if (!pl) continue
    plates.push(pl); levels.push(f.level); progs.push(PROG_OF[f.use] ?? 'office')
  }
  const fin = plates.map((pl) => finishPlate({ ...pl, mask: { ...pl.mask, cells: pl.mask.cells.slice() } }, posX, posY))
  const floors: EnergyFloor[] = plates.map((pl, i) => {
    const exposed = i < plates.length - 1 ? Math.max(0, fin[i].area - fin[i + 1].area) : fin[i].area
    const lvl = i + 1
    return { i, prog: progs[i], h: pl.h, rot: pl.rot, area: fin[i].area, facade: fin[i].facade, garden: fin[i].garden, terrace: i < plates.length - 1 ? exposed : 0, roof: i < plates.length - 1 ? 0 : exposed, coveredVoid: 0,
      glazing: { N: zoneGlazing(glazing.zones, lvl, 'N'), E: zoneGlazing(glazing.zones, lvl, 'E'), S: zoneGlazing(glazing.zones, lvl, 'S'), W: zoneGlazing(glazing.zones, lvl, 'W') } }
  })
  return { floors, plates, levels, posX, posY }
}

// ---------------------------------------------------------------------------------------------- evidence lines

const PROG_WORD: Record<Prog, string> = { office: 'office', studio: 'studio', retail: 'retail', hotel: 'hotel', resi: 'homes', public: 'public and amenity', amenity: 'open amenity', observation: 'observation', boh: 'back of house', mep: 'plant' }
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })
const over = (v: number, t: number) => v > t * 1.001

export interface EnergyRuleInput { result: EnergyResult; presets: EnergyPresets; glazing: Pick<GlazingChoice, 'from' | 'note'>; towerName: string; dimmed: boolean }
/** Her key results as the Toolkit's evidence lines (energy.js kpi / study.js leedCard): TEUI, TEDI and GHGI against her program-weighted targets. None verified. */
export function energyRules(i: EnergyRuleInput): RuleResult[] {
  const { result: r, presets: p } = i
  // No floor area: nothing to divide by, never a NaN pass (17 Nov review, 8).
  if (!(r.gfa > 0)) return [noFloorsRule('sw-en-teui', i.towerName, SRC.engine)]
  const flag: Flag = 'unverified'
  const mix = r.rows.map((x) => `${PROG_WORD[x.p]} ${Math.round((x.area / r.gfa) * 100)}%`).join(', ')
  const plant = p.heat === 'hp' ? 'air-source heat pump' : p.heat === 'gas' ? 'gas boiler' : 'electric resistance'
  const out: RuleResult[] = []
  out.push(rule('sw-en-teui', `Total energy use intensity, TEUI (${i.towerName})`, `${r.teui.toFixed(0)} kWh/m²·yr`, `≤ ${r.tgt.teui.toFixed(0)} kWh/m²·yr, her targets weighted by program (${mix})`,
    over(r.teui, r.tgt.teui) ? 'fail' : 'pass', flag, SRC.targets, `All end uses at the meter over ${Math.round(r.gfa).toLocaleString('en-CA')} m² of floor; ${plant}. The Energy & carbon node holds the VBBL and Higher Buildings Policy limits as research P04 read them.`))
  out.push(rule('sw-en-tedi', 'Thermal energy demand intensity, TEDI', `${r.tedi.toFixed(1)} kWh/m²·yr`, `≤ ${r.tgt.tedi.toFixed(0)} kWh/m²·yr (her targets, program-weighted)`, over(r.tedi, r.tgt.tedi) ? 'fail' : 'pass', flag, SRC.targets,
    `Heat the rooms need before the plant: envelope (glass U ${p.glazU}, wall ${p.wallU}, roof ${p.roofU} W/m²K), ${p.infil} ach infiltration, ${p.vent} L/s·m² outdoor air with ${Math.round(p.hr * 100)}% heat recovery.`))
  out.push(rule('sw-en-ghgi', 'Greenhouse gas intensity, GHGI', `${r.ghgi.toFixed(2)} kgCO₂e/m²·yr`, `≤ ${r.tgt.ghgi.toFixed(1)} kgCO₂e/m²·yr (her targets, program-weighted)`, over(r.ghgi, r.tgt.ghgi) ? 'fail' : 'pass', flag, SRC.targets,
    'Her factors: 0.18 kg/kWh for gas, 0.011 kg/kWh for BC electricity.'))
  const top = USES.map(([k, w]) => [w, r.uses[k as UseKey]] as const).sort((a, b) => b[1] - a[1]).slice(0, 3)
  out.push(rule('sw-en-uses', 'Largest end uses', top.map(([w, v]) => `${w} ${Math.round((v / Math.max(1, r.total)) * 100)}%`).join(', '), 'reported, not judged', 'unknown', flag, SRC.engine, 'Share of the annual energy at the meter.'))
  out.push(rule('sw-en-peaks', 'Peak heating and cooling', `${r.peakH.toFixed(0)} W/m² heating, ${r.peakC.toFixed(0)} W/m² cooling`, 'reported, not judged', 'unknown', flag, SRC.iso13790, 'Highest hourly load over the year per m² of floor, before the plant.'))
  const open = r.rows.filter((x) => !x.cond)
  if (open.length) out.push(rule('sw-en-overheat', 'Unconditioned floors overheating', open.map((x) => `${PROG_WORD[x.p]}: ${x.over26} occupied hours over 26 °C, peak ${x.tMax.toFixed(0)} °C`).join('; '), 'reported, not judged', 'unknown', flag, SRC.iso13790, 'Sky gardens, open amenity and plant floors are not heated or cooled in her model.'))
  out.push(rule('sw-en-daylight', 'Lighting saved by daylight', i.dimmed ? `${Math.round(r.lightShare * 100)}% of the lighting energy` : 'not credited', 'reported, not judged', 'unknown', flag, SRC.engine,
    i.dimmed ? 'The daylight port’s monthly daylight share of each floor dims the lights in daytime hours, for programs not lived in around the clock.' : 'Daylight dimming is off in the presets.'))
  out.push(rule('sw-en-inputs', 'Envelope, systems and glazing used', `${plant}, cooling COP ${p.cop}, ${p.setH}/${p.setC} °C, ${p.mass} mass`, 'reported, not judged', 'unknown', 'team_assumption', SRC.team, `${i.glazing.note}. Lighting ${p.lpd} W/m², plug ${p.equip} W/m², context lets ${Math.round(p.shade * 100)}% of the sun reach the facade.`))
  out.push(rule('sw-en-method', 'Method', 'hourly 5R1C energy balance, one zone per program, CWEC2020 year', 'indicative, not an energy model to the City’s guidelines', 'unknown', flag, SRC.iso13790,
    'Her note: early-design proxy. Compliance needs an energy model to the City of Vancouver Energy Modelling Guidelines by an energy modeller. Weather: ' + SRC.climate.label + '.'))
  return out
}
