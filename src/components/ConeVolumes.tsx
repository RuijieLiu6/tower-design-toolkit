// View cones as 3D solids seen from their viewpoints, and what meets them (Ruijie, 3 Nov: "make them read as a cone as a
// 3 dimensional geometry, so it could show how it interacts with the existing building mass"). Real Vancouver only.
// - A cone with an estimate is a solid with its apex at the viewpoint (origin, eye level Lv): lower face the estimate
//   Z = Lv + k·D, upper face the sight line to the MRDEM-30 skyline (a visual construction; a fixed cap where no skyline
//   rises above the estimate), side faces along the wedge edges and a far face where the wedge ends. All cones are one
//   merged mesh plus one merged edge set (per-vertex colour and alpha), so they cost two draw calls together.
// - Cones without an estimate get no solid (their dashed outline stays): nothing implies a height that is not known.
// - Existing City buildings that rise above a cone's estimated lower boundary inside its wedge: computed once per data
//   load, their part inside the view tinted in the neutral cone blue and their section drawn as a thick line. Existing
//   buildings may predate the policy, so nothing here calls them a breach.
// - Design towers: the part above the limit inside the wedge tinted red, the thick section line, and a label carrying
//   the view-cone check's own number (checkFootprint via useResults).
import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildingCrossings, coneSolid, conePlane, governingPoint, protectedHalfSpaces, sectionPolygon, type ConeSolid, type Crossing, type LimitPlane, type P2, type P3 } from '../engine/coneSection'
import { towerFootprint, towerMasses } from '../engine/massing'
import type { Tower } from '../engine/types'
import { CONES, CONE_PARAMS, type Cone, type ConeCheck, type ConeState } from '../engine/viewCones'
import { useResults } from '../hooks/useResults'
import { sampleTerrain, type Footprint, type FootprintHeights, type HeightGrid } from '../lib/cityLayers'
import { CITY_ORIGIN, useStore } from '../store'
import { useConeVisibility } from '../lib/coneVisibility'
import Label from './Label'
import { CONE_STYLE } from './ui'

/** Thick section line on a design tower: a dark red that reads on clay, x-ray and the red tint. */
export const CONE_SECTION_LINE = '#7f1d16'
/** Existing buildings inside a cone: the neutral estimated-cone blue, and a darker blue for their section line. */
export const CONE_EXISTING = '#4f7fae'
export const CONE_EXISTING_LINE = '#24496b'
/** Vista's intrusion red (explorer.js drawViewconeOverlay: 0.96, 0.08, 0.11). */
export const VISTA_INTRUSION = '#f5141c'
const ESTIMATED = '#4f7fae'
const ESTIMATED_CONES = CONES.filter((c) => CONE_PARAMS[c.id])

const local = (r: [number, number][]): P2[] => r.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]])
const clipPlanes = (plane: LimitPlane, wedge: P2[]) =>
  protectedHalfSpaces(plane, wedge).map(([x, y, z, d]) => new THREE.Plane(new THREE.Vector3(x, y, z), d).normalize())

// ---------- the solids ----------
/** All estimated cones as solids, in the frame of the scene (local metres). Terrain from the loaded grids. */
export function useConeSolids(grids: HeightGrid[]) {
  return useMemo(() => ESTIMATED_CONES.map((cone) => ({ cone, solid: coneSolid(cone, CITY_ORIGIN, (x, y) => sampleTerrain(grids, x, y)) as ConeSolid })), [grids])
}

/** One merged mesh and one merged edge set for every solid; colour and alpha per vertex follow the selected tower's states. */
function solidsGeometry(solids: { cone: Cone; solid: ConeSolid }[], stateOf: (id: string) => ConeState | null) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], epos: number[] = [], ecol: number[] = []
  const c = new THREE.Color()
  for (const { cone, solid } of solids) {
    const st = stateOf(cone.id), active = !!st && st !== 'outside'
    c.set(active ? CONE_STYLE[st].color : ESTIMATED)
    const fill = [c.r, c.g, c.b, active ? 0.1 : 0.035], edge = [c.r, c.g, c.b, active ? 0.95 : 0.45]
    const n = solid.bottom.length, base = pos.length / 3
    const A = base, B = (i: number) => base + 1 + i, T = (i: number) => base + 1 + n + i
    for (const p of [solid.apex, ...solid.bottom, ...solid.top]) { pos.push(...p); col.push(...fill) }
    for (let i = 0; i + 1 < n; i++) {
      idx.push(A, B(i), B(i + 1), A, T(i + 1), T(i))                     // lower face (the estimate), upper face (skyline)
      idx.push(B(i), B(i + 1), T(i + 1), B(i), T(i + 1), T(i))           // far face
    }
    idx.push(A, B(0), T(0), A, T(n - 1), B(n - 1))                       // side faces along the wedge edges
    const seg = (p: P3, q: P3) => { epos.push(...p, ...q); ecol.push(...edge, ...edge) }
    for (const p of [solid.bottom[0], solid.top[0], solid.bottom[n - 1], solid.top[n - 1]]) seg(solid.apex, p)
    seg(solid.bottom[0], solid.top[0]); seg(solid.bottom[n - 1], solid.top[n - 1])
    for (let i = 0; i + 1 < n; i++) { seg(solid.bottom[i], solid.bottom[i + 1]); seg(solid.top[i], solid.top[i + 1]) }
  }
  const mesh = new THREE.BufferGeometry()
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  mesh.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  mesh.setIndex(idx)
  const edges = new THREE.BufferGeometry()
  edges.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3))
  edges.setAttribute('color', new THREE.Float32BufferAttribute(ecol, 4))
  return { mesh, edges }
}

