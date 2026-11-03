// Downtown Peninsula Solar Access test (research P02-M02) and the public-realm sun-hours map (P02-M03).
// Rules are transcribed from the City PDF (Solar Access Guidelines for the Downtown Peninsula, approved 17 Sep 2025,
// last amended 29 Jul 2026), read by an AI agent on 22 Oct 2026: every reading is "unverified" until a second reader
// checks it (04 Tool Plan/research/sources/city-of-vancouver/solar-access-downtown_transcription.md).
import type { VtcContext } from '../context'
import { blockSpans } from './blocks'
import type { RuleResult, RuleState, Source, Tower } from './types'
import { clockLabel, instants, selfTest, solarPosition, sunDirection, type StudyWindow } from './solar'
import { cellCentre, emptyOccluders, footprintMask, gridOver, meshTris, polygonMask, shadowMask, type Grid, type Occluders, type Prism, type Pt } from './shadow'

export const GUIDELINE: Source = {
  label: 'City of Vancouver, Solar Access Guidelines for the Downtown Peninsula (approved 17 Sep 2025, amended 29 Jul 2026)',
  url: 'https://guidelines.vancouver.ca/guidelines-solar-access-downtown.pdf',
}
const cite = (clause: string, page: string): Source => ({ ...GUIDELINE, page: `s.${clause}, p.${page}` })
const READ_NOTE = 'Read from the City PDF by an AI agent on 22 Oct 2026; a team member has not checked it yet.'

// ---- Table 1 and the rules -----------------------------------------------------------------------------------------

export type T1Class = 'Community' | 'Neighbourhood' | 'Local' | 'School Site' | 'Urban Plaza' | 'West End Minipark'

/** Table 1, pp. 5–8 (58 entries). Notes point to the special cases of section 4. */
export const TABLE_1: { name: string; cls: T1Class; note?: '4.1' | '4.2' | '4.3' }[] = [
  ['300 Helmcken Plaza', 'Urban Plaza'], ['Alexandra Park', 'Local'], ['Andy Livingstone Park', 'Community'], ['Art Phillips Park', 'Urban Plaza'],
  ['Barclay Heritage Square', 'Neighbourhood'], ['Bill Curtis Square', 'Urban Plaza'], ['Blood Alley Square', 'Urban Plaza'],
  ['Broughton St. at Nelson St. Minipark', 'West End Minipark'], ['Bute St. at Haro St. Minipark', 'West End Minipark'], ['Bute-Robson Plaza', 'Urban Plaza'],
  ['Cardero Park', 'Local'], ['Cardero St. at Burnaby St. Minipark', 'West End Minipark'], ['Cardero St. at Comox St. Minipark', 'West End Minipark'],
  ['Cathedral Square', 'Urban Plaza'], ['Chilco St. at Comox St. Minipark', 'West End Minipark'], ['Chinatown Memorial Square', 'Urban Plaza'],
  ['Coal Harbour Park', 'Neighbourhood'], ["Coopers' Park", 'Community'], ['CRAB Park at Portside', 'Community'], ['Creekside Park', 'Neighbourhood'],
  ['David Lam Park', 'Community'], ['Devonian Harbour Park', 'Neighbourhood'], ['Dilawri Square North', 'Urban Plaza'], ['Dilawri Square South', 'Urban Plaza', '4.2'],
  ['Downtown Skateboard Plaza', 'Urban Plaza'], ['Dr. Sun Yat-Sen Classical Chinese Gardens and Dr. Sun Yat-Sen Park', 'Local', '4.1'],
  ['Elsie Roy Elementary', 'School Site'], ['Emery Barnes Park', 'Neighbourhood'], ['English Bay Beach Park', 'Community'], ['George Wainborn Park', 'Neighbourhood'],
  ['Gilford St. at Haro St. Minipark', 'West End Minipark'], ['Harbour Green Park', 'Community'], ['Helmcken Park', 'Urban Plaza'], ['Jack Poole Plaza', 'Urban Plaza', '4.2'],
  ['Jervis St. at Burnaby St. Minipark', 'West End Minipark'], ['Jervis St. Park Site at Pacific St.', 'Local'], ['Jim Deva Plaza', 'Urban Plaza'],
  ['King George Secondary', 'School Site'], ['Lord Roberts Annex', 'School Site'], ['Lord Roberts Elementary', 'School Site'],
  ['Lot 19 (Hornby St. at Hastings St. Plaza)', 'Urban Plaza'], ['Marina Square', 'Neighbourhood'], ['May & Lorne Brown Park', 'Local'], ['Morton Park', 'Local'],
  ['Nelson Park', 'Community'], ['Nicola St. at Pendrell St. Minipark', 'West End Minipark'], ['Pioneer Place (Pigeon Park)', 'Urban Plaza'], ['Portal Park', 'Urban Plaza'],
  ['Robson Square', 'Urban Plaza', '4.2'], ['Roundhouse Turntable Park', 'Neighbourhood'], ['Sunset Beach Park', 'Community'],
  ["šxʷƛ̓ənəq Xwtl'e7énḵ (formerly Vancouver Art Gallery North Plaza)", 'Urban Plaza'], ["šxʷƛ̓exən Xwtl'a7shn (formerly Queen Elizabeth Theatre Plaza)", 'Urban Plaza'],
  ["sθəqəlxenəm ts'exwts'áxwi7 (Rainbow Park)", 'Neighbourhood'], ['Thornton Park', 'Neighbourhood'], ['Victory Square', 'Urban Plaza', '4.3'],
  ['Wendy Poole Park', 'Local'], ['Yaletown Park', 'Urban Plaza'],
].map(([name, cls, note]) => ({ name, cls: cls as T1Class, ...(note ? { note: note as '4.1' | '4.2' | '4.3' } : {}) }))

