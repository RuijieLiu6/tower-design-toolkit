// Structure screening (research P10-M01 system shortlist, P10-M03 seismic route, P10-M05 continuity and regularity).
// Screening only: no member sizing, no design values. Packet P10 had two critique rounds and no final gate, so code
// readings the research corrected are "unverified" here.
import { coreStepsOf, coreTopZ, towerFloors } from './massing'
import { apertureLines, coreTopText } from './openingField'
import { lateralChangeLines } from './lateralChange'
import type { Flag, Floor, RuleResult, RuleState, Source, Tower } from './types'
import { coreStiffness, CRACKED_RANGE, type CoreStiffness } from './storeyWeight'
import { f1Empirical } from './acrossWind'
import { CREEP_PHI, DEFAULT_WEIGHT_PRESETS, FLAT_PLATE_MIN, FLAT_PLATE_REACH, GAMMA_C, gravityEccentricity, HARD_DECK, levelName, PLANTED_BUILDUP, ringAt, ringText, PT_PLATE_REACH, PT_RATIO, sameCore, SLAB_MIN, SNOW_W, soilKpa, storeyCore, storeyWeights, USE_LOADS, worstWeightStep, type GravityReading, type StoreyWeight, type WeightPresets, type WeightResult } from './storeyWeight'
import { USES } from './types'
import { towerTwist } from './twist'
import { floorOutline } from './corners'
import { TWIST_MIN } from './acrossWind'
import { systemShortlist, type SystemFit, type WindProcedure } from './windStructure'

/** Type 10 (sloped columns): inclined more than 2° from vertical (BCBC 2024 Table 4.1.8.6; NBC 2020 the same). */
export const TYPE10_DEG = 2
const TYPE10_SOURCE: Source = { label: 'BC Building Code 2024, Division B, Table 4.1.8.6 Type 10 and 4.1.8.10(10) (NBC 2020 the same; two readers)', page: 'pp.4-484, 4-488' }

/**
 * The largest lean of a perimeter column that follows a turning plate (tool cycle 11): over each storey the turn (deg)
 * times the farthest corner's distance from the outline's centre, over the storey height. Null when the plate does not turn.
 */
export function slopedColumnLean(t: Tower, floors: Floor[] = towerFloors(t)): { deg: number; level: number; r: number; turn: number; h: number } | null {
  const tw = towerTwist(t, floors)
  if (!(tw.deg > 0) || tw.storeys.length < 2) return null
  let best: { deg: number; level: number; r: number; turn: number; h: number } | null = null
  for (let k = 1; k < tw.storeys.length; k++) {
    const turn = Math.abs(tw.storeys[k].angle - tw.storeys[k - 1].angle)
    if (turn < 0.05) continue
    const f = floors.find((x) => x.level === tw.storeys[k].level)
    if (!f) continue
    const ring = floorOutline(t, f)
    if (ring.length < 3) continue
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
    const r = Math.max(...ring.map((p) => Math.hypot(p[0] - cx, p[1] - cy)))
    const h = Math.max(0.1, f.z1 - f.z0)
    const deg = (Math.atan((r * turn * Math.PI) / 180 / h) * 180) / Math.PI
    if (!best || deg > best.deg) best = { deg, level: f.level, r, turn, h }
  }
  return best
}

const NBC: Source = { label: 'National Building Code of Canada 2020, Div B 4.1.8 (2nd printing, 2025)', url: 'https://nrc-publications.canada.ca/eng/view/ft/?id=515340b5-f4e0-4798-be69-692e4ec423e8&dp=2&dsl=en' }
const TEAM: Source = { label: 'Team assumption (research P10 r1, editable)' }
/** Book sources of the P1 structure nodes (single-pass reads, 21 Nov 2026: unverified). */
export const CHING: Source = { label: 'Ching, Onouye & Zuberbuhler, Building Structures Illustrated (Wiley 2013), ch. 7 High-Rise Structures' }
export const AOYAMA: Source = { label: 'Aoyama (ed.), Design of Modern Highrise Reinforced Concrete Structures (Japanese practice; an analog)' }
export const ALLEN_IANO: Source = { label: "Allen & Iano, The Architect's Studio Companion, 5th ed. (Wiley 2012; NBC 2010 / IBC 2009 base, an analogue)" }

/** Downtown Vancouver hazard, site class X450 (Vs30 450 m/s), 2% in 50 years, from the NRCan 2020 hazard API (research P10, 21 Oct 2026). */
export const DOWNTOWN_HAZARD = { site: 'X450', s02: 1.04, s10: 0.429 }

export interface StructureResult {
  tower: Tower
  /** Empirical period for walls, Ta = 0.05·hn^(3/4) (seismic forces only). */
  Ta: number
  seismicCategory: 'SC4'
  outriggers: number[]
  rules: RuleResult[]
  systems: SystemFit[]
  /** Seismic weight of every floor and the roof, with weight centres (research R5 §3). */
  weights: WeightResult
  /** Weight-centre offsets from the core, the net offset and the sustained sway (research R5 §2). */
  gravity: GravityReading
  /** The core alone as a cantilever: first frequency and P-Δ (P1 #10). */
  core: CoreStiffness
}

/**
 * The Structure tool's sub-tabs (node placement, 21 Nov 2026): every rule line keeps its id and shows under one tab;
 * the Wind procedure tab is a node of its own. A line not listed here shows under the first tab, so a new line is never
 * dropped from the results.
 */
