// The analysis view (lib/analysisView.ts): a second viewport beside the model that draws one check's result in more
// detail, with its own camera. It reads the same store as the model, so moving, reshaping or re-programming a tower in
// the main view redraws the analysis here at once (Sinnie, 13 Nov). What it draws per check:
//   - Sun & shadow: the design's shadow for every daylight hour of the chosen day, the hour shown drawn dark, with the
//     date and hour, the shadow's reach and its area outside the towers;
//   - Solar access, Wind, Energy: their analytical colour layer, on in this view whatever the main view's display mode;
//   - View cones: the parts of the towers above the protected view limits;
//   - every other check: the towers floor by floor, coloured by use.
// The towers are drawn as plain prisms (the solar engine's own casters, engine/solarRules.ts towerOccluders), so drawn,
// imported and parametric towers all read the same.
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import { useEffect, useMemo, useRef, useState } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { useShallow } from 'zustand/react/shallow'
import { VTC_NORTH_DEG, useVtcContext } from '../context'
import { nodeById } from '../data/registry'
import { towerFloors } from '../engine/massing'
import { towerOccluders, vtcOccluders } from '../engine/solarRules'
import { sunPosition, sunVector, vancouverTime } from '../engine/sun'
import { USES, type Tower } from '../engine/types'
import { nodeOn } from '../lib/analysis'
import { analysisFor, closeAnalysis, ForcedLayer, hasOwnAnalysis, useAnalysisView } from '../lib/analysisView'
import { DATA, MODEL, UI } from '../lib/design/tokens'
import { rampColour, rampCss, type AnalysisLayerId } from '../lib/displayMode'
import { BRIEF_SITE } from '../lib/vtcContextSource'
import { useStore, useTowers } from '../store'
import { useCityData, useRemoval } from './CityContext'
import { ConeOverlays } from './ConeVolumes'
import { clock, SolarScale, SurfaceSunScale, TowerUseKey, WindKey } from './DisplayMode'
import EnergyOverlay from './EnergyOverlay'
import { Box, Map as MapIcon, X } from './icons'
import Label from './Label'
import SolarOverlay from './SolarOverlay'
import SolarEnvelopeOverlay from './SolarEnvelopeOverlay'
import { SunTimeFields } from './SunTime'
import WindScreenOverlay from './WindScreenOverlay'

type Pt = [number, number]
type Prism = { ring: Pt[]; z0: number; z1: number }

const SUN_RAMP = DATA.sequential
const toThree = (x: number, y: number, z: number): [number, number, number] => [x, z, -y]

function useNorth() { return useStore((s) => (s.project === 'vtc' ? VTC_NORTH_DEG : 0)) }
function useBase() { return useStore((s) => (s.project === 'city' ? s.groundElevation : 0)) }

/** The study site's outline: the Real Vancouver site, or the competition block. */
function useSiteRing(): Pt[] | null {
  const project = useStore((s) => s.project)
  const city = useStore((s) => s.citySite?.ring ?? null) as Pt[] | null
  const { ctx } = useVtcContext()
  if (project === 'city') return city
  return ((ctx?.site ?? BRIEF_SITE)?.outline as Pt[] | undefined) ?? null
}

// ------------------------------------------------------------------ geometry
const ringArea = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }
const mpArea = (mp: MultiPolygon) => mp.reduce((s, poly) => s + ringArea(poly[0] as Pt[]) - poly.slice(1).reduce((h, r) => h + ringArea(r as Pt[]), 0), 0)
const closed = (r: Pt[]): Pt[] => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r)

/** The ground shadow of a prism for a sun direction (x, y, z towards the sun): footprint, roof outline moved along the
 * sun, and every wall swept between them. */
