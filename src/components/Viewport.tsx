import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { VTC_NORTH_DEG, isExtruded, useVtcContext, type ContextItem } from '../context'
import { LOOKS, MOTION, type Look } from '../data/stages'
import { stairEnclosure, stairSpots, storeyLoads } from '../engine/egress'
import { liftCheck, type LiftClass } from '../engine/lifts'
import { coreLayout } from '../engine/plan'
import { coreSide, rectCorners, towerFloors } from '../engine/massing'
import { USES, type Tower, type UseId } from '../engine/types'
import { sunPosition, sunVector, vancouverTime } from '../engine/sun'
import { CONES, CONE_PARAMS, bisector, type ConeState } from '../engine/viewCones'
import { useResults } from '../hooks/useResults'
import { CITY_ORIGIN, useStore, useTowers, type Phase, type Representation } from '../store'
import CityContext, { CityLegend } from './CityContext'
import ImportedMass from './ImportedMass'
import Label from './Label'
import ViewFromRig from './ViewFromRig'
import VistaRig from './VistaRig'
import VistaInset from './VistaInset'
import OutriggerFloors from './OutriggerFloors'
import PlanDrawing from './PlanDrawing'
import PublicRealmOverlay from './PublicRealmOverlay'
import EnergyOverlay from './EnergyOverlay'
import WindScreenOverlay from './WindScreenOverlay'
import HiResCapture from './HiResCapture'
import SolarOverlay from './SolarOverlay'
import SolarEnvelopeOverlay from './SolarEnvelopeOverlay'
import RelaxationMasks from './RelaxationMasks'
import { CONE_STYLE } from './ui'

/** Model frame (x, y, z-up) to three.js (y-up). */
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)

type Ctl = { target: THREE.Vector3; update: () => void; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }

/** Massing draws clay; Schematic draws x-ray; Present keeps whichever the user picks. */
function useRep(): Representation {
  const phase = useStore((s) => s.phase)
  const presentRep = useStore((s) => s.presentRep)
  return phase === 'basic' ? 'clay' : phase === 'advanced' ? 'xray' : presentRep
}

// ---------- context geometry ----------
function buildMerged(items: ContextItem[]): THREE.BufferGeometry | null {
  const geoms: THREE.BufferGeometry[] = []
  for (const it of items) {
    let g: THREE.BufferGeometry
    if (isExtruded(it)) {
      if (it.footprint.length < 3 || it.z1 - it.z0 <= 0.01) continue
      const shape = new THREE.Shape(it.footprint.map(([x, y]) => new THREE.Vector2(x, y)))
      g = new THREE.ExtrudeGeometry(shape, { depth: it.z1 - it.z0, bevelEnabled: false })
      g.translate(0, 0, it.z0)
    } else {
      g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(it.positions, 3))
      g.setIndex(it.indices)
    }
    g = g.index ? g.toNonIndexed() : g
    g.deleteAttribute('uv')
    g.computeVertexNormals()
    geoms.push(g)
  }
  return geoms.length ? mergeGeometries(geoms) : null
}

/** Context is solid clay in Massing and see-through in x-ray, so it never hides the tower being studied. */
function ContextMeshes({ items, color, ghost = false }: { items: ContextItem[]; color: string; ghost?: boolean }) {
  const geom = useMemo(() => buildMerged(items), [items])
  if (!geom) return null
  return (
    <mesh geometry={geom} castShadow={!ghost} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.92} metalness={0} transparent opacity={ghost ? 0.45 : 1} depthWrite={!ghost} />
    </mesh>
  )
}

function Ground({ size, color, onPick }: { size: number; color: string; onPick: (x: number, y: number) => void }) {
  return (
    <mesh receiveShadow position={[0, 0, -0.05]} onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPick(e.point.x, -e.point.z) }}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

