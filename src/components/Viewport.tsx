import { Line, OrbitControls } from '@react-three/drei'
import LoadingBar from './LoadingBar'
import ContextPins from './ContextPins'
import { hoverHandlers, useHoverLabels } from '../lib/hoverLabels'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { VTC_NORTH_DEG, useVtcContext } from '../context'
import { LOOKS, MOTION, type Look } from '../data/stages'
import { stairEnclosure, stairSpots, storeyLoads } from '../engine/egress'
import { liftCheck, type LiftClass } from '../engine/lifts'
import { coreLayout } from '../engine/plan'
import { blockSpans, coreSide, rectCorners, spanAt, towerFloors } from '../engine/massing'
import { USES, type Tower, type UseId } from '../engine/types'
import { sunPosition, sunVector, vancouverTime } from '../engine/sun'
import { useStore, useTowers, type Phase, type Representation } from '../store'
import CityContext, { CityLegend } from './CityContext'
import { ShowOverlaysButton, ViewportDock, useDock, useOverlayLook, useOverlayShortcut } from './ViewportDock'
import ImportedMass from './ImportedMass'
import ModelOverlay from './import/ModelOverlay'
import { ConeOverlays } from './ConeVolumes'
import Label from './Label'
import { useResults } from '../hooks/useResults'
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
import TowerGizmo, { TowerMover, outlineSegments } from './TowerGizmo'
import TowerToolbar from './TowerToolbar'
import MassingEdit3D from './MassingEdit3D'
import TowerPosition3D from './TowerPosition3D'
import Help from './Help'
import MassingEditReadout from './MassingEditReadout'
import { proposePlace, useTowerEdit } from '../lib/towerEdit'
import CameraClamp from './CameraClamp'
import { BvhWarmup, eventsWithoutWheel, installFastRaycast } from '../lib/fastRaycast'
import { RenderPacer, canvasFrameloop } from '../lib/renderPacer'
import PlinthBase from './Plinth'
import { VtcBaseModelPanel, VtcContextCard } from './VtcBaseModel'
import VtcBriefSite from './VtcBriefSite'
import { PlainEnvironment, VtcContextModel, VtcLookBar, vtcSceneLook, type VtcLookId } from './VtcLook'
import ViewGuard from './ViewGuard'
import { BRIEF_SITE, useVtcSource } from '../lib/vtcContextSource'
import { MAX_POLAR, MIN_DISTANCE, polarOf, registerGround, sceneGround, sightTarget } from '../lib/cameraClamp'
import { CITY_PLINTH, SEA_Z, plinthRing, vtcPlinth, type Plinth } from '../lib/plinth'
import { groundThickness } from '../engine/basement'
import BelowGrade from './BelowGrade'
import { VISTA_LOOK, VISTA_OVERVIEW, useVistaLook, vistaShaded } from '../lib/vistaLook'
import { MODEL, STATUS, UI } from '../lib/design/tokens'
import { NEUTRAL_TOWER, useDisplayMode } from '../lib/displayMode'
import { useModeColours } from '../lib/displayModeHooks'
import { useDisplaySync } from './DisplayMode'
import { useViewFromStore } from '../lib/viewFromStore'
import { casterSignature, signatureChanged } from '../lib/shadowCache'
import { useSceneStyle } from '../lib/sceneStyle'
import { cancelFlight, VistaChrome, VistaLookRig } from './VistaLook'
import { SitePlaceLabels } from './site/PlaceNames'
import NorthTurnRig from './NorthTurnRig'
import { faceNorth, northView } from '../lib/northView'

// Indexed pointer picking for the large city and terrain meshes (lib/fastRaycast.ts; clicks took 280+ ms without it).
installFastRaycast()

/** Model frame (x, y, z-up) to three.js (y-up). */
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)

type Ctl = { target: THREE.Vector3; maxPolarAngle: number; update: () => void; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }

/** Massing draws clay; Schematic draws x-ray; Present keeps whichever the user picks. */
function useRep(): Representation {
  const phase = useStore((s) => s.phase)
  const presentRep = useStore((s) => s.presentRep)
  return phase === 'basic' ? 'clay' : phase === 'advanced' ? 'xray' : presentRep
}

/**
 * The flat top of the site model's base (the street level at the competition site, the sea in Real Vancouver); clicks on
 * it place towers. In Vista's Plain look (Real Vancouver) the sea takes Vista's water shading (lib/vistaLook.ts).
 */
