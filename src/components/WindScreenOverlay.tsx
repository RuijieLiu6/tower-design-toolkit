// Ground overlay of the pedestrian wind screen (research P03-M03 visualisation): indicative risk zones coloured Low /
// Medium / High (downwash bands, corner wedges, aligned gaps) and an arrow per strong-wind direction. An analytical
// colour layer: shown in the Analysis display mode with "Wind risk" as its quantity (picking the node opens it), with
// the levels in the key under the view. Zone sizes are drawing rules (team assumption), not predicted extents.
import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { upwind } from '../engine/windScreen'
import { VTC_NORTH_DEG } from '../context'
import { useWindScreen } from '../hooks/useWindScreen'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { STATUS } from '../lib/design/tokens'
import { useStore } from '../store'
import Label from './Label'
import { LEVEL_COLOR } from './WindScreenResults'

export default function WindScreenOverlay({ base = 0 }: { base?: number }) {
  const shown = useAnalysisLayer() === 'wind'
  const project = useStore((s) => s.project)
  const res = useWindScreen()
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const meshes = useMemo(() => {
    if (!res) return []
    // Low first so High draws on top where zones overlap.
    const order = { low: 0, medium: 1, high: 2 }
    return [...res.zones].sort((a, b) => order[a.level] - order[b.level]).map((z, i) => {
      const shape = new THREE.Shape(z.poly.map(([x, y]) => new THREE.Vector2(x, y)))
      const g = new THREE.ShapeGeometry(shape)
      const edge = [...z.poly, z.poly[0]].map(([x, y]) => [x, y, 0] as [number, number, number])
      return { z, g, edge, lift: 0.3 + i * 0.01 }
    })
  }, [res])
  const arrows = useMemo(() => {
    if (!res || !res.towers.length) return []
    const t = res.towers[0]
    const tw = useStore.getState().towers[project].find((x) => x.id === t.tower)
    if (!tw) return []
    const reach = Math.max(90, Math.min(260, t.height * 0.75))
    return res.sectors.map((s) => {
      const u = upwind(s.fromDeg, north)
      const from = new THREE.Vector3(tw.x + u[0] * reach, tw.y + u[1] * reach, 1)
      const dir = new THREE.Vector3(-u[0], -u[1], 0)
      const len = reach * 0.45
      return { s, from, dir, len, label: new THREE.Vector3(tw.x + u[0] * (reach + 14), tw.y + u[1] * (reach + 14), 4) }
    })
  }, [res, project, north])
  if (!shown || !res) return null
  return (
    <group position={[0, 0, base]}>
      {meshes.map(({ z, g, edge, lift }) => (
        <group key={z.id} position={[0, 0, z.z + lift]}>
          <mesh geometry={g} renderOrder={3}>
            <meshBasicMaterial color={LEVEL_COLOR[z.level]} transparent opacity={0.3 + 0.35 * Math.min(1, z.share * 1.6)} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <Line points={edge} color={LEVEL_COLOR[z.level]} lineWidth={z.level === 'high' ? 2.5 : 1.5} />
        </group>
      ))}
      {arrows.map((a) => (
        <group key={a.s.name}>
          <arrowHelper args={[a.dir, a.from, a.len, '#1f4e8c', Math.min(24, a.len * 0.3), Math.min(14, a.len * 0.18)]} />
          <Label text={`Wind from ${a.s.name} · ${Math.round(a.s.share * 100)}% of strong hours`} position={[a.label.x, a.label.y, a.label.z]} size={0.013} />
        </group>
      ))}
      <Label text="Wind screening, not CFD: indicative zones" position={[arrows[0]?.from.x ?? 0, (arrows[0]?.from.y ?? 0) - 30, 4]} size={0.013} color={STATUS.warning.fg} background={STATUS.warning.surface} />
    </group>
  )
}
