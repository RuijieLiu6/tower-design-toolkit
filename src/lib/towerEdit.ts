// Direct manipulation of a tower in the 3D view: pick it as one object, then move it in plan or turn it about its
// vertical axis with the gizmo (components/TowerGizmo.tsx), "Place on map" (P), the keyboard or typed values
// (components/TowerToolbar.tsx). Gizmo moves and placements are proposals first (Vista v10.1 "confirm before placing"):
// a ghost shows the new footprint with its site fit and view-cone overlap (lib/proposalCheck.ts), and only Confirm
// writes the store, as one undo step. Cancel leaves the tower where it was. The maths here is pure; the edit state is
// a small store of its own, so the app store only ever receives tower fields through updateTower.
import { create } from 'zustand'
import { towerMasses } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useStore } from '../store'
import { snapAngle, snapFootprint, type Pt, type SnapKind } from './edgeSnap'
import { MERGE_MS, breakStep } from './project/history'
import { loadCityParcels, snapTargets } from './siteGeometry'
import { unitText } from './units'

/** Plan position (model frame, metres) and rotation (degrees, counter-clockwise as in rectCorners). */
export interface Pose { x: number; y: number; rotation: number }
/** Which handle is dragged: an arrow (x or y), the plane handle (both) or the turn arc. */
export type DragKind = 'x' | 'y' | 'xy' | 'rotate'

/** Snap steps offered in the toolbar (a working convenience, not a rule): grid in metres, angle in degrees. */
export const MOVE_STEPS = [1, 5] as const
export const ROTATE_STEPS = [5, 15] as const
/** Shift + arrow / bracket keys move by this much, off the grid. */
export const FINE_MOVE = 0.1
export const FINE_TURN = 1
/** Site and parcel edges catch the footprint within this distance on screen (px), converted to metres at the tower. */
export const SNAP_PX = 12
/** A turn snaps parallel to a site or parcel edge within this angle (deg). */
export const EDGE_TURN_DEG = 3

/** Rounds away float noise and turns -0 into 0, so typed and snapped values read cleanly. */
const tidy = (v: number) => { const r = Math.round(v * 1e6) / 1e6; return r === 0 ? 0 : r }

/** Nearest multiple of `step`: the grid is absolute in the model frame (0 is a grid line). */
export function snapTo(v: number, step: number): number {
  return step > 0 ? tidy(Math.round(v / step) * step) : tidy(v)
}

/** Angle in (-180, 180]. */
export function normalizeDeg(d: number): number {
  let a = ((d % 360) + 360) % 360
  if (a > 180) a -= 360
  return tidy(a)
}

/** Live pose for a plan move. An arrow keeps the other coordinate; the plane handle moves both. `step` null = free. */
export function snapMove(start: Pose, raw: { x: number; y: number }, kind: 'x' | 'y' | 'xy', step: number | null): Pose {
  const s = (v: number) => (step ? snapTo(v, step) : tidy(v))
  return { x: kind === 'y' ? start.x : s(raw.x), y: kind === 'x' ? start.y : s(raw.y), rotation: start.rotation }
}

/** Live pose for a turn about the tower's own vertical axis by `deltaDeg` (counter-clockwise). `step` null = free. */
export function snapRotate(start: Pose, deltaDeg: number, step: number | null): Pose {
  const a = start.rotation + deltaDeg
  return { x: start.x, y: start.y, rotation: normalizeDeg(step ? snapTo(a, step) : a) }
}

/** Signed plan angle (degrees, counter-clockwise) swept from p0 to p1 around c: how far the turn arc has been dragged. */
export function turnDeg(c: [number, number], p0: [number, number], p1: [number, number]): number {
  const ax = p0[0] - c[0], ay = p0[1] - c[1], bx = p1[0] - c[0], by = p1[1] - c[1]
  return (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI
}

export const samePose = (a: Pose, b: Pose) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.rotation - b.rotation) < 1e-9
export const poseOf = (t: Pick<Tower, 'x' | 'y' | 'rotation'>): Pose => ({ x: t.x, y: t.y, rotation: t.rotation })

// ---------- snapping to the grid, the site and parcels ----------

/** What a move or turn snapped to: shown in the toolbar, and its lines are highlighted in the 3D view. */
export interface SnapHit { kind: SnapKind | 'grid'; how: 'corner' | 'edge' | 'parallel' | 'step'; segments: [Pt, Pt][] }

