// The Sun & Wind Studio tools run here: one compute per tool from the shared inputs (lib/swInputs.ts) and settings
// (lib/swStudy.ts), each giving its key readings as rule lines (pass / near / fail, as the Studio's Key results panel)
// and the data its drawings and analysis view need. Results are kept in a store by tool so the results panel, the
// analysis view and the checklists read one run.
import { create } from 'zustand'
import { towerOccluders } from '../engine/solarRules'
import { aseTower, daylightTower, type DaylightTower, type AseTower } from '../engine/sw/daylight'
import { hourBase, hourLight, type HourLight } from '../engine/sw/hourLight'
import { energyModel, ENERGY_DEFAULTS, type EnergyFloor, type EnergyResult } from '../engine/sw/energy'
import { FACE_AZ, ORI, swFloors, toNorth, zonesOf, zoneFor, band, STRATS, type Face, type SwFloor } from '../engine/sw/plate'
import { designStorm, facadeRain, groundShelter, hourlyRain, keepFor, rainBySector, roofCollect, wdrBins, type FaceRain, type GroundShelter, type RainTower, type RoofWater } from '../engine/sw/rain'
import { facadeIrradiance, sunGround, SUN_DATES, type SunGround } from '../engine/sw/sun'
import { periodLabel, periodRange } from './sunPeriod'
import type { FacadeFace, Prism } from '../engine/sw/types'
import { ALPHA, lawsonClass, runWindStudy, SEASONS, windRose, type Rose, type WindStudy } from '../engine/sw/wind'
import type { RuleResult, RuleState, Tower } from '../engine/types'
import type { KeySpec } from '../components/ResultViz'
import { faceSunHours, peopleOf, prismsToNorth, roofYear, shadowRange, stormOnFaces, windProfile } from '../engine/sw/detail'
import type { SwInputs } from './swInputs'
import { doyOf, studyLevel, type SwStudySettings } from './swStudy'

export const SW_IDS = ['built.sw-shadow', 'built.sw-sun-faces', 'built.sw-pv', 'built.sw-wind-comfort', 'built.sw-wind-height', 'built.sw-rain-faces', 'built.sw-rain-water', 'built.sw-form',
  'built.sw-glazing', 'built.sw-daylight', 'built.sw-daylight-factor', 'built.sw-light-hour', 'built.sw-natvent', 'built.sw-airflow', 'built.sw-energy', 'built.sw-indoor-temp'] as const
export type SwId = (typeof SW_IDS)[number]
export const isSw = (id: string | null | undefined): id is SwId => !!id && (SW_IDS as readonly string[]).includes(id)

export interface SwOut { rules: RuleResult[]; data: Record<string, unknown>; ms: number; key: string; /** The key readings as visual rows (the Studio's keyItems). */ keys?: SwKey[] }
/** A key reading with the Studio's badge wording ("3 pts", "glare", "medium"). */
export type SwKey = KeySpec & { badge?: string }

/** The Studio's colours for the Lawson bands, the indoor temperature bins and the heat-loss paths. */
export const BAND_COL = ['#3E8E7E', '#8FC17A', '#E3C25C', '#E08A3C', '#B8362B'], BAND_NAME = ['sitting', 'standing', 'strolling', 'walking', 'uncomfortable']
export const T_COL = ['#3E6FB0', '#9CC3E4', '#86BE7E', '#F0B357', '#D2493A'], T_NAME = ['Under 18 °C', '18–20', '20–26', '26–28', 'Over 28 °C']
export const LOSS_COL = { glass: '#5B8FC9', wall: '#A0857A', roof: '#7C6A8E', vent: '#3FA7A0', infil: '#B7C3CE' }
/** One key reading (study.js KR). */
export const key = (id: string, label: string, std: string, value: string, state: RuleState, tip: string, more: Partial<SwKey> = {}): SwKey => ({ id, label, std, value, state, tip, ...more })
/** The tallest tower's floors (the one the interior studies draw) and every block around, in the north frame. */
export function mainTower(inp: SwInputs) {
  const t = [...inp.towers].sort((a, b) => b.height - a.height)[0]
  return t ? { t, floors: swFloors(t, inp.north, 1) } : null
}
export const blocksNorth = (inp: SwInputs) => prismsToNorth([...inp.context, ...inp.towers.flatMap(prismsOf)], inp.north)

const SRC = { label: 'Sun & Wind Studio engines (engine/sw), CWEC 2020 Vancouver Intl' }
export function rule(id: string, label: string, value: string, threshold: string, state: RuleState, note?: string, source = SRC): RuleResult {
  return { id, label, value, threshold, state, flag: 'team_assumption', source, ...(note ? { note } : {}) }
}
const pc = (v: number) => `${Math.round(v * 100)}%`
const fmt = (v: number) => Math.round(v).toLocaleString()

/** The towers' blocks as the engines take them. */
export const prismsOf = (t: Tower) => towerOccluders([t]).prisms as Prism[]
export function massing(towers: Tower[]) {
  return { towers: towers.map((t) => ({ id: t.id, name: t.name, height: t.height, tower: t, blocks: prismsOf(t).map((p) => ({ ...p, podium: t.podiumHeight > 0 && p.z0 <= 0.01 && p.z1 <= t.podiumHeight + 0.01 })) })) }
}

/** Every above-grade floor of every tower, with its tower. */
export function allFloors(inp: SwInputs): { t: Tower; floors: SwFloor[] }[] {
  return inp.towers.map((t) => ({ t, floors: swFloors(t, inp.north, 1) }))
}
/** The floor an interior study draws: on the tallest tower, at the chosen level. */
export function planFloor(inp: SwInputs, s: SwStudySettings, cell = 1): { t: Tower; f: SwFloor; levels: number } | null {
  if (!inp.towers.length) return null
  const t = [...inp.towers].sort((a, b) => b.height - a.height)[0]
  const floors = swFloors(t, inp.north, cell)
  if (!floors.length) return null
  const L = studyLevel(floors.length, s.level)
  return { t, f: floors[L - 1], levels: floors.length }
}

