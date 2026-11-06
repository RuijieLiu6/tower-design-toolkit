// The view side of "Tower position" (lib/towerPosition.ts): while the tool is open, the view frames the site at a fixed
// scale (zoom and pan off, orbit about it free; the Properties tab unlocks it or frames it again), a press on a tower
// drags it on the ground, and a click on the ground moves the selected tower there, lined up with the lot (Shift:
// free). Moves are written at once, one undo step each (lib/towerEdit.ts); Esc drops a drag. Mounted inside the scene's
// z-up group, like MassingEdit3D.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Tower } from '../engine/types'
import type { Ray3 } from '../lib/blockEdit'
import { planeHit } from '../lib/blockEdit'
import { siteFrame, towerUnderRay, useTowerPosition } from '../lib/towerPosition'
import { beginDrag, cancelDrag, dragTo, endDrag, moveSnapped, noteGizmoPress, pickTower, poseOf, proposePlace, snapOptions, useTowerEdit } from '../lib/towerEdit'
import { VTC_SITE } from '../lib/siteGeometry'
import { useViewFromStore } from '../lib/viewFromStore'
import { useVistaLook } from '../lib/vistaLook'
import { useStore, useTowers } from '../store'

type Pt = [number, number]
type Controls = THREE.EventDispatcher & { enabled: boolean; enableZoom: boolean; enablePan: boolean; target: THREE.Vector3; update: () => void }
const DRAG_PX = 4
/** The locked view: high enough to read the site as a plan, low enough to see the tower stand. */
const ELEVATION_DEG = 52
const FILL = 0.85
const FLIGHT_MS = 450

/** Live when the tool is open, outside Present, and nothing else is using the view. */
export function useTowerPositionLive(): boolean {
  const on = useTowerPosition((s) => s.on)
  const phase = useStore((s) => s.phase)
  const viewing = useViewFromStore((s) => s.looking || s.picking)
  return on && phase !== 'present' && !viewing
}

