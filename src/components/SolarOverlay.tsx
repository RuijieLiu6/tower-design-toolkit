// Ground overlay for the solar-access node: sun hours (or hours lost) as a heat map, the tested public spaces outlined
// by result, and a screen-sized legend. Lives in the z-up scene group of the VTC scene (one hook line in Viewport.tsx).
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAP_DATES } from '../engine/solarDates'
import type { SolarJobOutput } from '../engine/solarJob'
import type { SunHours } from '../engine/solarRules'
import { useSolarAccess } from '../hooks/useSolarAccess'
import { useStore } from '../store'
import Label from './Label'

import { HOURS_RAMP, LOSS_MAX_H, LOSS_RAMP } from './solarRamps'

const ramp = (stops: string[], t: number): [number, number, number] => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i
  const a = new THREE.Color(stops[i]), b = new THREE.Color(stops[i + 1])
  return [a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f]
}

function mapTexture(m: SunHours, view: 'hours' | 'loss'): THREE.DataTexture {
  const { nx, ny } = m.grid
  const data = new Uint8Array(nx * ny * 4)
  for (let k = 0; k < nx * ny; k++) {
    if (m.covered[k]) continue
    let rgb: [number, number, number], alpha: number
    if (view === 'hours') {
      rgb = ramp(HOURS_RAMP, m.possible > 0 ? m.proposal[k] / m.possible : 0)
      alpha = 0.72
    } else {
      const lost = m.baseline[k] - m.proposal[k]
      if (lost < 0.01) continue
      rgb = ramp(LOSS_RAMP, lost / LOSS_MAX_H)
      alpha = 0.82
    }
    data[k * 4] = rgb[0] * 255; data[k * 4 + 1] = rgb[1] * 255; data[k * 4 + 2] = rgb[2] * 255; data[k * 4 + 3] = alpha * 255
  }
  const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

const STATE_COLOR: Record<string, string> = { pass: '#2e8b57', fail: '#c0392b', warn: '#d98b1c', unknown: '#6b6f76' }

function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A legend drawn on a canvas and shown as a screen-sized sprite (no DOM inside the 3D view). */
function Legend({ view, title, possible, position }: { view: 'hours' | 'loss'; title: string; possible: number; position: [number, number, number] }) {
  const tex = useMemo(() => {
    const dpr = 2, w = 300 * dpr, h = 74 * dpr
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = 'rgba(255,255,255,0.92)'
    g.beginPath(); g.roundRect(0, 0, w, h, 10 * dpr); g.fill()
    g.fillStyle = '#1f2328'; g.font = `600 ${12 * dpr}px Inter, "Segoe UI", sans-serif`; g.textBaseline = 'top'
    g.fillText(title, 10 * dpr, 8 * dpr)
    const stops = view === 'hours' ? HOURS_RAMP : LOSS_RAMP
    const grad = g.createLinearGradient(10 * dpr, 0, w - 10 * dpr, 0)
    stops.forEach((s, i) => grad.addColorStop(i / (stops.length - 1), s))
    g.fillStyle = grad; g.fillRect(10 * dpr, 30 * dpr, w - 20 * dpr, 14 * dpr)
    g.fillStyle = '#4b5058'; g.font = `500 ${11 * dpr}px Inter, "Segoe UI", sans-serif`
    const left = view === 'hours' ? '0 h' : 'under 1 h', right = view === 'hours' ? `${possible.toFixed(possible % 1 ? 1 : 0)} h (all)` : `${LOSS_MAX_H} h or more`
    g.fillText(left, 10 * dpr, 50 * dpr)
    g.textAlign = 'right'; g.fillText(right, w - 10 * dpr, 50 * dpr)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [view, title, possible])
  useEffect(() => () => tex.dispose(), [tex])
  const sprite = useRef<THREE.Sprite>(null)
  const size = 0.05, aspect = 300 / 74
  useFrame(({ camera }) => {
    if (!sprite.current) return
    const f = Math.tan(THREE.MathUtils.degToRad(((camera as THREE.PerspectiveCamera).fov ?? 38) / 2)) / Math.tan(THREE.MathUtils.degToRad(19))
    sprite.current.scale.set(size * aspect * f, size * f, 1)
  })
  return (
    <sprite ref={sprite} position={position} renderOrder={11}>
      <spriteMaterial map={tex} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  )
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
  const { on, out, showMap, view, mapDate } = useSolarAccess()
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
  const date = MAP_DATES.find((d) => d.id === mapDate)!
  const city = current.project === 'city'
  return (
    <group>
      {showMap && g && tex && (
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
          {phase !== 'present' && (
            /* In front of the site, toward the default camera (south-east in the model grid), so it is on screen. */
            <Legend view={view} possible={map!.possible} position={[current.centre[0] + 120, current.centre[1] - 120, current.planeZ + 4]}
              title={view === 'hours' ? `Sun hours · ${date.label}` : `Sun lost to the design · ${date.label}`} />
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