/** Area-weighted window-to-wall ratio and SHGC per compass face over a tower (the energy model's envelope). */
export function faceGlazing(t: Tower, floors: SwFloor[]): Record<Face, { wwr: number; shgc: number; area: number }> {
  const zones = zonesOf(t)
  const acc = Object.fromEntries(ORI.map((o) => [o, { a: 0, g: 0, s: 0 }])) as Record<Face, { a: number; g: number; s: number }>
  for (const f of floors) for (const e of f.edges) { const z = zoneFor(zones, e.o, f.level); const a = e.L * f.h; acc[e.o].a += a; acc[e.o].g += a * z.wwr; acc[e.o].s += a * z.wwr * z.shgc * (STRATS[z.strat].mod ?? 1) }
  return Object.fromEntries(ORI.map((o) => [o, { wwr: acc[o].a ? acc[o].g / acc[o].a : 0, shgc: acc[o].g ? acc[o].s / acc[o].g : 0.35, area: acc[o].a }])) as Record<Face, { wwr: number; shgc: number; area: number }>
}

// ------------------------------------------------------------------ one compute per tool
type Run = (inp: SwInputs, s: SwStudySettings) => Omit<SwOut, 'ms' | 'key'> | Promise<Omit<SwOut, 'ms' | 'key'>>