export type StructureTab = 'seismic' | 'lateral' | 'floors'
export const STRUCTURE_TABS: { id: StructureTab; tab: string; lines: string[] }[] = [
  { id: 'seismic', tab: 'System & seismic', lines: ['seismic-category', 'period', 'dynamic', 'continuity', 'weight', 'sloped-columns', 'geometric', 'core-ratio'] },
  { id: 'lateral', tab: 'Lateral & sway', lines: ['core-alone', 'p-delta', 'gravity-offset', 'gravity-net', 'outriggers', 'lateral-change', 'aperture-core', 'aperture-sky', 'aperture-bridge'] },
  { id: 'floors', tab: 'Floors & spans', lines: ['floor-reach', 'floor-dead-load'] },
]
/** The tab a structure line shows under (unlisted lines: the first). */
export const structureTabOf = (lineId: string): StructureTab => STRUCTURE_TABS.find((g) => g.lines.includes(lineId))?.id ?? STRUCTURE_TABS[0].id

/** `north` (true north clockwise from the project frame's +y) places deck uses that name a facing (`Tower.deckUses`). */
export function structureCheck(t: Tower, wp: WindProcedure, wpr: WeightPresets = DEFAULT_WEIGHT_PRESETS, north = 0): StructureResult {
  const rules: RuleResult[] = []
  const add = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string) =>
    rules.push({ id, label, value, threshold, state, flag, source, note })
  const H = t.height
  const { s02, s10, site } = DOWNTOWN_HAZARD

  add('seismic-category', 'Seismic Category', `SC4: IE·S(0.2) = ${s02} g, S(1.0) = ${s10} g`, 'SC4 when IE·S(0.2) > 0.75 g', 'warn', 'verified', { ...NBC, page: 'Table 4.1.8.5-B' },
    `Downtown hazard for site class ${site} (assumed, not measured at the block), normal importance (IE = 1.0, team assumption).`)

  const Ta = 0.05 * H ** 0.75
  add('period', 'Empirical period Ta (walls)', `${Ta.toFixed(2)} s`, `forces may use up to 2·Ta = ${(2 * Ta).toFixed(2)} s; deflections cap at 4.0 s`, 'unknown', 'unverified', { ...NBC, page: '4.1.8.11(3)' },
    'For seismic forces only, never as the wind frequency f1. Stiff outrigger or transfer floors make the real period shorter than Ta, so Ta-based forces can be unconservative.')

  add('dynamic', 'Analysis route', 'dynamic analysis required', 'equivalent static only for SC1–SC2, or regular buildings under 60 m with Ta < 2 s', 'warn', 'verified', { ...NBC, page: '4.1.8.7(1), 4.1.8.12(8)–(9)' },
    'Dynamic base shear at least 0.8 V for a regular structure, 1.0 V if irregular.')

  const imported = !!t.imported
  // A core that steps with the tiers (gap G18): each upper core must stand inside the core below, so its walls can run
  // down to the foundation; walls that end at a step are continuous from their own top down (4.1.8.10(4)).
  const floors = towerFloors(t)
  const steps = coreStepsOf(t)
  const weights = storeyWeights(t, wpr, north)
  const runs: { from: number; side: number; x: number; y: number }[] = []
  if (steps.length) {
    const at = storeyCore(t, weights.core)
    // storeys above a core top have no core (tool cycle 12): they start no run
    for (const f of floors) { const c = at(f.level), last = runs[runs.length - 1]; if (!(c.side > 0)) continue; if (!last || !sameCore(last, c)) runs.push({ from: f.level, ...c }) }
  }
  // the core ends below the top (tool cycle 12): its walls still run from their own top to the foundation
  const ends = coreTopText(t, floors)
  const outside = runs.slice(1).map((c, k) => ({ c, below: runs[k], over: Math.max(Math.abs(c.x - runs[k].x) + c.side / 2 - runs[k].side / 2, Math.abs(c.y - runs[k].y) + c.side / 2 - runs[k].side / 2) })).filter((x) => x.over > 0.05)
  const m1 = (v: number) => v.toFixed(1)
  if (runs.length > 1) {
    add('continuity', 'Core walls continuous to the foundation', outside.length ? `the core from ${outside.map((x) => `L${x.c.from}`).join(', ')} stands ${outside.map((x) => `${m1(x.over)} m`).join(', ')} outside the core below` : `the core steps in ${runs.length - 1} time${runs.length > 2 ? 's' : ''}, each upper core inside the one below`,
      'required where Ta ≥ 1 s and IE·S(1.0) > 0.25: walls continuous from their top to the foundation, none transferred or offset (Types 4 and 5)', outside.length ? 'fail' : 'pass', 'verified', { ...NBC, page: '4.1.8.10(4), Table 4.1.8.6 Types 4–5' },
      `${ends ? `${ends} ` : ''}Core steps: ${runs.map((c) => `L${c.from} ${m1(c.side)} m at (${m1(c.x)}, ${m1(c.y)})`).join(' → ')} (tower frame). The walls of each upper core must run down to the foundation inside the larger cores below; the outer walls end at the step, continuous from their own top down. An upper core outside the one below needs a transfer, which is not permitted, with no nonlinear-analysis route. A core whose centre moves at a step carries its upper part off the centre of its lower part: the off-centre storey line measures each storey from its own core, and the sway line adds that jog (each core section carries the weights above it about its own centre).`)
  } else {
    const topWord = ends ? ` to its top at +${coreTopZ(t)!.toFixed(1)} m` : ' to the top'
    add('continuity', 'Core walls continuous to the foundation', imported ? `core not modelled for imported massing${ends ? `; declared to end at +${coreTopZ(t)!.toFixed(1)} m` : ''}` : `the modelled core runs from the foundation${topWord}`,
      'required where Ta ≥ 1 s and IE·S(1.0) > 0.25: no wall that ends, steps or is transferred (Types 4 and 5)', imported ? 'unknown' : 'pass', 'verified', { ...NBC, page: '4.1.8.10(4), Table 4.1.8.6 Types 4–5' },
      `${ends ? `${ends} ` : ''}Keep it that way in design: open podium spaces wrap around the core; a wall transfer is not permitted, with no nonlinear-analysis route.`)
  }

  // Weight irregularity (Type 2) by storey weight (gap G6, research R5 §3); the floor-area ratio stays in the note.
  let worst = { ratio: 1, level: 0 }
  for (let i = 1; i < floors.length; i++) {
    const a = floors[i - 1].area, b = floors[i].area
    const r = Math.max(a, b) / Math.max(1e-9, Math.min(a, b))
    if (r > worst.ratio) worst = { ratio: r, level: floors[i].level }
  }
  const step = worstWeightStep(weights.levels)
  const stepped = !!step && step.ratio >= 1.005
  const byArea = worst.ratio > 1 ? `${Math.round(worst.ratio * 100)}% between L${worst.level - 1} and L${worst.level}` : 'uniform'
  const plantedDecks = weights.levels.filter((l) => (!l.roof || l.deckUse) && l.deckKind === 'planted')
  const given = weights.levels.filter((l) => l.deckUse)
  const kg = (q: number) => q.toFixed(1)
  add('weight', 'Weight irregularity (Type 2)', stepped ? `${Math.round(step.ratio * 100)}% by weight between ${levelName(step.lower)} and ${levelName(step.upper)}` : 'uniform by weight',
    'storey weight ≤ 150% of the adjacent storey (a roof lighter than the floor below is exempt)', stepped && step.ratio > 1.5 ? 'warn' : 'pass', 'verified', { ...NBC, page: 'Table 4.1.8.6 Type 2; W per 4.1.8.2' },
    `By floor area alone: ${byArea}. Weight of each floor = plate × (slab + superimposed dead load by use + 0.5 kPa partitions) + the open deck at that floor over the storey below (hard ${HARD_DECK} kPa, or planted: ${wpr.soilMm} mm of soil, ${kg(soilKpa(wpr.soilMm))} kPa, + ${PLANTED_BUILDUP} kPa build-up; 25% of snow, ${SNOW_W} kPa) + facade ${wpr.facadeKpa} kPa + core walls ${wpr.coreWall} m thick; the floor on grade is the base. ${wpr.slabFrom === 'use' ? 'Slabs by use (0.20 m homes and hotel, 0.25 m the rest)' : 'Tower slabs from each storey’s core-to-facade reach (see the floor reach line; podium slabs by use)'}; SDL, decks, facade and core walls are team presets (research R5 §3.3).`
    + (plantedDecks.length ? ` Planted deck${plantedDecks.length > 1 ? 's' : ''}: ${plantedDecks.map((l) => `${levelName(l)} (${Math.round(l.deck).toLocaleString('en-CA')} m², ${l.deckUse ? `deck-use input, ${l.deckUse.soilMm ?? wpr.soilMm} mm of soil` : l.garden ? 'open garden storey' : 'public amenity floor'})`).join(', ')}, each carried by its own floor.` : '')
    + (given.length ? ` Deck uses (the deck-use input) set the decks at ${given.map(levelName).join(', ')}: planted with their own soil, occupied or unused ones hard, whatever the storey's use (gap G32).` : '')
    + ' The podium-to-tower step usually triggers it: an irregular structure needs Vd ≥ 1.0 V.')

  // Sloped columns, Type 10 (tool cycle 11; BCBC 2024 Table 4.1.8.6, read by two readers): perimeter columns that follow
  // a turning plate lean by the turn times their distance from the axis over the storey height.
  const lean = slopedColumnLean(t, floors)
  const leanState: RuleState = lean && lean.deg > TYPE10_DEG ? 'warn' : 'pass'
  rules.push({
    id: 'sloped-columns', label: 'Sloped columns (Type 10)',
    value: lean ? `perimeter columns that follow the turning facade lean about ${lean.deg.toFixed(1)}° at L${lean.level} (${lean.r.toFixed(1)} m from the axis, ${lean.turn.toFixed(1)}° in a ${lean.h.toFixed(2)} m storey)` : 'no turning plate read: perimeter columns can stay vertical',
    threshold: `a gravity column inclined more than ${TYPE10_DEG}° from vertical is irregularity Type 10: design for vertical ground motion and the thrusts at the floors (4.1.8.10(10))`,
    state: leanState, flag: 'verified', source: TYPE10_SOURCE,
    ...(leanState === 'warn' ? { specialist: `Sloped gravity columns past ${TYPE10_DEG}° (Type 10): the structural engineer keeps the perimeter columns vertical inside the turning slab edges (cantilevered corners) or designs the sloped columns for vertical ground motion and the floor thrusts.` } : {}),
    note: 'The lean is read for a perimeter column at the outline’s farthest corner that follows the facade from storey to storey (the turn per storey read from the storey outlines, engine/twist.ts). Columns kept vertical inside the turning edges do not lean: the corners then cantilever (floor reach reads the corner). Leans from a tapering or leaning plate are not read yet.',
  })

  // Floor reach (P1 #13, NODE_LIST row 13): each tower storey's core-to-facade reach against one flat plate, and the slab
  // its span needs, which the storey weights now carry.
  rules.push(...floorReachLines(t, weights, wpr, north))

  // Off-centre gravity load and accidental torsion (gap G5, research R5 §2): weight centre of each tower level vs the core.
  const grav = gravityEccentricity(weights, H)
  const g = grav.worst, big = grav.largest
  const m = (v: number) => v.toFixed(1)
  add('gravity-offset', 'Off-centre storey weight (e / D)', g ? (g.e < 0.05 ? 'weight centred on the core at every tower storey' : `largest e/D ${g.ratio.toFixed(3)} at ${levelName(g)} (${m(g.across)} m across a ${g.D.toFixed(0)} m plate)`) : 'no tower storeys',
    'e/D ≤ 0.05; 0.05–0.10 declare it; over 0.10 the inherent offset exceeds the code’s accidental arm of 0.10·D', !g ? 'unknown' : g.ratio > 0.05 ? 'warn' : 'pass', 'verified', { ...NBC, page: '4.1.8.11(11)(a); research R5 §2' },
    `Weight centre of every tower floor and the roof (plate, open deck, facade and core walls, as in the weight line) against the core centre: ${weights.core.how}${runs.length > 1 ? `; where the core steps, each storey against the core of its own step (${runs.slice(1).map((c) => `from L${c.from} at (${m1(c.x)}, ${m1(c.y)})`).join(', ')}), whose walls move with it` : ''}.`
    + (big && big.e >= 0.05 ? ` Largest offset ${m(big.e)} m at ${levelName(big)} (x ${m(big.ex)}, y ${m(big.ey)} m in the tower's own axes).` : '')
    + (g && g.ratio > 0.1 ? ' Beyond the code’s accidental arm: the torsion the code assumes is smaller than this design’s own.' : g && g.ratio > 0.05 ? ' Within the code’s accidental arm: declare it for the structural reviewer.' : '')
    + ' The code applies torsion F·(e ± 0.10·D) at every level. The core centre stands in for the stiffness centre (exact for a doubly symmetric closed core) and the 0.05 band is a team value; podium storeys, a wider one- or two-storey transitional run just above the podium, and the floor over them are left out, as their stiffness is not the core’s alone.')
  const mm = (v: number) => Math.round(v * 1000)
  // Core alone (P1 #10): the modelled core's own stiffness against the 46/H the sway and across-wind lines assume.
  const core = coreStiffness(weights, H)
  const emp = f1Empirical(H)
  const share = emp.central > 0 ? (core.f1 / emp.central) ** 2 : 0
  const coreSway = (x: number) => (share > 0 && Number.isFinite(core.pDelta) ? (x / share) * core.pDelta : Infinity)
  // The core jog (gap G30): with core steps whose centres move, the sway and base overturning read each core section's
  // moment about its own centre; the storey-by-storey value (each storey about its own core) stays as a detail.
  const jog = grav.jog.moved ? grav.jog : null
  const lt = jog ? jog.sway.lt : grav.sway.lt
  const ltCore = coreSway(lt)
  const MN = (v: number) => (v / 1000).toFixed(0)
  const jogText = jog ? ` With the core jog: each core section carries the tower storeys above it about its own centre, so an upper core set off the one below adds its storeys' weight × the offset to every section beneath it (unit-load integral of M(h)·(H − h) / EI, same EI and creep). Base overturning about the ground core Q_G ≈ ${MN(jog.QG)} MN·m (storey by storey ${MN(grav.QG)} MN·m); sections ${jog.sections.map((c, k) => `${k ? `L${c.from}` : 'grade'} ${m1(c.side)} m at (${m1(c.x)}, ${m1(c.y)})${k ? `, ${m1(Math.hypot(c.dx, c.dy))} m off the one below, ≈ ${MN(c.M)} MN·m about its centre (${MN(c.Mjog)} from the cores above it)` : ''}`).join('; ')}. Storey by storey (each storey about its own core, the jog left out): top sway ≈ ${mm(grav.sway.el)} mm elastic, ≈ ${mm(grav.sway.lt)} mm long term.` : ''
  add('gravity-net', 'Net gravity eccentricity and sustained sway', g ? `E = ${grav.net.e.toFixed(2)} m (e/D ${grav.net.ratio.toFixed(3)}); top sway ≈ ${mm(jog ? jog.sway.el : grav.sway.el)} mm elastic, ≈ ${mm(lt)} mm long term${jog ? ` with the core jog (${mm(grav.sway.el)} / ${mm(grav.sway.lt)} mm storey by storey)` : ''}${Number.isFinite(ltCore) ? `; core alone ≈ ${mm(ltCore)} mm long term` : ''}` : 'no tower storeys',
    'long-term top sway ≤ 25 mm; 25–100 mm declare a pre-set (camber); over 100 mm a tie-down or outrigger strategy, as at Vancouver House', !g ? 'unknown' : Math.max(lt, ltCore) > 0.025 ? 'warn' : 'pass', 'team_assumption',
    { label: 'Research R5 §2.3–2.5 (cantilever core, EI from f1 = 46/H); case: Vancouver House, floors cambered against about 254 mm of sway (G. Poh, STRUCTURE magazine)', url: 'https://www.structuremag.org/article/vancouver-house/' },
    `Net offset of the tower's weight from the core, E = ΣW·e / ΣW = (x ${grav.net.ex.toFixed(2)}, y ${grav.net.ey.toFixed(2)}) m${jog ? ', each storey from its own core' : ''}; gravity-induced overturning about the core Q_G = |ΣW·e| ≈ ${(grav.QG / 1000).toFixed(0)} MN·m${jog ? ' storey by storey' : ''} (Type 9's ratio α needs a base shear, not computed).`
    + jogText
    + (lt > 0.1 ? ' Over 100 mm: plan a tie-down or outrigger strategy (Vancouver House: post-tensioned rods and a torsion box, each floor cambered).' : lt > 0.025 ? ' Declare a pre-set (camber) of the floors for the structural reviewer.' : '')
    + ` Sway of a cantilever core with EI from the empirical f1 = 46/H (±50%), creep φ = ${CREEP_PHI} (ACI 209, unverified): an upper bound, since floors cast plumb on the frame below hide earlier sway, which a designed pre-set exploits. Bands are team values.`
    + (Number.isFinite(ltCore) ? ` Core alone (P1 #10, see the core-alone line): the modelled core gives ${Math.round(share * 100)}% of the stiffness 46/H assumes, so with the core alone the long-term sway is about ${mm(lt)} ÷ ${share.toFixed(2)} × P-Δ ${core.pDelta.toFixed(2)} ≈ ${mm(ltCore)} mm (a uniform-stiffness scaling, unverified); the state reads the larger of the two, so a design whose pass rests on 46/H shows it.` : ''))

  // Core-alone frequency and P-Δ (P1 #10, NODE_LIST row 10).
  rules.push(...coreLines(t, core, H, outriggers0(t, floors)))

  // A core that steps (gap G18) changes the SFRS's plan dimension from storey to storey.
  const jumps = runs.slice(1).map((c, k) => ({ c, ratio: Math.max(c.side, runs[k].side) / Math.max(1e-9, Math.min(c.side, runs[k].side)) }))
  const geo = jumps.reduce<(typeof jumps)[number] | null>((m, x) => (!m || x.ratio > m.ratio ? x : m), null)
  add('geometric', 'Vertical geometric irregularity (Type 3)', geo ? `core ${m1(runs[runs.indexOf(geo.c) - 1].side)} → ${m1(geo.c.side)} m at L${geo.c.from}: ${Math.round(geo.ratio * 100)}%` : 'core constant over the height',
    'SFRS dimension ≤ 130% of the adjacent storey', geo && geo.ratio > 1.3 ? 'warn' : 'pass', 'verified', { ...NBC, page: 'Table 4.1.8.6 Type 3' },
    geo ? `The SFRS here is the core, and it steps: ${jumps.map((x) => `${Math.round(x.ratio * 100)}% at L${x.c.from}`).join(', ')}.${geo.ratio > 1.3 ? ' Over 130% is a Type 3 irregularity: the dynamic analysis carries it, or smaller steps (each within 130%) avoid it.' : ' Each step stays within 130%.'}` : 'The SFRS here is the core, which keeps its size; a wider podium only counts if its walls join the SFRS.')

  const cs = t.coreShare
  add('core-ratio', 'Core ratio (core ÷ gross plate)', `${Math.round(cs * 1000) / 10}%`, 'good ≤ 25%; above 35% check', cs > 0.35 ? 'warn' : cs > 0.25 ? 'warn' : 'pass', 'team_assumption', TEAM,
    'No accessible primary source: a starting preset to calibrate against precedent plans.')

  const levels = new Set(floors.filter((f) => !f.podium).map((f) => f.level))
  const outriggers = [...new Set(t.outriggerFloors ?? [])].filter((l) => levels.has(l)).sort((a, b) => a - b)
  if (outriggers.length) {
    add('outriggers', 'Outrigger floors', outriggers.map((l) => `L${l}`).join(', '), 'outriggers as capacity-protected elements beside the listed core-wall SFRS', 'warn', 'unverified', { ...NBC, page: '4.1.8.9(3), (5); Commentary J' },
      'Not a listed SFRS in NBC 2020: special study likely. Stiff outrigger floors shorten the real period below Ta: dynamic analysis.')
  }

  // Openings through the tower (tool cycle 12): the core clear of each, its sky, and what spans its head as a tie.
  rules.push(...apertureLines(t, north))
  // The lateral-system change at the core top (tool cycle 12; engine/lateralChange.ts), read after every other line so
  // it can name an open-storey soft / weak storey check if the tool has one.
  rules.push(...lateralChangeLines(t, weights, { north, rules, floors }))

  const systems = systemShortlist(t, wp).map((s) => (s.id === 'outriggers' && outriggers.length ? { ...s, fit: 'shortlist' as const, reason: `You placed outriggers at ${outriggers.map((l) => `L${l}`).join(', ')}. ${s.reason}` } : s))
  return { tower: t, Ta, seismicCategory: 'SC4', outriggers, rules, systems, weights, gravity: grav, core }
}

