// Direct manipulation of towers in the 3D view (DESIGN_HANDOFF.md §8, "Tower gizmo"). Click a tower to pick it as one
// object (accent outline). The toolbar's Move and Rotate toggles show a gumball (drei PivotControls) at its base: the
// arrows and the plane handle move it in plan, the arc turns it about its vertical axis. Moves and "Place on map"
// clicks are proposals first (Vista v10.1 "confirm before placing"): a ghost shows the new footprint and volume, the
// tower itself stays put until Confirm. Snapping, proposals and the undo step are in lib/towerEdit.ts.
import { Line, PivotControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { rectCorners, towerMasses } from '../engine/massing'
import type { Tower } from '../engine/types'
import { baseAt, useGroundUnder } from '../hooks/useProposal'
import { groundUnder } from '../lib/cityLayers'
import { setCleanRender } from '../lib/editorOverlay'
import {
  alignToLot, beginDrag, cancelDrag, cancelProposal, clearPick, confirmProposal, dragTo, endDrag, loadLots, moveSnapped, noteGizmoPress, nudge,
  pickTower, poseOf, setMetresPerPx, setShiftHeld, snapOptions, takeGizmoPress, toggleMode, turnDeg, turnSnapped,
  useTowerEdit, type DragKind, type Pose,
} from '../lib/towerEdit'
import { useViewFromStore } from '../lib/viewFromStore'
import { useStore, useTowers } from '../store'
import { useCityData } from './CityContext'
import { useDock } from './ViewportDock'

const DEG = Math.PI / 180
/** Gizmo size and line width on screen (px; the arrows' hit radius grows with the width), and its lift above the
 * tower base (m) so it never z-fights the ground. */
const GIZMO_PX = 120
const GIZMO_LINE = 4
const LIFT = 0.5
/** A press that travels further than this (px) before release is an orbit, not a click. */
const CLICK_PX = 5
/** Selection outline and ghost: the stage's accent (index.css --color-accent). */
const ACCENT = { basic: '#1f5f8b', advanced: '#1d5fa8' } as const
/** x arrow, y arrow, plane handle + turn arc; hover and snapped lines in the icon's sky-room amber. */
const GIZMO_COLORS: [string, string, string] = ['#c8372d', '#23824a', '#1f5f8b']
const GIZMO_HOVER = '#eda100'
const SNAP_COLOR = '#eda100'
const GIZMO_TAG = { towerGizmo: true }
const NO_RAYCAST = () => null

type Controls = { enabled: boolean }

// Editor-only objects are drawn on the frame loop's own render and hidden on any other render (captures, Vista report
// renders, 360° strips), so they never reach a shot or a board.
const editorRoots = new Set<THREE.Object3D>()
/** Marks a group as editor-only (also used by MassingEdit3D, the Massing tool's editing on the model). */
export function useEditorRoot() {
  return useCallback((o: THREE.Object3D | null) => {
    if (!o) return
    editorRoots.add(o)
    return () => { editorRoots.delete(o) }
  }, [])
}

// Tower wrappers by group, so a click is traced to its tower through R3F's own hits for the press. A handler on the
// wrapper would have R3F raycast every tower a second time on each press, click and wheel step.
const wrappers = new WeakMap<THREE.Object3D, string>()
function towerOf(hit: THREE.Object3D | undefined): string | null {
  for (let o: THREE.Object3D | null = hit ?? null; o; o = o.parent) {
    const id = wrappers.get(o)
    if (id) return id
  }
  return null
}

/**
 * Wraps one tower (parametric or imported) and draws, beside it, its selection outline and the ghost of a pending
 * move. Nothing inside the tower's own component changes, and the tower stays where the store has it.
 */
export function TowerMover({ t, baseZ, children }: { t: Tower; baseZ: number; children: ReactNode }) {
  const setGroup = useCallback((g: THREE.Group | null) => { if (g) wrappers.set(g, t.id) }, [t.id])
  const moving = useTowerEdit((s) => s.drag?.id === t.id || s.proposal?.id === t.id)
  return (
    <>
      <group ref={setGroup}>{children}</group>
      <SelectionOutline t={t} baseZ={baseZ} />
      {moving && <Ghost t={t} />}
    </>
  )
}

type Ring = [number, number][]

/** The tower's prisms in its own frame: every stacked block, or the imported mass's hull (engine/massing towerMasses). */
function prisms(t: Tower): { ring: Ring; z0: number; z1: number }[] {
  return towerMasses({ ...t, x: 0, y: 0, rotation: 0 }).map((m) => ({ ring: m.ring, z0: m.z0, z1: Math.max(m.z0 + 1, m.z1) }))
}

/** Edges of the prisms (at most 8 verticals each, so a curved hull stays readable), as line-segment pairs. */
function outlineSegments(t: Tower): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const { ring, z0, z1 } of prisms(t)) {
    const a = Math.max(0.3, z0), n = ring.length
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n]
      out.push([p[0], p[1], a], [q[0], q[1], a], [p[0], p[1], z1], [q[0], q[1], z1])
    }
    const every = Math.max(1, Math.ceil(n / 8))
    for (let i = 0; i < n; i += every) out.push([ring[i][0], ring[i][1], a], [ring[i][0], ring[i][1], z1])
  }
  return out
}

