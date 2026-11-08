// Design nodes (Ruijie, 7 Nov: "Clicking a design node opens its corresponding tool. Clicking an analysis node opens its
// settings or results", and "Massing → Sunlight study → Return to Massing"). Each design step of the guided app is a node
// of the project workflow, so the order of work can name the design activity itself, an analysis can follow it, and a
// loop can return to it. They are not checks: they never switch an analysis on or off, and they are never counted as one.
import type { PhaseId } from '../phases'
import type { StepId } from '../step'

export interface DesignNode { id: string; name: string; word: string; phase: PhaseId; step: StepId; about: string }

export const DESIGN_NODES: DesignNode[] = [
  { id: 'design.site', name: 'Site', word: 'Site', phase: 'site', step: 'site', about: 'Choose the site, or bring your own model.' },
  { id: 'design.massing', name: 'Massing', word: 'Massing', phase: 'form', step: 'volume', about: 'Place and shape the towers.' },
  { id: 'design.program', name: 'Program', word: 'Program', phase: 'program', step: 'program', about: 'Stack the uses; shape the ground floor and public space.' },
  { id: 'design.plates', name: 'Plates, core and plant', word: 'Core & plates', phase: 'schematic', step: 'plates', about: 'Floor plates, the core, lifts, stairs and plant.' },
  { id: 'design.frame', name: 'Frame and capture', word: 'Frame', phase: 'present', step: 'frame', about: 'Frame views, capture and compose the boards.' },
]
const BY_ID = new Map(DESIGN_NODES.map((d) => [d.id, d]))

export const isDesignNode = (id: string) => BY_ID.has(id)
export const designNode = (id: string) => BY_ID.get(id)
/** The design node of a step (the one the open tool belongs to). */
export const designForStep = (step: StepId) => DESIGN_NODES.find((d) => d.step === step)
/** Ids that are analysis checks (what `enabled` switches): everything but the design nodes and the two ends. */
export const analysisOnly = (ids: string[]) => ids.filter((id) => !isDesignNode(id) && id !== 'start' && id !== 'enter')

const PHASE_ORDER: PhaseId[] = ['site', 'form', 'program', 'schematic', 'present']
/**
 * A preset's checks, with the design step that leads each phase they use put in front of that phase's checks: a list of
 * checks becomes a design process ("Site, Hard rules, Massing, Shadow, …"). Design nodes already present stay where
 * they are; phases with no check get no design node.
 */
export function withDesignSteps(nodes: string[], phaseOf: (id: string) => PhaseId | undefined): string[] {
  if (nodes.some(isDesignNode)) return nodes
  const out: string[] = []
  const seen = new Set<PhaseId>()
  const ordered = [...nodes].sort((a, b) => PHASE_ORDER.indexOf(phaseOf(a) ?? 'site') - PHASE_ORDER.indexOf(phaseOf(b) ?? 'site'))
  for (const id of ordered) {
    const ph = phaseOf(id) ?? 'site'
    if (!seen.has(ph)) { seen.add(ph); const d = DESIGN_NODES.find((x) => x.phase === ph); if (d) out.push(d.id) }
    out.push(id)
  }
  return out
}