function Ground({ rect, color, onPick, vista = false }: { rect: Plinth; color: string; onPick: (x: number, y: number) => void; vista?: boolean }) {
  const water = useMemo(() => (vista ? vistaShaded(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }), 'water') : null), [vista, color])
  useEffect(() => () => water?.dispose(), [water])
  const at: [number, number, number] = [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2, SEA_Z]
  const pick = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onPick(e.point.x, -e.point.z) }
  // Separate keys: switching a mesh between a material prop and a child material leaves three's default material (R3F).
  if (water) return <mesh key="vista" receiveShadow position={at} material={water} onPointerDown={pick}><planeGeometry args={[rect.x1 - rect.x0, rect.y1 - rect.y0]} /></mesh>
  return (
    <mesh key="plain" receiveShadow position={at} onPointerDown={pick}>
      <planeGeometry args={[rect.x1 - rect.x0, rect.y1 - rect.y0]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

function VtcScene({ onPick, look: stageLook, xray }: { onPick: (x: number, y: number) => void; look: Look; xray: boolean }) {
  const { ctx } = useVtcContext()
  // The display mode (lib/displayMode.ts): Program draws the buildings in their ground-level use (components/VtcLook),
  // every other mode the neutral model.
  const lookId: VtcLookId = useModeColours().context === 'use' ? 'program' : 'plain'
  const look = useMemo(() => vtcSceneLook(stageLook, lookId, xray), [stageLook, lookId, xray])
  // Without the base model (another computer, before the entrant adds their copy): the brief's block is the site.
  const site = ctx?.site ?? BRIEF_SITE
  const towers = useTowers()
  // A physical-model base the size of the context model; the camera stays above its flat street level (0 m).
  // A thick ground (at least 30 m, 10 m under the deepest basement) that basements are dug into (engine/basement.ts).
  const thickness = useMemo(() => groundThickness(towers), [towers])
  const plinth = useMemo(() => vtcPlinth(ctx, 20, thickness), [ctx, thickness])
  const ring = useMemo(() => plinthRing(plinth, () => SEA_Z), [plinth])
  const contextShown = useDisplayMode((s) => s.context)
  useEffect(() => registerGround({ at: () => 0, plinth }), [plinth])
  return (
    <>
      <Ground rect={plinth} color={look.ground} onPick={onPick} />
      <PlinthBase plinth={plinth} ring={ring} look={look} pad={0.1} />
      {site && (
        <>
          <mesh name="vtc-site" position={[0, 0, 0.02]} receiveShadow onPointerDown={(e) => { e.stopPropagation(); onPick(e.point.x, -e.point.z) }}>
            <planeGeometry args={[site.width_m, site.depth_m]} />
            <meshStandardMaterial color={look.site} />
          </mesh>
          {/* The site boundary: a constraint, drawn as a clear dark line (blue is kept for selection). */}
          <Line points={[...site.outline.map(([x, y]) => [x, y, 0.1] as [number, number, number])]} color={UI.ink} lineWidth={2} transparent opacity={0.75} />
        </>
      )}
      {!ctx && <VtcBriefSite />}
      {ctx?.blocks.map((b, i) => <Line key={`b${i}`} points={b.map(([x, y]) => [x, y, 0.05] as [number, number, number])} color={look.edge} lineWidth={1} />)}
      {ctx?.curbs.map((b, i) => <Line key={`c${i}`} points={b.map(([x, y]) => [x, y, 0.04] as [number, number, number])} color={CURB} lineWidth={1} />)}
      {ctx && contextShown && <VtcContextModel ctx={ctx} look={look} id={lookId} xray={xray} />}
      {/* The neutral inspection light with restrained soft shadows, in every mode (the sun preview replaces its key). */}
      {!xray && <PlainEnvironment />}
      {contextShown && ctx?.future_towers.filter((f) => f.z1).map((f, i) => (
        <group key={`f${i}`}>
          <mesh position={[0, 0, 0]} {...hoverHandlers(`future-${i}`)}>
            <extrudeGeometry args={[new THREE.Shape(f.footprint.map(([x, y]) => new THREE.Vector2(x, y))), { depth: f.z1 as number, bevelEnabled: false }]} />
            <meshStandardMaterial color={FUTURE} transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <Label text={`Future tower ${(f.z1 as number).toFixed(1)} m`} position={[f.footprint[0][0], f.footprint[0][1], (f.z1 as number) + 6]} size={0.015} hoverKey={`future-${i}`} />
        </group>
      ))}
      {ctx?.labels.filter((l) => !['N', 'SITE'].includes(l.text)).map((l, i) => (
        <Label key={`l${i}`} text={l.text} position={[l.at[0], l.at[1], 2]} size={0.014} background={null} color="#6b6f76" bold quiet />
      ))}
      {towers.map((t) => <TowerMover key={t.id} t={t} baseZ={0}>{t.imported ? <ImportedMass t={t} baseZ={0} xray={xray} /> : <TowerMesh t={t} baseZ={0} xray={xray} />}</TowerMover>)}
      <ModelOverlay base={0} xray={xray} />
      <PublicRealmOverlay />
      <EnergyOverlay />
      <WindScreenOverlay />
      <SolarOverlay />
    </>
  )
}

function CityScene({ onPick, look, xray }: { onPick: (x: number, y: number) => void; look: Look; xray: boolean }) {
  const towers = useTowers()
  const ground = useStore((s) => s.groundElevation)
  const grid = useMemo(() => {
    const pts: number[] = []
    for (let v = -6000; v <= 6000; v += 500) { pts.push(v, -6000, 0.1, v, 6000, 0.1, -6000, v, 0.1, 6000, v, 0.1) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g
  }, [])
  const vista = look === VISTA_LOOK
  return (
    <>
      <Ground rect={CITY_PLINTH} color={look.water} onPick={onPick} vista={vista} />
      {/* Vista's water has no grid; the 500 m grid stays in the other looks. */}
      {!vista && <lineSegments geometry={grid}><lineBasicMaterial color={xray ? '#c9d4df' : '#d6d9de'} /></lineSegments>}
      <VistaLookRig />
      {/* View cones: drawn as Vista draws them in CityContext (components/VistaCones.tsx), replacing the flat wedges and Lv spheres. */}
      <CityContext look={look} xray={xray} onPick={onPick} />
      <ViewFromRig />
      <VistaRig />
      {towers.map((t) => <TowerMover key={t.id} t={t} baseZ={ground}>{t.imported ? <ImportedMass t={t} baseZ={ground} xray={xray} /> : <TowerMesh t={t} baseZ={ground} xray={xray} vista={vista} />}</TowerMover>)}
      <ModelOverlay base={ground} xray={xray} />
      <ConeOverlays base={ground} xray={xray} />
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
/** Curb lines on the competition ground: a step lighter than the block lines (the MODEL.ground family). */
const CURB = '#cfd5dc'
/** Approved future towers in the competition context: translucent, a cool grey a shade off the existing model. */
const FUTURE = '#a9b4c2'
const NO_RAYCAST = () => null
/** Dark plate for the design towers' names (UI ink), so they stand apart from the light context labels. */
const INK_PLATE = 'rgba(32,38,48,0.9)'

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

/** A run of floors of one use inside one stacked block; w, d, dx, dy and rot are the block's, in the tower frame. */
interface Zone { use: UseId; z0: number; z1: number; podium: boolean; levels: number[]; block: number; w: number; d: number; dx: number; dy: number; rot: number }
type Anatomy = { plates: boolean; core: boolean; plant: boolean; shell: boolean; lifts: boolean; stairs: boolean }

function ZoneBody({ b, t, xray, floorLines, anatomy, clip, hatch, core, shellRef, coreRef, fill, vista = false }: {
  b: Zone; t: Tower; xray: boolean; floorLines: boolean; anatomy: Anatomy; clip: THREE.Plane[] | null; hatch: THREE.Texture; core: number
  shellRef: (m: THREE.MeshStandardMaterial | null) => void; coreRef: (m: THREE.Mesh | null) => void
  /** The zone's surface colour from the display mode: the neutral proposal, or its use (lib/displayMode.ts). */
  fill: string
  /** Real Vancouver's Plain look: shaded exactly as the buildings around it (lib/vistaLook.ts), so "lighter than the
   *  context" holds on screen and not only in the tokens (under the scene's lights and tone mapping it did not). */
  vista?: boolean
}) {
  const w = b.w, d = b.d, h = b.z1 - b.z0
  // The core stays on the tower centre through shifted and twisted blocks: undo the block's offset and turn.
  const ra = (-b.rot * Math.PI) / 180, coreAt: [number, number] = [-(b.dx * Math.cos(ra) - b.dy * Math.sin(ra)), -(b.dx * Math.sin(ra) + b.dy * Math.cos(ra))]
  const box = useMemo(() => new THREE.BoxGeometry(w, d, h), [w, d, h])
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box])
  const plates = useMemo(() => {
    const c = rectCorners(0, 0, w, d, 0), mid = (b.z0 + b.z1) / 2, pts: number[] = []
    for (const z of [...b.levels, b.z1]) for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; pts.push(p[0], p[1], z - mid, q[0], q[1], z - mid) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g
  }, [w, d, b])
  const coreGeom = useMemo(() => new THREE.BoxGeometry(core, core, h).translate(0, 0, h / 2), [core, h])
  const shaded = vista && !xray
  const vistaMat = useMemo(() => (shaded ? vistaShaded(new THREE.MeshStandardMaterial({ color: fill, roughness: 0.9, metalness: 0, transparent: true, clippingPlanes: clip }), 'buildings') : null), [shaded, fill, clip])
  useEffect(() => { if (vistaMat) shellRef(vistaMat); return () => vistaMat?.dispose() }, [vistaMat]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {/* Matte, and never tinted by selection: the selection is an outline (TowerGizmo), so the surface keeps the mode's
          own colour, analytical colours included. */}
      {/* Separate keys: switching a mesh between a material prop and a child material leaves three's default material (R3F). */}
      {vistaMat
        ? <mesh key="vista" geometry={box} material={vistaMat} castShadow receiveShadow />
        : <mesh key="lit" geometry={box} castShadow={!xray} receiveShadow visible={!xray || anatomy.shell}>
            <meshStandardMaterial ref={shellRef} color={fill} roughness={0.9} metalness={0} transparent clippingPlanes={clip} />
          </mesh>}
      {b.use === 'mechanical' && (
        <mesh geometry={box} scale={1.004} visible={xray && anatomy.plant}>
          <meshStandardMaterial map={hatch} transparent opacity={0.95} clippingPlanes={clip} />
        </mesh>
      )}
      <lineSegments geometry={edges} visible={xray}><lineBasicMaterial color="#3d5a78" transparent opacity={0.6} clippingPlanes={clip} /></lineSegments>
      <lineSegments geometry={plates} visible={xray ? anatomy.plates : floorLines}>
        <lineBasicMaterial color={xray ? '#4a6a8c' : '#ffffff'} transparent opacity={xray ? 0.5 : 0.55} clippingPlanes={clip} />
      </lineSegments>
      <mesh ref={coreRef} geometry={coreGeom} position={[coreAt[0], coreAt[1], -h / 2]} rotation={[0, 0, ra]} visible={false}>
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

function TowerMesh({ t, baseZ, xray, vista = false }: { t: Tower; baseZ: number; xray: boolean; vista?: boolean }) {
  const selected = useStore((s) => s.selectedTower) === t.id
  const selectTower = useStore((s) => s.selectTower)
  const schematic = useStore((s) => s.phase) === 'advanced'
  // The display mode decides the surface: one neutral proposal (Massing, Analysis, Materials) or each floor in its use.
  const byUse = useModeColours().tower === 'use'
  // Readable edges on the solid model: every stacked block's outline (not the use zones, which Massing does not show).
  const massEdges = useMemo(() => outlineSegments(t), [t])
  const planMode = useVistaLook((s) => s.mode === 'plan')
  const planView = planMode && useStore.getState().project === 'city'
  // Analysis off (process rail): no verdict on the tower.
  const analysis = useStore((s) => s.analysis)
  const coneChecks = useResults().cones.find((r) => r.tower.id === t.id)?.checks
  const over = useMemo(() => {
    if (!analysis) return null
    const worst = (coneChecks ?? []).filter((c) => c.state === 'above' && c.exceed !== null).sort((a, b) => b.exceed! - a.exceed!)[0]
    return worst ? `${worst.exceed!.toFixed(1)} m over view ${worst.cone.id} (±${worst.param?.u95 ?? 0} m)` : null
  }, [coneChecks, analysis])
  const anatomy = useStore((s) => s.anatomy)
  const explode = useStore((s) => s.explode) && schematic
  const section = useStore((s) => s.sectionOn) && schematic
  const sectionLevel = useStore((s) => s.sectionLevel)
  const reduced = useStore((s) => s.reducedMotion)
  const floors = useMemo(() => towerFloors(t), [t])
  // Consecutive floors of one use form a zone; plant floors split zones, which is where the model explodes.
  const spans = useMemo(() => blockSpans(t), [t])
  const zones = useMemo(() => {
    const out: Zone[] = []
    for (const f of floors) {
      const sp = spanAt(spans, (f.z0 + f.z1) / 2)
      const blk = sp?.block, bi = sp?.index ?? 0
      const last = out[out.length - 1]
      if (last && last.use === f.use && last.podium === f.podium && last.block === bi) { last.z1 = f.z1; last.levels.push(f.z0) }
      else out.push({ use: f.use, z0: f.z0, z1: f.z1, podium: f.podium, levels: [f.z0], block: bi, w: blk?.width ?? t.width, d: blk?.depth ?? t.depth, dx: blk?.dx ?? 0, dy: blk?.dy ?? 0, rot: blk?.rotation ?? 0 })
    }
    return out
  }, [floors, spans, t.width, t.depth])
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
  const ring = useRef<THREE.Group>(null)
  const ringPts = useMemo(() => Array.from({ length: 65 }, (_, i) => [Math.cos((i / 64) * 2 * Math.PI), Math.sin((i / 64) * 2 * Math.PI), 0] as [number, number, number]), [])
  const shafts = useRef<THREE.Group | null>(null)
  const stairs = useRef<THREE.Group | null>(null)
  const showLifts = xray && anatomy.lifts && !explode
  const showStairs = xray && anatomy.stairs && !explode
  const anim = useRef({ ghost: xray ? 1 : 0, core: xray && anatomy.core ? 1 : 0, explode: explode ? 1 : 0, lifts: showLifts ? 1 : 0, stairs: showStairs ? 1 : 0 })
  useFrame((state, dt) => {
    const a = anim.current
    // Exponential approach; about 4 time constants = the 480 ms stage-in. The view draws on demand
    // (lib/renderPacer.tsx): the first frame after a pause gets a long dt, so it is capped, and the easing asks for
    // the next frame until it settles.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) / (MOTION.stageIn / 4000))
    const before = a.ghost + a.core + a.explode + a.lifts + a.stairs
    a.ghost += ((xray ? 1 : 0) - a.ghost) * k
    a.core += ((xray && anatomy.core ? 1 : 0) - a.core) * k
    a.explode += ((explode ? 1 : 0) - a.explode) * k
    a.lifts += ((showLifts ? 1 : 0) - a.lifts) * k
    // Shafts rise out of the lobby, just behind the core.
    if (shafts.current) { shafts.current.scale.z = Math.max(1e-4, a.lifts); shafts.current.visible = a.lifts > 0.001 }
    a.stairs += ((showStairs ? 1 : 0) - a.stairs) * k
    if (stairs.current) { stairs.current.scale.z = Math.max(1e-4, a.stairs); stairs.current.visible = a.stairs > 0.001 }
    if (Math.abs(a.ghost + a.core + a.explode + a.lifts + a.stairs - before) > 1e-4) state.invalidate()
    zones.forEach((b, i) => {
      const g = groups.current[i]
      if (g) g.position.z = (b.z0 + b.z1) / 2 + a.explode * i * GAP
      const m = shells.current[i]
      if (m) { m.opacity = 1 - (1 - XRAY_OPACITY) * a.ghost; m.depthWrite = m.opacity > 0.98 }
      const c = cores.current[i]
      if (c) { const s = Math.min(1, Math.max(0, (a.core * top - b.z0) / (b.z1 - b.z0))); c.scale.z = Math.max(1e-4, s); c.visible = s > 0.001 }
    })
    if (label.current) {
      label.current.position.z = top + 10 + a.explode * (zones.length - 1) * GAP
      // Plan looks straight down: the name sits just south of the footprint on screen (about 18 px clear of it), so it
      // never covers the tower it names. Elsewhere it floats above the top.
      if (planView) {
        const cam = state.camera as THREE.PerspectiveCamera
        const mpp = (2 * Math.max(1, cam.position.y - (baseZ + top)) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / Math.max(1, state.size.height)
        // The plan marker: a ring 12 px clear of the footprint at any scale.
        if (ring.current) ring.current.scale.setScalar(Math.hypot(t.width, t.depth) / 2 + 12 * mpp)
        // World south (0, -off) in the tower's turned frame: rotate by minus the tower's rotation.
        const off = Math.hypot(t.width, t.depth) / 2 + 18 * mpp, r = (-t.rotation * Math.PI) / 180
        label.current.position.x = off * Math.sin(r)
        label.current.position.y = -off * Math.cos(r)
      } else { label.current.position.x = 0; label.current.position.y = 0 }
    }
  })

  const cut = section && sectionLevel > 0 && sectionLevel < top
  // The cut shows the block at the section level.
  const cutBlock = spanAt(spans, sectionLevel)?.block
  const cw = cutBlock?.width ?? t.width, cd = cutBlock?.depth ?? t.depth
  const cutRing = rectCorners(cutBlock?.dx ?? 0, cutBlock?.dy ?? 0, cw, cd, cutBlock?.rotation ?? 0)
  return (
    <group position={[t.x, t.y, baseZ]} rotation={[0, 0, (t.rotation * Math.PI) / 180]} onPointerDown={(e) => { e.stopPropagation(); selectTower(t.id) }}>
      {zones.map((b, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g }} position={[b.dx, b.dy, (b.z0 + b.z1) / 2]} rotation={[0, 0, (b.rot * Math.PI) / 180]}>
          <ZoneBody b={b} t={t} xray={xray} floorLines={byUse} anatomy={anatomy} clip={clip} hatch={hatch} core={core} fill={byUse ? USES[b.use].color : NEUTRAL_TOWER.fill} vista={vista}
            shellRef={(m) => { shells.current[i] = m }} coreRef={(m) => { cores.current[i] = m }} />
        </group>
      ))}
      {!xray && massEdges.length > 1 && <Line points={massEdges} segments color={NEUTRAL_TOWER.edge} lineWidth={1.25} transparent opacity={0.9} clippingPlanes={clip ?? []} raycast={NO_RAYCAST} />}
      <LiftShafts t={t} top={top} clip={clip} groupRef={(g) => { shafts.current = g }} />
      <ExitStairs t={t} clip={clip} groupRef={(g) => { stairs.current = g }} />
      <OutriggerFloors t={t} floors={floors} visible={xray && !explode} clip={clip} />
      {xray && !explode && floors.filter((f) => f.skyLobby).map((f) => {
        const isPublic = t.skyRoom?.level === f.level
        const sb = spanAt(spans, (f.z0 + f.z1) / 2)?.block
        return (
          <group key={`sky${f.level}`} position={[sb?.dx ?? 0, sb?.dy ?? 0, f.z0 + 0.1]} rotation={[0, 0, ((sb?.rotation ?? 0) * Math.PI) / 180]}>
            <mesh><planeGeometry args={[(sb?.width ?? t.width) + 4, (sb?.depth ?? t.depth) + 4]} /><meshBasicMaterial color={isPublic ? SHAFT_COLOR.public : SHUTTLE_COLOR} transparent opacity={isPublic ? 0.45 : 0.35} side={THREE.DoubleSide} depthWrite={false} clippingPlanes={clip} /></mesh>
            <Label text={isPublic ? `Public sky room L${f.level}` : `Sky lobby L${f.level}`} position={[(sb?.width ?? t.width) / 2 + 8, 0, 2]} size={0.014} color="#ffffff" background={isPublic ? 'rgba(142,91,168,0.94)' : 'rgba(34,117,110,0.92)'} bold />
          </group>
        )
      })}
      {cut && (
        <group position={[0, 0, sectionLevel]}>
          <group position={[cutBlock?.dx ?? 0, cutBlock?.dy ?? 0, 0]} rotation={[0, 0, ((cutBlock?.rotation ?? 0) * Math.PI) / 180]}>
            <mesh><planeGeometry args={[cw * 1.9, cd * 1.9]} /><meshBasicMaterial color="#1d5fa8" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} /></mesh>
            <mesh position={[0, 0, 0.05]}><planeGeometry args={[cw, cd]} /><meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} /></mesh>
          </group>
          {anatomy.core && <mesh position={[0, 0, 0.1]}><planeGeometry args={[core, core]} /><meshBasicMaterial color={CORE_COLOR} side={THREE.DoubleSide} /></mesh>}
          <Line points={[...cutRing, cutRing[0]].map(([x, y]) => [x, y, 0.15] as [number, number, number])} color="#1d5fa8" lineWidth={2} />
          <Label text={`Section +${sectionLevel.toFixed(0)} m`} position={[cw * 0.95, 0, 4]} size={0.014} />
        </group>
      )}
      {/* Plan (Real Vancouver): a ring round the selected tower, drawn over everything so it is found at any scale; the
          selection blue on its white keyline, as the 3D outline. */}
      {planView && selected && (
        <group ref={ring} position={[0, 0, top + 2]}>
          <Line points={ringPts} color={MODEL.keyline} lineWidth={6} transparent opacity={0.95} depthTest={false} renderOrder={20} />
          <Line points={ringPts} color={MODEL.selected} lineWidth={2.5} transparent opacity={1} depthTest={false} renderOrder={21} />
        </group>
      )}
      <group ref={label} position={[0, 0, top + 10]}>
        {/* Plan: both hang below the anchor (which sits just south of the footprint), name first and the tag under it, clear of the ring. */}
        <Label text={`${t.name} · ${t.height.toFixed(0)} m`} position={[0, 0, 0]} color="#ffffff" background={INK_PLATE} size={0.017} bold hoverKey={t.id} lift={planView ? -(0.004 + 0.017) : over ? 0.021 : 0.004} />
        {/* The worst view-cone overshoot, both above the tower so they never cover it (UI review, 3 Nov: the separate tag at the limit collided with the name
            and could not be read from afar; that tag now only shows up close, ConeVolumes.tsx). */}
        {over && <Label text={over} position={[0, 0, 0]} color="#ffffff" background={STATUS.error.fg} size={0.015} bold lift={planView ? -(0.021 + 0.002 + 0.015) : 0.004} />}
      </group>
    </group>
  )
}

/** Light colours and strengths: a white sky over a cool neutral bounce (no warm cast on the grey model). */
const LIGHT = { sky: '#ffffff', bounce: '#d9dee7', inspectionLift: 0.35, inspectionKey: 1.25 } as const

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
      tw.t += Math.min(dt, 0.05) * 1000 // capped: the first frame after a pause (render on demand) has a long dt
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
      else state.invalidate() // next frame of the move
    }
    // Fog follows the camera distance so far context fades the same way through any lens.
    const f = state.scene.fog
    if (f instanceof THREE.Fog) { const dd = cam.position.distanceTo(target); f.near = dd + fog[0]; f.far = dd + fog[1] }
  })
  return null
}

