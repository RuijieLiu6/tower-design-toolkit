// The uploaded model's lot line and context buildings in the 3D view (Layer 0 interchange, lib/interchange). Inside the
// scene's Z-up group, in the project frame; `base` is the tower base (0 on the competition site, the ground elevation in
// Real Vancouver). Static geometry: React re-renders it when the model changes, so it needs no useFrame (renderPacer.tsx).
import { useMemo } from 'react'
import * as THREE from 'three'
import { closedPrism } from '../../lib/interchange/converters'
import { ROLE_COLOR } from '../../lib/interchange/model'
import { useStore } from '../../store'

/** Lifts the lot line clear of the ground so it never flickers into it (m). */
const LINE_LIFT = 0.35

export default function ModelOverlay({ base = 0, xray = false }: { base?: number; xray?: boolean }) {
  const model = useStore((s) => s.models[s.project])
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
  const context = useMemo(() => {
    if (!model) return null
    const positions: number[] = [], indices: number[] = []
    for (const e of model.elements) {
      if (e.role !== 'context' || e.geometry.kind !== 'prism') continue
      const m = closedPrism(e.geometry.rings, base + e.geometry.z0, base + e.geometry.z1)
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
  }, [model, base])
  if (!site && !context) return null
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
      {site && <lineSegments geometry={site}><lineBasicMaterial color={ROLE_COLOR.site} linewidth={2} /></lineSegments>}
    </group>
  )
}
