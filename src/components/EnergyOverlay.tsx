// 3D overlay for the Energy & carbon node (research P04-M05): roofs and facade bands coloured by annual sun on the
// surface (kWh/m²·yr, after shading by context buildings and future towers). Shown while the node is selected.
import { useMemo } from 'react'
import * as THREE from 'three'
import { ENERGY_NODE, useEnergyCarbon } from '../hooks/useEnergyCarbon'
import { useStore } from '../store'
import { POA_RANGE, RAMP } from './energyRamp'
import Label from './Label'

function rampColor(t: number): THREE.Color {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  return new THREE.Color(RAMP[i]).lerp(new THREE.Color(RAMP[i + 1]), x - i)
}

export default function EnergyOverlay({ base = 0 }: { base?: number }) {
  const selected = useStore((s) => s.selectedNode)
  const res = useEnergyCarbon()
  const geom = useMemo(() => {
    if (!res) return null
    const pos: number[] = [], col: number[] = []
    for (const s of res.pv.surfaces) {
      const c = rampColor((s.poa - POA_RANGE[0]) / (POA_RANGE[1] - POA_RANGE[0]))
      const q = s.quad
      // Fan triangulation of the quad or roof polygon.
      for (let i = 1; i + 1 < q.length; i++) for (const p of [q[0], q[i], q[i + 1]]) { pos.push(p[0], p[1], p[2] + base); col.push(c.r, c.g, c.b) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [res, base])
  if (selected !== ENERGY_NODE || !res || !geom) return null
  const top = res.pv.surfaces.filter((s) => s.kind === 'roof')
  return (
    <group>
      <mesh geometry={geom} renderOrder={2}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.92} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {top.map((s) => {
        const c = s.quad.reduce((a, p) => [a[0] + p[0] / s.quad.length, a[1] + p[1] / s.quad.length, Math.max(a[2], p[2])], [0, 0, 0])
        return <Label key={s.id} position={[c[0], c[1], c[2] + base + 28]} text={`Modelled sun on surfaces, kWh/m²·yr (${POA_RANGE[0]} blue → ${POA_RANGE[1]} yellow) · roof ${Math.round(s.poa)}`} size={0.018} />
      })}
    </group>
  )
}
