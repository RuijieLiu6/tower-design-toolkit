// What the ventilation port (ventilationSW.ts, Sinnie Choi's engine) is given from the Toolkit's model, and the evidence
// lines it returns. The plates are the daylight port's (daylightSWInput.ts: the tower's occupied floors in her frame,
// turned to true north, since the wind's direction and each face's pressure depend on it). Her model needs no context
// buildings: the wind at each floor is the station record carried to the site and the height. Which faces open, and her
// ventilation settings, are presets (team assumptions); the glass comes from the facade node when it is on.
import type { Flag, RuleResult, RuleState, Source } from './types'
import type { Zone } from './daylightSW'
import { DEFAULT_VENT, type VentQuick, type VentResult, type VentSettings } from './ventilationSW'
import type { GlazingChoice } from './daylightSWInput'

export const SRC = {
  engine: { label: 'Sun & Wind Studio, Sinnie Choi (physics.js, study.js, core.js at c24addb, 16 Nov 2026): hourly natural-ventilation potential after Ladybug, the CBE adaptive model and a one-zone CONTAM / AirflowNetwork balance, ported with her method and constants', url: 'https://github.com/xubynii/sun-wind-studio' },
  climate: { label: 'CWEC2020 typical year, Vancouver Intl AP (WMO 718920), climate.onebuilding.org, hourly temperature and wind as Sun & Wind Studio loads them; her hourly rain is the station normals spread over overcast humid hours', url: 'https://climate.onebuilding.org/' },
  ashrae621: { label: 'ASHRAE 62.1 natural ventilation procedure as Sun & Wind Studio states it: openable area at least 4% of the floor served, every point within 8 m of an operable opening (the standard was not opened: unverified)' },
  ashrae55: { label: 'ASHRAE 55 adaptive comfort as Sun & Wind Studio applies it: 0.31 × prevailing mean outdoor temperature + 17.8 °C, ± 3.5 K, when that mean is 10–33.5 °C; else her fixed band (the standard was not opened: unverified)' },
  team: { label: 'Team mapping (Ruijie, 17 Nov 2026): the daylight port’s plates turned to true north; operable faces and her ventilation settings as node presets; glazing from the facade node when it is on, else her default zones' },
} satisfies Record<string, Source>

export interface VentilationPresets extends VentSettings {
  /** Which faces have operable windows (her default façade opens all four). */
  operable: Record<'N' | 'E' | 'S' | 'W', boolean>
  glazing: 'auto' | 'studio'
  period: { from: string; to: string }
  north: 'true' | 'model'
}
export const DEFAULT_VENT_PRESETS: VentilationPresets = { ...DEFAULT_VENT, operable: { N: true, E: true, S: true, W: true }, glazing: 'auto', period: { from: '01-01', to: '12-31' }, north: 'true' }

/** The glazing zones with the presets' operable faces (each zone keeps its glass; only `operable` changes). */
export function operableZones(zones: Zone[], p: VentilationPresets): Zone[] {
  const out: Zone[] = []
  for (const z of zones) {
    if (z.face === 'all') for (const f of ['N', 'E', 'S', 'W'] as const) out.push({ ...z, face: f, operable: p.operable[f] })
    else out.push({ ...z, operable: p.operable[z.face] })
  }
  return out
}

export interface VentReadings { openShare: number; comfortShare: number; freePct: number; within8: number; meet4: number; operableFloors: number; floors: number; limit: number; all: boolean; fresh: number; achMed: number; rainH: number }
export function readingsOf(v: VentResult, q: VentQuick): VentReadings {
  return { openShare: v.total / Math.max(1, v.hoursTot), comfortShare: v.comfortH / Math.max(1, v.hoursTot), freePct: q.freePct, within8: q.within8, meet4: q.meet4, operableFloors: q.operable, floors: v.nF, limit: v.limit, all: v.all, fresh: v.fresh, achMed: v.achMed, rainH: v.rainH }
}

const pc = (v: number) => `${Math.round(v * 100)}%`
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

export interface VentRuleInput { readings: VentReadings; presets: VentilationPresets; glazing: Pick<GlazingChoice, 'from' | 'note'>; towerName: string; period: string; levels: number[]; left: number }

