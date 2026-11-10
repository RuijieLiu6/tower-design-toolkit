// The workflow builder's view model (Ruijie's Result A brief, 9 Nov: "a readable workflow builder … What tools am I
// using? What am I working on now? What comes next? Where can I return to revise the design?"). Pure functions over the
// saved board (lib/workflowGraph.ts Board: node ids and directed wires) and the catalogues; no store, no React. The
// builder (components/builder/*) reads the project workflow (lib/workflow/projectWorkflow.ts) and draws what these
// functions derive; every edit goes back through that store's `commit`. Nothing here runs a check or touches the model.
//
// Kept apart (brief §6): Available = the tool is implemented; Ready = its inputs are present; Complete and Pass come
// from live results (hooks/useNodeSummaries.ts, from the decision trace's digest); the evidence flag describes a claim's
// basis. They are never merged into one badge.
import { BUILT_NODES, nodeById, type Category, type NodeDef } from '../../data/registry'
import { nodeWord } from '../../data/nodeWords'
import { NODE_NEEDS } from '../../data/nodeNeeds'
import type { NodePackage } from '../nodePackages'
import { inputGap, type GapContext } from '../missingInput'
import { PHASES, type PhaseId } from '../phases'
import { dockLayout, type DockEdge } from './dockLayout'
import { designNode, DESIGN_NODES, isDesignNode } from './designNodes'
import { homePhase, NODE_CONTROLS, PHASE_NAME } from './phaseTools'
import { addNode, edgeDiff, moveNode, removeNode, runOrder } from './projectWorkflow'
import { edgeKey, returnEdges, walk, type Board, type Edge } from '../workflowGraph'

export type ProjectKind = 'vtc' | 'city'

// ---------- the tool library ----------

/** Why a tool is or is not a normal choice: implemented, a preview, an installed custom tool, a reference to a custom
 *  tool that is not installed, or research only (never runnable). */
export type Availability = 'available' | 'preview' | 'custom' | 'missing' | 'research'

export interface ToolEntry {
  id: string
  /** The full name (never an acronym alone). */
  name: string
  /** The short word under a tile (data/nodeWords.ts). */
  word: string
  /** One line: what it does or answers. */
  purpose: string
  phase: PhaseId
  kind: 'design' | 'check' | 'custom' | 'missing' | 'research'
  availability: Availability
  category?: Category
  /** Which projects it runs in (undefined: both). */
  projects?: ProjectKind[]
  inWorkflow: boolean
}

const BUILT = new Map(BUILT_NODES.map((n) => [n.id, n]))
const CAT_PHASE: Partial<Record<Category, PhaseId>> = { SITE: 'site', DATA: 'site', CLIM: 'form', ECOL: 'form', PROG: 'program', PUBL: 'program', MOBI: 'program', STRC: 'schematic', SYST: 'schematic', SPAC: 'schematic', ENER: 'schematic', CULT: 'present', PRES: 'present' }

/** The sentence a check answers, as its one-line purpose (the registry's `question`), trimmed to one clause. */
export function purposeOf(def: Pick<NodeDef, 'question'>): string {
  const q = def.question.trim()
  const cut = q.search(/[:;?]/)
  const first = cut > 20 ? q.slice(0, cut) : q
  return first.replace(/\?$/, '').trim()
}

