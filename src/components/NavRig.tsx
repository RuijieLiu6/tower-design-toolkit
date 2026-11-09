// Inside the canvas, in both projects: the live camera for the view commands (lib/viewNav.ts), the smooth moves, and the
// orientation read-outs (Milestone 1, 9 Nov).
//   - Steps the camera move in progress; grabbing, wheeling or a key on the view stops it (OrbitControls' start event).
//   - Remembers each project's view for this visit: switching to the other project and back returns to where you were.
//   - The canvas takes keyboard focus: arrow keys pan, Shift / Ctrl + arrows orbit (OrbitControls' own keys), + / − zoom;
//     while the tower gizmo is moving or turning a tower, the arrows stay the gizmo's.
//   - About four times a second: the view's scale (city, neighbourhood, site, tower, plan, viewpoint) and, when the site is
//     out of view, where on the view's edge to point to it.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { useTowerEdit } from '../lib/towerEdit'
import { useViewFromStore } from '../lib/viewFromStore'
import { useVistaLook } from '../lib/vistaLook'
import { classify, currentPose, flight, nav, selectedTower, siteCentre, stepFlight, toThree, useNav, userMoved, viewInsets, zoomBy, type Pose } from '../lib/viewNav'

type Ctl = NonNullable<typeof nav.ctl>
/** The last view of each project in this visit (a project switch remounts the canvas). */
const memory: Partial<Record<string, Pose>> = {}