export type RuleId = 'park' | 'minimise' | 'sunyatsen' | 'davie' | 'robson'

export interface RuleDef {
  id: RuleId
  clause: string
  page: string
  /** 'no_new_shadow' = pass/fail on new shadow; 'minimise' = report only. */
  kind: 'no_new_shadow' | 'minimise'
  window: 'equinox' | 'robson'
  text: string
}

export const RULES: Record<RuleId, RuleDef> = {
  park: { id: 'park', clause: '3.1.1', page: '4', kind: 'no_new_shadow', window: 'equinox', text: 'No new shadow within the property lines of Table-1 Community, Neighbourhood and Local Parks and school sites, 22 Sep, 10 am–4 pm PT' },
  minimise: { id: 'minimise', clause: '3.2.1', page: '5', kind: 'minimise', window: 'equinox', text: 'Explore ways to minimise new shadow on Table-1 West End Miniparks and Urban Plazas "where possible", 22 Sep, 10 am–4 pm PT' },
  sunyatsen: { id: 'sunyatsen', clause: '4.1.1', page: '9', kind: 'no_new_shadow', window: 'equinox', text: 'No new shadow on the Dr. Sun Yat-Sen gardens and park at any time, 22 Sep, 10 am–4 pm PT (no exception clause)' },
  davie: { id: 'davie', clause: '3.3.1(a)', page: '8', kind: 'no_new_shadow', window: 'equinox', text: 'No new shadow on the Davie Village north sidewalk (curb to building face), 22 Sep, 10 am–4 pm PT' },
  robson: { id: 'robson', clause: '3.3.1(b)', page: '8', kind: 'no_new_shadow', window: 'robson', text: 'No new shadow on the Robson Village north sidewalk (curb to building face), 22 Sep, 10 am–3 pm PT' },
}

