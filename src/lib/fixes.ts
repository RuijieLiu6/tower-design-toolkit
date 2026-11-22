// Pass or fail, and what to do about it (Ruijie, 6 Nov: "use icons and symbols to simplify the right side analysis
// result and turn them into pass or fail as well as instructions on fixing them"). Each result line of a check becomes a
// row with a state and, when it does not pass, one instruction naming the move and where it is made in the Toolkit.
// The instructions are the team's reading of each rule (they say which control changes the result); they never change
// a threshold, and the rule, its source and its evidence flag stay one click away under Details.
import type { RuleState } from '../engine/types'
import type { ConeCheck } from '../engine/viewCones'
import { NEXT_MODEL } from './missingInput'
import { RESULT_WORD } from './status'

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
  [/^vertical-public$/, 'Carry public uses up the tower: a public sky room (Schematic), with its own public lifts or a shuttle opened to visitors; civic floors in Program count only where that public route stops.'],
  // Core & lifts
  [/^rise-floors/, 'Split the tower into more lift rises, or add a sky lobby (Schematic › Core & floors).'],
  [/^rise-/, 'Add cars to this rise, or start the upper rises at a sky lobby (Schematic › Core & floors).'],
  [/^core-fit/, (_st, v) => (/from L\d+, [\d.]+ m core/.test(v) ? 'A core is smaller than the lifts that run through it (the lowest, or a step): widen it, move the step higher, or end a rise below the step with a sky lobby (Structure › Lateral & sway › Core steps; Schematic › Core & floors).' : 'Turn on "Size to the lifts", or raise the core share (Schematic › Core & floors); the Core & lifts results show what the core needs (lifts, stairs, services) and the HVAC choice that sets the services shafts.')],
  // Services space by use (P1 node #14, Allen & Iano pp.50, 185, 192–194).
  [/^core-share/, (_st, v) => (/^(\d+)%/.exec(v) && Number(/^(\d+)%/.exec(v)![1]) > 25 ? 'Win back floor from a core over 25%: a sky lobby so fewer shafts run low down, or a core that steps in as rises end (Structure › Lateral & sway › Core steps; Schematic › Core & floors).' : 'Bring the core to 20–25% of the floor: turn on "Size to the lifts" or raise the core share, and check the shafts and rooms fit (Schematic › Core & floors).')],
  [/^lifts-kpf/, 'A cross-check only: compare the lift plan with the rule of thumb and ask the lift consultant about a large gap.'],
  [/^ntg/, 'Win back net area: a sky lobby (fewer shafts low down), a smaller core, or a larger plate.'],
  [/^firefighter/, 'Give firefighters a lift that reaches the top in about a minute with one change at most (a sky-lobby shuttle).'],
  [/^stretcher/, 'Make one car in each group stretcher-sized.'],
  // Exactly the lift check's seismic line: "seismic-category" (structure) once matched here too (node audit, 7 Nov).
  // The lift check's seismic line is "not assessed" (CSA B44-16's seismic clause unread): it names who decides (node audit, 7 Nov).
  [/^seismic$/, 'Not assessed here: a vertical-transportation consultant sets the seismic, rope-sway and stack-effect measures (CSA B44-16).'],
  // Structure: system & seismic (NBC 4.1.8); each restates its rule's threshold or note.
  [/^seismic-category$/, 'Every tower here is Seismic Category SC4: choose a lateral system listed without an SC4 height cap (Details lists them) with the structural engineer.'],
  [/^dynamic$/, 'A dynamic analysis is required: the structural engineer runs it (base shear at least 0.8 V if regular, 1.0 V if irregular).'],
  [/^weight$/, 'One floor weighs over 150% of the next (usually the podium roof under the first tower floor, or a planted garden storey): step the podium in, lighten the deck (shallower soil or a hard deck), or carry it as an irregularity in the dynamic analysis.'],
  // Off-centre gravity (research R5 §2): each restates its rule's bands.
  [/^gravity-offset$/, 'The storey weight sits off the core: stack the tiers over the core (or move the core under them), balance a planted or heavy deck with weight on the other side, or declare the offset so the engineer carries the torsion.'],
  [/^gravity-net$/, (_st, v) => (/long term/.test(v) && Math.max(...[...v.matchAll(/≈ (\d+) mm long term/g)].map((m) => Number(m[1]))) > 100
    ? 'Bring the tower’s weight back over the core (align the tiers, or shift the core under the heavy side); as built, plan a tie-down or outrigger strategy and a pre-set (camber), as at Vancouver House.'
    : 'Declare a pre-set (camber) of the floors for the structural reviewer; aligning the tiers over the core lowers the sway.')],
  // Core alone (P1 #10): below the 46/H stiffness the sway and across-wind lines assume.
  [/^core-alone$/, (st) => (st === 'fail' ? 'The core alone is far softer than the 46/H frequency the sway and across-wind lines assume: thicken the base walls or raise f′c (weight presets), enlarge the core, or declare outriggers or belt trusses (Structure › Lateral & sway) and have the engineer show their share; a model frequency (Wind procedure) replaces both readings.'
    : 'The core alone gives part of the stiffness 46/H assumes: declare what supplies the rest (outriggers or belt trusses in Structure › Lateral & sway, a perimeter frame), or thicken the base walls; the engineer\'s model frequency settles it.')],
  [/^p-delta$/, 'Gravity on the swayed core adds more than 10% to its sway: stiffen the core (thicker base walls, a larger core, outriggers) or lighten the upper storeys.'],
  // Floor reach (P1 #13): past one flat plate.
  [/^floor-reach$/, 'The floor reaches past one flat plate from the core: tick Interior column ring (Structure › Floors & spans) for a ring at about half the reach, plan a long-span floor with post-tensioned beams onto the perimeter columns, or bring the plate edge closer to the core (Massing).'],
  [/^core-ratio$/, 'Trim the core (Schematic › Core & floors) or enlarge the plate.'],
  [/^continuity$/, (st) => (st === 'fail' ? 'An upper core stands outside the core below: move its centre or shrink it so it sits inside the lower core (Structure › Lateral & sway › Core steps), so its walls can run down to the foundation.'
    : 'Model the core in the imported massing, or confirm with the engineer that the core walls run to the foundation.')],
  [/^geometric$/, 'The core steps by more than 130% at one level: split it into smaller steps (each within 130%, Structure › Lateral & sway › Core steps), or carry the Type 3 irregularity in the dynamic analysis.'],
  // Egress & stairs
  // Posted occupant loads (tool cycle 11, BCBC 2024 3.1.17.1(1)(c), (2)).
  [/^egress-posted/, 'A posted load below the Table load needs a permanent sign (3.1.17.1(2)) and an accepted case that fewer people will use the floor (a code consultant or fire engineer); or post at the Table load and size the stairs for it (Egress › Posted loads).'],
  [/^stair-width/, 'Widen the exit stairs or add one (Schematic › Exit stairs), or lower the busiest floor\'s occupant load.'],
  [/^exits/, 'Add an exit stair so every floor has at least two (Schematic › Exit stairs).'],
  // P1 #11 (21 Nov): the smoke-path reading of the same exits (a code-consultant reading).
  [/^separation-smoke/, 'Open the core stair doors on opposite faces of the core (the tower’s stairDoorFaces), or move a stair to the plate edge (Schematic › Exit stairs); a code consultant confirms the smoke-path reading.'],
  [/^separation/, 'Move the stairs apart: try "Core + edge" or "At the edges" (Schematic › Exit stairs).'],
  [/^travel-podium/, 'Give the podium its own exits closer to its far corners.'],
  [/^travel/, 'Shorten the walk to an exit: add a stair, or place stairs at the edges (Schematic › Exit stairs).'],
  [/^podium-exits/, 'Give the podium its own exit stairs.'],
  // P1 #12 (21 Nov): an amenity or lounge floor at the BCBC 2024 lounge row sets the stair width.
  [/^amenity-load/, 'Programme the busiest amenity floor (Interior: its activities set the load), split it over two floors, post a lower occupant load, or widen the stairs or add one (Schematic › Exit stairs).'],
  [/^flight/, 'Keep each flight under 3.7 m of rise: add a landing or lower the floor-to-floor.'],
  // Public sky room
  [/^skyroom-lifts/, 'Give visitors their own lifts, or a larger shuttle (Schematic › Sky lobbies › Public sky room).'],
  [/^skyroom-exits/, 'Post a visitor limit (it suggests one) or widen the stairs.'],
  [/^skyroom-stepfree/, 'Keep a spare step-free car for visitors.'],
  [/^skyroom-security/, 'Separate the visitor route from the tenants\' lifts and floors.'],
  [/^skyroom-(share|amenity)/, 'Open more of the sky room to the public, or add a second public level.'],
  [/^skyroom-none/, 'Open a sky lobby to the public (Schematic › Sky lobbies).'],
  // P1 #2 (21 Nov): HBP 2026 declarations.
  // Book node #2 addition (21 Nov): a hotel floor or lobby offered as the public room is not counted.
  [/^skyroom-benefit/, (st, v) => (st === 'warn' && /hotel/.test(v) ? 'A hotel floor or lobby does not count as the public benefit: give the public room or stop a floor of its own outside the hotel, on its own lifts (Schematic › Sky lobbies), or declare a benefit the model delivers.'
    : 'Declare the community benefit the tower offers (Schematic › Sky lobbies › Community benefit, HBP 2.1(g)).')],
  [/^skyroom-heritage/, (st) => (st === 'fail' ? 'Keep the Class A heritage building: HBP 2.1(f) allows no demolition. Retain it and build around or over it.' : 'Declare whether a Class A heritage building stands on the site (Schematic › Sky lobbies › Class A heritage, HBP 2.1(f)).')],
  [/^skyroom-access/, 'Make the room free to enter and open daily hours.'],
  // Public realm (draft Central Downtown Design Guidelines)
  // Node audit (7 Nov): "pr-share" is the tower's width against the frontage, not active frontage share; it had the
  // active-frontage instruction.
  [/^pr-share/, 'Narrow the tower so it spans less than about 60% of the frontage it faces, or turn it (Massing).'],
  [/^pr-crossings$/, (st) => (st === 'unknown' ? 'Pick the type of each street with a driveway (Your site › Streets): driveways may cross local streets, not retail or arterial ones.' : 'Move driveways and loading off the retail high street and arterial, to the local streets or the lane (Program step › Ground & public realm).')],
  [/^pr-station$/, 'Give the station entrance at least one lift and one stair (Program step › Ground & public realm).'],
  [/^pr-station-active$/, 'Line the below-grade link with active uses and open a view to the concourse (Program step › Ground & public realm).'],
  [/^pr-active/, (st) => (st === 'unknown' ? 'Pick this street’s type (Retail, Arterial or Local) in Your site › Streets: its active-frontage target depends on it.' : 'Line more of this street with shops and entrances (Program step › Ground & public realm).')],
  [/^pr-entrances/, 'Add entrances along this street, about every 8–12 m.'],
  [/^pr-canopy$/, 'Extend weather protection along the frontage.'],
  [/^pr-ground-height$/, 'Make the ground storey 4.6–6.1 m tall (the podium block\'s height in Massing).'],
  [/^pr-open-share$/, 'Free more ground: a smaller podium footprint, or a plaza.'],
  [/^pr-pops/, 'Add publicly open space (POPS) of at least a tenth of the site, in a usable shape.'],
  [/^pr-transit-plaza$/, 'Leave a clear 6.1 m plaza beside the station entrance (the station corner on the competition site).'],
  [/^pr-street-types/, 'Pick each street’s type (Retail, Arterial or Local) in Your site › Streets or in Ground & public realm.'],
  [/^pr-station-question$/, 'Say whether a station entrance is on or next to the site, and on which street (Program step › Ground & public realm).'],
  [/^pr-link$/, (st) => (st === 'unknown' ? 'Answer whether a station entrance is on or next to the site (Program step › Ground & public realm); a link can be added there too.' : 'Keep a mid-block link at least 9.1 m wide, open to the sky and secured for public use.')],
  [/^pr-link/, 'Keep a mid-block link at least 9.1 m wide, open to the sky and secured for public use.'],
  [/^pr-separation/, 'Move the towers further apart (the separation lines in the view show by how much).'],
  [/^pr-plate/, 'Reduce the tower floorplate (width × depth in Massing).'],
  [/^pr-dim/, 'Keep the tower\'s longest side within 29 m (Massing).'],
  // P1 #9: under 6:1 is the CDDG tip; 8:1 or more is KPF's damper line.
  [/^pr-slender/, (_st, v) => (parseFloat(v) >= 8 ? 'Past KPF’s damper line (8:1): widen the base toward the 5–6.67 efficient band, or declare a damper and its cost (Structure › Wind procedure).' : 'Make the tower more slender toward the CDDG’s 6:1 (a narrower plate, or taller), or argue KPF’s 5–6.67 efficient band on the boards.')],
  [/^pr-stepback$/, 'Step the tower back from the streetwall (move or narrow the tower block).'],
  // Node audit (7 Nov): continuity is how much of the podium face sits on the property line, not its height.
  [/^pr-continuity/, 'Bring the podium face to the property line along more of this street (move or widen the podium block in Massing).'],
  [/^pr-podium/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  [/^(north|south|east|west)$/, 'Set the streetwall height within this street\'s band (the podium block\'s height in Massing).'],
  // Node audit (7 Nov): this said "Vary the tower heights", but S2.2.1 asks for plane changes along the street.
  [/^pr-variation$/, 'Break the long facade with a step of 1.5 m or more at least every 45.7 m (stacked blocks in Massing), and show it on the boards.'],
  [/^pr-streets-frontage$/, 'Choose a study site in the Site step: the street lines read its streets.'],
  [/^pr-streets-ground$/, 'Choose a study site in the Site step: the link, frontage and station lines read its streets.'],
  [/^pr-streets$/, 'Choose a study site in the Site step: the street rules read its streets and their measured widths.'],
  [/^pr-sun$/, (_st, v) => (/^Switch on/.test(v) ? 'Switch on Solar access & sun hours to test the shadow on public space.'
    : 'Open Solar access & sun hours to see which spaces get new shadow; moving, turning or slimming the tower changes it.')],
  // P1 #3 (21 Nov): sun on the design's own square, described not judged.
  [/^pr-square-sun$/, (_st, v) => (/^Switch on/.test(v) ? 'Switch on Solar access & sun hours to read the sun on your square.'
    : /^No clear/.test(v) ? 'Free a clear open rectangle on the site (the POPS line) to have a square to read.'
    : 'To bring more sun to the square, move it south of the tower or step, slim or turn the tower above it (Massing).')],
  // Book node #17 (21 Nov, built.base-edges): the square's edges, sight lines, desire line, lobby, level and type, and L1–L6.
  [/^pr-square-edge$/, (st, v) => (/competition block only/.test(v) ? 'Open the competition site to read the square\'s edges, sight lines and desire line; on Real Vancouver they wait for a station exit and sidewalks.'
    : /^No clear/.test(v) ? 'Free a clear open rectangle on the site (the POPS line) to have a square to read.'
    : st === 'unknown' ? 'Bring a building face to the square and line it with active uses or a glazed public lobby, so the square has an edge people use.'
    : Number(/(\d+)% blank/.exec(v)?.[1] ?? 0) > Number(/(\d+)% building face/.exec(v)?.[1] ?? 0) ? 'Edge the square: bring building faces with active uses (a pavilion, a podium face, a glazed lobby) to its blank sides, or move the square against the podium.'
    : 'Line more of the square\'s building face with shops, cafés, civic rooms or a glazed public lobby (Ground & public realm › Square).')],
  [/^pr-square-seen$/, 'Open the square to the sidewalks: move, glaze or shorten what blocks the view from the street (a pavilion, a podium corner), or bring a sunken square nearer the sidewalk level.'],
  [/^pr-square-desire$/, 'Clear a straight walk from the station corner across the square: move what stands on that line at grade (a pavilion, a podium corner), or shift the square toward the station.'],
  [/^pr-square-lobby$/, (st) => (st === 'unknown' ? 'If a podium face on the square is a glazed public lobby, say which side and how long (Ground & public realm › Square).'
    : 'Put the glazed lobby on a side of the square that has a building face (Ground & public realm › Square), or bring the podium to that side.')],
  [/^pr-square-level$/, 'Give a square off the sidewalk level at least two step-free entries (ramps or lifts) and keep half of it seen from the sidewalks, or bring it within 0.5 m of the sidewalk (Ground & public realm › Square).'],
  [/^pr-square-type$/, 'Described, not judged: the type follows the square\'s edges (a corner, a courtyard, a flanking lobby, a sunken floor).'],
  [/^pr-base-six$/, 'Put shops, civic rooms or amenity on more of the L2–L6 storeys that face the streets (Program step), or raise the ground storey\'s active share by street.'],
  [/^pr-wind$/, (_st, v) => (/^Switch on/.test(v) ? 'Switch on the pedestrian wind screen; a wind tunnel study settles it.'
    : 'Open Pedestrian wind: massing screen to see where: a podium step or canopy under the windward face and softer corners lower its risk; a wind tunnel study settles it.')],
  // Relaxations & aviation (research C01-M06; node audit 7 Nov: the generic "Needs …; now …" read as broken English).
  // Each instruction restates the rule's own note; none adds a threshold.
  [/^relax-limit/, 'Lower the top under the lowest binding cone (View-cone height check says by how much), move the tower out of the cone (Place on map), or, if the site may use a relaxation route, switch it on under Details › Relaxations to see the limit with it.'],
  [/^relax-hbp/, (_st, v) => (/not applied/.test(v) ? 'The route enters QE View 3 only inside the CBD outline: move the tower into it (Place on map) or keep the top under the view. The Higher Buildings area line says where the footprint stands.'
    : 'Switch on the Higher Buildings Policy route under Details › Relaxations to see the limit with it. Higher Buildings Policy says whether the footprint lies in a Figure 1 area; the City confirms it.')],
  // Higher Buildings area and ceiling (book node #1, 21 Nov; HBP 2.1(b)–(d), p.5 Figure 1).
  [/^hbp-area/, (st, v) => (st === 'fail' ? 'The route opens only inside a Figure 1 area: move the tower into one (Place on map), choose a study site inside it (Site step), or switch the Higher Buildings route off under Details › Relaxations.'
    : /^partly/.test(v) ? 'Part of the footprint lies outside the area: move or turn the tower so the whole footprint sits inside it (Place on map).'
    : 'A higher building needs a Figure 1 area: move the tower into one (Place on map) or choose a study site inside it (Site step); outside it, the base zoning and the view cones govern.')],
  [/^hbp-ceiling/, 'Lower the top to the area’s ceiling (Height in Massing), or argue the excess under 2.1(a) as a skyline benchmark on the boards; the review then adds two international experts (s.3). Type a site-specific ceiling in Higher Buildings Policy if the City has given one.'],
  [/^hbp-street/, 'About 700 ft is open only to a site fronting W Georgia, Burrard or Granville: choose a study site on one of them (Site step), or lower the top to the area’s ceiling (Height in Massing).'],
  [/^en-hbp-height/, 'Lower the top to the site’s Figure 1 ceiling (Height in Massing), or argue the excess under 2.1(a) as a skyline benchmark on the boards; Higher Buildings Policy reads the ceiling on a Real Vancouver site.'],
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
  [/^f1$/, (st, v) => (/empirical/.test(v)
    ? (st === 'fail' ? 'Even the upper empirical estimate (46/H) is under 0.25 Hz: plan the wind tunnel test, and enter the engineer’s model frequency under Details when there is one.' : 'Enter the engineer’s model frequency under Details: 46/H carries ±50% scatter, and the code’s seismic period is not a wind frequency.')
    : st === 'fail' ? 'Ask the structural engineer for the model frequency (enter it under Details); without it, towers of 180 m or more go to the tunnel (team default).' : 'Enter the engineer’s model frequency under Details: the code’s seismic period is not a wind frequency.')],
  [/^across-wind-accel$/, (st) => (st === 'fail' ? 'Across-wind motion over the comfort limit: plan supplementary damping (a tuned mass damper or sloshing tanks; declare its added damping under Details), soften or twist the corners, taper the top, or widen the plate; the wind tunnel test settles it.'
    : 'Over the limit at the low end of the frequency range: get the engineer’s model frequency (enter it under Details) and keep damping, softer corners or a taper in reserve.')],
  [/^twist$/, 'The twist softens the frame: carry the wind in a straight core (the loss is the perimeter’s), or tell the structural engineer the outrigger or perimeter frame sways this much more; a smaller twist costs less (about +12% at 90°).'],
  [/^vortex$/,'Vortex lock-in is possible within design winds: the wind tunnel test checks it; a wider plate, a stiffer structure (higher f1), or corner and section changes along the height move the critical speed.'],
  [/^super-slender$/, '8:1 or more: KPF expects a tuned mass damper, with cost and sales risk: widen the base toward 5–6.67, or declare the damper (supplementary damping, Structure › Wind procedure) and justify it by the across-wind acceleration line.'],
  [/^trigger-/, 'Plan a wind study at the level this analog city asks for; Vancouver has no numeric trigger, and a wind engineer sets the scope.'],
  // Pedestrian wind comfort (Sun & Wind Studio port, 16 Nov): her strategies, each as the move to make; the informational lines say what they report.
  [/^calm-ground$/, (st) => (st === 'unknown' ? 'Load the context buildings (the competition context, or the City layers of a study site): on open ground the result is optimistic.'
    : 'Calm more of the ground: a podium reaching 10 m or more beyond the tower, or a deep entrance canopy, catches the downwash; rounded or chamfered corners cut the corner streams; planting and screens slow a sheltered plaza; turning or moving the tower away from where people sit changes which ground the wind reaches.')],
  [/^plaza-peak$/, (st) => (st === 'unknown' ? 'No plaza or mid-block link is in the model for this check (Real Vancouver has no plaza layer yet): the competition context carries them.'
    : 'Calm the plaza: a podium reaching 10 m or more beyond the tower, or a deep entrance canopy, catches the downwash before it reaches the plaza; rounded or chamfered corners cut the corner streams; planting and screens slow a sheltered plaza; turning or moving the tower away from the plaza changes which ground the wind reaches.')],
  [/^uncomfortable$/, (st) => (st === 'unknown' ? 'Load the context buildings (the competition context, or the City layers of a study site): on open ground the result is optimistic.'
    : 'Take the uncomfortable ground away from entrances and routes: a podium reaching 10 m or more beyond the tower, or a deep entrance canopy, catches the downwash; rounded or chamfered corners cut the corner streams; turning or moving the tower changes which ground the wind reaches.')],
  [/^worse-better$/, 'Reported, not judged: where the tower makes the ground windier, a podium reaching 10 m or more beyond it, a deep entrance canopy, rounded or chamfered corners, or planting and screens on a sheltered plaza move the band back; turning or moving the tower changes which ground is reached.'],
  [/^gusty$/, 'Reported, not judged: open ground where gusts top 6 m/s in more than 5% of hours over the period; a podium, canopy or softer corners lower it where it meets seating and entrances.'],
  [/^downwash$/, 'Reported, not judged: the allowance for wind brought down the windward face, from the tower’s height against its neighbours; a podium or canopy under that face catches it.'],
  [/^strategies$/, 'Reported, not judged: what the podium, canopy, corners and plaza shelter change against the bare tower; set them under Details to compare.'],
  // Daylight sDA / ASE (Sun & Wind Studio port, 17 Nov): her levers, each as the move to make.
  [/^sw-dl-sda$/, (st) => (st === 'unknown' ? 'Load the context buildings (the competition context, or the City layers of a study site): without neighbours nothing shades the windows, so the result is optimistic.'
    : 'Bring more floor over 300 lux: a shallower plate or a smaller core (Massing, Schematic), more glass or clearer glass (the facade node’s WWR and VLT), a taller floor-to-floor for a higher window head, or lighter shading devices on the north; the weakest floors are usually the low ones behind neighbours.')],
  [/^sw-dl-ase$/, (st) => (st === 'unknown' ? 'Load the context buildings (the competition context, or the City layers of a study site): without neighbours every floor sees the full sun, so the result is pessimistic for low floors.'
    : 'Cut the direct sun: overhangs or balconies on the south, fins or egg-crates on the east and west, a lower window-to-wall ratio or a lower VLT on the sunniest faces; or document glare control (blinds) for the floors over 10%.')],
  [/^sw-dl-df$/, (st) => (st === 'unknown' ? 'Load the context buildings (the competition context, or the City layers of a study site): on open ground the daylight factor is optimistic.'
    : 'Raise the overcast daylight: more or clearer glass (WWR, VLT), a higher window head (floor-to-floor), shallower plates, light shelves on the deep faces, and lighter interior finishes.')],
  [/^sw-dl-weakest$/, 'Reported, not judged: the floor with the least sDA; deepen the glass or thin the plate there first (often the low floors behind neighbours).'],
  [/^sw-dl-udi$/, 'Reported, not judged: hours of useful daylight; a large share over 3,000 lux asks for shading, a large share under 100 lux for more glass or shallower plates.'],
  [/^sw-dl-glazing$/, 'Reported, not judged: switch the facade node on and set its system, WWR by facing and VLT to study your own glass instead of her default facade.'],
  // Natural ventilation potential (Sun & Wind Studio port, 17 Nov): her levers, each as the move to make.
  [/^sw-vt-openable$/, 'Give the floor more free opening: make more faces operable (Presets), open a larger share of the glass, add glass on the operable faces (the facade node’s WWR), or a double skin so the windows can open higher up.'],
  [/^sw-vt-within8$/, 'Bring every point within 8 m of an opening: a shallower plate or a smaller core (Massing, Schematic), operable windows on more faces, or a light well or atrium in a deep plate.'],
  [/^sw-vt-hours$/, 'Reported, not judged: more hours come from cross-ventilated plates (two opposite operable faces), the adaptive band where the use allows it, a double skin that lets windows open in stronger wind, and a smaller indoor rise (shading, lower internal gains).'],
  [/^sw-vt-height$/, 'Reported, not judged: above this floor the wind at height closes the windows more often; a double skin or sheltered openings (balconies, winter gardens) raise it.'],
  [/^sw-vt-fresh$/, 'Reported, not judged: share of open hours whose airflow meets her outdoor-air rate; cross-flow or a stack shaft raises it on deep floors.'],
  [/^sw-vt-glazing$/, 'Reported, not judged: switch the facade node on for your own glass, and set which faces open under Presets.'],
  [/^sw-vt-method$/, 'Indicative (her note): one zone per floor; a mechanical engineer’s AirflowNetwork or CFD model with the real interior settles natural ventilation.'],
  // Energy use (Sun & Wind Studio port, 17 Nov): her levers, each as the move to make.
  [/^sw-en-teui$/, 'Cut the energy at the meter: a heat pump for heating and hot water, more heat recovery on the outdoor air, lower lighting and plug loads, daylight dimming, and a better envelope (lower glass U, less glass on the north); the program mix sets the target.'],
  [/^sw-en-tedi$/, 'Cut the heating demand: better glass (lower U) and less of it where the sun does not reach, walls and roofs nearer Passive House U-values, tighter air (infiltration), and more heat recovery on the outdoor air.'],
  [/^sw-en-ghgi$/, 'Take the gas out: an air-source heat pump for heating and hot water instead of a boiler brings GHGI down most on BC’s low-carbon grid.'],
  [/^sw-en-uses$/, 'Reported, not judged: the largest end uses are where the next saving is.'],
  [/^sw-en-peaks$/, 'Reported, not judged: peak loads size the plant; shading and mass lower the cooling peak, a better envelope the heating peak.'],
  [/^sw-en-overheat$/, 'Reported, not judged: unconditioned floors over 26 °C need shading, opening windows or a little cooling.'],
  [/^sw-en-daylight$/, 'Reported, not judged: daylight dimming saves lighting where floors are shallow and glass is clear.'],
  [/^sw-en-inputs$/, 'Reported, not judged: set the envelope and systems under Presets, and switch the facade node on for your own glass.'],
  [/^sw-en-method$/, 'Indicative (her note): an energy model to the City of Vancouver Energy Modelling Guidelines by an energy modeller settles TEUI, TEDI and GHGI.'],
  [/^sw-dl-method$/, 'Indicative early-design proxy (her note): a LEED submission needs an hourly Radiance run with the real interior; a daylighting consultant settles it.'],
  [/^method$/, 'Indicative, not CFD: a two-dimensional flow shows where the massing accelerates or shelters the wind; a wind-tunnel study by a wind engineer settles the numbers.'],
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
  [/^plant-reach$/, 'Put a plant floor within 13 storeys of every occupied floor, 25 at most: add plant floors (Schematic › Core & floors, "Plant floor every N tower floors", or the Section tool), with a podium or basement fan room for the low floors.'],
  [/^services-/, 'Turn on "Services by use" in the lift presets so the core holds these services, or raise the flat services figure to this one (Schematic › Core & floors); an air-water system halves the office shafts.'],
  [/^plant-floors$/, 'Add plant floors: the button under Details puts one every few floors, or set "Plant floor every N tower floors" (Schematic › Core & floors). Podium plant does not count: move it up above the podium.'],
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
  // P1 #7: the deepest point is judged against the 6 m primary daylit zone (EP pp.199, 229–230).
  [/^dl-.*-depth$/, 'Bring every desk or room within about 6 m of glass: a slimmer plate (width × depth in Massing), a larger core or corridor ring in the deep middle, or a garden or loggia edge declared as a deck (Deck use) that opens an inner facade.'],
  [/^dl-.*-share$/, 'Bring more floor within daylight reach: a slimmer plate (width × depth in Massing), a smaller core, or a taller floor-to-floor (it raises the window head; see Storey height by use for the height it costs).'],
  // P1 #8: a storey over typical + 0.4 m.
  [/^f2f-(residential|hotel|office)$/, 'Lower this use’s floor-to-floor toward the typical value (Program › bands, storey height) to free height under the cap, or keep it and say on the boards what the height buys (daylight depth, ceilings, services).'],
  // Book node #18: a planted or shared gap over 25 storeys (precedent band, Ecocity pp.49, 70–71, 151, 157).
  [/^sv-planted$/, 'Put a planted level in the longest stretch: declare a deck there planted with its soil (Tower › deck use; the list under the line names the decks in that gap), open a garden storey or winter garden, or declare planters or a greenwall band (Sun & Wind › Façade zones). The precedent puts one about every 10 storeys.'],
  [/^sv-shared$/, 'Put a shared level in the longest stretch: a sky lobby with residents’ rooms (Section › sky lobbies), an amenity or civic floor (Program › floor use) or a public stop on the sky room’s lifts; the precedent pairs it with the plant or outrigger storey about every 25 storeys.'],
  [/^sv-homes$/, 'Give the homes a shared level of their own: a residents’ amenity floor or a sky lobby with shared rooms in the residential stack (Program › floor use, or Section › sky lobbies).'],
  [/^dl-udi$/, 'Run Daylight › sDA and ASE and read the hours over 1,500 lux on the bright faces: shading or a lower-transmittance glass there.'],
  [/^dl-.*-limit$/, 'Bring L/W + L/H under the limit: a shallower plate or a taller floor-to-floor (Massing).'],
  [/^mob-transit$/, 'Turn on the transit link to the station (Program step › Ground & public realm).'],
  [/^rain-(detention|first-stage)$/, 'Answer the rainwater pathway under Details: the volume shown is what an engineered pathway must store.'],
  [/^bird-zone$/, 'Enter the treated share of glass in the bird zone (Facade node) and the mature tree height, if trees are planned.'],
  // Vegetated area ÷ site, ÷ GFA and above grade ÷ footprint (node built.green-ratio): readings with no threshold (Ecocity
  // in the Sky gives no green plot ratio); this says how to give them area.
  [/^green-(site|gfa|above|resident|planters)$/, 'Model the planting so the ratio reads: mark decks planted (Tower › deck use), set greenwall facade zones (Sun & Wind › Façade zones), declare planters on the tower (planters: level, to, length, width) and type the planting at grade (Green claims check › cover). No book sets a target: any target is the team’s.'],
  [/^eds-criteria$/, 'Answer the three criteria in writing under Details: the Lions views, the open space and canopy strategy, the UNDRIP strategy.'],
  // Skyline silhouette (a design reading: never a fail)
  [/^sil-legible$/, 'Give the outline one move the city can read, on most sides: a step of the size the rule names on two or more faces, a block that slides, a taper or a twist (Massing blocks, or Tower form in the Typology tab, Form step).'],
  [/^sil-sky$/, 'Let the sky show through the tower where the city sees it: an open band of two or three storeys whose plate stops short of the facade on opposite faces or wraps a corner, with no glass or core on the line of sight and no neighbour behind it (Massing blocks, or the storey outlines of an imported model).'],
  // City in Nature
  [/^views$/, 'Bring the tower out of the protected views: View-cone height check says by how much to lower it, or move it (Place on map).'],
  [/^qe-view$/, 'Entering the Queen Elizabeth Park view is a pathway, not a failure: answer the Exceptional Downtown Site criteria below and make a skyline case, or lower the tower under the 3.2 cones.'],
  [/^nav-canada/, 'Ask NAV CANADA for a land-use review (and the City for its NAV CANADA height layer); allow for cranes.'],
  // Engagement & claims guard and AI-use log (lines from data, gap G15)
  [/^cc-lint$/, (st) => (st === 'fail' ? 'Rewrite the flagged wording to what each Nation’s declared status allows (the fixed statements in Engagement & claims), or record the engagement that supports it; never claim engagement that did not happen.'
    : 'Paste the board and narrative text into Engagement & claims so the guard can check it.')],
  [/^cc-motif-\d+$/, 'Have a person read this motif wording and record their name in Engagement & claims (Motif wording read by); if it names a Nation, its language or a practice, it also needs that Nation’s written permission (N4). Or describe the form by what it does (light, wind, the route, the view) instead of what it borrows.'],
  [/^cc-claim-\d+$/, 'Rewrite this sentence to the wording the Nation’s declared status allows, or record the engagement (evidence, counterpart, date, reference) that supports it in Engagement & claims.'],
  [/^cc-record-/, (st) => (st === 'warn' ? 'Complete this Nation’s record for its declared status in Engagement & claims: the evidence, counterpart, date and reference the level needs.'
    : 'Confirm this Nation’s status in Engagement & claims once the team has checked it is true.')],
  [/^prov-log$/, (st) => (st === 'warn' ? 'Fix the logged elements the AI-use log lists (who decided, the tool’s licence, a reviewer, sources).' : 'Log every board element in the AI-use log: how it was made, the tool, and who decided.')],
  [/^prov-entry-\d+$/, 'Complete this element in the AI-use log: what a person contributed, a person’s decision, the tool’s licence, a named reviewer for AI-drafted cultural text, or the result’s source, as the line says.'],
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
    // A line that reads the building model while the project has none (lib/missingInput.ts).
    if (/^needs model\b/i.test(value)) return NEXT_MODEL
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

/** The short word of each state (lib/status.ts holds the vocabulary). */
export const STATE_WORD: Record<RuleState, string> = { pass: RESULT_WORD.pass, fail: RESULT_WORD.fail, warn: RESULT_WORD.warn, unknown: RESULT_WORD.unknown }
const RANK: Record<RuleState, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 }
export const byState = (a: CheckRow, b: CheckRow) => RANK[a.state] - RANK[b.state]
