// Ground overlay of the pedestrian wind comfort node (Sun & Wind Studio port, engine/windComfort.ts): her 680 × 440 m
// domain as one image on the ground, each 4 m cell in its Lawson band colour, with the tower, without it, or the change
// in band between the two. An analytical colour layer: shown in the Analysis display mode with "Wind comfort" as its
// quantity (picking the node opens it), with the bands and their limits in the key under the view. Indicative, not CFD.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { lawsonBand, WIND_GRID, type WindField } from '../engine/windComfort'
import { BAND_COLOURS } from '../engine/windComfortInput'
import { useWindComfort, useWindComfortStore } from '../hooks/useWindComfort'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { STATUS } from '../lib/design/tokens'
import Label from './Label'

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const BAND_RGB = BAND_COLOURS.map(rgb)

/** The texels of one field: row iy of the texture is row iy of her grid (ymin at row 0, so +y = north with flipY off). */
export function fieldTexels(view: 'with' | 'without' | 'change', a: WindField, b: WindField, U: number): Uint8Array {
  const n = a.nx * a.ny, out = new Uint8Array(n * 4)
  for (let k = 0; k < n; k++) {
    let c: [number, number, number] | null = null
    if (view === 'with') { if (!a.solid[k]) c = BAND_RGB[lawsonBand(a.ratio[k] * U)] }
    else if (view === 'without') { if (!b.solid[k]) c = BAND_RGB[lawsonBand(b.ratio[k] * U)] }
    else if (!a.solid[k] && !b.solid[k]) {
      const d = lawsonBand(a.ratio[k] * U) - lawsonBand(b.ratio[k] * U)
      if (d < 0) c = BAND_RGB[0]; else if (d > 0) c = BAND_RGB[4]
    }
    if (c) { out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; out[k * 4 + 3] = 255 }
  }
  return out
}

function fieldTexture(view: 'with' | 'without' | 'change', a: WindField, b: WindField, U: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(fieldTexels(view, a, b, U), a.nx, a.ny, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  // Nearest: each cell is one computed band; blending neighbours would invent values between them.
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}

const W = WIND_GRID.xmax - WIND_GRID.xmin, H = WIND_GRID.ymax - WIND_GRID.ymin

export default function WindComfortOverlay({ base = 0 }: { base?: number }) {
  const shown = useAnalysisLayer() === 'wind-comfort'
  const { out } = useWindComfort()
  const view = useWindComfortStore((s) => s.view)
  const r = out?.result ?? null
  const tex = useMemo(() => (r ? fieldTexture(view, r.a, r.b, r.U) : null), [r, view])
  useEffect(() => () => tex?.dispose(), [tex])
  if (!shown || !out || !r || !tex) return null
  const [cx, cy] = out.centre
  return (
    <group position={[0, 0, base]}>
      <mesh position={[cx + (WIND_GRID.xmin + WIND_GRID.xmax) / 2, cy + (WIND_GRID.ymin + WIND_GRID.ymax) / 2, 0.15]} renderOrder={2}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={tex} transparent opacity={0.75} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <Label text="Pedestrian wind, Sun & Wind Studio port: indicative, not CFD" position={[cx, cy + WIND_GRID.ymin - 12, 4]} size={0.013} color={STATUS.warning.fg} background={STATUS.warning.surface} />
    </group>
  )
}
