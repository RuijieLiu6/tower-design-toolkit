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
//     like how Grasshopper connects its nodes"): drag from a node's side handle to another node to wire them (a wire back
//     to an earlier node is a loop; the loop's whole ring is orange); grab a wire near an end and drag to rewire it, or let it go in empty
//     space to cut it. The workflow is what is reached from Start along the wires, in that order; a node on the board but
//     wired to nothing shows a dashed outline and is left out until it is wired in. Loop: one click for last → first;
//   - the box in the middle alternates between the name and "A Tower Design by [role ▾]": a role threads its starting
//     workflow; "you, node by node" leaves an empty string to build on;
//   - Enter (the string's end) goes into the guided app with that workflow, in that order (lib/startPreset.ts);
//     the workflow assistant below the canvas suggests, modifies and explains the workflow (previewed on the canvas,
//     applied or discarded, undoable); its "Other ways in" goes to the agent page. Making a node of one's own waits inside
//     the platform (Customize).
// Keyboard: floating nodes are buttons (Enter threads one); threaded nodes are buttons (← → move it along the string,
// Delete takes it off); the role menu is a listbox. Reduced motion: nothing drifts, sways or alternates; all still works.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, ChevronDown, Play, RefreshCw } from '../icons'
import WorkflowAssistant from './WorkflowAssistant'
import type { Proposal } from '../../lib/agent/workflowAssistant'
import GlassIcon, { HUES, ICON } from '../GlassIcon'
import { NODE_ICONS, STEP_ICONS, TYPE_ICONS } from '../../data/icons'
import { BUILT_NODES } from '../../data/registry'
import { PHASE_HUE, PHASES, phaseOfNode, type PhaseId } from '../../lib/phases'
import { startPreset } from '../../lib/startPreset'
import { enterToolkit } from '../../lib/intro'
import { USER_TYPES, type Preset, type UserTypeId } from '../../lib/userTypes'
import { byPhase, edgeKey, linear, phaseIndex, walk, type Edge } from '../../lib/workflowGraph'

type RoleId = UserTypeId | 'custom'
const ROLES: { id: RoleId; label: string }[] = [
  { id: 'designer', label: 'architecture students' },
  { id: 'practitioner', label: 'practitioner architects' },
  { id: 'planner', label: 'planners and city reviewers' },
  { id: 'engineer', label: 'engineers and consultants' },
  { id: 'custom', label: 'you, node by node' },
]
const roleIcon = (r: RoleId) => (r === 'custom' ? TYPE_ICONS.explore : TYPE_ICONS[r])
const presetOf = (r: RoleId): Preset | null => (r === 'custom' ? null : USER_TYPES.find((t) => t.id === r)?.presets[0] ?? null)
// Each node wears its phase's colour, so it is plain which lane of the string it belongs in.
const NODES = BUILT_NODES.map((n) => { const phase: PhaseId = phaseOfNode(n.id)?.id ?? 'site'; return { id: n.id, name: n.name, icon: NODE_ICONS[n.id], phase, hue: PHASE_HUE[phase], projects: n.projects ?? (['vtc', 'city'] as ('vtc' | 'city')[]) } })
const idx = (id: string) => NODES.findIndex((n) => n.id === id)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => b[i] === x)
const key = edgeKey

interface Body { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; held: boolean; on: boolean }
interface Pt { x: number; y: number; px: number; py: number }
interface Rope { pts: Pt[]; slack: number }
type Zone = { x0: number; y0: number; x1: number; y1: number }
/** A repeatable scatter (no Math.random at render, so the first frame is the same every visit). */
const rand = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s) }
const SEG = 14 // points per rope
/** The loop colour (one for the wire back and the forward wires it closes): orange, the complement of the run's blue (206° + 180°; Ruijie, 7 Nov). */
const LOOP_LINE = 'hsl(26 92% 54%)', LOOP_PULSE = 'hsl(26 96% 56%)'

