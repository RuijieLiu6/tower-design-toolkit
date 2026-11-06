// Editing the selected tower's blocks on the model while the Massing tool is open (Form step), after Sinnie Choi's
// Downtown Massing Tool (scene3d.js: Face / Mass, ported with her permission, 6 Nov 2026). Ruijie (6 Nov): "lock the
// screen at a certain scale of the model and allow the user to directly toggle on the model to alter the massing".
//   - The view frames the tower and stays at that scale: zoom and pan are locked, orbiting about the tower is free
//     (the Massing panel unlocks it or frames it again).
//   - Face: drag a side face to push or pull it, the roof to change the block's height in whole storeys.
//     Mass: drag a block to move it on its floor, with the blocks resting on it (Shift: alone). Alt: no snapping.
//   - A drag draws a preview and writes the tower once, on release: one undo step. Esc drops it.
// The blocks are tested against the pointer ray directly (lib/blockEdit.ts), so this works whatever draws the tower.
// Mounted inside the scene's z-up group: everything here is in the project frame.
import { Edges, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { withBlocks } from '../engine/massing'
import type { Tower } from '../engine/types'
import { axisParam, boxes, faceFrame, hitBlocks, moveBlock, planeHit, pushFace, useBlockEdit, type FaceKey, type Ray3 } from '../lib/blockEdit'
import { breakStep } from '../lib/project/history'
import { useTowerEdit } from '../lib/towerEdit'
import { useViewFromStore } from '../lib/viewFromStore'
import { useVistaLook } from '../lib/vistaLook'
import { useStore, useTowers } from '../store'
import { useEditorRoot } from './TowerGizmo'
import { useDock } from './ViewportDock'

const ACCENT = '#1f5f8b'
const HOVER = '#eda100'
/** A press that travels this far (px) starts the drag; less is a click. */
const DRAG_PX = 4
/** Snapping reach on screen (px). */
const SNAP_PX = 10
/** The locked view: this far above the horizon, the tower filling this share of the frame. */
const ELEVATION_DEG = 24
// Air around it: Real Vancouver's mode tabs and legend cover the top and bottom of the view.
const FILL = 0.7
const FLIGHT_MS = 450

type Controls = THREE.EventDispatcher & { enabled: boolean; enableZoom: boolean; enablePan: boolean; target: THREE.Vector3; update: () => void }
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/** True when editing on the model is live: Massing open on the Form step, a box tower selected, nothing else using the view. */
export function useMassingEditLive(): Tower | null {
  const on = useBlockEdit((s) => s.on)
  const phase = useStore((s) => s.phase)
  const placing = useStore((s) => s.placing)
  const selected = useStore((s) => s.selectedTower)
  const towers = useTowers()
  const hidden = useDock((s) => s.hidden)
  const viewing = useViewFromStore((s) => s.looking || s.picking)
  const moving = useTowerEdit((s) => !!s.drag || !!s.proposal)
  const t = towers.find((x) => x.id === selected) ?? null
  return on && phase === 'basic' && !placing && !hidden && !viewing && !moving && t && !t.imported ? t : null
}

export default function MassingEdit3D() {
  const t = useMassingEditLive()
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const baseZ = project === 'city' ? ground : 0
  const locked = useBlockEdit((s) => s.locked)
  const frameReq = useBlockEdit((s) => s.frame)
  const { gl, camera, size } = useThree()
  const get = useThree((s) => s.get)
  const tower = useRef<Tower | null>(t)
  tower.current = t
  const base = useRef(baseZ)
  base.current = baseZ
  const mpp = useRef(0.2)
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

  // ---- Pointer: press on a block (after orbit and the gizmo have seen it), drag, release.
  useEffect(() => {
    if (!t) return
    const el = gl.domElement
    let press: { x: number; y: number; ray: Ray3; index: number; face: FaceKey | 'bottom'; z: number; started: boolean; s0?: number; O?: [number, number, number]; N?: [number, number, number]; p0?: [number, number] } | null = null
    let saved: boolean | null = null
    const controls = () => get().controls as unknown as Controls | null
    const release = () => { const c = controls(); if (c && saved !== null) c.enabled = saved; saved = null }
    const drop = () => { press = null; useBlockEdit.setState({ op: null }); release(); el.style.cursor = '' }
    const onDown = (e: PointerEvent) => {
      if (e.target !== el || e.button !== 0 || e.ctrlKey || e.metaKey) return
      const tw = tower.current
      if (!tw || useTowerEdit.getState().drag) return
      const ray = rayAt(e.clientX, e.clientY)
      const hit = hitBlocks(tw, base.current, ray)
      if (!hit || (useBlockEdit.getState().mode === 'face' && hit.face === 'bottom')) return
      // Orbit has already seen the press: switch it off so the drag edits instead of turning the view.
      const c = controls()
      if (c) { if (saved === null) saved = c.enabled; c.enabled = false }
      press = { x: e.clientX, y: e.clientY, ray, index: hit.index, face: hit.face, z: hit.point[2], started: false }
      useBlockEdit.setState({ block: tw.blocks?.[hit.index]?.id ?? null })
    }
    const onMove = (e: PointerEvent) => {
      const tw = tower.current
      if (!tw) return
      const st = useBlockEdit.getState()
      if (!press) {
        // Hover: the face (Face) or block (Mass) under the pointer, and a cursor that says what a drag does.
        if (e.target !== el || e.buttons) return
        const hit = hitBlocks(tw, base.current, rayAt(e.clientX, e.clientY))
        const hv = hit && !(st.mode === 'face' && hit.face === 'bottom') ? { index: hit.index, face: hit.face } : null
        if (hv?.index !== st.hover?.index || hv?.face !== st.hover?.face) useBlockEdit.setState({ hover: hv })
        el.style.cursor = !hv ? '' : st.mode === 'mass' ? 'move' : hv.face === 'top' ? 'ns-resize' : 'ew-resize'
        return
      }
      if (!press.started) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return
        press.started = true
        if (st.mode === 'face') {
          const f = faceFrame(tw, base.current, press.index, press.face as FaceKey)
          press.O = f.O; press.N = f.N; press.s0 = axisParam(f.O, f.N, press.ray) ?? 0
        } else {
          // The block slides in the horizontal plane where it was grabbed, so it stays under the pointer (a plane at its
          // floor would be met far behind a tall block, and a small move would throw it hundreds of metres).
          const b = boxes(tw, base.current)[press.index]
          press.p0 = planeHit(press.ray, press.z) ?? [b.cx, b.cy]
        }
      }
      const ray = rayAt(e.clientX, e.clientY), tol = SNAP_PX * mpp.current
      let r
      if (st.mode === 'face' && press.O && press.N) {
        const s = axisParam(press.O, press.N, ray)
        if (s == null) return
        r = pushFace(tw, press.index, press.face as FaceKey, s - (press.s0 ?? 0), { free: e.altKey, tol })
      } else if (press.p0) {
        const p = planeHit(ray, press.z)
        if (!p) return
        r = moveBlock(tw, press.index, p[0] - press.p0[0], p[1] - press.p0[1], { free: e.altKey, alone: e.shiftKey, tol })
      }
      if (r) useBlockEdit.setState({ op: { towerId: tw.id, kind: st.mode === 'face' ? 'push' : 'move', index: press.index, face: st.mode === 'face' ? press.face as FaceKey : undefined, blocks: r.blocks, info: r.info, x: e.clientX, y: e.clientY } })
    }
    const onUp = () => {
      if (!press) return
      const op = useBlockEdit.getState().op
      const tw = tower.current
      if (press.started && op && tw && op.towerId === tw.id) {
        // One store write, one undo step.
        breakStep()
        useStore.getState().updateTower(tw.id, { blocks: op.blocks })
        useStore.setState({ announce: `${op.info.title}: ${op.info.value}` })
      }
      drop()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'Escape' && press) { e.preventDefault(); e.stopImmediatePropagation(); drop(); return }
      if ((e.key === 'f' || e.key === 'F') && !press) {
        const m = useBlockEdit.getState().mode
        useBlockEdit.setState({ mode: m === 'face' ? 'mass' : 'face', hover: null })
      }
    }
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
      useBlockEdit.setState({ hover: null })
    }
    // rayAt reads the live camera; re-binding per tower change keeps `t` truthiness in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!t, gl, get, camera])

  // ---- The locked view: framed on the tower at a fixed scale, zoom and pan off, orbit about the tower.
  const flight = useRef<{ p0: THREE.Vector3; p1: THREE.Vector3; c0: THREE.Vector3; c1: THREE.Vector3; t0: number } | null>(null)
  const tid = t?.id ?? null
  useEffect(() => {
    const c = get().controls as unknown as Controls | null
    const tw = tower.current
    if (!tw || !locked || !c) return
    if (project === 'city') { const v = useVistaLook.getState(); if (v.mode !== 'city' && v.mode !== 'viewcone') useVistaLook.setState({ mode: 'city', inspected: null, note: null }) }
    const bx = boxes(tw, base.current)
    const xs = bx.flatMap((b) => b.ring.map((p) => p[0])), ys = bx.flatMap((b) => b.ring.map((p) => p[1]))
    const top = Math.max(...bx.map((b) => b.zt))
    const C: [number, number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (base.current + top) / 2]
    const R = 0.5 * Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), top - base.current)
    const cam = camera as THREE.PerspectiveCamera
    const vf = (cam.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * (size.width / Math.max(1, size.height)))
    const dist = R / Math.sin(Math.min(vf, hf) / 2) / FILL
    // Keep the side the user was looking from; set a 3/4 elevation.
    const target = new THREE.Vector3(C[0], C[2], -C[1])
    const az = new THREE.Vector3().subVectors(cam.position, c.target).setY(0)
    if (az.lengthSq() < 1e-6) az.set(1, 0, 1)
    az.normalize()
    const el = (ELEVATION_DEG * Math.PI) / 180
    const pos = target.clone().add(az.multiplyScalar(dist * Math.cos(el))).add(new THREE.Vector3(0, dist * Math.sin(el), 0))
    const prev = { zoom: c.enableZoom, pan: c.enablePan }
    c.enableZoom = false; c.enablePan = false
    if (useStore.getState().reducedMotion) { cam.position.copy(pos); c.target.copy(target); c.update(); flight.current = null }
    else flight.current = { p0: cam.position.clone(), p1: pos, c0: c.target.clone(), c1: target, t0: performance.now() }
    return () => { c.enableZoom = prev.zoom; c.enablePan = prev.pan; flight.current = null }
    // Frame on entering, on another tower, on unlocking and locking again, and when the panel asks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, locked, frameReq, project])

  useFrame((state) => {
    const f = flight.current
    const c = state.controls as unknown as Controls | null
    if (f && c) {
      const k = Math.min(1, (performance.now() - f.t0) / FLIGHT_MS), e = 1 - Math.pow(1 - k, 3)
      state.camera.position.lerpVectors(f.p0, f.p1, e)
      c.target.lerpVectors(f.c0, f.c1, e)
      c.update()
      state.invalidate()
      if (k >= 1) flight.current = null
    }
    // Metres per screen pixel at the target, so snapping reaches the same distance at any scale.
    const cam = state.camera as THREE.PerspectiveCamera
    if (c && cam.isPerspectiveCamera) mpp.current = (2 * cam.position.distanceTo(c.target) * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, state.size.height)
  })

  if (!t) return null
  return <Overlay t={t} baseZ={baseZ} />
}