/**
 * Re-renders the sun's shadow map only when the light or a shadow caster changes (lib/shadowCache.ts): a 4096 x 4096 map
 * cost 10-11 ms a frame on the team laptop, and orbiting never changes it.
 */
function ShadowCache() {
  const gl = useThree((s) => s.gl)
  const last = useRef<number[] | null>(null)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => { gl.shadowMap.autoUpdate = true }
  }, [gl])
  useFrame(({ scene }) => {
    // This runs before the render updates the world matrices: update them now, so a moved tower is seen this frame.
    scene.updateMatrixWorld()
    const sig = casterSignature(scene)
    if (signatureChanged(last.current, sig)) { gl.shadowMap.needsUpdate = true; last.current = sig }
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
    cancelFlight()
    // A target inside the ground (behind a hill) slides back along the line of sight: same eye, same view.
    const aim = sightTarget(req.position, req.target, sceneGround.at)
    const p = toThree(...req.position), t = toThree(...aim)
    camera.position.copy(p)
    camera.fov = req.fov ?? BASE_FOV
    camera.near = req.fov && req.fov < 15 ? Math.max(1, p.distanceTo(t) / 60) : 1
    camera.updateProjectionMatrix()
    // An eye-level preset may look up at its target: the orbit starts from there, and CameraClamp eases the limit back.
    if (controls) { controls.maxPolarAngle = Math.max(MAX_POLAR, polarOf(req.position, aim) + 1e-6); controls.target.copy(t); controls.update() } else camera.lookAt(t)
  }, [req, camera, controls])
  return null
}

