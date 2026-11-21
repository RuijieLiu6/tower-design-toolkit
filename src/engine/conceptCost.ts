// The concept's own costs (gap G29, cost review R3-11): an open storey or open garden left the residual higher than the
// same tower filled in, because its deck, soffit, exposed core wall and screens, a declared damper, public lifts and the
// trees carried no cost. Each line here is a quantity read from the model (or declared) times a unit cost that is a
// TEAM ASSUMPTION, TO CONFIRM: no source was found for any of them. Replace them with a quantity surveyor's elemental
// rates (e.g. Altus 2026 lines). They are added to the hard cost, and soft cost, finance and profit follow, so the
// residual is shown with and without them.
// Gap G40/T22 (cost review R4-5): trees at grade (typed, or the ground wind's trees) have their own rate apart from trees
// at height, and a deck no one uses (deck use `none`, e.g. a membrane roof) is a membrane, not a paved deck with screens.
import { liftCheck } from './lifts'
import { coreSideAt, towerFloors } from './massing'
import { deckUseOf, towerDecks } from './sw/decks'
import type { Flag, Tower } from './types'

const TO_CONFIRM = 'Team assumption, to confirm: no source found; replace with a quantity surveyor’s elemental rate (e.g. an Altus 2026 line)'

export interface UnitCost { value: number; low: number; high: number; unit: string; flag: Flag; source: string }
const team = (value: number, low: number, high: number, unit: string): UnitCost => ({ value, low, high, unit, flag: 'team_assumption', source: TO_CONFIRM })

/** Unit costs of the concept's own items (C$): every one a team assumption, to confirm. */
export const CONCEPT_COSTS = {
  /** Deck slab with membrane, drainage, soil, planting and irrigation where planted (outside the GFA, so not in the floor rates). */
  deckPlanted: team(3000, 2000, 4500, 'C$/m² of planted deck'),
  /** Deck slab with membrane and pavers on pedestals. */
  deckHard: team(1800, 1200, 2600, 'C$/m² of hard deck'),
  /** A deck no one uses (deck use `none`, gap G40/T22): membrane, insulation, drainage, ballast and fall-arrest anchors for maintenance; no pavers, soil or guard screens. */
  deckNone: team(450, 250, 800, 'C$/m² of no-access deck'),
  /** Insulated, finished soffit under the slab over an open storey. */
  soffit: team(900, 600, 1400, 'C$/m² of soffit'),
  /** Core wall now outdoors: insulation, cladding and weathering of the core of an open garden storey. */
  coreWall: team(1200, 800, 1800, 'C$/m² of exposed core wall'),
  /** Wind and guard screens at the open edges, 1.5 m high (the facade zones' wind screen height). */
  screen: team(2500, 1500, 4000, 'C$/m² of screen'),
  /** Allowance for a declared supplementary damper (tuned mass or sloshing tanks), per tower: never sized by a supplier here. */
  damper: team(10e6, 5e6, 20e6, 'C$ per tower with a declared damper'),
  /** One public lift car: machine, controls, cab and shaft fit-out (the shaft area is already in the core). */
  publicLift: team(1.5e6, 1e6, 2.5e6, 'C$ per public lift car'),
  /** One tree at height: crane lift, soil cell, anchoring and irrigation. */
  tree: team(20000, 10000, 40000, 'C$ per tree'),
  /** One tree at grade (gap G40/T22): nursery stock, soil cells or a structural-soil trench, and irrigation; no crane or anchoring at height. */
  treeGrade: team(6000, 3000, 12000, 'C$ per tree at grade'),
} as const
export type ConceptCostId = keyof typeof CONCEPT_COSTS
/** Screen height at the open edges of an open storey (m), the facade zones' wind screen. */
export const SCREEN_H = 1.5

export interface ConceptInputs {
  /** True north clockwise from the project frame's +y: only deck uses that name a facing need it. */
  north?: number
  /** Declared supplementary damping ratio (wind presets, gap G20): above 0 adds the damper allowance per tower. */
  supplementalDamping?: number
  damperNote?: string
  /** Public lift cars, declared; absent: the cars of the dedicated public lifts of a sky room (lift check). */
  publicLifts?: number | null
  /** Trees on the decks, declared (no tree count in the model); absent: none. */
  trees?: number | null
  /** Trees at grade, declared; absent: the trees among the ground wind's porous obstacles (`groundPorous`), else none. */
  treesAtGrade?: number | null
  /** The pedestrian wind study's trees and porous screens on the ground (engine/sw/wind.ts PorousObstacle): its trees are trees at grade. */
  groundPorous?: { kind: string }[] | null
}