function prismShadow(p: Prism, d: [number, number, number]): Polygon[] {
  const k = 1 / Math.max(0.05, d[2])
  const shift = (z: number) => (q: Pt): Pt => [q[0] - d[0] * k * z, q[1] - d[1] * k * z]
  const lo = p.ring.map(shift(p.z0)), hi = p.ring.map(shift(p.z1))
  const parts: Polygon[] = [[closed(lo)], [closed(hi)]]
  for (let i = 0; i < p.ring.length; i++) {
    const j = (i + 1) % p.ring.length
    parts.push([closed([lo[i], lo[j], hi[j], hi[i]])])
  }
  return parts
}

function shadowOf(prisms: Prism[], d: [number, number, number]): MultiPolygon {
  const parts = prisms.flatMap((p) => prismShadow(p, d))
  if (!parts.length) return []
  try { return polygonClipping.union(parts[0], ...parts.slice(1)) } catch { return [] }
}

function shapeOf(poly: Polygon): THREE.Shape {
  const s = new THREE.Shape((poly[0] as Pt[]).map(([x, y]) => new THREE.Vector2(x, y)))
  for (const h of poly.slice(1)) s.holes.push(new THREE.Path((h as Pt[]).map(([x, y]) => new THREE.Vector2(x, y))))
  return s
}

// ------------------------------------------------------------------ scene parts
function Prisms({ prisms, base, color = MODEL.proposed, opacity = 1 }: { prisms: Prism[]; base: number; color?: string; opacity?: number }) {
  const geoms = useMemo(() => prisms.map((p) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: Math.max(0.1, p.z1 - p.z0), bevelEnabled: false })
    g.translate(0, 0, p.z0)
    return g
  }), [prisms])
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])
  return (
    <group position={[0, 0, base]}>
      {geoms.map((g, i) => (
        <group key={i}>
          <mesh geometry={g}><meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} /></mesh>
          <lineSegments><edgesGeometry args={[g, 30]} /><lineBasicMaterial color={UI.ink} transparent opacity={0.85} /></lineSegments>
        </group>
      ))}
    </group>
  )
}

function SiteLine({ ring, z }: { ring: Pt[]; z: number }) {
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(closed(ring).map(([x, y]) => new THREE.Vector3(x, y, z))), [ring, z])
  return <lineLoop geometry={geom}><lineDashedMaterial color={UI.ink} /></lineLoop>
}

/** Sun & shadow: one shadow per daylight hour, the hour shown dark and labelled. */
function ShadowFan({ prisms, base }: { prisms: Prism[]; base: number }) {
  const sun = useStore((s) => s.sun)
  const north = useNorth()
  const fan = useMemo(() => {
    const out: { hour: number; mp: MultiPolygon; tip: Pt; now: boolean }[] = []
    const hours = [...new Set([...Array.from({ length: 15 }, (_, i) => 6 + i), sun.hour])].sort((a, b) => a - b)
    for (const h of hours) {
      const { azimuth, altitude } = sunPosition(vancouverTime(sun.month, sun.day, h))
      if (altitude < 3) continue
      const d = sunVector(azimuth, altitude, north) as [number, number, number]
      const mp = shadowOf(prisms, d)
      const top = prisms.reduce((a, p) => (p.z1 > a.z1 ? p : a), prisms[0])
      const c = top ? top.ring.reduce((a, q) => [a[0] + q[0] / top.ring.length, a[1] + q[1] / top.ring.length], [0, 0]) : [0, 0]
      const k = top ? top.z1 / Math.max(0.05, d[2]) : 0
      out.push({ hour: h, mp, tip: [c[0] - d[0] * k, c[1] - d[1] * k], now: h === sun.hour })
    }
    return out
  }, [prisms, sun.month, sun.day, sun.hour, north])
  const meshes = useMemo(() => fan.map((f, i) => ({ ...f, geoms: f.mp.map((poly) => new THREE.ShapeGeometry(shapeOf(poly))), t: fan.length > 1 ? i / (fan.length - 1) : 0 })), [fan])
  useEffect(() => () => meshes.forEach((m) => m.geoms.forEach((g) => g.dispose())), [meshes])
  return (
    <group position={[0, 0, base]}>
      {meshes.map((m, i) => {
        const [r, g, b] = rampColour(SUN_RAMP, 0.15 + 0.8 * m.t)
        const col = m.now ? UI.ink : new THREE.Color(r, g, b).getStyle()
        return (
          <group key={m.hour} position={[0, 0, 0.2 + (m.now ? 0.3 : i * 0.005)]}>
            {m.geoms.map((g, k) => (
              <mesh key={k} geometry={g} renderOrder={m.now ? 3 : 2}>
                <meshBasicMaterial color={col} transparent opacity={m.now ? 0.42 : 0.2} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            ))}
            {(m.now || Number.isInteger(m.hour)) && (
              <Label text={m.now ? `${clock(m.hour)} (shown)` : clock(m.hour)} position={[m.tip[0], m.tip[1], 3]} size={m.now ? 0.016 : 0.012} bold={m.now} background={m.now ? undefined : null} />
            )}
          </group>
        )
      })}
    </group>
  )
}