function SelectionOutline({ t, baseZ }: { t: Tower; baseZ: number }) {
  const picked = useTowerEdit((s) => s.picked === t.id)
  const phase = useStore((s) => s.phase)
  const hidden = useDock((s) => s.hidden)
  const viewing = useViewFromStore((s) => s.looking || s.picking)
  const segs = useMemo(() => outlineSegments(t), [t])
  const root = useEditorRoot()
  // Present has no outline: the board is the capture.
  if (!picked || phase === 'present' || hidden || viewing || segs.length < 2) return null
  const color = ACCENT[phase]
  return (
    <group ref={root} position={[t.x, t.y, baseZ]} rotation={[0, 0, t.rotation * DEG]}>
      <Line points={segs} segments color={color} lineWidth={2.5} fog={false} raycast={NO_RAYCAST} />
      {/* Faint copy through everything, so the outline reads behind context buildings and inside the x-ray shell. */}
      <Line points={segs} segments color={color} lineWidth={1.5} transparent opacity={0.35} depthTest={false} depthWrite={false} renderOrder={20} fog={false} raycast={NO_RAYCAST} />
    </group>
  )
}

/**
 * The proposed position: a translucent volume, a dashed outline and a footprint on the ground, at the live drag pose
 * or the pending proposal, on the base the tower would get there. Lines it snapped to show in amber.
 */
