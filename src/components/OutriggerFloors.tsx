// Outrigger and belt-truss floors in Schematic (x-ray): a belt truss around the plate and outrigger arms from the core
// to the facade, at each level placed in the Structure node. Drawn in the tower frame (origin at the plate centre, z up).
import { useMemo } from 'react'
import * as THREE from 'three'
import { coreSide } from '../engine/massing'
import type { Floor, Tower } from '../engine/types'
import Label from './Label'

const COLOR = '#c0392b'

/** Line segments for one outrigger storey of height h: top and bottom chords, zig-zag diagonals on each face, X arms. */
function trussGeometry(w: number, d: number, h: number, core: number): THREE.BufferGeometry {
  const p: number[] = []
  const seg = (a: [number, number, number], b: [number, number, number]) => p.push(...a, ...b)
  const hw = w / 2, hd = d / 2, hc = core / 2
  const ring = (z: number) => {
    const c: [number, number, number][] = [[-hw, -hd, z], [hw, -hd, z], [hw, hd, z], [-hw, hd, z]]
    c.forEach((q, i) => seg(q, c[(i + 1) % 4]))
  }
  ring(0); ring(h)
  // Belt truss: diagonals along each face, about 6 m bays.
  const face = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(len / 6))
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n
      const x0 = a[0] + (b[0] - a[0]) * t0, y0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, y1 = a[1] + (b[1] - a[1]) * t1
      if (i % 2 === 0) seg([x0, y0, 0], [x1, y1, h]); else seg([x0, y0, h], [x1, y1, 0])
    }
  }
  face([-hw, -hd], [hw, -hd]); face([hw, -hd], [hw, hd]); face([hw, hd], [-hw, hd]); face([-hw, hd], [-hw, -hd])
  // Outrigger arms: an X from the core face to the facade on both axes, both sides.
  for (const s of [-1, 1]) {
    seg([s * hc, 0, 0], [s * hw, 0, h]); seg([s * hc, 0, h], [s * hw, 0, 0])
    seg([0, s * hc, 0], [0, s * hd, h]); seg([0, s * hc, h], [0, s * hd, 0])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  return g
}

export default function OutriggerFloors({ t, floors, visible, clip }: { t: Tower; floors: Floor[]; visible: boolean; clip: THREE.Plane[] | null }) {
  const levels = t.outriggerFloors ?? []
  const items = floors.filter((f) => !f.podium && levels.includes(f.level))
  const geo = useMemo(() => trussGeometry(t.width, t.depth, t.f2f, coreSide(t)), [t])
  if (!visible || !items.length) return null
  return (
    <>
      {items.map((f) => (
        <group key={f.level} position={[0, 0, f.z0]}>
          <lineSegments geometry={geo}><lineBasicMaterial color={COLOR} clippingPlanes={clip} /></lineSegments>
          <Label text={`Outrigger L${f.level}`} position={[-t.width / 2 - 8, 0, f.z1 - f.z0]} size={0.014} color="#ffffff" background="rgba(192,57,43,0.92)" bold />
        </group>
      ))}
    </>
  )
}