export interface SnapOptions { project: 'vtc' | 'city'; snap: boolean; free: boolean; step: number; tol: number }

/** Outlines that snap: every stacked block of a parametric tower, the hull of an imported one. */
function outlines(t: Tower, p: Pose): Pt[][] {
  return towerMasses({ ...t, ...p }).map((m) => m.ring as Pt[])
}
const reachOf = (rings: Pt[][], p: Pose) => Math.max(0, ...rings.flat().map(([x, y]) => Math.hypot(x - p.x, y - p.y)))

/**
 * A plan move with every snap applied: site and parcel edges first (within `tol` metres), else the grid. Free when
 * Shift is held or snapping is off. An arrow keeps the other coordinate.
 */
export function moveSnapped(t: Tower, start: Pose, raw: { x: number; y: number }, kind: 'x' | 'y' | 'xy', o: SnapOptions): { pose: Pose; hit: SnapHit | null } {
  const free = snapMove(start, raw, kind, null)
  if (o.free || !o.snap) return { pose: free, hit: null }
  const rings = outlines(t, free)
  const e = snapFootprint(rings, snapTargets(o.project, free.x, free.y, reachOf(rings, free) + o.tol), o.tol, kind === 'x' ? [1, 0] : kind === 'y' ? [0, 1] : undefined)
  if (e) return { pose: { ...free, x: tidy(free.x + e.dx), y: tidy(free.y + e.dy) }, hit: { kind: e.kind, how: e.how, segments: e.segments } }
  return { pose: snapMove(start, raw, kind, o.step), hit: { kind: 'grid', how: 'step', segments: [] } }
}

/** A turn with every snap applied: parallel to a nearby site or parcel edge first, else the angle step. */
export function turnSnapped(t: Tower, start: Pose, deltaDeg: number, o: Omit<SnapOptions, 'tol'>): { pose: Pose; hit: SnapHit | null } {
  if (o.free || !o.snap) return { pose: snapRotate(start, deltaDeg, null), hit: null }
  const raw = start.rotation + deltaDeg
  const rings = outlines(t, { ...start, rotation: raw })
  // Edges up to 30 m beyond the tower count as nearby: the street or lot line a turn would line up with.
  const a = snapAngle(raw, snapTargets(o.project, start.x, start.y, reachOf(rings, start) + 30), EDGE_TURN_DEG)
  if (a) return { pose: { ...start, rotation: normalizeDeg(a.rotation) }, hit: { kind: a.kind, how: 'parallel', segments: [a.segment] } }
  return { pose: snapRotate(start, deltaDeg, o.step), hit: { kind: 'grid', how: 'step', segments: [] } }
}

const hitKey = (h: SnapHit | null) => (h ? `${h.kind}:${h.how}:${h.segments.flat(2).map((v) => v.toFixed(3)).join(',')}` : '')

// ---------- edit state ----------

interface Drag {
  id: string
  kind: DragKind
  /** Pose the drag started from: the tower, or the pending proposal being adjusted. */
  from: Pose
  live: Pose
  hit: SnapHit | null
}

/** A new position waiting for Confirm or Cancel. The store still holds the tower at `start`. */
export interface Proposal {
  id: string
  start: Pose
  pose: Pose
  via: 'gizmo' | 'place'
  hit: SnapHit | null
}

interface EditState {
  /** Tower picked in the 3D view as one object (null = none). Picking also makes it the selected tower. */
  picked: string | null
  move: boolean
  rotate: boolean
  snap: boolean
  moveStep: number
  rotateStep: number
  drag: Drag | null
  proposal: Proposal | null
}

export const useTowerEdit = create<EditState>(() => ({ picked: null, move: false, rotate: false, snap: true, moveStep: MOVE_STEPS[0], rotateStep: ROTATE_STEPS[1], drag: null, proposal: null }))

const app = () => useStore.getState()
const towerOf = (id: string) => app().towers[app().project].find((t) => t.id === id)
/** Screen-reader announcement, with lengths in the viewer's unit. */
const say = (announce: string) => app().set({ announce: unitText(announce) })
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const num = (v: number) => String(Math.round(v * 100) / 100)
const where = (p: Pose) => `x ${num(p.x)} m, y ${num(p.y)} m, ${num(p.rotation)}°`