export default function Intro({ onEnter, reduced = false }: { onEnter: () => void; reduced?: boolean }) {
  const [still] = useState(() => reduced || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const box = useRef<HTMLElement>(null)
  const sentenceEl = useRef<HTMLDivElement>(null)
  const assistantEl = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLButtonElement | null)[]>([])
  const bodies = useRef<Body[]>([])
  const [size] = useState(() => Math.round(ICON.feature * Math.max(0.72, Math.min(1, (typeof window === 'undefined' ? 1200 : window.innerWidth) / 1200))))

  // ---- the workflow: the nodes on the board, the wires between them, and where it came from
  const [role, setRole] = useState<RoleId>('designer')
  const [onBoard, setOnBoard] = useState<string[]>(() => byPhase(presetOf('designer')?.nodes ?? []))
  const [edges, setEdges] = useState<Edge[]>(() => linear(byPhase(presetOf('designer')?.nodes ?? [])))
  const onRef = useRef(onBoard); onRef.current = onBoard
  const edgesRef = useRef(edges); edgesRef.current = edges
  // The run: what Start reaches along the wires, in that order. A wire to an earlier node (or itself) is a loop.
  const chain = useMemo(() => walk(edges), [edges])
  const chainRef = useRef(chain); chainRef.current = chain
  const isLoop = (e: Edge) => { const r = (id: string) => (id === 'start' ? -1 : id === 'enter' ? 1e9 : chain.indexOf(id)); return r(e.a) >= 0 && r(e.b) >= -1 && r(e.b) <= r(e.a) && e.b !== 'enter' }
  const loop = edges.some(isLoop)
  const preset = presetOf(role)
  const edited = !!preset && !(sameList(chain, byPhase(preset.nodes)) && onBoard.length === preset.nodes.length && edges.length === preset.nodes.length + 1)
  const name = preset ? (edited ? `${preset.name} (edited)` : preset.name) : 'Your workflow'

  // ---- the box: the name, then the sentence, in turn, until the visitor picks a role or plays with the string
  const [showName, setShowName] = useState(!still)
  const [touched, setTouched] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (still || touched) { setShowName(false); return }
    const t = setInterval(() => setShowName((v) => !v), 3400)
    return () => clearInterval(t)
  }, [still, touched])

  // ---- layout: the string's band across the top, its two ends, the room below
  const dims = useRef({ W: typeof window === 'undefined' ? 1200 : window.innerWidth, H: typeof window === 'undefined' ? 800 : window.innerHeight })
  const [, relayout] = useState(0)
  const band = () => { const { W, H } = dims.current; return { x0: 0, y0: 0, x1: W, y1: Math.max(220, H * 0.36) } }
  const ends = () => {
    const { W } = dims.current, b = band(), mid = (b.y0 + b.y1) / 2 + 10
    return { start: { x: Math.max(48, W * 0.05), y: mid }, enter: { x: W - Math.max(56, W * 0.055), y: mid } }
  }
  const zones = useRef<Zone[]>([])
  /** The five phase lanes along the string, Start to Enter. */
  const lanes = () => {
    const { start, enter } = ends(), b = band(), x0 = start.x + 44, x1 = enter.x - 44, w = (x1 - x0) / PHASES.length
    return PHASES.map((ph, k) => ({ ph, x0: x0 + k * w, x1: x0 + (k + 1) * w, y0: b.y0 + 96, y1: b.y1 - 6 }))
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
        body.x = lane.x0 + ((j + 1) / (mine.length + 1)) * (lane.x1 - lane.x0)
        body.y = (lane.y0 + lane.y1) / 2 + Math.sin(idx(id) * 1.3) * (lane.y1 - lane.y0) * 0.2
        body.vx = body.vy = 0; body.on = true; body.held = false
      })
    })
  }
  /** Taken off the string: back into the room, falling from where it was. */
  const release = (ids: string[], vx = 0, vy = 80) => ids.forEach((id) => {
    const body = bodies.current[idx(id)]
    if (!body) return
    body.on = false; body.held = false; body.vx = vx + (rand(idx(id), 8) - 0.5) * 40; body.vy = vy
  })

  // ---- editing the board: every change sets the nodes and the wires together
  const commit = (on: string[], es: Edge[]) => {
    const seen = new Set<string>(), clean = es.filter((e) => e.a !== e.b && on.concat('start', 'enter').includes(e.a) && on.concat('start', 'enter').includes(e.b) && !seen.has(key(e)) && seen.add(key(e)))
    // Editing the string by hand while the assistant's proposal is shown keeps the proposal (as if applied), so Undo
    // still goes back to before it.
    if (assistKept.current && !assistCommitting.current) { history.current.push(assistKept.current); assistKept.current = null; setProposed(null); setCanUndo(true) }
    onRef.current = on; edgesRef.current = clean
    setTouched(true); setOnBoard(on); setEdges(clean)
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
      const body = bodies.current[idx(b)], sl = slotFor(b, chainRef.current)
      if (body) { body.x = sl.x; body.y = sl.y; body.vx = body.vy = 0; body.on = true; body.held = false }
      on = [...on, b]
    }
    commit(on, [...edgesRef.current, { a, b }])
  }

  /** Put a role's starting workflow on the string (the nodes not in it fall back into the room). */
  const apply = (r: RoleId) => {
    setRole(r)
    const p = presetOf(r), ids = p ? byPhase(p.nodes) : []
    release(onRef.current.filter((id) => !ids.includes(id)))
    layout(ids)
    commit(ids, linear(ids))
  }
  // ---- the workflow assistant's proposals (Ruijie, 7 Nov): previewed on the canvas, then applied or discarded; applied
  // ones come back with Undo. A snapshot keeps the role, the board and where each node sat.
  type Snap = { role: RoleId; on: string[]; edges: Edge[]; at: Map<string, { x: number; y: number }> }
  const snapshot = (): Snap => ({ role, on: [...onRef.current], edges: [...edgesRef.current], at: new Map(onRef.current.map((id) => { const b = bodies.current[idx(id)]; return [id, { x: b?.x ?? 0, y: b?.y ?? 0 }] })) })
  const restoreSnap = (k: Snap) => {
    release(onRef.current.filter((id) => !k.on.includes(id)))
    k.on.forEach((id) => { const b = bodies.current[idx(id)], p = k.at.get(id); if (b && p) { b.x = p.x; b.y = p.y; b.vx = b.vy = 0; b.on = true; b.held = false } })
    setRole(k.role); assistCommitting.current = true; commit(k.on, k.edges); assistCommitting.current = false
  }
  const assistKept = useRef<Snap | null>(null)
  const assistCommitting = useRef(false)
  const history = useRef<Snap[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [proposed, setProposed] = useState<{ added: Set<string>; removed: Set<string> } | null>(null)
  const [focusNode, setFocusNode] = useState<string | null>(null)
  const previewProposal = (p: Proposal) => {
    if (assistKept.current) restoreSnap(assistKept.current)
    else assistKept.current = snapshot()
    const ids = p.board.nodes, run = walk(p.board.edges)
    release(onRef.current.filter((id) => !ids.includes(id)))
    if (p.capability === 'suggest') { layout(run); setRole('custom') }
    else p.added.forEach((id) => { const b = bodies.current[idx(id)], sl = slotFor(id, run.filter((x) => x !== id)); if (b) { b.x = sl.x; b.y = sl.y; b.vx = b.vy = 0; b.on = true; b.held = false } })
    assistCommitting.current = true; commit(ids, p.board.edges); assistCommitting.current = false
    setProposed({ added: new Set(p.added), removed: new Set(p.removed) })
  }
  const applyProposal = () => { if (assistKept.current) { history.current.push(assistKept.current); setCanUndo(true) } assistKept.current = null; setProposed(null) }
  const discardProposal = () => { const k = assistKept.current; assistKept.current = null; setProposed(null); if (k) restoreSnap(k) }
  const undoAssistant = () => { const k = history.current.pop(); setCanUndo(history.current.length > 0); if (k) restoreSnap(k) }
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
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
  const kept = useRef<{ role: RoleId; on: string[]; edges: Edge[]; at: Map<string, { x: number; y: number }> } | null>(null)
  const openMenu = () => {
    setTouched(true)
    kept.current = { role, on: [...onRef.current], edges: [...edgesRef.current], at: new Map(onRef.current.map((id) => { const b = bodies.current[idx(id)]; return [id, { x: b?.x ?? 0, y: b?.y ?? 0 }] })) }
    setMenu(true)
  }
  const preview = (r: RoleId) => { if (kept.current) apply(r) }
  const restore = () => {
    const k = kept.current
    if (!k) return
    restoreSnap(k)
  }
  const closeMenu = () => { restore(); kept.current = null; setMenu(false) }
  const pick = (r: RoleId) => { setTouched(true); kept.current = null; setMenu(false); apply(r) }
  useEffect(() => {
    if (!menu) return
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    const outside = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.('[data-role-menu]')) closeMenu() }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside, true) }
  }, [menu]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the tiles in step with the board: on it they stay put (lit when wired in), the rest float.
  useEffect(() => {
    const on = new Set(onBoard)
    NODES.forEach((n, i) => { const b = bodies.current[i]; if (b) b.on = on.has(n.id); els.current[i]?.setAttribute('data-on', on.has(n.id) ? '1' : '0') })
  }, [onBoard])

  // ---- the ropes (verlet), keyed by link, and the frame loop that moves everything
  const ropes = useRef(new Map<string, Rope>())
  const ropeLine = useRef(new Map<string, SVGPathElement | null>())
  const pulses = useRef(new Map<string, SVGCircleElement | null>())
  // A loop's ring (Ruijie, 7 Nov: "make the loop strings a different colour from the main string, once they loop the entire
  // loop turn into 1 colour"): the wire back plus every forward wire between its two ends, all in the loop colour.
  const links = useMemo(() => {
    const r = (id: string) => (id === 'start' ? -1 : id === 'enter' ? 1e9 : chain.indexOf(id))
    const loops = edges.filter(isLoop)
    return edges.map((e) => {
      const loop = isLoop(e)
      const ring = loop || (e.b !== 'enter' && loops.some((l) => r(l.b) <= r(e.a) && r(e.b) <= r(l.a)))
      return { key: key(e), a: e.a, b: e.b, loop, ring }
    })
  }, [edges, chain]) // eslint-disable-line react-hooks/exhaustive-deps
  const ropeHit = useRef(new Map<string, SVGPathElement | null>())
  // A wire being rewired: its loose end follows the pointer.
  const rewiring = useRef<{ key: string; a: string; b: string; end: 'a' | 'b'; x: number; y: number } | null>(null)
  const linksRef = useRef(links); linksRef.current = links

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
      const zs = [sentenceEl.current, assistantEl.current].map((x) => x?.getBoundingClientRect()).filter((q): q is DOMRect => !!q)
      zones.current = [band(), ...zs.map((q) => ({ x0: q.left - r.left - 8, y0: q.top - r.top - 8, x1: q.right - r.left + 8, y1: q.bottom - r.top + 8 }))]
    }
    measure()
    const { W, H } = dims.current, bnd = band()
    bodies.current = NODES.map((_, i) => {
      const r = size / 2
      return {
        x: r + rand(i, 2) * (W - 2 * r), y: Math.min(H - r, bnd.y1 + r + 20 + rand(i, 3) * (H - bnd.y1 - 2 * r - 30)),
        vx: (rand(i, 4) - 0.5) * 24, vy: (rand(i, 5) - 0.5) * 24, r, a: (rand(i, 6) - 0.5) * 16, va: (rand(i, 7) - 0.5) * 4, held: false, on: false,
      }
    })
    layout(chainRef.current)

    const draw = () => bodies.current.forEach((b, i) => {
      const d = els.current[i]
      if (d) d.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0) rotate(${(b.on ? 0 : b.a).toFixed(1)}deg)`
    })
    const pushOut = (b: Body, z: Zone, dt: number) => {
      const x0 = z.x0 - b.r, x1 = z.x1 + b.r, y0 = z.y0 - b.r, y1 = z.y1 + b.r
      if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) return
      const d = [b.x - x0, x1 - b.x, b.y - y0, y1 - b.y], m = Math.min(...d), k = 280 * dt
      if (m === d[0]) b.vx -= k; else if (m === d[1]) b.vx += k; else if (m === d[2]) b.vy -= k; else b.vy += k
    }
    const ropeStep = (dt: number, t: number) => {
      const seen = new Set<string>()
      for (const l of linksRef.current) {
        seen.add(l.key)
        const rw = rewiring.current?.key === l.key ? rewiring.current : null
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
        // a pulse running along it (the workflow running); slow, thin and without a white rim (Ruijie, 7 Nov)
        const c = pulses.current.get(l.key)
        if (c) {
          // Every pulse runs the way its wire points (a loop: from its later node back to its earlier one), so around a loop
          // the pulses go counterclockwise.
          const f = still ? 0.5 : ((t / 4200 + linksRef.current.indexOf(l) * 0.22) % 1), at = f * SEG, k = Math.min(SEG - 1, Math.floor(at)), u = at - k
          const x = p[k].x + (p[k + 1].x - p[k].x) * u
          const y = p[k].y + (p[k + 1].y - p[k].y) * u
          c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1))
        }
      }
      for (const key of [...ropes.current.keys()]) if (!seen.has(key)) ropes.current.delete(key)
    }

    let raf = 0, last = performance.now(), on = true
    const step = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000); last = t
      const { W: w, H: h } = dims.current, bs = bodies.current
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]
        if (b.held) continue
        if (b.on) { b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.8; b.vy *= 0.8; continue } // threaded: stays where it was put
        b.vx += Math.sin(t * 0.00041 + i * 1.7) * 5 * dt
        b.vy += Math.cos(t * 0.00037 + i * 2.3) * 5 * dt
        const bz = zones.current[0]
        if (bz && b.y < bz.y1 + b.r) b.vy += 320 * dt // the string's band: always down into the room
        for (const z of zones.current.slice(1)) pushOut(b, z, dt)
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > 20) { const k = Math.max(0, 1 - 1.4 * dt); b.vx *= k; b.vy *= k }
        b.va *= sp > 20 ? Math.max(0, 1 - 1.2 * dt) : 1
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.85 } else if (b.x > w - b.r) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.85 }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.85 } else if (b.y > h - b.r) { b.y = h - b.r; b.vy = -Math.abs(b.vy) * 0.85 }
      }
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 0.95
        if (d >= min) continue
        const push = (min - d) * 0.5, nx = dx / d, ny = dy / d
        if (!a.held) { a.x -= nx * push; a.y -= ny * push; if (!a.on) { a.vx -= nx * push * 2; a.vy -= ny * push * 2 } }
        if (!b.held) { b.x += nx * push; b.y += ny * push; if (!b.on) { b.vx += nx * push * 2; b.vy += ny * push * 2 } }
      }
      ropeStep(dt, t)
      draw()
      if (on) raf = requestAnimationFrame(step)
    }
    const frame = () => { ropeStep(1 / 60, performance.now()); draw() }
    const start = () => { if (raf) return; if (still) { frame(); return } on = true; last = performance.now(); raf = requestAnimationFrame(step) }
    const stop = () => { on = false; cancelAnimationFrame(raf); raf = 0 }
    const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.05 })
    seen.observe(el)
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
      const b = bodies.current[g.i], id = NODES[g.i].id, bnd = band()
      b.held = false
      const fling = Math.hypot(b.vx, b.vy) > 1300
      if (b.on) {
        // On the board: flicked or dragged below the string, it comes off; dropped on another wire, it moves onto it.
        if (fling || b.y > bnd.y1 + 30) { release([id], b.vx * 0.5, b.vy * 0.5); takeOff(id); return }
        const near = nearestLink(b.x, b.y, id)
        if (g.moved && near && near.d < 40) {
          takeOff(id)
          insertOn(id, near.a, near.b)
        }
        b.vx = b.vy = 0; b.on = true
        if (still) frame()
        return
      }
      // Floating: a click threads it in phase order; dropped on the string, it is threaded onto the nearest wire.
      if (!g.moved) {
        const sl = slotFor(id, chainRef.current)
        b.x = sl.x; b.y = sl.y; b.vx = b.vy = 0; b.on = true
        insertByPhase(id)
        return
      }
      if (b.y < bnd.y1 + 20) {
        const near = nearestLink(b.x, b.y)
        b.on = true; b.vx = b.vy = 0
        if (near && near.d < 90) insertOn(id, near.a, near.b); else insertByPhase(id)
        return
      }
      const sp = Math.hypot(b.vx, b.vy), max = 1600
      if (sp > max) { b.vx *= max / sp; b.vy *= max / sp }
      b.va = b.vx * 0.03
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { stop(); seen.disconnect(); ro.disconnect(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [size, still]) // eslint-disable-line react-hooks/exhaustive-deps

  const grab = (i: number, cx: number, cy: number) => {
    const el = box.current!, b = bodies.current[i], r = el.getBoundingClientRect()
    if (!b) return
    setTouched(true)
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
  const linking = useRef<{ from: string; side: Side; sx: number; sy: number } | null>(null)
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
    setTouched(true)
    rewiring.current = { key: k, a, b, end: Math.hypot(x - A.x, y - A.y) < Math.hypot(x - B.x, y - B.y) ? 'a' : 'b', x, y }
  }
  const startLink = (id: string, side: Side, e: { clientX: number; clientY: number; stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation(); e.preventDefault()
    const b = bodies.current[idx(id)]
    if (!b) return
    setTouched(true)
    linking.current = { from: id, side, sx: b.x + SIDE[side][0] * b.r, sy: b.y + SIDE[side][1] * b.r }
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
        clear(); targetAt(e.clientX, e.clientY)?.el.setAttribute('data-link-target', '')
        return
      }
      const L = linking.current
      if (!L || !box.current) return
      const r = box.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, [dx, dy] = SIDE[L.side]
      const reach = Math.min(90, Math.hypot(x - L.sx, y - L.sy) * 0.5)
      linkPreview.current?.setAttribute('d', `M${L.sx.toFixed(1)},${L.sy.toFixed(1)} C${(L.sx + dx * reach).toFixed(1)},${(L.sy + dy * reach).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`)
      clear()
      targetAt(e.clientX, e.clientY)?.el.setAttribute('data-link-target', '')
    }
    const up = (e: PointerEvent) => {
      const rw = rewiring.current
      if (rw) {
        const t = targetAt(e.clientX, e.clientY)
        rewiring.current = null
        clear()
        finishRewireRef.current(rw, t?.id ?? null)
        return
      }
      const L = linking.current
      if (!L) return
      linking.current = null
      linkPreview.current?.setAttribute('d', '')
      clear()
      const t = targetAt(e.clientX, e.clientY)
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
    if (!onRef.current.includes(id)) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const sl = slotFor(id, list), b = bodies.current[i]; b.x = sl.x; b.y = sl.y; b.on = true; insertByPhase(id) } return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); release([id]); takeOff(id) }
    if (at >= 0 && ((e.key === 'ArrowLeft' && at > 0) || (e.key === 'ArrowRight' && at < list.length - 1))) {
      // Move it along the run: the run is rewired in the new order; loops between nodes that stay are kept.
      e.preventDefault()
      const next = [...list], j = e.key === 'ArrowLeft' ? at - 1 : at + 1
      ;[next[at], next[j]] = [next[j], next[at]]
      const a = bodies.current[idx(next[at])], b = bodies.current[idx(next[j])]
      ;[a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y]
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
    const step = (phaseOfNode(nodes[0]) ?? PHASES[0]).step
    const run = () => { enterToolkit(); void startPreset({ id: preset && !edited ? preset.id : null, type: role === 'custom' ? null : role, name: loop ? `${name} · with a loop` : name, goal: preset?.goal, project, step, nodes }) }
    if (still) { run(); return }
    const q = from.getBoundingClientRect(), r = box.current!.getBoundingClientRect()
    setLeaving({ x: q.left + q.width / 2 - r.left, y: q.top + q.height / 2 - r.top })
    setTimeout(run, 700)
  }

  const roleLabel = ROLES.find((r) => r.id === role)!.label
  const RoleIcon = roleIcon(role)
  const type = 'text-display-sm md:text-display'
  const { start, enter } = ends()
  const tile = ICON.feature + 8

  return (
    <section ref={box} aria-labelledby="intro-title" data-testid="landing-intro" className="relative h-full min-h-[38rem] select-none overflow-hidden"
      style={leaving ? { transformOrigin: `${leaving.x}px ${leaving.y}px`, transform: 'scale(6)', opacity: 0, transition: 'transform 800ms cubic-bezier(0.7, 0, 0.84, 0), opacity 420ms ease-in 340ms', pointerEvents: 'none' } : undefined}>
      <h1 id="intro-title" className="sr-only">Tower Design Toolkit</h1>

      {/* the five phase lanes along the string, in their colours; the grabbed node's lane lights up */}
      {lanes().map(({ ph, x0, x1, y0, y1 }) => {
        const Step = STEP_ICONS[ph.step], on = hot === ph.id, h = PHASE_HUE[ph.id]
        // A loop inside this phase (Ruijie, 7 Nov: "the loops could happen in any phases of the design process"): its last
        // node in the run back to its first. Any other loop is drawn by hand, from a node's handle to an earlier node.
        const mine = chain.filter((id) => NODES[idx(id)].phase === ph.id), first = mine[0], last = mine[mine.length - 1]
        const looped = mine.length > 1 && edges.some((e) => e.a === last && e.b === first)
        return (
          <div key={ph.id} data-lane={ph.id} data-hot={on ? '1' : undefined} className="pointer-events-none absolute rounded-xl transition-[background-color,box-shadow] duration-200"
            style={{ left: x0 + 4, top: y0 - 46, width: x1 - x0 - 8, height: y1 - y0 + 46, background: `hsl(${h} 85% ${on ? 78 : 88}% / ${on ? 0.42 : 0.16})`, boxShadow: on ? `0 0 0 2px hsl(${h} 80% 62% / 0.65), 0 0 36px hsl(${h} 90% 65% / 0.55)` : undefined }}>
            <span aria-hidden className="absolute left-2.5 top-2 flex items-center gap-1.5 text-meta" style={{ color: `hsl(${h} 55% 32%)`, fontWeight: on ? 600 : 500 }}>
              <Step size={15} />{ph.name}
            </span>
            <button type="button" disabled={mine.length < 2} aria-pressed={looped} data-lane-loop={ph.id}
              onClick={() => (looped ? commit(onRef.current, edgesRef.current.filter((e) => !(e.a === last && e.b === first))) : wire(last, first))}
              title={mine.length < 2 ? `Two ${ph.name} nodes are needed for a loop here` : looped ? `Remove the ${ph.name} loop` : `Loop the ${ph.name} phase: its last node checks back to its first`}
              aria-label={looped ? `Remove the ${ph.name} loop` : `Loop the ${ph.name} phase`}
              className="pointer-events-auto absolute right-2 top-1.5 flex h-7 w-7 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
              style={{ color: `hsl(${h} 60% 35%)`, background: looped ? `hsl(${h} 85% 80% / 0.8)` : 'transparent' }}>
              <RefreshCw size={15} aria-hidden />
            </button>
          </div>
        )
      })}

      {/* the string */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" data-testid="cover-string">
        {links.map((l) => (
          <g key={l.key}>
            {/* the wire's grab area: drag near an end to rewire or cut it */}
            <path ref={(p) => { ropeHit.current.set(l.key, p) }} fill="none" stroke="transparent" strokeWidth={18} data-wire={l.key}
              style={{ pointerEvents: 'stroke', cursor: 'grab' }} onPointerDown={(e) => startRewire(l.key, l.a, l.b, e)} />
            <path ref={(p) => { ropeLine.current.set(l.key, p) }}
              fill="none" stroke={l.ring ? LOOP_LINE : 'hsl(206 75% 52%)'} strokeOpacity={0.85} strokeWidth={1.25} strokeLinecap="round" data-ring={l.ring ? '' : undefined} style={{ pointerEvents: 'none' }} />
            {chain.length > 0 && <circle style={{ pointerEvents: 'none' }} ref={(c) => { pulses.current.set(l.key, c) }} r={2.6} fill={l.ring ? LOOP_PULSE : 'hsl(206 90% 58%)'} />}
          </g>
        ))}
        {/* the connector being drawn from a node's handle */}
        <path ref={linkPreview} d="" fill="none" stroke="hsl(206 85% 52%)" strokeWidth={1.5} strokeDasharray="6 6" strokeLinecap="round" />
      </svg>

      {/* the string's two ends: Start, and Enter (the way into the tool with this workflow) */}
      <div aria-hidden data-cover-start className="absolute flex flex-col items-center gap-1 rounded-xl data-[link-target]:ring-4 data-[link-target]:ring-accent/60" style={{ left: start.x - tile / 2, top: start.y - tile / 2 }}>
        <GlassIcon icon={Play} hue={HUES.green} size={tile} className="gicon-solid" />
        <span className="text-meta text-muted">Start</span>
      </div>
      <button type="button" disabled={!chain.length} onClick={(e) => enterWith(e.currentTarget)} data-testid="cover-enter" title="Enter the tool with this workflow"
        aria-label={`Enter the tool with ${name}: ${chain.length} nodes${loop ? ', looped' : ''}`}
        className="group absolute flex flex-col items-center gap-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 data-[link-target]:ring-4 data-[link-target]:ring-accent/60" style={{ left: enter.x - tile / 2, top: enter.y - tile / 2 }}>
        <GlassIcon icon={ArrowRight} hue={HUES.sky} size={tile} className="gicon-solid group-hover:scale-105" />
        <span className="text-meta font-semibold text-accent">Enter</span>
      </button>

      {/* what is on the string, and the loop switch */}
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 text-control">
        <span className="font-semibold text-ink" data-testid="cover-chain-name">{name}</span>
        <span className="text-meta tabular-nums text-muted">{chain.length} node{chain.length === 1 ? '' : 's'}{onBoard.length > chain.length ? ` · ${onBoard.length - chain.length} not wired in` : ''}</span>
        <button type="button" role="switch" aria-checked={loop} disabled={chain.length < 2}
          onClick={() => { const last = chain[chain.length - 1], first = chain[0]; if (loop) commit(onRef.current, edgesRef.current.filter((e) => !isLoop(e))); else wire(last, first) }} data-testid="cover-loop"
          title={loop ? 'Remove the loops: a straight run to Enter' : 'Add a loop: the last node checks back to the first'}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${loop ? 'bg-ink text-white' : 'bg-panel text-ink'}`}>
          <RefreshCw size={14} aria-hidden />Loop
        </button>
      </div>
      {!chain.length && <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm text-muted" style={{ top: start.y + 40 }}>Drag nodes onto the string</p>}

      {/* every built node: on the string (lit) or in the room (soft) */}
      {NODES.map((n, i) => (
        <button key={n.id} ref={(d) => { els.current[i] = d }} type="button" data-cover-node={n.id} data-on={onBoard.includes(n.id) ? '1' : '0'} data-unwired={onBoard.includes(n.id) && !chain.includes(n.id) ? '' : undefined}
          data-proposed={proposed?.added.has(n.id) ? 'add' : proposed?.removed.has(n.id) ? 'remove' : undefined}
          aria-label={onBoard.includes(n.id) ? `${n.name}, on the string${chain.includes(n.id) ? '' : ', not wired in'}: arrows move it along, Delete takes it off` : `Put ${n.name} on the string`}
          onPointerDown={(e) => { e.preventDefault(); setFocusNode(n.id); grab(i, e.clientX, e.clientY) }} onKeyDown={(e) => keys(i, e)}
          className="group absolute left-0 top-0 cursor-grab touch-none rounded-xl outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing data-[link-target]:ring-4 data-[link-target]:ring-accent/60 data-[unwired]:outline-2 data-[unwired]:outline-dashed data-[unwired]:outline-offset-4 data-[unwired]:outline-ink/40 data-[proposed=add]:outline-2 data-[proposed=add]:outline-offset-4 data-[proposed=add]:outline-[#2e8b57] data-[proposed=remove]:opacity-60 data-[proposed=remove]:outline-2 data-[proposed=remove]:outline-dashed data-[proposed=remove]:outline-offset-4 data-[proposed=remove]:outline-[#d0453a]"
          style={{ width: size, height: size, transform: 'translate3d(-999px,-999px,0)' }}>
          <GlassIcon icon={n.icon} hue={n.hue} size={size} level={chain.includes(n.id) ? 'on' : 'soft'} />
          {onBoard.includes(n.id) && (['n', 'e', 's', 'w'] as const).map((side) => (
            <span key={side} aria-hidden data-handle={side} onPointerDown={(e) => startLink(n.id, side, e)} title="Drag to connect"
              className="group/h absolute z-10 hidden h-4 w-4 cursor-crosshair items-center justify-center rounded-full border-2 border-white shadow-md group-hover:flex"
              style={{ background: `hsl(${n.hue} 85% 55%)`, ...(side === 'n' ? { left: '50%', top: -8, marginLeft: -8 } : side === 's' ? { left: '50%', bottom: -8, marginLeft: -8 } : side === 'e' ? { right: -8, top: '50%', marginTop: -8 } : { left: -8, top: '50%', marginTop: -8 }) }}>
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {/* the hint: a short dashed connector leaving this side */}
              <span className="pointer-events-none absolute hidden border-dashed group-hover/h:block"
                style={{ borderColor: `hsl(${n.hue} 80% 50%)`, ...(side === 'n' ? { bottom: '100%', left: '50%', height: 22, borderLeftWidth: 2, marginLeft: -1 } : side === 's' ? { top: '100%', left: '50%', height: 22, borderLeftWidth: 2, marginLeft: -1 } : side === 'e' ? { left: '100%', top: '50%', width: 22, borderTopWidth: 2, marginTop: -1 } : { right: '100%', top: '50%', width: 22, borderTopWidth: 2, marginTop: -1 }) }} />
            </span>
          ))}
          {proposed?.added.has(n.id) && <span aria-hidden className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#2e8b57] text-meta font-semibold text-white shadow">+</span>}
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-full z-10 mt-2.5 -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink/85 px-2 py-0.5 text-node text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{n.name}</span>
        </button>
      ))}

      {/* the box: the name, and the sentence with its role */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-4" style={{ top: band().y1 + 20 }}>
        <div ref={sentenceEl} className="glass glass-tile pointer-events-auto relative z-20 rounded-xl bg-glass-1 px-7 py-4 text-ink" data-testid="cover-box">
          <div className="relative overflow-hidden">
            <p aria-hidden={!showName} className={`${type} whitespace-nowrap transition-all duration-500 ${showName ? 'translate-y-0 opacity-100' : 'pointer-events-none absolute inset-x-0 top-0 -translate-y-full opacity-0'}`}>Tower Design Toolkit</p>
            <p aria-hidden={showName} className={`${type} flex flex-wrap items-baseline justify-center gap-x-3 whitespace-nowrap transition-all duration-500 ${showName ? 'pointer-events-none absolute inset-x-0 top-0 translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
              <span>A Tower Design by</span>
              <button type="button" data-role-menu onClick={() => (menu ? closeMenu() : openMenu())} aria-haspopup="listbox" aria-expanded={menu} data-testid="cover-role" tabIndex={showName ? -1 : 0}
                className="inline-flex items-center gap-1.5 rounded-xl px-1.5 outline-none hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-accent">
                <RoleIcon size={28} className="text-accent" aria-hidden />{roleLabel}<ChevronDown size={24} aria-hidden />
              </button>
            </p>
          </div>
          {menu && (
            <ul role="listbox" data-role-menu aria-label="A tower design by" onMouseLeave={restore} className="glass absolute left-1/2 top-full z-30 mt-2 w-max min-w-[18rem] -translate-x-1/2 rounded-xl bg-glass-1 p-1.5 text-control">
              {ROLES.map((r) => {
                const I = roleIcon(r.id)
                return (
                  <li key={r.id} role="none">
                    <button type="button" role="option" aria-selected={role === r.id} onClick={() => pick(r.id)} onMouseEnter={() => preview(r.id)} onFocus={() => preview(r.id)} data-role={r.id}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-accent ${role === r.id ? 'font-semibold' : ''}`}>
                      <I size={18} className="text-accent" aria-hidden />{r.label}
                      {r.id === 'custom' && <span className="ml-auto pl-4 text-meta text-muted">build your own</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div ref={assistantEl} className="mt-4">
          <WorkflowAssistant board={{ nodes: onBoard, edges }} focus={focusNode} previewing={!!proposed} canUndo={canUndo}
            onPreview={previewProposal} onApply={applyProposal} onDiscard={discardProposal} onUndo={undoAssistant}
            onOpenWorkspace={enterWith} canOpen={chain.length > 0} onOtherWays={onEnter} />
        </div>
      </div>
    </section>
  )
}