/** Outrigger levels placed on tower storeys. */
const outriggers0 = (t: Tower, floors: ReturnType<typeof towerFloors>) => { const lv = new Set(floors.filter((f) => !f.podium).map((f) => f.level)); return [...new Set(t.outriggerFloors ?? [])].filter((l) => lv.has(l)).sort((a, b) => a - b) }

/** Heights of the book's ten RC towers (RC2 pp.295, 398, 405, 407–415: 123–300 m, H/T 39–71). */
export const RC_TOWERS = { hMin: 123, hMax: 300, htLow: 39, htHigh: 71 }
/** P-Δ amplification typical of tall towers: displaced weight adds about 10% (Ching p.3). */
export const PDELTA_TYPICAL = 1.1

/**
 * The core alone (P1 #10): its first frequency by Rayleigh against the 46/H band (Pass at or above the central value,
 * Check inside the band, Fail below it), and the P-Δ amplification of its sway (Pass ≤ ×1.10, else Check).
 */
export function coreLines(t: Tower, c: CoreStiffness, H: number, outriggers: number[] = []): RuleResult[] {
  const emp = f1Empirical(H)
  const share = emp.central > 0 ? (c.f1 / emp.central) ** 2 : 0
  const hz = (v: number) => v.toFixed(3)
  const steps = coreStepsOf(t).length > 0
  const tw = towerTwist(t)
  const why = [steps ? 'the core steps, which a single-tube cantilever reads only section by section' : '', c.top != null ? `the core ends at +${c.top.toFixed(1)} m and the storeys above ride on it as a rigid crown, whose frame is not read` : '', tw.deg >= TWIST_MIN ? `the plate twists ${Math.round(tw.deg)}°, which moves the perimeter the core does not count` : '',
    H > RC_TOWERS.hMax ? `${H.toFixed(0)} m is past the book's tallest RC example (${RC_TOWERS.hMax} m)` : ''].filter(Boolean).join('; ')
  const sp = why ? { specialist: why } : {}
  const secs = c.sections.map((s) => `${s.z0.toFixed(0)} m: ${s.side.toFixed(1)} m core, ${s.t.toFixed(2)} m walls`).join('; ')
  const src = { ...AOYAMA, page: 'p.381 (E), pp.26, 32 (cracked stiffness), pp.295, 398, 405, 407–415 (H/T 39–71)' }
  const out: RuleResult[] = []
  out.push({ ...sp, id: 'core-alone', label: 'Core alone: first frequency',
    value: `core alone ${hz(c.f1)} Hz vs 46/H ${hz(emp.central)} Hz (${Math.round(share * 100)}%)`,
    threshold: `at or above 46/H ${hz(emp.central)} Hz: Pass; ${hz(emp.lower)}–${hz(emp.central)} Hz (inside the band): Check; below ${hz(emp.lower)} Hz: Fail`,
    state: c.f1 >= emp.central ? 'pass' : c.f1 >= emp.lower ? 'warn' : 'fail', flag: 'unverified', source: src,
    note: `The modelled core alone as a cantilever fixed at grade: each storey's square core with its walls by band (${secs}), I = (s⁴ − (s − 2t)⁴)/12 (base ${c.base.I.toFixed(0)} m⁴ gross), E = 33,500 · (f′c/60)^(1/3) = ${Math.round(c.E).toLocaleString('en-CA')} MPa at f′c ${c.fc} MPa (RC2 p.381, aggregate factors 1), times a cracked factor ${c.cracked} (team; ${CRACKED_RANGE[0]}–${CRACKED_RANGE[1]} gives ${hz(c.range[0])}–${hz(c.range[1])} Hz; gross ${hz(c.gross)} Hz; uncracked stiffness serves little, RC1 pp.26, 32). f1 by Rayleigh on the storey weights (slabs from the floor reach, walls by band). `
      + `The percentage is the core's share of the stiffness 46/H assumes, (f_core / f_46/H)². The book's ten RC towers of ${RC_TOWERS.hMin}–${RC_TOWERS.hMax} m ran H/T ${RC_TOWERS.htLow}–${RC_TOWERS.htHigh} (f1 = ${hz(RC_TOWERS.htLow / H)}–${hz(RC_TOWERS.htHigh / H)} Hz here), 9 of 10 inside 46/H ±50%. `
      + (c.f1 >= emp.central ? 'The core alone reaches the stiffness the sway and across-wind lines assume.' : `Below the central value: the sway and across-wind lines' 46/H stiffness assumes the frame, belts, outriggers or coupling supply the other ${Math.round((1 - share) * 100)}%; the across-wind line shows the core-alone reading beside it.`)
      + (c.top != null ? ` The core ends at +${c.top.toFixed(1)} m (Structure › Lateral & sway › Core top): the cantilever stops there, and the storeys above load it as a rigid crown on its top (their own frame's flexibility is not read), so this frequency is an upper bound for the core alone.` : '')
      + (outriggers.length ? ` Outriggers are placed at ${outriggers.map((l) => `L${l}`).join(', ')}: their share is not computed here, so this reads a lower bound until the engineer shows it.` : '')
      + ' Walls by band, f′c and the cracked factor are presets (the weight presets); a model frequency from the engineer replaces all of it. Confidence C: a core-alone tube model that ignores outriggers, frames and coupling.' })
  const pd = c.pDelta
  out.push({ ...sp, id: 'p-delta', label: 'P-Δ amplification (core alone)',
    value: Number.isFinite(pd) ? `P-Δ ×${pd.toFixed(2)}` : 'P-Δ does not converge: the core alone is unstable under its own weight',
    threshold: `≤ ×${PDELTA_TYPICAL.toFixed(2)} typical (displaced weight adds about 10% to the overturning moment)`,
    state: Number.isFinite(pd) && pd <= PDELTA_TYPICAL ? 'pass' : 'warn', flag: 'unverified', source: { ...CHING, page: 'p.3 (PDF page)' },
    note: `The core alone's sway shape under its storey weights applied sideways, with each level's weight then carried on its displaced position: the extra moment Σ W·(δ(z_i) − δ(z)) is added and the sway recomputed until it settles; the ratio of the settled top sway to the first one is the amplification (cracked factor ${c.cracked}). Ching puts the effect at about 10% of the overturning moment (p.3); NBC's sway-effects clause is recalled, not read. The sway line applies this factor to its core-alone reading.` })
  return out
}