const RUNS: Partial<Record<SwId, Run>> = {
  'built.sw-shadow': (inp, s) => {
    const C = inp.C!
    const g: SunGround = sunGround(inp.towers.flatMap(prismsOf), inp.context, inp.site, C, inp.north, { scope: s.sunScope, date: s.sunDate, period: s.sunPeriod, range: periodRange(s.periodFrom, s.periodTo), h0: s.h0, h1: s.h1, cell: 2, margin: 120 })
    const when = s.sunScope === 'date' ? `${SUN_DATES[s.sunDate].label}, ${s.h0}:00–${s.h1}:00` : periodLabel(s.periodFrom, s.periodTo)
    const plazaShare = g.siteOpen ? g.siteInShadow / g.siteOpen : null
    // The shadow at each hour of the study day and of the three sample days (study.js shadowRangeSVG), north up.
    const own = prismsToNorth(inp.towers.flatMap(prismsOf), inp.north)
    const D = SUN_DATES[s.sunDate]
    const range = shadowRange(own, C, D.doy, D.m, s.h0, s.h1)
    const days = (['summer', 'equinox', 'winter'] as const).map((k) => ({ k, label: SUN_DATES[k].label.split(' · ')[1], range: shadowRange(own, C, SUN_DATES[k].doy, SUN_DATES[k].m, 9, 16) }))
    let sunSum = 0, sunN = 0, sunMax = 1
    for (let k = 0; k < g.sunHours.length; k++) { const v = g.sunHours[k]; if (!(v >= 0)) continue; if (v > sunMax) sunMax = v; if (g.siteMask?.[k]) { sunSum += v; sunN++ } }
    const span = s.sunScope === 'date' ? Math.max(1, s.h1 - s.h0) : sunMax
    const siteSun = sunN ? sunSum / sunN / span : null
    const siteRing = inp.site ? prismsToNorth([{ ring: inp.site, z0: 0, z1: 0 }], inp.north)[0].ring : null
    const unit = s.sunScope === 'date' ? 'h' : 'h in the period'
    return {
      data: { g, when, range, days, siteRing, dateLabel: D.label },
      keys: [
        ...(plazaShare != null ? [key('sw-shadow-site', 'Site in new shadow', 'aim 25%', pc(plazaShare), plazaShare <= 0.25 ? 'pass' : plazaShare <= 0.4 ? 'warn' : 'fail', `Share of the open site with at least ${g.th[0]} ${unit} of new shadow (${when}). Aim to stay under a quarter.`, { bar: { max: 1, v: plazaShare, zone: [0, 0.25], ticks: [[0.25, '25% aim']] } })] : []),
        key('sw-shadow-ground', 'New shadow', 'ground', fmt(g.a[0]), 'unknown', `Ground with at least ${g.th[0]} ${unit} of new shadow; ${fmt(g.a[1])} m² gets ${g.th[1]} or more and ${fmt(g.a[2])} m² gets ${g.th[2]} or more.`, { unit: 'm²', ...(g.a[0] > 0 ? { stack: { parts: [g.a[2] / g.a[0], (g.a[1] - g.a[2]) / g.a[0], (g.a[0] - g.a[1]) / g.a[0]], colors: ['#7a2e8e', '#e09a2c', '#f2cd78'], names: [`${g.th[2]} ${unit} or more`, `${g.th[1]}–${g.th[2]} ${unit}`, `${g.th[0]}–${g.th[1]} ${unit}`] } } : {}) }),
        ...(siteSun != null ? [key('sw-shadow-sun', 'Site in the sun', 'study hours', pc(siteSun), 'unknown', 'Mean share of the study hours the open site gets direct sun, after the towers and the buildings around.', { bar: { max: 1, v: siteSun } })] : []),
      ],
      rules: [
        ...(plazaShare != null ? [rule('sw-shadow-site', 'Open site in new shadow', pc(plazaShare), 'aim at most 25% of the open site', plazaShare <= 0.25 ? 'pass' : plazaShare <= 0.4 ? 'warn' : 'fail', `${when}; ground with at least ${g.th[0]} h of new shadow.`)] : []),
        rule('sw-shadow-ground', 'New shadow on the ground', `${fmt(g.a[0])} m²`, `${g.th[0]} h or more`, 'unknown', `${fmt(g.a[2])} m² gets ${g.th[2]} h or more (${when}).`),
      ],
    }
  },
  'built.sw-sun-faces': (inp, s) => {
    const C = inp.C!
    const blocks = inp.towers.flatMap((t) => prismsOf(t).map((p) => ({ towerId: t.id, ring: p.ring, z0: p.z0, z1: p.z1 })))
    const faces: FacadeFace[] = facadeIrradiance(blocks, inp.context, C, inp.north)
    const by = byFace(faces)
    const best = ORI.reduce((a, o) => ((by[o] ?? 0) > (by[a] ?? 0) ? o : a), 'N' as Face)
    const mt = mainTower(inp), D = SUN_DATES[s.sunDate]
    const sunH = mt ? faceSunHours(mt.floors, blocksNorth(inp), C, D.doy) : null
    const top = Math.max(1, ...ORI.map((o) => by[o] ?? 0)) * 1.1
    return { data: { faces, by, sunH, dateLabel: D.label }, keys: ORI.filter((o) => by[o] != null).map((o) => key(`sw-sunface-${o}`, `${FACE_WORD[o]} faces`, o === best ? 'sunniest' : '', fmt(by[o]!), 'unknown', `Sun on the ${FACE_WORD[o].toLowerCase()} faces over the year (Perez sky, beam shaded by the towers and the buildings around)${sunH ? `; ${sunH.byFace[o].toFixed(1)} h of sun on a clear ${D.label.split(' · ')[1]}` : ''}.${o === best ? ' The sunniest face: shade it first, or put PV there.' : ''}`, { unit: 'kWh/m²', bar: { max: top, v: by[o]! } })), rules: ORI.filter((o) => by[o] != null).map((o) => rule(`sw-sunface-${o}`, `Sun on the ${o} faces`, `${fmt(by[o]!)} kWh/m² a year`, 'reading', 'unknown', o === best ? 'The sunniest face: shade it first, or put PV there.' : undefined)) }
  },
  'built.sw-wind-comfort': (inp, s) => {
    const C = inp.C!
    const w: WindStudy = runWindStudy({ project: inp.project, ring: inp.site, context: inp.context, latLon: [49.28, -123.12], northDeg: inp.north, ground: 0 }, massing(inp.towers), C, { season: s.season, cell: 4 })
    const tot = w.cats.reduce((a, b) => a + b, 0) || 1, ok = (w.cats[0] + w.cats[1]) / tot, bad = w.cats[4] / tot
    return {
      data: { w },
      keys: [
        key('sw-wind-calm', 'Calm ground', 'Lawson', pc(ok), ok >= 0.8 ? 'pass' : ok >= 0.6 ? 'warn' : 'fail', 'Share of open ground in the Lawson sitting or standing bands (mean up to 4 m/s). The bar shows all five bands, calmest on the left.', { stack: { parts: w.cats.map((c) => c / tot), colors: BAND_COL, names: BAND_NAME } }),
        ...(w.sitePeak != null ? [key('sw-wind-peak', 'Site peak wind', 'Lawson', w.sitePeak.toFixed(1), w.sitePeak <= 4 ? 'pass' : w.sitePeak <= 6 ? 'warn' : 'fail', 'The windiest point on the site: up to 4 m/s suits sitting and standing, 6 strolling, 8 walking; above 8 is uncomfortable.', { unit: 'm/s', bar: { max: 10, v: Math.min(10, w.sitePeak), zone: [0, 4], ticks: [[4, '4'], [6, '6'], [8, '8 m/s']] } })] : []),
        key('sw-wind-bad', 'Too windy', 'over 8 m/s', pc(bad), bad <= 0.01 ? 'pass' : 'fail', 'Open ground over 8 m/s mean, uncomfortable for any use. There should be none near entrances.', { bar: { max: 0.2, v: Math.min(0.2, bad), zone: [0, 0.01], ticks: [[0.01, '']] } }),
        key('sw-wind-change', 'Made windier', 'vs none', fmt(w.worse), w.worse <= w.better ? 'pass' : 'warn', `${fmt(w.worse)} m² drop a comfort band because of the towers; ${fmt(w.better)} m² become calmer in their lee.`, { unit: 'm²', ...(w.worse + w.better > 0 ? { stack: { parts: [w.worse / (w.worse + w.better), w.better / (w.worse + w.better)], colors: ['#E08A3C', '#3E8E7E'], names: ['windier', 'calmer'] } } : {}) }),
      ],
      rules: [
        rule('sw-wind-calm', 'Ground calm enough to stand (Lawson)', pc(ok), 'at least 80% good, 60% fair', ok >= 0.8 ? 'pass' : ok >= 0.6 ? 'warn' : 'fail', 'Share of open ground in the sitting or standing bands (mean up to 4 m/s).'),
        ...(w.sitePeak != null ? [rule('sw-wind-peak', 'Site peak wind', `${w.sitePeak.toFixed(1)} m/s`, 'up to 4 calm, 6 breezy', w.sitePeak <= 4 ? 'pass' : w.sitePeak <= 6 ? 'warn' : 'fail')] : []),
        rule('sw-wind-bad', 'Uncomfortable ground (over 8 m/s)', pc(bad), 'none near entrances', bad <= 0.01 ? 'pass' : 'fail'),
      ],
    }
  },
  'built.sw-wind-height': (inp, s) => {
    const C = inp.C!
    const rose: Rose = windRose(C, s.season)
    const U10 = rose.sectors.reduce((a, r) => a + r.f * r.s, 0)
    // Each roof and terrace at its height (the Studio's 'Wind with height'): mean wind by the power law, Lawson band.
    const decks = inp.towers.flatMap((t) => prismsOf(t).map((p) => ({ tower: t.name, z: p.z1 })))
    const uniq = [...new Map(decks.map((d) => [`${d.tower}|${Math.round(d.z)}`, d])).values()].sort((a, b) => a.z - b.z)
    const rows = uniq.map((d) => { const u = U10 * Math.pow(Math.max(10, d.z) / 10, ALPHA); return { ...d, u, band: lawsonClass(u) } })
    const worst = rows.reduce((a, r) => (r.u > a.u ? r : a), rows[0] ?? { u: 0, z: 0, tower: '', band: 0 })
    const H = Math.max(0, ...inp.towers.map((t) => t.height))
    const downwash = H > 0 ? U10 * Math.pow(Math.max(10, H * 0.7) / 10, ALPHA) : 0
    // The downwash section (study.js downwashSVG): the tallest tower against its neighbours' mean height within 120 m.
    const tall = [...inp.towers].sort((a, b) => b.height - a.height)[0]
    let hs = 0, hc = 0
    for (const p of inp.context) { if (p.z1 < 3) continue; const cx = p.ring.reduce((q, v) => q + v[0], 0) / p.ring.length, cy = p.ring.reduce((q, v) => q + v[1], 0) / p.ring.length; if (Math.hypot(cx - tall.x, cy - tall.y) < 120) { hs += p.z1; hc++ } }
    const hn = hc ? hs / hc : 20
    const amp0 = Math.min(2.1, Math.max(1, 1 + 0.45 * Math.log2(H / Math.max(8, hn))))
    const amp = tall.podiumHeight > 0 ? 1 + (amp0 - 1) * (1 - 0.8 * Math.min(1, tall.podiumHeight / 30)) : amp0
    const profile = windProfile(U10, H)
    const topP = profile[profile.length - 1]
    const sec = { H, w: Math.max(tall.width, tall.depth), hn, amp, amp0, depth: 0.22 * H, podiumH: tall.podiumHeight, podiumW: Math.max(tall.podiumWidth, tall.podiumDepth), U10 }
    return {
      data: { rows, rose, U10, downwash, H, profile, sec },
      keys: [
        ...(rows.length ? [key('sw-wind-deck', 'Windiest deck', 'Lawson', worst.u.toFixed(1), worst.u <= 4 ? 'pass' : worst.u <= 6 ? 'warn' : 'fail', `Season mean at ${Math.round(worst.z)} m by the power law (10 m mean ${U10.toFixed(1)} m/s, exponent ${ALPHA}). Up to 4 m/s suits sitting, 6 strolling; terraces above need screens.`, { unit: 'm/s', bar: { max: 10, v: Math.min(10, worst.u), zone: [0, 4], ticks: [[4, '4'], [6, '6'], [8, '8 m/s']] } })] : []),
        key('sw-wind-downwash', 'Downwash', 'at 0.7 H', downwash.toFixed(1), downwash <= 5 ? 'pass' : downwash <= 7 ? 'warn' : 'fail', `Mean wind at 70% of the height, which the face sends down to the street; ×${amp.toFixed(2)} at the ground against the free wind. A podium or canopy helps over 5 m/s.`, { unit: 'm/s', bar: { max: 10, v: Math.min(10, downwash), zone: [0, 5], ticks: [[5, '5 m/s']] } }),
        ...(topP ? [key('sw-wind-gust', 'Gust at the top', '', topP.gust.toFixed(0), 'unknown', `Gusts 1.8 × the mean at the top of the tower: ${(topP.q / 1000).toFixed(1)} kPa on screens and operable windows.`, { unit: 'm/s', bar: { max: 40, v: Math.min(40, topP.gust) } })] : []),
      ],
      rules: [
        ...(rows.length ? [rule('sw-wind-deck', 'Windiest roof or terrace', `${worst.u.toFixed(1)} m/s at ${Math.round(worst.z)} m`, 'up to 6 m/s for terraces people use', worst.u <= 4 ? 'pass' : worst.u <= 6 ? 'warn' : 'fail', `Season mean ${U10.toFixed(1)} m/s at 10 m, power law α ${ALPHA}.`)] : []),
        rule('sw-wind-downwash', 'Wind brought down the face', `${downwash.toFixed(1)} m/s`, 'a podium or canopy over 5 m/s', downwash <= 5 ? 'pass' : downwash <= 7 ? 'warn' : 'fail', 'Mean wind at 70% of the height, which the face sends down to the street.'),
      ],
    }
  },
  'built.sw-rain-faces': (inp) => {
    const C = inp.C!
    const keep = keepFor(C, 'year')
    const rt = rainTowers(inp.towers)
    const faces: FaceRain[] = facadeRain(rt, inp.north, wdrBins(C, keep))
    const A = rainBySector(C, keep)
    const worst = faces.reduce<FaceRain | null>((a, f) => (!a || f.index > a.index ? f : a), null)
    const li = worst ? ['sheltered', 'moderate', 'severe', 'very severe'].indexOf(worst.band) : 0
    const mt = mainTower(inp)
    const storm = A ? designStorm(A) : null
    const SF = mt && storm ? stormOnFaces(mt.floors, blocksNorth(inp), storm, 'steady') : null
    const wetF = SF && worst ? SF.faces.find((f) => f.o === oriOf(worst.az)) : null
    return {
      data: { faces, A, by: byFace(faces.map((f) => ({ az: f.az, area: f.area, value: f.index }))), SF },
      keys: worst ? [
        key('sw-rain-worst', `Wettest: ${FACE_WORD[oriOf(worst.az)].toLowerCase()}`, 'ISO 15927-3', worst.band, li <= 1 ? 'pass' : li === 3 ? 'fail' : 'warn', `The face most exposed to wind-driven rain: airfield index ${Math.round(worst.index)} L/m² a year. The scale runs sheltered, moderate, severe, very severe (BS 8104).`, { bar: { max: 4, v: li + 0.5, zone: [0, 2], ticks: [[1, ''], [2, ''], [3, '']] } }),
        ...(wetF ? [key('sw-rain-wet', 'Wetted in storm', `${FACE_WORD[wetF.o].toLowerCase()} face`, pc(wetF.wetShare), 'unknown', `Share of that face the design storm reaches (from ${Math.round(SF!.dir)}° at ${SF!.speed.toFixed(1)} m/s, rain ${Math.round(SF!.alphaDeg)}° from vertical), after the buildings around.`, { bar: { max: 1, v: wetF.wetShare } })] : []),
        ...(SF ? [key('sw-rain-catch', 'Storm catch', '', (wetF?.storm ?? 0).toFixed(1), 'unknown', 'Wind-driven rain on the face in the design storm (catch ratio 0.222 · U · R^0.88 with wall factors by height).', { unit: 'L/m² h', bar: { max: Math.max(1, ...SF.faces.map((f) => f.storm)) * 1.1, v: wetF?.storm ?? 0 } })] : []),
      ] : [],
      rules: worst ? [rule('sw-rain-worst', 'Wettest face (ISO 15927-3)', `${oriOf(worst.az)} · ${worst.band}`, 'moderate or less', li <= 1 ? 'pass' : li === 3 ? 'fail' : 'warn', `Airfield index ${Math.round(worst.index)} L/m² a year.`)] : [],
    }
  },
  'built.sw-rain-water': (inp, s) => {
    const C = inp.C!
    const rt = rainTowers(inp.towers)
    const mm = hourlyRain(C).reduce((a, b) => a + b, 0)
    const roof: RoofWater = roofCollect(rt, mm, s.rainEff)
    const A = rainBySector(C, keepFor(C, 'year'))
    let sh: GroundShelter | null = null
    if (A) sh = groundShelter(inp.towers.flatMap(prismsOf), inp.context, inp.site, inp.north, A, { cell: 2, drop: 'steady', storm: designStorm(A) })
    const RY = roofYear(C, roof.area, s.rainEff, allFloors(inp).reduce((a, x) => a + peopleOf(x.floors), 0))
    const storm = A ? designStorm(A) : null
    return {
      data: { roof, sh, mm, RY, A, storm },
      keys: [
        key('sw-rain-roof', 'Rain collected', 'LEED WE', fmt(roof.annual), 'unknown', `From ${fmt(roof.area)} m² of roof and terraces at ${pc(s.rainEff)} run-off${RY.flushShare != null ? `: ${pc(RY.flushShare)} of toilet flushing for ${fmt(RY.people)} people` : ''}.`, { unit: 'm³/yr', ...(RY.flushShare != null ? { bar: { max: 1, v: RY.flushShare, ticks: [[1, 'all flushing']] as [number, string][] } } : {}) }),
        key('sw-rain-storm', 'Storm run-off', `${Math.round(RY.stormMM)} mm`, fmt(RY.storm), 'unknown', `${Math.round(RY.stormMM)} mm in an hour on the roofs and terraces: peak ${Math.round(RY.peakLs)} L/s to the drains.`, { unit: 'm³' }),
        ...(sh ? [key('sw-rain-dry', 'Ground kept dry', '', fmt(sh.dryStorm), 'unknown', `Rain shadow of the towers in the design storm${sh.siteOpen ? `; ${fmt(sh.dryStormSite)} m² of it on the site` : ''}.`, { unit: 'm²', ...(sh.siteOpen ? { bar: { max: 1, v: Math.min(1, sh.dryStormSite / sh.siteOpen) } } : {}) })] : []),
      ],
      rules: [
        rule('sw-rain-roof', 'Rainwater collected from roofs', `${fmt(roof.annual)} m³ a year`, 'reading', 'unknown', `From ${fmt(roof.area)} m² of roof and terraces at ${pc(s.rainEff)} run-off.`),
        ...(sh ? [rule('sw-rain-dry', 'Ground kept dry in the design storm', `${fmt(sh.dryStorm)} m²`, 'reading', 'unknown', sh.siteOpen ? `${fmt(sh.dryStormSite)} m² of it on the site.` : undefined)] : []),
      ],
    }
  },
  'built.sw-daylight': (inp, s) => {
    const C = inp.C
    const per = allFloors(inp).map(({ t, floors }) => ({ t, dl: daylightTower(floors, zonesOf(t), C, { target: s.dlTarget, blinds: s.blinds, ctx: inp.ctxBlocks }), ase: aseTower(floors, zonesOf(t), C, undefined, { ctx: inp.ctxBlocks }) }))
    const A = per.reduce((a, p) => a + p.dl.rows.reduce((q, r) => q + r.area, 0), 0) || 1
    const aw = (g: (p: { dl: DaylightTower; ase: AseTower }) => number) => per.reduce((a, p) => a + g(p) * p.dl.rows.reduce((q, r) => q + r.area, 0), 0) / A
    const sda = aw((p) => p.dl.sda), ase = aw((p) => p.ase.pct)
    const pts = sda >= 0.75 ? 3 : sda >= 0.55 ? 2 : sda >= 0.4 ? 1 : 0
    const D0 = per[0]?.dl
    return {
      data: { per, sda, ase, pts },
      keys: [
        key('sw-sda', 'Daylight autonomy', 'LEED', pc(sda), pts >= 2 ? 'pass' : pts === 1 ? 'warn' : 'fail', `LEED v4.1 EQ Daylight, option 1: sDA${s.dlTarget}/50%, the share of the floor that reaches ${s.dlTarget} lux from daylight for at least half the occupied hours. 40 / 55 / 75% earn 1 / 2 / 3 points (${pts} now). Blinds ${s.blinds ? 'come down as in IES LM-83' : 'are taken as up all year'}.`, { badge: `${pts} pt${pts === 1 ? '' : 's'}`, bar: { max: 1, v: sda, zone: [0.4, 1], ticks: [[0.4, '40'], [0.55, '55'], [0.75, '75%']] } }),
        key('sw-ase', 'Sunlight exposure', 'LEED', pc(ase), ase <= 0.1 ? 'pass' : 'warn', 'ASE1000/250h: the share of the floor in direct sun over 1,000 lux for more than 250 hours a year. At most 10%, or show glare control.', { badge: ase <= 0.1 ? 'meets' : 'glare', bar: { max: 0.3, v: Math.min(0.3, ase), zone: [0, 0.1], ticks: [[0.1, '10% max']] } }),
        ...(D0 && D0.enMin != null ? [key('sw-en', 'Daylight provision', 'EN 17037', pc(D0.enMin), D0.enMin >= 0.75 ? 'pass' : D0.enMin >= 0.5 ? 'warn' : 'fail', `Share of floor area that meets the EN 17037 minimum level (300 lux on half a floor and 100 lux on 95% of it, in half the daylight hours); ${pc(D0.enMed ?? 0)} reach medium and ${pc(D0.enHigh ?? 0)} high.`, { badge: (D0.enHigh ?? 0) >= 0.5 ? 'high' : (D0.enMed ?? 0) >= 0.5 ? 'medium' : D0.enMin >= 0.5 ? 'minimum' : 'not met', bar: { max: 1, v: D0.enMin, zone: [0.75, 1], ticks: [[0.5, '50'], [0.75, '75%']] } })] : []),
      ],
      rules: [
        rule('sw-sda', `Daylight autonomy (sDA${s.dlTarget}/50%, LEED)`, pc(sda), '40 / 55 / 75% for 1 / 2 / 3 points', pts >= 2 ? 'pass' : pts === 1 ? 'warn' : 'fail', `${pts} LEED point${pts === 1 ? '' : 's'}; blinds ${s.blinds ? 'operated as LM-83' : 'up'}.`, { label: 'LEED v4.1 EQ Daylight option 1; IES LM-83' }),
        rule('sw-ase', 'Annual sun exposure (ASE1000/250h)', pc(ase), 'at most 10%, or show glare control', ase <= 0.1 ? 'pass' : 'warn', undefined, { label: 'LEED v4.1 EQ Daylight; IES LM-83' }),
      ],
    }
  },
  'built.sw-daylight-factor': (inp, s) => {
    const C = inp.C
    const per = allFloors(inp).map(({ t, floors }) => ({ t, dl: daylightTower(floors, zonesOf(t), C, { target: s.dlTarget, blinds: s.blinds, ctx: inp.ctxBlocks }) }))
    const A = per.reduce((a, p) => a + p.dl.rows.reduce((q, r) => q + r.area, 0), 0) || 1
    const aw = (g: (d: DaylightTower) => number | null) => per.reduce((a, p) => a + (g(p.dl) ?? 0) * p.dl.rows.reduce((q, r) => q + r.area, 0), 0) / A
    const mean = aw((d) => d.mean), enMin = per.some((p) => p.dl.enMin != null) ? aw((d) => d.enMin) : null, enMed = per.some((p) => p.dl.enMed != null) ? aw((d) => d.enMed) : null
    const udi = (['udiS', 'udiU', 'udiE'] as const).map((k) => aw((d) => d[k]))
    return {
      data: { per, mean, enMin, enMed },
      keys: [
        key('sw-df', 'Daylight factor', 'mean', `${(mean * 100).toFixed(1)}%`, mean >= 0.02 ? 'pass' : mean >= 0.01 ? 'warn' : 'fail', 'Mean daylight factor under an overcast sky. 2% reads as well daylit; under 1% needs electric light most of the day.', { badge: mean >= 0.02 ? 'well daylit' : mean >= 0.01 ? 'fair' : 'dim', bar: { max: 0.05, v: Math.min(0.05, mean), zone: [0.02, 0.05], ticks: [[0.01, '1'], [0.02, '2%']] } }),
        ...(enMin != null ? [key('sw-en17037', 'Daylight provision', 'EN 17037', pc(enMin), enMin >= 0.75 ? 'pass' : enMin >= 0.5 ? 'warn' : 'fail', `Share of floor area that meets the EN 17037 minimum level${enMed != null ? `; ${pc(enMed)} reach the medium level` : ''}.`, { badge: (enMed ?? 0) >= 0.5 ? 'medium' : enMin >= 0.5 ? 'minimum' : 'not met', bar: { max: 1, v: enMin, zone: [0.75, 1], ticks: [[0.5, '50'], [0.75, '75%']] } })] : []),
        key('sw-udi', 'Useful daylight', 'UDI', pc(udi[1]), 'unknown', 'Share of occupied hours, averaged over the floors: too dark for daylight alone, useful, or so bright that blinds come down.', { stack: { parts: udi, colors: ['#cfd4da', '#E09A2C', '#B8362B'], names: ['under 100 lux', 'useful 100–3,000', 'over 3,000 lux'] } }),
      ],
      rules: [
        rule('sw-df', 'Mean daylight factor', `${(mean * 100).toFixed(1)}%`, '2% reads as well daylit', mean >= 0.02 ? 'pass' : mean >= 0.01 ? 'warn' : 'fail', undefined, { label: 'CIE overcast sky; BRE split-flux' }),
        ...(enMin != null ? [rule('sw-en17037', 'Floors meeting EN 17037 minimum', pc(enMin), 'all floors', enMin >= 0.75 ? 'pass' : enMin >= 0.5 ? 'warn' : 'fail', enMed != null ? `${pc(enMed)} reach the medium level.` : undefined, { label: 'EN 17037:2018 daylight provision' })] : []),
      ],
    }
  },
  'built.sw-light-hour': (inp, s) => {
    const pf = planFloor(inp, s, 1)
    if (!pf) return { data: {}, rules: [] }
    // The sun patch traced through the openings as built (mullions, fins, slats) on the fine grid, as the viewer draws it.
    const zones = zonesOf(pf.t), opts = { ctx: inp.ctxBlocks, blinds: s.blinds }, doy = doyOf(s.month, s.day)
    const L: HourLight = hourLight(pf.f, zones, inp.C, { doy, hour: s.hour }, opts)
    // The same floor through the day on a coarser grid (the Studio's time bar): share over 300 lux at each clock hour.
    const coarse = { ...opts, fineH: 0.25 }, cb = hourBase(pf.f, zones, coarse)
    const day = Array.from({ length: 15 }, (_, i) => { const h = 6 + i; const x = hourLight(pf.f, zones, inp.C, { doy, hour: h }, coarse, cb); return { h, over300: x.sunUp || x.over300 > 0 ? x.over300 : 0, over3000: x.over3000, sun: x.sunShare } })
    return {
      data: { L, pf, day },
      keys: [
        key('sw-lux300', 'Floor over 300 lux', `L${pf.f.level} · ${s.hour}:00`, L.sunUp || L.over300 > 0 ? pc(L.over300) : 'dark', L.over300 >= 0.5 ? 'pass' : L.over300 >= 0.25 ? 'warn' : 'fail', `Share of level ${pf.f.level} with enough daylight to work by at ${s.hour}:00 on ${s.day}/${s.month + 1}.${L.blindsDown.length ? ` Blinds down on the ${L.blindsDown.join(', ')} faces.` : ''}`, { badge: L.over300 >= 0.5 ? 'enough' : 'dim', bar: { max: 1, v: L.over300, zone: [0.5, 1], ticks: [[0.5, '50%']] } }),
        key('sw-lux3000', 'Over 3,000 lux', 'glare', pc(L.over3000), L.over3000 <= 0.1 ? 'pass' : 'warn', 'So bright that blinds would come down.', { badge: L.over3000 <= 0.1 ? 'meets' : 'glare', bar: { max: 1, v: L.over3000, zone: [0, 0.1], ticks: [[0.1, '10%']] } }),
        key('sw-luxsun', 'In direct sun', L.sunUp ? `${Math.round(L.alt)}° high` : 'sun down', pc(L.sunShare), 'unknown', `Sun ${Math.round(L.alt)}° high at ${Math.round(L.az)}° from north.`, { bar: { max: 1, v: L.sunShare } }),
      ],
      rules: [rule('sw-lux300', `Floor over 300 lux (level ${pf.f.level}, ${s.day}/${s.month + 1} ${s.hour}:00)`, L.sunUp || L.over300 > 0 ? pc(L.over300) : 'dark', 'at least half the floor', L.over300 >= 0.5 ? 'pass' : L.over300 >= 0.25 ? 'warn' : 'fail', L.blindsDown.length ? `Blinds down on the ${L.blindsDown.join(', ')} faces.` : undefined)],
    }
  },
  'built.sw-energy': (inp) => {
    const C = inp.C!
    const all = allFloors(inp)
    const floors: EnergyFloor[] = all.flatMap(({ floors }) => floors.map((f) => ({ z0: f.z, z1: f.z + f.h, area: f.area, use: f.use, ring: f.rings[0].map(([x, y]) => toNorth(f, x, y)) })))
    if (!floors.length) return { data: {}, rules: [] }
    // The façade zones set the envelope: area-weighted glazing and SHGC per face over every tower.
    const g = all.map(({ t, floors }) => faceGlazing(t, floors))
    const avg = (o: Face, k: 'wwr' | 'shgc') => { const a = g.reduce((q, x) => q + x[o].area, 0); return a ? g.reduce((q, x) => q + x[o][k] * x[o].area, 0) / a : 0.4 }
    const settings = { ...ENERGY_DEFAULTS, wwrN: avg('N', 'wwr'), wwrE: avg('E', 'wwr'), wwrS: avg('S', 'wwr'), wwrW: avg('W', 'wwr'), shgc: ORI.reduce((q, o) => q + avg(o, 'shgc'), 0) / 4 }
    const r: EnergyResult = energyModel(floors, C, settings, { northDeg: 0 })
    const st = (v: number, t: number): RuleState => (v <= t ? 'pass' : v <= t * 1.15 ? 'warn' : 'fail')
    const src = { label: 'ISO 13790 5R1C hourly; City of Vancouver rezoning targets' }
    const eKey = (id: string, label: string, std: string, v: number, t: number, unit: string, dp: number, tip: string) => key(id, label, std, v.toFixed(dp), st(v, t), tip, { unit, bar: { max: Math.max(t * 1.6, v * 1.1), v, zone: [0, t], ticks: [[t, `target ${t.toFixed(t < 10 ? 1 : 0)}`]] } })
    return {
      data: { r, settings },
      keys: [
        eKey('sw-teui', 'Energy use', 'TEUI', r.teui, r.tgt.teui, 'kWh/m²', 0, 'Total energy use intensity against the City of Vancouver rezoning target, weighted by program.'),
        eKey('sw-tedi', 'Heating demand', 'TEDI', r.tedi, r.tgt.tedi, 'kWh/m²', 1, 'Thermal energy demand intensity: space heating before the plant, against the Vancouver target.'),
        eKey('sw-ghgi', 'Carbon', 'GHGI', r.ghgi, r.tgt.ghgi, 'kg/m²', 2, 'Greenhouse gas intensity against the Vancouver target (gas 0.18, BC electricity 0.011 kg/kWh).'),
      ],
      rules: [
        rule('sw-teui', 'Energy use (TEUI)', `${Math.round(r.teui)} kWh/m²`, `target ${Math.round(r.tgt.teui)}`, st(r.teui, r.tgt.teui), undefined, src),
        rule('sw-tedi', 'Heating demand (TEDI)', `${r.tedi.toFixed(1)} kWh/m²`, `target ${Math.round(r.tgt.tedi)}`, st(r.tedi, r.tgt.tedi), undefined, src),
        rule('sw-ghgi', 'Carbon (GHGI)', `${r.ghgi.toFixed(2)} kg/m²`, `target ${r.tgt.ghgi.toFixed(1)}`, st(r.ghgi, r.tgt.ghgi), undefined, src),
      ],
    }
  },
}

