// Ground overlay for the solar-access node: sun hours (or hours lost) as a map, the tested public spaces outlined by
// result. The map is an analytical colour layer, so it shows only in the Analysis display mode (lib/displayMode.ts),
// where the key under the view names its quantity, units, range and missing data (components/DisplayMode.tsx).
// Lives in the z-up scene group of either scene (one hook line in Viewport.tsx).
import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { SolarJobOutput } from '../engine/solarJob'
import type { SunHours } from '../engine/solarRules'
import { useSolarAccess } from '../hooks/useSolarAccess'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { STATUS } from '../lib/design/tokens'
import { useStore } from '../store'
import Label from './Label'
import { SolarAreaEditor } from './SolarArea'

import { mapTexels } from './solarRamps'

function mapTexture(m: SunHours, view: 'hours' | 'loss'): THREE.DataTexture {
  const tex = new THREE.DataTexture(mapTexels(m, view), m.grid.nx, m.grid.ny, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  // Nearest: each cell is one computed value; blending neighbours would invent values between them.
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** Result outlines of the tested spaces: the status colours (always with a word on the label and in the results). */
const STATE_COLOR: Record<string, string> = { pass: STATUS.success.fg, fail: STATUS.error.fg, warn: STATUS.warning.fg, unknown: STATUS.pending.fg }

function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** The map draped on the terrain nodes the worker sampled (Real Vancouver), 1 m above the ground. */
function terrainGeometry(t: NonNullable<SolarJobOutput['mapTerrain']>): THREE.PlaneGeometry {
  const w = (t.nx - 1) * t.step, h = (t.ny - 1) * t.step
  const geom = new THREE.PlaneGeometry(w, h, t.nx - 1, t.ny - 1)
  const pos = geom.attributes.position as THREE.BufferAttribute
  // PlaneGeometry rows run from the top (+y) down; terrain rows run from y0 (south) up.
  for (let iy = 0; iy < t.ny; iy++) for (let ix = 0; ix < t.nx; ix++) pos.setZ(iy * t.nx + ix, t.z[(t.ny - 1 - iy) * t.nx + ix] + 1)
  pos.needsUpdate = true
  return geom
}

export default function SolarOverlay() {
  const { on, out, showMap, view } = useSolarAccess()
  // The map shows only in Analysis with sun hours as its quantity; the tested spaces' outlines stay in every mode.
  const mapShown = useAnalysisLayer() === 'solar'
  const phase = useStore((s) => s.phase)
  const project = useStore((s) => s.project)
  const current = out && out.project === project ? out : null
  const map = current?.map ?? null
  const tex = useMemo(() => (map ? mapTexture(map, view) : null), [map, view])
  const draped = useMemo(() => (current?.mapTerrain ? terrainGeometry(current.mapTerrain) : null), [current?.mapTerrain])
  useEffect(() => () => tex?.dispose(), [tex])
  useEffect(() => () => draped?.dispose(), [draped])
  if (!on || !current) return null
  const g = map?.grid
  const t = current.mapTerrain
  const city = current.project === 'city'
  return (
    <group>
      <SolarAreaEditor />
      {mapShown && showMap && g && tex && (
        <>
          {draped && t ? (
            <mesh geometry={draped} position={[t.x0 + ((t.nx - 1) * t.step) / 2, t.y0 + ((t.ny - 1) * t.step) / 2, 0]} renderOrder={1}>
              <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          ) : (
            <mesh position={[g.x0 + (g.nx * g.cell) / 2, g.y0 + (g.ny * g.cell) / 2, current.planeZ + 0.15]} renderOrder={1}>
              <planeGeometry args={[g.nx * g.cell, g.ny * g.cell]} />
              <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          )}
        </>
      )}
      {current.spaces.map((s) => {
        // VTC spaces come as mesh triangles (outline = hull); City parks come as real rings.
        const rings = city ? s.rings : [hull(s.rings.flat())]
        const c = rings.flat().reduce((a, p, _, all) => [a[0] + p[0] / all.length, a[1] + p[1] / all.length], [0, 0])
        const color = STATE_COLOR[s.state] ?? STATE_COLOR.unknown
        const z = s.z + (city ? 2 : 0.3)
        return (
          <group key={s.id}>
            {rings.map((ring, k) => (
              <Line key={k} points={[...ring, ring[0]].map(([x, y]) => [x, y, z] as [number, number, number])} color={color} lineWidth={2.5} dashed={!s.inTable1 && s.reading === 'unresolved'} dashSize={4} gapSize={3} />
            ))}
            {phase !== 'present' && (city || s.swept > 0 || s.state === 'fail') && (
              <Label text={`${s.name.replace(' (VTC model)', '')}: ${Math.round(s.swept)} m² new shadow`} position={[c[0], c[1], s.z + 8]} size={0.016} color={color} />
            )}
          </group>
        )
      })}
    </group>
  )
}
