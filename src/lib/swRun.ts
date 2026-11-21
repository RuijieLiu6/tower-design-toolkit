// The Sun & Wind Studio tools run here: one compute per tool from the shared inputs (lib/swInputs.ts) and settings
// (lib/swStudy.ts), each giving its key readings as rule lines (pass / near / fail, as the Studio's Key results panel)
// and the data its drawings and analysis view need. Results are kept in a store by tool so the results panel, the
// analysis view and the checklists read one run.
import { create } from 'zustand'
import { towerOccluders } from '../engine/solarRules'
import { aseTower, daylightTower, type DaylightTower, type AseTower } from '../engine/sw/daylight'
import { hourBase, hourLight, type HourLight } from '../engine/sw/hourLight'
import { energyModel, ENERGY_DEFAULTS, type EnergyFloor, type EnergyResult } from '../engine/sw/energy'
import { FACE_AZ, ORI, swFloors, toNorth, zonesOf, zoneFor, zoneFacesOf, band, STRATS, type Face, type SwFloor, type ZoneFace } from '../engine/sw/plate'
import { designStorm, facadeRain, groundShelter, hourlyRain, keepFor, rainAngle, rainBySector, roofCollect, wdrBins, type FaceRain, type GroundShelter, type RainBySector, type RainTower, type RoofWater } from '../engine/sw/rain'
import { facadeIrradiance, sunGround, SUN_DATES, type SunGround } from '../engine/sw/sun'
import { periodLabel, periodRange } from './sunPeriod'
import { sunImpact } from '../engine/sw/sunImpact'
import type { ClimatePayload, FacadeFace, Prism } from '../engine/sw/types'
import { ALPHA, compass16, runWindStudy, SEASONS, windRose, type Rose, type WindStudy } from '../engine/sw/wind'
import { CRITERIA, DECK_SEASONS, deckHours, freeStream, readSeasons, SECTOR8, stateOf, type CriteriaSet, type DeckSeason } from '../engine/sw/deckWind'
import { deckUseOf, towerDecks, type Deck, type DeckEdge, type DeckType } from '../engine/sw/decks'
import { K_WORD, terraceWind, type DeckWind, type Screen } from '../engine/sw/terraceWind'
import { towerFloors } from '../engine/massing'
import type { SkyTerraceLine } from '../engine/skyRoom'
import type { DeckUse, RuleResult, RuleState, Tower } from '../engine/types'
import type { KeySpec } from '../components/ResultViz'
import { faceSunHours, peopleOf, prismsToNorth, roofYear, shadowRange, stormOnFaces, windProfile } from '../engine/sw/detail'
import type { SwInputs } from './swInputs'
import { doyOf, studyLevel, type SwStudySettings } from './swStudy'

export const SW_IDS = ['built.sw-shadow', 'built.sw-sun-faces', 'built.sw-pv', 'built.sw-wind-comfort', 'built.sw-wind-height', 'built.sw-rain-faces', 'built.sw-rain-water', 'built.sw-form',
  'built.sw-glazing', 'built.sw-daylight', 'built.sw-light-hour', 'built.sw-natvent', 'built.sw-airflow', 'built.sw-energy', 'built.sw-indoor-temp'] as const
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
/**
 * The towers as the wind engine takes them. A block is podium when it lies within the podium's height: every podium
 * storey of an imported tower (one prism per storey), not only the one at grade, so the tower's base plate is the
 * first storey above the podium (21 Nov, G13: a 12 m pavilion used to read its upper storey as the tower's base).
 */
export function massing(towers: Tower[]) {
  return { towers: towers.map((t) => ({ id: t.id, name: t.name, height: t.height, tower: t, blocks: prismsOf(t).map((p) => ({ ...p, podium: t.podiumHeight > 0 && p.z0 < t.podiumHeight - 0.01 && p.z1 <= t.podiumHeight + 0.01 })) })) }
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
  for (const f of floors) for (const e of f.edges) { const z = zoneFor(zones, e.zf, f.level); const a = e.L * f.h; acc[e.o].a += a; acc[e.o].g += a * z.wwr; acc[e.o].s += a * z.wwr * z.shgc * (STRATS[z.strat].mod ?? 1) }
  return Object.fromEntries(ORI.map((o) => [o, { wwr: acc[o].a ? acc[o].g / acc[o].a : 0, shgc: acc[o].g ? acc[o].s / acc[o].g : 0.35, area: acc[o].a }])) as Record<Face, { wwr: number; shgc: number; area: number }>
}

