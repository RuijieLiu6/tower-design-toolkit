// The workflow on the cover, kept in this browser (Ruijie, 7 Nov: "Returning to the landing page must restore the active
// workflow, including its nodes, connections, local loops, name, and selected starting preset. A fresh default workflow
// should appear only when the user explicitly starts a new workflow"). The cover saves its board as it changes and when
// it closes; opening it again restores that board, unless the app has started a newer workflow since (the "Build my
// workflow" board, a preset card): then that one is shown, keeping the cover's loops that still fit it.
import type { UserTypeId } from './userTypes'
import { presetById } from './userTypes'
import { linear, returnEdges, edgeKey, walk, type Edge } from './workflowGraph'
import { runningWorkflow } from './startPreset'

export type CoverRole = UserTypeId | 'custom'
export interface CoverWorkflow {
  v: 1
  role: CoverRole
  /** The starting preset it was made from (it may since be edited). */
  presetId: string | null
  /** Its own name when it is not a preset's (an assistant suggestion, a board from the app). */
  customName: string | null
  /** Nodes on the board, wired in or not. */
  nodes: string[]
  /** Every wire: Start, the forward run, the returns (local loops), Enter. */
  edges: Edge[]
  /** Where each node on the board sat, as a share of the cover's width and height. */
  at: Record<string, [number, number]>
  savedAt: string
}

const KEY = 'ts.coverWorkflow'
const isEdge = (e: unknown): e is Edge => !!e && typeof (e as Edge).a === 'string' && typeof (e as Edge).b === 'string'

export function loadCoverWorkflow(): CoverWorkflow | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CoverWorkflow | null
    if (!v || v.v !== 1 || !Array.isArray(v.nodes) || !Array.isArray(v.edges) || !v.edges.every(isEdge)) return null
    return { ...v, at: v.at && typeof v.at === 'object' ? v.at : {}, presetId: v.presetId && presetById(v.presetId) ? v.presetId : null }
  } catch { return null }
}
export function saveCoverWorkflow(w: Omit<CoverWorkflow, 'v' | 'savedAt'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...w, savedAt: new Date().toISOString() } satisfies CoverWorkflow)) } catch { /* this visit only */ }
}

/**
 * What the cover opens with: its own saved board; or, when the app started a different workflow after it was saved, that
 * workflow as a straight run plus the saved loops that still join two of its nodes; or null (the default, on a first
 * visit only). `known` filters out node ids that no longer exist.
 */
export function restoreCoverWorkflow(known: (id: string) => boolean): Omit<CoverWorkflow, 'v' | 'savedAt'> | null {
  const saved = loadCoverWorkflow(), run = runningWorkflow()
  const clean = (w: CoverWorkflow) => {
    const nodes = w.nodes.filter(known), ok = new Set([...nodes, 'start', 'enter'])
    return { ...w, nodes, edges: w.edges.filter((e) => ok.has(e.a) && ok.has(e.b)) }
  }
  const sameRun = (w: CoverWorkflow, nodes: string[]) => { const r = walk(w.edges); return r.length === nodes.length && r.every((x, i) => x === nodes[i]) }
  if (saved && (!run || sameRun(saved, run.nodes) || (run.at ?? '') <= saved.savedAt)) return clean(saved)
  if (run && run.nodes.length) {
    const nodes = run.nodes.filter(known)
    const loops = saved ? saved.edges.filter((e) => returnEdges(saved.edges).has(edgeKey(e)) && nodes.includes(e.a) && nodes.includes(e.b)) : []
    const presetId = run.id && presetById(run.id) ? run.id : null
    return { role: (run.type as CoverRole) ?? saved?.role ?? 'custom', presetId, customName: presetId ? null : run.name.replace(/ · with a loop$/, ''), nodes, edges: [...linear(nodes), ...loops], at: {} }
  }
  return null
}
