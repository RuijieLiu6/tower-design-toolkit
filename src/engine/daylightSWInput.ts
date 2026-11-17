// What the daylight port (daylightSW.ts, Sinnie Choi's engine) is given from the Toolkit's model, and the evidence lines it
// returns. Her frame has +y = north and the four cardinal faces; the Toolkit's plates go in turned so that +y is TRUE north
// (competition site: 45° from the model grid, VTC_NORTH_DEG; Real Vancouver: grid north), because the sun and the sky on
// each face depend on it. A preset keeps the model grid as north instead, to compare with her app, which reads the
// Toolkit's coordinates as they are (open question 3 to Sinnie, 6 Nov). Everything is relative to the domain centre the wind
// port uses (the block centre on the competition site, the selected tower on Real Vancouver), then turned about it.
import type { FacadeInput, FacadeSystem, Quadrant } from './facade'
import { SYSTEMS } from './facade'
import { coreSide, floorRing, towerFloors } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower, UseId } from './types'
import { DEFAULT_TARGET, DEFAULT_VT, DEFAULT_ZONES, maskFloor, sdaPoints, type AseTower, type DlBuilding, type DlFloor, type DlPeriod, type DlTower, type StratId, type Zone } from './daylightSW'

export type P = [number, number]

export const SRC = {
  engine: { label: 'Sun & Wind Studio, Sinnie Choi (physics.js, study.js, core.js at c24addb, 16 Nov 2026): climate-based daylight after Radiance / Daysim / Honeybee practice, ported with her method and constants', url: 'https://github.com/xubynii/sun-wind-studio' },
  climate: { label: 'CWEC2020 typical year, Vancouver Intl AP (WMO 718920), climate.onebuilding.org, hourly records as Sun & Wind Studio loads them (weather.json)', url: 'https://climate.onebuilding.org/' },
  leed: { label: 'LEED v4.1 BD+C EQ Daylight, option 1, as Sun & Wind Studio states it: sDA300/50% 40 / 55 / 75% for 1 / 2 / 3 points; ASE1000/250h at most 10% (the USGBC reference guide was not opened: unverified)' },
  df: { label: 'Mean daylight factor read against EN 17037 as Sun & Wind Studio labels it: 2% well daylit, under 1% electric light most of the day (no edition or clause cited there: unverified)' },
  lm83: { label: 'IES LM-83 method as Sun & Wind Studio applies it: occupied hours 8:00–18:00 clock time, direct sun left to the blinds for sDA (the IES document was not opened: unverified)' },
  vtc: { label: 'Vancouver Tall Challenge base model (Buildner), derived context: neighbours, heritage, future towers' },
  city: { label: 'City of Vancouver building footprints 2015 with LiDAR 2022 heights where measured, else OpenStreetMap via Vista (heights by source, unverified)' },
  team: { label: 'Team mapping (Ruijie, 17 Nov 2026): the facade node’s system, WWR by facing and VLT as her strategy zones; otherwise her default zones; plates turned to true north; plant floors left out' },
} satisfies Record<string, Source>

export interface DaylightPresets {
  /** 'auto': the facade node's glazing when that node is on, else her default zones; 'studio': always her default zones. */
  glazing: 'auto' | 'studio'
  /** Glass visible transmittance; null = the facade node's VLT when entered, else her 0.60. */
  vt: number | null
  /** sDA illuminance target (lux), her 300. */
  target: number
  /** The ASE period (her LAB.S.impact.period). */
  period: DlPeriod
  /** 'true': the plates turned to true north; 'model': the model grid read as north (as her app reads a sent tower). */
  north: 'true' | 'model'
  /** Count the three future towers of the competition model. */
  future: boolean
}
export const DEFAULT_DAYLIGHT_PRESETS: DaylightPresets = { glazing: 'auto', vt: null, target: DEFAULT_TARGET, period: { from: '01-01', to: '12-31' }, north: 'true', future: true }

/** Uses whose floors are not regularly occupied: left out of sDA and ASE (team mapping). */
export const UNOCCUPIED: UseId[] = ['mechanical']

/** The facade node's system as her nearest strategy (team mapping); window wall reads as her curtain wall. */
const STRAT_OF: Record<FacadeSystem, { strat: StratId; depth: number }> = {
  'curtain-wall': { strat: 'curtain', depth: 0 },
  'window-wall': { strat: 'curtain', depth: 0 },
  punched: { strat: 'punched', depth: 0.4 },
  'double-skin': { strat: 'doubleskin', depth: 0.8 },
}

export interface GlazingChoice { zones: Zone[]; vt: number; from: 'facade' | 'studio'; note: string }
/**
 * The zones and VT a run uses. With the facade node on: one zone per facing with its WWR (entered or the system's preset)
 * and the system as her strategy, the VLT when entered. Otherwise her default zones (curtain wall north, fins east and west,
 * an overhang south) and her VT 0.60. A VT preset overrides either.
 */