export function entryFor(id: string, o: { board: Board; packages: NodePackage[]; placed?: Record<string, PhaseId> }): ToolEntry {
  const inWorkflow = o.board.nodes.includes(id)
  const d = designNode(id)
  if (d) return { id, name: d.name, word: d.word, purpose: d.about, phase: d.phase, kind: 'design', availability: 'available', inWorkflow }
  const home = (x: string, cat?: Category) => o.placed?.[x] ?? homePhase(x, () => cat)
  const n = BUILT.get(id)
  if (n) return { id, name: n.name, word: nodeWord(n), purpose: purposeOf(n), phase: home(id), kind: 'check', availability: n.status === 'preview' ? 'preview' : 'available', category: n.category, projects: n.projects, inWorkflow }
  const p = o.packages.find((x) => x.id === id)
  if (p) return { id, name: p.name, word: nodeWord(p), purpose: purposeOf(p), phase: home(id, p.category), kind: 'custom', availability: 'custom', category: p.category, projects: p.projects, inWorkflow }
  if (id.startsWith('community.')) return { id, name: id.replace(/^community\./, ''), word: 'Missing', purpose: 'A custom tool this workflow refers to, which is not installed in this browser.', phase: home(id), kind: 'missing', availability: 'missing', inWorkflow }
  const r = nodeById(id)
  if (r) return { id, name: r.name, word: nodeWord(r), purpose: purposeOf(r), phase: CAT_PHASE[r.category] ?? 'site', kind: 'research', availability: 'research', category: r.category, inWorkflow }
  return { id, name: id, word: id, purpose: 'Unknown tool.', phase: 'site', kind: 'missing', availability: 'missing', inWorkflow }
}

export interface Library {
  /** The design steps and the implemented checks (previews included, marked). */
  available: ToolEntry[]
  /** Installed custom tools, then missing references the workflow still holds. */
  mine: ToolEntry[]
  /** Research-only modules: details, never Add. */
  research: ToolEntry[]
}

/** Every tool a person can choose from, grouped as the library shows them. `research` is the registry's researched set. */
export function libraryEntries(o: { board: Board; packages: NodePackage[]; placed?: Record<string, PhaseId>; research?: NodeDef[] }): Library {
  const available = [...DESIGN_NODES.map((d) => d.id), ...BUILT_NODES.map((n) => n.id)].map((id) => entryFor(id, o))
  const installed = o.packages.map((p) => entryFor(p.id, o))
  const missing = o.board.nodes.filter((id) => id.startsWith('community.') && !o.packages.some((p) => p.id === id)).map((id) => entryFor(id, o))
  const research = (o.research ?? []).filter((n) => n.status === 'researched').map((n) => entryFor(n.id, o))
  return { available, mine: [...installed, ...missing], research }
}

/** "Competition project only" / "Real Vancouver only", or null when a tool runs in both projects. */
export function applicability(e: Pick<ToolEntry, 'projects'>): string | null {
  if (!e.projects || e.projects.length !== 1) return null
  return e.projects[0] === 'vtc' ? 'Competition project only' : 'Real Vancouver only'
}
export const runsInProject = (e: Pick<ToolEntry, 'projects'>, project: ProjectKind) => !e.projects || e.projects.includes(project)

/** Search and phase filter over a list of entries (name, word, purpose, category label words). */
export function filterEntries<T extends ToolEntry>(list: T[], o: { query?: string; phase?: PhaseId | null }): T[] {
  const q = (o.query ?? '').trim().toLowerCase()
  return list.filter((e) => (!o.phase || e.phase === o.phase) && (!q || `${e.name} ${e.word} ${e.purpose} ${e.category ?? ''}`.toLowerCase().includes(q)))
}

// ---------- the sequence of cards ----------

export interface ReturnPath { key: string; from: string; to: string; level: number }
export interface StepCard {
  id: string
  /** 1-based place in the main working sequence (Start's order); null for a node not reachable from Start. */
  index: number | null
  /** The column it shares with the main-sequence card over it (branch cards) or its own. */
  col: number
  lane: 'main' | 'branch' | 'unwired'
  phase: PhaseId
  /** The card(s) it leads to along forward wires, in order; 'enter' for the end. */
  next: string[]
  /** Return paths starting here (↻ Return to …). */
  returnsTo: string[]
  /** Return paths arriving here (… returns here). */
  returnedFrom: string[]
  /** Forward wires that leave the main sequence (a branch), by target. */
  branchesTo: string[]
}
export interface SequenceModel {
  cards: StepCard[]
  /** Columns in order: the main card (or null when a column holds only branch cards) and the branch cards under it. */
  columns: { col: number; main: string | null; branches: string[] }[]
  returns: ReturnPath[]
  unwired: string[]
  /** The run from Start (walk), for position markers and Move before / after. */
  run: string[]
  /** True when the board has forward wires that leave the main path (a second route), so a single line would mislead. */
  hasBranches: boolean
}