function VtcScene({ onPick, look, xray }: { onPick: (x: number, y: number) => void; look: Look; xray: boolean }) {
  const { ctx, missing } = useVtcContext()
  const towers = useTowers()
  return (
    <>
      <Ground size={4000} color={look.ground} onPick={onPick} />
      {ctx?.site && (
        <>
          <mesh position={[0, 0, 0.02]} receiveShadow onPointerDown={(e) => { e.stopPropagation(); onPick(e.point.x, -e.point.z) }}>
            <planeGeometry args={[ctx.site.width_m, ctx.site.depth_m]} />
            <meshStandardMaterial color={look.site} />
          </mesh>
          <Line points={[...ctx.site.outline.map(([x, y]) => [x, y, 0.1] as [number, number, number])]} color="#1f5f8b" lineWidth={2.5} />
        </>
      )}
      {ctx?.blocks.map((b, i) => <Line key={`b${i}`} points={b.map(([x, y]) => [x, y, 0.05] as [number, number, number])} color={look.edge} lineWidth={1} />)}
      {ctx?.curbs.map((b, i) => <Line key={`c${i}`} points={b.map(([x, y]) => [x, y, 0.04] as [number, number, number])} color="#cfccc4" lineWidth={1} />)}
      {ctx && <ContextMeshes items={ctx.buildings} color={look.context} ghost={xray} />}
      {ctx && <ContextMeshes items={ctx.heritage} color={look.heritage} ghost={xray} />}
      {ctx && <ContextMeshes items={[...ctx.plazas, ...ctx.midblock]} color="#dfe8dc" />}
      {ctx?.future_towers.filter((f) => f.z1).map((f, i) => (
        <group key={`f${i}`}>
          <mesh position={[0, 0, 0]}>
            <extrudeGeometry args={[new THREE.Shape(f.footprint.map(([x, y]) => new THREE.Vector2(x, y))), { depth: f.z1 as number, bevelEnabled: false }]} />
            <meshStandardMaterial color="#9fb3c8" transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <Label text={`Future tower ${(f.z1 as number).toFixed(1)} m`} position={[f.footprint[0][0], f.footprint[0][1], (f.z1 as number) + 6]} size={0.015} />
        </group>
      ))}
      {ctx?.labels.filter((l) => !['N', 'SITE'].includes(l.text)).map((l, i) => (
        <Label key={`l${i}`} text={l.text} position={[l.at[0], l.at[1], 2]} size={0.014} background={null} color="#6b6f76" bold />
      ))}
      {missing && <Label text="Context model not found: run npm run context:vtc (kept local, never published)" position={[0, -60, 2]} color="#7a4b00" background="rgba(255,243,205,0.95)" />}
      {towers.map((t) => (t.imported ? <ImportedMass key={t.id} t={t} baseZ={0} xray={xray} /> : <TowerMesh key={t.id} t={t} baseZ={0} xray={xray} />))}
      <PublicRealmOverlay />
      <EnergyOverlay />
      <WindScreenOverlay />
      <SolarOverlay />
    </>
  )
}

function coneLocal(ring: [number, number][]) { return ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as [number, number]) }