export function glazingOf(p: DaylightPresets, facade: FacadeInput | null): GlazingChoice {
  if (p.glazing === 'auto' && facade) {
    const st = STRAT_OF[facade.system]
    const zones: Zone[] = (['N', 'E', 'S', 'W'] as Quadrant[]).map((q) => ({ face: q, from: 1, to: 999, strat: st.strat, wwr: facade.wwr[q] ?? SYSTEMS[facade.system].wwr, shgc: facade.shgc ?? 0.4, depth: st.depth, pv: 0, operable: false }))
    const vt = p.vt ?? facade.vlt ?? DEFAULT_VT
    return { zones, vt, from: 'facade', note: `Facade node: ${SYSTEMS[facade.system].label}, WWR ${zones.map((z) => `${z.face} ${Math.round(z.wwr * 100)}%`).join(' · ')}, VT ${vt.toFixed(2)}${p.vt == null && facade.vlt == null ? ' (her default; no VLT entered)' : ''}` }
  }
  const vt = p.vt ?? DEFAULT_VT
  return { zones: DEFAULT_ZONES, vt, from: 'studio', note: `Her default facade: curtain wall north (WWR 35%), fins east (40%, 0.6 m) and west (40%, 0.8 m), overhang south (45%, 0.9 m), VT ${vt.toFixed(2)}` }
}

/** A point of the project frame in her frame: relative to `centre`, turned counter-clockwise by `north` degrees (true north to +y). */
export const toHer = (x: number, y: number, centre: P, north: number): P => {
  const a = (north * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), u = x - centre[0], v = y - centre[1]
  return [u * c - v * s, u * s + v * c]
}

/** Is (x, y) inside the ring (even-odd)? */
function inRing(ring: P[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A plate outline (her frame) as her floor record: turned along its longest edge, the bounding box as w × d, cells inside the outline. */
export function plateOf(ring: P[], base: { i: number; z: number; h: number; core: number }): DlFloor | null {
  const pts = ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  if (pts.length < 3) return null
  let best = -1, rot = 0
  for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best + 1e-9) { best = L; rot = Math.atan2(b[1] - a[1], b[0] - a[0]) } }
  const c = Math.cos(rot), s = Math.sin(rot)
  const loc = pts.map(([x, y]) => [x * c + y * s, -x * s + y * c] as P)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of loc) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const w = x1 - x0, d = y1 - y0; if (w < 1 || d < 1) return null
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  const local = loc.map(([x, y]) => [x - mx, y - my] as P)
  // Rounded so that a rectangle's sides are exact (a cell centre never lands on its edge at a whole-metre plate).
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6
  return maskFloor({ ...base, w: r6(w), d: r6(d), cx: mx * c - my * s, cy: mx * s + my * c, rot }, (lx, ly) => inRing(local, lx, ly))
}

export interface DaylightModel { floors: DlFloor[]; levels: number[]; uses: UseId[]; posX: number; posY: number; left: number }
/** The tower's occupied floors in her frame: each floor's plate (the block at its mid-height, or the imported hull), its core. */
export function daylightModelOf(t: Tower, centre: P, north: number): DaylightModel {
  const all = towerFloors(t)
  const floors: DlFloor[] = [], levels: number[] = [], uses: UseId[] = []
  const core = coreSide(t)
  const [posX, posY] = toHer(t.x, t.y, centre, north)
  let left = 0
  for (const f of all) {
    if (UNOCCUPIED.includes(f.use)) { left++; continue }
    const ring = floorRing(t, f).map(([x, y]) => toHer(x, y, centre, north))
    const pl = plateOf(ring, { i: f.level - 1, z: f.z0, h: f.z1 - f.z0, core })
    if (!pl) { left++; continue }
    floors.push(pl); levels.push(f.level); uses.push(f.use)
  }
  return { floors, levels, uses, posX, posY, left }
}
/** Context buildings (her site raster's list) in her frame. */
export const buildingsToHer = (bld: { x: number; y: number; top: number }[], north: number): DlBuilding[] => bld.map((b) => { const [x, y] = toHer(b.x, b.y, [0, 0], north); return { x, y, top: b.top } })

// ---------------------------------------------------------------------------------------------- evidence lines

export interface DaylightReadings { sda: number; ase: number; df: number; udiU: number; udiE: number; udiS: number; points: number; floors: number; weakest: { level: number; sda: number } | null; aseWorst: { level: number; ase: number } | null }
export function readingsOf(d: DlTower, a: AseTower, levels: number[]): DaylightReadings {
  let weakest: DaylightReadings['weakest'] = null, aseWorst: DaylightReadings['aseWorst'] = null
  d.rows.forEach((r, k) => { if (!weakest || r.pctLit < weakest.sda) weakest = { level: levels[k], sda: r.pctLit } })
  a.rows.forEach((r, k) => { if (!aseWorst || r.pct > aseWorst.ase) aseWorst = { level: levels[k], ase: r.pct } })
  return { sda: d.sda, ase: a.pct, df: d.mean, udiU: d.udiU, udiE: d.udiE, udiS: d.udiS, points: sdaPoints(d.sda), floors: d.rows.length, weakest, aseWorst }
}

