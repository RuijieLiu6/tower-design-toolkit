// The cover of the tool. Ruijie, 7 Nov, after pentagram.com: "an interactive box where it switches between the name
// Tower Design Toolkit and 'A Tower Design by ___' … four options … by default architecture students … one option that
// indicates they could customize instead of going with our presets … an interactive shelf, like a running system where
// the nodes could be put on … they are actually designing their workflow and they can enter the tool from there with
// the already decided workflow … bring all the preset nodes in the landing page"; then, after an n8n workflow video:
// "the freedom to arrange the place and order of the nodes … connected to the string … a linear design workflow or a
// loop where they check their workflow, this should be playful". Its own screen (lib/intro.ts):
//   - every built analysis node floats in the lower room as a glass tile (drifts, nudges, can be thrown);
//   - the string across the top runs from Start to Enter through five phase lanes; nodes on it sit where they are put,
//     joined by wires that hang like soft ropes with pulses running along them. Click a floating node (or drop it on the
//     string) to thread it; drop it on a wire to put it there; drag a threaded node anywhere; flick it or drag it down to
//     take it off. Then, like Grasshopper and Miro ("allow for creating loops and allow for drag and unconnect the nodes
//     like how Grasshopper connects its nodes"): drag (or click, or press C) from a node's connection point to another node
//     to wire them; a wire back to a task earlier on its path is a return connection that closes a loop, found from the
//     directed wires alone (lib/workflowGraph.ts returnEdges), never from positions or lanes. Loops are local, any number,
//     anywhere (Ruijie, 7 Nov: no global Loop button, no permanent loop hints): guidance appears only on the connection
//     point ("Connect nodes"), on a target that would close a loop ("Create loop"), and on a hovered, focused or selected
//     return ("Return to …"). Select a wire to see it and remove it; Undo (Ctrl+Z) brings it back. The workflow is what is
//     reached from Start along the wires, in that order; a node on the board but wired to nothing shows a dashed outline
//     and is left out until it is wired in;
//   - the box in the middle alternates between the name and "A Tower Design by [role ▾]": a role threads its starting
//     workflow; "you, node by node" leaves an empty string to build on;
//   - Enter (the string's end) goes into the guided app with that workflow, in that order (lib/startPreset.ts);
//     the workflow assistant below the canvas suggests, modifies and explains the workflow (previewed on the canvas,
//     applied or discarded, undoable); its "Other ways in" goes to the agent page. Making a node of one's own waits inside
//     the platform (Customize).
// Keyboard: floating nodes are buttons (Enter threads one); threaded nodes are buttons (← → move it along the string,
// Delete takes it off); the role menu is a listbox. Reduced motion: nothing drifts, sways or alternates; all still works.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, BookOpen, ChevronDown, FilePlus, FileUp, PackagePlus, Play, Tags, Trash2, Undo2, X } from '../icons'
import WorkflowAssistant from './WorkflowAssistant'
import { NodeTile } from '../NodeTile'
import { nodeWord } from '../../data/nodeWords'
import type { Proposal } from '../../lib/agent/workflowAssistant'
import GlassIcon, { HUES, ICON } from '../GlassIcon'
import { NODE_ICONS, PRESET_ICONS, STEP_ICONS, TYPE_ICONS } from '../../data/icons'
import { BUILT_NODES } from '../../data/registry'
import { PHASE_HUE, PHASES, phaseOfNode, type PhaseId } from '../../lib/phases'
import { PHASE_COLOR, UI } from '../../lib/design/tokens'
import { startPreset } from '../../lib/startPreset'
import { enterToolkit } from '../../lib/intro'
import { dotRoute } from '../../lib/coverRun'
import { DESIGN_NODES, designNode, withDesignSteps } from '../../lib/workflow/designNodes'
import Help from '../Help'
import { USER_TYPES, presetById, type Preset, type UserTypeId } from '../../lib/userTypes'
import { restoreCoverWorkflow, saveCoverWorkflow } from '../../lib/coverWorkflow'
import { navigate } from '../../lib/route'
import { goToStep } from '../../lib/step'
import { byPhase, closesLoop, edgeKey, linear, loopRing, phaseIndex, returnEdges, walk, type Edge } from '../../lib/workflowGraph'

type RoleId = UserTypeId | 'custom'
const ROLES: { id: RoleId; label: string }[] = [
  { id: 'designer', label: 'architecture students' },
  { id: 'practitioner', label: 'practitioner architects' },
  { id: 'planner', label: 'planners and city reviewers' },
  { id: 'engineer', label: 'engineers and consultants' },
  { id: 'custom', label: 'you, node by node' },
]
/** The compact preset line under the assistant: each starts that user type's first preset (Undo brings the board back). */
const QUICK: { id: RoleId; label: string }[] = [
  { id: 'designer', label: 'Student' }, { id: 'practitioner', label: 'Architect' }, { id: 'planner', label: 'Planner' },
  { id: 'engineer', label: 'Engineer' }, { id: 'custom', label: 'Build your own' },
]
const roleIcon = (r: RoleId) => (r === 'custom' ? TYPE_ICONS.explore : TYPE_ICONS[r])
const presetOf = (r: RoleId): Preset | null => (r === 'custom' ? null : USER_TYPES.find((t) => t.id === r)?.presets[0] ?? null)
// Each node wears its phase's colour, so it is plain which lane of the string it belongs in.
// Every node the board can hold: the checks, and the design steps (lib/workflow/designNodes.ts) that lead each phase.
const NODES = [
  ...BUILT_NODES.map((n) => { const phase: PhaseId = phaseOfNode(n.id)?.id ?? 'site'; return { id: n.id, name: n.name, icon: NODE_ICONS[n.id], phase, hue: PHASE_HUE[phase], projects: n.projects ?? (['vtc', 'city'] as ('vtc' | 'city')[]) } }),
  ...DESIGN_NODES.map((d) => ({ id: d.id, name: d.name, icon: STEP_ICONS[d.step], phase: d.phase, hue: PHASE_HUE[d.phase], projects: ['vtc', 'city'] as ('vtc' | 'city')[] })),
]
/** A preset's checks as a design process: the design step of each phase they use goes in front of that phase. */
const designed = (ids: string[]) => withDesignSteps(ids, (id) => phaseOfNode(id)?.id)
const idx = (id: string) => NODES.findIndex((n) => n.id === id)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => b[i] === x)
const key = edgeKey

/**
 * A node tile: where it is, where it is going (on the board: where it was put; off it: its slot in its lane's shelf) and
 * its scale (full on the board, small in the shelf). It glides there and stops: nothing drifts while the visitor reads.
 */
interface Body { x: number; y: number; tx: number; ty: number; s: number; vx: number; vy: number; r: number; held: boolean; on: boolean; pop: boolean }
interface Pt { x: number; y: number; px: number; py: number }
interface Rope { pts: Pt[]; slack: number }
/** Tiles in a lane's shelf are this much of their size on the board. */
const SHELF_S = 0.62
const SEG = 14 // points per rope
/** The travelling dots: a wave every 10 s (longer when the route is longer); each step of the route takes 0.9 s and
 *  starts 0.3 s after the one before it. The route goes round each loop twice before moving on (lib/coverRun.ts). */
const WAVE_EVERY = 10_000, WAVE_STEP = 300, WAVE_WIRE = 900, WAVE_REST = 2_000
/** The loop colour (one for the wire back and the forward wires it closes): orange, the complement of the run's blue (206° + 180°; Ruijie, 7 Nov). */
// Wires by meaning (design system §4, §7, 7 Nov): every connection, return connections included, is the neutral edge
// colour by default; a return connection is told apart by its dashed line, its return mark and its arrow, not by colour.
// The selected or hovered wire turns the interaction blue. The travelling dots show the run in the same blue.
const EDGE = UI.edge, EDGE_ACTIVE = UI.accent, PULSE = UI.accent

