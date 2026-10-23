// State of the Customize canvas: React Flow nodes and wires, undo/redo, grouping, and conversion to and from a
// saved workflow. Kept apart from the main store so the guided app is untouched.
import { applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react'
import { create } from 'zustand'
import { BUILT_NODES, WORKFLOWS, type Category } from '../../data/registry'
import { browserStorage, DRAFT_KEY, emptyWorkflow, newId, parseWorkflow, serializeWorkflow, type WfNode, type Workflow } from '../../lib/workflows'
import { canConnect, evalInputs, LOGIC_DEFAULTS, PORT_COLOR, SOURCES, isLogic, type GraphNode, type NodeKind, type Params, type PortType } from '../../lib/workflowLogic'
import { findEntry, type Entry } from './catalog'

export type WfData = { kind: NodeKind; ref: string; label: string; category?: Category; params?: Params; color?: string }
export type WfNodeT = Node<WfData>
type Snap = { nodes: WfNodeT[]; edges: Edge[] }

export const GROUP_COLORS = ['#1f5f8b', '#b5651d', '#3c8d5a', '#8e5ba8', '#c0392b', '#5d6d7e']
const HISTORY = 60

const portTypeOf = (n: WfNodeT | undefined): PortType => {
  if (!n) return 'result'
  if (n.data.kind === 'source') return SOURCES.find((s) => s.ref === n.data.ref)?.type ?? 'result'
  return 'result'
}

export function styleEdge(e: Edge, nodes: WfNodeT[]): Edge {
  const t = portTypeOf(nodes.find((n) => n.id === e.source))
  return { ...e, type: 'default', data: { portType: t }, style: { stroke: PORT_COLOR[t], strokeWidth: t === 'result' ? 2.2 : 1.6 } }
}

export const toGraph = (nodes: WfNodeT[]): GraphNode[] =>
  nodes.map((n) => ({ id: n.id, kind: n.data.kind, ref: n.data.ref, label: n.data.label, category: n.data.category, params: n.data.params }))

/** Absolute canvas position (groups are one level deep). */
export function absPos(n: WfNodeT, nodes: WfNodeT[]): { x: number; y: number } {
  const p = n.parentId ? nodes.find((g) => g.id === n.parentId) : undefined
  return p ? { x: n.position.x + p.position.x, y: n.position.y + p.position.y } : n.position
}

function makeNode(e: Pick<Entry, 'kind' | 'ref' | 'name' | 'category'>, pos: { x: number; y: number }, extra: Partial<WfData> = {}, id = newId('n')): WfNodeT {
  return {
    id, type: 'wf', position: pos,
    data: { kind: e.kind, ref: e.ref, label: e.name, category: e.category, params: isLogic(e.ref) ? structuredClone(LOGIC_DEFAULTS[e.ref]) : undefined, ...extra },
  }
}

interface EditorState {
  wfId: string
  name: string
  description: string
  createdAt: string
  nodes: WfNodeT[]
  edges: Edge[]
  past: Snap[]
  future: Snap[]
  /** Last message for the status bar (connection refused, saved…). */
  message: string
  dirty: boolean
  /** Last canvas view, so returning to the builder (or a reload) keeps your place. */
  viewport: { x: number; y: number; zoom: number } | null
  setMeta: (patch: { name?: string; description?: string }) => void
  snapshot: () => void
  undo: () => void
  redo: () => void
  onNodesChange: (c: NodeChange<WfNodeT>[]) => void
  onEdgesChange: (c: EdgeChange[]) => void
  connect: (c: Connection) => boolean
  addEntry: (e: Entry, pos: { x: number; y: number }) => string
  updateData: (id: string, patch: Partial<WfData>) => void
  setParams: (id: string, patch: Params) => void
  groupSelected: () => void
  ungroup: (groupId: string) => void
  /** Before a group is deleted, keep its members on the canvas. */
  releaseChildren: (groupIds: string[]) => void
  duplicateSelected: () => void
  select: (id: string | null) => void
  load: (wf: Workflow) => void
  toWorkflow: () => Workflow
  say: (m: string) => void
}

const strip = (nodes: WfNodeT[]) => nodes.map((n) => ({ ...n, data: { ...n.data, params: n.data.params ? structuredClone(n.data.params) : undefined } }))

export const useEditor = create<EditorState>((set, get) => ({
  wfId: newId(),
  name: 'Untitled workflow',
  description: '',
  createdAt: new Date().toISOString(),
  nodes: [],
  edges: [],
  past: [],
  future: [],
  message: '',
  dirty: false,
  viewport: null,
  setMeta: (patch) => set({ ...patch, dirty: true }),
  snapshot: () => set((s) => ({ past: [...s.past, { nodes: strip(s.nodes), edges: s.edges }].slice(-HISTORY), future: [] })),
  undo: () => set((s) => {
    const prev = s.past[s.past.length - 1]
    if (!prev) return { message: 'Nothing to undo' }
    return { past: s.past.slice(0, -1), future: [{ nodes: s.nodes, edges: s.edges }, ...s.future], nodes: prev.nodes, edges: prev.edges, message: 'Undone', dirty: true }
  }),
  redo: () => set((s) => {
    const next = s.future[0]
    if (!next) return { message: 'Nothing to redo' }
    return { future: s.future.slice(1), past: [...s.past, { nodes: s.nodes, edges: s.edges }], nodes: next.nodes, edges: next.edges, message: 'Redone', dirty: true }
  }),
  onNodesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) get().snapshot()
    const meaningful = changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), dirty: s.dirty || meaningful }))
  },
  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) get().snapshot()
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), dirty: s.dirty || changes.some((c) => c.type !== 'select') }))
  },
  connect: (c) => {
    const { nodes, edges } = get()
    const ok = canConnect(toGraph(nodes), edges, c)
    if (!ok.ok) { set({ message: `Can't connect: ${ok.reason}` }); return false }
    get().snapshot()
    const e = styleEdge({ id: newId('e'), source: c.source, sourceHandle: c.sourceHandle ?? 'out', target: c.target, targetHandle: c.targetHandle ?? 'in' }, nodes)
    set((s) => ({ edges: [...s.edges, e], message: '', dirty: true }))
    return true
  },
  addEntry: (e, pos) => {
    get().snapshot()
    const n = { ...makeNode(e, pos), selected: true }
    set((s) => ({ nodes: [...s.nodes.map((m) => (m.selected ? { ...m, selected: false } : m)), n], message: `Added ${e.name}`, dirty: true }))
    return n.id
  },
  updateData: (id, patch) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)), dirty: true })),
  setParams: (id, patch) => {
    get().snapshot()
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, params: { ...(n.data.params ?? {}), ...patch } } } : n)), dirty: true }))
  },
  groupSelected: () => {
    const { nodes } = get()
    const picked = nodes.filter((n) => n.selected && n.type !== 'wfgroup')
    if (picked.length < 2) { set({ message: 'Select two or more nodes to group: drag a box on the empty canvas, or Ctrl-click' }); return }
    get().snapshot()
    const abs = picked.map((n) => ({ n, p: absPos(n, nodes), w: n.measured?.width ?? 230, h: n.measured?.height ?? 120 }))
    const pad = 28
    const x0 = Math.min(...abs.map((a) => a.p.x)) - pad, y0 = Math.min(...abs.map((a) => a.p.y)) - pad - 18
    const x1 = Math.max(...abs.map((a) => a.p.x + a.w)) + pad, y1 = Math.max(...abs.map((a) => a.p.y + a.h)) + pad
    const groups = nodes.filter((n) => n.type === 'wfgroup').length
    const g: WfNodeT = {
      id: newId('g'), type: 'wfgroup', position: { x: x0, y: y0 }, width: x1 - x0, height: y1 - y0, zIndex: -1, selected: false,
      data: { kind: 'group', ref: 'group', label: `Group ${groups + 1}`, color: GROUP_COLORS[groups % GROUP_COLORS.length] },
    }
    const ids = new Set(picked.map((n) => n.id))
    const moved = nodes.map((n) => {
      if (!ids.has(n.id)) return n
      const p = absPos(n, nodes)
      return { ...n, parentId: g.id, position: { x: p.x - x0, y: p.y - y0 }, selected: false }
    })
    // Parents must come before their children.
    set({ nodes: [g, ...moved], message: `Grouped ${picked.length} nodes`, dirty: true })
  },
  ungroup: (groupId) => {
    get().snapshot()
    get().releaseChildren([groupId])
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== groupId), message: 'Ungrouped' }))
  },
  releaseChildren: (groupIds) => set((s) => {
    const gs = new Set(groupIds)
    return { nodes: s.nodes.map((n) => (n.parentId && gs.has(n.parentId) ? { ...n, parentId: undefined, position: absPos(n, s.nodes) } : n)), dirty: true }
  }),
  duplicateSelected: () => {
    const { nodes } = get()
    const picked = nodes.filter((n) => n.selected && n.type !== 'wfgroup')
    if (!picked.length) return
    get().snapshot()
    const copies = picked.map((n) => {
      const p = absPos(n, nodes)
      return { ...n, id: newId('n'), parentId: undefined, position: { x: p.x + 40, y: p.y + 40 }, selected: true, data: { ...n.data, params: n.data.params ? structuredClone(n.data.params) : undefined } }
    })
    set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...copies], message: `Duplicated ${copies.length}`, dirty: true }))
  },
  select: (id) => set((s) => ({ nodes: s.nodes.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })) })),
  load: (wf) => {
    const groups = wf.nodes.filter((n) => n.kind === 'group')
    const ordered = [...groups, ...wf.nodes.filter((n) => n.kind !== 'group')]
    const nodes: WfNodeT[] = ordered.map((n) => fromWf(n))
    set({
      wfId: wf.id, name: wf.name, description: wf.description ?? '', createdAt: wf.createdAt, nodes, viewport: wf.viewport ?? null,
      edges: wf.edges.map((e) => styleEdge({ ...e }, nodes)), past: [], future: [], dirty: false, message: `Opened "${wf.name}"`,
    })
  },
  toWorkflow: () => {
    const s = get()
    const now = new Date().toISOString()
    return {
      format: 'tower-studio-workflow@1', id: s.wfId, name: s.name.trim() || 'Untitled workflow', description: s.description || undefined,
      createdAt: s.createdAt, updatedAt: now, ...(s.viewport ? { viewport: s.viewport } : {}),
      nodes: s.nodes.map((n): WfNode => ({
        id: n.id, kind: n.data.kind, ref: n.data.ref, x: Math.round(n.position.x), y: Math.round(n.position.y), label: n.data.label,
        ...(n.parentId ? { parent: n.parentId } : {}),
        ...(n.data.params ? { params: n.data.params } : {}),
        ...(n.type === 'wfgroup' ? { w: Math.round(n.width ?? n.measured?.width ?? 300), h: Math.round(n.height ?? n.measured?.height ?? 200), params: { color: n.data.color ?? GROUP_COLORS[0] } } : {}),
      })),
      edges: s.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? 'out', target: e.target, targetHandle: e.targetHandle ?? 'in' })),
    }
  },
  say: (message) => set({ message }),
}))