function ConeWedge({ id, state }: { id: string; state: ConeState | null }) {
  const cone = CONES.find((c) => c.id === id)!
  const ring = useMemo(() => coneLocal(cone.ring), [cone])
  const prm = CONE_PARAMS[id]
  const color = state && state !== 'outside' ? CONE_STYLE[state].color : prm ? '#4f7fae' : '#7d838c'
  const ground = useMemo(() => {
    const s = new THREE.Shape(ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)))
    return new THREE.ShapeGeometry(s)
  }, [ring])
  const sheet = useMemo(() => {
    if (!prm) return null
    const u = bisector(cone)
    const O = cone.ring[0]
    const pts = cone.ring.slice(0, -1).map(([X, Y], i) => {
      const z = i === 0 ? cone.Lv : cone.Lv + prm.k * ((X - O[0]) * u[0] + (Y - O[1]) * u[1])
      return [X - CITY_ORIGIN[0], Y - CITY_ORIGIN[1], z]
    })
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1])
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [cone, prm])
  const active = state && state !== 'outside'
  return (
    <group>
      <mesh geometry={ground} position={[0, 0, 0.2]}>
        <meshBasicMaterial color={color} transparent opacity={active ? 0.35 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={ring.map(([x, y]) => [x, y, 0.3] as [number, number, number])} color={color} lineWidth={active ? 2.5 : 1.5} dashed={!prm} dashSize={40} gapSize={25} />
      {sheet && (
        <mesh geometry={sheet}>
          <meshStandardMaterial color={color} transparent opacity={active ? 0.3 : 0.14} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh position={[ring[0][0], ring[0][1], cone.Lv]}>
        <sphereGeometry args={[12, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {active && (
        <Label text={`${cone.id} · ${cone.name}`} position={[ring[0][0], ring[0][1], cone.Lv + 40]} size={0.016} />
      )}
    </group>
  )
}

function CityScene({ onPick, look, xray }: { onPick: (x: number, y: number) => void; look: Look; xray: boolean }) {
  const towers = useTowers()
  const ground = useStore((s) => s.groundElevation)
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  const checks = cones.find((c) => c.tower.id === sel)?.checks ?? []
  const grid = useMemo(() => {
    const pts: number[] = []
    for (let v = -6000; v <= 6000; v += 500) { pts.push(v, -6000, 0.1, v, 6000, 0.1, -6000, v, 0.1, 6000, v, 0.1) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g
  }, [])
  return (
    <>
      <Ground size={14000} color={look.ground} onPick={onPick} />
      <lineSegments geometry={grid}><lineBasicMaterial color={xray ? '#c9d4df' : '#d6d9de'} /></lineSegments>
      {CONES.map((c) => <ConeWedge key={c.id} id={c.id} state={checks.find((k) => k.cone.id === c.id)?.state ?? null} />)}
      <CityContext look={look} xray={xray} onPick={onPick} />
      <ViewFromRig />
      <VistaRig />
      {towers.map((t) => (t.imported ? <ImportedMass key={t.id} t={t} baseZ={ground} xray={xray} /> : <TowerMesh key={t.id} t={t} baseZ={ground} xray={xray} />))}
      <EnergyOverlay base={ground} />
      <WindScreenOverlay base={ground} />
      <SolarOverlay />
      <SolarEnvelopeOverlay />
      <RelaxationMasks />
    </>
  )
}

// ---------- tower: clay massing or x-ray anatomy ----------
const GAP = 10 // explode gap between zones (m)
const XRAY_OPACITY = 0.18
const CORE_COLOR = '#2b3f55'

let HATCH: THREE.CanvasTexture | null = null
/** Diagonal hatch for plant floors (the drafting convention for service zones). */
function hatchTexture() {
  if (HATCH) return HATCH
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#dde1e6'; g.fillRect(0, 0, 64, 64)
  g.strokeStyle = '#4b5663'; g.lineWidth = 4
  for (let i = -64; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke() }
  HATCH = new THREE.CanvasTexture(c)
  HATCH.wrapS = HATCH.wrapT = THREE.RepeatWrapping
  HATCH.colorSpace = THREE.SRGBColorSpace
  return HATCH
}

interface Zone { use: UseId; z0: number; z1: number; podium: boolean; levels: number[] }
type Anatomy = { plates: boolean; core: boolean; plant: boolean; shell: boolean; lifts: boolean; stairs: boolean }

function ZoneBody({ b, t, xray, selected, anatomy, clip, hatch, core, shellRef, coreRef }: {
  b: Zone; t: Tower; xray: boolean; selected: boolean; anatomy: Anatomy; clip: THREE.Plane[] | null; hatch: THREE.Texture; core: number
  shellRef: (m: THREE.MeshStandardMaterial | null) => void; coreRef: (m: THREE.Mesh | null) => void
}) {
  const w = b.podium ? t.podiumWidth : t.width, d = b.podium ? t.podiumDepth : t.depth, h = b.z1 - b.z0
  const box = useMemo(() => new THREE.BoxGeometry(w, d, h), [w, d, h])
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box])
  const plates = useMemo(() => {
    const c = rectCorners(0, 0, w, d, 0), mid = (b.z0 + b.z1) / 2, pts: number[] = []
    for (const z of [...b.levels, b.z1]) for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; pts.push(p[0], p[1], z - mid, q[0], q[1], z - mid) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g
  }, [w, d, b])
  const coreGeom = useMemo(() => new THREE.BoxGeometry(core, core, h).translate(0, 0, h / 2), [core, h])
  const tint = selected && !xray
  return (
    <>
      <mesh geometry={box} castShadow={!xray} receiveShadow visible={!xray || anatomy.shell}>
        <meshStandardMaterial ref={shellRef} color={USES[b.use].color} roughness={0.75} transparent clippingPlanes={clip}
          emissive={tint ? '#1f5f8b' : '#000000'} emissiveIntensity={tint ? 0.08 : 0} />
      </mesh>
      {b.use === 'mechanical' && (
        <mesh geometry={box} scale={1.004} visible={xray && anatomy.plant}>
          <meshStandardMaterial map={hatch} transparent opacity={0.95} clippingPlanes={clip} />
        </mesh>
      )}
      <lineSegments geometry={edges} visible={xray}><lineBasicMaterial color="#3d5a78" transparent opacity={0.6} clippingPlanes={clip} /></lineSegments>
      <lineSegments geometry={plates} visible={xray ? anatomy.plates : selected}>
        <lineBasicMaterial color={xray ? '#4a6a8c' : '#ffffff'} transparent opacity={xray ? 0.5 : 0.55} clippingPlanes={clip} />
      </lineSegments>
      <mesh ref={coreRef} geometry={coreGeom} position={[0, 0, -h / 2]} visible={false}>
        <meshStandardMaterial color={CORE_COLOR} roughness={0.6} transparent opacity={xray && anatomy.lifts ? 0.32 : 0.88} depthWrite={!(xray && anatomy.lifts)} clippingPlanes={clip} />
      </mesh>
    </>
  )
}

const SHAFT_COLOR: Record<LiftClass, string> = { office: '#3f6690', hotel: '#b98a1e', residential: '#5f8f4a', public: '#8e5ba8' }
const SHUTTLE_COLOR = '#2a8f86'
const STAIR_COLOR = '#c0504d'

/**
 * Exit stairs from the egress check: enclosures at the chosen spots (core corners or plate corners, team assumption), each as wide as the
 * stair must be at that storey, so a busy public floor widens them from there down. Stairs that do not fit stick out.
 */
function ExitStairs({ t, clip, groupRef }: { t: Tower; clip: THREE.Plane[] | null; groupRef: (g: THREE.Group | null) => void }) {
  const egressP = useStore((s) => s.egressPresets)
  const liftP = useStore((s) => s.liftPresets)
  const segs = useMemo(() => {
    const out: { z0: number; z1: number; a: number; b: number }[] = []
    for (const s of storeyLoads(t, egressP, liftP)) {
      const enc = stairEnclosure(s.stairMm, s.f2f, egressP)
      const last = out[out.length - 1]
      if (last && Math.abs(last.a - enc.a) < 1e-6 && Math.abs(last.b - enc.b) < 1e-6) last.z1 = s.z + s.f2f
      else out.push({ z0: s.z, z1: s.z + s.f2f, a: enc.a, b: enc.b })
    }
    return out
  }, [t, egressP, liftP])
  const n = Math.max(2, Math.round(egressP.stairs))
  const unit = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), [])
  return (
    <group ref={groupRef} visible={false}>
      {segs.flatMap((sg, m) => stairSpots(t, n, sg.a, sg.b).map((sp, k) => (
        <mesh key={`${k}-${m}`} geometry={unit} position={[sp.x, sp.y, sg.z0]} scale={[sg.a, sg.b, sg.z1 - sg.z0]}>
          <meshStandardMaterial color={STAIR_COLOR} roughness={0.6} transparent opacity={0.85} clippingPlanes={clip} />
        </mesh>
      )))}
    </group>
  )
}

/**
 * Passenger shafts from the core & lift check, each from its lobby to its rise top plus overrun, laid out by
 * engine/plan.ts (the same layout as the board floor plan): a grid in the core clear of the exit stairs, then the
 * firefighter and service shafts. A rise that starts at a sky lobby reuses the position of a shaft that ended below
 * it, which is how a sky lobby frees core. Shafts that do not fit stick out of the core.
 */
function LiftShafts({ t, clip, groupRef }: { t: Tower; top: number; clip: THREE.Plane[] | null; groupRef: (g: THREE.Group | null) => void }) {
  const presets = useStore((s) => s.liftPresets)
  const egressP = useStore((s) => s.egressPresets)
  const shafts = useMemo(() => {
    const layout = coreLayout(t, liftCheck(t, presets, egressP), presets, egressP)
    return layout.shafts.map((sh) => ({
      ...sh, side: layout.side,
      color: sh.cls === 'service' ? '#8a9096' : sh.cls === 'public' ? SHAFT_COLOR.public : sh.kind === 'shuttle' ? SHUTTLE_COLOR : SHAFT_COLOR[sh.cls],
    }))
  }, [t, presets, egressP])
  const unit = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), [])
  return (
    <group ref={groupRef} visible={false}>
      {shafts.map((sh, i) => (
        <mesh key={i} geometry={unit} position={[sh.x, sh.y, sh.z0]} scale={[sh.side, sh.side, sh.z1 - sh.z0]}>
          <meshStandardMaterial color={sh.color} roughness={0.5} transparent opacity={0.9} clippingPlanes={clip} />
        </mesh>
      ))}
    </group>
  )
}