// Pointer state the 3D view keeps current: Shift (free movement) and metres per screen pixel at the tower.
let shiftHeld = false
let metresPerPx = 1
export const setShiftHeld = (on: boolean) => { shiftHeld = on }
export const isShiftHeld = () => shiftHeld
export const setMetresPerPx = (m: number) => { if (Number.isFinite(m) && m > 0) metresPerPx = m }
export const snapTolerance = () => SNAP_PX * metresPerPx
export const snapOptions = (): SnapOptions => {
  const s = useTowerEdit.getState()
  return { project: app().project, snap: s.snap, free: shiftHeld, step: s.moveStep, tol: snapTolerance() }
}

/** Present locks the model: nothing here edits it there. */
export const locked = () => app().phase === 'present'
const LOCKED = 'The model is locked in Present. Move and rotate in Massing or Schematic.'

export function pickTower(id: string) {
  const t = towerOf(id)
  if (!t) return
  const s = useTowerEdit.getState()
  if (s.proposal && s.proposal.id !== id) cancelProposal()
  if (app().selectedTower !== id) app().selectTower(id)
  if (s.picked === id) return
  useTowerEdit.setState({ picked: id })
  say(`${t.name} selected, ${Math.round(t.height)} m${locked() ? `. ${LOCKED}` : ''}`)
}

export function clearPick() {
  const s = useTowerEdit.getState()
  if (s.drag) cancelDrag()
  if (s.proposal) cancelProposal()
  if (s.picked) useTowerEdit.setState({ picked: null })
}

export function toggleMode(mode: 'move' | 'rotate') {
  if (locked()) { say(LOCKED); return }
  const on = !useTowerEdit.getState()[mode]
  useTowerEdit.setState({ [mode]: on })
  if (on && app().project === 'city') void loadCityParcels()
  say(`${mode === 'move' ? 'Move' : 'Rotate'} ${on ? 'on' : 'off'}`)
}

/** Start a drag, from the tower or from its pending proposal. Refused in Present or when the tower is gone. */
export function beginDrag(id: string, kind: DragKind): boolean {
  if (locked()) { say(LOCKED); return false }
  const t = towerOf(id)
  if (!t) return false
  const p = useTowerEdit.getState().proposal
  if (p && p.id !== id) cancelProposal()
  const from = p?.id === id ? p.pose : poseOf(t)
  useTowerEdit.setState({ drag: { id, kind, from, live: from, hit: null } })
  return true
}

/** Follow the pointer: the ghost and the toolbar read `live`; nothing reaches the store before Confirm. */
export function dragTo(live: Pose, hit: SnapHit | null = null) {
  const d = useTowerEdit.getState().drag
  if (!d) return
  const sameHit = hitKey(hit) === hitKey(d.hit)
  if (samePose(d.live, live) && sameHit) return
  useTowerEdit.setState({ drag: { ...d, live, hit: sameHit ? d.hit : hit } })
}

/** Release: the new pose becomes (or updates) the proposal, waiting for Confirm. */
export function endDrag() {
  const d = useTowerEdit.getState().drag
  if (!d) return
  useTowerEdit.setState({ drag: null })
  const t = towerOf(d.id)
  if (!t || samePose(d.live, d.from)) return
  propose({ id: d.id, start: useTowerEdit.getState().proposal?.start ?? poseOf(t), pose: d.live, via: 'gizmo', hit: d.hit }, t.name)
}

/** Esc while dragging: the drag is dropped; a proposal from before it stays as it was. */
export function cancelDrag() {
  if (useTowerEdit.getState().drag) useTowerEdit.setState({ drag: null })
}

function propose(p: Proposal, name: string) {
  if (samePose(p.pose, p.start)) { useTowerEdit.setState({ proposal: null }); return }
  useTowerEdit.setState({ proposal: p })
  say(`${name}: proposed position ${where(p.pose)}. Enter to confirm, Esc to cancel`)
}

/**
 * "Place on map" click: the clicked point (snapped like a move) becomes the proposal; another click moves it. The
 * tower keeps its rotation.
 */
export function proposePlace(id: string, x: number, y: number): boolean {
  if (locked()) { say(LOCKED); return false }
  const t = towerOf(id)
  if (!t) return false
  const cur = useTowerEdit.getState().proposal
  const from = cur?.id === id ? cur.pose : poseOf(t)
  if (app().project === 'city') void loadCityParcels()
  const { pose, hit } = moveSnapped(t, from, { x, y }, 'xy', snapOptions())
  pickTower(id)
  propose({ id, start: cur?.id === id ? cur.start : poseOf(t), pose, via: 'place', hit }, t.name)
  return true
}

