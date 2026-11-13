// The Sun & Wind Studio tools run here: one compute per tool from the shared inputs (lib/swInputs.ts) and settings
// (lib/swStudy.ts), each giving its key readings as rule lines (pass / near / fail, as the Studio's Key results panel)
// and the data its drawings and analysis view need. Results are kept in a store by tool so the results panel, the
// analysis view and the checklists read one run.
import { create } from 'zustand'
import { towerOccluders } from '../engine/solarRules'
import { aseTower, daylightTower, lightAtHour, type DaylightTower, type AseTower, type LightAtHour } from '../engine/sw/daylight'
import { energyModel, ENERGY_DEFAULTS, type EnergyFloor, type EnergyResult } from '../engine/sw/energy'
import { FACE_AZ, ORI, swFloors, toNorth, zonesOf, zoneFor, band, STRATS, type Face, type SwFloor } from '../engine/sw/plate'
import { designStorm, facadeRain, groundShelter, hourlyRain, keepFor, rainBySector, roofCollect, wdrBins, type FaceRain, type GroundShelter, type RainTower, type RoofWater } from '../engine/sw/rain'
import { facadeIrradiance, sunGround, SUN_DATES, SUN_PERIODS, type SunGround } from '../engine/sw/sun'
import type { FacadeFace, Prism } from '../engine/sw/types'
import { ALPHA, lawsonClass, runWindStudy, SEASONS, windRose, type Rose, type WindStudy } from '../engine/sw/wind'
import type { RuleResult, RuleState, Tower } from '../engine/types'
import type { SwInputs } from './swInputs'
import { doyOf, studyLevel, type SwStudySettings } from './swStudy'

export const SW_IDS = ['built.sw-shadow', 'built.sw-sun-faces', 'built.sw-pv', 'built.sw-wind-comfort', 'built.sw-wind-height', 'built.sw-rain-faces', 'built.sw-rain-water', 'built.sw-form',
  'built.sw-glazing', 'built.sw-daylight', 'built.sw-daylight-factor', 'built.sw-light-hour', 'built.sw-natvent', 'built.sw-airflow', 'built.sw-energy', 'built.sw-indoor-temp'] as const
export type SwId = (typeof SW_IDS)[number]
export const isSw = (id: string | null | undefined): id is SwId => !!id && (SW_IDS as readonly string[]).includes(id)

export interface SwOut { rules: RuleResult[]; data: Record<string, unknown>; ms: number; key: string }

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
    const g: SunGround = sunGround(inp.towers.flatMap(prismsOf), inp.context, inp.site, C, inp.north, { scope: s.sunScope, date: s.sunDate, period: s.sunPeriod, h0: s.h0, h1: s.h1, cell: 2, margin: 120 })
    const when = s.sunScope === 'date' ? `${SUN_DATES[s.sunDate].label}, ${s.h0}:00–${s.h1}:00` : SUN_PERIODS[s.sunPeriod].label
    const plazaShare = g.siteOpen ? g.siteInShadow / g.siteOpen : null
    return {
      data: { g, when },
      rules: [
        ...(plazaShare != null ? [rule('sw-shadow-site', 'Open site in new shadow', pc(plazaShare), 'aim at most 25% of the open site', plazaShare <= 0.25 ? 'pass' : plazaShare <= 0.4 ? 'warn' : 'fail', `${when}; ground with at least ${g.th[0]} h of new shadow.`)] : []),
        rule('sw-shadow-ground', 'New shadow on the ground', `${fmt(g.a[0])} m²`, `${g.th[0]} h or more`, 'unknown', `${fmt(g.a[2])} m² gets ${g.th[2]} h or more (${when}).`),
      ],
    }
  },
  'built.sw-sun-faces': (inp) => {
    const C = inp.C!
    const blocks = inp.towers.flatMap((t) => prismsOf(t).map((p) => ({ towerId: t.id, ring: p.ring, z0: p.z0, z1: p.z1 })))
    const faces: FacadeFace[] = facadeIrradiance(blocks, inp.context, C, inp.north)
    const by = byFace(faces)
    const best = ORI.reduce((a, o) => ((by[o] ?? 0) > (by[a] ?? 0) ? o : a), 'N' as Face)
    return { data: { faces, by }, rules: ORI.filter((o) => by[o] != null).map((o) => rule(`sw-sunface-${o}`, `Sun on the ${o} faces`, `${fmt(by[o]!)} kWh/m² a year`, 'reading', 'unknown', o === best ? 'The sunniest face: shade it first, or put PV there.' : undefined)) }
  },
  'built.sw-wind-comfort': (inp, s) => {
    const C = inp.C!
    const w: WindStudy = runWindStudy({ project: inp.project, ring: inp.site, context: inp.context, latLon: [49.28, -123.12], northDeg: inp.north, ground: 0 }, massing(inp.towers), C, { season: s.season, cell: 4 })
    const tot = w.cats.reduce((a, b) => a + b, 0) || 1, ok = (w.cats[0] + w.cats[1]) / tot, bad = w.cats[4] / tot
    return {
      data: { w },
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
    return {
      data: { rows, rose, U10, downwash, H },
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
    return {
      data: { faces, A, by: byFace(faces.map((f) => ({ az: f.az, area: f.area, value: f.index }))) },
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
    return {
      data: { roof, sh, mm },
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
    return {
      data: { per, sda, ase },
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
    return {
      data: { per, mean, enMin, enMed },
      rules: [
        rule('sw-df', 'Mean daylight factor', `${(mean * 100).toFixed(1)}%`, '2% reads as well daylit', mean >= 0.02 ? 'pass' : mean >= 0.01 ? 'warn' : 'fail', undefined, { label: 'CIE overcast sky; BRE split-flux' }),
        ...(enMin != null ? [rule('sw-en17037', 'Floors meeting EN 17037 minimum', pc(enMin), 'all floors', enMin >= 0.75 ? 'pass' : enMin >= 0.5 ? 'warn' : 'fail', enMed != null ? `${pc(enMed)} reach the medium level.` : undefined, { label: 'EN 17037:2018 daylight provision' })] : []),
      ],
    }
  },
  'built.sw-light-hour': (inp, s) => {
    const pf = planFloor(inp, s, 0.5)
    if (!pf) return { data: {}, rules: [] }
    const L: LightAtHour = lightAtHour(pf.f, zonesOf(pf.t), inp.C, { doy: doyOf(s.month, s.day), hour: s.hour }, { ctx: inp.ctxBlocks, blinds: s.blinds })
    return {
      data: { L, pf },
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
    return {
      data: { r, settings },
      rules: [
        rule('sw-teui', 'Energy use (TEUI)', `${Math.round(r.teui)} kWh/m²`, `target ${Math.round(r.tgt.teui)}`, st(r.teui, r.tgt.teui), undefined, src),
        rule('sw-tedi', 'Heating demand (TEDI)', `${r.tedi.toFixed(1)} kWh/m²`, `target ${Math.round(r.tgt.tedi)}`, st(r.tedi, r.tgt.tedi), undefined, src),
        rule('sw-ghgi', 'Carbon (GHGI)', `${r.ghgi.toFixed(2)} kg/m²`, `target ${r.tgt.ghgi.toFixed(1)}`, st(r.ghgi, r.tgt.ghgi), undefined, src),
      ],
    }
  },
}

// ------------------------------------------------------------------ shared helpers
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

export function inputKey(inp: SwInputs, s: SwStudySettings, id: SwId): string {
  return JSON.stringify([id, inp.project, inp.north, inp.towers, inp.site?.length ?? 0, inp.context.length, !!inp.C, s])
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
