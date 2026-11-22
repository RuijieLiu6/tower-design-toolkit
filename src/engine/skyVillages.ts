// Green and shared levels up the tower (book node #18, built.sky-villages; NODE_LIST row 18 as upgraded by the Ecocity in
// the Sky note §6, 21 Nov). Two sorted lists of a tower's levels, grade to roof:
//   planted: decks the deck-use input declares planted (Tower.deckUses, matched as engine/sw/decks.ts deckUseOf), open
//     garden storeys of an imported tower (a plate at most half the storeys below and above it, the storey weights' rule in
//     engine/storeyWeight.ts, unless a deck use at that level says otherwise), winter gardens (a part of a storey in use
//     'none', gap G14), declared planters (Tower.planters) and greenwall facade bands (sw/plate.ts STRATS.greenwall);
//     grade starts the list;
//   shared: the podium (the base), civic floors (public rooms), amenity floors (residents' lounges), sky lobbies with
//     shared rooms (the interior's amenity rooms, or the public sky room) and the public stops on the sky room's lifts.
// The gap between neighbouring levels is read in storeys (the level difference) and metres; the largest gap, the bottom
// gap (from grade or the podium) and the top gap (to the roof) are reported, with homes per shared level. Precedent, not a
// rule: Ecocity's 100-storey student schemes put a community floor about every 10 storeys and a sky lobby, refuge and plant
// band about every 25 (Park pp.49, 70–71, 151, 157); VC-PE has six sky gardens about every 30 m and SkyVille about 80 homes
// per village (Al-Kodmany pp.139, 219). Pass up to 25 storeys, Check above: the team's reading of that band. Unverified.
import { DEFAULT_INTERIOR, towerHomes } from './interior'
import { DEFAULT_LIFT_PRESETS, publicStopFloors, type Rise } from './lifts'
import { DECK_MIN_AREA, DECK_MIN_WIDTH, deckUseOf, towerDecks, type Deck } from './sw/decks'
import type { Floor, RuleResult, Source, Tower } from './types'

/** Precedent spacing (storeys): about 10 typical, about 25 at most (Ecocity pp.49, 70–71, 151, 157); a gap over 25 is Check. */
export const GAP_TYPICAL = 10, GAP_MAX = 25
/** The precedent schemes' height (storeys): beyond it the reading needs a specialist. */
export const PRECEDENT_STOREYS = 100
/** SkyVille: about 80 homes per village (Placemaking p.219), shown beside homes per shared level. */
export const SKYVILLE_HOMES = 80

export const SKY_VILLAGE_SOURCES = {
  eco: { label: 'Park, Designing the Ecocity-in-the-Sky: The Seoul Workshop (Images Publishing): 100-storey student schemes with a community floor about every 10 storeys and a sky lobby, refuge and plant band about every 25 (precedent)', page: 'pp.49, 70–71, 151, 157' },
  pm: { label: 'Al-Kodmany, Placemaking with Tall Buildings (Routledge 2026): six sky gardens about every 30 m in the VC-PE tower; SkyVille about 80 homes per village (precedent)', page: 'pp.139, 219' },
} satisfies Record<string, Source>

/** A level in one of the lists: its storey level, height above grade (m) and what makes it planted or shared. */
export interface Mark { level: number; z: number; what: string[] }
export interface Gap { from: Mark; to: Mark; storeys: number; m: number }
export interface LevelList {
  /** The levels above the start, bottom-up. */
  marks: Mark[]
  start: Mark
  roof: Mark
  gaps: Gap[]
  largest: Gap | null
  bottom: Gap | null
  top: Gap | null
}

function add(map: Map<number, Mark>, level: number, z: number, what: string) {
  const m = map.get(level)
  if (!m) map.set(level, { level, z, what: [what] })
  else if (!m.what.includes(what)) m.what.push(what)
}

/** The gaps from the start through the levels above it to the roof. */
export function gapsOf(start: Mark, marks: Mark[], roof: Mark): LevelList {
  const above = marks.filter((m) => m.level > start.level).sort((a, b) => a.level - b.level)
  const seq = [start, ...above]
  if (seq[seq.length - 1].level < roof.level) seq.push(roof)
  const gaps = seq.slice(1).map((b, i) => ({ from: seq[i], to: b, storeys: b.level - seq[i].level, m: b.z - seq[i].z }))
  const largest = gaps.reduce<Gap | null>((g, x) => (!g || x.storeys > g.storeys || (x.storeys === g.storeys && x.m > g.m) ? x : g), null)
  return { marks: above, start, roof, gaps, largest, bottom: gaps[0] ?? null, top: gaps[gaps.length - 1] ?? null }
}

