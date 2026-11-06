// The sun-hours map's boundary, editable (Ruijie, 4 Nov: "when you click site and place a building it automatically
// makes a simulation area; add a function to modify the boundary"). SolarAreaEditor draws the area's outline with
// handles on the map (inside SolarOverlay, model frame z up): drag a corner or a side to resize it, the middle to move
// it; the solar run starts again when the handle is let go. SolarAreaControls is the panel part (the Site step and the
// solar node): the area's size, Edit boundary / Done, Reset to automatic. Display and study only: the public-space
// tests (Table 1) do not depend on the map's area. Rectangle maths: lib/solarArea.ts.
import { Html, Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Move, RotateCcw, SquareDashed } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { MapBounds } from '../engine/solarJob'
import { SOLAR_NODE, useSolar } from '../hooks/useSolarAccess'
import { sampleTerrain } from '../lib/cityLayers'
import { AREA_HANDLES, areaOutline, dragArea, handleAt, roundArea, type AreaHandle, type Pt } from '../lib/solarArea'
import { useStore } from '../store'
import { useCityData } from './CityContext'
import { U } from './Units'
import { flyToFit } from './VistaLook'
import Help from './Help'

const ORANGE = '#ea580c'
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')

/** The area shown for the open project: the user's, else the one the last run mapped (null before the first run). */
function useArea(): { b: MapBounds | null; custom: boolean } {
  const project = useStore((s) => s.project)
  const own = useSolar((s) => s.areas[project])
  const out = useSolar((s) => s.out)
  return { b: own ?? (out && out.project === project ? out.bounds : null), custom: !!own }
}

function setArea(b: MapBounds | null) {
  const project = useStore.getState().project, { areas, set } = useSolar.getState()
  const next = { ...areas }
  if (b) next[project] = roundArea(b); else delete next[project]
  set({ areas: next })
}

/** Start or stop editing; starting fits the area into the view in Real Vancouver, so every handle can be reached. */
export function editSolarArea(on: boolean, b: MapBounds | null) {
  useSolar.getState().set({ editing: on })
  if (!on || !b || useStore.getState().project !== 'city') return
  const g = useStore.getState().groundElevation, m = 0.12 * Math.max(b[2] - b[0], b[3] - b[1])
  flyToFit([[b[0] - m, b[1] - m, g], [b[2] + m, b[1] - m, g], [b[2] + m, b[3] + m, g], [b[0] - m, b[3] + m, g]])
}