function Ghost({ t }: { t: Tower }) {
  const phase = useStore((s) => s.phase)
  const project = useStore((s) => s.project)
  const hidden = useDock((s) => s.hidden)
  const hit = useTowerEdit((s) => (s.drag?.id === t.id ? s.drag.hit : s.proposal?.id === t.id ? s.proposal.hit : null))
  const group = useRef<THREE.Group>(null)
  const snapGroup = useRef<THREE.Group>(null)
  const root = useEditorRoot()
  const segs = useMemo(() => outlineSegments(t), [t])
  const volume = useMemo(() => {
    const parts = prisms(t).map(({ ring, z0, z1 }) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: Math.max(0.5, z1 - z0), bevelEnabled: false })
      return g.translate(0, 0, z0)
    })
    return parts
  }, [t])
  useEffect(() => () => volume.forEach((g) => g.dispose()), [volume])
  const foot = useMemo(() => {
    const p = prisms(t)
    const ring = p[0]?.ring ?? rectCorners(0, 0, t.width, t.depth, 0)
    return new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))))
  }, [t])
  useEffect(() => () => foot.dispose(), [foot])
  const last = useRef<{ key: string; z: number }>({ key: '', z: 0 })
  useFrame(() => {
    const s = useTowerEdit.getState()
    const p: Pose | null = s.drag?.id === t.id ? s.drag.live : s.proposal?.id === t.id ? s.proposal.pose : null
    const g = group.current
    if (!p || !g) return
    const key = `${p.x},${p.y},${p.rotation}`
    if (key !== last.current.key) {
      const st = useStore.getState()
      last.current = { key, z: baseAt(t, p, project, st.groundMode, st.groundElevation, useGroundUnder.getState().under) }
    }
    g.position.set(p.x, p.y, last.current.z)
    g.rotation.set(0, 0, p.rotation * DEG)
    if (snapGroup.current) snapGroup.current.position.set(0, 0, last.current.z + 0.6)
  })
  if (phase === 'present' || hidden) return null
  const color = phase === 'advanced' ? ACCENT.advanced : ACCENT.basic
  return (
    <group ref={root}>
      <group ref={group}>
        {volume.map((g, i) => (
          <mesh key={i} geometry={g} raycast={NO_RAYCAST} renderOrder={18}>
            <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} fog={false} />
          </mesh>
        ))}
        <mesh geometry={foot} position={[0, 0, 0.5]} raycast={NO_RAYCAST} renderOrder={19}>
          <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} depthTest={false} side={THREE.DoubleSide} fog={false} />
        </mesh>
        <Line points={segs} segments color={color} lineWidth={2} dashed dashSize={4} gapSize={3} fog={false} raycast={NO_RAYCAST} />
        <Line points={segs} segments color={color} lineWidth={1.2} transparent opacity={0.35} depthTest={false} depthWrite={false} renderOrder={20} fog={false} raycast={NO_RAYCAST} />
      </group>
      {hit && hit.segments.length > 0 && (
        <group ref={snapGroup}>
          {hit.segments.map(([a, b], i) => (a[0] === b[0] && a[1] === b[1]
            ? <mesh key={i} position={[a[0], a[1], 0]} raycast={NO_RAYCAST} renderOrder={21}><sphereGeometry args={[1.6, 12, 8]} /><meshBasicMaterial color={SNAP_COLOR} depthTest={false} fog={false} /></mesh>
            : <Line key={i} points={[[a[0], a[1], 0], [b[0], b[1], 0]]} color={SNAP_COLOR} lineWidth={4} depthTest={false} renderOrder={21} fog={false} raycast={NO_RAYCAST} />))}
        </group>
      )}
    </group>
  )
}

/** Arrow keys move along the model axis nearest the screen direction, so → always goes right on screen. */
function screenStep(key: string, camera: THREE.Camera): [number, number] {
  const e = camera.matrixWorld.elements
  // The camera's right vector on the plan (world x, z → model x, -y). OrbitControls never rolls, so it is horizontal.
  let rx = e[0], ry = -e[2]
  const n = Math.hypot(rx, ry) || 1
  rx /= n; ry /= n
  const [vx, vy] = key === 'ArrowRight' ? [rx, ry] : key === 'ArrowLeft' ? [-rx, -ry] : key === 'ArrowUp' ? [-ry, rx] : [ry, -rx]
  return Math.abs(vx) >= Math.abs(vy) ? [Math.sign(vx), 0] : [0, Math.sign(vy)]
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest?.('[role="dialog"]'))
}
const isGizmoHit = (h: THREE.Intersection) => h.object.userData?.towerGizmo === true

/** Real Vancouver only: hands the loaded terrain to the proposal (ghost base, toolbar report). */
function CityGround() {
  const { data } = useCityData()
  useEffect(() => {
    const grids = data?.grids
    useGroundUnder.setState({ under: grids ? (corners) => groundUnder(grids, corners) : null })
    return () => useGroundUnder.setState({ under: null })
  }, [data])
  return null
}

/**
 * One per scene, in the model frame: click to pick or deselect, keyboard (M, R, arrows, [ ], Enter, Esc), editor
 * helpers kept out of captures, and the gizmo itself while Move or Rotate is on (Massing and Schematic only).
 */