export default function Intro({ onEnter, reduced = false }: { onEnter: () => void; reduced?: boolean }) {
  const [still] = useState(() => reduced || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const box = useRef<HTMLElement>(null)
  const sentenceEl = useRef<HTMLDivElement>(null)
  const assistantEl = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLButtonElement | null)[]>([])
  const bodies = useRef<Body[]>([])
  const [size] = useState(() => Math.round(ICON.feature * Math.max(0.72, Math.min(1, (typeof window === 'undefined' ? 1200 : window.innerWidth) / 1200))))

  // ---- the workflow: the nodes on the board, the wires between them, and where it came from
  // Ruijie, 7 Nov: "Returning to the landing page must restore the active workflow, including its nodes, connections,
  // local loops, name, and selected starting preset. A fresh default workflow should appear only when the user explicitly
  // starts a new workflow" (lib/coverWorkflow.ts; the default only on a first visit, or New / a role / a preset).
  const [init] = useState(() => restoreCoverWorkflow((id) => idx(id) >= 0))
  const startIds = byPhase(designed(presetOf('designer')?.nodes ?? []))
  const [role, setRole] = useState<RoleId>(init?.role ?? 'designer')
  const [presetId, setPresetId] = useState<string | null>(init ? init.presetId : presetOf('designer')?.id ?? null)
  const [customName, setCustomName] = useState<string | null>(init?.customName ?? null)
  const [onBoard, setOnBoard] = useState<string[]>(() => init?.nodes ?? startIds)
  const [edges, setEdges] = useState<Edge[]>(() => init?.edges ?? linear(startIds))
  const roleRef = useRef(role); roleRef.current = role
  const presetIdRef = useRef(presetId); presetIdRef.current = presetId
  const customNameRef = useRef(customName); customNameRef.current = customName
  const onRef = useRef(onBoard); onRef.current = onBoard
  const edgesRef = useRef(edges); edgesRef.current = edges
  // The run: what Start reaches along the wires, in that order. A wire to an earlier node (or itself) is a loop.
  const chain = useMemo(() => walk(edges), [edges])
  const chainRef = useRef(chain); chainRef.current = chain
  // Return connections, from the directed wires alone (Ruijie, 7 Nov): not from positions or lanes.
  const returns = useMemo(() => returnEdges(edges), [edges])
  const isLoop = (e: Edge) => returns.has(key(e))
  const loop = returns.size > 0
  const preset = presetId ? presetById(presetId) ?? null : null
  const edited = !!preset && !(sameList(chain, byPhase(preset.nodes)) && onBoard.length === preset.nodes.length && edges.length === preset.nodes.length + 1)
  const name = preset ? (edited ? `${preset.name} (edited)` : preset.name) : customName ?? 'Your workflow'

  const [menu, setMenu] = useState(false)

  // ---- layout: the string's band across the top, its two ends, the room below
  const dims = useRef({ W: typeof window === 'undefined' ? 1200 : window.innerWidth, H: typeof window === 'undefined' ? 800 : window.innerHeight })
  const [, relayout] = useState(0)
  // Ruijie, 7 Nov: "Keep the editable workflow at the top. Put unused nodes in a stable, compact library tray … Prevent
  // interactive tiles from appearing behind the assistant or title." The band holds the five lanes; the foot of each lane
  // is its shelf, where its unused nodes wait in a fixed order (its height fits all of that phase, so it never jumps).
  const band = () => { const { W, H } = dims.current; return { x0: 0, y0: 0, x1: W, y1: Math.max(340, H * 0.46) } }
  const span = () => { const { W } = dims.current, sx = Math.max(48, W * 0.05), ex = W - Math.max(56, W * 0.055); return { sx, ex, x0: sx + 44, x1: ex - 44 } }
  const shelfGeom = () => {
    const { x0, x1 } = span(), w = (x1 - x0) / PHASES.length, cell = Math.round(size * SHELF_S) + 8, cap = Math.max(1, Math.floor((w - 16) / cell))
    const rows = Math.max(1, ...PHASES.map((ph) => Math.ceil(NODES.filter((n) => n.phase === ph.id).length / cap)))
    return { cell, cap, h: rows * cell + 10 }
  }
  /** Where nodes on the board sit: below the lane headers, above the shelves. */
  const nodeArea = () => { const b = band(); return { y0: b.y0 + 140, y1: b.y1 - 14 - shelfGeom().h } }
  /** The workflow card (Ruijie, 7 Nov, landing atmosphere): the stable ivory surface around Start, the lanes and Enter. */
  const cardBox = () => {
    if (narrow()) return { L: 12, R: dims.current.W - 12, T: 50, B: 50 + 196 }
    const s = span(), b = band(), t = ICON.feature + 8; return { L: s.sx - t / 2 - 18, R: s.ex + t / 2 + 18, T: 54, B: b.y1 + 4 }
  }
  /** Phones: the draggable canvas can't stay readable, so the card shows the workflow as a compact strip instead. */
  const narrow = () => dims.current.W < 640
  const ends = () => { const s = span(), a = nodeArea(), mid = (a.y0 + a.y1) / 2 + 6; return { start: { x: s.sx, y: mid }, enter: { x: s.ex, y: mid } } }
  /** The five phase lanes along the string, Start to Enter, each with its shelf at the foot. */
  const lanes = () => {
    const s = span(), a = nodeArea(), b = band(), w = (s.x1 - s.x0) / PHASES.length
    return PHASES.map((ph, k) => ({ ph, x0: s.x0 + k * w, x1: s.x0 + (k + 1) * w, y0: a.y0, y1: a.y1, shelfTop: a.y1 + 8, shelfBottom: b.y1 - 6 }))
  }
  /** Each unused node's slot in its lane's shelf, in the registry's order. */
  const shelfSlots = (on: string[]) => {
    const g = shelfGeom(), out = new Map<string, { x: number; y: number }>()
    for (const lane of lanes()) {
      NODES.filter((n) => n.phase === lane.ph.id && !on.includes(n.id)).forEach((n, j) => {
        out.set(n.id, { x: lane.x0 + 8 + g.cell / 2 + (j % g.cap) * g.cell, y: lane.shelfTop + 5 + g.cell / 2 + Math.floor(j / g.cap) * g.cell })
      })
    }
    return out
  }
  const shelfRef = useRef(new Map<string, { x: number; y: number }>())
  /** Put a node on the board at (x, y): it glides there from wherever it is, and lands with a small pop. */
  const place = (id: string, x: number, y: number, pop = true) => {
    const b = bodies.current[idx(id)]
    if (!b) return
    if (!b.on && pop) b.pop = true
    b.tx = x; b.ty = y; b.on = true; b.held = false
  }
  /** Where a node goes in its own lane, and where in the string's order (after the nodes of its phase and earlier). */
  const slotFor = (id: string, list: string[]) => {
    const lane = lanes().find((l) => l.ph.id === NODES[idx(id)].phase)!, mates = list.filter((x) => NODES[idx(x)].phase === lane.ph.id).length
    const x = lane.x0 + (lane.x1 - lane.x0) * Math.min(0.85, 0.2 + mates * 0.18), y = (lane.y0 + lane.y1) / 2 + Math.sin((idx(id) + mates) * 1.7) * (lane.y1 - lane.y0) * 0.22
    let at = 0
    list.forEach((x2, k) => { if (phaseIndex(x2) <= phaseIndex(id)) at = k + 1 })
    return { x, y, at }
  }
  const [hot, setHot] = useState<PhaseId | null>(null)

  /** Thread nodes along the string, evenly between its ends, in a gentle wave. */
  const layout = (ids: string[]) => {
    lanes().forEach((lane) => {
      const mine = ids.filter((id) => NODES[idx(id)].phase === lane.ph.id)
      mine.forEach((id, j) => {
        const body = bodies.current[idx(id)]
        if (!body) return
        // A crowded lane takes two rows, so the tiles and their names stay clear of each other.
        const lift = mine.length > 2 ? (j % 2 ? 1 : -1) * Math.min(46, (lane.y1 - lane.y0) * 0.26) : Math.sin(idx(id) * 1.3) * (lane.y1 - lane.y0) * 0.2
        place(id, lane.x0 + ((j + 1) / (mine.length + 1)) * (lane.x1 - lane.x0), (lane.y0 + lane.y1) / 2 + lift)
      })
    })
  }
  /** Taken off the string: it glides back to its slot in its lane's shelf. */
  const release = (ids: string[]) => ids.forEach((id) => {
    const body = bodies.current[idx(id)]
    if (!body) return
    body.on = false; body.held = false; body.pop = false
  })

  // ---- editing the board: every change sets the nodes and the wires together
  const commit = (on: string[], es: Edge[]) => {
    const seen = new Set<string>(), clean = es.filter((e) => e.a !== e.b && on.concat('start', 'enter').includes(e.a) && on.concat('start', 'enter').includes(e.b) && !seen.has(key(e)) && seen.add(key(e)))
    // Editing the string by hand while the assistant's proposal is shown keeps the proposal (as if applied), so Undo
    // still goes back to before it.
    if (assistKept.current && !assistCommitting.current) { history.current.push(assistKept.current); assistKept.current = null; setProposed(null); setCanUndo(true) }
    // Every change the visitor makes can be undone (Ctrl+Z): the state before it is kept, once per action.
    if (!assistCommitting.current && !kept.current && !remembered.current) {
      remembered.current = true; history.current.push(snapshot()); setCanUndo(true)
      queueMicrotask(() => { remembered.current = false })
    }
    onRef.current = on; edgesRef.current = clean
    setOnBoard(on); setEdges(clean)
  }
  const has = (es: Edge[], a: string, b: string) => es.some((e) => e.a === a && e.b === b)
  /** Put `id` on the wire a → b (or after a, when there is no such wire). */
  const insertOn = (id: string, a: string, b: string, on = onRef.current, es = edgesRef.current) => {
    const rest = es.filter((e) => !(e.a === a && e.b === b))
    commit(on.includes(id) ? on : [...on, id], [...rest, { a, b: id }, { a: id, b }])
  }
  /** Thread `id` in phase order: after the last node of its phase or earlier, before the next one. */
  const insertByPhase = (id: string) => {
    const run = chainRef.current
    let p = 'start'
    run.forEach((x) => { if (phaseIndex(x) <= phaseIndex(id)) p = x })
    const q = run[run.indexOf(p) + 1] ?? 'enter'
    insertOn(id, p, has(edgesRef.current, p, q) ? q : 'enter')
  }
  /** Take `id` off the board; the wires through it are joined up (but not loops through it). */
  const takeOff = (id: string) => {
    const es = edgesRef.current, ins = es.filter((e) => e.b === id && e.a !== id), outs = es.filter((e) => e.a === id && e.b !== id)
    const rest = es.filter((e) => e.a !== id && e.b !== id)
    const rank = (x: string) => (x === 'start' ? -1 : x === 'enter' ? 1e9 : chainRef.current.indexOf(x))
    for (const u of ins) for (const v of outs) if (rank(u.a) < rank(v.b) && !has(rest, u.a, v.b)) rest.push({ a: u.a, b: v.b })
    commit(onRef.current.filter((x) => x !== id), rest)
  }
  /** A wire from a to b (b put on the board first when it is floating). */
  const wire = (a: string, b: string) => {
    if (a === b || a === 'enter' || b === 'start' || has(edgesRef.current, a, b)) return
    let on = onRef.current
    if (b !== 'enter' && !on.includes(b)) {
      const sl = slotFor(b, chainRef.current)
      place(b, sl.x, sl.y)
      on = [...on, b]
    }
    commit(on, [...edgesRef.current, { a, b }])
  }

  /** Put a role's starting workflow on the string (the nodes not in it fall back into the room). */
  const applyBoard = (r: RoleId, p: Preset | null) => {
    setRole(r); setPresetId(p?.id ?? null); setCustomName(null)
    const ids = p ? byPhase(designed(p.nodes)) : []
    release(onRef.current.filter((id) => !ids.includes(id)))
    layout(ids)
    commit(ids, linear(ids))
  }
  const apply = (r: RoleId) => applyBoard(r, presetOf(r))
  const kept = useRef<Snap | null>(null)
  // ---- the workflow assistant's proposals (Ruijie, 7 Nov): previewed on the canvas, then applied or discarded; applied
  // ones come back with Undo. A snapshot keeps the role, the board and where each node sat.
  type Snap = { role: RoleId; presetId: string | null; customName: string | null; on: string[]; edges: Edge[]; at: Map<string, { x: number; y: number }> }
  const snapshot = (): Snap => ({ role: roleRef.current, presetId: presetIdRef.current, customName: customNameRef.current, on: [...onRef.current], edges: [...edgesRef.current],
    at: new Map(onRef.current.map((id) => { const b = bodies.current[idx(id)]; return [id, { x: b?.tx ?? 0, y: b?.ty ?? 0 }] })) })
  const restoreSnap = (k: Snap) => {
    release(onRef.current.filter((id) => !k.on.includes(id)))
    k.on.forEach((id) => { const p = k.at.get(id); if (p) place(id, p.x, p.y) })
    setRole(k.role); setPresetId(k.presetId); setCustomName(k.customName)
    assistCommitting.current = true; commit(k.on, k.edges); assistCommitting.current = false
  }
  const assistKept = useRef<Snap | null>(null)
  const remembered = useRef(false)
  const assistCommitting = useRef(false)
  const history = useRef<Snap[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [proposed, setProposed] = useState<{ added: Set<string>; removed: Set<string> } | null>(null)
  const [focusNode, setFocusNode] = useState<string | null>(null)
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const previewProposal = (p: Proposal) => {
    if (assistKept.current) restoreSnap(assistKept.current)
    else assistKept.current = snapshot()
    const ids = p.board.nodes, run = walk(p.board.edges)
    release(onRef.current.filter((id) => !ids.includes(id)))
    if (p.capability === 'suggest') { layout(run); setRole(p.preset?.type ?? 'custom'); setPresetId(p.preset?.id ?? null); setCustomName(p.preset ? null : 'Your workflow') }
    else p.added.forEach((id) => { const sl = slotFor(id, run.filter((x) => x !== id)); place(id, sl.x, sl.y) })
    assistCommitting.current = true; commit(ids, p.board.edges); assistCommitting.current = false
    setProposed({ added: new Set(p.added), removed: new Set(p.removed) })
  }
  const applyProposal = () => { if (assistKept.current) { history.current.push(assistKept.current); setCanUndo(true) } assistKept.current = null; setProposed(null) }
  const discardProposal = () => { const k = assistKept.current; assistKept.current = null; setProposed(null); if (k) restoreSnap(k) }
  const undoAssistant = () => { const k = history.current.pop(); setCanUndo(history.current.length > 0); setSelectedWire(null); setNotice(null); if (k) restoreSnap(k) }
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { if (linking.current) cancelConnecting(); setSelectedWire(null); setNotice(null); return }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      if ((e.target as HTMLElement)?.closest?.('textarea, input')) return
      if (assistKept.current) { e.preventDefault(); discardProposal() } else if (history.current.length) { e.preventDefault(); undoAssistant() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // The role menu previews (Ruijie, 7 Nov: "hover over different roles … make the corresponding preset appear on screen
  // to replace the demo one"): opening it keeps the string as it is; hovering or focusing a role shows that role's
  // workflow; leaving the list, Escape or a click outside puts the kept string back; a click on a role keeps it.
  const openMenu = () => {
    kept.current = snapshot()
    setMenu(true)
  }
  const preview = (r: RoleId) => { if (kept.current) apply(r) }
  const restore = () => {
    const k = kept.current
    if (!k) return
    restoreSnap(k)
  }
  const closeMenu = () => { restore(); kept.current = null; setMenu(false) }
  const pick = (r: RoleId) => {
    setMenu(false)
    const k = kept.current
    kept.current = null
    if (k) { history.current.push(k); setCanUndo(true) }
    assistCommitting.current = true; apply(r); assistCommitting.current = false
  }
  useEffect(() => {
    if (!menu) return
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    const outside = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.('[data-role-menu]')) closeMenu() }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside, true) }
  }, [menu]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Presets (Ruijie, 7 Nov: "a clearer Presets control that opens a compact panel while keeping the current workflow
  // visible. Choosing a preset should update the same canvas"): hover or focus previews it on the canvas, leaving puts the
  // current workflow back, a click keeps it (Undo brings the previous one back).
  const [presetsOpen, setPresetsOpen] = useState(false)
  const openPresets = () => { kept.current = snapshot(); setPresetsOpen(true) }
  const previewPreset = (p: Preset) => { if (kept.current) applyBoard(p.type, p) }
  const closePresets = () => { restore(); kept.current = null; setPresetsOpen(false) }
  const pickPreset = (p: Preset) => {
    setPresetsOpen(false)
    const k = kept.current
    kept.current = null
    if (k) { history.current.push(k); setCanUndo(true) }
    assistCommitting.current = true; applyBoard(p.type, p); assistCommitting.current = false
  }
  useEffect(() => {
    if (!presetsOpen) return
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closePresets() }
    const outside = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.('[data-presets]')) closePresets() }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside, true) }
  }, [presetsOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  /** A new workflow, only on request: the default starting preset (Undo brings this one back). */
  const newWorkflow = () => {
    history.current.push(snapshot()); setCanUndo(true)
    assistCommitting.current = true; apply('designer'); assistCommitting.current = false
  }

  // ---- keep the workflow (lib/coverWorkflow.ts): as it changes, when the cover closes, and when the page goes away. A
  // preview still showing is not saved: what was there before it is.
  const persistNow = () => {
    const k = assistKept.current ?? kept.current, { W, H } = dims.current
    const nodes = k ? k.on : onRef.current
    const pos = (id: string) => { if (k) return k.at.get(id); const b = bodies.current[idx(id)]; return b ? { x: b.tx, y: b.ty } : undefined }
    const at: Record<string, [number, number]> = {}
    for (const id of nodes) { const q = pos(id); if (q && W > 0 && H > 0) at[id] = [q.x / W, q.y / H] }
    saveCoverWorkflow({ role: k ? k.role : roleRef.current, presetId: k ? k.presetId : presetIdRef.current, customName: k ? k.customName : customNameRef.current, nodes, edges: k ? k.edges : edgesRef.current, at })
  }
  const persistRef = useRef(persistNow); persistRef.current = persistNow
  useEffect(() => { const t = setTimeout(() => persistRef.current(), 250); return () => clearTimeout(t) }, [onBoard, edges, role, presetId, customName])
  useEffect(() => {
    const bye = () => persistRef.current()
    window.addEventListener('pagehide', bye)
    return () => { window.removeEventListener('pagehide', bye); persistRef.current() }
  }, [])

  // Keep the tiles in step with the board: on it they stay put (lit when wired in), the rest float.
  useEffect(() => {
    const on = new Set(onBoard)
    NODES.forEach((n, i) => {
      const b = bodies.current[i]
      if (b && on.has(n.id) && !b.on) { const sl = slotFor(n.id, chainRef.current.filter((x) => x !== n.id)); b.tx = sl.x; b.ty = sl.y; b.pop = true }
      if (b) b.on = on.has(n.id)
      els.current[i]?.setAttribute('data-on', on.has(n.id) ? '1' : '0')
    })
    shelfRef.current = shelfSlots(onBoard)
  }, [onBoard]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the ropes (verlet), keyed by link, and the frame loop that moves everything
  const ropes = useRef(new Map<string, Rope>())
  const ropeLine = useRef(new Map<string, SVGPathElement | null>())
  // Enter's hint (Ruijie, 7 Nov: "give the visual hint by popping the Enter button … so that users know where to click
  // once they set up the nodes"): the tile pops and a ring ripples out once, never while the visitor is mid-drag.
  const enterTile = useRef<HTMLSpanElement>(null)
  const enterRing = useRef<HTMLSpanElement>(null)
  const popEnter = () => {
    if (still || !chainRef.current.length || bodies.current.some((b) => b.held)) return
    enterTile.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 640, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
    enterRing.current?.animate([{ opacity: 0.7, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.45)' }], { duration: 760, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
  }
  const popEnterRef = useRef(popEnter); popEnterRef.current = popEnter
  const lastRunPop = useRef(-1)
  // One dot per step of the route (a wire inside a loop is travelled more than once), and each wire's current points.
  const routeDots = useRef<(SVGCircleElement | null)[]>([])
  const wirePts = useRef(new Map<string, { x: number; y: number }[]>())
  // A loop's ring (Ruijie, 7 Nov: "make the loop strings a different colour from the main string, once they loop the entire
  // loop turn into 1 colour"): the wire back plus every forward wire between its two ends, all in the loop colour.
  const links = useMemo(() => {
    const ring = new Set<string>()
    for (const e of edges) if (returns.has(key(e))) loopRing(edges, e, returns).forEach((k) => ring.add(k))
    return edges.map((e) => ({ key: key(e), a: e.a, b: e.b, loop: returns.has(key(e)), ring: ring.has(key(e)) }))
  }, [edges, returns])
  // Enter pops once the workflow has settled after an edit (not when the page first opens).
  const editsSeen = useRef(false)
  useEffect(() => {
    if (!editsSeen.current) { editsSeen.current = true; return }
    const id = setTimeout(() => popEnterRef.current(), 900)
    return () => clearTimeout(id)
  }, [edges])
  // The dots' route: the workflow in order, twice round each loop before the next step (Ruijie, 7 Nov).
  const route = useMemo(() => dotRoute(edges, returns), [edges, returns])
  const routeRef = useRef(route); routeRef.current = route
  // Each wire's arrow (its direction), the passive return mark on a return, and an invisible point a keyboard can focus
  // to select the wire; positioned every frame along the rope.
  const arrows = useRef(new Map<string, SVGPathElement | null>())
  const retMarks = useRef(new Map<string, SVGGElement | null>())
  const mids = useRef(new Map<string, HTMLButtonElement | null>())
  const midAt = useRef(new Map<string, { x: number; y: number }>())
  // Which wire shows its label: selected, else focused, else hovered (Ruijie, 7 Nov: "Return to [node]" only then).
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [focusWire, setFocusWire] = useState<string | null>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const tipKey = selectedWire ?? focusWire ?? hoverWire
  const tipKeyRef = useRef(tipKey); tipKeyRef.current = tipKey
  const tipEl = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 8000); return () => clearTimeout(t) }, [notice])
  const label = (id: string) => (id === 'start' ? 'Start' : id === 'enter' ? 'Enter' : NODES[idx(id)]?.name ?? id)
  /** Remove one wire (only that one); Undo brings it back. */
  const removeWire = (k: string) => {
    const at = midAt.current.get(k) ?? { x: 0, y: 0 }, l = links.find((x) => x.key === k)
    commit(onRef.current, edgesRef.current.filter((e) => key(e) !== k))
    setSelectedWire(null); setFocusWire(null); setHoverWire(null)
    setNotice({ text: l?.loop ? `Return to ${label(l.b)} removed` : 'Connection removed', x: at.x, y: at.y })
  }
  const ropeHit = useRef(new Map<string, SVGPathElement | null>())
  // Movement explains an action (Ruijie, 7 Nov): a new wire draws itself in. Each wire's direction: a see-through arrow,
  // and dots travelling along it in a wave every 10 s (with reduced motion, the arrow alone).
  const prevKeys = useRef<Set<string> | null>(null)
  // A wire being rewired: its loose end follows the pointer.
  const rewiring = useRef<{ key: string; a: string; b: string; end: 'a' | 'b'; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null)
  const linksRef = useRef(links); linksRef.current = links
  useEffect(() => {
    const now = new Set(links.map((l) => l.key)), prev = prevKeys.current
    prevKeys.current = now
    if (!prev || still) return
    for (const k of now) if (!prev.has(k)) ropeLine.current.get(k)?.animate([{ strokeDasharray: '900', strokeDashoffset: '900' }, { strokeDasharray: '900', strokeDashoffset: '0' }], { duration: 560, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' })
  }, [links, still])

  const centre = (id: string) => {
    if (id === 'start' || id === 'enter') return ends()[id]
    const b = bodies.current[idx(id)]
    return b ? { x: b.x, y: b.y } : { x: 0, y: 0 }
  }

  const drag = useRef<{ i: number; ox: number; oy: number; sx: number; sy: number; px: number; py: number; pt: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const next = { W: el.clientWidth, H: el.clientHeight }
      if (next.W !== dims.current.W || next.H !== dims.current.H) { dims.current = next; relayout((n) => n + 1) }
      void r
      shelfRef.current = shelfSlots(onRef.current)
    }
    measure()
    const { W, H } = dims.current
    const slots = shelfSlots(onRef.current)
    bodies.current = NODES.map((n) => {
      const r = size / 2, sl = slots.get(n.id) ?? { x: -200, y: -200 }
      return { x: sl.x, y: sl.y, tx: sl.x, ty: sl.y, s: SHELF_S, vx: 0, vy: 0, r, held: false, on: false, pop: false }
    })
    // The board as it was left (restored positions), else laid out along the lanes; no gliding on arrival.
    const at = init?.at ?? {}, area = nodeArea()
    if (onRef.current.length && onRef.current.every((id) => at[id])) {
      for (const id of onRef.current) { const [fx, fy] = at[id]; place(id, Math.max(30, Math.min(W - 30, fx * W)), Math.max(area.y0 - 20, Math.min(area.y1, fy * H)), false) }
    } else layout([...chainRef.current, ...onRef.current.filter((id) => !chainRef.current.includes(id))])
    for (const b of bodies.current) if (b.on) { b.x = b.tx; b.y = b.ty; b.s = 1; b.pop = false }

    const draw = () => bodies.current.forEach((b, i) => {
      const d = els.current[i]
      if (d) d.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0) scale(${b.s.toFixed(3)})` // upright, never turned (Ruijie, 7 Nov)
    })
    const pop = (i: number) => { if (!still) els.current[i]?.querySelector('.node-tile')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }) }
    const ropeStep = (dt: number, t: number) => {
      const seen = new Set<string>()
      for (const l of linksRef.current) {
        seen.add(l.key)
        const rw = rewiring.current?.key === l.key && rewiring.current.moved ? rewiring.current : null
        const A = rw?.end === 'a' ? { x: rw.x, y: rw.y } : centre(l.a), B = rw?.end === 'b' ? { x: rw.x, y: rw.y } : centre(l.b)
        let rope = ropes.current.get(l.key)
        if (!rope) {
          rope = { slack: 1.1, pts: Array.from({ length: SEG + 1 }, (_, k) => { const u = k / SEG, x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u; return { x, y, px: x, py: y } }) }
          ropes.current.set(l.key, rope)
        }
        // A loop runs back from its later node to its earlier one and bulges to the right of that way (on screen), so with
        // the run it closes a counterclockwise circle (Ruijie, 7 Nov): back from right to left, it arcs above the run.
        const span = Math.max(1, Math.hypot(B.x - A.x, B.y - A.y)), sag = l.loop ? 70 : Math.min(26, span * 0.22)
        const side = l.loop && span > 1 ? { x: -(B.y - A.y) / span, y: (B.x - A.x) / span } : { x: 0, y: 1 }
        const p = rope.pts, g = still ? 0 : 900 * dt * dt
        rope.slack = 1 + (8 / 3) * (sag / span) ** 2
        for (let k = 1; k < SEG; k++) {
          const q = p[k], vx = (q.x - q.px) * 0.95, vy = (q.y - q.py) * 0.95
          q.px = q.x; q.py = q.y; q.x += vx + g * side.x; q.y += vy + g * side.y
        }
        p[0].x = A.x; p[0].y = A.y; p[SEG].x = B.x; p[SEG].y = B.y
        const rest = (Math.hypot(B.x - A.x, B.y - A.y) * rope.slack) / SEG
        for (let it = 0; it < 6; it++) for (let k = 0; k < SEG; k++) {
          const a = p[k], b = p[k + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - rest) / d / 2
          if (k > 0) { a.x += dx * diff; a.y += dy * diff }
          if (k + 1 < SEG) { b.x -= dx * diff; b.y -= dy * diff }
        }
        if (still) for (let k = 1; k < SEG; k++) { const u = k / SEG, bow = Math.sin(Math.PI * u) * (l.loop ? 60 : 14); p[k].x = A.x + (B.x - A.x) * u + side.x * bow; p[k].y = A.y + (B.y - A.y) * u + side.y * bow }
        // draw: a smooth line through the points
        let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`
        for (let k = 1; k < SEG; k++) { const mx = (p[k].x + p[k + 1].x) / 2, my = (p[k].y + p[k + 1].y) / 2; d += ` Q${p[k].x.toFixed(1)},${p[k].y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}` }
        ropeLine.current.get(l.key)?.setAttribute('d', d)
        ropeHit.current.get(l.key)?.setAttribute('d', d)
        // its arrow (the direction it runs), a little past the middle
        const ka = Math.round(SEG * 0.6), P1 = p[ka], P2 = p[ka + 1]
        arrows.current.get(l.key)?.setAttribute('transform', `translate(${((P1.x + P2.x) / 2).toFixed(1)} ${((P1.y + P2.y) / 2).toFixed(1)}) rotate(${((Math.atan2(P2.y - P1.y, P2.x - P1.x) * 180) / Math.PI).toFixed(1)})`)
        const M = p[SEG / 2]
        midAt.current.set(l.key, { x: M.x, y: M.y })
        const mb = mids.current.get(l.key)
        if (mb) mb.style.transform = `translate3d(${(M.x - 9).toFixed(1)}px, ${(M.y - 9).toFixed(1)}px, 0)`
        const R = p[Math.round(SEG * 0.32)]
        retMarks.current.get(l.key)?.setAttribute('transform', `translate(${R.x.toFixed(1)} ${R.y.toFixed(1)})`)
        if (tipKeyRef.current === l.key && tipEl.current) tipEl.current.style.transform = `translate3d(${M.x.toFixed(1)}px, ${(M.y - 14).toFixed(1)}px, 0) translate(-50%, -100%)`
        wirePts.current.set(l.key, p)
      }
      // The travelling dots, the way each wire runs (a return's runs back): every 10 s one run goes from Start to Enter at a
      // normal pace, each step just after the one before it, twice round each loop before moving on; then the dots rest
      // until the next run (Ruijie, 7 Nov).
      if (!still) {
        const R = routeRef.current, cycle = Math.max(WAVE_EVERY, (R.length - 1) * WAVE_STEP + WAVE_WIRE + WAVE_REST), tt = t % cycle
        const runEnd = (R.length - 1) * WAVE_STEP + WAVE_WIRE, n = Math.floor(t / cycle)
        if (R.length && tt >= runEnd && lastRunPop.current !== n) { lastRunPop.current = n; popEnterRef.current() }
        R.forEach((k, i) => {
          const c = routeDots.current[i], q = wirePts.current.get(k)
          if (!c) return
          const f = (tt - i * WAVE_STEP) / WAVE_WIRE
          if (!q || f < 0 || f > 1) { c.setAttribute('opacity', '0'); return }
          const at = f * SEG, j = Math.min(SEG - 1, Math.floor(at)), u = at - j
          c.setAttribute('cx', (q[j].x + (q[j + 1].x - q[j].x) * u).toFixed(1)); c.setAttribute('cy', (q[j].y + (q[j + 1].y - q[j].y) * u).toFixed(1))
          c.setAttribute('opacity', Math.min(1, f * 8, (1 - f) * 8).toFixed(2)) // fades in and out at the wire's ends
        })
      }
      for (const k of [...wirePts.current.keys()]) if (!seen.has(k)) wirePts.current.delete(k)
      for (const key of [...ropes.current.keys()]) if (!seen.has(key)) ropes.current.delete(key)
    }

    let raf = 0, last = performance.now(), on = true
    const step = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000); last = t
      const bs = bodies.current, k = 1 - Math.exp(-dt * 11)
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]
        // Lifted, it grows to full size; otherwise it glides to its place (board or shelf) and stops there.
        if (b.held) { b.s += (1 - b.s) * k; continue }
        const tg = b.on ? { x: b.tx, y: b.ty } : shelfRef.current.get(NODES[i].id) ?? { x: b.tx, y: b.ty }
        b.x += (tg.x - b.x) * k; b.y += (tg.y - b.y) * k; b.s += ((b.on ? 1 : SHELF_S) - b.s) * k
        if (Math.abs(tg.x - b.x) < 0.2 && Math.abs(tg.y - b.y) < 0.2) { b.x = tg.x; b.y = tg.y }
        if (b.pop && Math.hypot(tg.x - b.x, tg.y - b.y) < 3) { b.pop = false; pop(i) }
      }
      ropeStep(dt, t)
      draw()
      if (on) raf = requestAnimationFrame(step)
    }
    const frame = () => {
      // Reduced motion: everything is where it belongs at once.
      for (const [i, b] of bodies.current.entries()) { if (b.held) continue; const tg = b.on ? { x: b.tx, y: b.ty } : shelfRef.current.get(NODES[i].id) ?? { x: b.tx, y: b.ty }; b.x = tg.x; b.y = tg.y; b.s = b.on ? 1 : SHELF_S }
      ropeStep(1 / 60, performance.now()); draw()
    }
    const start = () => { if (raf) return; if (still) { frame(); return } on = true; last = performance.now(); raf = requestAnimationFrame(step) }
    const stop = () => { on = false; cancelAnimationFrame(raf); raf = 0 }
    const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.05 })
    seen.observe(el)
    const persistLater = () => setTimeout(() => persistRef.current(), 50)
    const ro = new ResizeObserver(() => { measure(); frame() })
    // The assistant grows with its reply: the floating nodes keep clear of it.
    ;[el, sentenceEl.current, assistantEl.current].forEach((x) => x && ro.observe(x))
    frame()

    // ---- dragging: pick up, carry, drop (thread / reorder / take off) or throw
    const distToLink = (x: number, y: number, key: string) => {
      const r = ropes.current.get(key)
      if (!r) return Infinity
      let m = Infinity
      for (let k = 0; k < SEG; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1
        const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L))
        m = Math.min(m, Math.hypot(a.x + dx * u - x, a.y + dy * u - y))
      }
      return m
    }
    /** The wire nearest the point (not a loop, not touching `self`), and how far it is. */
    const nearestLink = (x: number, y: number, self?: string) => {
      let best: { a: string; b: string; d: number } | null = null
      for (const l of linksRef.current) {
        if (l.loop || l.a === self || l.b === self) continue
        const d = distToLink(x, y, l.key)
        if (!best || d < best.d) best = { a: l.a, b: l.b, d }
      }
      return best
    }
    const move = (e: PointerEvent) => {
      const g = drag.current
      if (!g) return
      const b = bodies.current[g.i], r = el.getBoundingClientRect(), now = performance.now(), dt = Math.max(0.008, (now - g.pt) / 1000)
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 5) g.moved = true
      b.vx = (e.clientX - g.px) / dt; b.vy = (e.clientY - g.py) / dt
      g.px = e.clientX; g.py = e.clientY; g.pt = now
      b.x = e.clientX - r.left - g.ox; b.y = e.clientY - r.top - g.oy
      if (still) frame()
    }
    const up = () => {
      const g = drag.current
      if (!g) return
      drag.current = null
      setHot(null)
      const b = bodies.current[g.i], id = NODES[g.i].id, area = nodeArea()
      b.held = false
      const fling = Math.hypot(b.vx, b.vy) > 1300
      persistLater()
      if (b.on) {
        // On the board: flicked or dragged down into the shelves, it comes off (back to its shelf); dropped on another
        // wire, it moves onto it; anywhere else on the board it stays where it was put (layout only).
        if (fling || b.y > area.y1 + 10) { release([id]); takeOff(id); return }
        const near = nearestLink(b.x, b.y, id)
        b.tx = b.x; b.ty = b.y
        if (g.moved && near && near.d < 40) { takeOff(id); place(id, b.x, b.y, false); insertOn(id, near.a, near.b) }
        if (still) frame()
        return
      }
      // In its shelf: a click threads it in phase order (it glides to its place); dropped on the board, it goes there.
      if (!g.moved) {
        const sl = slotFor(id, chainRef.current)
        place(id, sl.x, sl.y)
        insertByPhase(id)
        return
      }
      if (b.y < area.y1 + 6) {
        const near = nearestLink(b.x, b.y)
        place(id, b.x, b.y, false); pop(g.i)
        if (near && near.d < 90) insertOn(id, near.a, near.b); else insertByPhase(id)
        return
      }
      // Let go anywhere else: it glides back to its shelf.
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { stop(); seen.disconnect(); ro.disconnect(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [size, still]) // eslint-disable-line react-hooks/exhaustive-deps

  const grab = (i: number, cx: number, cy: number) => {
    const el = box.current!, b = bodies.current[i], r = el.getBoundingClientRect()
    if (!b) return
    setHot(NODES[i].phase)
    b.held = true
    drag.current = { i, ox: cx - r.left - b.x, oy: cy - r.top - b.y, sx: cx, sy: cy, px: cx, py: cy, pt: performance.now(), moved: false }
  }
  // Connecting (Ruijie, 7 Nov, after Miro: "hover to the 4 sides of the nodes, give the preview to indicate that they
  // could connect the node by drag and connect"; then "allow for creating loops and allow for drag and unconnect the
  // nodes like how Grasshopper connects its nodes"): a node on the board shows a handle on each side on hover; dragging
  // from one draws a curved connector; let go on a node (or Enter) to wire them, a wire back to an earlier node being a
  // loop. A wire grabbed near one end comes loose at that end: let go on another node to rewire it, anywhere else to
  // cut it.
  type Side = 'n' | 'e' | 's' | 'w'
  const SIDE: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }
  const linking = useRef<{ from: string; side: Side; sx: number; sy: number; moved?: boolean; pending?: boolean } | null>(null)
  // While connecting: the node it starts from (valid targets light up) and the hint over the target under the pointer.
  const [connecting, setConnecting] = useState<string | null>(null)
  // A connection started by a click, a tap or the keyboard waits for its target: its guidance shows over the source.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const pendingRef = useRef(setPendingFrom)
  // The node whose connection points show (tapped or clicked); a tap anywhere else hides them again.
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => { const t = e.target as Element; if (!t?.closest?.('[data-cover-node], [data-testid="wire-tip"]')) setSelectedNode(null) }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [])
  const [linkHint, setLinkHint] = useState<{ id: string; loop: boolean; x: number; y: number } | null>(null)
  const hintRef = useRef((h: { id: string; loop: boolean; el: HTMLElement } | null) => {
    if (!h) { setLinkHint(null); return }
    const r = box.current!.getBoundingClientRect(), q = h.el.getBoundingClientRect()
    setLinkHint((cur) => (cur && cur.id === h.id && cur.loop === h.loop ? cur : { id: h.id, loop: h.loop, x: q.left + q.width / 2 - r.left, y: q.top - r.top }))
  })
  const selectWireRef = useRef((k: string) => setSelectedWire(k))
  /** Start connecting from a node without dragging (keyboard C, or a tap on a connection point). */
  const startConnecting = (id: string) => {
    const b = bodies.current[idx(id)]
    if (!b) return
    linking.current = { from: id, side: 'e', sx: b.x + b.r, sy: b.y, pending: true, moved: true }
    setConnecting(id); setPendingFrom(id)
  }
  const cancelConnecting = () => { linking.current = null; linkPreview.current?.setAttribute('d', ''); setConnecting(null); setPendingFrom(null); setLinkHint(null); document.querySelectorAll('[data-link-target]').forEach((el) => el.removeAttribute('data-link-target')) }
  const linkPreview = useRef<SVGPathElement>(null)
  const connect = (from: string, to: string) => wire(from, to)
  const connectRef = useRef(connect); connectRef.current = connect
  /** The end of a rewired wire let go: on a node it is wired there, anywhere else it is cut. */
  const finishRewire = (rw: { a: string; b: string; end: 'a' | 'b' }, target: string | null) => {
    const rest = edgesRef.current.filter((e) => !(e.a === rw.a && e.b === rw.b))
    commit(onRef.current, rest)
    if (!target) return
    if (rw.end === 'b') wire(rw.a, target); else wire(target, rw.b)
  }
  const finishRewireRef = useRef(finishRewire); finishRewireRef.current = finishRewire
  const startRewire = (k: string, a: string, b: string, e: { clientX: number; clientY: number; stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation(); e.preventDefault()
    const r = box.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, rope = ropes.current.get(k)
    const A = rope?.pts[0] ?? centre(a), B = rope?.pts[SEG] ?? centre(b)
    rewiring.current = { key: k, a, b, end: Math.hypot(x - A.x, y - A.y) < Math.hypot(x - B.x, y - B.y) ? 'a' : 'b', x, y, sx: x, sy: y, moved: false }
  }
  const startLink = (id: string, side: Side, e: { clientX: number; clientY: number; stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation(); e.preventDefault()
    const b = bodies.current[idx(id)]
    if (!b) return
    linking.current = { from: id, side, sx: b.x + SIDE[side][0] * b.r, sy: b.y + SIDE[side][1] * b.r }
    setConnecting(id)
  }
  useEffect(() => {
    const targetAt = (x: number, y: number) => {
      const rw = rewiring.current, from = linking.current?.from ?? (rw ? (rw.end === 'b' ? rw.a : rw.b) : undefined)
      for (const el of document.elementsFromPoint(x, y)) {
        const node = (el as Element).closest?.('[data-cover-node]') as HTMLElement | null
        if (node && node.dataset.coverNode !== from) return { id: node.dataset.coverNode!, el: node }
        const enter = (el as Element).closest?.('[data-testid="cover-enter"]') as HTMLElement | null
        if (enter && !(rw && rw.end === 'a')) return { id: 'enter', el: enter }
        const startEl = (el as Element).closest?.('[data-cover-start]') as HTMLElement | null
        if (startEl && rw && rw.end === 'a') return { id: 'start', el: startEl }
      }
      return null
    }
    const clear = () => document.querySelectorAll('[data-link-target]').forEach((el) => el.removeAttribute('data-link-target'))
    const move = (e: PointerEvent) => {
      const rw = rewiring.current
      if (rw && box.current) {
        const r = box.current.getBoundingClientRect()
        rw.x = e.clientX - r.left; rw.y = e.clientY - r.top
        if (!rw.moved && Math.hypot(rw.x - rw.sx, rw.y - rw.sy) > 6) rw.moved = true
        if (rw.moved) { clear(); targetAt(e.clientX, e.clientY)?.el.setAttribute('data-link-target', '') }
        return
      }
      const L = linking.current
      if (!L || !box.current) return
      const r = box.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, [dx, dy] = SIDE[L.side]
      const reach = Math.min(90, Math.hypot(x - L.sx, y - L.sy) * 0.5)
      linkPreview.current?.setAttribute('d', `M${L.sx.toFixed(1)},${L.sy.toFixed(1)} C${(L.sx + dx * reach).toFixed(1)},${(L.sy + dy * reach).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`)
      if (Math.hypot(x - L.sx, y - L.sy) > 8) L.moved = true
      clear()
      const t = targetAt(e.clientX, e.clientY)
      t?.el.setAttribute('data-link-target', '')
      hintRef.current(t && t.id !== 'enter' ? { id: t.id, loop: closesLoop(edgesRef.current, L.from, t.id), el: t.el } : null)
    }
    const up = (e: PointerEvent) => {
      const rw = rewiring.current
      if (rw) {
        rewiring.current = null
        clear()
        // A click (no drag) selects the wire: its label, details and Remove show beside it.
        if (!rw.moved) { selectWireRef.current(rw.key); return }
        const t = targetAt(e.clientX, e.clientY)
        finishRewireRef.current(rw, t?.id ?? null)
        return
      }
      const L = linking.current
      if (!L) return
      const t = targetAt(e.clientX, e.clientY)
      // A click on a connection point (no drag) keeps the connector following the pointer: click a node to finish.
      if (!L.moved && !L.pending && !t) { L.pending = true; pendingRef.current(L.from); return }
      linking.current = null
      linkPreview.current?.setAttribute('d', '')
      clear(); hintRef.current(null); setConnecting(null); pendingRef.current(null)
      if (t) connectRef.current(L.from, t.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [])

  const keys = (i: number, e: KeyboardEvent) => {
    const id = NODES[i].id, list = chainRef.current, at = list.indexOf(id)
    setFocusNode(id)
    // Connecting by keyboard: C on a node on the string starts; Enter on another node finishes; Escape cancels.
    if (connecting) {
      if (e.key === 'Escape') { e.preventDefault(); cancelConnecting(); return }
      if ((e.key === 'Enter' || e.key === ' ') && id !== connecting) { e.preventDefault(); const from = connecting; cancelConnecting(); wire(from, id); return }
    }
    if (onRef.current.includes(id) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); startConnecting(id); return }
    if (!onRef.current.includes(id)) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const sl = slotFor(id, list); place(id, sl.x, sl.y); insertByPhase(id) } return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); release([id]); takeOff(id) }
    if (at >= 0 && ((e.key === 'ArrowLeft' && at > 0) || (e.key === 'ArrowRight' && at < list.length - 1))) {
      // Move it along the run: the run is rewired in the new order; loops between nodes that stay are kept.
      e.preventDefault()
      const next = [...list], j = e.key === 'ArrowLeft' ? at - 1 : at + 1
      ;[next[at], next[j]] = [next[j], next[at]]
      const a = bodies.current[idx(next[at])], b = bodies.current[idx(next[j])]
      ;[a.tx, b.tx, a.ty, b.ty] = [b.tx, a.tx, b.ty, a.ty]
      commit(onRef.current, [...linear(next), ...edgesRef.current.filter((x) => links.find((l) => l.key === key(x))?.loop)])
    }
  }

  // ---- entering with the workflow, in the string's order
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null)
  const enterWith = (from: HTMLElement) => {
    if (!chain.length || leaving) return
    const nodes = [...chain]
    const vtc = nodes.filter((id) => NODES[idx(id)].projects.includes('vtc')).length, city = nodes.filter((id) => NODES[idx(id)].projects.includes('city')).length
    const project = preset && !edited ? preset.project : vtc >= city ? 'vtc' : 'city'
    const step = designNode(nodes[0])?.step ?? (phaseOfNode(nodes[0]) ?? PHASES[0]).step
    const run = () => { enterToolkit(); void startPreset({ id: preset && !edited ? preset.id : null, type: role === 'custom' ? null : role, name: loop ? `${name} · with a loop` : name, goal: preset?.goal, project, step, nodes }) }
    if (still) { run(); return }
    const q = from.getBoundingClientRect(), r = box.current!.getBoundingClientRect()
    setLeaving({ x: q.left + q.width / 2 - r.left, y: q.top + q.height / 2 - r.top })
    setTimeout(run, 700)
  }

  const roleLabel = ROLES.find((r) => r.id === role)!.label
  const RoleIcon = roleIcon(role)
  /** Secondary destinations: the Site step's model import, and the node builder in Customize. */
  const openImport = () => {
    try { const v = JSON.parse(localStorage.getItem('ts.tools.active') ?? '{}'); localStorage.setItem('ts.tools.active', JSON.stringify({ ...v, 'basic:site': 'rhino-import' })) } catch { /* the Site step still opens */ }
    enterToolkit(); navigate('guided'); goToStep('site')
  }
  /** Browse every node (the library in Customize). */
  const exploreNodes = () => { enterToolkit(); navigate('customize') }
  const openNodeBuilder = () => { enterToolkit(); navigate('customize'); void import('../../lib/communityStore').then((m) => m.useCommunityStore.getState().openDialog('build')) }
  const presetsControl = (
    <div className="relative" data-presets>
      <button type="button" onClick={() => (presetsOpen ? closePresets() : openPresets())} aria-haspopup="listbox" aria-expanded={presetsOpen} data-testid="cover-presets"
        className="flex items-center gap-1.5 rounded-lg bg-panel px-2.5 py-1 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Tags size={15} className="text-accent" aria-hidden />Presets<ChevronDown size={14} aria-hidden />
      </button>
      {presetsOpen && (
        <div className="absolute left-1/2 top-full z-40 mt-1.5 w-[22rem] -translate-x-1/2 rounded-xl border border-line bg-panel p-1.5 shadow-float" data-testid="presets-panel">
          <div role="listbox" aria-label="Preset workflows" onMouseLeave={restore} className="max-h-[16rem] overflow-y-auto">
            {USER_TYPES.map((t) => (
              <div key={t.id} role="group" aria-label={t.name}>
                <div aria-hidden className="px-2 pb-0.5 pt-1.5 text-meta text-muted">{t.name}</div>
                {t.presets.map((p) => {
                  const I = PRESET_ICONS[p.id]
                  return (
                    <button key={p.id} type="button" role="option" aria-selected={presetId === p.id} data-preset={p.id}
                      onMouseEnter={() => previewPreset(p)} onFocus={() => previewPreset(p)} onClick={() => pickPreset(p)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent ${presetId === p.id ? 'bg-selected text-accent-hover' : ''}`}>
                      {I && <I size={16} className="shrink-0 text-accent" aria-hidden />}<span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-meta tabular-nums text-muted">{p.nodes.length}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
  const { start, enter } = ends()
  const tile = ICON.feature + 8

  return (
    <section ref={box} aria-labelledby="intro-title" data-testid="landing-intro" className="landing-atmosphere relative h-full min-h-[38rem] select-none overflow-hidden"
      style={leaving ? { transformOrigin: `${leaving.x}px ${leaving.y}px`, transform: 'scale(6)', opacity: 0, transition: 'transform 800ms cubic-bezier(0.7, 0, 0.84, 0), opacity 420ms ease-in 340ms', pointerEvents: 'none' } : undefined}>

      {/* the workflow card: a stable ivory surface for the editable workflow; the gradient stays visible around it */}
      {(() => { const c = cardBox(); return <div aria-hidden data-testid="cover-card" className="pointer-events-none absolute rounded-2xl border border-white/80 shadow-float" style={{ left: c.L, top: c.T, width: c.R - c.L, height: c.B - c.T, background: 'var(--atmo-surface)' }} /> })()}

      <div style={{ display: 'contents' }} className={narrow() ? 'invisible' : undefined} aria-hidden={narrow() || undefined} data-testid="cover-canvas">
      {/* the five phase lanes along the string: a small marker in the phase colour (the node artwork carries the rest); the
          lane a grabbed node can drop into shows its pale surface */}
      {lanes().map(({ ph, x0, x1, y0, shelfTop, shelfBottom }) => {
        const on = hot === ph.id, c = PHASE_COLOR[ph.id]
        return (
          <div key={ph.id} data-lane={ph.id} data-hot={on ? '1' : undefined} className="pointer-events-none absolute rounded-xl transition-[background-color,box-shadow] duration-200"
            style={{ left: x0 + 4, top: y0 - 46, width: x1 - x0 - 8, height: shelfBottom - y0 + 46, background: on ? c.surface : 'transparent', boxShadow: on ? `inset 0 0 0 1.5px ${c.accent}` : undefined }}>
            {/* the lane's shelf: its unused nodes wait here */}
            <span aria-hidden className="absolute inset-x-1.5 bottom-1.5 rounded-lg" style={{ top: shelfTop - (y0 - 46), background: 'rgb(32 38 48 / 0.035)' }} />
            <span aria-hidden className="absolute left-2.5 top-2 flex items-center gap-1.5 text-meta" style={{ color: c.ink, fontWeight: on ? 600 : 500 }}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.accent }} />{ph.name}
            </span>
          </div>
        )
      })}

      {/* the string */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" data-testid="cover-string">
        {links.map((l) => (
          <g key={l.key}>
            {/* the wire's grab area: drag near an end to rewire or cut it */}
            <path ref={(p) => { ropeHit.current.set(l.key, p) }} fill="none" stroke="transparent" strokeWidth={18} data-wire={l.key}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={(e) => startRewire(l.key, l.a, l.b, e)}
              onPointerEnter={() => setHoverWire(l.key)} onPointerLeave={() => setHoverWire((h) => (h === l.key ? null : h))} />
            <path ref={(p) => { ropeLine.current.set(l.key, p) }}
              fill="none" stroke={tipKey === l.key ? EDGE_ACTIVE : EDGE} strokeOpacity={0.9} strokeWidth={tipKey === l.key ? 2.25 : 1.4} strokeDasharray={l.loop ? '5 4' : undefined} strokeLinecap="round" data-ring={l.ring ? '' : undefined} data-return={l.loop ? '' : undefined} style={{ pointerEvents: 'none' }} />
            {/* No direction arrows on the cover's wires (Ruijie, 7 Nov: "get rid of the arrows in the landing page"): the line
                runs Start → Enter, the travelling dots show the way, and a return connection keeps its dashed line and
                return mark. */}
            {/* a return connection's passive mark: a small return arrow on its route */}
            {l.loop && <g ref={(g) => { retMarks.current.set(l.key, g) }} style={{ pointerEvents: 'none' }} data-return-mark>
              <circle r={7} fill="white" stroke={tipKey === l.key ? EDGE_ACTIVE : EDGE} strokeWidth={1} />
              <path d="M2.6,-1.6 A3,3 0 1 0 2.9,1.3" fill="none" stroke={tipKey === l.key ? EDGE_ACTIVE : EDGE} strokeWidth={1.3} strokeLinecap="round" />
              <path d="M1.2,-3.6 L3.1,-1.4 L0.5,-0.9 Z" fill={tipKey === l.key ? EDGE_ACTIVE : EDGE} />
            </g>}
          </g>
        ))}
        {/* the travelling dots, one per step of the route */}
        {!still && route.map((k, i) => <circle key={`${i}:${k}`} style={{ pointerEvents: 'none' }} ref={(c) => { routeDots.current[i] = c }} r={3} opacity={0} fill={PULSE} data-route-dot={k} />)}
        {/* the connector being drawn from a node's handle */}
        <path ref={linkPreview} d="" fill="none" stroke={EDGE_ACTIVE} strokeWidth={1.5} strokeDasharray="6 6" strokeLinecap="round" />
      </svg>

      {/* each wire's focus point: invisible until focused; Enter selects it, Delete removes it */}
      {links.map((l) => (
        <button key={`m${l.key}`} ref={(d) => { mids.current.set(l.key, d) }} type="button" data-wire-point={l.key}
          aria-label={l.loop ? `Return connection from ${label(l.a)} to ${label(l.b)}` : `Connection from ${label(l.a)} to ${label(l.b)}`}
          onFocus={() => setFocusWire(l.key)} onBlur={() => setFocusWire((f) => (f === l.key ? null : f))}
          onClick={() => setSelectedWire((k) => (k === l.key ? null : l.key))}
          onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeWire(l.key) } }}
          className="absolute left-0 top-0 h-[18px] w-[18px] rounded-full opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent" style={{ transform: 'translate3d(-999px,-999px,0)' }} />
      ))}
      {tipKey && (() => {
        const l = links.find((x) => x.key === tipKey)
        if (!l) return null
        const sel = selectedWire === l.key
        return (
          <div ref={tipEl} role={sel ? 'group' : 'tooltip'} aria-label={sel ? 'Selected connection' : undefined} data-testid="wire-tip"
            className={`absolute left-0 top-0 z-30 flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-2.5 py-1 text-meta text-ink shadow-[0_4px_14px_-4px_rgb(24_40_34/0.35)] ${sel ? '' : 'pointer-events-none'}`}
            style={{ transform: (() => { const m = midAt.current.get(l.key); return m ? `translate3d(${m.x}px, ${m.y - 14}px, 0) translate(-50%, -100%)` : 'translate3d(-999px,-999px,0)' })() }}>
            {l.loop ? <span><span className="font-semibold text-ink"><span aria-hidden>↻ </span>Return to {label(l.b)}</span>{sel && <span className="text-muted"> · from {label(l.a)}</span>}</span>
              : <span>{label(l.a)} <span aria-hidden>→</span> {label(l.b)}</span>}
            {sel && <>
              <button type="button" onClick={() => removeWire(l.key)} data-testid="wire-remove" className="ml-1 flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-meta text-error outline-none hover:bg-error-surface focus-visible:ring-2 focus-visible:ring-accent"><Trash2 size={13} aria-hidden />Remove</button>
              <button type="button" onClick={() => setSelectedWire(null)} aria-label="Close" className="rounded-lg p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button>
            </>}
          </div>
        )
      })()}
      {notice && (
        <div role="status" data-testid="cover-notice" className="absolute left-0 top-0 z-30 flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-2.5 py-1 text-meta text-ink shadow-[0_4px_14px_-4px_rgb(24_40_34/0.35)]"
          style={{ transform: `translate3d(${notice.x}px, ${notice.y - 14}px, 0) translate(-50%, -100%)` }}>
          {notice.text}
          <button type="button" onClick={undoAssistant} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold text-accent outline-none hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent"><Undo2 size={13} aria-hidden />Undo</button>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="rounded-lg p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button>
        </div>
      )}
      {/* while connecting: the hint over the target under the pointer */}
      {linkHint && (
        <div aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 whitespace-nowrap rounded-xl px-2 py-0.5 text-meta font-semibold text-white shadow"
          style={{ transform: `translate3d(${linkHint.x}px, ${linkHint.y - 8}px, 0) translate(-50%, -100%)`, background: UI.ink }}>
          {linkHint.loop ? '↻ Create loop' : 'Connect'}
        </div>
      )}
      {pendingFrom && (() => {
        const b = bodies.current[idx(pendingFrom)]
        if (!b) return null
        return (
          <div data-testid="connect-guide" className="absolute left-0 top-0 z-30 flex items-start gap-2 whitespace-nowrap rounded-xl bg-white px-2.5 py-1 shadow-[0_4px_14px_-4px_rgb(24_40_34/0.35)]"
            style={{ transform: `translate3d(${b.x}px, ${b.y - b.r - 10}px, 0) translate(-50%, -100%)` }}>
            <span><span className="block text-meta font-semibold text-ink">Connect nodes</span><span className="block text-meta text-muted">Choose a node; connect back to create a loop.</span></span>
            <button type="button" onClick={cancelConnecting} aria-label="Cancel connecting" className="rounded-lg p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden /></button>
          </div>
        )
      })()}
      <p role="status" aria-live="polite" className="sr-only">{connecting ? `Connecting from ${label(connecting)}: move to a node and press Enter, or Escape to cancel.` : ''}</p>

      {/* the string's two ends: Start, and Enter (the way into the tool with this workflow) */}
      <div aria-hidden data-cover-start className="absolute flex flex-col items-center gap-1 rounded-xl data-[link-target]:ring-4 data-[link-target]:ring-accent/60" style={{ left: start.x - tile / 2, top: start.y - tile / 2 }}>
        <GlassIcon icon={Play} hue={HUES.green} size={tile} className="gicon-solid" />
        <span className="text-meta text-muted">Start</span>
      </div>
      <button type="button" disabled={!chain.length && !connecting} onClick={(e) => { if (connecting) { const from = connecting; cancelConnecting(); wire(from, 'enter'); return } enterWith(e.currentTarget) }} data-testid="cover-enter" title="Enter the tool with this workflow"
        aria-label={`Enter the tool with ${name}: ${chain.length} nodes${loop ? ', looped' : ''}`}
        className="group absolute flex flex-col items-center gap-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 data-[link-target]:ring-4 data-[link-target]:ring-accent/60" style={{ left: enter.x - tile / 2, top: enter.y - tile / 2 }}>
        {/* the "go here next" hint: the tile pops after you set the workflow up and when each run of dots arrives;
            with reduced motion a steady ring says the same */}
        <span ref={enterTile} className="relative inline-flex" data-enter-ready={chain.length > 0 ? '' : undefined}>
          <span ref={enterRing} aria-hidden className={`pointer-events-none absolute -inset-1 rounded-2xl border-2 border-accent ${still && chain.length > 0 ? 'opacity-60' : 'opacity-0'}`} />
          <GlassIcon icon={ArrowRight} hue={HUES.sky} size={tile} className="gicon-solid group-hover:scale-105" />
        </span>
        <span className="text-meta font-semibold text-accent">Enter</span>
      </button>

      {/* what is on the string, and the loop switch */}
      <div className="absolute flex items-center gap-3 text-control" style={(() => { const c = cardBox(); return { left: c.L + 20, top: c.T + 12 } })()}>
        <span className="text-meta text-muted">Your workflow</span>
        <span className="font-semibold text-ink" data-testid="cover-chain-name">{name}</span>
        <span className="text-meta tabular-nums text-muted">{chain.length} node{chain.length === 1 ? '' : 's'}{onBoard.length > chain.length ? ` · ${onBoard.length - chain.length} not wired in` : ''}</span>
        {presetsControl}
        <Help label="What this workflow shows">This is your workflow: the order you work in, from Start to Enter. Nodes sit in their phase's lane and keep its colour wherever you move them. Drag a node from a lane's shelf onto the line to add it; drag from a node's edge to connect it; connect back to an earlier node to create a loop, a step you repeat (dashed, with a return mark). Select a connection to remove it; Undo brings it back. The data each node reads is wired separately, in Customize.</Help>
        <button type="button" onClick={newWorkflow} data-testid="cover-new" title="Start a new workflow from the default starting preset (Undo brings this one back)"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-control text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><FilePlus size={15} aria-hidden />New</button>
      </div>
      {!chain.length && <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm text-muted" style={{ top: start.y + 40 }}>Drag nodes up from the shelves</p>}

      {/* every built node: on the string (lit) or in the room (soft) */}
      {NODES.map((n, i) => (
        <button key={n.id} ref={(d) => { els.current[i] = d }} type="button" data-cover-node={n.id} data-on={onBoard.includes(n.id) ? '1' : '0'} data-unwired={onBoard.includes(n.id) && !chain.includes(n.id) ? '' : undefined}
          data-proposed={proposed?.added.has(n.id) ? 'add' : proposed?.removed.has(n.id) ? 'remove' : undefined}
          data-valid={connecting && connecting !== n.id && onBoard.includes(n.id) && !edges.some((e) => e.a === connecting && e.b === n.id) ? '' : undefined}
          data-selected={selectedNode === n.id && onBoard.includes(n.id) ? '' : undefined}
          aria-label={onBoard.includes(n.id) ? `${n.name}, on the string${chain.includes(n.id) ? '' : ', not wired in'}: arrows move it along, Delete takes it off` : `Put ${n.name} on the string`}
          onPointerDown={(e) => { e.preventDefault(); if (linking.current?.pending) return; setFocusNode(n.id); setSelectedNode(n.id); setSelectedWire(null); grab(i, e.clientX, e.clientY) }} onKeyDown={(e) => keys(i, e)}
          aria-keyshortcuts={onBoard.includes(n.id) ? 'C' : undefined}
          className="node-hit group absolute left-0 top-0 cursor-grab touch-none rounded-xl outline-none will-change-transform active:cursor-grabbing data-[link-target]:ring-4 data-[link-target]:ring-accent/60 data-[unwired]:outline-2 data-[unwired]:outline-dashed data-[unwired]:outline-offset-4 data-[unwired]:outline-ink/40 data-[proposed=add]:outline-2 data-[proposed=add]:outline-offset-4 data-[proposed=add]:outline-ai data-[proposed=remove]:opacity-50 data-[proposed=remove]:outline-2 data-[proposed=remove]:outline-dashed data-[proposed=remove]:outline-offset-4 data-[proposed=remove]:outline-ai data-[valid]:outline-2 data-[valid]:outline-offset-4 data-[valid]:outline-accent/45"
          onPointerEnter={() => setHoverNode(n.id)} onPointerLeave={() => setHoverNode((h) => (h === n.id ? null : h))} onFocus={() => setHoverNode(n.id)} onBlur={() => setHoverNode((h) => (h === n.id ? null : h))}
          style={{ width: size, height: size, transformOrigin: '50% 50%', transform: 'translate3d(-999px,-999px,0)' }}>
          <NodeTile id={n.id} size={size} state={chain.includes(n.id) ? 'on' : 'soft'} />
          {onBoard.includes(n.id) && <span aria-hidden className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-meta font-medium text-ink/80">{nodeWord(n)}</span>}
          {onBoard.includes(n.id) && (['n', 'e', 's', 'w'] as const).map((side) => (
            <span key={side} aria-hidden data-handle={side} onPointerDown={(e) => startLink(n.id, side, e)}
              className="group/h absolute z-10 hidden h-4 w-4 cursor-crosshair items-center justify-center rounded-full border-2 border-white shadow-md group-hover:flex group-focus-visible:flex group-data-[selected]:flex"
              style={{ background: UI.accent, ...(side === 'n' ? { left: '50%', top: -8, marginLeft: -8 } : side === 's' ? { left: '50%', bottom: -8, marginLeft: -8 } : side === 'e' ? { right: -8, top: '50%', marginTop: -8 } : { left: -8, top: '50%', marginTop: -8 }) }}>
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {/* the connection point's guidance, only while it is hovered */}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-white px-2.5 py-1 text-left shadow-[0_4px_14px_-4px_rgb(24_40_34/0.35)] group-hover/h:block">
                <span className="block text-meta font-semibold text-ink">Connect nodes</span><span className="block text-meta text-muted">Connect back to create a loop.</span>
              </span>
              {/* the hint: a short dashed connector leaving this side */}
              <span className="pointer-events-none absolute hidden border-dashed group-hover/h:block"
                style={{ borderColor: UI.accent, ...(side === 'n' ? { bottom: '100%', left: '50%', height: 22, borderLeftWidth: 2, marginLeft: -1 } : side === 's' ? { top: '100%', left: '50%', height: 22, borderLeftWidth: 2, marginLeft: -1 } : side === 'e' ? { left: '100%', top: '50%', width: 22, borderTopWidth: 2, marginTop: -1 } : { right: '100%', top: '50%', width: 22, borderTopWidth: 2, marginTop: -1 }) }} />
            </span>
          ))}
          {proposed?.added.has(n.id) && <span aria-hidden className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ai text-meta font-semibold text-white shadow">+</span>}
        </button>
      ))}

      {/* a node's full name, while it is hovered or focused (shelf tiles are small) */}
      {hoverNode && (() => {
        const b = bodies.current[idx(hoverNode)]
        if (!b) return null
        return <div aria-hidden className="pointer-events-none absolute left-0 top-0 z-30 whitespace-nowrap rounded-xl bg-ink/85 px-2 py-0.5 text-meta text-white"
          style={{ transform: `translate3d(${b.tx || b.x}px, ${(b.on ? b.ty : b.y) + b.r * (b.on ? 1 : SHELF_S) + (b.on ? 22 : 6)}px, 0) translate(-50%, 0)` }}>{NODES[idx(hoverNode)].name}</div>
      })()}

      </div>

      {/* phones: the workflow as a readable strip, in order, with its phase dots; Enter opens it */}
      {narrow() && (() => {
        const c = cardBox()
        return (
          <div className="absolute flex flex-col gap-2 px-4 py-3" style={{ left: c.L, top: c.T, width: c.R - c.L, height: c.B - c.T }} data-testid="cover-compact">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-control">
              <span className="text-meta text-muted">Your workflow</span>
              <span className="font-semibold text-ink">{name}</span>
              <span className="text-meta tabular-nums text-muted">{chain.length} node{chain.length === 1 ? '' : 's'}</span>
            </div>
            <ol className="flex items-start gap-3 overflow-x-auto pb-1" aria-label="Your workflow, in order">
              {chain.map((id) => {
                const n = NODES[idx(id)]
                return (
                  <li key={id} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                    <NodeTile id={id} size={44} />
                    <span className="flex items-center gap-1 text-meta text-ink"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PHASE_COLOR[n.phase].accent }} />{nodeWord(n)}</span>
                  </li>
                )
              })}
            </ol>
            <div className="mt-auto flex items-center gap-2">
              <span className="text-meta text-muted">Rearrange it on a larger screen, or ask the assistant.</span>
              <button type="button" disabled={!chain.length} onClick={(e) => enterWith(e.currentTarget)} className="ml-auto shrink-0 rounded-lg bg-accent px-3 py-1.5 text-control text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-40">Enter</button>
            </div>
          </div>
        )
      })()}

      {/* the top bar: the name at the left; who it is for, compact and editable, at the right (Ruijie, 7 Nov) */}
      <div aria-hidden className="absolute left-5 top-3.5 z-20 text-control font-semibold text-ink">Tower Design Toolkit</div>
      <div ref={sentenceEl} className="absolute right-5 top-2.5 z-20 text-ink" data-testid="cover-box">
        <p className="flex items-center gap-1 text-meta text-muted"><span className="hidden sm:inline">A tower design by</span>
          <button type="button" data-role-menu onClick={() => (menu ? closeMenu() : openMenu())} aria-haspopup="listbox" aria-expanded={menu} data-testid="cover-role"
            className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-meta text-ink outline-none hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-accent">
            <RoleIcon size={13} className="text-accent" aria-hidden />{roleLabel}<ChevronDown size={12} aria-hidden />
          </button>
        </p>
        {menu && (
          <ul role="listbox" data-role-menu aria-label="A tower design by" onMouseLeave={restore} className="absolute right-0 top-full z-30 mt-1 w-max min-w-[16rem] rounded-xl border border-line bg-panel p-1.5 text-control shadow-float">
            {ROLES.map((r) => {
              const I = roleIcon(r.id)
              return (
                <li key={r.id} role="none">
                  <button type="button" role="option" aria-selected={role === r.id} onClick={() => pick(r.id)} onMouseEnter={() => preview(r.id)} onFocus={() => preview(r.id)} data-role={r.id}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent ${role === r.id ? 'bg-selected font-semibold text-accent-hover' : ''}`}>
                    <I size={16} className="text-accent" aria-hidden />{r.label}
                    {r.id === 'custom' && <span className="ml-auto pl-4 text-meta text-muted">build your own</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* the name, then the task: the workflow assistant under the workflow, then the presets in one compact line */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-4 text-center" style={{ top: cardBox().B + 18 }}>
        <h1 id="intro-title" className="text-display-sm text-ink sm:text-display">Tower Design Toolkit</h1>
        <p className="mt-1 text-body text-muted [@media(max-height:780px)]:hidden">A starting point for your next tower.</p>
        <div ref={assistantEl} className="mt-4 text-left">
          <WorkflowAssistant board={{ nodes: onBoard, edges }} focus={focusNode} previewing={!!proposed} canUndo={canUndo}
            onPreview={previewProposal} onApply={applyProposal} onDiscard={discardProposal} onUndo={undoAssistant} />
        </div>
        <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-center gap-1 text-control" data-testid="cover-quick-presets" role="group" aria-label="Start with a preset">
          <span className="mr-1 text-muted">Start with a preset</span>
          {QUICK.map((q) => (
            <button key={q.id} type="button" aria-pressed={role === q.id} onClick={() => pick(q.id)} data-quick={q.id}
              className={`rounded-lg px-2.5 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent ${role === q.id ? 'bg-ink' : 'hover:bg-white/70'}`}>{q.label}</button>
          ))}
        </div>
        <button type="button" onClick={exploreNodes} className="pointer-events-auto mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-control text-ink outline-none hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-accent">Explore nodes<ArrowRight size={14} aria-hidden /></button>
      </div>

      {/* elsewhere: the research, importing a model, making a node of your own */}
      <nav aria-label="More" className="absolute bottom-3 right-4 z-10 flex items-center gap-1 text-meta text-muted">
        <button type="button" onClick={onEnter} data-testid="intro-enter" className="flex items-center gap-1 rounded-lg px-2 py-1 outline-none hover:bg-white/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><BookOpen size={13} aria-hidden />Research</button>
        <button type="button" onClick={openImport} className="flex items-center gap-1 rounded-lg px-2 py-1 outline-none hover:bg-white/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><FileUp size={13} aria-hidden />Import a model</button>
        <button type="button" onClick={openNodeBuilder} className="flex items-center gap-1 rounded-lg px-2 py-1 outline-none hover:bg-white/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><PackagePlus size={13} aria-hidden />Build a node</button>
      </nav>
    </section>
  )
}