function TowerMesh({ t, baseZ, xray }: { t: Tower; baseZ: number; xray: boolean }) {
  const selected = useStore((s) => s.selectedTower) === t.id
  const selectTower = useStore((s) => s.selectTower)
  const schematic = useStore((s) => s.phase) === 'advanced'
  const anatomy = useStore((s) => s.anatomy)
  const explode = useStore((s) => s.explode) && schematic
  const section = useStore((s) => s.sectionOn) && schematic
  const sectionLevel = useStore((s) => s.sectionLevel)
  const reduced = useStore((s) => s.reducedMotion)
  const floors = useMemo(() => towerFloors(t), [t])
  // Consecutive floors of one use form a zone; plant floors split zones, which is where the model explodes.
  const zones = useMemo(() => {
    const out: Zone[] = []
    for (const f of floors) {
      const last = out[out.length - 1]
      if (last && last.use === f.use && last.podium === f.podium) { last.z1 = f.z1; last.levels.push(f.z0) }
      else out.push({ use: f.use, z0: f.z0, z1: f.z1, podium: f.podium, levels: [f.z0] })
    }
    return out
  }, [floors])
  const top = floors.length ? floors[floors.length - 1].z1 : 0
  const core = coreSide(t)
  // Section: world y is model z, so keep y <= base + level.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), [])
  plane.constant = baseZ + sectionLevel
  const clip = section ? [plane] : null
  const hatch = useMemo(() => {
    const tx = hatchTexture().clone()
    tx.repeat.set(Math.max(1, t.width / 4), Math.max(1, t.f2f / 4))
    tx.needsUpdate = true
    return tx
  }, [t.width, t.f2f])

  const groups = useRef<(THREE.Group | null)[]>([])
  const shells = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const cores = useRef<(THREE.Mesh | null)[]>([])
  const label = useRef<THREE.Group>(null)
  const shafts = useRef<THREE.Group | null>(null)
  const stairs = useRef<THREE.Group | null>(null)
  const showLifts = xray && anatomy.lifts && !explode
  const showStairs = xray && anatomy.stairs && !explode
  const anim = useRef({ ghost: xray ? 1 : 0, core: xray && anatomy.core ? 1 : 0, explode: explode ? 1 : 0, lifts: showLifts ? 1 : 0, stairs: showStairs ? 1 : 0 })
  useFrame((_, dt) => {
    const a = anim.current
    // Exponential approach; about 4 time constants = the 480 ms stage-in.
    const k = reduced ? 1 : 1 - Math.exp(-dt / (MOTION.stageIn / 4000))
    a.ghost += ((xray ? 1 : 0) - a.ghost) * k
    a.core += ((xray && anatomy.core ? 1 : 0) - a.core) * k
    a.explode += ((explode ? 1 : 0) - a.explode) * k
    a.lifts += ((showLifts ? 1 : 0) - a.lifts) * k
    // Shafts rise out of the lobby, just behind the core.
    if (shafts.current) { shafts.current.scale.z = Math.max(1e-4, a.lifts); shafts.current.visible = a.lifts > 0.001 }
    a.stairs += ((showStairs ? 1 : 0) - a.stairs) * k
    if (stairs.current) { stairs.current.scale.z = Math.max(1e-4, a.stairs); stairs.current.visible = a.stairs > 0.001 }
    zones.forEach((b, i) => {
      const g = groups.current[i]
      if (g) g.position.z = (b.z0 + b.z1) / 2 + a.explode * i * GAP
      const m = shells.current[i]
      if (m) { m.opacity = 1 - (1 - XRAY_OPACITY) * a.ghost; m.depthWrite = m.opacity > 0.98 }
      const c = cores.current[i]
      if (c) { const s = Math.min(1, Math.max(0, (a.core * top - b.z0) / (b.z1 - b.z0))); c.scale.z = Math.max(1e-4, s); c.visible = s > 0.001 }
    })
    if (label.current) label.current.position.z = top + 10 + a.explode * (zones.length - 1) * GAP
  })

  const cut = section && sectionLevel > 0 && sectionLevel < top
  const inPodium = sectionLevel < t.podiumHeight
  const cw = inPodium ? t.podiumWidth : t.width, cd = inPodium ? t.podiumDepth : t.depth
  const cutRing = rectCorners(0, 0, cw, cd, 0)
  return (
    <group position={[t.x, t.y, baseZ]} rotation={[0, 0, (t.rotation * Math.PI) / 180]} onPointerDown={(e) => { e.stopPropagation(); selectTower(t.id) }}>
      {zones.map((b, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g }} position={[0, 0, (b.z0 + b.z1) / 2]}>
          <ZoneBody b={b} t={t} xray={xray} selected={selected} anatomy={anatomy} clip={clip} hatch={hatch} core={core}
            shellRef={(m) => { shells.current[i] = m }} coreRef={(m) => { cores.current[i] = m }} />
        </group>
      ))}
      <LiftShafts t={t} top={top} clip={clip} groupRef={(g) => { shafts.current = g }} />
      <ExitStairs t={t} clip={clip} groupRef={(g) => { stairs.current = g }} />
      <OutriggerFloors t={t} floors={floors} visible={xray && !explode} clip={clip} />
      {xray && !explode && floors.filter((f) => f.skyLobby).map((f) => {
        const isPublic = t.skyRoom?.level === f.level
        return (
          <group key={`sky${f.level}`} position={[0, 0, f.z0 + 0.1]}>
            <mesh><planeGeometry args={[t.width + 4, t.depth + 4]} /><meshBasicMaterial color={isPublic ? SHAFT_COLOR.public : SHUTTLE_COLOR} transparent opacity={isPublic ? 0.45 : 0.35} side={THREE.DoubleSide} depthWrite={false} clippingPlanes={clip} /></mesh>
            <Label text={isPublic ? `Public sky room L${f.level}` : `Sky lobby L${f.level}`} position={[t.width / 2 + 8, 0, 2]} size={0.014} color="#ffffff" background={isPublic ? 'rgba(142,91,168,0.94)' : 'rgba(42,143,134,0.92)'} bold />
          </group>
        )
      })}
      {cut && (
        <group position={[0, 0, sectionLevel]}>
          <mesh><planeGeometry args={[cw * 1.9, cd * 1.9]} /><meshBasicMaterial color="#1d5fa8" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} /></mesh>
          <mesh position={[0, 0, 0.05]}><planeGeometry args={[cw, cd]} /><meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} /></mesh>
          {anatomy.core && <mesh position={[0, 0, 0.1]}><planeGeometry args={[core, core]} /><meshBasicMaterial color={CORE_COLOR} side={THREE.DoubleSide} /></mesh>}
          <Line points={[...cutRing, cutRing[0]].map(([x, y]) => [x, y, 0.15] as [number, number, number])} color="#1d5fa8" lineWidth={2} />
          <Label text={`Section +${sectionLevel.toFixed(0)} m`} position={[cw * 0.95, 0, 4]} size={0.014} />
        </group>
      )}
      <group ref={label} position={[0, 0, top + 10]}>
        <Label text={`${t.name} · ${t.height.toFixed(0)} m`} position={[0, 0, 0]} color="#ffffff" background="rgba(31,35,40,0.88)" size={0.017} bold />
      </group>
    </group>
  )
}