/**
 * Floor reach and the slab it needs (P1 #13): the worst tower storey's reach from the core face to the plate edge, on the
 * core's axes and to the farthest corner, against one flat plate (Ching p.8) and a post-tensioned plate (Allen & Iano
 * pp.118–119); and what the span-based slabs add to the dead load against the old use presets.
 */
export function floorReachLines(t: Tower, w: WeightResult, wpr: WeightPresets = DEFAULT_WEIGHT_PRESETS, north = 0): RuleResult[] {
  const out: RuleResult[] = []
  const m1 = (v: number) => v.toFixed(1)
  const lv = w.levels.filter((l) => !l.roof && !l.podium && !l.transitional && l.reach && l.reach.axial > 0)
  const ring = !!t.columnRing
  // a ring serves every storey or a level range (tool cycle 11)
  const span = (l: StoreyWeight) => (ringAt(t, l.level) && l.reach!.axial > FLAT_PLATE_REACH ? l.reach!.axial / 2 : l.reach!.axial)
  const far = lv.reduce<StoreyWeight | null>((a, b) => (!a || b.reach!.axial > a.reach!.axial ? b : a), null)
  const corner = lv.reduce<StoreyWeight | null>((a, b) => (!a || b.reach!.corner > a.reach!.corner ? b : a), null)
  const past = lv.filter((l) => l.reach!.axial > FLAT_PLATE_REACH), pastPT = lv.filter((l) => l.reach!.axial > PT_PLATE_REACH)
  const worst = lv.reduce((m, l) => Math.max(m, span(l)), 0)
  const src = { ...CHING, page: 'pp.8, 10 (PDF pages); Allen & Iano pp.103, 113, 118–119; Dobson p.66 (City of Vancouver Vertical Studio deck, 15 Sep 2026)' }
  const slabs = lv.map((l) => l.slab ?? 0).filter((x) => x > 0)
  const cm = (v: number) => `${Math.round(v * 1000)} mm`
  const sideNow = far?.coreSide ?? w.core.side
  // Outside the rules of thumb (node contract): a plate that turns on a straight core, or a reach past a post-tensioned plate.
  const tw = far ? towerTwist(t) : null
  const specialist = [tw && tw.deg >= TWIST_MIN ? `the plate turns ${Math.round(tw.deg)}° on a straight core, so column lines lean or transfer` : '', pastPT.length && !ring ? `${pastPT.length} storeys reach past a post-tensioned plate (${PT_PLATE_REACH} m): a long-span floor needs an engineer's scheme` : ''].filter(Boolean).join('; ')
  out.push({ ...(specialist ? { specialist } : {}), id: 'floor-reach', label: 'Floor reach: core to facade',
    value: far ? `depth axial ${m1(far.reach!.axial)} m (${levelName(far)}), corner ${m1(corner!.reach!.corner)} m (${levelName(corner!)})${ring ? `; with the column ring (${ringText(t)}), worst span ≈ ${m1(worst)} m` : ''}` : 'no tower storeys',
    threshold: `≤ ${FLAT_PLATE_REACH} m: one flat plate, 150–205 mm; to about ${PT_PLATE_REACH} m a post-tensioned plate at about L/${PT_RATIO[0]}–${PT_RATIO[1]}; beyond, an interior column ring or a long-span floor`,
    state: !far ? 'unknown' : worst > FLAT_PLATE_REACH ? 'warn' : 'pass', flag: 'unverified', source: src,
    note: !far ? 'No tower storey with a plate outside its core.' :
      `Reach from the core face (each storey's own core; ${m1(sideNow)} m at ${levelName(far)}) to the plate edge on the core's axes, and from the core to the farthest corner of the outline. One flat plate reaches about ${FLAT_PLATE_MIN}–${FLAT_PLATE_REACH} m at 150–180 mm, 205 mm at most (Ching p.8); a post-tensioned plate about L/${PT_RATIO[0]}–${PT_RATIO[1]} up to about ${PT_PLATE_REACH} m, a conventional one about L/26–33 (Allen & Iano pp.118–119). `
      + `${past.length} of ${lv.length} tower storeys reach past one flat plate${pastPT.length ? `, ${pastPT.length} past a post-tensioned plate` : ''}. `
      + (ring ? `An interior column ring is declared (columnRing, ${ringText(t)}): past ${FLAT_PLATE_REACH} m the slab spans half the reach on its storeys, so the worst span is about ${m1(worst)} m. ` : '')
      + (worst > FLAT_PLATE_REACH ? `${ring ? 'Past one flat plate where the ring does not serve, or past it even halved: extend the ring’s storeys, add a second ring,' : 'Past one flat plate: declare an interior column ring at about half the reach,'} or a long-span floor onto the perimeter columns, which pre-compresses them against uplift where outriggers pull (Ching p.10); post-tensioned beams for a ${m1(worst)} m span run about ${(worst / 24).toFixed(2)}–${(worst / 20).toFixed(2)} m deep (L/20–24; concrete beams L/16–18, girders L/12, or L/15 post-tensioned; Allen & Iano pp.103, 113). ` : '')
      + 'The corner reach is the diagonal to the farthest plate corner: a corner column or a cantilever (no cantilever limit in these books). '
      + (slabs.length ? `Slab carried into the storey weights: ${cm(Math.min(...slabs))}–${cm(Math.max(...slabs))} (L/${PT_RATIO[1]} of each storey's span, the thinner end of the range, at least ${cm(SLAB_MIN)}; L/${PT_RATIO[0]} is 12% thicker${pastPT.length ? `; past ${PT_PLATE_REACH} m the same ratio stands in for a long-span floor's weight, a team extrapolation` : ''}). ` : '')
      + 'For comparison, the KPF office test fit in the City’s Higher Buildings review has a 12.5 m (41 ft) deep core and about 12.8 m from core to glass (Dobson p.66; analog, a 94 × 63 m block). Podium storeys and the wider one- or two-storey run just above them are left out: their column grid is not modelled and their slab keeps the use preset. Book values read once: unverified.' })

  // Dead load against the old use presets (0.20 m homes and hotel, 0.25 m the rest), by use, and the tower's weight.
  if (lv.length && wpr.slabFrom !== 'use') {
    const old = storeyWeights(t, { ...wpr, slabFrom: 'use' }, north)
    const dl = (slab: number, u: StoreyWeight['use']) => slab * GAMMA_C + USE_LOADS[u].sdl + USE_LOADS[u].part
    const byUse = new Map<StoreyWeight['use'], { n: number; now: number; was: number }>()
    for (const l of lv) { const e = byUse.get(l.use) ?? { n: 0, now: 0, was: 0 }; e.n++; e.now += dl(l.slab ?? USE_LOADS[l.use].slab, l.use); e.was += dl(USE_LOADS[l.use].slab, l.use); byUse.set(l.use, e) }
    const uses = [...byUse.entries()].sort((a, b) => (a[0] === 'residential' ? -1 : b[0] === 'residential' ? 1 : b[1].n - a[1].n))
    const pc = (now: number, was: number) => { const x = Math.round((now / was - 1) * 100); return `${x >= 0 ? '+' : ''}${x}%` }
    const [u0, e0] = uses[0]
    const kpa = (v: number) => v.toFixed(1)
    out.push({ id: 'floor-dead-load', label: 'Floor dead load from the span',
      value: `${USES[u0].label.toLowerCase()} dead load ${pc(e0.now, e0.was)} (${kpa(e0.now / e0.n)} against ${kpa(e0.was / e0.n)} kPa); tower weight ${pc(w.total, old.total)}`,
      threshold: 'a reading: the span-based slabs feed the storey weights (Type 2, e/D, sway, density and the frequency)', state: 'unknown', flag: 'unverified', source: { ...ALLEN_IANO, page: 'pp.118–119; Ching p.8' },
      note: `Mean plate dead load (slab × ${GAMMA_C} kN/m³ + superimposed dead load + partitions) on the tower storeys, against the old slab presets (0.20 m homes and hotel, 0.25 m the rest, any span): ${uses.map(([u, e]) => `${USES[u].label.toLowerCase()} ${kpa(e.now / e.n)} against ${kpa(e.was / e.n)} kPa (${pc(e.now, e.was)}, ${e.n} storeys)`).join('; ')}. Seismic weight of the tower ${Math.round(w.total / 1000).toLocaleString('en-CA')} MN against ${Math.round(old.total / 1000).toLocaleString('en-CA')} MN with the old presets.${ring ? ' With the declared column ring the spans past one flat plate are halved.' : ' An interior column ring (columnRing) halves the spans past one flat plate and thins those slabs.'}` })
  }
  return out
}

export const SEISMIC_FALSE_ASSUMPTIONS = [{
  claim: 'Downtown Vancouver design shaking is about Sa(0.2) = 0.85 g (the NBC 2015 / VBBL 2019 value).',
  correction: 'NBC 2020 hazard (NRCan 2020 values) for downtown, site class X450, is about 1.04 g at 0.2 s and 0.43 g at 1.0 s; the new VBBL seismic rules apply from 15 Sep 2026.',
  source: { label: 'NRCan 2020 seismic hazard values, as queried in research P10 (21 Oct 2026); NBC 2020 Commentary J Table J-2' },
}]

/** Suggested outrigger levels at about one half and two thirds of the tower height (precedent practice, team assumption). */
export function suggestOutriggers(t: Tower): number[] {
  const floors = towerFloors(t).filter((f) => !f.podium)
  if (floors.length < 30) return []
  const at = (share: number) => floors.reduce((best, f) => (Math.abs(f.z0 - share * t.height) < Math.abs(best.z0 - share * t.height) ? f : best)).level
  return [...new Set([at(0.5), at(0.67)])]
}