export default function TowerGizmo() {
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const placing = useStore((s) => s.placing)
  const ground = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const picked = useTowerEdit((s) => s.picked)
  const proposalFor = useTowerEdit((s) => s.proposal?.id ?? null)
  const move = useTowerEdit((s) => s.move)
  const rotate = useTowerEdit((s) => s.rotate)
  const hidden = useDock((s) => s.hidden)
  const viewing = useViewFromStore((s) => s.looking || s.picking)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const setEvents = useThree((s) => s.setEvents)
  const get = useThree((s) => s.get)
  const t = towers.find((x) => x.id === picked)
  const baseZ = project === 'city' ? ground : 0
  const armed = useRef(false)
  const at = useMemo(() => new THREE.Vector3(), [])

  // The pick goes with its tower (undo of a new tower, removal) and follows the tower selection (Design panel, undo).
  useEffect(() => { if (picked && !t) clearPick() }, [picked, t])
  useEffect(() => { if (proposalFor && !towers.some((x) => x.id === proposalFor)) cancelProposal() }, [proposalFor, towers])
  useEffect(() => useStore.subscribe((s, p) => {
    const e = useTowerEdit.getState()
    if (s.selectedTower !== p.selectedTower && e.picked && e.picked !== s.selectedTower) pickTower(s.selectedTower)
  }), [])
  // The canvas is keyed by project, so a project switch starts with nothing picked. Present ends a drag and a proposal.
  useEffect(() => () => clearPick(), [])
  // Placing in Real Vancouver lines the tower up with the lot under the click: have the lots ready before the click.
  useEffect(() => { if (project === 'city' && placing) void loadLots() }, [project, placing])
  useEffect(() => { if (phase === 'present') { cancelDrag(); cancelProposal() } }, [phase])

  // Gizmo handles win over the tower behind them (they sit inside the podium), so a press on a handle never orbits or picks.
  useEffect(() => {
    const prev = get().events.filter
    setEvents({
      filter: (hits, state) => {
        const h = prev ? prev(hits, state) : hits
        return h.some(isGizmoHit) ? [...h.filter(isGizmoHit), ...h.filter((x) => !isGizmoHit(x))] : h
      },
    })
    return () => setEvents({ filter: prev })
  }, [get, setEvents])

  // Click (not an orbit drag): the nearest thing under the press decides. A tower picks it, anything else deselects;
  // with a move waiting for Confirm, clicks leave the selection alone. Runs after the scene has handled the press, so
  // R3F's hits for it (nearest first, gizmo first) are in place.
  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      setShiftHeld(e.shiftKey)
      if (e.target !== el) return
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
      takeGizmoPress()
    }
    const onClick = (e: MouseEvent) => {
      if (e.target !== el) return
      const start = down
      down = null
      if (takeGizmoPress() || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_PX) return
      const vf = useViewFromStore.getState()
      if (vf.picking || vf.looking || useStore.getState().placing || useTowerEdit.getState().proposal) return
      const id = towerOf(get().internal.initialHits[0])
      if (id) pickTower(id)
      else clearPick()
    }
    const onShift = (e: KeyboardEvent | PointerEvent) => setShiftHeld(e.shiftKey)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onClick)
    window.addEventListener('pointermove', onShift, true)
    window.addEventListener('keydown', onShift, true)
    window.addEventListener('keyup', onShift, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('click', onClick)
      window.removeEventListener('pointermove', onShift, true)
      window.removeEventListener('keydown', onShift, true)
      window.removeEventListener('keyup', onShift, true)
    }
  }, [gl, get])

  // M / R toggle Move / Rotate and L aligns to the lot (picking the selected tower if nothing is picked); arrows and [ ] nudge; Enter confirms
  // a pending move; Esc cancels a drag, then the pending move, then the selection. 1/2/3, P, H, Ctrl+Z/Y/S unchanged.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return
      const s = useTowerEdit.getState()
      if (e.key === 'Escape') {
        if (s.drag) cancelDrag()
        else if (s.proposal) cancelProposal()
        else if (s.picked) clearPick()
        return
      }
      if (e.key === 'Enter') {
        // A focused button handles its own Enter (Cancel must not confirm).
        if (s.proposal && !s.drag && !(e.target as HTMLElement)?.closest?.('button, a')) { e.preventDefault(); confirmProposal() }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'm' || k === 'r' || k === 'l') {
        if (!s.picked) {
          const sel = useStore.getState().selectedTower
          if (!sel) return
          pickTower(sel)
        }
        if (k === 'l') { if (!s.drag) alignToLot(useTowerEdit.getState().picked!) }
        else toggleMode(k === 'm' ? 'move' : 'rotate')
        return
      }
      if (!s.picked || s.drag) return
      if (s.move && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const [dx, dy] = screenStep(e.key, get().camera)
        nudge(s.picked, dx, dy, 0, e.shiftKey)
      } else if (s.rotate && '[]{}'.includes(e.key) && e.key.length === 1) {
        e.preventDefault()
        nudge(s.picked, 0, 0, e.key === ']' || e.key === '}' ? 1 : -1, e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [get])

  // Editor helpers show only on the frame loop's render of the main camera to the canvas.
  useEffect(() => {
    const prev = scene.onBeforeRender
    scene.onBeforeRender = (renderer, sc, camera, geometry, material, group) => {
      prev.call(scene, renderer, sc, camera, geometry, material, group)
      const show = armed.current && camera === get().camera && renderer.getRenderTarget() === null
      armed.current = false
      for (const o of editorRoots) o.visible = show
    }
    setCleanRender(() => gl.render(scene, get().camera))
    return () => {
      scene.onBeforeRender = prev
      setCleanRender(null)
      for (const o of editorRoots) o.visible = true
    }
  }, [gl, scene, get])
  useFrame((state) => {
    armed.current = true
    // Metres per screen pixel at the tower being moved, so edge snapping reaches the same distance at any zoom.
    const s = useTowerEdit.getState(), st = useStore.getState()
    const id = s.drag?.id ?? s.proposal?.id ?? s.picked ?? st.selectedTower
    const tw = st.towers[st.project].find((x) => x.id === id)
    const cam = state.camera as THREE.PerspectiveCamera
    if (!tw || !cam.isPerspectiveCamera) return
    at.set(tw.x, (st.project === 'city' ? st.groundElevation : 0), -tw.y)
    setMetresPerPx((2 * cam.position.distanceTo(at) * Math.tan((cam.fov * DEG) / 2)) / Math.max(1, state.size.height))
  })

  const active = !!t && phase !== 'present' && !hidden && !viewing && (move || rotate) && !(placing && !proposalFor)
  return (
    <>
      {project === 'city' && <CityGround />}
      {active && <Gizmo t={t} baseZ={baseZ} move={move} rotate={rotate} />}
    </>
  )
}

