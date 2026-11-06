// Pass or fail, and what to do about it (Ruijie, 6 Nov: "use icons and symbols to simplify the right side analysis
// result and turn them into pass or fail as well as instructions on fixing them"). Each result line of a check becomes a
// row with a state and, when it does not pass, one instruction naming the move and where it is made in the Toolkit.
// The instructions are the team's reading of each rule (they say which control changes the result); they never change
// a threshold, and the rule, its source and its evidence flag stay one click away under Details.
import type { RuleState } from '../engine/types'
import type { ConeCheck } from '../engine/viewCones'

export interface CheckRow {
  id: string
  state: RuleState
  title: string
  /** The number that decides it, short. */
  value: string
  /** What to change, when it does not pass; null when it passes or nothing in the design can change it. */
  fix: string | null
  flag: string
}

/** Instructions by rule (the rule id without its tower suffix), first match wins. */
const FIXES: [RegExp, string | ((state: RuleState) => string)][] = [
  // Competition rules (VTC brief)
  [/^height/, 'Bring the top into the brief\'s 244–305 m band: change Height in Massing (Form step).'],
  [/^containment$/, 'Keep the whole tower and podium inside the block: move it (Place on map) or shrink the podium in Massing.'],
  // A warning here passes on the reading in use but not on every reading of the brief (which uses count).
  [/^fsr-nonres$/, (st) => (st === 'warn' ? 'Passes on this reading of the brief but not on the strictest (office only): add office floor area to pass on every reading, or confirm the reading with Buildner.' : 'Add non-residential floor area (office, hotel, retail, civic) in Program until it reaches FSR 9.0.')],
  [/^transit$/, 'Turn on the transit link to the station (Program step › Ground & public realm).'],
  [/^vertical-public$/, 'Carry public uses up the tower: a public sky room (Schematic) or civic floors in Program.'],
  // Core & lifts
  [/^rise-floors/, 'Split the tower into more lift rises, or add a sky lobby (Schematic › Core & floors).'],
  [/^rise-/, 'Add cars to this rise, or start the upper rises at a sky lobby (Schematic › Core & floors).'],
  [/^core-fit/, 'Turn on "Size to the lifts", or raise the core share (Schematic › Core & floors).'],
  [/^ntg/, 'Win back net area: a sky lobby (fewer shafts low down), a smaller core, or a larger plate.'],
  [/^firefighter/, 'Give firefighters a lift that reaches the top in about a minute with one change at most (a sky-lobby shuttle).'],
  [/^stretcher/, 'Make one car in each group stretcher-sized.'],
  [/^seismic/, 'Keep the core walls continuous down to the foundation; confirm with a structural engineer.'],
  // Egress & stairs
  [/^stair-width/, 'Widen the exit stairs or add one (Schematic › Exit stairs), or lower the busiest floor\'s occupant load.'],
  [/^exits/, 'Add an exit stair so every floor has at least two (Schematic › Exit stairs).'],
  [/^separation/, 'Move the stairs apart: try "Core + edge" or "At the edges" (Schematic › Exit stairs).'],
  [/^travel-podium/, 'Give the podium its own exits closer to its far corners.'],
  [/^travel/, 'Shorten the walk to an exit: add a stair, or place stairs at the edges (Schematic › Exit stairs).'],
  [/^podium-exits/, 'Give the podium its own exit stairs.'],
  [/^flight/, 'Keep each flight under 3.7 m of rise: add a landing or lower the floor-to-floor.'],
  // Public sky room
  [/^skyroom-lifts/, 'Give visitors their own lifts, or a larger shuttle (Schematic › Sky lobbies › Public sky room).'],
  [/^skyroom-exits/, 'Post a visitor limit (it suggests one) or widen the stairs.'],
  [/^skyroom-stepfree/, 'Keep a spare step-free car for visitors.'],
  [/^skyroom-security/, 'Separate the visitor route from the tenants\' lifts and floors.'],
  [/^skyroom-(share|amenity)/, 'Open more of the sky room to the public, or add a second public level.'],
  [/^skyroom-none/, 'Open a sky lobby to the public (Schematic › Sky lobbies).'],
  [/^skyroom-access/, 'Make the room free to enter and open daily hours.'],
  // Public realm (draft Central Downtown Design Guidelines)
  [/^pr-(active|share)/, 'Line more of this street with shops and entrances (Program step › Ground & public realm).'],
  [/^pr-entrances/, 'Add entrances along this street, about every 8–12 m.'],
  [/^pr-canopy$/, 'Extend weather protection along the frontage.'],
  [/^pr-ground-height$/, 'Make the ground storey 4.6–6.1 m tall (the podium block\'s height in Massing).'],
  [/^pr-open-share$/, 'Free more ground: a smaller podium footprint, or a plaza.'],
  [/^pr-pops/, 'Add publicly open space (POPS) of at least a tenth of the site, in a usable shape.'],
  [/^pr-transit-plaza$/, 'Leave a 6.1 m plaza at the station corner.'],
  [/^pr-link/, 'Keep a mid-block link at least 9.1 m wide, open to the sky and secured for public use.'],
  [/^pr-separation/, 'Move the towers further apart (the separation lines in the view show by how much).'],
  [/^pr-plate/, 'Reduce the tower floorplate (width × depth in Massing).'],
  [/^pr-dim/, 'Keep the tower\'s longest side within 29 m (Massing).'],
  [/^pr-slender/, 'Make the tower more slender: a narrower plate, or taller.'],
  [/^pr-stepback$/, 'Step the tower back from the streetwall (move or narrow the tower block).'],
  [/^pr-(podium|continuity)/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  [/^(north|south|east|west)$/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  [/^pr-variation$/, 'Vary the tower heights.'],
  [/^pr-sun$/, 'Switch on Solar access & sun hours to test the shadow on public space.'],
  [/^pr-wind$/, 'Switch on the pedestrian wind screen; a wind tunnel study settles it.'],
]

/** The instruction for a rule that does not pass, or null when it passes. `key` is the rule id without its tower suffix. */
export function fixFor(key: string, state: RuleState, value: string, threshold?: string, flag?: string): string | null {
  if (state === 'pass') return null
  for (const [re, text] of FIXES) if (re.test(key)) return typeof text === 'function' ? text(state) : text
  if (flag === 'unresolved') return 'The sources leave this open: a person has to decide it (see Details).'
  if (state === 'unknown') return 'Not computed for this design yet (see Details for what it needs).'
  return threshold ? `Needs ${threshold}; now ${value}.` : 'See Details for the rule and its source.'
}

/** A rule id without the tower it was computed for ("stair-width-t1" with tower "t1" → "stair-width"). */
export const ruleKey = (ruleId: string, towerId: string) => (towerId && ruleId.endsWith(`-${towerId}`) ? ruleId.slice(0, -(towerId.length + 1)) : ruleId)

const fmt = (v: number, d = 1) => v.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })

