// Saved workflows (tower-studio-workflow@1): a graph of nodes and wires from the Customize builder.
// Stored locally (browser storage, wrapped in try/catch) and exported or imported as JSON files.
import type { NodeKind, Params } from './workflowLogic'

export const WORKFLOW_FORMAT = 'tower-studio-workflow@1'
const INDEX_KEY = 'ts.workflows'
const ITEM_KEY = (id: string) => `ts.workflow.${id}`
export const DRAFT_KEY = 'ts.workflow.draft'

export interface WfNode {
  id: string
  kind: NodeKind
  /** Registry id (built.*, P01-M01, a community id), a source (src.*), a logic node (logic.*) or 'group'. */
  ref: string
  x: number
  y: number
  /** Group size; also the frame label. */
  w?: number
  h?: number
  label?: string
  /** Group this node sits in (its x, y are then relative to the group). */
  parent?: string
  params?: Params
  /** Switched off on the canvas: the checks after it are blocked, never computed on missing data (P15-M02). */
  off?: boolean
}
export interface WfEdge { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }

export interface Workflow {
  format: typeof WORKFLOW_FORMAT
  id: string
  name: string
  description?: string
  project?: 'vtc' | 'city'
  createdAt: string
  updatedAt: string
  nodes: WfNode[]
  edges: WfEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

/** Minimal storage interface so tests can pass a Map-backed fake. */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** Browser storage, or null in private mode / previews where access throws. */
export function browserStorage(): KV | null {
  try { const s = window.localStorage; s.getItem(INDEX_KEY); return s } catch { return null }
}

export const newId = (prefix = 'wf') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function emptyWorkflow(name = 'Untitled workflow'): Workflow {
  const now = new Date().toISOString()
  return { format: WORKFLOW_FORMAT, id: newId(), name, createdAt: now, updatedAt: now, nodes: [], edges: [] }
}

export function serializeWorkflow(wf: Workflow): string {
  return JSON.stringify(wf, null, 2)
}

const KINDS: NodeKind[] = ['source', 'eval', 'logic', 'group']
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export type ParseResult = { ok: true; workflow: Workflow; warnings: string[] } | { ok: false; errors: string[] }

/**
 * Read a workflow from JSON text. Errors stop the import; warnings (a wire to a missing node, an unknown node id
 * when `known` is given) are reported and the bad parts dropped, so a shared file still opens.
 */
export function parseWorkflow(text: string, known?: (ref: string, kind: NodeKind) => boolean): ParseResult {
  let raw: any
  try { raw = JSON.parse(text) } catch (e) { return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] } }
  const errors: string[] = [], warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['The file is not a workflow object.'] }
  if (raw.format !== WORKFLOW_FORMAT) errors.push(`Expected format "${WORKFLOW_FORMAT}", found ${JSON.stringify(raw.format ?? null)}.`)
  if (!Array.isArray(raw.nodes)) errors.push('"nodes" must be a list.')
  if (!Array.isArray(raw.edges)) errors.push('"edges" must be a list.')
  if (errors.length) return { ok: false, errors }

  const nodes: WfNode[] = []
  const seen = new Set<string>()
  raw.nodes.forEach((n: any, i: number) => {
    if (!n || !isStr(n.id) || !isStr(n.ref) || !KINDS.includes(n.kind) || !isNum(n.x) || !isNum(n.y)) { errors.push(`Node ${i + 1} needs id, kind (${KINDS.join(', ')}), ref, x and y.`); return }
    if (seen.has(n.id)) { errors.push(`Node id "${n.id}" is used twice.`); return }
    if (known && n.kind !== 'group' && !known(n.ref, n.kind)) warnings.push(`"${n.label ?? n.ref}" (${n.ref}) is not in this library; it opens as a missing node.`)
    seen.add(n.id)
    const node: WfNode = { id: n.id, kind: n.kind, ref: n.ref, x: n.x, y: n.y }
    if (isNum(n.w)) node.w = n.w
    if (isNum(n.h)) node.h = n.h
    if (typeof n.label === 'string') node.label = n.label
    if (isStr(n.parent)) node.parent = n.parent
    if (n.params && typeof n.params === 'object' && !Array.isArray(n.params)) node.params = n.params
    if (n.off === true) node.off = true
    nodes.push(node)
  })
  if (errors.length) return { ok: false, errors }
  for (const n of nodes) if (n.parent && !nodes.some((g) => g.id === n.parent && g.kind === 'group')) { warnings.push(`"${n.label ?? n.ref}" pointed at a missing group; it is placed on the canvas.`); delete n.parent }

  const edges: WfEdge[] = []
  raw.edges.forEach((e: any, i: number) => {
    if (!e || !isStr(e.source) || !isStr(e.target)) { warnings.push(`Wire ${i + 1} is incomplete and was dropped.`); return }
    if (!seen.has(e.source) || !seen.has(e.target)) { warnings.push(`Wire ${i + 1} points at a missing node and was dropped.`); return }
    edges.push({ id: isStr(e.id) ? e.id : `e-${i}`, source: e.source, sourceHandle: isStr(e.sourceHandle) ? e.sourceHandle : 'out', target: e.target, targetHandle: isStr(e.targetHandle) ? e.targetHandle : 'in' })
  })

  const now = new Date().toISOString()
  const workflow: Workflow = {
    format: WORKFLOW_FORMAT,
    id: isStr(raw.id) ? raw.id : newId(),
    name: isStr(raw.name) ? raw.name.slice(0, 120) : 'Imported workflow',
    createdAt: isStr(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isStr(raw.updatedAt) ? raw.updatedAt : now,
    nodes, edges,
  }
  if (typeof raw.description === 'string') workflow.description = raw.description
  if (raw.project === 'vtc' || raw.project === 'city') workflow.project = raw.project
  if (raw.viewport && isNum(raw.viewport.x) && isNum(raw.viewport.y) && isNum(raw.viewport.zoom)) workflow.viewport = { x: raw.viewport.x, y: raw.viewport.y, zoom: raw.viewport.zoom }
  return { ok: true, workflow, warnings }
}