/** Which rule a Table-1 class leads to (3.1.1, 3.2.1, and the special cases of section 4). */
export function ruleForClass(cls: T1Class, note?: '4.1' | '4.2' | '4.3'): RuleId {
  if (note === '4.1') return 'sunyatsen'
  if (note === '4.2') return 'park' // 4.2.1: consult the park rules of 3.1
  // Victory Square is an Urban Plaza in Table 1, yet 4.3.1 adds its cenotaph rule "in addition to" the park rules of
  // 3.1: whether 3.1.1 also applies to it is unresolved. Its cenotaph rule (11 Nov) is not run.
  if (cls === 'Urban Plaza' || cls === 'West End Minipark') return 'minimise'
  return 'park'
}

// ---- Scene ---------------------------------------------------------------------------------------------------------

/** Shadow casters of the proposal: parametric boxes, or the storey outlines of an imported mass. */
export function towerOccluders(towers: Tower[]): Occluders {
  const prisms: Prism[] = []
  const rect = (x: number, y: number, w: number, d: number, deg: number): Pt[] => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as Pt[]).map(([u, v]) => [x + u * c - v * s, y + u * s + v * c])
  }
  for (const t of towers) {
    if (t.imported) {
      const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
      for (const st of t.imported.storeys) {
        for (const loop of st.loops) {
          if (loop.length < 3 || signedArea(loop) <= 0) continue // outer rings only (counter-clockwise)
          prisms.push({ ring: loop.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c]), z0: st.z0, z1: st.z1 })
        }
      }
      continue
    }
    // Stacked blocks: each block from the ground to its top (as the old podium and tower were; conservative under a cantilever).
    if (t.blocks?.length) { for (const b of blockSpans(t)) prisms.push({ ring: b.ring, z0: 0, z1: b.z1 }); continue }
    if (t.podiumHeight > 0) prisms.push({ ring: rect(t.x, t.y, t.podiumWidth, t.podiumDepth, t.rotation), z0: 0, z1: t.podiumHeight })
    const top = Math.max(t.podiumHeight, t.height)
    prisms.push({ ring: rect(t.x, t.y, t.width, t.depth, t.rotation), z0: 0, z1: top })
  }
  return { prisms, tris: [] }
}

function signedArea(r: Pt[]): number {
  let s = 0
  for (let k = 0, l = r.length - 1; k < r.length; l = k++) s += (r[l][0] - r[k][0]) * (r[l][1] + r[k][1])
  return s / 2
}

/** Existing and approved context of the VTC model. Its future towers count as approved (team assumption). */
export function vtcOccluders(ctx: VtcContext): Occluders {
  const occ = emptyOccluders()
  for (const item of [...ctx.buildings, ...ctx.heritage]) {
    if ('footprint' in item) occ.prisms.push({ ring: item.footprint, z0: item.z0, z1: item.z1 })
    else occ.tris.push(...meshTris(item.positions, item.indices))
  }
  for (const f of ctx.future_towers) if (f.z1) occ.prisms.push({ ring: f.footprint, z0: 0, z1: f.z1 })
  return occ
}

/** A public space to test: plan rings (any number), and its Table-1 class if it has one. */
export interface ProtectedSpace {
  id: string
  name: string
  rings: Pt[][]
  /** Table-1 class, or null when the space is not in Table 1 (its class under the guideline is unresolved). */
  t1: { cls: T1Class; note?: '4.1' | '4.2' | '4.3' } | null
  /** A rule fixed by the guideline for a space outside the Table-1 classes (the Davie and Robson north sidewalks, 3.3.1). */
  rule?: RuleId
  source: string
}

