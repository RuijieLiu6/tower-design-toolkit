import type { InteriorInput } from './interior'
import { DATA } from '../lib/design/tokens'
// Shared types for Layer 0 and evaluation results.

export type UseId = 'retail' | 'office' | 'hotel' | 'residential' | 'civic' | 'amenity' | 'mechanical'

/**
 * Building uses in the design system's categorical data palette (lib/design/tokens.ts DATA.categorical; §9: uses are
 * kinds, labelled, never ordered), one colour per use across the 3D Program mode, plans, sections, charts and exports.
 * Never the workflow phase colours. Each keeps its old hue family (office blue, retail orange, homes green…).
 */
export const USES: Record<UseId, { label: string; color: string; nonResidential: boolean }> = {
  retail: { label: 'Retail / commercial', color: DATA.categorical[1], nonResidential: true },
  office: { label: 'Office', color: DATA.categorical[0], nonResidential: true },
  hotel: { label: 'Hotel', color: DATA.categorical[5], nonResidential: true },
  residential: { label: 'Residential', color: DATA.categorical[2], nonResidential: false },
  civic: { label: 'Civic / cultural', color: DATA.categorical[4], nonResidential: true },
  amenity: { label: 'Public amenity', color: DATA.categorical[6], nonResidential: true },
  mechanical: { label: 'Mechanical', color: DATA.categorical[7], nonResidential: true },
}

/** A program band: a share of the tower's floors, stacked bottom-up in list order. */
export interface Band {
  use: UseId
  share: number
  /** Floor-to-floor of this band's floors (m); absent = the tower's floor-to-floor (Section tool). */
  f2f?: number
}

export interface Tower {
  id: string
  name: string
  /** Centre of the tower footprint in the project's local frame (m). */
  x: number
  y: number
  /** Rotation of the footprint, degrees counter-clockwise. */
  rotation: number
  width: number
  depth: number
  /** Architectural top above grade (m). */
  height: number
  /** Typical floor-to-floor (m). */
  f2f: number
  podiumHeight: number
  podiumWidth: number
  podiumDepth: number
  podiumUse: UseId
  bands: Band[]
  /** Schematic: core area as a share of the tower plate (team assumption, default 0.25). */
  coreShare: number
  /** Schematic: a plant (mechanical) floor every N tower floors; 0 = none (team assumption). */
  plantEvery: number
  /** Schematic: tower levels made plant (mechanical) floors one by one (Section tool), on top of `plantEvery`. */
  plantLevels?: number[]
  /** Program: a use set floor by floor (level → use), over the bands, the podium use and plant floors; sky lobbies keep theirs. */
  floorUses?: Partial<Record<number, UseId>>
  /** Facade zones (engine/sw/plate.ts): strategy, glazing, device and operable windows by face and level, as Sun & Wind Studio's Facade tab; unset = the Studio's defaults. */
  facadeZones?: import('./sw/plate').FacadeZone[]
  /** Facade material (illustrative; components/setup/SetupPanel.tsx). No check reads it yet. */
  material?: string
  /** Schematic: core share follows what the lifts, stairs and risers need (default on). */
  coreAuto?: boolean
  /** Schematic: tower floor levels used as sky lobbies (transfer floors, counted as public amenity). */
  skyLobbies?: number[]
  /**
   * Core centre placed by hand, in the tower's own frame (m from the tower origin, before the tower's rotation), for a
   * massing that carries no core (an imported model). Absent: the core is read from the model (engine/storeyWeight.ts
   * `coreCentre`). Used by the structure checks, the X-ray core and the export.
   */
  coreCentre?: [number, number]
  /**
   * Schematic: a core that steps with the tiers (gap G18). From `fromLevel` up, the core is a square of `side` metres,
   * centred at `centre` (tower frame, m) or, absent, at the core centre below; below the first step the core is the one
   * the core share sets. Absent or empty: one core for the whole height, as before. engine/massing.ts `coreSideAt`.
   */
  coreSteps?: CoreStep[]
  /** Schematic: levels with outrigger or belt-truss floors (structure screening; the floor keeps its use). */
  outriggerFloors?: number[]
  /** Schematic: one sky lobby opened to the public as a sky room (null = none). */
  skyRoom?: SkyRoom | null
  /** Schematic: where the exit stairs sit (default: opposite corners of the core). */
  stairPlacement?: StairPlacement
  /**
   * Schematic: the plate corner of the edge stair ('mixed'; the core stair takes the opposite core corner) or of one of
   * the two corner stairs ('perimeter'), in the tower's own frame before its rotation: e = +x (along the width),
   * n = +y (along the depth). Absent: 'sw', the (−x, −y) corner, as before. Ignored with both stairs in the core.
   * engine/egress.ts `cornerToward` finds the corner facing a true compass bearing.
   */
  stairCorner?: StairCorner
  /**
   * Schematic: the edge stair's centre placed by hand, in the tower's own frame (m), for 'mixed' (the edge stair) or
   * 'perimeter' (the stair of the chosen corner). Absent: at the corner, or, for a twisted imported tower, where a
   * straight shaft fits every storey (engine/egress.ts straightStairs, G31). Ignored with both stairs in the core.
   */
  stairAt?: [number, number]
  /** Schematic: exits of the podium itself (stairs at its edge, doors at grade), on top of the tower's core stairs. Absent: none. */
  podiumExits?: PodiumExits
  /** Imported massing (research P14-M02/M04): floors come from slicing the model instead of the parametric box. */
  imported?: ImportedMass
  /** A mass drawn with the shape tools (engine/drawn.ts); `imported` is built from it. */
  drawn?: import('./drawn').DrawnMass
  /** Basement levels dug under the podium or the tower (engine/basement.ts); never floor area above grade. */
  basement?: import('./basement').Basement
  /** Schematic: interior layout (unit mix, hotel keys, activities). When set, lifts, egress and economics use its counts (engine/interior.ts). */
  interior?: InteriorInput
  /**
   * Stacked blocks, bottom-up (after Vista's proposal parts, Ruijie Liu). When present they are the massing; height,
   * width, depth and the podium fields are then derived from them (engine/massing.ts `withBlocks`). Absent on old saves:
   * the tower then reads as two blocks, podium and tower.
   */
  blocks?: Block[]
  /**
   * The box fields as derived when the blocks were last set. A box field changed later (without new blocks) is fitted
   * onto the blocks; with no snapshot, the blocks win (engine/blocks.ts `blocksOf`).
   */
  boxFromBlocks?: Pick<Tower, 'height' | 'width' | 'depth' | 'podiumHeight' | 'podiumWidth' | 'podiumDepth'>
  /** Lined up with its lot once, automatically, on placing or first selecting it (lib/autoAlign.ts); later turns are the user's. */
  autoAligned?: boolean
  /** The tower form shaping the shaft (engine/towerForms.ts, after dtmass): its type, parameters and the base it starts from. */
  form?: { type: import('./towerForms').FormType; p: Record<string, number>; base: import('./towerForms').FormBase }
}

