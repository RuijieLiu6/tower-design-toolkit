// The three design stages. A stage changes how the model is drawn, which tools are offered and the
// chrome palette; it never removes capability (except the Present model lock). Evaluate is a lens on every stage.
// Design source: 04 Tool Plan/research/ux-modes (U1, U2), one critique round.
import { Cuboid, Gauge, PencilRuler, Presentation, type LucideIcon } from 'lucide-react'
import type { Phase } from '../store'

export interface StageDef {
  id: Phase
  label: string
  subtitle: string
  key: string
  icon: LucideIcon
  purpose: string
}

export const STAGES: StageDef[] = [
  { id: 'basic', label: 'Massing', subtitle: 'Basic model', key: '1', icon: Cuboid, purpose: 'Find a defensible volume and program mix fast.' },
  { id: 'advanced', label: 'Schematic', subtitle: 'Advanced model', key: '2', icon: PencilRuler, purpose: 'Test that the massing can be built: plates, core, plant.' },
  { id: 'present', label: 'Present', subtitle: 'Frame and compose', key: '3', icon: Presentation, purpose: 'Compose evidence-labelled shots for the boards.' },
]
export const stageDef = (p: Phase) => STAGES.find((s) => s.id === p)!
export const EVALUATE = { label: 'Evaluate', icon: Gauge }

/** Process rail: the mental map of the design, each step owned by a stage. */
export const PROCESS: { id: string; label: string; stage: Phase }[] = [
  { id: 'site', label: 'Site', stage: 'basic' },
  { id: 'volume', label: 'Volume', stage: 'basic' },
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
}
export const LOOKS: Record<'clay' | 'xray', Look> = {
  clay: { background: '#eef0f2', ground: '#e7e6e1', site: '#f7f3ea', context: '#f1efea', heritage: '#e9dfcd', edge: '#b9b6ae', hemi: 0.9, water: '#c4d4e1', shore: '#6f8ba1', park: '#e1efd6', older: '#ddd6ca' },
  xray: { background: '#e9eef3', ground: '#dfe6ed', site: '#eef3f8', context: '#f4f7fa', heritage: '#eef1f4', edge: '#9fb0c2', hemi: 1.25, water: '#bccee0', shore: '#7393b2', park: '#e3efe6', older: '#e2e8ee' },
}

/** Motion tokens (ms). Exits run shorter than entries. */
export const MOTION = { feedback: 100, chrome: 200, stageIn: 480, stageOut: 320, lensIn: 750, lensOut: 500 }
