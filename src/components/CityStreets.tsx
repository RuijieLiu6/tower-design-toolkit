import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { groundDisplayPatch } from '../lib/terrainDetails'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import type { StreetData } from '../lib/cityGeometry'
import Label from './Label'

export const useStreetDisplay = create<{ surfaces: boolean; names: boolean }>(() => ({ surfaces: true, names: false }))

/** City street ROW centre lines, with approximate road ribbons using recorded engineering surface widths. */
export default function CityStreets({ streets, ground, coarse }: { streets: StreetData | null; ground: HeightGrid[]; coarse: HeightGrid }) {
  const { surfaces, names } = useStreetDisplay()
  const grids = useMemo(() => [...ground.map((g) => groundDisplayPatch(g, coarse)), coarse], [ground, coarse])
  const { meshes, lines, labels } = useMemo(() => {
    const z = (x: number, y: number) => Math.max(0, sampleTerrain(grids, x, y) ?? 0) + 0.18
    const meshes = streets ? Object.entries(streets.meshes).map(([kind, m]) => {
      const pos = new Float32Array(m.positions.length / 2 * 3)
      for (let k = 0; k < m.positions.length; k += 2) { const x = m.positions[k], y = m.positions[k + 1]; pos.set([x, y, z(x, y)], k / 2 * 3) }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(m.indices); g.computeVertexNormals()
      return { kind, geometry: g }
    }) : []
    const linePoints: number[] = [], choices = new Map<string, { position: [number, number, number]; score: number }>()
    for (const l of streets?.lines ?? []) {
      // Centre-line references remain available for missing-width and bridge segments.
      if (!surfaces || l.width === null || l.bridge) for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1], b = l.points[i]; linePoints.push(a[0], a[1], z(...a) + .12, b[0], b[1], z(...b) + .12)
      }
      if (l.kind !== 'street' || !/^(ROBSON|GEORGIA|W GEORGIA|DAVIE|DENMAN|BURRARD|GRANVILLE|HOWE|HORNBY|SEYMOUR|THURLOW|ALBERNI|W PENDER|DUNSMUIR) (ST|AV)/.test(l.name)) continue
      const p = l.points[Math.floor(l.points.length / 2)], score = Math.hypot(p[0] + 500, p[1] - 500)
      if (score < (choices.get(l.name)?.score ?? Infinity)) choices.set(l.name, { position: [p[0], p[1], z(...p) + 4], score })
    }
    const lines = new THREE.BufferGeometry(); lines.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3))
    return { meshes, lines, labels: [...choices].map(([name, v]) => ({ name, position: v.position })) }
  }, [streets, grids, surfaces])
  useEffect(() => () => { meshes.forEach((m) => m.geometry.dispose()); lines.dispose() }, [meshes, lines])
  if (!streets) return null
  return <>
    {surfaces && meshes.map((m) => <mesh key={m.kind} geometry={m.geometry} receiveShadow renderOrder={1}>
      <meshStandardMaterial color={m.kind === 'lane' ? '#a9a9a4' : '#8a8e90'} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>)}
    <lineSegments geometry={lines} renderOrder={2}><lineBasicMaterial color="#6b7378" /></lineSegments>
    {names && labels.map((l) => <Label key={l.name} text={l.name} position={l.position} size={.013} color="#3d434b" />)}
  </>
}