/** The towers floor by floor, each floor slab in its use's colour. */
function UseStack({ towers, base }: { towers: Tower[]; base: number }) {
  const slabs = useMemo(() => {
    const out: { g: THREE.ExtrudeGeometry; color: string }[] = []
    for (const t of towers) {
      const prisms = towerOccluders([t]).prisms as Prism[]
      if (!prisms.length) continue
      for (const f of towerFloors(t)) {
        if (f.z1 <= 0) continue
        const mid = (f.z0 + f.z1) / 2
        const holds = prisms.filter((p) => p.z0 <= mid && mid < p.z1)
        if (!holds.length) continue
        const pick = t.imported ? holds : [holds.reduce((a, p) => ((f.podium ? ringArea(p.ring) > ringArea(a.ring) : ringArea(p.ring) < ringArea(a.ring)) ? p : a))]
        for (const p of pick) {
          const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: Math.max(0.2, f.z1 - f.z0 - 0.35), bevelEnabled: false })
          g.translate(0, 0, Math.max(0, f.z0))
          out.push({ g, color: USES[f.use]?.color ?? MODEL.proposed })
        }
      }
    }
    return out
  }, [towers])
  useEffect(() => () => slabs.forEach((s) => s.g.dispose()), [slabs])
  return (
    <group position={[0, 0, base]}>
      {slabs.map((s, i) => <mesh key={i} geometry={s.g}><meshStandardMaterial color={s.color} /></mesh>)}
    </group>
  )
}

/** The existing buildings around the site (Sinnie, 13 Nov: "include nearby building in the analysis viewport"): Real
 * Vancouver's measured buildings (the ones the main view hides under the design stay hidden), or the competition
 * context model, within reach of the site, as one quiet mesh. */