/** The hovered face or block, and while dragging the tower as it will be (editor-only: never in a capture). */
function Overlay({ t, baseZ }: { t: Tower; baseZ: number }) {
  const root = useEditorRoot()
  const hover = useBlockEdit((s) => s.hover)
  const mode = useBlockEdit((s) => s.mode)
  const op = useBlockEdit((s) => (s.op && s.op.towerId === t.id ? s.op : null))
  const picked = useBlockEdit((s) => s.block)
  const shown = useMemo(() => boxes(op ? withBlocks(t, op.blocks) : t, baseZ), [t, op, baseZ])
  const pickedIndex = shown.findIndex((b) => b.block.id === picked)
  return (
    <group ref={root}>
      {op ? shown.map((b) => <Box key={b.block.id} b={b} strong={b.index === op.index} fill />) : null}
      {!op && hover && shown[hover.index] && (mode === 'face' && hover.face !== 'bottom'
        ? <FaceQuad b={shown[hover.index]} face={hover.face as FaceKey} />
        : <Box b={shown[hover.index]} strong color={HOVER} />)}
      {!op && pickedIndex >= 0 && pickedIndex !== hover?.index && <Box b={shown[pickedIndex]} />}
    </group>
  )
}

type B = ReturnType<typeof boxes>[number]
const NO_RAYCAST = () => null

