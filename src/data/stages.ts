// The three design stages. A stage changes how the model is drawn, which tools are offered and the
// chrome palette; it never removes capability (except the Present model lock). Evaluate is a lens on every stage.
// Design source: 04 Tool Plan/research/ux-modes (U1, U2), one critique round.
import { Blocks, Gauge, PencilRuler, Presentation, type LucideIcon } from '../components/icons'
import type { Phase } from '../store'
import { MODEL } from '../lib/design/tokens'

export interface StageDef {
  id: Phase
  label: string
  subtitle: string
  key: string
  icon: LucideIcon
  purpose: string
}

export const STAGES: StageDef[] = [
  { id: 'basic', label: 'Massing', subtitle: 'Basic model', key: '1', icon: Blocks, purpose: 'Find a defensible volume and program mix fast.' },
  { id: 'advanced', label: 'Schematic', subtitle: 'Advanced model', key: '2', icon: PencilRuler, purpose: 'Test that the massing can be built: plates, core, plant.' },
  { id: 'present', label: 'Present', subtitle: 'Frame and compose', key: '3', icon: Presentation, purpose: 'Compose evidence-labelled shots for the boards.' },
]
export const stageDef = (p: Phase) => STAGES.find((s) => s.id === p)!
export const EVALUATE = { label: 'Evaluate', icon: Gauge }

/** Process rail: the mental map of the design, each step owned by a stage. */
export const PROCESS: { id: string; label: string; stage: Phase }[] = [
  { id: 'site', label: 'Site', stage: 'basic' },
  { id: 'volume', label: 'Form', stage: 'basic' },
  { id: 'program', label: 'Program', stage: 'basic' },
  { id: 'plates', label: 'Plates, core, plant', stage: 'advanced' },
  { id: 'frame', label: 'Frame and capture', stage: 'present' },
]

/** Viewport looks (three.js materials cannot read CSS variables, so they live here). */
export interface Look {
  background: string
  ground: string
  site: string
  context: string
  heritage: string
  edge: string
  hemi: number
  /** Real Vancouver: the 0 m sea plane and terrain at or below 0 m. */
  water: string
  /** Real Vancouver: the City's 2002 shoreline line. */
  shore: string
  /** Real Vancouver: park tint, multiplied into the ground colour (white = no change). */
  park: string
  /** Real Vancouver: buildings with the City's 2009 heights (older survey), a shade off the measured 2022 clay. */
  older: string
  /** Site-model base: skirt walls and underside, a shade darker than the ground on top. */
  plinth: string
  /** Site-model base: the crisp line along its top edge. */
  plinthEdge: string
}
/**
 * Clay is the neutral architectural model of the design system (§9, lib/design/tokens.ts MODEL): a cool light background
 * and ground, existing buildings one grey step below the proposal, quiet block lines, the base a shade darker with a crisp
 * edge. Water and parks keep a muted tint of their own (map information, not emphasis).
 */
export const LOOKS: Record<'clay' | 'xray', Look> = {
  clay: { background: MODEL.background, ground: MODEL.ground, site: '#eef1f5', context: MODEL.context, heritage: MODEL.context, edge: '#aab3bf', hemi: 0.9, water: '#c3d0dc', shore: '#6f8ba1', park: '#dce7d6', older: '#bcc3cc', plinth: '#d3d9e0', plinthEdge: MODEL.edge },
  xray: { background: '#e9eef3', ground: '#dfe6ed', site: '#eef3f8', context: '#f4f7fa', heritage: '#eef1f4', edge: '#9fb0c2', hemi: 1.25, water: '#bccee0', shore: '#7393b2', park: '#e3efe6', older: '#e2e8ee', plinth: '#c6d0db', plinthEdge: '#6f849c' },
}

/** Motion tokens (ms). Exits run shorter than entries. */
export const MOTION = { feedback: 100, chrome: 200, stageIn: 480, stageOut: 320, lensIn: 750, lensOut: 500 }
