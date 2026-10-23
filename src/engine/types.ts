import type { InteriorInput } from './interior'
// Shared types for Layer 0 and evaluation results.

export type UseId = 'retail' | 'office' | 'hotel' | 'residential' | 'civic' | 'amenity' | 'mechanical'

export const USES: Record<UseId, { label: string; color: string; nonResidential: boolean }> = {
  retail: { label: 'Retail / commercial', color: '#e3a07a', nonResidential: true },
  office: { label: 'Office', color: '#6b8fb5', nonResidential: true },
  hotel: { label: 'Hotel', color: '#e8b84a', nonResidential: true },
  residential: { label: 'Residential', color: '#9bbf85', nonResidential: false },
  civic: { label: 'Civic / cultural', color: '#b48ac4', nonResidential: true },
  amenity: { label: 'Public amenity', color: '#6cc0b8', nonResidential: true },
  mechanical: { label: 'Mechanical', color: '#a3a3a3', nonResidential: true },
}

/** A program band: a share of the tower's floors, stacked bottom-up in list order. */
export interface Band { use: UseId; share: number }

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
  /** Schematic: core share follows what the lifts, stairs and risers need (default on). */
  coreAuto?: boolean
  /** Schematic: tower floor levels used as sky lobbies (transfer floors, counted as public amenity). */
  skyLobbies?: number[]
  /** Schematic: levels with outrigger or belt-truss floors (structure screening; the floor keeps its use). */
  outriggerFloors?: number[]
  /** Schematic: one sky lobby opened to the public as a sky room (null = none). */
  skyRoom?: SkyRoom | null
  /** Schematic: where the exit stairs sit (default: opposite corners of the core). */
  stairPlacement?: StairPlacement
  /** Imported massing (research P14-M02/M04): floors come from slicing the model instead of the parametric box. */
  imported?: ImportedMass
  /** Schematic: interior layout (unit mix, hotel keys, activities). When set, lifts, egress and economics use its counts (engine/interior.ts). */
  interior?: InteriorInput
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
}

/**
 * Exit stair positions (team assumption on geometry): 'core' = opposite corners of the core; 'mixed' = one in the core,
 * one at the far corner of the plate; 'perimeter' = opposite corners of the plate. Stairs outside the core leave the
 * core smaller but take lettable floor and facade.
 */
export type StairPlacement = 'core' | 'mixed' | 'perimeter'

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
