// The competition block's four streets as streets (16 Nov, Sinnie: "i want to be able to see actual street and not
// just a line"): each one drawn to its measured right-of-way (engine/publicRealm VTC_EDGES: the retail high street
// 24.3 m, the arterial 30.2 m, the two local streets 20.1 m), as a sidewalk on each side, an asphalt carriageway and a
// dashed centre line, running past the block's corners through the intersections. Sidewalk widths are a team
// assumption (a quarter of the right-of-way, 3–5 m); the carriageway is the rest. Flat on the ground, never picked.
import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { VTC_EDGES, VTC_SITE } from '../engine/publicRealm'

const ASPHALT = '#8f9398', WALK = '#d6d6d2', MARK = '#f4f4f0'
const NO_RAYCAST = () => null
/** How far each street runs past the block's corners, beyond the crossing street (m). */
const RUN_ON = 70

interface Strip { x0: number; y0: number; x1: number; y1: number; z: number; color: string }

export default function VtcStreets() {
  const { strips, marks } = useMemo(() => {
    const S = VTC_SITE, strips: Strip[] = [], marks: [number, number, number][][] = []
    const rowOf = (id: string) => VTC_EDGES.find((e) => e.id === id)?.row ?? 20
    for (const e of VTC_EDGES) {
      const row = e.row, walk = Math.min(5, Math.max(3, row / 4))
      const ns = e.id === 'north' || e.id === 'south'
      // Along the street: the block's side plus the crossing streets and a run beyond them.
      const a0 = ns ? S.xMin - rowOf('west') - RUN_ON : S.yMin - rowOf('south') - RUN_ON
      const a1 = ns ? S.xMax + rowOf('east') + RUN_ON : S.yMax + rowOf('north') + RUN_ON
      // Across: from the property line outwards.
      const line = e.id === 'south' ? S.yMin : e.id === 'north' ? S.yMax : e.id === 'west' ? S.xMin : S.xMax
      const sgn = e.id === 'south' || e.id === 'west' ? -1 : 1
      const band = (c0: number, c1: number, z: number, color: string) => {
        const lo = Math.min(line + sgn * c0, line + sgn * c1), hi = Math.max(line + sgn * c0, line + sgn * c1)
        strips.push(ns ? { x0: a0, x1: a1, y0: lo, y1: hi, z, color } : { x0: lo, x1: hi, y0: a0, y1: a1, z, color })
      }
      band(0, walk, 0.06, WALK)
      band(row - walk, row, 0.06, WALK)
      band(walk, row - walk, 0.14, ASPHALT)
      const mid = line + sgn * (row / 2)
      // The centre line along the block's side only (not through the intersections).
      const b0 = ns ? S.xMin : S.yMin, b1 = ns ? S.xMax : S.yMax
      for (let a = b0; a + 3 <= b1; a += 6) marks.push(ns ? [[a, mid, 0.2], [a + 3, mid, 0.2]] : [[mid, a, 0.2], [mid, a + 3, 0.2]])
    }
    return { strips, marks }
  }, [])
  return (
    <group name="vtc-streets">
      {strips.map((s, i) => (
        <mesh key={i} position={[(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, s.z]} raycast={NO_RAYCAST} receiveShadow>
          <planeGeometry args={[s.x1 - s.x0, s.y1 - s.y0]} />
          <meshStandardMaterial color={s.color} roughness={1} />
        </mesh>
      ))}
      {marks.length > 0 && <Line points={marks.flat()} segments color={MARK} lineWidth={1.5} raycast={NO_RAYCAST} />}
    </group>
  )
}