export interface PlantedRead { list: LevelList; decks: Deck[]; unmatched: number[] }

/** The planted levels of a tower (see the header). `north`: true north clockwise from the project frame's +y. */
export function plantedLevels(t: Tower, floors: Floor[], north: number, decks: Deck[] = towerDecks(t, north)): PlantedRead {
  const map = new Map<number, Mark>()
  // Decks the deck-use input declares planted.
  const planted = new Set<number>()
  for (const d of decks) if (deckUseOf(t, d)?.use === 'planted') { add(map, d.level, d.z, 'planted deck'); planted.add(d.level) }
  const unmatched = [...new Set((t.deckUses ?? []).filter((u) => u?.use === 'planted' && !planted.has(u.level)).map((u) => u.level))].sort((a, b) => a - b)
  // Open garden storeys of an imported tower, unless a deck use for the whole level says what else it is.
  const whole = (level: number) => (t.deckUses ?? []).find((u) => u && u.level === level && (u.facing == null || u.facing.trim() === ''))
  if (t.imported) floors.forEach((f, i) => {
    if (f.podium || i === 0 || i === floors.length - 1) return
    if (f.area > 0.5 * floors[i - 1].area || f.area > 0.5 * floors[i + 1].area) return
    const u = whole(f.level)
    if (!u || u.use === 'planted') add(map, f.level, f.z0, 'open garden storey')
  })
  // Winter gardens: parts of a storey in use 'none' (enclosed, unheated).
  for (const f of floors) if ((f.useAreas ?? []).some((u) => u.use === 'none' && u.area > 0)) add(map, f.level, f.z0, 'winter garden')
  // Declared planters and greenwall bands, on each storey they cover.
  for (const p of t.planters ?? []) {
    if (!p || !(p.length > 0) || !(p.width > 0)) continue
    const to = p.to != null && Number.isFinite(p.to) ? Math.max(p.level, p.to) : p.level
    for (const f of floors) if (f.level >= p.level && f.level <= to) add(map, f.level, f.z0, 'planter')
  }
  for (const zn of t.facadeZones ?? []) {
    if (zn.strat !== 'greenwall') continue
    for (const f of floors) if (f.level >= zn.from && f.level <= zn.to) add(map, f.level, f.z0, 'green wall')
  }
  const last = floors[floors.length - 1]
  const start: Mark = { level: floors[0]?.level ?? 1, z: 0, what: ['grade'] }
  const roof: Mark = { level: (last?.level ?? 0) + 1, z: last?.z1 ?? 0, what: ['roof'] }
  return { list: gapsOf(start, [...map.values()], roof), decks, unmatched }
}

/** The shared levels of a tower (see the header); the list starts at the podium's top storey (else grade). */
export function sharedLevels(t: Tower, floors: Floor[]): LevelList {
  const map = new Map<number, Mark>()
  const rooms = (t.interior ?? DEFAULT_INTERIOR).amenity.some((a) => a.share > 0)
  const roomLevel = t.skyRoom && floors.some((f) => f.skyLobby && f.level === t.skyRoom!.level) ? t.skyRoom.level : null
  for (const f of floors) {
    if (f.podium || f.z0 <= 0.5) continue
    if (f.level === roomLevel) add(map, f.level, f.z0, 'sky room')
    else if (f.skyLobby && rooms) add(map, f.level, f.z0, 'sky lobby')
    if (f.use === 'civic') add(map, f.level, f.z0, 'civic')
    if (f.use === 'amenity' && !f.skyLobby) add(map, f.level, f.z0, 'amenity')
  }
  for (const s of publicStopFloors(t, floors)) add(map, s.floor.level, s.floor.z0, 'public stop')
  const podium = floors.filter((f) => f.podium)
  const top = podium[podium.length - 1]
  const last = floors[floors.length - 1]
  const start: Mark = top ? { level: top.level, z: top.z0, what: ['podium'] } : { level: floors[0]?.level ?? 1, z: 0, what: ['grade'] }
  const roof: Mark = { level: (last?.level ?? 0) + 1, z: last?.z1 ?? 0, what: ['roof'] }
  return gapsOf(start, [...map.values()], roof)
}