/** The public spaces the VTC model draws (two plazas, the mid-block links). None of them is in Table 1. */
export function vtcSpaces(ctx: VtcContext): ProtectedSpace[] {
  const tris = (m: { positions: number[]; indices: number[] }): Pt[][] => {
    const out: Pt[][] = []
    for (let k = 0; k + 2 < m.indices.length; k += 3) out.push([0, 1, 2].map((q) => [m.positions[m.indices[k + q] * 3], m.positions[m.indices[k + q] * 3 + 1]] as Pt))
    return out
  }
  const centroid = (rings: Pt[][]): Pt => { const p = rings.flat(); return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length] }
  const plazaLabels = ctx.labels.filter((l) => /PLAZA/i.test(l.text))
  const name = (c: Pt) => {
    const near = plazaLabels.map((l) => [l, Math.hypot(l.at[0] - c[0], l.at[1] - c[1])] as const).sort((a, b) => a[1] - b[1])[0]
    return near && near[1] < 60 ? near[0].text.charAt(0) + near[0].text.slice(1).toLowerCase() : 'Plaza'
  }
  return [
    ...ctx.plazas.map((m, i) => { const rings = tris(m); return { id: `vtc-plaza-${i}`, name: `${name(centroid(rings))} (VTC model)`, rings, t1: null, source: 'VTC base model (Buildner): drawn plaza' } }),
    ...ctx.midblock.map((m, i) => ({ id: `vtc-midblock-${i}`, name: `Mid-block link ${i + 1} (VTC model)`, rings: tris(m), t1: null, source: 'VTC base model (Buildner): drawn mid-block connection' })),
  ]
}

// ---- Evaluating one space ----------------------------------------------------------------------------------------

export interface Interval { utc: number; label: string; existing: number; added: number; cumulative: number }

export interface SpaceResult {
  space: ProtectedSpace
  window: StudyWindow
  area: number
  cell: number
  /** New shadow (m²) swept over the window: cells newly shadowed at any sampled minute. */
  swept: number
  /** Basic study (5.1.1): new shadow at 10, 12, 14 and 16 PT. */
  basic: { label: string; added: number }[]
  /** Detailed study (5.2.1): 25 instants at 15 minutes. */
  detailed: Interval[]
  /** Coverage % (5.2.1(c)) of existing, proposed additional and cumulative shadow. */
  coverage: { existing: number; added: number; cumulative: number }
  /** First and last minute with new shadow, as clock labels. */
  firstNew: string | null
  lastNew: string | null
  /** New shadow per sampled minute, for the peak. */
  peak: { label: string; added: number }
}

export interface EvalOptions {
  northDeg: number; lat?: number; lon?: number; cell?: number; stepMin?: number
  /** Baseline masks by instant: the context does not change when the design does, so a worker keeps them between runs. */
  cache?: Map<string, Uint8Array>
}

/** Baseline shadow for one instant, from the cache when there is one. */
function baseMask(base: Occluders, g: Grid, dir: [number, number, number], scratch: Uint8Array, o: EvalOptions, key: string): Uint8Array {
  if (!o.cache) return shadowMask(base, g, dir, scratch)
  let m = o.cache.get(key)
  if (!m) { m = shadowMask(base, g, dir); o.cache.set(key, m) }
  return m
}

/**
 * New shadow = shadow of (baseline + proposal) that the baseline alone does not cast, inside the space.
 * The window is sampled every minute (the rule reads "from 10 am to 4 pm", not only at study instants).
 */