/** The board as the builder draws it: dockLayout's columns, with every wire accounted for. */
export function sequenceModel(b: Board, home: (id: string) => PhaseId): SequenceModel {
  const layout = dockLayout(b)
  const run = walk(b.edges)
  const back = returnEdges(b.edges)
  const edgesOf = (id: string, pick: (e: DockEdge) => boolean) => layout.edges.filter((e) => e.a === id && pick(e)).map((e) => e.b)
  const ids = [...layout.at.keys()].filter((id) => id !== 'start' && id !== 'enter')
  const cards: StepCard[] = ids.map((id) => {
    const at = layout.at.get(id)!
    const unwired = layout.unwired.includes(id)
    return {
      id, index: unwired ? null : run.indexOf(id) + 1, col: at.col, lane: unwired ? 'unwired' : at.row === 0 ? 'main' : 'branch',
      phase: designNode(id)?.phase ?? home(id),
      next: edgesOf(id, (e) => e.kind !== 'return'),
      returnsTo: edgesOf(id, (e) => e.kind === 'return'),
      returnedFrom: layout.edges.filter((e) => e.b === id && e.kind === 'return').map((e) => e.a),
      branchesTo: edgesOf(id, (e) => e.kind === 'branch'),
    }
  })
  const byCol = new Map<number, { main: string | null; branches: string[] }>()
  for (const c of cards) {
    if (c.lane === 'unwired') continue
    const col = byCol.get(c.col) ?? { main: null, branches: [] }
    if (c.lane === 'main') col.main = c.id; else col.branches.push(c.id)
    byCol.set(c.col, col)
  }
  const columns = [...byCol.entries()].sort((x, y) => x[0] - y[0]).map(([col, v]) => ({ col, ...v }))
  const returns: ReturnPath[] = layout.edges.filter((e) => e.kind === 'return').map((e) => ({ key: e.key, from: e.a, to: e.b, level: e.level }))
  const hasBranches = layout.edges.some((e) => e.kind === 'branch') || cards.some((c) => c.lane === 'branch')
  void back
  return { cards, columns, returns, unwired: layout.unwired, run, hasBranches }
}

// ---------- states, in words that stay apart ----------

export type CardStateKind = 'design' | 'available' | 'ready' | 'needs-model' | 'waiting-input' | 'paused' | 'missing' | 'other-project'
export interface CardState { kind: CardStateKind; word: string; detail: string }

export interface StateContext extends GapContext {
  /** Auto-run checks (store `analysis`). */
  analysis: boolean
  /** Installed custom tool ids. */
  installed: ReadonlySet<string>
}

/** The concise, truthful state on a card (brief §4): what the tool can do right now, never a result. */
export function cardState(id: string, ctx: StateContext): CardState {
  if (isDesignNode(id)) return { kind: 'design', word: 'Design step', detail: 'Opens its design tools; nothing runs on its own.' }
  if (id.startsWith('community.') && !ctx.installed.has(id)) return { kind: 'missing', word: 'Missing tool', detail: 'This custom tool is not installed in this browser. Import its package to use it; the workflow keeps its place.' }
  const def = BUILT.get(id)
  if (def?.projects && !def.projects.includes(ctx.project)) return { kind: 'other-project', word: applicability(def) ?? 'Other project', detail: 'It does not run in the open project.' }
  const gap = inputGap(id, ctx)
  if (gap) return { kind: gap.status, word: gap.word, detail: `${gap.reason} ${gap.next}` }
  if (!ctx.analysis) return { kind: 'paused', word: 'Paused', detail: 'Auto-run checks is off: results wait until it is on.' }
  return { kind: 'ready', word: 'Ready', detail: 'Its inputs are present; it runs with the model.' }
}