function Sun({ north }: { north: number }) {
  const sun = useStore((s) => s.sun)
  const project = useStore((s) => s.project)
  const light = useRef<THREE.DirectionalLight>(null)
  const { azimuth, altitude } = sunPosition(vancouverTime(sun.month, sun.day, sun.hour))
  const [x, y, z] = sunVector(azimuth, altitude, north)
  const dir = toThree(x, y, z)
  const span = project === 'vtc' ? 700 : 2500
  useEffect(() => {
    if (light.current) { light.current.target.position.set(0, 0, 0); light.current.target.updateMatrixWorld() }
  }, [])
  const up = altitude > 0
  return (
    <directionalLight ref={light} position={dir.clone().multiplyScalar(2500).toArray()} intensity={up ? 2.2 : 0.15} castShadow={up}
      shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.6}
      shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} shadow-camera-near={10} shadow-camera-far={6000} />
  )
}

// ---------- lens: Massing perspective <-> Schematic near-parallel axonometric ----------
const BASE_FOV = 38
const SCHEMATIC_FOV = 6
const ISO_EL = Math.atan(1 / Math.SQRT2) // 35.26 deg, true isometric elevation
interface Tween { t: number; dur: number; f0: number; f1: number; h0: number; h1: number; d0: THREE.Vector3; d1: THREE.Vector3; c0: THREE.Vector3; c1: THREE.Vector3 }
const lens: { tween: Tween | null } = { tween: null }