// ---------------------------------------------------------------- on the map
export function SolarAreaEditor() {
  const editing = useSolar((s) => s.editing)
  const on = useStore((s) => !!s.enabled[SOLAR_NODE])
  const project = useStore((s) => s.project)
  const { b: area } = useArea()
  const { data } = useCityData()
  const { camera, gl, invalidate } = useThree()
  const group = useRef<THREE.Group>(null)
  const [draft, setDraft] = useState<MapBounds | null>(null)
  const drag = useRef<{ h: AreaHandle; from: Pt; start: MapBounds; z: number } | null>(null)
  const b = draft ?? area
  const city = project === 'city'
  const zAt = useMemo(() => (x: number, y: number) => (city && data ? (sampleTerrain(data.grids, x, y) ?? useStore.getState().groundElevation) + 3 : city ? useStore.getState().groundElevation + 3 : 0.5), [city, data])
  const outline = useMemo(() => (b ? areaOutline(b).map(([x, y]) => [x, y, zAt(x, y)] as [number, number, number]) : null), [b, zAt])

  // Esc (or leaving the project / switching the node off) ends editing.
  useEffect(() => {
    if (!editing) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !drag.current) useSolar.getState().set({ editing: false }) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editing])
  useEffect(() => { if (!on && editing) useSolar.getState().set({ editing: false }) }, [on, editing])

  /** The plan point under the pointer on the horizontal plane at height z (model frame). */
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const inv = useMemo(() => new THREE.Matrix4(), [])
  const hitAt = (cx: number, cy: number, z: number): Pt | null => {
    const g = group.current
    if (!g) return null
    const r = gl.domElement.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
    const l = ray.ray.clone().applyMatrix4(inv.copy(g.matrixWorld).invert())
    if (Math.abs(l.direction.z) < 1e-6) return null
    const k = (z - l.origin.z) / l.direction.z
    return k > 0 ? [l.origin.x + k * l.direction.x, l.origin.y + k * l.direction.y] : null
  }

  if (!editing || !on || !b || !outline) return null
  const [x0, y0, x1, y1] = b
  return (
    <group ref={group}>
      <Line points={outline} color={ORANGE} lineWidth={2.5} dashed dashSize={14} gapSize={8} depthTest={false} renderOrder={20} transparent opacity={0.95} />
      {AREA_HANDLES.map((h) => {
        const [hx, hy] = handleAt(b, h), move = h === 'move'
        return (
          <Html key={h} position={[hx, hy, zAt(hx, hy)]} center zIndexRange={[25, 0]}>
            <div role="button" aria-label={move ? 'Move the simulation area' : `Drag the ${h} ${h.length === 2 ? 'corner' : 'side'} of the simulation area`} data-area-handle={h}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation(); e.preventDefault()
                const z = zAt(hx, hy), p = hitAt(e.clientX, e.clientY, z)
                if (!p) return
                drag.current = { h, from: p, start: b, z }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (!d) return
                const p = hitAt(e.clientX, e.clientY, d.z)
                if (p) { setDraft(dragArea(d.start, d.h, d.from, p)); invalidate() }
              }}
              onPointerUp={(e) => {
                const d = drag.current
                drag.current = null
                e.currentTarget.releasePointerCapture?.(e.pointerId)
                if (!d) return
                const p = hitAt(e.clientX, e.clientY, d.z)
                setDraft(null)
                if (p && Math.hypot(p[0] - d.from[0], p[1] - d.from[1]) > 0.5) setArea(dragArea(d.start, d.h, d.from, p))
              }}
              style={{ touchAction: 'none', cursor: move ? 'move' : 'grab', borderColor: ORANGE, color: ORANGE }}
              className={move
                ? 'flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white/95 shadow'
                : 'h-3.5 w-3.5 rounded-[2px] border-2 bg-white shadow'}>
              {move && <Move size={14} aria-hidden />}
            </div>
          </Html>
        )
      })}
      {/* The live size, over the north side. */}
      <Html position={[(x0 + x1) / 2, y1, zAt((x0 + x1) / 2, y1)]} center zIndexRange={[24, 0]} style={{ pointerEvents: 'none', transform: 'translateY(-22px)' }}>
        <div className="whitespace-nowrap rounded bg-[#ea580c] px-1.5 py-0.5 text-[11px] font-semibold text-white shadow"><U>{`${fmt(x1 - x0)} m × ${fmt(y1 - y0)} m`}</U></div>
      </Html>
    </group>
  )
}

// ---------------------------------------------------------------- in the panels
const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** The simulation area's size and the buttons to edit or reset it (the Site step palette and the solar node). */
export function SolarAreaControls() {
  const editing = useSolar((s) => s.editing)
  const status = useSolar((s) => s.status)
  const { b, custom } = useArea()
  const cell = useSolar((s) => s.out?.map?.grid.cell ?? null)
  return (
    <div className="grid gap-1 text-[11px]" data-testid="solar-area">
      <div className="flex flex-wrap items-center gap-x-1">
        <b className="text-ink">Simulation area</b>
        <Help label="About the simulation area">
          <span className="block">The ground the sun-hours map covers. Automatic: a 1,280 m square around the tower, 5 m cells.</span>
          <span className="block">Edit boundary: drag a corner or a side of the orange boundary to resize it, the round handle to move it; the map runs again when you let go. Done or Esc to finish.</span>
          <span className="block">Your own area stays where it is when the tower moves. Large areas get coarser cells (at most 90,000). Reset to automatic goes back to the square around the tower.</span>
        </Help>
        {b ? <><U>{`${fmt(b[2] - b[0])} m × ${fmt(b[3] - b[1])} m`}</U>{custom ? ', set by you' : ', automatic: around the tower'}</> : status === 'running' ? 'computing…' : 'shown once the sun-hours map has run'}
        {b && cell && cell > 5 ? <span className="text-muted"><U>{` · ${cell} m cells`}</U></span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={editing} disabled={!b} onClick={() => editSolarArea(!editing, b)}
          className={`${btn} ${editing ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'} disabled:opacity-50`}><SquareDashed size={12} />{editing ? 'Done' : 'Edit boundary'}</button>
        {custom && <button type="button" onClick={() => { setArea(null); useSolar.getState().set({ editing: false }) }} className={`${btn} border-line hover:border-accent`}><RotateCcw size={12} />Reset to automatic</button>}
      </div>
    </div>
  )
}