// --- the lines -----------------------------------------------------------------------------------------------------
const name = (m: Mark) => (m.what[0] === 'grade' ? 'grade' : m.what[0] === 'roof' ? 'roof' : m.what[0] === 'podium' ? `podium top L${m.level}` : `L${m.level}`)
const gapText = (g: Gap) => `${g.storeys} storey${g.storeys === 1 ? '' : 's'} (${name(g.from)} → ${name(g.to)}, ${Math.round(g.m)} m)`
const SHORT: Record<string, string> = { 'planted deck': 'deck', 'open garden storey': 'garden storey' }
/** Levels as runs: consecutive levels with the same words share one entry ("L25–26 sky lobby"). At most 10 runs. */
function runsText(marks: Mark[]): string {
  const runs: { a: number; b: number; w: string }[] = []
  for (const m of marks) {
    const w = m.what.map((x) => SHORT[x] ?? x).join(' + ')
    const r = runs[runs.length - 1]
    if (r && r.b === m.level - 1 && r.w === w) r.b = m.level
    else runs.push({ a: m.level, b: m.level, w })
  }
  const txt = runs.map((r) => `L${r.a}${r.b > r.a ? `–${r.b}` : ''} ${r.w}`)
  return txt.length > 10 ? `${txt.slice(0, 10).join(', ')}, +${txt.length - 10} more` : txt.join(', ')
}
const m2 = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`

export interface SkyVillagesResult { planted: LevelList; shared: LevelList; homes: number; rules: RuleResult[] }

export interface SkyVillageOptions {
  /** True north, degrees clockwise from the project frame's +y (deck facings in the deck-use input). */
  north?: number
  /**
   * The lift plan's rises (engine/lifts.ts liftCheck): which floors each group stops at and whose floors ride it. With
   * them, a shared level counts for the homes only where the homes' lifts (or the public lifts) stop (tool cycle 11).
   */
  rises?: LiftReach[]
  /** Home size for the homes count where the interior has no layout (lift presets' `homeM2`). */
  homeM2?: number
}

/** What the reach reading needs from a lift rise. */
export type LiftReach = Pick<Rise, 'id' | 'label' | 'cls' | 'floors' | 'base' | 'riders'>

/** Who reaches a level by lift: the uses of the floors whose people ride a group that stops there, and 'public' for public lifts. */
export function reachAt(rises: LiftReach[], level: number): Set<string> {
  const who = new Set<string>()
  for (const r of rises) {
    const stops = r.floors.some((f) => f.level === level) || r.base?.level === level
    if (!stops) continue
    if (r.cls === 'public') who.add('public')
    for (const f of r.riders) if (f.level !== level) who.add(f.use)
  }
  return who
}
const homesReach = (who: Set<string>) => who.has('residential') || who.has('public')
const WHO: Record<string, string> = { office: 'office', hotel: 'hotel', residential: 'homes', retail: 'retail', amenity: 'amenity', civic: 'civic', public: 'public' }
const whoText = (who: Set<string>) => (who.size ? `${[...who].filter((w) => w !== 'mechanical').map((w) => WHO[w] ?? w).join(' and ')} lifts only` : 'no lift stops there')

export function skyVillages(t: Tower, floors: Floor[], o: SkyVillageOptions = {}): SkyVillagesResult {
  const p = plantedLevels(t, floors, o.north ?? 0)
  const shared = sharedLevels(t, floors)
  const homes = towerHomes(t, floors, o.homeM2 ?? DEFAULT_LIFT_PRESETS.homeM2)
  const rules: RuleResult[] = []
  const threshold = `≤ ${GAP_MAX} storeys between levels (precedent: about every ${GAP_TYPICAL}, about ${GAP_MAX} at most)`
  const specialist = floors.length > PRECEDENT_STOREYS ? `${floors.length} storeys: taller than the precedent schemes (${PRECEDENT_STOREYS} storeys), so the spacing band is stretched past its source` : undefined
  const state = (g: Gap | null) => (g && g.storeys > GAP_MAX ? 'warn' as const : 'pass' as const)
  const ends = (l: LevelList) => (l.bottom && l.top && l.gaps.length > 1 ? `; bottom ${l.bottom.storeys}, top ${l.top.storeys} storeys` : '')
  const within = (g: Gap | null) => (g && g.storeys <= GAP_TYPICAL + 2 ? ' (about the precedent’s 10)' : '')
  const precedent = `Precedent, not a rule: the Ecocity schemes are 100-storey student projects, never built (Park pp.49, 70–71, 151, 157); VC-PE’s six sky gardens sit about 30 m apart (Al-Kodmany p.139). Pass up to ${GAP_MAX} storeys and Check above is the team’s reading of that band; values read once (unverified).`

  // Planted levels.
  const pl = p.list
  if (!floors.length) {
    rules.push({ id: 'sv-planted', label: 'Planted levels up the tower: largest gap', value: 'no storeys in this tower', threshold, state: 'unknown', flag: 'unresolved', source: SKY_VILLAGE_SOURCES.eco })
    return { planted: pl, shared, homes, rules }
  }
  // Decks in the largest planted gap that the deck-use input does not plant: where a planted level could go.
  const g = pl.largest
  // Decks on shared levels first (a typed garden or ring there is the likeliest planted level), then the largest.
  const onShared = new Set(shared.marks.map((m) => m.level))
  const free = (g ? p.decks.filter((d) => d.level > g.from.level && d.level < g.to.level && deckUseOf(t, d)?.use !== 'planted') : [])
    .sort((a, b) => Number(onShared.has(b.level)) - Number(onShared.has(a.level)) || (onShared.has(a.level) ? a.level - b.level : b.area - a.area))
  const freeText = free.length ? ` Decks in that gap not declared planted: ${free.slice(0, 6).map((d) => { const u = deckUseOf(t, d); return `L${d.level} +${Math.round(d.z)} m ${m2(d.area)}${onShared.has(d.level) ? ', a shared level' : ''} (${u ? `declared ${u.use}` : 'no deck use: occupied'})` }).join(', ')}${free.length > 6 ? `, +${free.length - 6} more` : ''}; declare one planted (Tower › deck use) to count it.` : ''
  const unmatchedText = p.unmatched.length ? ` Declared planted but no deck found there (under ${DECK_MIN_AREA} m² or ${DECK_MIN_WIDTH} m wide, or no setback there): L${p.unmatched.join(', L')}.` : ''
  rules.push({
    id: 'sv-planted', label: 'Planted levels up the tower: largest gap',
    value: pl.marks.length ? `grade, ${runsText(pl.marks)}: largest gap ${gapText(g!)}${within(g)}${ends(pl)}` : `no planted level above grade: grade → roof, ${g!.storeys} storeys (${Math.round(g!.m)} m)`,
    threshold, state: state(g), flag: 'unverified', source: SKY_VILLAGE_SOURCES.eco,
    ...(specialist ? { specialist } : {}),
    note: `Planted levels: decks the deck-use input declares planted, open garden storeys of an imported tower (a plate at most half the storeys below and above it), winter gardens (a part of a storey in use none), declared planters and greenwall facade bands; grade starts the count (planting at grade is read by the Green claims check). Gaps are level differences.${freeText}${unmatchedText} ${precedent}`,
  })

  // Shared levels.
  const sg = shared.largest
  rules.push({
    id: 'sv-shared', label: 'Shared levels up the tower: largest gap',
    value: `${shared.start.what[0] === 'podium' ? `podium to L${shared.start.level}` : 'grade'}${shared.marks.length ? `, ${runsText(shared.marks)}` : ''}: largest gap ${gapText(sg!)}${within(sg)}${ends(shared)}${shared.marks.length ? '' : '; no shared level above the base'}`,
    threshold, state: state(sg), flag: 'unverified', source: SKY_VILLAGE_SOURCES.eco,
    ...(specialist ? { specialist } : {}),
    note: `Shared levels: the podium (the base), civic floors (public rooms), amenity floors (residents’ lounges), sky lobbies with shared rooms (the interior’s amenity rooms${(t.interior ?? DEFAULT_INTERIOR).amenity.some((a) => a.share > 0) ? '' : ': none set, so plain sky lobbies do not count'}; the public sky room) and the public stops on the sky room’s lifts. The schemes pair a sky lobby with refuge and plant about every 25 storeys (Park p.49). ${precedent}`,
  })

  // Shared levels by who can reach them (tool cycle 11, review R6-6): only where the homes' lifts or the public lifts stop.
  const reach = o.rises ? new Map(shared.marks.map((m) => [m.level, reachAt(o.rises!, m.level)])) : null
  const forHomes = reach ? shared.marks.filter((m) => homesReach(reach.get(m.level)!)) : shared.marks
  const notHomes = reach ? shared.marks.filter((m) => !homesReach(reach.get(m.level)!)) : []
  if (reach && homes > 0) {
    // The homes' gaps are measured over the storeys the homes occupy: from the last reached level at or below the lowest
    // home storey to the first at or above the highest (else the base and the roof), so office storeys below do not count.
    const homeLv = floors.filter((f) => !f.podium && f.use === 'residential').map((f) => f.level)
    const lo = homeLv.length ? Math.min(...homeLv) : null, hi = homeLv.length ? Math.max(...homeLv) : null
    const below = lo === null ? [] : forHomes.filter((m) => m.level <= lo)
    const above = hi === null ? [] : forHomes.filter((m) => m.level >= hi)
    const from0 = below.length ? below[below.length - 1] : shared.start
    const to0 = above.length ? above[0] : shared.roof
    // clipped to the homes' own storeys: no reached level within a storey of the homes' ends → the end home storey itself
    const fl = (lv: number) => floors.find((f) => f.level === lv)
    const from: Mark = lo !== null && from0.level < lo - 1 ? { level: lo, z: fl(lo)?.z0 ?? from0.z, what: ['lowest home storey'] } : from0
    const to: Mark = hi !== null && to0.level > hi + 1 ? { level: hi + 1, z: fl(hi)?.z1 ?? to0.z, what: ['above the highest home storey'] } : to0
    const rg = lo === null ? null : gapsOf(from, forHomes.filter((m) => m.level > from.level && m.level < to.level), to).largest
    const lounge = notHomes.filter((m) => m.what.includes('amenity'))
    const st = lounge.length || (rg && rg.storeys > GAP_MAX) ? 'warn' as const : 'pass' as const
    rules.push({
      id: 'sv-reach', label: 'Shared levels the homes’ lifts reach',
      value: `${forHomes.length} of ${shared.marks.length} shared levels above the base${rg ? `; the homes’ largest gap ${gapText(rg)} (homes L${lo}–L${hi})` : ''}${notHomes.length ? `; not from the homes: ${notHomes.slice(0, 5).map((m) => `L${m.level} ${m.what[0]} (${whoText(reach.get(m.level)!)})`).join(', ')}${notHomes.length > 5 ? `, +${notHomes.length - 5} more` : ''}` : ''}`,
      threshold: `a residents’ lounge reached by the homes’ lifts; the homes’ shared levels ≤ ${GAP_MAX} storeys apart (precedent)`,
      state: st, flag: 'team_assumption',
      source: { label: 'The toolkit’s lift plan (engine/lifts.ts: each group’s stops and the floors that ride it); team rule, with the Ecocity spacing band (precedent)' },
      ...(specialist ? { specialist } : {}),
      note: `A shared level counts for the homes where a lift group that the homes ride stops (a shuttle at its sky lobby, a local group at its floors), or where the public lifts stop (the sky room and its public stops), since residents can take those from the street. ${lounge.length ? `An amenity floor (a residents’ lounge by its use) that only other lifts reach: ${lounge.map((m) => `L${m.level}`).join(', ')}. ` : ''}The homes’ gap is measured over the storeys the homes occupy (the office or hotel storeys below or above them do not count). Stairs between floors are not counted as reach. Homes per shared level counts only these levels.`,
    })
  }

  // Homes per shared level.
  if (homes > 0) {
    const n = forHomes.length
    rules.push({
      id: 'sv-homes', label: 'Homes per shared level',
      value: n ? `about ${Math.round(homes).toLocaleString('en-CA')} homes over ${n} shared level${n > 1 ? 's' : ''} above the base: about ${Math.round(homes / n)} per level` : `about ${Math.round(homes).toLocaleString('en-CA')} homes and no shared level above the base`,
      threshold: `reported beside SkyVille, about ${SKYVILLE_HOMES} homes per village (precedent); Check only with no shared level above the base`,
      state: n ? 'pass' : 'warn', flag: 'unverified', source: SKY_VILLAGE_SOURCES.pm,
      ...(specialist ? { specialist } : {}),
      note: (reach ? `Shared levels the homes’ lifts reach only (${notHomes.length ? `${notHomes.length} other${notHomes.length > 1 ? 's' : ''} left out` : 'all of them'}). ` : '') + 'Homes as the lift check counts them (the interior layout, else floor area ÷ home size). Every shared level above the base is counted for every home, wherever it sits in the stack, and office or hotel floors are not netted out: a first reading. SkyVille is about 960 homes in three 47-storey towers (Al-Kodmany p.219); a precedent, not a target.',
    })
  }
  return { planted: pl, shared, homes, rules }
}
