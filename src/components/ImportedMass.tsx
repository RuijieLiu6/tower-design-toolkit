// Draws an imported mass in the 3D view (research P14-M02/M04/M05). Massing: the real mesh, coloured by the program
// of each storey band (the mesh is drawn once per band, clipped to it). Schematic: ghosted like the parametric
// towers, with the sliced plate outlines and an assumed central core. Open edges show red, flipped faces magenta.
import { useMemo } from 'react'
import * as THREE from 'three'
import { coreSide, towerFloors } from '../engine/massing'
import { USES, type ImportedStorey, type Tower, type UseId } from '../engine/types'
import { useImportStore, useMeshEntry, type MeshEntry } from '../lib/import/store'
import { useStore } from '../store'
import Label from './Label'
import { PROPOSED, proposedLook } from '../lib/vistaLook'

const XRAY_OPACITY = 0.18
const CORE_COLOR = '#2b3f55'
const VOID_COLOR = '#d4d4d0'
const FAR = 1e5

interface Band { use: UseId | 'void'; z0: number; z1: number }

export default function ImportedMass({ t, baseZ, xray }: { t: Tower; baseZ: number; xray: boolean }) {
  const m = t.imported!
  const entry = useMeshEntry(m.meshId)
  const showProblems = useImportStore((s) => s.showProblems)
  const selected = useStore((s) => s.selectedTower) === t.id
  const selectTower = useStore((s) => s.selectTower)
  const schematic = useStore((s) => s.phase) === 'advanced'
  const proposed = useStore(proposedLook)
  const anatomy = useStore((s) => s.anatomy)
  const section = useStore((s) => s.sectionOn) && schematic
  const sectionLevel = useStore((s) => s.sectionLevel)

  // Program bands: each storey's use after sky lobbies and plant floors, voids grey; the ends run to the mesh limits.
  const bands = useMemo(() => {
    const byLevel = new Map(towerFloors(t).map((f) => [f.level, f.use]))
    const out: Band[] = []
    for (const s of m.storeys) {
      const use: Band['use'] = s.hasFloor ? byLevel.get(s.level) ?? s.use : 'void'
      const last = out[out.length - 1]
      if (last && last.use === use) last.z1 = s.z1
      else out.push({ use, z0: s.z0, z1: s.z1 })
    }
    if (out.length) { out[0].z0 = -FAR; out[out.length - 1].z1 = FAR }
    return out
  }, [t, m.storeys])

  const geom = useMemo(() => (entry ? meshGeometry(entry) : null), [entry])
  const slabs = useMemo(() => (entry ? null : slabGeometry(m.storeys)), [entry, m.storeys])
  const edges = useMemo(() => (geom ? new THREE.EdgesGeometry(geom, 30) : null), [geom])
  const plates = useMemo(() => plateLines(m.storeys), [m.storeys])
  const problems = useMemo(() => (entry ? problemGeometry(entry) : null), [entry])
  const sectionPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), [])
  sectionPlane.constant = baseZ + sectionLevel
  const top = m.storeys.length ? m.storeys[m.storeys.length - 1].z1 : m.top
  const core = coreSide(t)
  const unresolved = m.fileNorthDeg == null

  return (
    <group position={[t.x, t.y, baseZ]} rotation={[0, 0, (t.rotation * Math.PI) / 180]} onPointerDown={(e) => { e.stopPropagation(); selectTower(t.id) }}>
      {geom && bands.map((b, i) => {
        const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(baseZ + b.z0)), new THREE.Plane(new THREE.Vector3(0, -1, 0), baseZ + b.z1), ...(section ? [sectionPlane] : [])]
        const color = b.use === 'void' ? VOID_COLOR : USES[b.use].color
        // Real Vancouver Massing: the proposed tower in one strong colour (lib/vistaLook.ts PROPOSED), as Viewport's towers.
        const glow = proposed && !xray
        return (
          <mesh key={`${i}-${b.use}-${glow ? 'p' : 'u'}`} geometry={geom} castShadow={!xray} receiveShadow visible={!xray || anatomy.shell}>
            <meshStandardMaterial color={glow ? PROPOSED.fill : color} roughness={0.75} side={THREE.DoubleSide} clippingPlanes={clip} transparent opacity={xray ? XRAY_OPACITY : 1} depthWrite={!xray} toneMapped={!glow} fog={!glow}
              emissive={glow ? PROPOSED.fill : selected && !xray ? '#1f5f8b' : '#000000'} emissiveIntensity={glow ? 0.45 : selected && !xray ? 0.08 : 0} />
          </mesh>
        )
      })}
      {slabs && (
        <mesh key={proposed && !xray ? 'p' : 'u'} geometry={slabs} castShadow={!xray} receiveShadow>
          <meshStandardMaterial vertexColors={!(proposed && !xray)} color={proposed && !xray ? PROPOSED.fill : '#ffffff'} toneMapped={!(proposed && !xray)} roughness={0.75} fog={!(proposed && !xray)} transparent opacity={xray ? XRAY_OPACITY : 1} depthWrite={!xray} clippingPlanes={section ? [sectionPlane] : null}
            emissive={proposed && !xray ? PROPOSED.fill : '#000000'} emissiveIntensity={proposed && !xray ? 0.45 : 0} />
        </mesh>
      )}
      {edges && proposed && !xray && <lineSegments geometry={edges}><lineBasicMaterial color={PROPOSED.line} toneMapped={false} /></lineSegments>}
      {edges && <lineSegments geometry={edges} visible={xray}><lineBasicMaterial color="#3d5a78" transparent opacity={0.6} clippingPlanes={section ? [sectionPlane] : null} /></lineSegments>}
      <lineSegments geometry={plates} visible={xray ? anatomy.plates : selected}>
        <lineBasicMaterial color={xray ? '#4a6a8c' : '#ffffff'} transparent opacity={xray ? 0.5 : 0.6} clippingPlanes={section ? [sectionPlane] : null} />
      </lineSegments>
      {xray && anatomy.core && top > 0 && (
        <mesh position={[0, 0, top / 2]}>
          <boxGeometry args={[core, core, top]} />
          <meshStandardMaterial color={CORE_COLOR} roughness={0.6} transparent opacity={0.85} clippingPlanes={section ? [sectionPlane] : null} />
        </mesh>
      )}
      {problems && selected && showProblems && (
        <>
          {problems.open && <lineSegments geometry={problems.open}><lineBasicMaterial color="#d0312d" depthTest={false} transparent opacity={0.95} /></lineSegments>}
          {problems.flipped && <mesh geometry={problems.flipped}><meshBasicMaterial color="#b8137a" side={THREE.DoubleSide} transparent opacity={0.85} depthTest={false} /></mesh>}
        </>
      )}
      <group position={[0, 0, m.top + 10]}>
        <Label hoverKey={t.id} text={`${t.name} · ${t.height.toFixed(0)} m · imported${unresolved ? ' · north unresolved' : ''}`} position={[0, 0, 0]}
          color={unresolved ? '#3d3200' : '#ffffff'} background={unresolved ? 'rgba(255,224,130,0.95)' : 'rgba(31,35,40,0.88)'} size={0.017} bold />
      </group>
      {xray && <Label text="Core position assumed central (imported mass)" position={[0, 0, -4]} size={0.011} color="#2b3f55" background="rgba(244,247,250,0.9)" />}
    </group>
  )
}