export default function NavRig() {
  const { camera, gl, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as unknown as Ctl | null
  const project = useStore((s) => s.project)

  useEffect(() => {
    nav.camera = camera as THREE.PerspectiveCamera; nav.ctl = controls; nav.el = gl.domElement; nav.invalidate = invalidate
    return () => { if (nav.el === gl.domElement) { nav.camera = null; nav.ctl = null; nav.el = null; nav.invalidate = null } }
  }, [camera, controls, gl, invalidate])

  // Back in a project: its last view (no move; the canvas just opened).
  useEffect(() => {
    if (!controls) return
    const m = memory[project]
    if (m) {
      const cam = camera as THREE.PerspectiveCamera
      cam.position.copy(toThree(...m.position)); controls.target.copy(toThree(...m.target)); cam.fov = m.fov
      cam.updateProjectionMatrix(); controls.update(); invalidate()
    }
    return () => { const p = currentPose(); if (p) memory[project] = p }
  }, [controls, project, camera, invalidate])

  // Grabbing the view stops a camera move, and counts as the user's own view.
  useEffect(() => {
    controls?.addEventListener?.('start', userMoved)
    return () => controls?.removeEventListener?.('start', userMoved)
  }, [controls])

  // Keyboard: the canvas is a focus stop; OrbitControls' keys while the gizmo does not own the arrows.
  useEffect(() => {
    const el = gl.domElement
    if (!controls) return
    el.tabIndex = 0
    el.setAttribute('aria-label', 'The 3D model. Arrow keys pan, Shift or Ctrl with the arrows orbit, + and − zoom. View commands: S site, . selection, T tower, N neighbourhood, C overview, 7 plan or 3D, Home.')
    controls.keyPanSpeed = 40
    let listening = false
    const sync = () => {
      const s = useTowerEdit.getState(), gizmo = !!s.picked && (s.move || s.rotate)
      if (gizmo && listening) { controls.stopListenToKeyEvents?.(); listening = false }
      if (!gizmo && !listening) { controls.listenToKeyEvents?.(el); listening = true }
    }
    sync()
    const un = useTowerEdit.subscribe(sync)
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(-0.25) }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(0.25) }
      else if (e.key.startsWith('Arrow')) userMoved()
    }
    el.addEventListener('keydown', onKey)
    return () => { un(); el.removeEventListener('keydown', onKey); if (listening) controls.stopListenToKeyEvents?.() }
  }, [controls, gl])

  // Where am I looking: the scale, and a pointer to the site when it is out of view.
  const last = useRef(0), later = useRef(false)
  const v = useRef(new THREE.Vector3())
  useFrame(({ size }) => {
    stepFlight()
    const now = performance.now()
    // At most four times a second; the canvas draws only on change, so one more frame after the view settles keeps the
    // read-out true to the final view.
    if (now - last.current < 250) {
      if (!later.current) { later.current = true; setTimeout(() => { later.current = false; invalidate() }, 270) }
      return
    }
    last.current = now
    const cam = camera as THREE.PerspectiveCamera, ctl = controls
    if (!ctl) return
    const dist = cam.position.distanceTo(ctl.target)
    const widthM = 2 * dist * Math.tan((cam.fov * Math.PI) / 360) * (size.width / Math.max(1, size.height))
    const t: [number, number] = [ctl.target.x, -ctl.target.z]
    const sc = siteCentre(), tw = selectedTower()
    const s = useStore.getState()
    // Plan while the view is (still) from above: on the competition site the orbit stays free, so a turned view is 3D again.
    const topDown = cam.position.y - ctl.target.y > 0.97 * dist
    const plan = (s.project === 'city' ? useVistaLook.getState().mode === 'plan' : useNav.getState().plan) && topDown
    // The site's centre on screen; outside the free part of the view (or behind the camera), a pointer on its edge.
    let offscreen: { x: number; y: number; angle: number } | null = null
    if (sc && !useViewFromStore.getState().looking && !flight.to) {
      const g = s.project === 'city' ? s.groundElevation : 0
      const q = v.current.set(sc[0], g, -sc[1]).project(cam)
      const ins = viewInsets(), W = size.width, H = size.height
      const x0 = ins.left * W + 28, x1 = W * (1 - ins.right) - 28, y0 = ins.top * H + 28, y1 = H * (1 - ins.bottom) - 28
      let px = ((q.x + 1) / 2) * W, py = ((1 - q.y) / 2) * H
      const behind = q.z > 1
      if (behind) { px = W - px; py = H - py }
      if (behind || px < x0 || px > x1 || py < y0 || py > y1) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = px - cx, dy = py - cy
        const k = Math.min(Math.abs((x1 - cx) / (dx || 1e-6)), Math.abs((y1 - cy) / (dy || 1e-6)), 1)
        let ox = cx + dx * k, oy = cy + dy * k
        // Never under the view's own controls (the compass, View and zoom column, an open dock): beside them instead.
        const cr = gl.domElement.getBoundingClientRect()
        for (const n of document.querySelectorAll<HTMLElement>('[data-nav-occlude="right"]')) {
          const b = n.getBoundingClientRect()
          const l = b.left - cr.left - 44, r = b.right - cr.left + 8, t = b.top - cr.top - 16, bt = b.bottom - cr.top + 16
          if (b.width && ox > l && ox < r && oy > t && oy < bt) { if (oy - t < 40 || bt - oy > ox - l) ox = l; else oy = bt }
        }
        offscreen = { x: Math.round(ox), y: Math.round(oy), angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) }
      }
    }
    // "Site" only while the site is in view (else a close-up away from it, with the pointer to it).
    const scale = classify(widthM, {
      vtc: s.project === 'vtc', looking: useViewFromStore.getState().looking, plan,
      nearSite: !!sc && !offscreen && Math.hypot(t[0] - sc[0], t[1] - sc[1]) < Math.max(250, widthM),
      nearTower: tw && Math.hypot(t[0] - tw.x, t[1] - tw.y) < Math.max(80, tw.height) ? tw.height : null,
    })
    const cur = useNav.getState()
    const w = Math.round(widthM / (widthM > 1000 ? 100 : 10)) * (widthM > 1000 ? 100 : 10)
    const sameOff = (cur.offscreen === null) === (offscreen === null) && (!offscreen || (Math.abs(cur.offscreen!.x - offscreen.x) < 3 && Math.abs(cur.offscreen!.y - offscreen.y) < 3))
    if (cur.scale !== scale || cur.widthM !== w || !sameOff) useNav.setState({ scale, widthM: w, offscreen })
    if (flight.to) invalidate()
  })
  return null
}
