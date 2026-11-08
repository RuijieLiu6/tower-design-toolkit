// The project workflow, one for the landing page and the workspace (Ruijie, 7 Nov: "The landing page and working
// environment must read and edit the same project workflow. Share the same nodes, settings, connections, branches, and
// loops. Store their visual layouts separately"). The record is the landing page's (lib/coverWorkflow.ts: nodes,
// directed edges with their return connections, name, starting preset, and the landing page's own node positions); this
// store reads it, edits it with undo and redo, and writes it back, leaving the landing positions alone (a node the
// landing page has no position for is laid out there in its lane). The workspace dock keeps its own layout (computed,
// aligned: lib/workflow/dockLayout.ts).
//
// What an edit does to the project (design system §5): adding a node to the workflow switches its check on; taking it
// off switches the check off and keeps every result, model and input; moving a node only changes the layout; connections
// change the order of work and its loops, never the data a check reads. A library preset is never changed: the workflow
// keeps the preset it started from, and "Save as preset" (lib/workflow/myPresets.ts) makes a copy.
import { create } from 'zustand'
import { useStore } from '../../store'
import { loadCoverWorkflow, restoreCoverWorkflow, saveCoverWorkflow, type CoverRole } from '../coverWorkflow'
import { WORKFLOW_KEY } from '../startPreset'
import { presetById } from '../userTypes'
import { addLoop, clean, edgeKey, insertAfter, insertOn, linear, returnEdges, takeOff, walk, type Board, type Edge } from '../workflowGraph'
import { BUILT_NODES } from '../../data/registry'
import { analysisOnly, isDesignNode } from './designNodes'

export interface ProjectWorkflow extends Board {
  role: CoverRole
  presetId: string | null
  customName: string | null
}

export type DockMode = 'compact' | 'overview' | 'edit'

interface WorkflowState {
  wf: ProjectWorkflow
  past: ProjectWorkflow[]
  future: ProjectWorkflow[]
  mode: DockMode
  /** The node picked for editing (Edit), not the current step. */
  editing: string | null
  /** A selected connection (its key), in Overview or Edit. */
  edge: string | null
  /** An AI proposal shown in the dock before it is applied. */
  proposal: Board | null
  /** The last change, in words, for the status line and screen readers. */
  note: string | null
  load: () => void
  setMode: (m: DockMode) => void
  setEditing: (id: string | null) => void
  setEdge: (k: string | null) => void
  /** A change to the workflow: kept in history, saved, reflected in the checks. */
  commit: (next: Board, note: string) => void
  undo: () => void
  redo: () => void
  preview: (b: Board | null) => void
  applyProposal: (note: string) => void
}

const KNOWN = new Set(BUILT_NODES.map((n) => n.id))
export const knownNode = (id: string) => KNOWN.has(id) || isDesignNode(id) || id.startsWith('community.')
const EMPTY: ProjectWorkflow = { role: 'custom', presetId: null, customName: null, nodes: [], edges: [] }

/** The workflow as the landing page last saved it (or the running one), cleaned of unknown nodes. */
export function readWorkflow(): ProjectWorkflow {
  const r = restoreCoverWorkflow(knownNode)
  return r ? { role: r.role, presetId: r.presetId, customName: r.customName, ...clean({ nodes: r.nodes, edges: r.edges }) } : EMPTY
}

/** Saves to the landing page's record (keeping its node positions) and to the running workflow the process rail reads. */
function save(wf: ProjectWorkflow) {
  const at = loadCoverWorkflow()?.at ?? {}
  const keep = Object.fromEntries(Object.entries(at).filter(([id]) => wf.nodes.includes(id)))
  const preset = wf.presetId ? presetById(wf.presetId) : null
  const name = wf.customName ?? preset?.name ?? 'My workflow'
  // The running workflow first, the landing record last, so the landing page restores this board (its time is newer).
  try { localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ name, nodes: walk(wf.edges), id: wf.presetId, type: wf.role === 'custom' ? null : wf.role, at: new Date().toISOString() })) } catch { /* this visit only */ }
  saveCoverWorkflow({ role: wf.role, presetId: wf.presetId, customName: wf.customName, nodes: wf.nodes, edges: wf.edges, at: keep })
}

/** A node joining the workflow switches its check on; one leaving switches it off (its results and inputs stay). */
function syncChecks(before: string[], after: string[]) {
  const on = analysisOnly(after.filter((id) => !before.includes(id)))
  const off = analysisOnly(before.filter((id) => !after.includes(id)))
  if (!on.length && !off.length) return
  useStore.setState((s) => ({ enabled: { ...s.enabled, ...Object.fromEntries(on.map((id) => [id, true])), ...Object.fromEntries(off.map((id) => [id, false])) } }))
}