/** Confirm: the proposal is written to the store as one undo step; placing ends. */
export function confirmProposal(): boolean {
  const p = useTowerEdit.getState().proposal
  if (!p) return false
  if (locked()) { say(LOCKED); return false }
  const t = towerOf(p.id)
  useTowerEdit.setState({ proposal: null })
  if (!t) return false
  if (!samePose(p.pose, poseOf(t))) {
    breakStep()
    app().updateTower(p.id, p.pose)
    breakStep()
  }
  if (app().placing) app().set({ placing: false })
  say(`${t.name} moved to ${where(p.pose)}`)
  return true
}

/** Cancel (or Esc): the proposal goes and the tower stays where it was. Placing ends. */
export function cancelProposal() {
  const p = useTowerEdit.getState().proposal
  if (!p) return
  useTowerEdit.setState({ proposal: null })
  if (app().placing) app().set({ placing: false })
  const t = towerOf(p.id)
  if (t) say(`${t.name} kept where it was`)
}

const clean = (patch: Partial<Pose>): Partial<Pose> => {
  const out: Partial<Pose> = {}
  if (patch.x !== undefined && Number.isFinite(patch.x)) out.x = tidy(patch.x)
  if (patch.y !== undefined && Number.isFinite(patch.y)) out.y = tidy(patch.y)
  if (patch.rotation !== undefined && Number.isFinite(patch.rotation)) out.rotation = normalizeDeg(patch.rotation)
  return out
}

/**
 * Typed values. With a proposal pending they adjust the proposal; otherwise they are written at once, one undo step
 * per entry. Returns false when nothing changed or the model is locked.
 */
export function setPose(id: string, patch: Partial<Pose>): boolean {
  if (locked()) { say(LOCKED); return false }
  const t = towerOf(id)
  if (!t) return false
  const p = clean(patch)
  const prop = useTowerEdit.getState().proposal
  if (prop?.id === id) {
    if (!Object.keys(p).length || samePose({ ...prop.pose, ...p }, prop.pose)) return false
    propose({ ...prop, pose: { ...prop.pose, ...p }, hit: null }, t.name)
    return true
  }
  if (!Object.keys(p).length || samePose({ ...poseOf(t), ...p }, poseOf(t))) return false
  breakStep()
  app().updateTower(id, p)
  breakStep()
  return true
}

let lastNudge = -Infinity

/**
 * Keyboard nudge by whole grid steps (dx, dy in model axes, dTurn in angle steps); `fine` = Shift (0.1 m / 1°, off
 * the grid). A pending proposal is nudged instead of the tower. Presses closer together than the history's merge
 * window are one undo step, like dragging a slider.
 */
export function nudge(id: string, dx: number, dy: number, dTurn: number, fine = false, now = clock()): boolean {
  if (locked()) { say(LOCKED); return false }
  const t = towerOf(id)
  if (!t) return false
  const s = useTowerEdit.getState()
  const prop = s.proposal?.id === id ? s.proposal : null
  const from = prop ? prop.pose : poseOf(t)
  const p: Partial<Pose> = {}
  const move = (v: number, d: number) => (fine ? v + d * FINE_MOVE : s.snap ? snapTo(v + d * s.moveStep, s.moveStep) : v + d * s.moveStep)
  if (dx) p.x = move(from.x, dx)
  if (dy) p.y = move(from.y, dy)
  if (dTurn) p.rotation = fine ? from.rotation + dTurn * FINE_TURN : s.snap ? snapTo(from.rotation + dTurn * s.rotateStep, s.rotateStep) : from.rotation + dTurn * s.rotateStep
  const c = clean(p)
  if (!Object.keys(c).length || samePose({ ...from, ...c }, from)) return false
  if (prop) { propose({ ...prop, pose: { ...from, ...c }, hit: null }, t.name); return true }
  if (now - lastNudge > MERGE_MS) breakStep()
  lastNudge = now
  app().updateTower(id, c)
  return true
}

// ---------- press bookkeeping (the 3D view's click handler reads it after the scene has seen the press) ----------

let gizmoPressed = false
export const noteGizmoPress = () => { gizmoPressed = true }
/** Read and reset: whether the last press started on the gizmo. */
export function takeGizmoPress(): boolean {
  const g = gizmoPressed
  gizmoPressed = false
  return g
}
