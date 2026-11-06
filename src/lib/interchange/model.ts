// Layer 0 interchange model (tower-studio-interchange@1): one uploaded model, its elements by role with stable ids,
// semantic tags, source provenance and the frame (units, north, datum) it was placed with. It travels inside the
// project file (tower-studio-project@1, optional `models` key), so every tool reads the same model. Spec: INTERCHANGE.md.
// Types and constants only: no three.js, no rhino3dm, so engines, tests and the app can all import it.
import type { Flag, UseId } from '../../engine/types'

export const INTERCHANGE_VERSION = 'tower-studio-interchange@1'

export type Role = 'tower' | 'podium' | 'site' | 'context' | 'program' | 'core' | 'basement' | 'landscape' | 'urban' | 'ignore'
export type Pt = [number, number]
export type P3 = [number, number, number]

/** Roles a layer (or object name, or user-string value) can be mapped to, in the order the mapping screen lists them. */
export const ROLES: { id: Role; label: string; hint: string; color: string }[] = [
  { id: 'tower', label: 'Tower massing', hint: 'Closed volumes of a tower; separate towers are found by plan overlap', color: '#1f5f8b' },
  { id: 'podium', label: 'Podium', hint: 'Sets the podium top and its storeys exactly', color: '#7f9fb8' },
  { id: 'program', label: 'Program (floor or zone)', hint: 'Volumes that tag the storeys they contain with a use; they count as massing too', color: '#b5651d' },
  { id: 'core', label: 'Core', hint: 'Core outline per storey sets the core share (instead of the lift sizing)', color: '#2b3f55' },
  { id: 'site', label: 'Site boundary', hint: 'Closed curves (or a flat surface) for the lot line', color: '#2a9d8f' },
  { id: 'context', label: 'Context buildings', hint: 'Existing buildings: cast shadows in the solar check', color: '#9a958b' },
  // From the Rhino link's layers (6 Nov): what is dug below grade, and the ground's landscape and urban design.
  { id: 'basement', label: 'Below grade', hint: 'Basement volumes under the entrance floor: they set the basement levels of the tower above them', color: '#3d5a80' },
  { id: 'landscape', label: 'Landscape', hint: 'Planting, lawns, trees and soft ground: drawn on the site', color: '#6f9f5a' },
  { id: 'urban', label: 'Urban design', hint: 'Paving, plazas, canopies, street furniture and lighting: drawn on the site', color: '#b39a6b' },
  { id: 'ignore', label: 'Ignore', hint: 'Left out, and listed as ignored', color: '#c9ccd1' },
]
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label])) as Record<Role, string>
export const ROLE_COLOR = Object.fromEntries(ROLES.map((r) => [r.id, r.color])) as Record<Role, string>
/** Roles whose volumes are sliced into storeys. */
export const MASSING_ROLES: Role[] = ['tower', 'podium', 'program']

/** Where one element came from. Every element carries one, so any result can be traced back to a Rhino object. */
export interface Provenance {
  file: string
  format: string
  /** Layer path (Rhino), group (OBJ), node path (glTF) or IFC class. */
  layer: string
  /** Object id in the file (Rhino GUID) when the format has one. */
  objectId: string | null
  objectName: string
  objectType: string
  userStrings?: Record<string, string>
  /** How the geometry was obtained (saved render mesh, planar faces, prism, block placement, curve). */
  geometrySource: string
  block?: string
  /** What decided the role: the mapping row, keyed by layer, object name or a user-string value. */
  mappedBy: string
  /** Evidence flag of the role and tags (team_assumption when guessed from a name, verified when the person set or confirmed it). */
  evidence: Flag
}

export type ElementGeometry =
  /** A volume, kept as a mesh in the import store (`meshId`, tower frame) and summarised here in the project frame. */
  | { kind: 'mesh'; bbox: [P3, P3]; footprint: Pt[]; triangles: number; meshId?: string }
  /** A plan outline at a height (site boundary). Outer rings counter-clockwise. */
  | { kind: 'polygon'; rings: Pt[][]; z: number }
  /** An extruded footprint (context buildings). */
  | { kind: 'prism'; rings: Pt[][]; z0: number; z1: number }

export interface ElementTags {
  use?: UseId
  /** Level from a `level` user string, when the file gives one. */
  level?: number
  /** Id of the tower record (Tower.id) the element belongs to. */
  towerId?: string
}

export interface ModelElement {
  /** Stable: an `element_id` user string when present (a round trip), else role + Rhino object id. */
  id: string
  role: Role
  name: string
  tags: ElementTags
  geometry: ElementGeometry
  provenance: Provenance
}

/** One tower found in the model: the elements it was built from and the storey schedule it was sliced at. */
export interface ModelTower {
  /** Tower record id (Tower.id) in the project. */
  id: string
  name: string
  elementIds: string[]
  schedule: { f2f: number; podiumTop: number; podiumF2F: number; podiumSource: string }
  /** Core share measured from core elements, null when the model has none (then the lifts size the core). */
  coreShare: number | null
  /** Storeys whose use came from a program element (the rest follow the tower's program bands). */
  taggedStoreys: number
}

export type CheckSeverity = 'info' | 'warn' | 'block'
/** A plain-language validation line shown before the model is used, and kept with it. */
export interface ModelCheck { id: string; severity: CheckSeverity; text: string; flag?: Flag }

export type MapBy = 'layer' | 'name' | 'userString'
export interface MappingRule { role: Role; use?: UseId }
export interface Mapping {
  by: MapBy
  /** User-string key when mapping by user string. */
  key: string
  rules: Record<string, MappingRule>
  /** Rows the person changed or confirmed in the mapping screen (the rest were guessed). */
  confirmed?: string[]
}

export interface IgnoredItem { name: string; layer: string; kind: string; reason: string; objectId?: string }

export interface InterchangeModel {
  version: typeof INTERCHANGE_VERSION
  /** Stable for the same file: a hash of its name, size and content fingerprint. */
  id: string
  project: 'vtc' | 'city'
  source: { fileName: string; format: string; fileSize: number | null; fingerprint: string | null; unitNote: string; northNote: string }
  frame: {
    units: 'm'
    fileUnit: string
    unitSource: 'file' | 'confirmed' | 'chosen'
    /** File units to metres. */
    scale: number
    upAxis: 'z' | 'y'
    /** True north of the file, degrees clockwise from its +Y (null = unresolved), and the turn applied to the project. */
    north: { fileNorthDeg: number | null; rotation: number; label: string; flag: Flag }
    /** Metres subtracted from file heights so z = 0 is the entrance floor. */
    datum: { shift: number; label: string; flag: Flag }
    /** Model centre in the file (scaled) and where it sits in the project frame. */
    placement: {
      mode: string; fileCentre: Pt; x: number; y: number
      /** Aligned to the map by hand: a model point (file plan, m) on a project point, turned (degrees counter-clockwise). */
      anchor?: { model: Pt; city: Pt; turn: number }
      /** Aligned by the file's Earth anchor (Rhino): its latitude and longitude, plus any turn. */
      earth?: { lat: number; lon: number; turn: number }
    }
  }
  mapping: Mapping
  elements: ModelElement[]
  towers: ModelTower[]
  ignored: IgnoredItem[]
  checks: ModelCheck[]
}

export const isInterchangeModel = (x: unknown): x is InterchangeModel => !!x && typeof x === 'object' && (x as { version?: unknown }).version === INTERCHANGE_VERSION

/** Short deterministic hash (FNV-1a, 32 bit) as 8 hex digits. */
export function hash8(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