export default function Viewport() {
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const looking = useViewFromStore((s) => s.looking)
  const placing = useStore((s) => s.placing)
  // With a tower picked, its toolbar says how to place it (the floating hint would sit on top of the toolbar).
  const picked = useTowerEdit((s) => !!s.picked)
  const selected = useStore((s) => s.selectedTower)
  // Only the sun switch matters here; each overlay reads its own switch. Reading the whole map re-rendered the 3D scene
  // and the dock on every node switch. Deferred, so the switch itself flips at once (mouse response, 4 Nov).
  const sunOn = useDeferredValue(useStore((s) => !!s.enabled['built.sun']))
  const groundElevation = useStore((s) => s.groundElevation)
  const towers = useTowers()
  const rep = useRep()
  // Real Vancouver in clay and the Plain style takes Vista's Plain look (lib/vistaLook.ts); x-ray and Context keep theirs.
  const style = useSceneStyle((s) => s.style)
  const look = project === 'city' && rep === 'clay' && style === 'plain' ? VISTA_LOOK : LOOKS[rep]
  const xray = rep === 'xray'
  const present = phase === 'present'
  const boardView = useStore((s) => s.boardView)
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  // A click while placing proposes the spot (ghost + checks); the toolbar's Confirm moves the tower (Vista v10.1).
  const onPick = (x: number, y: number) => { if (placing && selected && !present) proposePlace(selected, x, y) }
  const sel = towers.find((t) => t.id === selected) ?? towers[0]
  const baseZ = project === 'city' ? groundElevation : 0
  const focus = (sel ? toThree(sel.x, sel.y, baseZ + sel.height / 2) : new THREE.Vector3(0, 60, 0)).toArray() as [number, number, number]
  const fog: [number, number] = project === 'vtc' ? [1600, 5100] : [1500, 30000]
  const hidden = useDock((s) => s.hidden)
  const dockOpen = useDock((s) => (project === 'city' ? s.menu : s.open))
  useOverlayShortcut()
  // The display mode and the older switches it absorbed stay in step (components/DisplayMode.tsx).
  useDisplaySync()
  return (
    <div className={`board-frame relative isolate h-full w-full overflow-hidden ${present ? 'bg-paper p-10' : 'p-0'} ${placing ? 'cursor-crosshair' : ''}`}>
      <div className="flex h-full w-full items-center justify-center" style={{ containerType: 'size' }}>
        <div data-viewport onPointerEnter={() => useHoverLabels.getState().setInView(true)} onPointerLeave={() => useHoverLabels.getState().setInView(false)} className={`relative ${present ? 'crop-marks shadow-[0_12px_40px_rgba(0,0,0,0.28)]' : ''}`}
          style={present ? { width: 'min(100cqw, 141.4cqh)', aspectRatio: '1.414 / 1' } : { width: '100%', height: '100%' }}>
          <ViewGuard>
          <Canvas key={project} shadows gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={[1, 2]} resize={{ offsetSize: true }} events={eventsWithoutWheel} frameloop={canvasFrameloop()}
            onCreated={({ gl }) => { gl.localClippingEnabled = true }}
            camera={{ position: project === 'vtc' ? [520, 430, 640] : toThree(...VISTA_OVERVIEW.position).toArray(), fov: project === 'vtc' ? BASE_FOV : VISTA_OVERVIEW.fov, near: 1, far: 40000 }}>
            <color attach="background" args={[look.background]} />
            <HiResCapture />
            <BvhWarmup />
            <RenderPacer />
            <ShadowCache />
            <fog attach="fog" args={[look.background, 2500, 6000]} />
            {/* Two separate lights (design system §9): the neutral inspection light (soft sky, a gentle key) by default,
                the analytical sun at the date and hour shown beside the switch while Sun & shadow is on. */}
            <hemisphereLight args={[LIGHT.sky, LIGHT.bounce, sunOn ? look.hemi : look.hemi + LIGHT.inspectionLift]} />
            {sunOn ? <Sun north={north} /> : <directionalLight name="inspection-key" position={[600, 1200, 400]} intensity={LIGHT.inspectionKey} />}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {project === 'vtc' ? <VtcScene onPick={onPick} look={look} xray={xray} /> : <CityScene onPick={onPick} look={look} xray={xray} />}
              <TowerGizmo />
              <MassingEdit3D />
              <TowerPosition3D />
              <BelowGrade />
            </group>
            <OrbitControls makeDefault target={project === 'vtc' ? [0, 60, 0] : toThree(...VISTA_OVERVIEW.target).toArray()} maxPolarAngle={MAX_POLAR} minDistance={MIN_DISTANCE} maxDistance={project === 'vtc' ? 20000 : 40000} enableDamping
              onStart={() => useDock.setState({ orbiting: true })} onEnd={() => useDock.setState({ orbiting: false })} />
            <CameraRig />
            <NorthTurnRig />
            <Lens focus={focus} fit={(sel?.height ?? 200) * 1.5} fog={fog} />
            <CameraClamp />
          </Canvas>
          </ViewGuard>
          {present && boardView === 'plan' ? <PlanDrawing /> : !hidden && !(project === 'city' && !present) && <NorthCompass north={north} />}
          {/* Real Vancouver outside Present: Vista's viewport layout (mode tabs, compass column, caption, legend, place labels). */}
          {project === 'city' && !present && !hidden && <><SitePlaceLabels /><VistaChrome /></>}
          {/* Not at eye level (Observer: its corner map takes the bottom right, and the view is not an axonometric). */}
          {phase === 'advanced' && sel && !hidden && !looking && <TitleBlock t={sel} clear={dockOpen ? 'right-[21.5rem]' : project === 'city' ? 'right-3' : 'right-12'} />}
        </div>
      </div>
      {/* While the Real Vancouver map is still downloading: how much has arrived (Ruijie, 7 Nov). */}
      {project === 'city' && <LoadingBar />}
      {/* The open tool's working view, and anything else drawn as pinned context (8 Nov). */}
      {!present && !hidden && !looking && <ContextPins project={project} top={project === 'city' ? 'top-14' : 'top-3'} />}
      {/* Every control over the view lives in one dock on the right (ViewportDock); H hides all overlays. */}
      {project === 'city' && !present && <CityLegend />}
      {project === 'vtc' && !present && <VtcDock />}
      {project === 'vtc' && !present && !hidden && <VtcContextCard />}
      {project === 'vtc' && !present && !hidden && <VtcLookBar />}
      {project === 'city' && !present && !hidden && <VistaInset />}
      {present && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-meta text-ink">A2 landscape · 594 × 420 mm · the capture is exactly this frame</div>}
      {/* Real Vancouver: below the map's mode tabs, which cover the top edge. */}
      {placing && !hidden && !picked && <div className={`pointer-events-none absolute left-1/2 ${project === 'city' && !present ? 'top-14' : 'top-3'} -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white`}>Click the ground where the tower should stand · Esc keeps it where it is</div>}
      {!present && <ShowOverlaysButton />}
      <TowerToolbar />
      <MassingEditReadout />
    </div>
  )
}

/** Schematic: a drafting title block that names the drawing and its assumptions. */
function TitleBlock({ t, clear }: { t: Tower; clear: string }) {
  const presets = useStore((s) => s.liftPresets)
  const egressP = useStore((s) => s.egressPresets)
  const lifts = useMemo(() => liftCheck(t, presets, egressP), [t, presets, egressP])
  const stairMm = useMemo(() => Math.max(...storeyLoads(t, egressP, presets).map((s) => s.stairMm)), [t, presets, egressP])
  const fade = useOverlayLook().split(' ').filter((c) => c.startsWith('opacity') || c.startsWith('transition') || c.startsWith('duration')).join(' ')
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
    // At most 17.5 rem wide, so Real Vancouver's legend (which leaves 19 rem in Schematic, VistaLook.tsx) never runs under it.
    <div className={`pointer-events-none absolute bottom-3 ${clear} max-w-[17.5rem] border border-[#2b3f55]/40 bg-panel/75 font-mono text-meta text-[#2b3f55] backdrop-blur-md ${fade}`}>
      <div className="border-b border-[#2b3f55]/30 px-2 py-1 font-semibold">Schematic · x-ray axonometric</div>
      <div className="grid grid-cols-[auto_auto] gap-x-3 px-2 py-1">
        {rows.flatMap(([k, v]) => [<span key={`${k}k`} className="uppercase opacity-70">{k}</span>, <span key={`${k}v`} className="truncate" title={v}>{v}</span>])}
      </div>
    </div>
  )
}

