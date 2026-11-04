import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { rectCorners } from '../engine/massing'
import type { ImportedMass } from '../engine/types'
import { useStore } from '../store'
import { redo, resetHistory, startHistory, undo } from './project/history'
import { setCityParcels } from './siteGeometry'
import {
  beginDrag, cancelDrag, cancelProposal, clearPick, confirmProposal, dragTo, endDrag, moveSnapped, normalizeDeg, nudge,
  pickTower, proposePlace, setMetresPerPx, setPose, setShiftHeld, snapMove, snapRotate, snapTo, toggleMode, turnDeg,
  turnSnapped, useTowerEdit, type Pose, type SnapOptions,
} from './towerEdit'

const close = (a: [number, number][], b: [number, number][]) => a.forEach((p, i) => { expect(p[0]).toBeCloseTo(b[i][0], 9); expect(p[1]).toBeCloseTo(b[i][1], 9) })
const tower = () => useStore.getState().towers.vtc.find((t) => t.id === 't1')!
const pose = (): Pose => ({ x: tower().x, y: tower().y, rotation: tower().rotation })
const proposal = () => useTowerEdit.getState().proposal

describe('snapping maths', () => {
  it('snaps to an absolute grid and keeps values clean', () => {
    expect(snapTo(12.4, 1)).toBe(12)
    expect(snapTo(12.6, 5)).toBe(15)
    expect(snapTo(-7.4, 5)).toBe(-5)
    expect(snapTo(-0.2, 1)).toBe(0) // never -0
    expect(Object.is(snapTo(-0.2, 1), -0)).toBe(false)
    expect(snapTo(0.1 + 0.2, 0)).toBe(0.3) // step 0 = free, float noise rounded away
    expect(snapTo(43, 15)).toBe(45)
  })
  it('normalises angles to (-180, 180]', () => {
    expect(normalizeDeg(0)).toBe(0)
    expect(normalizeDeg(180)).toBe(180)
    expect(normalizeDeg(-180)).toBe(180)
    expect(normalizeDeg(190)).toBe(-170)
    expect(normalizeDeg(725)).toBe(5)
    expect(normalizeDeg(-370)).toBe(-10)
  })
  it('locks the other coordinate on an arrow, moves both on the plane handle, and never changes the rotation', () => {
    const start: Pose = { x: -20.3, y: 4.2, rotation: 12 }
    expect(snapMove(start, { x: 3.7, y: 99 }, 'x', 1)).toEqual({ x: 4, y: 4.2, rotation: 12 })
    expect(snapMove(start, { x: 99, y: 7.6 }, 'y', 5)).toEqual({ x: -20.3, y: 10, rotation: 12 })
    expect(snapMove(start, { x: 3.7, y: 7.6 }, 'xy', 5)).toEqual({ x: 5, y: 10, rotation: 12 })
    expect(snapMove(start, { x: 3.71, y: 7.62 }, 'xy', null)).toEqual({ x: 3.71, y: 7.62, rotation: 12 }) // Shift: free
  })
  it('turns by snapped absolute angles, or freely, about the tower’s own position', () => {
    const start: Pose = { x: 10, y: -4, rotation: 7 }
    expect(snapRotate(start, 31, 15)).toEqual({ x: 10, y: -4, rotation: 45 }) // 38° → 45°
    expect(snapRotate(start, 2, 5)).toEqual({ x: 10, y: -4, rotation: 10 })
    expect(snapRotate(start, 31.5, null).rotation).toBe(38.5)
    expect(snapRotate({ ...start, rotation: 170 }, 20, 15).rotation).toBe(-165) // 190 → 195 → (-180, 180]
  })
  it('measures the dragged arc counter-clockwise, like the rotation field', () => {
    expect(turnDeg([0, 0], [1, 0], [0, 1])).toBeCloseTo(90, 9)
    expect(turnDeg([5, 5], [6, 5], [5, 4])).toBeCloseTo(-90, 9)
    expect(turnDeg([0, 0], [1, 0], [-1, 1e-9])).toBeCloseTo(180, 6)
  })
  it('turns the same way as a three.js turn about world up in the scene’s z-up frame (the gizmo’s arc)', () => {
    // The scene group maps model (x, y, z) to three.js (x, z, -y); the gizmo turns about world +Y.
    const scene = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
    const toModel = scene.clone().invert()
    const start: Pose = { x: 8, y: -3, rotation: 15 }, delta = 25
    const centre = new THREE.Vector3(start.x, start.y, 0).applyMatrix4(scene)
    const turn = new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)
      .multiply(new THREE.Matrix4().makeRotationY((delta * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    const viaThree = rectCorners(start.x, start.y, 46, 30, start.rotation).map(([x, y]) => {
      const v = new THREE.Vector3(x, y, 0).applyMatrix4(scene).applyMatrix4(turn).applyMatrix4(toModel)
      return [v.x, v.y] as [number, number]
    })
    const live = snapRotate(start, delta, null)
    close(viaThree, rectCorners(live.x, live.y, 46, 30, live.rotation))
  })
})

describe('snapping to the site and parcels', () => {
  const opts = (o: Partial<SnapOptions> = {}): SnapOptions => ({ project: 'vtc', snap: true, free: false, step: 1, tol: 4, ...o })
  beforeEach(() => { useStore.setState(useStore.getInitialState(), true); setCityParcels(null) })

  it('catches the competition block edge before the grid, and lets Shift or Snap off move freely', () => {
    // Tower 46 m wide: its east face at x + 23 lands on the block edge at 72.4 m (144.8 m / 2) from x = 49.4.
    const t = { ...tower(), podiumHeight: 0 }
    const start: Pose = { x: 0, y: 0, rotation: 0 }
    const m = moveSnapped(t, start, { x: 47.3, y: 0 }, 'x', opts())
    expect(m.pose.x).toBeCloseTo(49.4, 6)
    expect(m.hit).toMatchObject({ kind: 'site', how: 'edge' })
    expect(moveSnapped(t, start, { x: 30.4, y: 0 }, 'x', opts()).pose.x).toBe(30) // nothing near: the 1 m grid
    expect(moveSnapped(t, start, { x: 47.3, y: 0 }, 'x', opts({ free: true })).pose.x).toBe(47.3)
    expect(moveSnapped(t, start, { x: 47.3, y: 0 }, 'x', opts({ snap: false })).hit).toBeNull()
  })

  it('lands a podium corner on the block corner from the plane handle', () => {
    const t = { ...tower(), podiumWidth: 100, podiumDepth: 64, podiumHeight: 18 }
    // Podium corner (x + 50, y + 32) → block corner (72.4, 39.6) from (22.4, 7.6).
    const m = moveSnapped(t, { x: 0, y: 0, rotation: 0 }, { x: 21.2, y: 6.5 }, 'xy', opts())
    expect(m.pose.x).toBeCloseTo(22.4, 6)
    expect(m.pose.y).toBeCloseTo(7.6, 6)
    expect(m.hit?.kind).toBe('site')
  })

  it('turns parallel to a nearby parcel edge, else by the angle step', () => {
    useStore.getState().setProject('city')
    const t = useStore.getState().towers.city[0]
    const parcel = rectCorners(t.x + 40, t.y, 30, 20, 31) // a parcel next to the tower, turned 31°
    setCityParcels([parcel])
    const start = { x: t.x, y: t.y, rotation: 0 }
    expect(turnSnapped(t, start, 29.2, { project: 'city', snap: true, free: false, step: 15 }).pose.rotation).toBeCloseTo(31, 6)
    expect(turnSnapped(t, start, 29.2, { project: 'city', snap: true, free: false, step: 15 }).hit).toMatchObject({ kind: 'parcel', how: 'parallel' })
    expect(turnSnapped(t, start, 20, { project: 'city', snap: true, free: false, step: 15 }).pose.rotation).toBe(15)
    expect(turnSnapped(t, start, 29.2, { project: 'city', snap: true, free: true, step: 15 }).pose.rotation).toBe(29.2)
    setCityParcels(null)
  })
})

describe('confirm before placing: proposals, Confirm as one undo step, Cancel', () => {
  let stop: (() => void) | undefined
  let t = 0
  const fresh = () => {
    useStore.setState(useStore.getInitialState(), true)
    useTowerEdit.setState(useTowerEdit.getInitialState(), true)
    setShiftHeld(false)
    setMetresPerPx(0.25) // 12 px → 3 m of edge reach
  }
  beforeEach(() => { fresh(); stop?.(); t = 0; stop = startHistory(() => t); resetHistory() })
  afterEach(() => { stop?.(); stop = undefined })

  it('picks the tower as the selected tower, and clearing the pick leaves the selection alone', () => {
    useStore.getState().addTower()
    pickTower('t1')
    expect(useTowerEdit.getState().picked).toBe('t1')
    expect(useStore.getState().selectedTower).toBe('t1')
    clearPick()
    expect(useTowerEdit.getState().picked).toBeNull()
    expect(useStore.getState().selectedTower).toBe('t1')
  })

  it('a gizmo drag leaves the store alone and becomes a proposal; Confirm writes it as one undo step', () => {
    const before = pose()
    expect(beginDrag('t1', 'xy')).toBe(true)
    dragTo({ x: -10, y: 5, rotation: 0 })
    dragTo({ x: 5, y: 10, rotation: 0 })
    expect(pose()).toEqual(before) // nothing written while dragging
    endDrag()
    expect(pose()).toEqual(before) // nor on release
    expect(proposal()).toMatchObject({ id: 't1', start: before, pose: { x: 5, y: 10, rotation: 0 }, via: 'gizmo' })
    expect(confirmProposal()).toBe(true)
    expect(pose()).toEqual({ x: 5, y: 10, rotation: 0 })
    expect(proposal()).toBeNull()
    expect(tower().height).toBe(285) // nothing else changed
    expect(undo()).toBe(true)
    expect(pose()).toEqual(before)
    expect(undo()).toBe(false) // one step
    expect(redo()).toBe(true)
    expect(pose()).toEqual({ x: 5, y: 10, rotation: 0 })
  })

  it('Cancel keeps the tower where it was, with no undo step', () => {
    const before = pose()
    beginDrag('t1', 'rotate')
    dragTo(snapRotate(before, 31, 15))
    endDrag()
    expect(proposal()?.pose.rotation).toBe(30)
    cancelProposal()
    expect(proposal()).toBeNull()
    expect(pose()).toEqual(before)
    expect(undo()).toBe(false)
  })

  it('a second drag adjusts the proposal; Esc mid-drag keeps it; Confirm still goes back to the very start in one step', () => {
    const before = pose()
    beginDrag('t1', 'x'); dragTo({ x: 10, y: 0, rotation: 0 }); endDrag()
    beginDrag('t1', 'rotate')
    expect(useTowerEdit.getState().drag?.from).toEqual({ x: 10, y: 0, rotation: 0 }) // starts from the proposal
    dragTo({ x: 10, y: 0, rotation: 45 })
    cancelDrag() // Esc during the second drag
    expect(proposal()?.pose).toEqual({ x: 10, y: 0, rotation: 0 })
    beginDrag('t1', 'rotate'); dragTo({ x: 10, y: 0, rotation: 15 }); endDrag()
    expect(proposal()).toMatchObject({ start: before, pose: { x: 10, y: 0, rotation: 15 } })
    confirmProposal()
    expect(pose()).toEqual({ x: 10, y: 0, rotation: 15 })
    undo()
    expect(pose()).toEqual(before)
    expect(undo()).toBe(false)
  })

  it('a drag that ends where it started proposes nothing', () => {
    beginDrag('t1', 'xy'); dragTo({ x: 30, y: 0, rotation: 0 }); dragTo({ x: -20, y: 0, rotation: 0 }); endDrag()
    expect(proposal()).toBeNull()
  })

  it('Place on map: a click proposes the spot lined up with the competition block, another click moves it, Confirm places and stops placing', () => {
    useStore.getState().set({ placing: true })
    expect(proposePlace('t1', 12.4, -3.6)).toBe(true)
    expect(pose()).toEqual({ x: -20, y: 0, rotation: 0 }) // not moved yet
    // Inside the block: centred on the click, turned to the block's lines (0°: the 100 m podium along its 144.8 m side).
    expect(proposal()).toMatchObject({ via: 'place', pose: { x: 12.4, y: -3.6, rotation: 0 }, align: { how: 'site', fits: true } })
    expect(proposal()?.align?.text).toMatch(/competition block/)
    expect(useTowerEdit.getState().picked).toBe('t1')
    proposePlace('t1', 30.2, 2.1) // the podium would cross the block's east line at 72.4 m: held flush with it
    expect(proposal()).toMatchObject({ start: { x: -20, y: 0, rotation: 0 }, pose: { x: 22.4, y: 2.1, rotation: 0 } })
    confirmProposal()
    expect(pose()).toEqual({ x: 22.4, y: 2.1, rotation: 0 })
    expect(useStore.getState().placing).toBe(false)
    undo()
    expect(pose()).toEqual({ x: -20, y: 0, rotation: 0 })
  })

  it('Place on map with Shift places off the grid; Cancel stops placing and keeps the tower', () => {
    useStore.getState().set({ placing: true })
    setShiftHeld(true)
    proposePlace('t1', 12.37, -3.61)
    expect(proposal()?.pose).toEqual({ x: 12.37, y: -3.61, rotation: 0 })
    cancelProposal()
    expect(useStore.getState().placing).toBe(false)
    expect(pose()).toEqual({ x: -20, y: 0, rotation: 0 })
    expect(undo()).toBe(false)
  })

  it('typed values adjust a pending proposal, else are written at once, one step each', () => {
    expect(setPose('t1', { x: 12.3456789 })).toBe(true)
    t += 10 // inside the merge window, still its own step
    expect(setPose('t1', { rotation: 370 })).toBe(true)
    expect(tower().x).toBe(12.345679)
    expect(tower().rotation).toBe(10)
    expect(setPose('t1', { y: Number.NaN })).toBe(false)
    expect(setPose('t1', { x: 12.345679 })).toBe(false) // no change, no step
    undo()
    expect(tower().rotation).toBe(0)
    undo()
    expect(tower().x).toBe(-20)
    beginDrag('t1', 'x'); dragTo({ x: 0, y: 0, rotation: 0 }); endDrag()
    setPose('t1', { y: 7 })
    expect(tower().y).toBe(0)
    expect(proposal()?.pose).toEqual({ x: 0, y: 7, rotation: 0 })
  })

  it('keyboard nudges snap to the grid, Shift is fine, a quick run of presses is one step, and a proposal is nudged instead', () => {
    useTowerEdit.setState({ moveStep: 5 })
    nudge('t1', 1, 0, 0, false, 1000)
    nudge('t1', 1, 0, 0, false, 1100)
    expect(tower().x).toBe(-10)
    nudge('t1', 0, -1, 0, true, 1200)
    expect(tower().y).toBe(-0.1)
    undo()
    expect(pose()).toEqual({ x: -20, y: 0, rotation: 0 })
    expect(undo()).toBe(false)
    nudge('t1', 0, 0, 1, false, 5000) // ] with 15° steps
    expect(tower().rotation).toBe(15)
    beginDrag('t1', 'x'); dragTo({ x: 0, y: 0, rotation: 15 }); endDrag()
    nudge('t1', 1, 0, 0, false, 9000)
    expect(tower().x).toBe(-20)
    expect(proposal()?.pose.x).toBe(5)
  })

  it('Present locks the model: no drag, no placement, no typed value, no nudge, no mode switch, no confirm', () => {
    beginDrag('t1', 'x'); dragTo({ x: 0, y: 0, rotation: 0 }); endDrag()
    useStore.getState().setPhase('present')
    expect(confirmProposal()).toBe(false)
    expect(beginDrag('t1', 'xy')).toBe(false)
    expect(proposePlace('t1', 5, 5)).toBe(false)
    expect(setPose('t1', { x: 50 })).toBe(false)
    expect(nudge('t1', 1, 0, 0)).toBe(false)
    toggleMode('move')
    expect(useTowerEdit.getState().move).toBe(false)
    expect(useStore.getState().announce).toMatch(/locked in Present/)
    expect(tower().x).toBe(-20)
    expect(undo()).toBe(false)
  })

  it('moves an imported mass through the same tower fields', () => {
    const imported = { hull: [[-10, -10], [10, -10], [10, 10], [-10, 10]], storeys: [], top: 120, meshId: 'm' } as unknown as ImportedMass
    useStore.getState().updateTower('t1', { imported })
    resetHistory()
    beginDrag('t1', 'rotate'); dragTo({ x: -20, y: 0, rotation: 45 }); endDrag()
    confirmProposal()
    expect(tower().rotation).toBe(45)
    undo()
    expect(tower().rotation).toBe(0)
  })
})