// ------------------------------------------------------------------ the wind case (the Studio's Wind tab)
/** One wind case, or the time period's hours (the Studio's Case). */
export const windCaseOf = (s: SwStudySettings) => (s.windCase === 'one' ? { single: { dir: s.windDir, speed: s.windSpeed } } : { range: periodRange(s.periodFrom, s.periodTo) })
/** The reference wind at 10 m: the one case, or the mean of the period's hours (study.js refWind). */
export function refWind(C: ClimatePayload, s: SwStudySettings): { U10: number; label: string } {
  if (s.windCase === 'one') return { U10: s.windSpeed, label: `${s.windDir}° at ${s.windSpeed.toFixed(1)} m/s` }
  const r = windRose(C, s.season, periodRange(s.periodFrom, s.periodTo))
  const U10 = r.sectors.reduce((a, x) => a + x.f * x.s, 0)
  return { U10, label: `${periodLabel(s.periodFrom, s.periodTo)} mean, ${U10.toFixed(1)} m/s` }
}

// ------------------------------------------------------------------ the rain (the Studio's Rain tab)
/** The hours of the time period (day of year from the hour index; To before From wraps over the new year). */
export function periodKeep(s: SwStudySettings): (i: number) => boolean {
  const { d0, d1 } = periodRange(s.periodFrom, s.periodTo)
  if (d0 === 1 && d1 === 365) return () => true
  return (i) => { const d = Math.floor(i / 24) + 1; return d1 >= d0 ? d >= d0 && d <= d1 : d >= d0 || d <= d1 }
}
/** The design storm: as set, else the record's wettest sector at its 95th-percentile wet-hour wind. */
export function stormOf(A: RainBySector, s: SwStudySettings): { dir: number; speed: number } {
  const d = designStorm(A)
  return { dir: s.rainDir ?? d.dir, speed: s.rainSpeed ?? d.speed }
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
    // Direct sun on the tower's faces and what its neighbours lose, on a clear day of the study date (the Studio's r.heat, r.lostKWh).
    const impact = sunImpact(own, prismsToNorth(inp.context, inp.north), C, D.doy)
    return {
      data: { g, when, range, days, siteRing, dateLabel: D.label, impact, siteSun, at: Date.now() },
      keys: [
        ...(plazaShare != null ? [key('sw-shadow-site', 'Site in new shadow', 'aim 25%', pc(plazaShare), plazaShare <= 0.25 ? 'pass' : plazaShare <= 0.4 ? 'warn' : 'fail', `Share of the open site with at least ${g.th[0]} ${unit} of new shadow (${when}). Aim to stay under a quarter.`, { bar: { max: 1, v: plazaShare, zone: [0, 0.25], ticks: [[0.25, '25% aim']] } })] : []),
        key('sw-shadow-ground', 'New shadow', 'ground', fmt(g.a[0]), 'unknown', `Ground with at least ${g.th[0]} ${unit} of new shadow; ${fmt(g.a[1])} m² gets ${g.th[1]} or more and ${fmt(g.a[2])} m² gets ${g.th[2]} or more.`, { unit: 'm²', ...(g.a[0] > 0 ? { stack: { parts: [g.a[2] / g.a[0], (g.a[1] - g.a[2]) / g.a[0], (g.a[0] - g.a[1]) / g.a[0]], colors: ['#7a2e8e', '#e09a2c', '#f2cd78'], names: [`${g.th[2]} ${unit} or more`, `${g.th[1]}–${g.th[2]} ${unit}`, `${g.th[0]}–${g.th[1]} ${unit}`] } } : {}) }),
        key('sw-shadow-lost', 'Sunlight lost by neighbours', 'solar access', fmt(impact.lostKWh), 'unknown', `Direct sun the buildings around lose to the towers on a clear ${D.label.split(' · ')[1]}, on their walls and roofs; the towers receive ${fmt(impact.towerKWh)} kWh.`, { unit: 'kWh' }),
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
    const porous = inp.porous?.length ? inp.porous : undefined
    const w: WindStudy = runWindStudy({ project: inp.project, ring: inp.site, context: inp.context, latLon: [49.28, -123.12], northDeg: inp.north, ground: 0 }, massing(inp.towers), C, { season: s.season, cell: 4, ...windCaseOf(s), ...(porous ? { porous } : {}) })
    const trees = porous ? `; ${porous.filter((o) => o.kind === 'tree').length} trees and ${porous.filter((o) => o.kind === 'screen').length} screens read as porous drag over ${fmt(w.porousArea)} m²` : ''
    const tot = w.cats.reduce((a, b) => a + b, 0) || 1, ok = (w.cats[0] + w.cats[1]) / tot, bad = w.cats[4] / tot
    // The Studio's figures beside the ground study: the downwash section of the tallest tower, the wind with height at
    // the reference wind, and the period's rose (study.js renderWind).
    const ref = refWind(C, s), H = Math.max(0, ...inp.towers.map((t) => t.height))
    const ti = inp.towers.reduce((a, t, i) => (t.height > inp.towers[a].height ? i : a), 0), tall = inp.towers[ti], am = w.amps[ti] ?? { amp: 1, amp0: 1, hn: 20 }
    const sec = { H, w: Math.max(tall.width, tall.depth), hn: am.hn, amp: am.amp, amp0: am.amp0, depth: 0.22 * H, podiumH: tall.podiumHeight, podiumW: Math.max(tall.podiumWidth, tall.podiumDepth), U10: ref.U10 }
    const roseP = windRose(C, s.season, periodRange(s.periodFrom, s.periodTo))
    return {
      data: { w, sec, profile: windProfile(ref.U10, H), ref, roseP, single: s.windCase === 'one', period: periodLabel(s.periodFrom, s.periodTo), porous: porous?.length ?? 0, at: Date.now() },
      keys: [
        key('sw-wind-calm', 'Ground calm enough to stand', 'Lawson', pc(ok), ok >= 0.8 ? 'pass' : ok >= 0.6 ? 'warn' : 'fail', 'Share of open ground in the Lawson sitting or standing bands (mean up to 4 m/s). The bar shows all five bands, calmest on the left.', { stack: { parts: w.cats.map((c) => c / tot), colors: BAND_COL, names: BAND_NAME } }),
        ...(w.sitePeak != null ? [key('sw-wind-peak', 'Site peak wind', 'Lawson', w.sitePeak.toFixed(1), w.sitePeak <= 4 ? 'pass' : w.sitePeak <= 6 ? 'warn' : 'fail', 'The windiest point on the site: up to 4 m/s suits sitting and standing, 6 strolling, 8 walking; above 8 is uncomfortable.', { unit: 'm/s', bar: { max: 10, v: Math.min(10, w.sitePeak), zone: [0, 4], ticks: [[4, '4'], [6, '6'], [8, '8 m/s']] } })] : []),
        key('sw-wind-bad', 'Too windy', 'over 8 m/s', pc(bad), bad <= 0.01 ? 'pass' : 'fail', 'Open ground over 8 m/s mean, uncomfortable for any use. There should be none near entrances.', { bar: { max: 0.2, v: Math.min(0.2, bad), zone: [0, 0.01], ticks: [[0.01, '']] } }),
        key('sw-wind-change', 'Made windier', 'vs none', fmt(w.worse), w.worse <= w.better ? 'pass' : 'warn', `${fmt(w.worse)} m² drop a comfort band because of the towers; ${fmt(w.better)} m² become calmer in their lee.`, { unit: 'm²', ...(w.worse + w.better > 0 ? { stack: { parts: [w.worse / (w.worse + w.better), w.better / (w.worse + w.better)], colors: ['#E08A3C', '#3E8E7E'], names: ['windier', 'calmer'] } } : {}) }),
      ],
      rules: [
        rule('sw-wind-calm', 'Ground calm enough to stand (Lawson)', pc(ok), 'at least 80% good, 60% fair', ok >= 0.8 ? 'pass' : ok >= 0.6 ? 'warn' : 'fail', `Share of open ground in the sitting or standing bands (mean up to 4 m/s)${trees}.`),
        ...(w.sitePeak != null ? [rule('sw-wind-peak', 'Site peak wind', `${w.sitePeak.toFixed(1)} m/s`, 'up to 4 calm, 6 breezy', w.sitePeak <= 4 ? 'pass' : w.sitePeak <= 6 ? 'warn' : 'fail')] : []),
        rule('sw-wind-bad', 'Uncomfortable ground (over 8 m/s)', pc(bad), 'none near entrances', bad <= 0.01 ? 'pass' : 'fail'),
      ],
    }
  },
  'built.sw-wind-height': (inp, s) => {
    const C = inp.C!
    const rose: Rose = windRose(C, s.season, periodRange(s.periodFrom, s.periodTo))
    const U10 = refWind(C, s).U10
    // Each roof and terrace at its height (research R5 §1.2, §1.5): the hourly 10 m wind carried up by the NBC 2020
    // exposure factor of each hour's sector, read as the speed the criteria use (London: exceeded in 5% of comfort
    // hours) in each season; the worst season gives the class. The earlier reading (power law on the season mean) is
    // kept beside it, uOld, so old results can be compared.
    const crit = CRITERIA[s.deckCriteria] ?? CRITERIA.london2019
    // The Studio's five band colours for the classes (Toronto's four skip "strolling").
    const classBands = crit.classes.length === 5 ? [0, 1, 2, 3, 4] : [0, 1, 3, 4]
    const dOpt = { exposure: s.deckExposure, profile: s.deckProfile, criteria: s.deckCriteria }
    const HH = deckHours(C, s.windCase === 'one' ? { dir: s.windDir, speed: s.windSpeed } : undefined)
    const how = deckHow(s, HH.source === 'one')
    // Every terrace, roof and open storey from the storey outlines (R5 §1.3–§1.6, gap G4): local factor by deck type and
    // edge exposure, screens (the settings', or a façade wind-screen zone at the deck's level) and taller neighbours.
    const screen = s.deckScreenH != null ? { h: s.deckScreenH, porosity: s.deckScreenPorosity } : null
    const multi = inp.towers.length > 1
    // What each deck is for (Tower.deckUses, gap G25): a deck no one uses is left out, a planted one reads for
    // maintenance access only; any other deck is a terrace people use.
    const uses = new WeakMap<Deck, DeckUse>()
    let found = 0
    const winds: DeckWind[] = inp.towers.flatMap((t) => {
      const zones = zonesOf(t)
      const neighbours = [...inp.context, ...inp.towers.filter((x) => x.id !== t.id).flatMap(prismsOf)].map((p) => ({ ring: p.ring, z1: p.z1 }))
      // a façade wind-screen zone on the edge's face (a facet's own zone, G7) at the deck's level screens that edge
      const keys = new WeakMap<Deck, ZoneFace[]>()
      const keyOf = (d: Deck, e: DeckEdge) => { let k = keys.get(d); if (!k) { k = zoneFacesOf(d.edges); keys.set(d, k) } return k[d.edges.indexOf(e)] ?? 'N' }
      const all = towerDecks(t, inp.north)
      found += all.length
      const decks = all.filter((d) => { const u = deckUseOf(t, d); if (u) uses.set(d, u); return u?.use !== 'none' })
      return terraceWind(decks, HH, { ...dOpt, north: inp.north, screen, neighbours, edgeScreen: (d, e) => (STRATS[zoneFor(zones, keyOf(d, e), d.level).strat].screen ? FACADE_SCREEN : null) })
    }).sort((a, b) => a.deck.z - b.deck.z)
    const useOf = (w: DeckWind): DeckUse['use'] => uses.get(w.deck)?.use ?? 'occupied'
    // A tower whose outlines give no deck (a pointed top) falls back to the free stream at each block top.
    const free = found ? [] : [...new Map(inp.towers.flatMap((t) => prismsOf(t).map((p) => ({ tower: t.name, z: p.z1 }))).map((d) => [`${d.tower}|${Math.round(d.z)}`, d])).values()].sort((a, b) => a.z - b.z)
    const rows = [
      ...winds.map((w) => ({ tower: w.deck.tower, z: w.deck.z, u: w.read.v, band: classBands[w.read.cls], cls: w.read.cls, season: w.read.worst, seasons: w.read.seasons, label: deckLabel(w.deck, multi, useOf(w)), type: w.deck.type, use: useOf(w), uOld: U10 * Math.pow(Math.max(10, w.deck.z) / 10, ALPHA) })),
      ...free.map((d) => { const r = readSeasons(HH, freeStream(d.z, dOpt), crit); return { ...d, u: r.v, band: classBands[r.cls], cls: r.cls, season: r.worst, seasons: r.seasons, label: `${multi ? `${d.tower}: ` : ''}Top at +${Math.round(d.z)} m (free stream)`, type: 'roof' as DeckType, use: 'occupied' as DeckUse['use'], uOld: U10 * Math.pow(Math.max(10, d.z) / 10, ALPHA) } }),
    ]
    // the comfort summary reads the decks people use; a planted deck has no comfort target
    const used = rows.filter((r) => r.use !== 'planted')
    const worst = used.reduce((a, r) => (r.cls > a.cls || (r.cls === a.cls && r.u > a.u) ? r : a), used[0] ?? { u: 0, z: 0, tower: '', band: 0, cls: 0, season: 'winter' as DeckSeason, uOld: 0, label: '' })
    const worstWind = winds.find((w) => useOf(w) !== 'planted' && w.deck.z === worst.z && w.read.v === worst.u && w.deck.tower === worst.tower)
    const deckState = stateOf(crit, worst.cls)
    // The public sky room's terrace: the deck at the room's level, or none (engine/skyRoom.ts places the line). With
    // several decks there (gap G38), the one the deck-use input marks occupied, else the largest deck people use.
    const skyTerraces: Record<string, SkyTerraceLine> = {}
    for (const t of inp.towers) {
      if (!t.skyRoom) continue
      const lv = t.skyRoom.level, room = towerFloors(t).find((f) => f.level === lv)
      const { w, why } = skyRoomDeck(winds.filter((x) => useOf(x) !== 'planted' && x.deck.towerId === t.id && (x.deck.level === lv || (!!room && Math.abs(x.deck.z - room.z0) < 0.5))), (x) => uses.get(x.deck)?.use === 'occupied')
      skyTerraces[t.id] = w
        ? { value: `${crit.classes[w.read.cls]} in ${w.read.worst} (${w.read.v.toFixed(1)} m/s ${crit.stat})`, threshold: `${crit.classes[crit.target]} for a public terrace (${crit.name})`, state: stateOf(crit, w.read.cls), note: `${deckLabel(w.deck, false, useOf(w))}${why ? ` (${why})` : ''}: ${deckNote(w, crit)}`, source: DECK_SRC(crit).label }
        : { value: `No outdoor terrace at the room level (L${lv})`, threshold: 'Comfort criteria for a terrace at height', state: 'pass', note: 'The storey outlines show no roof, setback terrace or open storey at the sky room level, so the room has no outdoor deck to check (Wind on terraces and roofs).', source: DECK_SRC(crit).label }
    }
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
      data: { rows, winds, skyTerraces, rose, U10, downwash, H, profile, sec, classes: crit.classes, classBands, criteria: crit.name },
      keys: [
        ...(used.length ? [key('sw-wind-deck', 'Windiest deck', crit.name.replace(/ \d+$/, ''), worst.u.toFixed(1), deckState, `${crit.classes[worst.cls]} at ${Math.round(worst.z)} m in ${worst.season}: ${worst.u.toFixed(1)} m/s ${crit.stat}. ${how}`, { unit: 'm/s', bar: { max: 10, v: Math.min(10, worst.u), zone: [0, crit.limits[crit.target]], ticks: crit.limits.map((l, i) => [l, i === crit.limits.length - 1 ? `${l.toFixed(l % 1 ? 1 : 0)} m/s` : l.toFixed(l % 1 ? 1 : 0)] as [number, string]) } })] : []),
        key('sw-wind-downwash', 'Downwash', 'at 0.7 H', downwash.toFixed(1), downwash <= 5 ? 'pass' : downwash <= 7 ? 'warn' : 'fail', `Mean wind at 70% of the height, which the face sends down to the street; ×${amp.toFixed(2)} at the ground against the free wind. A podium or canopy helps over 5 m/s.`, { unit: 'm/s', bar: { max: 10, v: Math.min(10, downwash), zone: [0, 5], ticks: [[5, '5 m/s']] } }),
        ...(topP ? [key('sw-wind-gust', 'Gust at the top', '', topP.gust.toFixed(0), 'unknown', `Gusts 1.8 × the mean at the top of the tower: ${(topP.q / 1000).toFixed(1)} kPa on screens and operable windows.`, { unit: 'm/s', bar: { max: 40, v: Math.min(40, topP.gust) } })] : []),
      ],
      rules: [
        ...(used.length ? [rule('sw-wind-deck', 'Windiest roof or terrace', `${worst.u.toFixed(1)} m/s at ${Math.round(worst.z)} m (${crit.classes[worst.cls]}, ${worst.season})`, `${crit.classes[crit.target]} for a terrace people use: up to ${crit.limits[crit.target].toFixed(1)} m/s ${crit.stat} (${crit.name})`, deckState, `${worst.label}${worstWind ? `, ${K_WORD[worstWind.governing.kCase]}` : ''}. ${how} Earlier reading (power law α ${ALPHA} on the season mean, no local factor): ${worst.uOld.toFixed(1)} m/s.`, DECK_SRC(crit))] : []),
        ...winds.map((w) => useOf(w) === 'planted'
          ? rule(`sw-terrace-${w.deck.id}`, deckLabel(w.deck, multi, 'planted'), `maintenance access: ${crit.classes[w.read.cls]} in ${w.read.worst} (${w.read.v.toFixed(1)} m/s)`, `no comfort target: planted, closed to people but for maintenance (${crit.name}, ${crit.stat})`, plantedState(w, crit), `Deck use: planted (the deck-use input), so the comfort class is reported for maintenance access, not judged against a terrace people use${plantedState(w, crit) === 'warn' ? '; plan access in calm weather, with fall arrest at the edge' : ''}. ${deckNote(w, crit)}`, DECK_SRC(crit))
          : rule(`sw-terrace-${w.deck.id}`, deckLabel(w.deck, multi), `${crit.classes[w.read.cls]} in ${w.read.worst} (${w.read.v.toFixed(1)} m/s)`, `${crit.classes[crit.target]} for a terrace people use (${crit.name}, ${crit.stat})`, stateOf(crit, w.read.cls), deckNote(w, crit), DECK_SRC(crit))),
        ...inp.towers.filter((t) => skyTerraces[t.id]).map((t) => { const l = skyTerraces[t.id]; return rule(`sw-terrace-sky-room-${t.id}`, `${multi ? `${t.name}: ` : ''}Wind on the sky room terrace`, l.value, l.threshold, l.state, l.note, { label: l.source }) }),
        rule('sw-wind-downwash', 'Wind brought down the face', `${downwash.toFixed(1)} m/s`, 'a podium or canopy over 5 m/s', downwash <= 5 ? 'pass' : downwash <= 7 ? 'warn' : 'fail', 'Mean wind at 70% of the height, which the face sends down to the street.'),
      ],
    }
  },
  'built.sw-rain-faces': (inp, s) => {
    const C = inp.C!
    const keep = periodKeep(s)
    const rt = rainTowers(inp.towers)
    const faces: FaceRain[] = facadeRain(rt, inp.north, wdrBins(C, keep))
    const A = rainBySector(C, keep)
    const worst = faces.reduce<FaceRain | null>((a, f) => (!a || f.index > a.index ? f : a), null)
    const li = worst ? ['sheltered', 'moderate', 'severe', 'very severe'].indexOf(worst.band) : 0
    const mt = mainTower(inp)
    const storm = A ? stormOf(A, s) : null
    const SF = mt && storm ? stormOnFaces(mt.floors, blocksNorth(inp), storm, s.rainDrop, s.rainI) : null
    const wetF = SF && worst ? SF.faces.find((f) => f.o === oriOf(worst.az)) : null
    return {
      data: { faces, A, by: byFace(faces.map((f) => ({ az: f.az, area: f.area, value: f.index }))), SF, worst, period: periodLabel(s.periodFrom, s.periodTo) },
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
    const A = rainBySector(C, periodKeep(s))
    const storm = A ? stormOf(A, s) : null
    let sh: GroundShelter | null = null
    if (A && storm) sh = groundShelter(inp.towers.flatMap(prismsOf), inp.context, inp.site, inp.north, A, { cell: 2, drop: s.rainDrop, storm })
    const RY = roofYear(C, roof.area, s.rainEff, allFloors(inp).reduce((a, x) => a + peopleOf(x.floors), 0), s.rainI, s.rainDur)
    return {
      data: { roof, sh, mm, RY, A, storm, drop: s.rainDrop, alphaDeg: storm ? (rainAngle(storm.speed, s.rainDrop).alpha * 180) / Math.PI : 0, period: periodLabel(s.periodFrom, s.periodTo), at: Date.now() },
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
    // What the façade does (17 Nov, Sinnie: "make sure the results reflect changes done to the facade"): the same towers
    // with the same glass and no shading devices, so the results show the devices' share of sDA and ASE.
    const bare = allFloors(inp).map(({ t, floors }) => ({ dl: daylightTower(floors, zonesOf(t), C, { target: s.dlTarget, blinds: s.blinds, ctx: inp.ctxBlocks, noDev: true }), ase: aseTower(floors, zonesOf(t), C, undefined, { ctx: inp.ctxBlocks, noDev: true }) }))
    const awB = (g: (p: { dl: DaylightTower; ase: AseTower }) => number) => bare.reduce((a, p) => a + g(p) * p.dl.rows.reduce((q, r) => q + r.area, 0), 0) / A
    const facade = { sdaBare: awB((p) => p.dl.sda), aseBare: awB((p) => p.ase.pct), zones: inp.towers[0] ? zonesOf(inp.towers[0]) : [] }
    return {
      data: { per, sda, ase, pts, facade },
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

// ------------------------------------------------------------------ the deck wind wording (research R5 §1)
/** How a deck reading was made, in one sentence for the notes. */
function deckHow(s: SwStudySettings, one: boolean): string {
  const rough = SECTOR8.filter((_, i) => s.deckExposure[i] === 'rough')
  const prof = s.deckProfile === 'power'
    ? `Profile: the earlier power law (z/10)^${ALPHA} in every sector (switch back to NBC 2020 in the wind settings).`
    : `Profile: NBC 2020 exposure factor on the airport's open-terrain 10 m wind, Ce = 0.5 (z/12.7)^0.5 over rough fetch (${rough.length ? rough.join(', ') : 'no sector'}), (z/10)^0.28 open elsewhere (open formula unverified; sector table a team assumption).`
  return `${one ? 'One wind case: its speed at the deck read against the class limits, no exceedance statistics.' : 'CWEC 2020 hourly record, comfort hours 06:00–23:00, each season.'} ${prof}`
}
const DECK_SRC = (c: CriteriaSet) => ({ label: `Research R5 §1.2–§1.6: NBC 2020 Div. B 4.1.7.3.(5), 4.1.7.5.(2) and Commentary I para 12 (exposure, Cp); local factors, screens and neighbours are team values (R5 K table); ${c.source}; CWEC 2020 Vancouver Intl hourly` })
/** A façade zone with the wind-screen strategy: 1.5 m glass screens on the terrace edges (STRATS.windscreen), solid. */
const FACADE_SCREEN = { h: 1.5, porosity: 0 }
// Every deck with a slab above it is a loggia (gap G24): one open on opposite sides or all round says so.
const DECK_WORD: Record<DeckType, string> = { roof: 'Roof', setback: 'Terrace', openStorey: 'Loggia (open storey)', loggia: 'Loggia' }
const deckLabel = (d: Deck, multi: boolean, use: DeckUse['use'] = 'occupied') => `${multi ? `${d.tower}: ` : ''}${use === 'planted' ? `Planted ${DECK_WORD[d.type].toLowerCase()}` : DECK_WORD[d.type]} at +${Math.round(d.z)} m${d.type === 'roof' ? '' : ` (L${d.level})`}`
/** A planted deck's maintenance-access line (gap G25): Check when the wind there is uncomfortable or past the indicative
 *  safety limits, else Unknown (no comfort target); never a comfort Fail. */
const plantedState = (w: DeckWind, c: CriteriaSet): RuleState => (w.read.cls >= c.classes.length - 1 || !!w.safety?.london || !!w.safety?.toronto ? 'warn' : 'unknown')
/**
 * The sky room's deck among those at its level (gap G38; the line read the first deck found): one the deck-use input marks
 * occupied, else the largest deck people use; with several, the largest of them. `why` says how it was chosen when there
 * was a choice.
 */
export function skyRoomDeck(at: DeckWind[], flagged: (w: DeckWind) => boolean): { w: DeckWind | null; why: string } {
  const marked = at.filter(flagged), pool = marked.length ? marked : at
  const w = pool.reduce<DeckWind | null>((a, x) => (!a || x.deck.area > a.deck.area ? x : a), null)
  const why = at.length < 2 ? '' : marked.length ? `marked occupied in the deck uses, of ${at.length} decks at the room level` : `the largest of ${at.length} decks at the room level`
  return { w, why }
}
const C8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const compass8 = (az: number) => C8[Math.round((((az % 360) + 360) % 360) / 45) % 8]
const screenWord = (sc: Screen) => `${sc.h.toFixed(1)} m at ${Math.round(sc.porosity * 100)}% open`
/** What a deck reading rests on, for its note: shape, seasons, the governing wind, screens, the other set, safety. */
function deckNote(w: DeckWind, c: CriteriaSet): string {
  const d = w.deck, r = w.read, o = CRITERIA[w.other.criteria]
  const facings = [...new Set(d.edges.filter((e) => e.open && e.L >= 1).sort((a, b) => b.L - a.L).map((e) => compass8(e.az)))]
  const dH = Math.max(0, ...d.edges.filter((e) => !e.open).map((e) => e.dH ?? 0))
  const shape = `${fmt(d.area)} m², ${d.allRound ? 'open all round' : `open to the ${facings.join(', ') || 'sky'}`}${d.cover != null ? `, slab ${d.cover.toFixed(1)} m above` : ''}${d.type === 'setback' && dH > 0 ? `, the face above rises ${Math.round(dH)} m` : ''}.`
    + (w.cover ? ` Cover factor ${w.cover.factor.toFixed(2)}: ${Number.isFinite(w.cover.depth) ? `${w.cover.depth.toFixed(1)} m deep` : 'no open edge'} under ${w.cover.headroom.toFixed(1)} m of headroom (1 at a depth of the headroom or more, the slab-above K values; 0 at a quarter of it or less, read as open to the sky; team step, Gu et al. 2023 unverified).` : '')
  const seasons = `Seasons: ${DECK_SEASONS.map((k) => `${k} ${c.classes[r.seasons[k].cls]} (${r.seasons[k].v.toFixed(1)})`).join(', ')}.`
  const g = w.governing
  const gov = `Worst point: most hours over ${c.limits[c.target].toFixed(1)} m/s come from ${compass16(g.dir)}${g.edgeAz != null ? ` across the ${compass8(g.edgeAz)}-facing edge` : ''}, ${K_WORD[g.kCase]} (K ${g.k.toFixed(2)}); ${fmt(w.hoursOver)} comfort hours a year over it.`
  const scr = w.screen ? (w.screen.from === 'setting' ? `Screen ${screenWord(w.screen)} on every open edge.` : `Façade wind screens (1.5 m glass) on ${w.screen.edges} open edge${w.screen.edges === 1 ? '' : 's'}.`) : 'No screen.'
  const needOf = (n: Screen | 'none' | null, cls: number) => (n === 'none' ? `${c.classes[cls]} without one` : n ? `${c.classes[cls]} with ${screenWord(n)}` : `no screen up to 2.5 m reaches ${c.classes[cls]}`)
  const need = `Smallest screen on every open edge: ${needOf(w.need.sitting, c.target)}; ${needOf(w.need.standing, c.check)}.`
  const other = `${o.name}: ${o.classes[w.other.read.cls]} in ${w.other.read.worst}.`
  const sf = w.safety
  const where = !sf ? '' : sf.atWorst ? 'at the comfort-worst point' : `at a point ${sf.edge ? `${sf.edge.dist.toFixed(1)} m in from the ${compass8(sf.edge.az)}-facing edge` : `at (${sf.at[0].toFixed(1)}, ${sf.at[1].toFixed(1)})`} (${fmt(sf.worstHours)} h at the comfort-worst point)`
  const safe = sf ? `Safety (indicative, one typical year; the largest over the deck's ${d.pts.length} sample points): ${fmt(sf.londonHours)} h at 15 m/s or more ${where} (London: dangerous over 1.9 h${sf.london ? ', exceeded' : ''}); gusts over 25 m/s in ${(sf.torontoShare * 100).toFixed(2)}% of hours at the worst point for gusts (Toronto: unsafe over 0.1%${sf.toronto ? ', exceeded' : ''}).` : ''
  const sa = w.sharedAir
  const air = sa ? `Shared air (team step, G38): ${sa.points} of ${d.pts.length} points lie under an opening of the storeys above with no slab between${sa.sky ? ` (${sa.sky} open to the sky)` : ''}; each reads the more exposed of the deck's cover and its own headroom${sa.governs ? ', and that sets the worst point' : ''}.` : ''
  return [shape, air, seasons, gov, scr, need, other, safe, 'Screening values: within one class of the target, test in a wind tunnel or CFD.'].filter(Boolean).join(' ')
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
/** One tool's compute, outside the store and queue (tests and scripts). */
export const computeSw = async (id: SwId, inp: SwInputs, s: SwStudySettings) => { const run = RUNS[id]; if (!run) throw new Error(`no run for ${id}`); return run(inp, s) }
/** Tools that need the climate file before they can run. */
const NO_CLIMATE: SwId[] = ['built.sw-form', 'built.sw-natvent', 'built.sw-airflow']

// ------------------------------------------------------------------ the store and the run queue
interface SwState { out: Partial<Record<SwId, SwOut>>; busy: Partial<Record<SwId, boolean>>; errors: Partial<Record<SwId, string>> }
export const useSwOut = create<SwState>(() => ({ out: {}, busy: {}, errors: {} }))

/** Tools that read the month, day and hour, and tools that read the level drawn; the others do not re-run when those move. */
const TIME_TOOLS: SwId[] = ['built.sw-light-hour', 'built.sw-indoor-temp'], LEVEL_TOOLS: SwId[] = ['built.sw-light-hour', 'built.sw-indoor-temp', 'built.sw-airflow', 'built.sw-natvent']
export function inputKey(inp: SwInputs, s: SwStudySettings, id: SwId): string {
  // Dragging the hour slider of the daylight viewer must not start the shadow, wind or energy studies again.
  const mine = { ...s, windView: '', rainCase: null, ...(TIME_TOOLS.includes(id) ? {} : { month: 0, day: 0, hour: 0 }), ...(LEVEL_TOOLS.includes(id) ? {} : { level: null }) }
  return JSON.stringify([id, inp.project, inp.north, inp.towers, inp.site?.length ?? 0, inp.context.length, !!inp.C, mine, id === 'built.sw-wind-comfort' ? inp.porous ?? null : null])
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
