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
const FIXES: [RegExp, string | ((state: RuleState, value: string) => string)][] = [
  // Competition rules (VTC brief)
  // Exactly the brief's height rule: "height-60" (wind procedure) once matched here and, on Real Vancouver, told people to
  // bring the top into the competition band (node audit, 7 Nov).
  [/^height$/, 'Bring the top into the brief\'s 244–305 m band: change Height in Massing (Form step).'],
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
  // Exactly the lift check's seismic line: "seismic-category" (structure) once matched here too (node audit, 7 Nov).
  // The lift check's seismic line is "not assessed" (CSA B44-16's seismic clause unread): it names who decides (node audit, 7 Nov).
  [/^seismic$/, 'Not assessed here: a vertical-transportation consultant sets the seismic, rope-sway and stack-effect measures (CSA B44-16).'],
  // Structure: system & seismic (NBC 4.1.8); each restates its rule's threshold or note.
  [/^seismic-category$/, 'Every tower here is Seismic Category SC4: choose a lateral system listed without an SC4 height cap (Details lists them) with the structural engineer.'],
  [/^dynamic$/, 'A dynamic analysis is required: the structural engineer runs it (base shear at least 0.8 V if regular, 1.0 V if irregular).'],
  [/^weight$/, 'One storey weighs over 150% of the next (usually the podium-to-tower step): step the podium in, or carry it as an irregularity in the dynamic analysis.'],
  [/^core-ratio$/, 'Trim the core (Schematic › Core & floors) or enlarge the plate.'],
  [/^continuity$/, 'Model the core in the imported massing, or confirm with the engineer that the core walls run to the foundation.'],
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
  // Node audit (7 Nov): "pr-share" is the tower's width against the frontage, not active frontage share; it had the
  // active-frontage instruction.
  [/^pr-share/, 'Narrow the tower so it spans less than about 60% of the frontage it faces, or turn it (Massing).'],
  [/^pr-crossings$/, 'Move driveways and loading off the retail high street and arterial, to the local streets (Program step › Ground & public realm).'],
  [/^pr-station$/, 'Give the station entrance at least one lift and one stair (Program step › Ground & public realm).'],
  [/^pr-station-active$/, 'Line the below-grade link with active uses and open a view to the concourse (Program step › Ground & public realm).'],
  [/^pr-active/,'Line more of this street with shops and entrances (Program step › Ground & public realm).'],
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
  // Node audit (7 Nov): continuity is how much of the podium face sits on the property line, not its height.
  [/^pr-continuity/, 'Bring the podium face to the property line along more of this street (move or widen the podium block in Massing).'],
  [/^pr-podium/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  [/^(north|south|east|west)$/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  // Node audit (7 Nov): this said "Vary the tower heights", but S2.2.1 asks for plane changes along the street.
  [/^pr-variation$/, 'Break the long facade with a step of 1.5 m or more at least every 45.7 m (stacked blocks in Massing), and show it on the boards.'],
  [/^pr-streets-frontage$/, 'The study site’s street types are not in the Toolkit yet: the street lines run on the competition site.'],
  [/^pr-streets-ground$/, 'The study site’s streets and station entrance are not in the Toolkit yet: these lines run on the competition site.'],
  [/^pr-streets$/, 'Street types and widths for Real Vancouver sites are not in the Toolkit yet: the street rules run on the competition site.'],
  [/^pr-sun$/, (_st, v) => (/^Switch on/.test(v) ? 'Switch on Solar access & sun hours to test the shadow on public space.'
    : 'Open Solar access & sun hours to see which spaces get new shadow; moving, turning or slimming the tower changes it.')],
  [/^pr-wind$/, (_st, v) => (/^Switch on/.test(v) ? 'Switch on the pedestrian wind screen; a wind tunnel study settles it.'
    : 'Open Pedestrian wind: massing screen to see where: a podium step or canopy under the windward face and softer corners lower its risk; a wind tunnel study settles it.')],
  // Relaxations & aviation (research C01-M06; node audit 7 Nov: the generic "Needs …; now …" read as broken English).
  // Each instruction restates the rule's own note; none adds a threshold.
  [/^relax-limit/, 'Lower the top under the lowest binding cone (View-cone height check says by how much), move the tower out of the cone (Place on map), or, if the site may use a relaxation route, switch it on under Details › Relaxations to see the limit with it.'],
  [/^relax-hbp/, 'Switch on the Higher Buildings Policy route under Details › Relaxations to see the limit with it. Whether this site lies in the policy’s Figure 1 area is for the City to confirm.'],
  [/^relax-eds/, (st) => (st === 'fail' ? 'Only a site of 8,000 m² or more may use this route: a larger study site (Site step), or another route.'
    : st === 'unknown' ? 'Choose a study site in the Site step, or type the parcel area under Details › Relaxations, to test the 8,000 m² size.'
    : 'The site is large enough: switch the route on under Details › Relaxations; the views to the Lions still bind.')],
  [/^relax-no-route/, 'These views bind whatever route is used: keep the top under them, or move the tower out of them (Place on map).'],
  [/^car-150/, 'Over 150 m every tower is an aviation obstacle: give notice to Transport Canada (CAR 601.24) and plan marking and lighting to Standard 621.'],
  [/^car-90-6km/, 'Near an aerodrome a tower over 90 m is an obstacle: give notice (CAR 601.24), and confirm the aerodrome positions in the Canada Flight Supplement.'],
  [/^car-notice/, 'For a real site, submit the aeronautical assessment form (26-0427) to Transport Canada.'],
  [/^ac-601-007/, 'The tower rises above the notification surface: submit the aeronautical assessment form (AC 601-007).'],
  [/^car-vfr/, 'VFR route charts are not machine-readable here: check them with Transport Canada for a real site.'],
  [/^car-ols/, 'No obstacle limitation surface is published downtown: ask the City for the NAV CANADA height layer it reportedly holds.'],
  // Wind procedure and study (NBC 4.1.7; analog cities): each restates its rule's note.
  [/^height-60$/, 'Over 60 m the code sends the tower to the Dynamic or Wind Tunnel Procedure: brief the structural and wind engineers early.'],
  [/^aspect$/, (st) => (st === 'fail' ? 'Over 6 : 1 with occupants the code asks for a wind tunnel test: widen the effective width (plate or base), or plan the test.' : 'Between 4 and 6 : 1 the tower is dynamically sensitive: the Dynamic Procedure applies.')],
  [/^across-wind$/, 'Across-wind motion governs at this proportion: the wind engineer checks accelerations; corner softening, tapering or setbacks are the usual shape moves.'],
  [/^f1$/, (st) => (st === 'fail' ? 'Ask the structural engineer for the model frequency (enter it under Details); without it, towers of 180 m or more go to the tunnel (team default).' : 'Enter the engineer’s model frequency under Details: the code’s seismic period is not a wind frequency.')],
  [/^super-slender$/, 'Very slender: expect tuned mass dampers, shaping or windbreak floors (precedent, no sourced threshold); a wider base lowers it.'],
  [/^trigger-/, 'Plan a wind study at the level this analog city asks for; Vancouver has no numeric trigger, and a wind engineer sets the scope.'],
  // Code & life safety (VBBL 2019 3.2.6, 3.2.7, 3.8): obligations a high building carries, each as the move to make.
  [/^high-building$/, 'All of 3.2.6 applies above 18 m: plan stair venting, smoke control, the firefighter lift, the central alarm room and voice communication with the code consultant.'],
  [/^stair-vent$/, 'Give each exit stair a vent at its bottom of at least the area shown.'],
  [/^corridor-air$/, 'Keep the make-up air to residential and hotel corridors running when the alarm sounds (mechanical engineer).'],
  [/^connected$/, 'Treat the transit link as a connected building: a smoke measure at the link, a 1 h separation, and doors or travel limits (see Details).'],
  [/^below-exit-stairs$/, 'Keep the stairs that continue below the lowest exit level smoke-free (3.2.6.2.(2)).'],
  [/^shafts-below$/, 'Record a vestibule, seal or vent for each lift and service shaft that continues below grade.'],
  [/^central-alarm$/, 'Place the central alarm and control room by the fire-department entrance.'],
  [/^conductors$/, 'Keep a protected riser for the emergency, fire-pump and alarm conductors (1 h; smoke management 2 h).'],
  [/^radio$/, 'Plan the firefighters’ radio system: an equipment room and a communications riser.'],
  [/^emergency-power$/, 'Size the generator for at least 2 h at full load for every listed load (electrical engineer).'],
  [/^plant-floors$/, 'Add plant floors: the button under Details puts one every few floors, or set "Plant floor every N tower floors" (Schematic › Core & floors).'],
  [/^bf-route$/, 'Give every occupied floor a passenger lift stop, the podium floors included (with the lift consultant).'],
  [/^bf-redundancy$/, 'Give each lift group a second accessible car (Schematic › Core & floors).'],
  [/^bf-transit$/, 'Show a step-free route from the station link to the lifts.'],
  [/^bf-entrances$/, 'Make the principal entrance and at least half the pedestrian entrances barrier-free.'],
  [/^bf-power-doors$/, 'Give every hotel and commercial entrance a power door operator.'],
  [/^bf-washroom$/, 'Add a universal washroom on the entrance storey, sized to 3.8.3.12.'],
  [/^bf-tactile$/, 'Place tactile walking-surface indicators at every location 3.8.2.10.(3) lists (see Details).'],
  [/^bf-hotel$/, 'Plan the accessible hotel rooms and the rooms with visual alarms shown.'],
  [/^bf-adaptable$/, 'Design every home to the adaptable dwelling standard (3.8.5).'],
  // Egress, ground plane, interior, daylight, mobility (node audit sweep, 7 Nov: the warnings left on the generic text).
  [/^stair-driver$/, 'Lower that floor’s occupant load (a posted limit, or seats instead of standing room), or widen the stairs from there down (Schematic › Exit stairs).'],
  [/^pr-perimeter$/, 'Add or move the mid-block link (Program step › Ground & public realm) so no block side runs over about 100 m without a public route.'],
  [/^in-feed$/, 'Once the unit mix is chosen, switch on "Use this layout for lifts, egress and economics" (Interior & activity programme).'],
  [/^in-keys$/, 'The hotel band is deeper than a room: a wider corridor, a deeper core or a slimmer plate tightens it (Massing, Schematic).'],
  [/^in-lease$/, 'Bring the core closer to the glass: a slimmer plate or a larger core (Massing, Schematic).'],
  [/^dl-.*-(depth|share)$/, 'Bring more floor within daylight reach: a slimmer plate (width × depth in Massing), a smaller core, or a taller floor-to-floor (it raises the window head).'],
  [/^dl-.*-limit$/, 'Bring L/W + L/H under the limit: a shallower plate or a taller floor-to-floor (Massing).'],
  [/^mob-transit$/, 'Turn on the transit link to the station (Program step › Ground & public realm).'],
  [/^rain-(detention|first-stage)$/, 'Answer the rainwater pathway under Details: the volume shown is what an engineered pathway must store.'],
  [/^bird-zone$/, 'Enter the treated share of glass in the bird zone (Facade node) and the mature tree height, if trees are planned.'],
  [/^eds-criteria$/, 'Answer the three criteria in writing under Details: the Lions views, the open space and canopy strategy, the UNDRIP strategy.'],
  // City in Nature
  [/^views$/, 'Bring the tower out of the protected views: View-cone height check says by how much to lower it, or move it (Place on map).'],
  [/^nav-canada/, 'Ask NAV CANADA for a land-use review (and the City for its NAV CANADA height layer); allow for cranes.'],
]

/** The instruction for a rule that does not pass, or null when it passes. `key` is the rule id without its tower suffix. */
export function fixFor(key: string, state: RuleState, value: string, threshold?: string, flag?: string): string | null {
  if (state === 'pass') return null
  for (const [re, text] of FIXES) if (re.test(key)) return typeof text === 'function' ? text(state, value) : text
  if (flag === 'unresolved') return 'The sources leave this open: a person has to decide it (see Details).'
  // Node audit (7 Nov): "Not computed for this design yet" was shown for inputs nobody had entered and for values the
  // node had computed but cannot judge; and "Needs <threshold>; now <value>" read as broken English whenever the
  // threshold is a phrase ("Needs over 150 m above ground is an obstacle"). Rule and design, side by side, read right.
  if (state === 'unknown') {
    if (/needs a site area/i.test(value)) return 'Choose a study site in the Site step: the share needs a site area.'
    if (/\bnot assessed\b/i.test(value)) return 'The Toolkit does not assess this: the code consultant or engineer confirms it (see Details).'
    if (/^(not entered|not answered|needs (a|the) |not in the model|not modelled)|not (entered|answered)$/i.test(value)) return 'Enter it under Details, sources and settings (below): it is an input, not a result.'
    return 'Open: Details says what would settle it.'
  }
  return threshold ? `Rule: ${threshold}. This design: ${value}.` : 'See Details for the rule and its source.'
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