// ------------------------------------------------------------------ shared helpers
const FACE_WORD: Record<Face, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }
const oriOf = (az: number): Face => ORI[Math.round((((az % 360) + 360) % 360) / 90) % 4]
export function byFace(faces: { az: number; area: number; value: number }[]): Partial<Record<Face, number>> {
  const acc: Partial<Record<Face, { a: number; v: number }>> = {}
  for (const f of faces) { const o = oriOf(f.az); const x = (acc[o] ??= { a: 0, v: 0 }); x.a += f.area; x.v += f.area * f.value }
  return Object.fromEntries(Object.entries(acc).map(([o, x]) => [o, x!.a ? x!.v / x!.a : 0])) as Partial<Record<Face, number>>
}
export const rainTowers = (towers: Tower[]): RainTower[] => towers.map((t) => ({ id: t.id, name: t.name, height: Math.max(0, ...prismsOf(t).map((p) => p.z1)), blocks: prismsOf(t) }))
export { FACE_AZ, band, SEASONS }

/** Register more tools (the interior engines add theirs in lib/swRunInterior.ts). */
export function addRuns(r: Partial<Record<SwId, Run>>) { Object.assign(RUNS, r) }
export const hasRun = (id: SwId) => !!RUNS[id]
/** Tools that need the climate file before they can run. */
const NO_CLIMATE: SwId[] = ['built.sw-form', 'built.sw-natvent', 'built.sw-airflow']

