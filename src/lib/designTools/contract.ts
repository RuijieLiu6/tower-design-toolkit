// Connected design tools (Ruijie's brief, 11 Nov 2026): an independently developed tool joins the Toolkit as a workflow
// node that proposes design changes. Three records, kept apart:
//   ToolDefinition  tower-studio-design-tool@1: a reusable description of the tool (what it is, how it connects, what
//                   it reads and may change). Installed into My tools; never touches the project.
//   ToolInstance    the tool in this project: the targets picked, the parameters it last used, its runs and the
//                   mapping from Toolkit objects to the tool's own keys. One per tool per project (node id = tool id).
//   Proposal        tdt-design-tool@1: what the tool wants changed, returned over postMessage. Validated
//                   (validate.ts) and previewed before Apply (apply.ts) turns it into one project change.
// The evaluation package format tower-studio-node@1 (lib/nodePackages.ts) is untouched; its sandbox never sees this.
import type { PhaseId } from '../phases'
import type { UseId } from '../../engine/types'

export const DESIGN_TOOL_FORMAT = 'tower-studio-design-tool@1'
export const PROTOCOL = 'tdt-design-tool@1'
/** Node ids of design tools in the workflow: `tool.` + the definition's handle (lib/workflow/projectWorkflow.ts knownNode). */
export const TOOL_PREFIX = 'tool.'

export type OperationKind = 'replace-geometry' | 'set-parameter'
/** The tower fields a tool may set directly (brief §7: implemented, validated parameters only). */
export const SETTABLE_FIELDS = ['width', 'depth', 'height', 'f2f', 'rotation', 'podiumHeight', 'podiumWidth', 'podiumDepth'] as const
export type SettableField = (typeof SETTABLE_FIELDS)[number]

export interface ToolDefinition {
  format: typeof DESIGN_TOOL_FORMAT
  /** Stable: `tool.<handle>`; the handle is lower-case letters, digits and hyphens. */
  id: string
  version: string
  name: string
  purpose: string
  author: { name: string; url?: string }
  licence: string
  /** Icon brief or uploaded artwork, as node packages carry it (lib/nodeIcons/fromPackage.ts); absent: the fallback tile. */
  icon?: unknown
  phases: PhaseId[]
  /** One method in this milestone: a web page in an iframe, talking postMessage with a pinned origin. */
  connection: { method: 'web'; url: string; origin: string; protocol: typeof PROTOCOL }
  runtime: { browser: true; network: string[] }
  inputs: ('tower.selected' | 'site.outline')[]
  outputs: ('geometry.storeys' | 'parameters')[]
  operations: OperationKind[]
  units: { length: 'm'; frame: 'tower-local'; up: 'z' }
  destination: { sends: string[]; to: string; stores: string }
  limits: string[]
  editability: 'externally-generated' | 'native-parameters'
}

export interface ToolRun {
  runId: string
  sentAt: string
  baseRevision: string
  status: 'sent' | 'returned' | 'applied' | 'discarded' | 'cancelled' | 'stale' | 'rejected'
  note?: string
}
export interface ToolInstance {
  toolId: string
  toolVersion: string
  /** Toolkit tower ids the tool works on (one in this milestone). */
  targets: string[]
  /** The tool's own state as it last sent it (opaque to the Toolkit; shown to the person as text). */
  parameters: Record<string, unknown> | null
  runs: ToolRun[]
  /** Toolkit object id → the tool's key for it. */
  mappings: Record<string, string>
}

export interface SnapshotTarget {
  id: string
  name: string
  width: number
  depth: number
  height: number
  storeys: number
  f2f: number
  rotation: number
  podium: { height: number; width: number; depth: number }
  /** Plan outline in the tower-local frame (m), counter-clockwise. */
  footprint: [number, number][]
}
/** What goes to the tool: the selected target only, the frame, and the tool's own last parameters (brief §6 scope). */
export interface InputSnapshot {
  protocol: typeof PROTOCOL
  type: 'tdt:inputs'
  sessionId: string
  runId: string
  projectId: string
  toolId: string
  baseRevision: string
  units: ToolDefinition['units']
  frame: { northDeg: number; groundElevation: number }
  targets: SnapshotTarget[]
  parameters: Record<string, unknown> | null
}

export interface ProposalStorey {
  z0: number
  z1: number
  /** Plate outlines in the tower-local frame (m); first loop outer, counter-clockwise; later loops holes. */
  loops: [number, number][][]
  podium?: boolean
  use?: UseId
}
export interface ReplaceGeometryOp { op: 'replace-geometry'; target: string; storeys: ProposalStorey[]; keep?: ('name' | 'bands' | 'skyLobbies' | 'interior')[] }
export interface SetParameterOp { op: 'set-parameter'; target: string; field: SettableField; value: number }
export type Operation = ReplaceGeometryOp | SetParameterOp

export interface Proposal {
  protocol: typeof PROTOCOL
  type: 'tdt:proposal'
  toolId: string
  toolVersion: string
  sessionId: string
  runId: string
  projectId: string
  baseRevision: string
  units: ToolDefinition['units']
  operations: Operation[]
  /** The tool's state that made this, kept with the tower for regeneration. */
  parameters: Record<string, unknown> | null
  assumptions: string[]
  warnings: string[]
}

/** Hard limits on returned geometry (brief §7: finite, sensible bounds, bounded complexity). */
export const LIMITS = { maxHeight: 600, maxPlate: 12_000, maxStoreys: 200, maxLoopPoints: 512, maxBytes: 8_000_000, minFloorArea: 25 } as const