/**
 * Small and translucent; the arrow points to true north on screen (turned by NorthTurnRig) and a click turns the view to
 * face north (Ruijie, 6 Nov). The VTC north correction stays visible (a false assumption is never hidden).
 */
function NorthCompass({ north }: { north: number }) {
  const look = useOverlayLook()
  const label = `True north ${north ? `${north}° from the model grid` : '(grid north)'}`
  const arrow = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const el = arrow.current as unknown as HTMLElement | null
    if (!el) return
    northView.arrows.set(el, north)
    northView.invalidate?.()
    return () => { northView.arrows.delete(el) }
  }, [north])
  return (
    <button type="button" onClick={() => faceNorth(north)} data-testid="north-arrow"
      aria-label={`Turn the view to face north. ${label}${north ? ". False assumption corrected: the file's saved north is the grid." : '.'}`} title={`Face north · ${label}`}
      className={`pointer-events-auto absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-line/70 py-0.5 pl-0.5 pr-2 text-meta text-slate-700 shadow-sm hover:border-accent hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${look}`}>
      <svg ref={arrow} width="22" height="22" viewBox="-14 -14 28 28" style={{ transform: `rotate(${north}deg)` }} aria-hidden>
        <circle r="12" fill="none" stroke="#9aa0a6" />
        <path d="M0 -11 L4 4 L0 1 L-4 4 Z" fill="#1f5f8b" />
      </svg>
      <span className="font-semibold">N</span>
      {north !== 0 && <span className="font-semibold text-flag-false">{north}° · corrected</span>}
    </button>
  )
}