export interface SavedEntry { id: string; name: string; updatedAt: string; nodes: number }

function readIndex(kv: KV): SavedEntry[] {
  try {
    const list = JSON.parse(kv.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((e) => e && isStr(e.id)) : []
  } catch { return [] }
}

/** Saved workflows, newest first. Empty when storage is unavailable. */
export function listWorkflows(kv: KV | null): SavedEntry[] {
  if (!kv) return []
  return readIndex(kv).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Save (or overwrite by id). Returns false if storage is unavailable or full. */
export function saveWorkflow(kv: KV | null, wf: Workflow): boolean {
  if (!kv) return false
  try {
    const stamped = { ...wf, updatedAt: new Date().toISOString() }
    kv.setItem(ITEM_KEY(wf.id), serializeWorkflow(stamped))
    const index = readIndex(kv).filter((e) => e.id !== wf.id)
    index.push({ id: wf.id, name: wf.name, updatedAt: stamped.updatedAt, nodes: wf.nodes.filter((n) => n.kind !== 'group').length })
    kv.setItem(INDEX_KEY, JSON.stringify(index))
    return true
  } catch { return false }
}

export function loadWorkflow(kv: KV | null, id: string): Workflow | null {
  if (!kv) return null
  try {
    const text = kv.getItem(ITEM_KEY(id))
    if (!text) return null
    const r = parseWorkflow(text)
    return r.ok ? r.workflow : null
  } catch { return null }
}

export function deleteWorkflow(kv: KV | null, id: string): boolean {
  if (!kv) return false
  try {
    kv.removeItem(ITEM_KEY(id))
    kv.setItem(INDEX_KEY, JSON.stringify(readIndex(kv).filter((e) => e.id !== id)))
    return true
  } catch { return false }
}

/** Runnable evaluation nodes in a workflow, for "Run in the guided app" (store.setEnabled). */
export function nodesToEnable(wf: Pick<Workflow, 'nodes'>, runnable: (ref: string) => boolean): string[] {
  return [...new Set(wf.nodes.filter((n) => n.kind === 'eval' && runnable(n.ref)).map((n) => n.ref))]
}

/** Filename for an export: letters, digits and dashes only. */
export const exportName = (wf: Pick<Workflow, 'name'>) => `${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow'}.workflow.json`