function Gizmo({ t, baseZ, move, rotate }: { t: Tower; baseZ: number; move: boolean; rotate: boolean }) {
  const get = useThree((s) => s.get)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const inv = useMemo(() => new THREE.Matrix4(), [])
  const ray = useMemo(() => new THREE.Ray(), [])
  const frame = useRef<THREE.Group>(null)
  const root = useEditorRoot()
  const tower = useRef(t)
  const base = useRef(baseZ)
  tower.current = t
  base.current = baseZ
  const turn = useRef<{ c: [number, number]; p0: [number, number] } | null>(null)
  const saved = useRef<boolean | null>(null)
  const id = t.id

  // The gizmo sits on the ghost while a move is dragged or waiting for Confirm, else on the tower; aligned with the model axes.
  useFrame(() => {
    const s = useTowerEdit.getState()
    const p = s.drag?.id === id ? s.drag.live : s.proposal?.id === id ? s.proposal.pose : poseOf(tower.current)
    matrix.makeTranslation(p.x, p.y, base.current + LIFT)
  })

  /** Where the pointer ray meets the gizmo's horizontal plane, in the model frame. */
  const planHit = useCallback((): [number, number] | null => {
    const f = frame.current
    if (!f) return null
    ray.copy(get().raycaster.ray).applyMatrix4(inv.copy(f.matrixWorld).invert())
    const dz = ray.direction.z
    if (Math.abs(dz) < 1e-6) return null
    const k = (base.current + LIFT - ray.origin.z) / dz
    return k > 0 ? [ray.origin.x + k * ray.direction.x, ray.origin.y + k * ray.direction.y] : null
  }, [get, inv, ray])

  // Orbit is off while a handle is held (drei does this too); put back what it was.
  const restore = useCallback(() => {
    const c = get().controls as unknown as Controls | null
    if (c && saved.current !== null) c.enabled = saved.current
    saved.current = null
  }, [get])

  const onDragStart = useCallback(({ component, axis }: { component: string; axis: number }) => {
    noteGizmoPress()
    const c = get().controls as unknown as Controls | null
    if (c) {
      if (saved.current === null) saved.current = c.enabled
      c.enabled = false
    }
    const kind: DragKind = component === 'Rotator' ? 'rotate' : component === 'Slider' ? 'xy' : axis === 0 ? 'x' : 'y'
    if (!beginDrag(id, kind)) return
    const from = useTowerEdit.getState().drag!.from
    const p0 = kind === 'rotate' ? planHit() : null
    turn.current = p0 ? { c: [from.x, from.y], p0 } : null
  }, [id, get, planHit])

  // Snapping is computed here, not by drei (its arc rounds to 10° with Shift, where Shift means free in this tool).
  // drei's arrow and plane maths gives the raw target; lib/towerEdit adds site, parcel and grid snapping.
  const onDrag = useCallback((l: THREE.Matrix4) => {
    const s = useTowerEdit.getState(), d = s.drag
    if (!d || d.id !== id) return
    const o = snapOptions()
    if (d.kind === 'rotate') {
      const r = turn.current, p = planHit()
      if (r && p) { const m = turnSnapped(tower.current, d.from, turnDeg(r.c, r.p0, p), { ...o, step: s.rotateStep }); dragTo(m.pose, m.hit) }
    } else {
      // l is the gizmo's matrix after drei's offset from where the drag began, so its translation is the raw target.
      const m = moveSnapped(tower.current, d.from, { x: l.elements[12], y: l.elements[13] }, d.kind, o)
      dragTo(m.pose, m.hit)
    }
  }, [id, planHit])

  const onDragEnd = useCallback(() => { turn.current = null; endDrag(); restore() }, [restore])

  // A handle that goes away mid-drag (toggle off, Present, H) never sees its pointer-up: drop the drag, give orbit back.
  useEffect(() => () => { cancelDrag(); restore() }, [move, rotate, restore])
  // A pointer-up the handle missed (released outside the window, focus lost): finish the drag with what we have.
  useEffect(() => {
    const finish = () => setTimeout(() => { if (useTowerEdit.getState().drag) { endDrag(); restore() } }, 0)
    window.addEventListener('pointerup', finish)
    window.addEventListener('blur', finish)
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('blur', finish) }
  }, [restore])

  return (
    <group ref={frame}>
      <group ref={root}>
        <PivotControls matrix={matrix} autoTransform={false} activeAxes={[true, true, false]} disableScaling
          disableAxes={!move} disableSliders={!move} disableRotations={!rotate}
          fixed scale={GIZMO_PX} lineWidth={GIZMO_LINE} depthTest={false} axisColors={GIZMO_COLORS} hoveredColor={GIZMO_HOVER} userData={GIZMO_TAG}
          onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd} />
      </group>
    </group>
  )
}