/**
 * Stage camera move. Entering Schematic is a dolly zoom: the field of view narrows to 6 deg while the camera backs
 * away, so the framed height stays constant and the view flattens into a near-parallel isometric of the selected tower.
 * Leaving reverses it. Grabbing the model interrupts the move; reduced motion makes it instant.
 */
function Lens({ focus, fit, fog }: { focus: [number, number, number]; fit: number; fog: [number, number] }) {
  const phase = useStore((s) => s.phase)
  const reduced = useStore((s) => s.reducedMotion)
  const controls = useThree((s) => s.controls) as unknown as Ctl | null
  const pending = useRef<{ from: Phase; to: Phase } | null>(phase === 'advanced' ? { from: 'basic', to: 'advanced' } : null)
  const last = useRef(phase)
  useEffect(() => {
    if (last.current !== phase) { pending.current = { from: last.current, to: phase }; last.current = phase }
  }, [phase])
  useEffect(() => {
    if (!controls) return
    const stop = () => { lens.tween = null }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])
  useFrame((state, dt) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const ctl = state.controls as unknown as Ctl | null
    const target = ctl?.target ?? new THREE.Vector3()
    if (pending.current && ctl) {
      const { from, to } = pending.current
      pending.current = null
      const off = cam.position.clone().sub(target)
      const dist = off.length() || 1
      const d0 = off.divideScalar(dist)
      const h0 = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
      if (to === 'advanced') {
        // Snap to the nearest of the four isometric quadrants, keeping the user's rough orientation.
        const az = Math.atan2(d0.x, d0.z)
        const q = Math.round((az - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4
        const d1 = new THREE.Vector3(Math.cos(ISO_EL) * Math.sin(q), Math.sin(ISO_EL), Math.cos(ISO_EL) * Math.cos(q))
        lens.tween = { t: 0, dur: MOTION.lensIn, f0: cam.fov, f1: SCHEMATIC_FOV, h0, h1: fit, d0, d1, c0: target.clone(), c1: new THREE.Vector3(...focus) }
      } else if (from === 'advanced') {
        lens.tween = { t: 0, dur: MOTION.lensOut, f0: cam.fov, f1: BASE_FOV, h0, h1: h0, d0, d1: d0.clone(), c0: target.clone(), c1: target.clone() }
      }
    }
    const tw = lens.tween
    if (tw) {
      tw.t += dt * 1000
      const x = reduced ? 1 : Math.min(1, tw.t / tw.dur)
      const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
      cam.fov = THREE.MathUtils.lerp(tw.f0, tw.f1, e)
      const h = THREE.MathUtils.lerp(tw.h0, tw.h1, e)
      const dist = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))
      const c = tw.c0.clone().lerp(tw.c1, e)
      const d = tw.d0.clone().lerp(tw.d1, e).normalize()
      cam.position.copy(c).addScaledVector(d, dist)
      cam.near = Math.max(1, dist / 60)
      cam.far = dist + 40000
      cam.updateProjectionMatrix()
      if (ctl) { ctl.target.copy(c); ctl.update() } else cam.lookAt(c)
      if (x >= 1) lens.tween = null
    }
    // Fog follows the camera distance so far context fades the same way through any lens.
    const f = state.scene.fog
    if (f instanceof THREE.Fog) { const dd = cam.position.distanceTo(target); f.near = dd + fog[0]; f.far = dd + fog[1] }
  })
  return null
}