export function evaluateSpace(space: ProtectedSpace, base: Occluders, prop: Occluders, win: StudyWindow, o: EvalOptions): SpaceResult {
  const pts = space.rings.flat()
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]))
  const span = Math.max(maxX - minX, maxY - minY)
  const cell = o.cell ?? (span > 300 ? 2 : 1)
  const g = gridOver(minX, minY, maxX, maxY, cell)
  const inside = polygonMask(space.rings, g)
  const cellArea = cell * cell
  let insideCount = 0
  for (let k = 0; k < inside.length; k++) insideCount += inside[k]
  const area = insideCount * cellArea
  const swept = new Uint8Array(inside.length)
  const bm = new Uint8Array(inside.length), pm = new Uint8Array(inside.length)
  const step = o.stepMin ?? 1
  const detailed: Interval[] = [], basic: { label: string; added: number }[] = []
  let firstNew: string | null = null, lastNew: string | null = null
  let peak = { label: '', added: 0 }
  for (const t of instants(win, step)) {
    const p = solarPosition(t, o.lat, o.lon)
    if (p.altitude <= 0) continue
    const dir = sunDirection(p, o.northDeg)
    const minutes = Math.round((t - win.startUtc) / 60000)
    shadowMask(prop, g, dir, pm)
    // The baseline only matters where the proposal casts shadow, or at a Detailed-study instant (existing area).
    let touches = false
    for (let k = 0; k < inside.length && !touches; k++) touches = inside[k] === 1 && pm[k] === 1
    if (!touches && minutes % 15 !== 0) continue
    const b = baseMask(base, g, dir, bm, o, `space:${space.id}:${g.x0},${g.y0},${g.cell},${g.nx},${g.ny}:${o.northDeg}:${t}`)
    let ex = 0, add = 0
    for (let k = 0; k < inside.length; k++) {
      if (!inside[k]) continue
      if (b[k]) ex++
      else if (pm[k]) { add++; swept[k] = 1 }
    }
    const label = clockLabel(t, win.offsetH)
    if (add > 0) { if (!firstNew) firstNew = label; lastNew = label }
    if (add * cellArea > peak.added) peak = { label, added: add * cellArea }
    if (minutes % 15 === 0) detailed.push({ utc: t, label, existing: ex * cellArea, added: add * cellArea, cumulative: (ex + add) * cellArea })
    if (minutes % 120 === 0) basic.push({ label, added: add * cellArea })
  }
  let sweptCount = 0
  for (let k = 0; k < swept.length; k++) sweptCount += swept[k]
  const n = detailed.length || 1
  const pct = (f: (i: Interval) => number) => (area > 0 ? (100 * detailed.reduce((s, i) => s + f(i), 0)) / (area * n) : 0)
  return {
    space, window: win, area, cell, swept: sweptCount * cellArea, basic, detailed,
    coverage: { existing: pct((i) => i.existing), added: pct((i) => i.added), cumulative: pct((i) => i.cumulative) },
    firstNew, lastNew, peak,
  }
}

/** Below one cell of new shadow the raster cannot tell (team assumption: the City states no tolerance). */
export const noiseFloor = (r: SpaceResult) => r.cell * r.cell

export function ruleState(r: SpaceResult, rule: RuleDef): RuleState {
  if (rule.kind === 'minimise') return 'unknown'
  if (r.swept <= 0) return 'pass'
  return r.swept <= noiseFloor(r) ? 'warn' : 'fail'
}

// ---- Sun-hours map -------------------------------------------------------------------------------------------------

export interface SunHours {
  grid: Grid
  /** Hours of direct sun per cell with the proposal, and for the baseline alone. */
  proposal: Float32Array
  baseline: Float32Array
  /** 1 where a building stands at ground level (not open ground). */
  covered: Uint8Array
  window: StudyWindow
  /** Hours in the window with the sun above the cut-off. */
  possible: number
  stepMin: number
  cutoffDeg: number
}

/** Hours of direct sun on the ground, sampled at the middle of each step (research P02-M03, 1 h = 4 steps by default). */
export function sunHoursMap(base: Occluders, prop: Occluders, g: Grid, win: StudyWindow, o: EvalOptions & { cutoffDeg?: number }): SunHours {
  const step = o.stepMin ?? 15
  const cutoff = o.cutoffDeg ?? 0
  const n = g.nx * g.ny
  const proposal = new Float32Array(n), baseline = new Float32Array(n)
  const bm = new Uint8Array(n), pm = new Uint8Array(n)
  const all = { prisms: [...base.prisms, ...prop.prisms], tris: [...base.tris, ...prop.tris] }
  const covered = footprintMask(all, g)
  let possible = 0
  const h = step / 60
  for (let t = win.startUtc + (step * 60000) / 2; t < win.endUtc; t += step * 60000) {
    const p = solarPosition(t, o.lat, o.lon)
    if (p.altitude <= cutoff) continue
    possible += h
    const dir = sunDirection(p, o.northDeg)
    const b = baseMask(base, g, dir, bm, o, `map:${g.x0},${g.y0},${g.cell},${g.nx},${g.ny}:${o.northDeg}:${t}`)
    shadowMask(prop, g, dir, pm)
    for (let k = 0; k < n; k++) {
      if (b[k]) continue
      baseline[k] += h
      if (!pm[k]) proposal[k] += h
    }
  }
  return { grid: g, proposal, baseline, covered, window: win, possible, stepMin: step, cutoffDeg: cutoff }
}