/** One step of a core that steps with the tiers (`Tower.coreSteps`): from this floor level up, a square core of this side. */
export interface CoreStep {
  /** First floor level (the storey's level number) that has this core. */
  fromLevel: number
  /** Side of the square core (m). */
  side: number
  /** Core centre in the tower's own frame (m); absent: the centre of the core below. */
  centre?: [number, number]
}

/** A drawn mass (lib/draw/mass.ts): outline rings in the project frame (metres), base above grade, storeys and their height. */
export interface DrawnMass {
  pts: [number, number][]
  base: number
  floors: number
  f2f: number
  holes?: [number, number][][]
  /** The building this mass is a part of (a Boolean union, a Split); parts move together and keep their own heights. */
  part?: string
  /** A placed core: a plan rectangle (project frame). */
  core?: { x: number; y: number; w: number; d: number }
}

/** One stacked block of a parametric tower: a rectangle in plan, sitting on the block below. */
export interface Block {
  id: string
  name?: string
  height: number
  width: number
  depth: number
  /** Plan offset of the block centre from the tower centre, in the tower's own frame (m). */
  dx: number
  dy: number
  /** Rotation relative to the tower, degrees counter-clockwise (a twist). */
  rotation: number
  /** Podium block: podium floor-to-floor and the podium use. Only the leading run of blocks counts as podium. */
  podium?: boolean
  /**
   * Use of this podium block's floors, when it differs from the tower's podium use (a generated podium with retail at
   * grade and office or amenity storeys above it, engine/dtmassGen.ts). Absent: the tower's `podiumUse`.
   */
  use?: UseId
  /** Storey height of this podium block's floors (a generated podium: retail at 5 m, office at 3.9 m); absent: about 4.5 m. */
  f2f?: number
}