export interface ConceptLine { id: ConceptCostId; label: string; tower: string; qty: number; unit: string; rate: UnitCost; cost: number; low: number; high: number; note?: string }
export interface ConceptCost { lines: ConceptLine[]; total: number; low: number; high: number }

/** The concept's own items and their costs for every tower (gap G29). */
export function conceptCosts(towers: Tower[], c: ConceptInputs = {}): ConceptCost {
  const lines: ConceptLine[] = []
  const put = (id: ConceptCostId, label: string, t: Tower, qty: number, note?: string) => {
    if (!(qty > 0)) return
    const r = CONCEPT_COSTS[id]
    lines.push({ id, label, tower: t.name, qty, unit: r.unit.replace(/^C\$\/?\s?(per )?/, ''), rate: r, cost: qty * r.value, low: qty * r.low, high: qty * r.high, note })
  }
  for (const t of towers) {
    const floors = towerFloors(t)
    const at = new Map(floors.map((f, i) => [f.level, i]))
    // open storeys and loggias: decks with a slab above them (sw/decks.ts)
    const decks = towerDecks(t, c.north ?? 0).filter((d) => d.cover != null)
    let planted = 0, hard = 0, none = 0, soffit = 0, screen = 0, wall = 0
    const walled = new Set<number>()
    for (const d of decks) {
      const i = at.get(d.level), f = i != null ? floors[i] : null
      const u = deckUseOf(t, d)
      // planted as the storey weights read it: the deck-use input, else an amenity storey or an open garden storey
      const garden = i != null && i > 0 && i < floors.length - 1 && f!.area <= 0.5 * floors[i - 1].area && f!.area <= 0.5 * floors[i + 1].area
      const isPlanted = u ? u.use === 'planted' : f?.use === 'amenity' || garden
      // a deck no one uses (deck use `none`, e.g. a membrane roof) is priced as a membrane, without the guard screens
      const noAccess = u?.use === 'none'
      if (noAccess) none += d.area; else if (isPlanted) planted += d.area; else hard += d.area
      soffit += d.area
      if (!noAccess) screen += d.edges.filter((e) => e.open).reduce((s, e) => s + e.L, 0) * SCREEN_H
      // the core of an open garden storey (a plate that is the core alone) stands outdoors to the slab above
      const side = coreSideAt(t, d.level)
      if (f && !walled.has(d.level) && f.area <= 1.2 * side * side) { walled.add(d.level); wall += 4 * side * (d.cover ?? f.z1 - f.z0) }
    }
    const lv = [...new Set(decks.map((d) => `L${d.level}`))].join(', ')
    put('deckPlanted', 'Planted deck of the open storey', t, planted, lv)
    put('deckHard', 'Hard deck of the open storey', t, hard, lv)
    put('deckNone', 'No-access deck of the open storey (membrane)', t, none, 'deck use none: no pavers, soil or guard screens')
    put('soffit', 'Soffit over the open storey', t, soffit, lv)
    put('coreWall', 'Core wall outdoors at the open garden', t, wall, [...walled].map((l) => `L${l}`).join(', '))
    put('screen', `Screens at the open edges (${SCREEN_H} m)`, t, screen, lv)
    if ((c.supplementalDamping ?? 0) > 0) put('damper', 'Declared supplementary damper (allowance)', t, 1, c.damperNote?.trim() || undefined)
    const cars = c.publicLifts != null ? (towers.indexOf(t) === 0 ? Math.max(0, c.publicLifts) : 0) : t.skyRoom?.access === 'dedicated' ? liftCheck(t).rises.filter((r) => r.cls === 'public').reduce((s, r) => s + r.cars, 0) : 0
    put('publicLift', 'Public lift cars', t, cars, c.publicLifts != null ? 'declared' : 'the sky room’s dedicated public lifts')
  }
  if (towers.length && (c.trees ?? 0) > 0) put('tree', 'Trees at height', towers[0], Math.round(c.trees!), 'declared')
  // trees at grade at their own rate (gap G40/T22): the count typed, else the ground wind's trees
  const windTrees = (c.groundPorous ?? []).filter((o) => o?.kind === 'tree').length
  const atGrade = c.treesAtGrade != null ? Math.max(0, Math.round(c.treesAtGrade)) : windTrees
  if (towers.length && atGrade > 0) put('treeGrade', 'Trees at grade', towers[0], atGrade, c.treesAtGrade != null ? 'declared' : 'the ground wind study’s trees')
  return { lines, total: lines.reduce((s, l) => s + l.cost, 0), low: lines.reduce((s, l) => s + l.low, 0), high: lines.reduce((s, l) => s + l.high, 0) }
}