/** Her key results as the Toolkit's evidence lines (study.js keyItems / leedCard): openable area ≥ 4%, within 8 m, hours the windows do the work. None verified. */
export function ventRules(i: VentRuleInput): RuleResult[] {
  const { readings: r, presets: p } = i
  const flag: Flag = 'unverified'
  const faces = (['N', 'E', 'S', 'W'] as const).filter((f) => p.operable[f])
  const noOps = r.operableFloors === 0
  const out: RuleResult[] = []
  out.push(rule('sw-vt-openable', `Openable area (${i.towerName})`, noOps ? 'none: no face has operable windows' : `${r.freePct.toFixed(1)}% of the floor served (${r.meet4} of ${r.operableFloors} operable floors reach 4%)`, '≥ 4% of the floor served (ASHRAE 62.1, as her app states it)',
    noOps || r.freePct < 4 ? 'fail' : 'pass', flag, SRC.ashrae621, `Free area: operable faces ${faces.length ? faces.join(', ') : 'none'}, ${pc(p.open)} of the glass opening, over the floor outside the core; area-weighted over the operable floors.`))
  out.push(rule('sw-vt-within8', 'Floor within 8 m of an operable opening', noOps ? 'none' : `${pc(r.within8)} of the operable floor area`, 'every point (≥ 95% read as meeting, her app)',
    noOps ? 'fail' : r.within8 >= 0.95 ? 'pass' : 'warn', flag, SRC.ashrae621, 'Walked cell by cell from the operable faces round the core; deep plates and a central core leave the middle out.'))
  out.push(rule('sw-vt-hours', 'Hours the windows can do the work', `${pc(r.openShare)} of the hours in ${i.period} (outdoor air comfortable in ${pc(r.comfortShare)})`, 'reported, not judged', 'unknown', flag, p.band === 'adaptive' ? SRC.ashrae55 : SRC.engine,
    `Share of operable floors with windows open, hour by hour: room air (outdoor + ${p.dT} K) in the ${p.band === 'adaptive' ? 'ASHRAE 55 adaptive band' : `fixed ${p.tmin}–${p.tmax} °C band`}, gust under ${p.umax} m/s at the floor, no rain over 1 mm/h. Mechanical cooling covers the rest.`))
  out.push(rule('sw-vt-height', 'Highest floor that can open', r.limit ? `L${i.levels[r.limit - 1] ?? r.limit}${r.all ? ' (every operable floor)' : ''}` : 'none', 'reported, not judged', 'unknown', flag, SRC.engine,
    `The highest floor whose windows are blocked by gusts in under a fifth of its comfortable hours; above it the wind at height closes them more often (a double skin raises her gust limit 1.6×).`))
  out.push(rule('sw-vt-fresh', 'Open hours meeting the outdoor-air rate', noOps ? 'none' : `${pc(r.fresh)} of open hours (median ${r.achMed.toFixed(1)} air changes per hour)`, 'reported, not judged', 'unknown', flag, SRC.engine,
    `Air changes from the wind and stack balance against her 0.35 L/s per m² of floor (${mode(p.mode)}).`))
  out.push(rule('sw-vt-glazing', 'Glazing and openings used', i.glazing.from === 'facade' ? 'from the facade node' : 'her default facade zones', 'reported, not judged', 'unknown', 'team_assumption', SRC.team, `${i.glazing.note}. Operable faces: ${faces.join(', ') || 'none'}. ${r.floors} occupied floors${i.left ? ` (${i.left} plant floors left out)` : ''}.`))
  out.push(rule('sw-vt-method', 'Method', 'hourly natural-ventilation potential over the CWEC2020 year, one zone per floor', 'indicative, not an AirflowNetwork model', 'unknown', flag, SRC.engine,
    'Her note: wind pressure by face angle and stack pressure through each opening, balanced per floor; no internal partitions, no neighbours sheltering the wind. Weather: ' + SRC.climate.label + '.'))
  return out
}
const mode = (m: VentSettings['mode']) => (m === 'cross' ? 'cross ventilation' : m === 'single' ? 'single-sided, with BS 5925 wind turbulence' : 'stack through a shaft three storeys up')