export interface DesignContext { project: ProjectKind; towers: { bands?: unknown[]; podiumHeight?: number }[]; siteName?: string | null; hasSite: boolean }
/** A small real summary for a design step: what the project holds now ("No tower yet", "2 towers", "3 program bands"). */
export function designSummary(id: string, d: DesignContext): string | null {
  switch (id) {
    case 'design.site': return d.project === 'vtc' ? 'Competition block' : d.hasSite ? (d.siteName ?? 'Study site chosen') : 'No site yet'
    case 'design.massing': return d.towers.length === 0 ? 'No tower yet' : d.towers.length === 1 ? '1 tower' : `${d.towers.length} towers`
    case 'design.program': {
      if (!d.towers.length) return 'No tower yet'
      const bands = d.towers.reduce((n, t) => n + (t.bands?.length ?? 0), 0)
      return bands === 1 ? '1 program band' : `${bands} program bands`
    }
    default: return null
  }
}

// ---------- previews of an edit: which connections change ----------

export interface EditPreview { added: Edge[]; removed: Edge[]; loopsDropped: number; board: Board }
const preview = (before: Board, after: Board): EditPreview => {
  const d = edgeDiff(before.edges, after.edges)
  const backBefore = returnEdges(before.edges), backAfter = returnEdges(after.edges)
  const loopsDropped = before.edges.filter((e) => backBefore.has(edgeKey(e)) && !after.edges.some((f) => f.a === e.a && f.b === e.b && backAfter.has(edgeKey(f)))).length
  return { ...d, loopsDropped, board: after }
}

/** Where Add would put a tool: after the last tool of its phase or an earlier one (the best place), unless told. */
export function bestAfter(b: Board, id: string, home: (id: string) => PhaseId): string {
  const order = PHASES.map((p) => p.id)
  const rank = (x: string) => order.indexOf(designNode(x)?.phase ?? home(x))
  let after = 'start'
  for (const x of runOrder(b)) if (rank(x) <= rank(id)) after = x
  return after
}
export function addPreview(b: Board, id: string, after: string): EditPreview { return preview(b, addNode(b, id, after)) }
export function movePreview(b: Board, id: string, target: string, where: 'before' | 'after'): EditPreview { return preview(b, moveNode(b, id, target, where)) }
export function removePreview(b: Board, id: string): EditPreview { return preview(b, removeNode(b, id)) }

/** A short sentence for a preview: "adds 2 connections, removes 1; a return path is dropped". */
export function previewWords(p: EditPreview, name: (id: string) => string): string {
  const parts: string[] = []
  const say = (e: Edge) => `${e.a === 'start' ? 'Start' : name(e.a)} → ${e.b === 'enter' ? 'End' : name(e.b)}`
  if (p.added.length) parts.push(`connects ${p.added.map(say).join(', ')}`)
  if (p.removed.length) parts.push(`removes ${p.removed.map(say).join(', ')}`)
  if (p.loopsDropped) parts.push(`${p.loopsDropped} return path${p.loopsDropped > 1 ? 's' : ''} dropped`)
  return parts.length ? parts.join('; ') : 'no connection changes'
}

// ---------- the inspector's plain words ----------

export interface Plain { uses: string[]; asks: string[]; produces: string; settings: string[] }
/** "Uses" and "Produces" in plain language (brief §9), from data/nodeNeeds.ts and the registry, never port types. */
export function plainWords(id: string, packages: NodePackage[]): Plain {
  const d = designNode(id)
  if (d) return { uses: ['the shared project model'], asks: [], produces: d.about, settings: [] }
  const n = BUILT.get(id)
  const needs = NODE_NEEDS[id]
  const settings = (NODE_CONTROLS[id] ?? []).map((t) => t.replace(/-/g, ' '))
  if (n) return { uses: needs?.reads ?? [], asks: needs?.asks ?? [], produces: n.question, settings }
  const p = packages.find((x) => x.id === id)
  if (p) return { uses: p.inputs, asks: (p.parameters ?? []).map((x) => x.label), produces: p.question, settings: [] }
  return { uses: [], asks: [], produces: 'Unknown: this tool is not installed.', settings: [] }
}

export const phaseName = (p: PhaseId) => PHASE_NAME[p]