const pc = (v: number) => `${Math.round(v * 100)}%`
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

export interface DaylightRuleInput { readings: DaylightReadings; contextLoaded: boolean; unknownHeights: number; glazing: Pick<GlazingChoice, 'from' | 'note'>; presets: DaylightPresets; towerName: string; period: string; left: number }

/** Her key results as the Toolkit's evidence lines (study.js keyItems / leedCard): sDA points, ASE ≤ 10%, mean DF 2% / 1%. None is verified. */
export function daylightRules(i: DaylightRuleInput): RuleResult[] {
  const { readings: r, presets: p } = i
  const flag: Flag = 'unverified'
  const ctx = i.contextLoaded ? (i.unknownHeights ? ` ${i.unknownHeights} context buildings have no height and are left out (never guessed).` : '') : ' No context buildings loaded: nothing shades the windows, so the result is optimistic.'
  const floorsNote = `${r.floors} occupied floors of ${i.towerName}${i.left ? ` (${i.left} plant floors left out)` : ''}, 2 m cells, every second day of the LM-83 occupied hours.`
  const northNote = p.north === 'true' ? 'Faces turned to true north.' : 'The model grid read as north (as her app reads a sent tower), not true north.'
  const out: RuleResult[] = []
  out.push(rule('sw-dl-sda', `Spatial daylight autonomy sDA${p.target}/50% (${i.towerName})`, `${pc(r.sda)} of the floor area (${r.points} LEED point${r.points === 1 ? '' : 's'})`, '≥ 40% for 1 point, ≥ 55% for 2, ≥ 75% for 3 (LEED v4.1 EQ Daylight option 1, as her app states it)',
    !i.contextLoaded ? 'unknown' : r.points > 0 ? 'pass' : 'fail', flag, SRC.leed, `Share of the floor reaching ${p.target} lux from daylight for at least half the occupied hours. ${floorsNote} ${northNote}${ctx}`.trim()))
  out.push(rule('sw-dl-ase', 'Annual sunlight exposure ASE1000/250h', `${pc(r.ase)} of the floor area${r.aseWorst ? ` (most on L${r.aseWorst.level}: ${pc(r.aseWorst.ase)})` : ''}`, '≤ 10%, or show glare control (LEED v4.1, as her app states it)',
    !i.contextLoaded ? 'unknown' : r.ase <= 0.1 ? 'pass' : 'warn', flag, SRC.leed, `Floor in direct sun over 1,000 lux for more than 250 occupied hours (${i.period}; a shorter period scales the 250 hours), through the window band after the shading device, no blinds.${ctx}`.trim()))
  out.push(rule('sw-dl-df', 'Mean daylight factor', `${(r.df * 100).toFixed(1)}%`, '2% well daylit; under 1% needs electric light most of the day (EN 17037 as her app labels it)',
    !i.contextLoaded ? 'unknown' : r.df >= 0.02 ? 'pass' : r.df >= 0.01 ? 'warn' : 'fail', flag, SRC.df, 'CIE overcast sky: sixteen sight lines to the glass per cell, light off the neighbours (BRE externally reflected component) and the BRE split-flux internally reflected component.'))
  out.push(rule('sw-dl-weakest', 'Weakest floor', r.weakest ? `L${r.weakest.level}: sDA ${pc(r.weakest.sda)}` : 'no floor analysed', 'reported, not judged', 'unknown', flag, SRC.engine, 'Low floors behind the neighbours usually set it; deeper plates and lower glass lower it.'))
  out.push(rule('sw-dl-udi', 'Useful daylight illuminance', `${pc(r.udiU)} of hours 100–3,000 lux (${pc(r.udiS)} under, ${pc(r.udiE)} over)`, 'reported, not judged', 'unknown', flag, SRC.lm83, 'Hour by hour over the occupied year, floor-area weighted; over 3,000 lux reads as glare risk and heat.'))
  out.push(rule('sw-dl-glazing', 'Glazing used', i.glazing.from === 'facade' ? 'from the facade node' : 'her default facade zones', 'reported, not judged', 'unknown', 'team_assumption', SRC.team, i.glazing.note))
  out.push(rule('sw-dl-method', 'Method', 'climate-based daylight from the CWEC2020 typical year, Perez sky per face', 'indicative, not a LEED submission', 'unknown', flag, SRC.engine,
    'Her note: proxies for early design. LEED documentation needs an hourly Radiance run with the actual interior. Weather: ' + SRC.climate.label + '. The Daylight screen (plate depth) node is the geometric check before this one: it needs no glass, sky or neighbours.'))
  return out
}