const LIMIT = 80
export const useProjectWorkflow = create<WorkflowState>()((set, get) => ({
  wf: EMPTY, past: [], future: [], mode: 'compact', editing: null, edge: null, proposal: null, note: null,
  load: () => set({ wf: readWorkflow(), proposal: null }),
  setMode: (mode) => set({ mode, editing: mode === 'edit' ? get().editing : null, edge: mode === 'compact' ? null : get().edge, proposal: mode === 'compact' ? null : get().proposal }),
  setEditing: (editing) => set({ editing, edge: null }),
  setEdge: (edge) => set({ edge, editing: null }),
  commit: (next, note) => {
    const { wf, past } = get()
    const b = clean(next)
    if (b.nodes.length === wf.nodes.length && b.nodes.every((x, i) => x === wf.nodes[i]) && b.edges.length === wf.edges.length && b.edges.every((e) => wf.edges.some((f) => f.a === e.a && f.b === e.b))) return
    const nw = { ...wf, ...b }
    syncChecks(wf.nodes, nw.nodes)
    save(nw)
    set({ wf: nw, past: [...past, wf].slice(-LIMIT), future: [], note, proposal: null })
    useStore.setState({ announce: note })
  },
  undo: () => {
    const { wf, past, future } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    syncChecks(wf.nodes, prev.nodes)
    save(prev)
    set({ wf: prev, past: past.slice(0, -1), future: [wf, ...future], note: 'Undone', edge: null })
    useStore.setState({ announce: 'Workflow change undone' })
  },
  redo: () => {
    const { wf, past, future } = get()
    const next = future[0]
    if (!next) return
    syncChecks(wf.nodes, next.nodes)
    save(next)
    set({ wf: next, past: [...past, wf], future: future.slice(1), note: 'Redone', edge: null })
    useStore.setState({ announce: 'Workflow change redone' })
  },
  preview: (proposal) => set({ proposal }),
  applyProposal: (note) => { const p = get().proposal; if (p) get().commit(p, note) },
}))

// ---------- the edits, as pure functions of the board (tested in projectWorkflow.test.ts) ----------

/** The run (Start's order) and every node on the board not on it (unwired), after it. */
export const runOrder = (b: Board) => { const r = walk(b.edges); return [...r, ...b.nodes.filter((x) => !r.includes(x))] }

/** Add a node to the workflow after `after` (or at the end of the run). */
export function addNode(b: Board, id: string, after?: string | null): Board {
  if (b.nodes.includes(id)) return b
  const run = walk(b.edges)
  const at = after && run.includes(after) ? after : run[run.length - 1] ?? 'start'
  return insertAfter({ nodes: b.nodes, edges: b.edges.length ? b.edges : linear([]) }, id, at)
}

/** Take a node off the workflow; the wires through it join up; loops through it go. Nothing else is touched. */
export const removeNode = (b: Board, id: string): Board => takeOff(b, id)

/**
 * Move a node to just before or after another node in the run: it leaves its place (its neighbours join up) and is put
 * on the wire next to the target. Its return connections to other nodes are kept when both ends are still on the run;
 * paths that don't involve it are untouched.
 */
export function moveNode(b: Board, id: string, target: string, where: 'before' | 'after'): Board {
  if (id === target || !b.nodes.includes(id)) return b
  const loops = b.edges.filter((e) => returnEdges(b.edges).has(edgeKey(e)) && (e.a === id || e.b === id))
  const off = takeOff(b, id)
  const run = walk(off.edges)
  let next: Board
  if (where === 'after') next = insertAfter(off, id, target)
  else {
    const prev = run[run.indexOf(target) - 1] ?? 'start'
    const wire = off.edges.find((e) => e.a === prev && e.b === target) ?? off.edges.find((e) => e.b === target && returnEdges(off.edges).has(edgeKey(e)) === false)
    next = wire ? insertOn(off, id, wire.a, target) : insertAfter(off, id, prev)
  }
  // its loops come back when they still run backwards (a return), otherwise they are dropped rather than becoming forward wires
  const r = walk(next.edges), rank = (x: string) => r.indexOf(x)
  for (const e of loops) if (rank(e.a) >= 0 && rank(e.b) >= 0 && rank(e.b) <= rank(e.a)) next = addLoop(next, e.a, e.b)
  return clean(next)
}

/** Connect `a` to `b`: a forward wire, or a return connection (a loop) when `b` comes earlier in the run. */
export function connect(b: Board, a: string, bId: string): Board {
  if (a === bId || b.edges.some((e) => e.a === a && e.b === bId)) return b
  return clean({ nodes: b.nodes, edges: [...b.edges, { a, b: bId }] })
}

/** Remove one connection. A forward wire's removal may leave nodes unwired; they stay on the board, shown as unwired. */
export const disconnect = (b: Board, key: string): Board => ({ nodes: b.nodes, edges: b.edges.filter((e) => edgeKey(e) !== key) })

/** Is a connection from `a` to `b` a return (it would close a loop)? */
export function wouldLoop(b: Board, a: string, bId: string): boolean {
  const r = walk(b.edges)
  if (bId === 'start' || a === 'enter') return false
  return r.indexOf(bId) >= 0 && r.indexOf(a) >= 0 && r.indexOf(bId) <= r.indexOf(a)
}

/** What a change does to the connections, for the preview ("adds 2, removes 1"). */
export function edgeDiff(before: Edge[], after: Edge[]) {
  const k1 = new Set(before.map(edgeKey)), k2 = new Set(after.map(edgeKey))
  return { added: after.filter((e) => !k1.has(edgeKey(e))), removed: before.filter((e) => !k2.has(edgeKey(e))) }
}