/** Area-weighted summary of the map over open ground within a radius of a point. */
export function summariseHours(m: SunHours, centre: Pt, radius: number) {
  let cells = 0, lost = 0, lostOneHour = 0, sumP = 0, sumB = 0
  const g = m.grid
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i
    if (m.covered[k]) continue
    const [x, y] = cellCentre(g, i, j)
    if (Math.hypot(x - centre[0], y - centre[1]) > radius) continue
    cells++
    sumP += m.proposal[k]; sumB += m.baseline[k]
    const d = m.baseline[k] - m.proposal[k]
    if (d > 1e-6) lost++
    if (d >= 1 - 1e-6) lostOneHour++
  }
  const a = g.cell * g.cell
  return { area: cells * a, meanProposal: cells ? sumP / cells : 0, meanBaseline: cells ? sumB / cells : 0, lostArea: lost * a, lostOneHourArea: lostOneHour * a }
}

// ---- Results for the node -----------------------------------------------------------------------------------------

export type Reading = 'unresolved' | 'park' | 'minimise'

const fmt = (m2: number) => `${Math.round(m2).toLocaleString('en-CA')} m²`

/** What the Real Vancouver run found about its inputs (see engine/solarCity.ts). */
export interface CitySummary {
  /** Table-1 spaces with a polygon: tested (within shadow reach) and beyond reach. */
  tested: number
  beyond: number
  /** Table-1 spaces without a polygon in the City parks data (not tested). */
  missing: string[]
  /** Baseline buildings with a LiDAR height near the tested spaces and the map, and footprints left out for want of one. */
  withHeight: number
  unknownHeight: number
  terrain: boolean
  towerBase: number
  source: Source
}

