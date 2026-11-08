// The workspace's two levels (Ruijie, 8 Nov): the top row picks the design phase (Site, Form, Program, Schematic,
// Present); the left panel shows that phase's own part of the project workflow, its tool workflow, and the active
// tool's controls under it. The same project workflow as the landing page (lib/workflow/projectWorkflow.ts): the landing
// page shows the whole process, the workspace the selected phase's portion, Overview the whole while designing.
//
// A node belongs to one phase for display (its home), but any tool can be added to any phase's workflow when a process
// needs it: a node's place in the run decides where it shows, not a fixed list.
import { create } from 'zustand'
import { BUILT_NODES, type Category } from '../../data/registry'
import { PHASES, phaseOfNode, type PhaseId } from '../phases'
import type { StepId } from '../step'
import { edgeKey, walk, type Board, type Edge } from '../workflowGraph'
import { designNode, DESIGN_NODES } from './designNodes'

export const PHASE_IDS: PhaseId[] = ['site', 'form', 'program', 'schematic', 'present']
export const PHASE_NAME: Record<PhaseId, string> = { site: 'Site', form: 'Form', program: 'Program', schematic: 'Schematic', present: 'Present' }
export const STEP_PHASE: Record<StepId, PhaseId> = { site: 'site', volume: 'form', program: 'program', plates: 'schematic', frame: 'present' }
export const PHASE_STEP: Record<PhaseId, StepId> = { site: 'site', form: 'volume', program: 'program', schematic: 'plates', present: 'frame' }

const CAT_PHASE: Partial<Record<Category, PhaseId>> = { SITE: 'site', DATA: 'site', CLIM: 'form', ECOL: 'form', PROG: 'program', PUBL: 'program', MOBI: 'program', STRC: 'schematic', SYST: 'schematic', SPAC: 'schematic', ENER: 'schematic', CULT: 'present', PRES: 'present' }
const BUILT = new Map(BUILT_NODES.map((n) => [n.id, n]))

/** A node's home phase: a design node's, a built check's phase list, a custom tool's by its category. */
export function homePhase(id: string, communityCategory?: (id: string) => Category | undefined): PhaseId {
  const d = designNode(id)
  if (d) return d.phase
  const p = phaseOfNode(id)?.id
  if (p) return p
  const c = BUILT.get(id)?.category ?? communityCategory?.(id)
  return (c && CAT_PHASE[c]) || 'site'
}

/**
 * The phase's portion of the workflow: its nodes in working order, the connections between them, and the connections
 * that leave or enter the phase (shown as small destination links, "Return to Form / Massing").
 */
export function phasePortion(b: Board, phase: PhaseId, home: (id: string) => PhaseId) {
  const run = walk(b.edges)
  const order = [...run, ...b.nodes.filter((x) => !run.includes(x))]
  const nodes = order.filter((id) => home(id) === phase)
  const inside = new Set(nodes)
  const internal: Edge[] = [], crossing: { edge: Edge; inside: string; other: string; out: boolean }[] = []
  for (const e of b.edges) {
    const ai = inside.has(e.a), bi = inside.has(e.b)
    if (ai && bi) internal.push(e)
    else if (ai && e.b !== 'enter') crossing.push({ edge: e, inside: e.a, other: e.b, out: true })
    else if (bi && e.a !== 'start') crossing.push({ edge: e, inside: e.b, other: e.a, out: false })
  }
  return { nodes, internal, crossing, keys: new Set(internal.map(edgeKey)) }
}

/**
 * The design controls an analysis tool opens with (tools/registry.ts ids): its settings live there (the sun's date and
 * hour for the sun tools; the program for floor area; the ground plane for the public realm). Its results and evidence
 * are in the right panel. A design node opens all of its phase's design tools.
 */
export const NODE_CONTROLS: Record<string, string[]> = {
  'built.sun': ['sun'], 'built.solar-access': ['sun'], 'built.heights': ['height-suggestion'],
  'built.fsr': ['program'], 'built.economics': ['program'], 'built.interior': ['program'],
  'built.pr-streetwall': ['ground'], 'built.pr-frontage': ['ground'], 'built.pr-ground': ['ground'], 'built.sky-room': ['ground'],
  'built.core-lifts': ['core'], 'built.egress': ['core'], 'built.life-safety': ['core'], 'built.structure': ['anatomy'],
}

/**
 * The open tool of each phase (a node id), remembered in this browser; the phase's design node when none is picked.
 * `placed`: tools added to a phase other than their home ("Add tool" in Form, a check from Site), so they show where
 * the user put them. Kept with the workflow in this browser and carried by phase packages.
 */
interface ActiveState {
  active: Partial<Record<PhaseId, string>>; placed: Record<string, PhaseId>; collapsed: boolean
  setActive: (p: PhaseId, id: string) => void; place: (id: string, p: PhaseId | null) => void; setCollapsed: (v: boolean) => void
}
const KEY = 'ts.phase.active', PLACED = 'ts.phase.placed'
const read = <T,>(k: string, fallback: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v && typeof v === 'object' ? v : fallback } catch { return fallback } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* this visit only */ } }
export const usePhaseTools = create<ActiveState>((set, get) => ({
  active: typeof window !== 'undefined' ? read(KEY, {}) : {},
  placed: typeof window !== 'undefined' ? read(PLACED, {}) : {},
  collapsed: false,
  setActive: (p, id) => { const active = { ...get().active, [p]: id }; set({ active }); write(KEY, active) },
  place: (id, p) => {
    const placed = { ...get().placed }
    // a custom tool's home comes from its category, which this store doesn't read: its placement is always kept
    if (p && (id.startsWith('community.') || p !== homePhase(id))) placed[id] = p; else delete placed[id]
    set({ placed }); write(PLACED, placed)
  },
  setCollapsed: (collapsed) => set({ collapsed }),
}))

export const designOf = (phase: PhaseId) => DESIGN_NODES.find((d) => d.phase === phase)!
export const phaseIndexOf = (p: PhaseId) => PHASES.findIndex((x) => x.id === p)