function NearbyBuildings({ centre, reach }: { centre: Pt; reach: number }) {
  const project = useStore((s) => s.project)
  const { data } = useCityData()
  const removal = useRemoval(project === 'city' ? data : null)
  const { ctx } = useVtcContext()
  const geom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const near = (r: Pt[]) => r.some(([x, y]) => Math.abs(x - centre[0]) < reach && Math.abs(y - centre[1]) < reach)
    const prism = (ring: Pt[], z0: number, z1: number) => {
      if (ring.length < 3 || !(z1 > z0)) return
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false })
      g.translate(0, 0, z0)
      parts.push(g.index ? g.toNonIndexed() : g)
    }
    if (project === 'city' && data?.heights) {
      const h = data.heights
      data.footprints.forEach((f, i) => {
        if (removal.hidden.has(i) || !near(f.outer)) return
        const g0 = h.ground[i], r = h.roof[i]
        if (Number.isFinite(g0) && Number.isFinite(r) && r > g0) prism(f.outer as Pt[], g0, r)
      })
    } else if (project === 'vtc' && ctx) {
      const occ = vtcOccluders(ctx)
      for (const p of occ.prisms) if (near(p.ring as Pt[])) prism(p.ring as Pt[], p.z0, p.z1)
      const pos: number[] = []
      for (let i = 0; i + 8 < occ.tris.length; i += 9) {
        const t = occ.tris
        if (near([[t[i], t[i + 1]], [t[i + 3], t[i + 4]], [t[i + 6], t[i + 7]]])) pos.push(...t.slice(i, i + 9))
      }
      if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); parts.push(g) }
    }
    if (!parts.length) return null
    for (const g of parts) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k) }
    const merged = mergeGeometries(parts, false)
    parts.forEach((g) => g.dispose())
    return merged
  }, [project, data, removal.hidden, ctx, centre[0], centre[1], reach]) // eslint-disable-line react-hooks/exhaustive-deps
  const edges = useMemo(() => (geom ? new THREE.EdgesGeometry(geom, 30) : null), [geom])
  useEffect(() => () => { geom?.dispose(); edges?.dispose() }, [geom, edges])
  if (!geom) return null
  return (
    <group>
      <mesh geometry={geom}><meshStandardMaterial color={MODEL.context} /></mesh>
      {edges && <lineSegments geometry={edges}><lineBasicMaterial color="#9aa3ad" transparent opacity={0.35} /></lineSegments>}
    </group>
  )
}

/** Frames the site and the towers when the view opens or the check or Plan / 3D changes (not on every edit). */
function Frame({ centre, extent, base, lift, plan, frameKey }: { centre: Pt; extent: number; base: number; lift: number; plan: boolean; frameKey: string }) {
  const { camera, controls, size, invalidate } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitImpl | null; size: { width: number; height: number }; invalidate: () => void }
  const last = useRef('')
  useEffect(() => {
    if (!controls) return
    const key = `${frameKey}:${camera.uuid}`
    if (last.current === key) return
    last.current = key
    const target = new THREE.Vector3(...toThree(centre[0], centre[1], base + (plan ? 0 : lift)))
    if (plan && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const c = camera as THREE.OrthographicCamera
      // Straight down, north (model +y, three -z) at the top of the view.
      c.up.set(0, 0, -1)
      c.position.set(target.x, target.y + 3000, target.z)
      c.zoom = Math.min(size.width, size.height) / (2.2 * extent)
      c.near = 1; c.far = 20000
      c.lookAt(target)
      c.updateProjectionMatrix()
    } else {
      const c = camera as THREE.PerspectiveCamera
      c.up.set(0, 1, 0)
      const dist = extent / Math.tan(((c.fov / 2) * Math.PI) / 180)
      c.position.copy(target.clone().add(new THREE.Vector3(dist * 0.55, dist * 0.6, dist * 0.55)))
      c.near = Math.max(0.5, dist / 500); c.far = dist * 20; c.updateProjectionMatrix()
    }
    controls.target.copy(target); controls.update(); invalidate()
  }, [controls, camera, centre, extent, base, lift, plan, frameKey, size.width, size.height, invalidate])
  return null
}