/** Lines for the evidence panel: the solar frame, each space under its rule, and what the guideline leaves open. */
export function solarRuleResults(spaces: SpaceResult[], readings: Record<string, Reading>, ctx: { project: 'vtc' | 'city'; towers: Tower[]; hours?: ReturnType<typeof summariseHours> | null; city?: CitySummary }): RuleResult[] {
  const out: RuleResult[] = []
  const st = selfTest()
  out.push({
    id: 'solar-frame', label: 'Sun position self-test (11 Nov 2026, 17:00 UTC)', value: `${st.altitude.toFixed(2)}° up, azimuth ${st.azimuth.toFixed(1)}°`,
    threshold: 'NOAA reference 12.65°, 137.2° (±0.2°)', state: st.ok ? 'pass' : 'fail', flag: 'verified',
    source: { label: 'NOAA GML solar calculator equations (Meeus); reference values from research P02-M01', url: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html' },
    note: 'Clock: BC has kept UTC-7 all year since 8 Mar 2026, so 22 Sep 10:00 PT is 17:00 UTC (s.5 p.10 also sets studies to PT, UTC-7).',
  })
  // 6.1.1: buildings up to four storeys may be exempted.
  const storeys = Math.max(0, ...ctx.towers.map(storeyCount))
  if (storeys > 0 && storeys <= 4) out.push({ id: 'solar-lowrise', label: 'Low-rise exemption', value: `${storeys} storeys`, threshold: 'up to 4 storeys may be exempted where efforts minimise shadow', state: 'pass', flag: 'unverified', source: cite('6.1.1', '11'), note: READ_NOTE })

  for (const r of spaces) {
    const fixed = r.space.rule ? RULES[r.space.rule] : null
    const reading: Reading = fixed ? 'park' : r.space.t1 ? (ruleForClass(r.space.t1.cls, r.space.t1.note) === 'minimise' ? 'minimise' : 'park') : (readings[r.space.id] ?? 'unresolved')
    const rule = fixed ?? (r.space.t1 ? RULES[ruleForClass(r.space.t1.cls, r.space.t1.note)] : reading === 'unresolved' ? null : RULES[reading])
    const when = r.firstNew ? ` (new shadow ${r.firstNew}–${r.lastNew}, peak ${fmt(r.peak.added)} at ${r.peak.label})` : ''
    const value = `${fmt(r.swept)} new shadow over ${r.window.label}${when}; coverage +${r.coverage.added.toFixed(1)}%`
    if (!rule) {
      // Not in Table 1: the guideline does not say how such a space is treated.
      const park = ruleState(r, RULES.park)
      out.push({
        id: `solar-space-${r.space.id}`, label: r.space.name, value, threshold: 'class unresolved: the guideline protects only the spaces listed in Table 1 (pp. 5–8)',
        state: 'unknown', flag: 'unresolved', source: cite('2 and Table 1', '3–8'),
        note: `If the City read it as a park (3.1.1, p.4): ${park === 'pass' ? 'no new shadow, would comply' : park === 'warn' ? 'within one raster cell, check by hand' : 'would not comply'}. As an urban plaza (3.2.1, p.5): minimise where possible, no pass/fail. Choose a reading in the Solar panel to test it.`,
      })
      continue
    }
    const state = ruleState(r, rule)
    const assumed = !r.space.t1 && !fixed
    out.push({
      id: `solar-space-${r.space.id}`, label: `${r.space.name}${assumed ? ` · read as ${reading === 'park' ? 'a park' : 'a plaza'}` : ''}`,
      value, threshold: rule.kind === 'minimise' ? 'minimise where possible: no pass/fail (report)' : `no new shadow (s.${rule.clause}); a sliver within one ${r.cell} m cell reads "check"`,
      state, flag: assumed ? 'team_assumption' : 'unverified', source: cite(rule.clause, rule.page),
      note: `${rule.text}. ${assumed ? 'The space is not in Table 1: this reading is the team\'s choice. ' : ''}${READ_NOTE} Basic study (5.1.1): ${r.basic.map((b) => `${b.label} ${fmt(b.added)}`).join(', ')}.`,
    })
  }

  const c = ctx.city
  const t1Line: RuleResult = ctx.project === 'vtc'
    ? { id: 'solar-table1', label: 'Table-1 protected spaces', value: '58 listed; none placed on the hypothetical VTC block', threshold: 'the block\'s real location decides which spaces fall within shadow reach (~0.6 km on 22 Sep)', state: 'unknown', flag: 'unresolved', source: cite('Table 1', '5–8'), note: 'Switch to the Real Vancouver project to test the real Table-1 spaces.' }
    : c
      ? {
          id: 'solar-table1', label: 'Table-1 protected spaces', value: `${c.tested} within shadow reach and tested; ${c.beyond} beyond reach (cannot get new shadow); ${c.missing.length} without a polygon`,
          threshold: 'all 58 spaces of Table 1 (pp. 5–8)', state: c.missing.length ? 'warn' : 'pass', flag: 'unverified', source: c.source,
          note: `City park polygons stand in for property lines. Not tested, no polygon in the City parks data: ${c.missing.join('; ')}.`,
        }
      : { id: 'solar-table1', label: 'Table-1 protected spaces', value: 'loading the City context…', threshold: 'all 58 spaces of Table 1 (pp. 5–8)', state: 'unknown', flag: 'unresolved', source: cite('Table 1', '5–8') }
  out.push(t1Line)

  out.push({
    id: 'solar-open', label: 'What the guideline leaves open', value: 'tolerance for "new shadow"; instants or continuous; cenotaph clock', threshold: 'not stated in the guideline',
    state: 'unknown', flag: 'unresolved', source: cite('3.1.1, 4.3.1, 5', '4, 10'),
    note: 'This tool samples every minute and treats any new shadow above one raster cell as a fail. The Victory Square cenotaph rule (4.3.1, 11 Nov 10 am–12 pm "PST") is measured under both clock readings but not judged: it says PST while section 5 says PT is UTC-7.',
  })
  out.push(ctx.project === 'vtc' || !c
    ? {
        id: 'solar-baseline', label: 'Baseline context', value: ctx.project === 'vtc' ? 'VTC model buildings, heritage and future towers; flat ground' : 'loading…',
        threshold: 'complete built and approved context with topography; trees and shade structures excluded (s.5, p.10)', state: 'warn', flag: ctx.project === 'vtc' ? 'team_assumption' : 'unresolved',
        source: cite('5', '10'), note: ctx.project === 'vtc' ? 'The model\'s future towers count as approved (team assumption). Missing context makes new shadow look larger (conservative).' : undefined,
      }
    : {
        id: 'solar-baseline', label: 'Baseline context', value: `${c.withHeight} buildings with LiDAR heights; ${c.unknownHeight} nearby footprints without a height left out${c.terrain ? '; terrain MRDEM 30 m' : '; no terrain'}`,
        threshold: 'complete built and approved context with topography; trees and shade structures excluded (s.5, p.10)', state: 'warn', flag: c.unknownHeight ? 'unresolved' : 'unverified', source: cite('5', '10'),
        note: `A footprint without a LiDAR height casts no shadow here (it is never given a guessed height), so new shadow may be overstated: conservative for compliance. Approved and proposed towers are not in the City data. ${c.terrain ? 'Each space is tested at its own terrain elevation (median of its outline); the map is a flat plane at the tower base' : 'Flat ground'} (tower base ${c.towerBase.toFixed(1)} m, the project's ground setting).`,
      })
  if (ctx.hours) {
    const h = ctx.hours
    out.push({
      id: 'solar-hours', label: 'Sun hours on open ground within 300 m (22 Sep, 10–16 PT)', value: `mean ${h.meanProposal.toFixed(1)} h with the design vs ${h.meanBaseline.toFixed(1)} h before; ${fmt(h.lostOneHourArea)} lose an hour or more`,
      threshold: 'descriptive only: no City threshold for sun hours (research P02-M03)', state: 'unknown', flag: 'team_assumption',
      source: { label: 'Research P02-M03 (public-realm sun-hours map): change vs baseline is reported, not judged' },
    })
  }
  return out
}

/** Storeys of a tower (podium floors at 4.5 m, as engine/massing does), without pulling the import pipeline into the worker. */
export function storeyCount(t: Tower): number {
  if (t.imported) return t.imported.storeys.length
  if (t.blocks?.length) {
    // As engine/massing towerFloors: podium floors per podium block, then whole tower floors above the podium.
    const sp = blockSpans(t), pod = sp.filter((b) => b.podium), top = pod.length ? pod[pod.length - 1].z1 : 0
    const n = pod.reduce((s, b) => s + (b.z1 > b.z0 ? Math.max(1, Math.round((b.z1 - b.z0) / 4.5)) : 0), 0)
    return n + Math.max(0, Math.floor(((sp[sp.length - 1]?.z1 ?? 0) - top) / t.f2f))
  }
  const podium = t.podiumHeight > 0 ? Math.max(1, Math.round(t.podiumHeight / 4.5)) : 0
  return podium + Math.max(0, Math.floor((t.height - t.podiumHeight) / t.f2f))
}