function fromWf(n: WfNode): WfNodeT {
  if (n.kind === 'group') {
    const color = typeof n.params?.color === 'string' ? n.params.color : GROUP_COLORS[0]
    return { id: n.id, type: 'wfgroup', position: { x: n.x, y: n.y }, width: n.w ?? 300, height: n.h ?? 200, zIndex: -1, data: { kind: 'group', ref: 'group', label: n.label ?? 'Group', color } }
  }
  const e = findEntry(n.ref)
  const node = makeNode(
    { kind: n.kind, ref: n.ref, name: e?.name ?? n.label ?? n.ref, category: e?.category },
    { x: n.x, y: n.y }, n.params ? { params: { ...(isLogic(n.ref) ? LOGIC_DEFAULTS[n.ref] : {}), ...n.params } } : {}, n.id,
  )
  return n.parent ? { ...node, parentId: n.parent } : node
}

// ---- templates -------------------------------------------------------------------------------------------------

/** Lay out a starter workflow: sources on the left, checks in the middle, logic on the right, all wired. */
export function templateWorkflow(name: string, evalIds: string[], opts: { logic?: boolean } = {}): Workflow {
  const wf = emptyWorkflow(name)
  const src = SOURCES.map((s, i): WfNode => ({ id: `src-${i}`, kind: 'source', ref: s.ref, x: 0, y: 40 + i * 150, label: s.name }))
  const evals = evalIds.map((id, i): WfNode => ({ id: `ev-${i}`, kind: 'eval', ref: id, x: 360, y: i * 210, label: findEntry(id)?.name ?? id }))
  wf.nodes.push(...src, ...evals)
  evals.forEach((ev) => {
    const def = findEntry(ev.ref)
    for (const t of evalInputs(ev.ref, def?.category ?? 'DATA')) {
      const s = src.find((x) => SOURCES.find((y) => y.ref === x.ref)?.type === t)!
      wf.edges.push({ id: `e-${s.id}-${ev.id}-${t}`, source: s.id, sourceHandle: 'out', target: ev.id, targetHandle: t })
    }
  })
  if (opts.logic && evals.length) {
    const mid = Math.max(0, ((evals.length - 1) * 210) / 2)
    wf.nodes.push({ id: 'lg-all', kind: 'logic', ref: 'logic.all-pass', x: 760, y: mid - 120, label: 'All pass' }, { id: 'lg-score', kind: 'logic', ref: 'logic.score', x: 760, y: mid + 90, label: 'Weighted score', params: { ...LOGIC_DEFAULTS['logic.score'] } })
    evals.forEach((ev) => {
      wf.edges.push({ id: `e-${ev.id}-all`, source: ev.id, sourceHandle: 'out', target: 'lg-all', targetHandle: 'in' })
      wf.edges.push({ id: `e-${ev.id}-score`, source: ev.id, sourceHandle: 'out', target: 'lg-score', targetHandle: 'in' })
    })
  }
  return wf
}