/** Competition site: the same dock as Real Vancouver, with the site's north, datum and context model. */
function VtcDock() {
  const { ctx, missing, status } = useVtcContext()
  const source = useVtcSource((s) => s.source)
  return (
    <ViewportDock sections={[
      { id: 'vtc-site', title: 'Site, north & datum', defaultOpen: true, summary: `true north ${VTC_NORTH_DEG}°`, children: (
        // Two glyphs with a word each (Ruijie, 6 Nov: information as graphics): north against the grid, and the zero level.
        <div className="flex items-start gap-3" data-testid="vtc-north-datum">
          <figure className="m-0 flex flex-col items-center gap-0.5" aria-label={`True north ${VTC_NORTH_DEG} degrees from the model grid`}>
            <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
              <line x1={24} y1={40} x2={24} y2={8} className="stroke-slate-400" strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={26} y={10} className="fill-slate-500 text-meta">grid</text>
              <g transform={`rotate(${VTC_NORTH_DEG} 24 40)`}>
                <line x1={24} y1={40} x2={24} y2={8} className="stroke-accent" strokeWidth={2} />
                <path d="M24 4 L20 12 L28 12 Z" className="fill-accent" />
              </g>
              <path d={`M24 26 A14 14 0 0 1 ${24 + 14 * Math.sin((VTC_NORTH_DEG * Math.PI) / 180)} ${40 - 14 * Math.cos((VTC_NORTH_DEG * Math.PI) / 180)}`} fill="none" className="stroke-accent" strokeWidth={0.8} />
            </svg>
            <figcaption className="text-meta"><b className="text-ink">N {VTC_NORTH_DEG}°</b> <span className="text-flag-false">corrected</span></figcaption>
          </figure>
          <figure className="m-0 flex flex-col items-center gap-0.5" aria-label="Zero level: 0 m is the site grade">
            <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
              <rect x={18} y={12} width={12} height={22} className="fill-slate-200 stroke-slate-500" strokeWidth={0.8} />
              <line x1={4} x2={44} y1={34} y2={34} className="stroke-ink" strokeWidth={1.5} />
              <path d="M8 34 L4 40 M14 34 L10 40 M20 34 L16 40 M26 34 L22 40 M32 34 L28 40 M38 34 L34 40 M44 34 L40 40" className="stroke-slate-400" strokeWidth={0.8} />
            </svg>
            <figcaption className="text-meta"><b className="text-ink">0 m</b> = grade</figcaption>
          </figure>
          <Help label="About north and the datum">
            True north is {VTC_NORTH_DEG}° from the model grid, read from the competition model's drawn north arrow. False assumption
            corrected: the file's saved north is the grid. Heights are above local grade (0 m = site grade); the competition model
            supplies no geodetic datum.
          </Help>
        </div>
      ) },
      { id: 'vtc-context', title: 'Competition context model', summary: status === 'reading' ? 'reading…' : ctx ? (source === 'browser' ? 'your copy · this browser' : 'local only') : missing ? 'not loaded' : 'loading…', children: <VtcBaseModelPanel /> },
    ]} />
  )
}