/** One storey of an imported mass, cut at mid-height (research P14-M04, Path A). */
export interface ImportedStorey {
  level: number
  z0: number
  z1: number
  /** Plate area at mid-height (m²), overlaps counted once. */
  area: number
  use: UseId
  podium: boolean
  /** False for voids (atria, double-height space, spire): kept in the schedule, left out of floor area. */
  hasFloor: boolean
  /** Plate outlines in the tower frame (m); outer rings counter-clockwise, holes clockwise. */
  loops: [number, number][][]
  /**
   * Outlines of the storey's glazed enclosure parts (tower frame, m), when the model marks them: glass one sees into, not
   * through. The sky-through reading (engine/silhouette.ts) counts it as blocked and reports it apart (gap G23).
   */
  glazed?: [number, number][][]
  /** Id of the model element (Layer 0 interchange) that set this storey's use; absent when it follows the program bands. */
  src?: string
}

/** How an imported file was placed: units, north and zero level are confirmed by the user, never assumed. */
export interface ImportedMass {
  /** Key of the mesh in the import store (the mesh is not part of the tower record). */
  meshId: string
  fileName: string
  format: string
  unit: string
  /** How the unit was set: read from the file, guessed and confirmed, or chosen. */
  unitSource: 'file' | 'confirmed' | 'chosen'
  /** True north, degrees clockwise from the file's +Y; null = unresolved. */
  fileNorthDeg: number | null
  northSource: string
  /** Metres subtracted from file heights so z = 0 is the entrance floor. */
  datumShift: number
  datumSource: string
  f2f: number
  podiumTop: number
  podiumF2F: number
  storeys: ImportedStorey[]
  /** Plan outline of the whole mass (convex hull, tower frame, m). */
  hull: [number, number][]
  /** Mesh volume (m³) when the mesh is closed, for the plate-sum cross-check. */
  volume: number | null
  /** Highest point above the entrance floor (m). */
  top: number
  health: { block: number; warn: number }
  /** The uploaded model this tower came from (lib/interchange): model id, the tower's key in it and its element ids. */
  source?: { modelId: string; towerKey: string; elementIds: string[] }
}

/**
 * Exit stair positions (team assumption on geometry): 'core' = opposite corners of the core; 'mixed' = one in the core,
 * one at the far corner of the plate; 'perimeter' = opposite corners of the plate. Stairs outside the core leave the
 * core smaller but take lettable floor and facade.
 */
export type StairPlacement = 'core' | 'mixed' | 'perimeter'
/** A plate corner in the tower's own frame: e = +x (width), n = +y (depth). */
export type StairCorner = 'ne' | 'nw' | 'se' | 'sw'
/**
 * Podium exits for travel distance (engine/egress.ts): positions, or a count spread evenly round the podium edge
 * (team assumption on where they sit). `at` wins over `count`; none (or count 0) = only the tower's core stairs.
 */
export interface PodiumExits {
  /** Exits spread evenly round the podium perimeter, the first half a spacing from the (−x, −y) corner. */
  count?: number
  /** Exit positions in the tower's own frame (m from the tower centre, x along the width, y along the depth), on or near the podium edge. */
  at?: [number, number][]
}

/** A public room at a sky lobby level (research P06-M07, P11-M02). Every preset here is a team assumption. */
export interface SkyRoom {
  /** Sky lobby level that becomes public. */
  level: number
  /** Visitors ride the tenants' shuttle, or their own public lifts (security separation, more shafts). */
  access: 'shared' | 'dedicated'
  /** Free to enter (the Bay Parkade rezoning secured free resident access; Vancouver Lookout is ticketed). */
  free: boolean
  /** Hours open per day. */
  hoursOpen: number
  /** Share of the floor's net area open to visitors; the rest is the tenant lift lobby and back of house. */
  visitorShare: number
  /** Occupant-load basis for the visitor area (VBBL Table 3.1.17.1): dining 1.20 or standing 0.40 m² per person. */
  loadBasis: 'dining' | 'standing'
  /** Average visit length (min); sets peak visitors per hour from the occupant load. */
  visitMinutes: number
  /** Posted occupant limit for the visitor room (people); null = the Table 3.1.17.1 load. */
  postedLimit?: number | null
}

export interface Floor { level: number; z0: number; z1: number; use: UseId; area: number; podium: boolean; skyLobby?: boolean }

/** Evidence status, shared with the research logs. */
export type Flag = 'verified' | 'team_assumption' | 'unverified' | 'unresolved' | 'false_assumption'

export interface Source { label: string; page?: string; url?: string }

export type RuleState = 'pass' | 'fail' | 'warn' | 'unknown'

export interface RuleResult {
  id: string
  label: string
  value: string
  threshold: string
  state: RuleState
  flag: Flag
  source: Source
  note?: string
}