function Box({ b, strong = false, fill = false, color = ACCENT }: { b: B; strong?: boolean; fill?: boolean; color?: string }) {
  const h = Math.max(0.01, b.zt - b.zb)
  return (
    <mesh position={[b.cx, b.cy, (b.zb + b.zt) / 2]} rotation={[0, 0, (b.rotation * Math.PI) / 180]} raycast={NO_RAYCAST} renderOrder={10}>
      <boxGeometry args={[b.w, b.d, h]} />
      <meshBasicMaterial color={color} transparent opacity={fill ? (strong ? 0.28 : 0.12) : 0} depthTest={false} depthWrite={false} />
      <Edges color={color} lineWidth={strong ? 2.5 : 1.5} renderOrder={11} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={color} depthTest={false} transparent opacity={strong ? 1 : 0.8} />
      </Edges>
    </mesh>
  )
}

/** Corner indices of each side face in a block ring (engine/blocks rectCorners: -u-v, +u-v, +u+v, -u+v). */
const SIDE: Record<Exclude<FaceKey, 'top'>, [number, number]> = { 'u+': [1, 2], 'u-': [3, 0], 'v+': [2, 3], 'v-': [0, 1] }

/** The face a drag would push or pull, tinted: a quad on the block's own corners, lifted a little off the face. */
function FaceQuad({ b, face }: { b: B; face: FaceKey }) {
  const { geom, loop } = useMemo(() => {
    const lift = 0.15
    let pts: [number, number, number][]
    if (face === 'top') pts = b.ring.map(([x, y]) => [x, y, b.zt + lift] as [number, number, number])
    else {
      const [i, j] = SIDE[face]
      const a = (b.rotation * Math.PI) / 180
      const n = face === 'u+' ? [Math.cos(a), Math.sin(a)] : face === 'u-' ? [-Math.cos(a), -Math.sin(a)] : face === 'v+' ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)]
      const p = (k: number, z: number): [number, number, number] => [b.ring[k][0] + n[0] * lift, b.ring[k][1] + n[1] * lift, z]
      pts = [p(i, b.zb), p(j, b.zb), p(j, b.zt), p(i, b.zt)]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    return { geom: g, loop: [...pts, pts[0]] }
  }, [b, face])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <>
      <mesh geometry={geom} raycast={NO_RAYCAST} renderOrder={10}>
        <meshBasicMaterial color={HOVER} transparent opacity={0.4} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={loop} color={HOVER} lineWidth={3} depthTest={false} renderOrder={12} raycast={NO_RAYCAST} />
    </>
  )
}
