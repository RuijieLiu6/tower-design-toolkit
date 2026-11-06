// Basements dug into the ground (engine/basement.ts; Ruijie, 6 Nov: "assume that users will need to dig on the ground to
// bring in basement levels"). Always: the dig's outline on the ground. In the dig view (Below grade tool): every level as
// a translucent box seen through the ground, its slab lines, and on the competition block the ramp from each ramp pin of
// the parking node down to B1. Drawn in the model frame (x east, y north, z up), inside the scene's rotated group.
import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { basementLevels, basementRing, RAMP_SLOPE, RAMP_TRANSITIONS, RAMP_WIDTH } from '../engine/basement'
import { accessXY } from '../engine/mobility'
import { VTC_EDGES } from '../engine/publicRealm'
import type { Tower } from '../engine/types'
import { prism } from '../lib/export/scene'
import { useMobilityStore } from '../lib/mobilityStore'
import { useStore, useTowers } from '../store'

/** The dig view: basements and ramps seen through the ground. Session only. */
export const useDig = create<{ dig: boolean }>(() => ({ dig: false }))

const LEVEL = '#3d5a80', EDGE = '#1d2b3a', RAMP = '#c9822b'

function prismGeometry(ring: [number, number][], z0: number, z1: number) {
  const { positions, indices } = prism(ring, z0, z1)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function TowerBasement({ t, base, dig }: { t: Tower; base: number; dig: boolean }) {
  const levels = useMemo(() => basementLevels(t), [t])
  const ring = useMemo(() => basementRing(t), [t])
  const geos = useMemo(() => (dig ? levels.map((l) => prismGeometry(ring, base + l.z0, base + l.z1)) : []), [dig, levels, ring, base])
  if (!levels.length) return null
  const outline = [...ring, ring[0]].map(([x, y]) => [x, y, base + 0.08] as [number, number, number])
  return (
    <group name={`basement-${t.id}`}>
      <Line points={outline} color={EDGE} lineWidth={1.4} dashed dashSize={2} gapSize={1.2} />
      {dig && geos.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} renderOrder={20} raycast={() => null}>
            <meshBasicMaterial color={LEVEL} transparent opacity={0.42} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* The slab at the bottom of each level. */}
          <Line points={[...ring, ring[0]].map(([x, y]) => [x, y, base + levels[i].z0] as [number, number, number])} color={EDGE} lineWidth={1} depthTest={false} renderOrder={21} />
        </group>
      ))}
    </group>
  )
}

/** The ramp from a ramp pin on the competition block: inward from the property line, down to the floor of B1. */
function Ramp({ from, inward, depth, base }: { from: [number, number]; inward: [number, number]; depth: number; base: number }) {
  const len = depth / RAMP_SLOPE + RAMP_TRANSITIONS
  const geo = useMemo(() => {
    const [x, y] = from, [ix, iy] = inward, ax = -iy, ay = ix, w = RAMP_WIDTH / 2
    const p = [
      [x + ax * w, y + ay * w, base], [x - ax * w, y - ay * w, base],
      [x - ax * w + ix * len, y - ay * w + iy * len, base - depth], [x + ax * w + ix * len, y + ay * w + iy * len, base - depth],
    ]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    return g
  }, [from, inward, len, depth, base])
  return (
    <mesh geometry={geo} renderOrder={22} raycast={() => null}>
      <meshBasicMaterial color={RAMP} transparent opacity={0.7} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function BelowGrade() {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const dig = useDig((s) => s.dig)
  const access = useMobilityStore((s) => s.access)
  const base = project === 'city' ? ground : 0
  const withBasement = towers.filter((t) => (t.basement?.levels ?? 0) > 0)
  if (!withBasement.length) return null
  // The ramp goes down to the floor of B1 of the deepest basement on the block.
  const b1 = Math.max(...withBasement.map((t) => t.basement!.f2f))
  return (
    <group name="below-grade">
      {withBasement.map((t) => <TowerBasement key={t.id} t={t} base={base} dig={dig} />)}
      {dig && project === 'vtc' && access.filter((a) => a.kind === 'ramp').map((a) => {
        const e = VTC_EDGES.find((v) => v.id === a.edge)!
        return <Ramp key={a.id} from={accessXY(a)} inward={[-e.out[0], -e.out[1]]} depth={b1} base={base} />
      })}
    </group>
  )
}
