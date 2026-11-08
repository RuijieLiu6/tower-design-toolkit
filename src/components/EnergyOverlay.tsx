// 3D overlay for the Energy & carbon node (research P04-M05): roofs and facade bands coloured by annual sun on the
// surface (kWh/m²·yr, after shading by context buildings and future towers), on the design system's sequential scale.
// An analytical colour layer: shown in the Analysis display mode with "Sun on surfaces" as its quantity, where the key
// under the view gives the units and the fixed range (components/DisplayMode.tsx). Each roof carries its own value.
import { useMemo } from 'react'
import * as THREE from 'three'
import { useEnergyCarbon } from '../hooks/useEnergyCarbon'
import { rampColour } from '../lib/displayMode'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { POA_RANGE, RAMP } from './energyRamp'
import Label from './Label'

export default function EnergyOverlay({ base = 0 }: { base?: number }) {
  const shown = useAnalysisLayer() === 'surface-sun'
  const res = useEnergyCarbon()
  const geom = useMemo(() => {
    if (!res) return null
    const pos: number[] = [], col: number[] = []
    const c = new THREE.Color()
    for (const s of res.pv.surfaces) {
      // The ramp is in sRGB (as the legend's gradient); vertex colours are linear, so convert once here.
      c.setRGB(...rampColour(RAMP, (s.poa - POA_RANGE[0]) / (POA_RANGE[1] - POA_RANGE[0])), THREE.SRGBColorSpace)
      const q = s.quad
      // Fan triangulation of the quad or roof polygon.
      for (let i = 1; i + 1 < q.length; i++) for (const p of [q[0], q[i], q[i + 1]]) { pos.push(p[0], p[1], p[2] + base); col.push(c.r, c.g, c.b) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [res, base])
  if (!shown || !res || !geom) return null
  const top = res.pv.surfaces.filter((s) => s.kind === 'roof')
  return (
    <group>
      <mesh geometry={geom} renderOrder={2}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.94} depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
      </mesh>
      {top.map((s) => {
        const c = s.quad.reduce((a, p) => [a[0] + p[0] / s.quad.length, a[1] + p[1] / s.quad.length, Math.max(a[2], p[2])], [0, 0, 0])
        return <Label key={s.id} position={[c[0], c[1], c[2] + base + 28]} text={`Roof ${Math.round(s.poa)} kWh/m²·yr`} size={0.016} />
      })}
    </group>
  )
}