export const TEMPLATES: { id: string; name: string; hint: string; make: (enabled: string[]) => Workflow }[] = [
  { id: 'guided', name: 'Guided defaults', hint: 'The checks switched on in the guided app, wired to All pass and a weighted score', make: (on) => templateWorkflow('Guided defaults', BUILT_NODES.map((n) => n.id).filter((id) => on.includes(id)), { logic: true }) },
  ...WORKFLOWS.map((w) => ({ id: w.id, name: w.name, hint: `${w.nodes.length} built nodes`, make: () => templateWorkflow(w.name, w.nodes, { logic: true }) })),
  { id: 'blank', name: 'Blank canvas', hint: 'Only the three Layer 0 sources', make: () => templateWorkflow('Untitled workflow', []) },
]

// ---- draft autosave --------------------------------------------------------------------------------------------

export function restoreDraft(): Workflow | null {
  const kv = browserStorage()
  try {
    const text = kv?.getItem(DRAFT_KEY)
    if (!text) return null
    const r = parseWorkflow(text)
    return r.ok ? r.workflow : null
  } catch { return null }
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Keep the canvas between visits (debounced); storage errors are ignored. */
export function startDraftAutosave(): () => void {
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.nodes === prev.nodes && s.edges === prev.edges && s.name === prev.name && s.viewport === prev.viewport) return
    clearTimeout(timer)
    timer = setTimeout(() => { try { browserStorage()?.setItem(DRAFT_KEY, serializeWorkflow(useEditor.getState().toWorkflow())) } catch { /* full or private */ } }, 500)
  })
  return () => { clearTimeout(timer); unsub() }
}
