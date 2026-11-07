// The phases a workflow runs through, and what each one offers (Ruijie, 7 Nov: "prioritize showing the concept through
// customization, provide a lot of ways that users can design their workflow, which around different phases of using
// different tools"). Each phase is a step of the guided app with its design tools (always there) and the analysis nodes
// that fit it (switched on or off per workflow). Every built node sits in exactly one phase (lib/phases.test.ts).
import type { StepId } from './step'
import type { ToolIconId } from '../data/icons'

export type PhaseId = 'site' | 'form' | 'program' | 'schematic' | 'present'

export interface Phase {
  id: PhaseId
  name: string
  step: StepId
  /** One line, shown on hover. */
  about: string
  /** The design tools this phase opens with (tool ids; icons and words in data/icons.ts). */
  tools: ToolIconId[]
  /** The analysis nodes that fit this phase. */
  nodes: string[]
}

export const PHASES: Phase[] = [
  {
    id: 'site', name: 'Site', step: 'site', about: 'Choose the site, bring your model, read the views and heights it allows.',
    tools: ['site', 'rhino-import'],
    nodes: ['built.vtc-rules', 'built.model', 'built.viewcones', 'built.relax-aviation', 'built.heights', 'built.view-from', 'built.vista'],
  },
  {
    id: 'form', name: 'Form', step: 'volume', about: 'Place and shape the tower; read sun, shadow and wind as it changes.',
    tools: ['towers', 'height-suggestion', 'generate', 'massing', 'sun', 'basement'],
    nodes: ['built.sun', 'built.solar-access', 'built.wind-screen', 'built.wind-study', 'built.city-in-nature'],
  },
  {
    id: 'program', name: 'Program', step: 'program', about: 'Stack the uses, test floor area and value, shape the ground and public space.',
    tools: ['program', 'ground', 'brief'],
    nodes: ['built.fsr', 'built.economics', 'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', 'built.sky-room', 'built.trips', 'built.mobility'],
  },
  {
    id: 'schematic', name: 'Schematic', step: 'plates', about: 'Core, lifts, stairs, structure, facade and energy: can it be built?',
    tools: ['core', 'anatomy', 'plan', 'section'],
    nodes: ['built.core-lifts', 'built.egress', 'built.life-safety', 'built.structure', 'built.wind-procedure', 'built.interior', 'built.daylight-depth', 'built.facade', 'built.energy-carbon'],
  },
  {
    id: 'present', name: 'Present', step: 'frame', about: 'Frame views, capture and compose the boards, with the claims and AI use on record.',
    tools: ['camera', 'capture', 'boards', 'drawings', 'render'],
    nodes: ['built.culture-claims', 'built.provenance'],
  },
]

export const phaseOfNode = (id: string): Phase | undefined => PHASES.find((p) => p.nodes.includes(id))

/**
 * Each phase's colour (HSL hue), worn by the phase and by every node that belongs to it wherever nodes are grouped by
 * phase (Ruijie, 7 Nov: "use the same colour for the phases … and make them match on the icons … so that they would
 * sort of know which one they should put into"): sky, coral, yellow, violet, magenta.
 */
export const PHASE_HUE: Record<PhaseId, number> = { site: 206, form: 14, program: 48, schematic: 268, present: 300 }
/** A node's phase colour (the Site colour for a node in no phase). */
export const phaseHue = (id: string) => PHASE_HUE[phaseOfNode(id)?.id ?? 'site']
/** The first phase that has a node switched on (where the guided app should open), else Site. */
export const firstPhase = (nodes: string[]): Phase => PHASES.find((p) => p.nodes.some((n) => nodes.includes(n))) ?? PHASES[0]