/** The estimated cones as ghosted solids from their viewpoints (two draw calls for all of them). */
export function ConeSolids({ grids }: { grids: HeightGrid[] }) {
  const solids = useConeSolids(grids)
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  // Analysis off (process rail): the cones are drawn without the check's colours.
  const analysis = useStore((s) => s.analysis)
  const checks = analysis ? cones.find((c) => c.tower.id === sel)?.checks : undefined
  const key = ESTIMATED_CONES.map((c) => checks?.find((k) => k.cone.id === c.id)?.state ?? '').join(',')
  const geo = useMemo(() => solidsGeometry(solids, (id) => checks?.find((k) => k.cone.id === id)?.state ?? null), [solids, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { geo.mesh.dispose(); geo.edges.dispose() }, [geo])
  return (
    <>
      <mesh geometry={geo.mesh} raycast={() => null} renderOrder={1}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={geo.edges} raycast={() => null} renderOrder={1}>
        <lineBasicMaterial vertexColors transparent depthWrite={false} />
      </lineSegments>
    </>
  )
}

// ---------- existing buildings ----------
export interface ConeCrossings { cone: Cone; plane: LimitPlane; wedge: P2[]; crossings: Crossing[] }
const crossingsCache = new WeakMap<object, ConeCrossings[]>()

/** Existing buildings rising above each estimated cone's lower boundary (static: computed once per loaded data). */
export function coneCrossingsFor(footprints: Footprint[], heights: FootprintHeights | null): ConeCrossings[] {
  if (!heights) return []
  const hit = crossingsCache.get(heights)
  if (hit) return hit
  const out = ESTIMATED_CONES.map((cone) => {
    const plane = conePlane(cone, CITY_ORIGIN)!, wedge = local(cone.ring)
    return { cone, plane, wedge, crossings: buildingCrossings(footprints, heights.ground, heights.roof, plane, wedge) }
  })
  crossingsCache.set(heights, out)
  return out
}

/** Their part inside the protected view tinted neutral blue (one mesh per cone that has any), sections as one thick line set. */
export function ExistingConeCrossings({ footprints, heights, hidden, xray }: { footprints: Footprint[]; heights: FootprintHeights | null; hidden: ReadonlySet<number>; xray: boolean }) {
  const all = useMemo(() => coneCrossingsFor(footprints, heights), [footprints, heights])
  // A cone hidden in the Viewcone tab or the Layers dock (lib/coneVisibility.ts) hides its readings here too.
  const off = useConeVisibility((s) => s.hidden)
  const built = useMemo(() => {
    const meshes: { geom: THREE.BufferGeometry; clip: THREE.Plane[] }[] = []
    const segs: P3[] = []
    for (const p of all) {
      if (off[p.cone.id]) continue
      const shown = p.crossings.filter((c) => !hidden.has(c.index))
      if (!shown.length || !heights) continue
      const parts = shown.map(({ index }) => {
        const f = footprints[index], g = heights.ground[index], t = heights.roof[index]
        const shape = new THREE.Shape(f.outer.map(([x, y]) => new THREE.Vector2(x, y)))
        shape.holes = f.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
        const e = new THREE.ExtrudeGeometry(shape, { depth: t - g, bevelEnabled: false })
        e.translate(0, 0, g)
        e.deleteAttribute('uv')
        return e
      })
      const geom = mergeGeometries(parts)
      parts.forEach((q) => q.dispose())
      if (geom) meshes.push({ geom, clip: clipPlanes(p.plane, p.wedge) })
      for (const c of shown) c.section.forEach((q, i) => segs.push(q, c.section[(i + 1) % c.section.length]))
    }
    return { meshes, segs }
  }, [all, hidden, footprints, heights, off])
  useEffect(() => () => built.meshes.forEach((m) => m.geom.dispose()), [built])
  return (
    <>
      {built.meshes.map((m, i) => (
        <mesh key={i} geometry={m.geom} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial color={CONE_EXISTING} transparent opacity={xray ? 0.35 : 0.5} depthWrite={false} side={THREE.DoubleSide}
            clippingPlanes={m.clip} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
      {built.segs.length > 0 && <Line points={built.segs} segments color={CONE_EXISTING_LINE} lineWidth={3} renderOrder={3} />}
    </>
  )
}

// ---------- design towers ----------
interface Mass { ring: P2[]; z0: number; z1: number }

/** The masses the check reads: every stacked block to its own top (an imported mass: its hull to the top). */
function massesOf(t: Tower, base: number): Mass[] {
  return towerMasses(t).map((m) => ({ ring: m.ring, z0: base + m.z0, z1: base + m.z1 }))
}

function prism(m: Mass) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(m.ring.map(([x, y]) => new THREE.Vector2(x, y))), { depth: m.z1 - m.z0, bevelEnabled: false })
  g.translate(0, 0, m.z0)
  return g
}

/** One tower in one estimated cone: tint above the limit inside the wedge, the section line, the overshoot label. */
function TowerInCone({ t, check, base, xray }: { t: Tower; check: ConeCheck; base: number; xray: boolean }) {
  const cone = check.cone
  const built = useMemo(() => {
    const plane = conePlane(cone, CITY_ORIGIN)!
    const wedge = local(cone.ring)
    const masses = massesOf(t, base)
    const lines = masses.map((m) => sectionPolygon(m.ring, m.z0, m.z1, plane, wedge)).filter((s) => s.length >= 3).map((s) => [...s, s[0]] as P3[])
    const g = governingPoint(towerFootprint(t).map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as P2), cone)
    return { geoms: masses.map(prism), clip: clipPlanes(plane, wedge), lines, at: g ? ([g.at[0] - CITY_ORIGIN[0], g.at[1] - CITY_ORIGIN[1]] as P2) : null }
  }, [t, base, cone])
  useEffect(() => () => built.geoms.forEach((g) => g.dispose()), [built])
  const exceed = check.exceed ?? null, u95 = check.param?.u95 ?? 0
  const showLabel = built.at && exceed !== null && exceed > -u95
  const text = exceed === null ? '' : `${cone.id}: ${Math.abs(exceed).toFixed(1)} m ${exceed >= 0 ? 'above' : 'below'} estimated limit (±${u95} m)${check.state === 'within_uncertainty' ? ', within uncertainty' : ''}`
  return (
    <>
      {built.geoms.map((g, i) => (
        <mesh key={i} geometry={g} raycast={() => null} renderOrder={3}>
          {/* Vista's intrusion (drawViewconeOverlay): an opaque red skin where the tower rises above the ceiling; x-ray keeps it see-through. */}
          <meshBasicMaterial key={xray ? 'x' : 'c'} color={xray ? CONE_STYLE.above.color : VISTA_INTRUSION} transparent={xray} opacity={xray ? 0.5 : 1} depthWrite={!xray} side={THREE.DoubleSide} toneMapped={false}
            clippingPlanes={built.clip} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
      {built.lines.map((pts, i) => <Line key={i} points={pts} color={CONE_SECTION_LINE} lineWidth={4} renderOrder={4} />)}
      {/* At the governing point, on the limit (where the overshoot starts), clear of the tower's name label at its top. */}
      {showLabel && <Label text={text} position={[built.at![0], built.at![1], (check.limit ?? base) + 3]} size={0.014} color={CONE_SECTION_LINE} maxDistance={1500} />}
    </>
  )
}

/** Every design tower inside an estimated cone (Real Vancouver). States and numbers come from the view-cone check. */
export function ConeOverlays({ base, xray }: { base: number; xray: boolean }) {
  const { cones } = useResults()
  const off = useConeVisibility((s) => s.hidden) // drawing only: the check and its numbers stay
  const analysis = useStore((s) => s.analysis)
  if (!analysis) return null // analysis off (process rail): no above-the-limit parts
  return (
    <>
      {cones.flatMap((r) => r.checks.filter((c) => c.param && c.limit !== null && !off[c.cone.id]).map((c) => (
        <TowerInCone key={`${r.tower.id}:${c.cone.id}`} t={r.tower} check={c} base={base} xray={xray} />
      )))}
    </>
  )
}