/** Applies camera requests from the store (presets, "view from protected viewpoint"). */
function CameraRig() {
  const req = useStore((s) => s.cameraRequest)
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: Ctl | null }
  useEffect(() => {
    if (!req) return
    lens.tween = null
    const p = toThree(...req.position), t = toThree(...req.target)
    camera.position.copy(p)
    camera.fov = req.fov ?? BASE_FOV
    camera.near = req.fov && req.fov < 15 ? Math.max(1, p.distanceTo(t) / 60) : 1
    camera.updateProjectionMatrix()
    if (controls) { controls.target.copy(t); controls.update() } else camera.lookAt(t)
  }, [req, camera, controls])
  return null
}

export default function Viewport() {
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const placing = useStore((s) => s.placing)
  const selected = useStore((s) => s.selectedTower)
  const updateTower = useStore((s) => s.updateTower)
  const enabled = useStore((s) => s.enabled)
  const groundElevation = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const rep = useRep()
  const look = LOOKS[rep]
  const xray = rep === 'xray'
  const present = phase === 'present'
  const boardView = useStore((s) => s.boardView)
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const onPick = (x: number, y: number) => { if (placing && selected && !present) updateTower(selected, { x, y }) }
  const sunOn = enabled['built.sun']
  const sel = towers.find((t) => t.id === selected) ?? towers[0]
  const baseZ = project === 'city' ? groundElevation : 0
  const focus = (sel ? toThree(sel.x, sel.y, baseZ + sel.height / 2) : new THREE.Vector3(0, 60, 0)).toArray() as [number, number, number]
  const fog: [number, number] = project === 'vtc' ? [1600, 5100] : [1500, 30000]
  return (
    <div className={`board-frame relative isolate h-full w-full overflow-hidden ${present ? 'bg-paper p-10' : 'p-0'} ${placing ? 'cursor-crosshair' : ''}`}>
      <div className="flex h-full w-full items-center justify-center" style={{ containerType: 'size' }}>
        <div data-viewport className={`relative ${present ? 'crop-marks shadow-[0_12px_40px_rgba(0,0,0,0.28)]' : ''}`}
          style={present ? { width: 'min(100cqw, 141.4cqh)', aspectRatio: '1.414 / 1' } : { width: '100%', height: '100%' }}>
          <Canvas key={project} shadows gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]} resize={{ offsetSize: true }}
            onCreated={({ gl }) => { gl.localClippingEnabled = true }}
            camera={{ position: project === 'vtc' ? [520, 430, 640] : [3200, 5200, 5600], fov: BASE_FOV, near: 1, far: 40000 }}>
            <color attach="background" args={[look.background]} />
            <HiResCapture />
            <fog attach="fog" args={[look.background, 2500, 6000]} />
            <hemisphereLight args={['#ffffff', '#d8d4cc', sunOn ? look.hemi : look.hemi + 0.7]} />
            {sunOn ? <Sun north={north} /> : <directionalLight position={[600, 1200, 400]} intensity={1.1} />}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {project === 'vtc' ? <VtcScene onPick={onPick} look={look} xray={xray} /> : <CityScene onPick={onPick} look={look} xray={xray} />}
            </group>
            <OrbitControls makeDefault target={project === 'vtc' ? [0, 60, 0] : [0, 0, -400]} maxPolarAngle={Math.PI / 2.02} enableDamping />
            <CameraRig />
            <Lens focus={focus} fit={(sel?.height ?? 200) * 1.5} fog={fog} />
          </Canvas>
          {present && boardView === 'plan' ? <PlanDrawing /> : <NorthCompass north={north} />}
          {phase === 'advanced' && sel && <TitleBlock t={sel} />}
        </div>
      </div>
      {project === 'city' && phase === 'basic' && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-sm rounded-md border border-line bg-white/90 p-2 text-[11px] text-slate-600 shadow-sm">
          <b className="text-ink">24 protected view cones</b> (City open data). Blue sheets show estimated height limits; dashed outlines have <b>no estimate yet</b>. Ground, buildings and mountains are real data; see Context layers.
        </div>
      )}
      {project === 'city' && !present && <CityLegend />}
      {project === 'city' && !present && <VistaInset />}
      {present && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-ink">A2 landscape · 594 × 420 mm · the capture is exactly this frame</div>}
      {placing && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">Click the ground to place the selected tower · Esc to stop</div>}
    </div>
  )
}