/** Flat-shaded geometry from the stored mesh (tower frame, z up). */
function meshGeometry(e: MeshEntry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(e.positions, 3))
  g.setIndex(new THREE.BufferAttribute(e.indices, 1))
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  flat.computeBoundingSphere()
  g.dispose()
  return flat
}

function plateLines(storeys: ImportedStorey[]): THREE.BufferGeometry {
  const pts: number[] = []
  for (const s of storeys) {
    if (!s.hasFloor) continue
    for (const r of s.loops) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; pts.push(p[0], p[1], s.z0 + 0.05, q[0], q[1], s.z0 + 0.05) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

function problemGeometry(e: MeshEntry): { open: THREE.BufferGeometry | null; flipped: THREE.BufferGeometry | null } | null {
  const open = e.openSegments.length ? new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(e.openSegments, 3)) : null
  let flipped: THREE.BufferGeometry | null = null
  if (e.flippedTriangles.length) {
    const pos = new Float32Array(e.flippedTriangles.length * 9)
    e.flippedTriangles.forEach((tri, k) => {
      for (let j = 0; j < 3; j++) { const v = e.indices[3 * tri + j]; pos.set([e.positions[3 * v], e.positions[3 * v + 1], e.positions[3 * v + 2]], 9 * k + 3 * j) }
    })
    flipped = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }
  return open || flipped ? { open, flipped } : null
}

/** When the mesh is not loaded (e.g. a reopened project), stack the sliced plates as slabs, coloured by program. */
function slabGeometry(storeys: ImportedStorey[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  for (const s of storeys) {
    if (!s.loops.length) continue
    const outers = s.loops.filter((r) => ringArea(r) > 0), holes = s.loops.filter((r) => ringArea(r) < 0)
    for (const o of outers) {
      const shape = new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x, y)))
      for (const h of holes) if (inRing(h[0], o)) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
      const ex = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, s.z1 - s.z0 - 0.15), bevelEnabled: false })
      const g = ex.index ? ex.toNonIndexed() : ex
      g.translate(0, 0, s.z0)
      color.set(s.hasFloor ? USES[s.use].color : VOID_COLOR)
      const n = g.getAttribute('position').count, c = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { c[3 * i] = color.r; c[3 * i + 1] = color.g; c[3 * i + 2] = color.b }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
      g.deleteAttribute('uv')
      parts.push(g)
    }
  }
  if (!parts.length) return null
  let count = 0
  for (const p of parts) count += p.getAttribute('position').count
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), nor = new Float32Array(count * 3)
  let o = 0
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, o); col.set(p.getAttribute('color').array as Float32Array, o)
    const nn = p.getAttribute('normal'); if (nn) nor.set(nn.array as Float32Array, o)
    o += p.getAttribute('position').count * 3
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return g
}

function ringArea(r: [number, number][]) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
function inRing(p: [number, number], r: [number, number][]) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
