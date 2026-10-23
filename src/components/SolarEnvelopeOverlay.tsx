// 3D overlay of the solar envelope (components/SolarEnvelope.tsx computes it): translucent columns over the selected
// tower's site, amber where the tower fits under them, red where it rises through.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import Label from './Label'
import { useSolarEnvelope } from './SolarEnvelope'

/** Translucent columns, amber where the tower fits under them, red where it pokes through. */
export default function SolarEnvelopeOverlay() {
  const r = useSolarEnvelope()
  const ref = useRef<THREE.InstancedMesh>(null)
  const cells = useMemo(() => {
    if (!r) return []
    const out: { x: number; y: number; h: number; over: boolean }[] = []
    const { env } = r
    for (let j = 0; j < env.ny; j++) for (let i = 0; i < env.nx; i++) {
      const h = env.h[j * env.nx + i]
      if (h >= env.cap) continue
      out.push({ x: env.x0 + (i + 0.5) * env.cell, y: env.y0 + (j + 0.5) * env.cell, h: Math.max(0.3, h), over: r.tower.height > h + 0.01 })
    }
    return out
  }, [r])
  useEffect(() => {
    const m = ref.current
    if (!m || !r) return
    const o = new THREE.Object3D(), amber = new THREE.Color('#e0a23a'), red = new THREE.Color('#d0453a')
    cells.forEach((c, k) => {
      o.position.set(c.x, c.y, r.base + c.h / 2); o.scale.set(r.env.cell * 0.98, r.env.cell * 0.98, c.h); o.updateMatrix()
      m.setMatrixAt(k, o.matrix); m.setColorAt(k, c.over ? red : amber)
    })
    m.count = cells.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cells, r])
  if (!r || !cells.length) return null
  const top = r.under.min < r.env.cap ? r.under.min : null
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, cells.length]} renderOrder={3}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.22} depthWrite={false} vertexColors={false} />
      </instancedMesh>
      {top !== null && <Label position={[r.tower.x, r.tower.y, r.base + top + 12]} text={`Solar envelope over the tower: ${Math.round(top)} m${r.under.by ? ` (${r.under.by})` : ''}`} size={0.018} />}
    </group>
  )
}