/** View cones as rows: one per cone the tower enters (the cones it misses are counted, not listed). */
export function coneRows(towerId: string, towerName: string, checks: ConeCheck[], topZ: number): { rows: CheckRow[]; outside: number } {
  const rows: CheckRow[] = []
  let outside = 0
  for (const c of checks) {
    if (c.state === 'outside') { outside++; continue }
    const name = `${c.cone.id} · ${c.cone.name}`
    const id = `cone:${towerId}:${c.cone.id}`
    const flag = String(c.param?.flag ?? 'unverified')
    if (c.state === 'above' && c.limit != null && c.exceed != null) {
      rows.push({ id, state: 'fail', title: name, value: `${fmt(c.exceed)} m above`, flag,
        fix: `Lower ${towerName}'s top by ${fmt(c.exceed)} m (to ${fmt(c.limit)} m geodetic), or move it out of this view (Place on map).` })
    } else if (c.state === 'within_uncertainty' && c.limit != null) {
      rows.push({ id, state: 'warn', title: name, value: `within ±${c.param?.u95 ?? 0} m of the limit`, flag,
        fix: `Keep the top a little lower, below ${fmt(c.limit - (c.param?.u95 ?? 0))} m geodetic, to clear the estimate's margin.` })
    } else if (c.state === 'limit_unknown') {
      rows.push({ id, state: 'unknown', title: name, value: 'no City height estimate', flag: 'unresolved',
        fix: 'The City publishes no height for this view here: ask the City (Request 0), or move the tower out of the cone.' })
    } else {
      rows.push({ id, state: 'pass', title: name, value: c.limit != null ? `${fmt(c.limit - topZ)} m below the limit` : 'clear', flag, fix: null })
    }
  }
  return { rows, outside }
}

export const STATE_WORD: Record<RuleState, string> = { pass: 'Pass', fail: 'Fail', warn: 'Check', unknown: 'Unknown' }
const RANK: Record<RuleState, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 }
export const byState = (a: CheckRow, b: CheckRow) => RANK[a.state] - RANK[b.state]