export default function TowerPosition3D() {
  const live = useTowerPositionLive()
  const locked = useTowerPosition((s) => s.locked)
  const frameReq = useTowerPosition((s) => s.frame)
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const siteRing = useStore((s) => (s.project === 'city' ? s.citySite?.ring ?? null : (VTC_SITE.ring as Pt[])))
  const towers = useTowers()
  const baseZ = project === 'city' ? ground : 0
  const list = useRef<Tower[]>(towers)
  list.current = towers
  const base = useRef(baseZ)
  base.current = baseZ
  const { gl, camera, size } = useThree()
  const get = useThree((s) => s.get)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  /** The pointer's ray in the project frame (three's x, -z, y). */
  const rayAt = (clientX: number, clientY: number): Ray3 => {
    const r = gl.domElement.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const o = raycaster.ray.origin, d = raycaster.ray.direction
    return { o: [o.x, -o.z, o.y], d: [d.x, -d.z, d.y] }
  }

  // ---- Pointer: press a tower and drag it; click the ground to move the selected tower there.
  useEffect(() => {
    if (!live) return
    const el = gl.domElement
    let press: { x: number; y: number; id: string | null; z: number; off: Pt; started: boolean; ground: Pt | null } | null = null
    let saved: boolean | null = null
    const controls = () => get().controls as unknown as Controls | null
    const release = () => { const c = controls(); if (c && saved !== null) c.enabled = saved; saved = null }
    const drop = () => { if (press?.started) cancelDrag(); press = null; release(); el.style.cursor = '' }
    const onDown = (e: PointerEvent) => {
      if (e.target !== el || e.button !== 0 || e.ctrlKey || e.metaKey) return
      // The gizmo's arrows and ring have seen the press first: their drag wins.
      if (useTowerEdit.getState().drag) return
      const ray = rayAt(e.clientX, e.clientY)
      const hit = towerUnderRay(list.current, base.current, ray)
      noteGizmoPress() // the pick-or-deselect click handler leaves this press to us
      if (hit) {
        pickTower(hit.tower.id)
        const c = controls()
        if (c) { if (saved === null) saved = c.enabled; c.enabled = false }
        const p0 = planeHit(ray, hit.point[2]) ?? [hit.tower.x, hit.tower.y]
        press = { x: e.clientX, y: e.clientY, id: hit.tower.id, z: hit.point[2], off: [hit.tower.x - p0[0], hit.tower.y - p0[1]], started: false, ground: null }
      } else {
        press = { x: e.clientX, y: e.clientY, id: null, z: base.current, off: [0, 0], started: false, ground: planeHit(ray, base.current) }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!press) {
        if (e.target !== el || e.buttons) return
        el.style.cursor = towerUnderRay(list.current, base.current, rayAt(e.clientX, e.clientY)) ? 'move' : ''
        return
      }
      if (!press.id) return
      if (!press.started) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return
        if (!beginDrag(press.id, 'xy')) { press = null; release(); return }
        press.started = true
      }
      const t = list.current.find((x) => x.id === press!.id)
      const p = planeHit(rayAt(e.clientX, e.clientY), press.z)
      if (!t || !p) return
      const r = moveSnapped(t, poseOf(t), { x: p[0] + press.off[0], y: p[1] + press.off[1] }, 'xy', snapOptions())
      dragTo(r.pose, r.hit)
    }
    const onUp = (e: PointerEvent) => {
      if (!press) return
      const p = press
      press = null
      release()
      if (p.id) { if (p.started) endDrag(); return }
      // A click on the ground (not an orbit drag): the selected tower moves there.
      const sel = useStore.getState().selectedTower
      if (p.ground && sel && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) proposePlace(sel, p.ground[0], p.ground[1])
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && press?.started) { e.preventDefault(); e.stopImmediatePropagation(); drop() } }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('blur', drop)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('blur', drop)
      window.removeEventListener('keydown', onKey, true)
      drop()
    }
    // rayAt reads the live camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, gl, get, camera])

  // ---- The locked view: the site and the selected tower framed at a fixed scale, zoom and pan off, orbit free.
  const flight = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; c0: THREE.Vector3; c1: THREE.Vector3; t0: number } | null>(null)
  useEffect(() => {
    const c = get().controls as unknown as Controls | null
    if (!live || !locked || !c) return
    if (project === 'city') { const v = useVistaLook.getState(); if (v.mode !== 'city' && v.mode !== 'viewcone') useVistaLook.setState({ mode: 'city', inspected: null, note: null }) }
    const s = useStore.getState()
    const t = s.towers[s.project].find((x) => x.id === s.selectedTower) ?? null
    const f = siteFrame(siteRing as Pt[] | null, t, base.current)
    const cam = camera as THREE.PerspectiveCamera
    const vf = (cam.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * (size.width / Math.max(1, size.height)))
    const dist = f.radius / Math.sin(Math.min(vf, hf) / 2) / FILL
    const target = new THREE.Vector3(f.centre[0], f.centre[2], -f.centre[1])
    // Keep the side the user was looking from.
    const az = new THREE.Vector3().subVectors(cam.position, c.target).setY(0)
    if (az.lengthSq() < 1e-6) az.set(0, 0, 1)
    az.normalize()
    const el = (ELEVATION_DEG * Math.PI) / 180
    const pos = target.clone().add(az.multiplyScalar(dist * Math.cos(el))).add(new THREE.Vector3(0, dist * Math.sin(el), 0))
    const prev = { zoom: c.enableZoom, pan: c.enablePan }
    c.enableZoom = false; c.enablePan = false
    if (s.reducedMotion) { cam.position.copy(pos); c.target.copy(target); c.update(); flight.current = null }
    else flight.current = { p0: cam.position.clone(), p1: pos, c0: c.target.clone(), c1: target, t0: performance.now() }
    return () => { c.enableZoom = prev.zoom; c.enablePan = prev.pan; flight.current = null }
    // Frame on opening the tool, on locking again, on a new site and when the Properties tab asks; not after each move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, locked, frameReq, project, siteRing])

  useFrame((state) => {
    const f = flight.current
    const c = state.controls as unknown as Controls | null
    if (!f || !c) return
    const k = Math.min(1, (performance.now() - f.t0) / FLIGHT_MS), e = 1 - Math.pow(1 - k, 3)
    state.camera.position.lerpVectors(f.p0, f.p1, e)
    c.target.lerpVectors(f.c0, f.c1, e)
    c.update()
    state.invalidate()
    if (k >= 1) flight.current = null
  })
  return null
}
