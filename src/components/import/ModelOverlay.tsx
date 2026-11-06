// The uploaded model's lot line, context buildings, landscape, urban design and below-grade volumes in the 3D view
// (Layer 0 interchange, lib/interchange). Inside the scene's Z-up group, in the project frame; `base` is the tower base (0
// on the competition site, the ground elevation in Real Vancouver). Below-grade volumes show in the dig view only (Below
// grade tool), through the ground. Static geometry: React re-renders it when the model changes (no useFrame).
import { useMemo } from 'react'
import * as THREE from 'three'
import { closedPrism } from '../../lib/interchange/converters'
import { ROLE_COLOR, type Role } from '../../lib/interchange/model'
import { useStore } from '../../store'
import { useDig } from '../BelowGrade'

/** Lifts the lot line clear of the ground so it never flickers into it (m). */
const LINE_LIFT = 0.35
/** Flat landscape and paving surfaces get this much thickness so they read on the ground (m). */
const MIN_THICKNESS = 0.3

type Model = NonNullable<ReturnType<typeof useStore.getState>['models']['vtc']>

function prisms(model: Model | null, role: Role, base: number) {
  if (!model) return null
  const positions: number[] = [], indices: number[] = []
  for (const e of model.elements) {
    if (e.role !== role || e.geometry.kind !== 'prism') continue
    const z0 = base + e.geometry.z0, z1 = Math.max(z0 + MIN_THICKNESS, base + e.geometry.z1)
    const m = closedPrism(e.geometry.rings, z0, z1)
    const off = positions.length / 3
    positions.push(...m.positions)
    for (const k of m.indices) indices.push(k + off)
  }
  if (!indices.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return { mesh: g, edges: new THREE.EdgesGeometry(g, 20) }
}

export default function ModelOverlay({ base = 0, xray = false }: { base?: number; xray?: boolean }) {
  const model = useStore((s) => s.models[s.project])
  const dig = useDig((s) => s.dig)
  const site = useMemo(() => {
    if (!model) return null
    const pts: number[] = []
    for (const e of model.elements) {
      if (e.role !== 'site' || e.geometry.kind !== 'polygon') continue
      const z = base + e.geometry.z + LINE_LIFT
      for (const ring of e.geometry.rings) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; pts.push(a[0], a[1], z, b[0], b[1], z) }
    }
    if (!pts.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [model, base])
  const context = useMemo(() => prisms(model, 'context', base), [model, base])
  const landscape = useMemo(() => prisms(model, 'landscape', base), [model, base])
  const urban = useMemo(() => prisms(model, 'urban', base), [model, base])
  const below = useMemo(() => prisms(model, 'basement', base), [model, base])
  if (!site && !context && !landscape && !urban && !below) return null
  return (
    <group name="uploaded-model-overlay">
      {context && (
        <>
          <mesh geometry={context.mesh} castShadow receiveShadow>
            <meshStandardMaterial color={ROLE_COLOR.context} roughness={0.95} transparent={xray} opacity={xray ? 0.35 : 1} depthWrite={!xray} />
          </mesh>
          <lineSegments geometry={context.edges}><lineBasicMaterial color="#6f6a61" transparent opacity={xray ? 0.5 : 0.8} /></lineSegments>
        </>
      )}
      {landscape && (
        <mesh geometry={landscape.mesh} receiveShadow castShadow>
          <meshStandardMaterial color={ROLE_COLOR.landscape} roughness={1} transparent={xray} opacity={xray ? 0.4 : 1} />
        </mesh>
      )}
      {urban && (
        <>
          <mesh geometry={urban.mesh} receiveShadow castShadow>
            <meshStandardMaterial color={ROLE_COLOR.urban} roughness={0.9} transparent={xray} opacity={xray ? 0.4 : 1} />
          </mesh>
          <lineSegments geometry={urban.edges}><lineBasicMaterial color="#7d6a45" transparent opacity={0.7} /></lineSegments>
        </>
      )}
      {below && dig && (
        <>
          <mesh geometry={below.mesh} renderOrder={20} raycast={() => null}>
            <meshBasicMaterial color={ROLE_COLOR.basement} transparent opacity={0.4} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={below.edges} renderOrder={21}><lineBasicMaterial color="#1d2b3a" depthTest={false} /></lineSegments>
        </>
      )}
      {site && <lineSegments geometry={site}><lineBasicMaterial color={ROLE_COLOR.site} linewidth={2} /></lineSegments>}
    </group>
  )
}