/** Schematic: a drafting title block that names the drawing and its assumptions. */
function TitleBlock({ t }: { t: Tower }) {
  const presets = useStore((s) => s.liftPresets)
  const egressP = useStore((s) => s.egressPresets)
  const lifts = useMemo(() => liftCheck(t, presets, egressP), [t, presets, egressP])
  const stairMm = useMemo(() => Math.max(...storeyLoads(t, egressP, presets).map((s) => s.stairMm)), [t, presets, egressP])
  const rows: [string, string][] = [
    ['View', 'Isometric, near-parallel'],
    ['Shell', `Ghosted ${Math.round(XRAY_OPACITY * 100)}%`],
    ['Core', `${Math.round(t.coreShare * 1000) / 10}% of plate · ${coreSide(t).toFixed(1)} m sq`],
    ['Plant', t.plantEvery ? `Every ${t.plantEvery} floors` : 'None set'],
    ['Lifts', `${lifts.totalCars} cars, ${lifts.rises.length} groups · core ${lifts.modelledCore + 0.5 >= lifts.requiredMax ? 'fits' : `short ${Math.round(lifts.requiredMax - lifts.modelledCore)} m²`}${t.coreAuto ? ' (auto)' : ''}`],
    ['Stairs', `${Math.max(2, Math.round(egressP.stairs))} × ${Math.round(stairMm)} mm, ${t.stairPlacement === 'perimeter' ? 'at the edges' : t.stairPlacement === 'mixed' ? 'core + edge' : 'in the core'}`],
    ...(lifts.skyLobbies.length ? [['Sky lobby', lifts.skyLobbies.map((f) => `L${f.level}${t.skyRoom?.level === f.level ? ' (public)' : ''}`).join(', ')] as [string, string]] : []),
    ['LOD', '100 · space reservation'],
  ]
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 border border-[#2b3f55]/40 bg-panel/90 font-mono text-[10px] text-[#2b3f55]">
      <div className="border-b border-[#2b3f55]/30 px-2 py-1 font-semibold uppercase tracking-wider">Schematic · x-ray axonometric</div>
      <div className="grid grid-cols-[auto_auto] gap-x-3 px-2 py-1">
        {rows.flatMap(([k, v]) => [<span key={`${k}k`} className="uppercase opacity-70">{k}</span>, <span key={`${k}v`}>{v}</span>])}
      </div>
    </div>
  )
}

function NorthCompass({ north }: { north: number }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-white/85 px-2 py-1.5 text-[10px] text-slate-600 shadow-sm">
      <svg width="28" height="28" viewBox="-14 -14 28 28" style={{ transform: `rotate(${north}deg)` }} aria-hidden>
        <circle r="12" fill="none" stroke="#9aa0a6" />
        <path d="M0 -11 L4 4 L0 1 L-4 4 Z" fill="#1f5f8b" />
      </svg>
      <div>
        <div className="font-semibold text-slate-700">True north {north ? `${north}° from model grid` : '(grid north)'}</div>
        {north !== 0 && <div><span className="font-semibold text-flag-false">False assumption corrected:</span> the file's saved north is the grid</div>}
      </div>
    </div>
  )
}