// ------------------------------------------------------------------ the view
export default function AnalysisViewport() {
  const node = useAnalysisView((s) => s.node)
  const plan = useAnalysisView((s) => s.plan)
  const towers = useTowers()
  const base = useBase()
  const ring = useSiteRing()
  const project = useStore((s) => s.project)
  const { on, analysisOn } = useStore(useShallow((s) => ({ on: node ? nodeOn(s, node) : false, analysisOn: s.analysis })))
  const sun = useStore((s) => s.sun)
  const north = useNorth()
  const prisms = useMemo(() => towerOccluders(towers).prisms as Prism[], [towers])
  const [nearby, setNearby] = useState(true)
  if (!node) return null
  const def = analysisFor(node)
  const n = nodeById(node)
  const name = n?.name ?? node

  // Framing: the site and the towers, with room for long shadows in plan.
  const pts: Pt[] = [...(ring ?? []), ...prisms.flatMap((p) => p.ring)]
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const centre: Pt = pts.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0]
  const span = pts.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 200
  const tall = prisms.reduce((m, p) => Math.max(m, p.z1), 0)
  const extent = Math.max(80, span * 0.75, def.kind === 'shadows' ? tall * 1.6 : tall * 0.9)

  // Sun & shadow readout for the hour shown.
  const sp = sunPosition(vancouverTime(sun.month, sun.day, sun.hour))
  const shadowNow = def.kind === 'shadows' && sp.altitude > 0 && prisms.length ? (() => {
    const d = sunVector(sp.azimuth, sp.altitude, north) as [number, number, number]
    const mp = shadowOf(prisms, d)
    const foot = prisms.map((p) => [closed(p.ring)] as Polygon)
    let outside = mp
    try { if (foot.length) outside = polygonClipping.difference(mp, ...foot) } catch { /* keep the whole shadow */ }
    return { area: mpArea(outside), reach: tall / Math.tan((sp.altitude * Math.PI) / 180) }
  })() : null

  const layer: AnalysisLayerId | null = def.kind === 'layer' ? def.layer : null
  const needsOn = def.kind !== 'uses' && !on
  return (
    <section aria-label={`${name}: analysis view`} data-testid="analysis-view" data-analysis={node} className="relative flex h-full w-full flex-col bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="min-w-0 flex-1">
          <h2 className="truncate text-control font-semibold text-ink" data-testid="analysis-title">{name}</h2>
          <p className="truncate text-meta text-muted" title={def.about}>{hasOwnAnalysis(node) ? def.about : `${def.about} This check has no drawing of its own yet; its numbers are in the right panel.`}</p>
        </span>
        <div role="radiogroup" aria-label="Camera" className="flex rounded-lg bg-subtle p-0.5">
          {([[true, 'Plan', MapIcon], [false, '3D', Box]] as const).map(([v, word, I]) => (
            <button key={word} type="button" role="radio" aria-checked={plan === v} onClick={() => useAnalysisView.setState({ plan: v })} data-testid={`analysis-${word.toLowerCase()}`}
              className={`flex h-7 items-center gap-1 rounded-md px-2 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${plan === v ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              <I size={13} aria-hidden />{word}
            </button>
          ))}
        </div>
        <button type="button" onClick={closeAnalysis} aria-label="Close the analysis view" title="Close the analysis view" data-testid="analysis-close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={16} aria-hidden /></button>
      </header>
      <div className="relative min-h-0 flex-1">
        {/* Plan is a true plan: an orthographic camera straight down, north up, pan and zoom only (the canvas is rebuilt with
            the other camera when Plan / 3D changes, so the controls always drive the camera in use). */}
        <Canvas key={plan ? 'plan' : 'axo'} orthographic={plan} camera={plan ? { position: [0, 3000, 0], zoom: 1, near: 1, far: 20000 } : { fov: 30, position: [0, 800, 1], near: 1, far: 40000 }} frameloop="demand" dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <ForcedLayer.Provider value={layer}>
            <color attach="background" args={['#f4f5f7']} />
            <hemisphereLight args={['#ffffff', '#c9ced6', 1.6]} />
            <directionalLight position={[400, 900, 300]} intensity={1.1} />
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {/* A backdrop, drawn first and never in front of anything: the sun-hours map lies on the real terrain, which
                  drops below the site's ground towards the water, where a solid plane at the site level hid it. */}
              <mesh position={[centre[0], centre[1], base - 0.05]} renderOrder={-10}><planeGeometry args={[extent * 8, extent * 8]} /><meshBasicMaterial color="#eceef1" depthWrite={false} depthTest={false} /></mesh>
              {ring && <SiteLine ring={ring} z={base + 0.15} />}
              {nearby && <NearbyBuildings centre={centre} reach={Math.max(300, extent * 2.5)} />}
              {def.kind === 'uses' ? <UseStack towers={towers} base={base} /> : <Prisms prisms={prisms} base={base} opacity={def.kind === 'cones' ? 0.55 : 1} />}
              {def.kind === 'shadows' && on && <ShadowFan prisms={prisms} base={base} />}
              {layer === 'solar' && <><SolarOverlay /><SolarEnvelopeOverlay /></>}
              {layer === 'wind' && <WindScreenOverlay base={base} />}
              {layer === 'surface-sun' && <EnergyOverlay base={base} />}
              {def.kind === 'cones' && project === 'city' && <ConeOverlays base={base} xray={false} />}
            </group>
            <OrbitControls makeDefault enableDamping={false} enableRotate={!plan} screenSpacePanning />
            <Frame centre={centre} extent={plan ? extent : Math.max(extent, tall * 0.75)} base={base} lift={tall * 0.45} plan={plan} frameKey={`${node}:${plan}:${project}`} />
          </ForcedLayer.Provider>
        </Canvas>

        {needsOn && (
          <p role="status" data-testid="analysis-off" className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 rounded-lg bg-pending-surface px-3 py-2 text-meta text-pending">
            {analysisOn
              ? <><span>{name} is off, so there is nothing to draw yet.</span><button type="button" onClick={() => useStore.getState().toggleNode(node)} className="h-7 rounded-lg bg-panel px-2 text-control text-ink">Switch it on</button></>
              : <><span>Checks are paused (Auto-run checks is off).</span><button type="button" onClick={() => useStore.getState().setAnalysis(true)} className="h-7 rounded-lg bg-panel px-2 text-control text-ink">Turn on auto-run</button></>}
          </p>
        )}
        {!towers.length && <p role="status" className="absolute inset-x-3 top-3 rounded-lg bg-pending-surface px-3 py-2 text-meta text-pending">No tower yet: place one in the model and its analysis appears here.</p>}

        {/* the key and, for the sun, the day and hour (changing them here moves the main view's sun too) */}
        <div className="glass absolute bottom-3 left-3 max-w-[min(22rem,calc(100%-1.5rem))] space-y-2 rounded-xl bg-glass-1 p-3 text-meta shadow-float" data-testid="analysis-key">
          {def.kind === 'shadows' && (
            <>
              <div>
                <div className="mb-1 font-semibold text-ink">Shadow by hour · {sun.day}/{sun.month}</div>
                <div className="h-2 rounded-sm" style={{ background: rampCss(SUN_RAMP.slice(1)) }} />
                <div className="mt-0.5 flex justify-between text-muted"><span>morning</span><span>evening</span></div>
              </div>
              {shadowNow
                ? <p className="text-ink" data-testid="analysis-readout">At {clock(sun.hour)}: sun {sp.altitude.toFixed(0)}° high, shadow reaches <b>{Math.round(shadowNow.reach)} m</b> and covers <b>{Math.round(shadowNow.area).toLocaleString()} m²</b> beyond the towers.</p>
                : <p className="text-muted">The sun is down at {clock(sun.hour)}.</p>}
              <SunTimeFields />
            </>
          )}
          {layer === 'solar' && <SolarScale project={project} />}
          {layer === 'wind' && <WindKey />}
          {layer === 'surface-sun' && <SurfaceSunScale />}
          {def.kind === 'cones' && <p className="text-ink">{project === 'city' ? 'Highlighted: the parts of each tower above a protected view-cone limit. The tower is drawn see-through.' : 'View cones apply in Real Vancouver only.'}</p>}
          {def.kind === 'uses' && <TowerUseKey />}
          <label className="flex items-center gap-1.5 text-ink"><input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} data-testid="analysis-nearby" className="accent-accent" />Nearby buildings</label>
          <p className="text-muted">Change the design in the main view; this view follows.</p>
        </div>
      </div>
    </section>
  )
}