// ------------------------------------------------------------------ the store and the run queue
interface SwState { out: Partial<Record<SwId, SwOut>>; busy: Partial<Record<SwId, boolean>>; errors: Partial<Record<SwId, string>> }
export const useSwOut = create<SwState>(() => ({ out: {}, busy: {}, errors: {} }))

/** Tools that read the month, day and hour, and tools that read the level drawn; the others do not re-run when those move. */
const TIME_TOOLS: SwId[] = ['built.sw-light-hour', 'built.sw-indoor-temp'], LEVEL_TOOLS: SwId[] = ['built.sw-light-hour', 'built.sw-indoor-temp', 'built.sw-airflow', 'built.sw-natvent']
export function inputKey(inp: SwInputs, s: SwStudySettings, id: SwId): string {
  // Dragging the hour slider of the daylight viewer must not start the shadow, wind or energy studies again.
  const mine = { ...s, ...(TIME_TOOLS.includes(id) ? {} : { month: 0, day: 0, hour: 0 }), ...(LEVEL_TOOLS.includes(id) ? {} : { level: null }) }
  return JSON.stringify([id, inp.project, inp.north, inp.towers, inp.site?.length ?? 0, inp.context.length, !!inp.C, mine])
}

let queue: Promise<void> = Promise.resolve()
/** Runs one tool when its inputs changed; runs queue so heavy studies do not stack up. */
export function runSw(id: SwId, inp: SwInputs, s: SwStudySettings) {
  const run = RUNS[id]
  if (!run || !inp.towers.length) return
  if (!inp.C && !NO_CLIMATE.includes(id)) return
  const key = inputKey(inp, s, id)
  const st = useSwOut.getState()
  if (st.out[id]?.key === key || st.busy[id]) return
  useSwOut.setState((x) => ({ busy: { ...x.busy, [id]: true } }))
  queue = queue.then(() => new Promise<void>((done) => setTimeout(async () => {
    const t0 = performance.now()
    try {
      const r = await run(inp, s)
      useSwOut.setState((x) => ({ out: { ...x.out, [id]: { ...r, ms: performance.now() - t0, key } }, busy: { ...x.busy, [id]: false }, errors: { ...x.errors, [id]: undefined } }))
    } catch (e) {
      useSwOut.setState((x) => ({ busy: { ...x.busy, [id]: false }, errors: { ...x.errors, [id]: e instanceof Error ? e.message : String(e) }, out: { ...x.out, [id]: { rules: [], data: {}, ms: 0, key } } }))
    }
    done()
  }, 30)))
}

/** Floor data for a season of wind (used by the drawings). */
export const seasonLabel = (s: SwStudySettings) => SEASONS[s.season].label

// Dev hook for browser checks (scratchpad sw16-check.mjs): the run store.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tdtSw: unknown }).__tdtSw = { useSwOut }
