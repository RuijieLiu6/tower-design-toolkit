// View-cone max-height surface (Context Model C01-M03): the lowest estimated cone limit at every point of downtown,
// around the selected tower, or over an area the user draws; a "max height here" readout under the cursor; and the
// lower-boundary parameters of every cone with their sources and evidence flags. Maths: engine/heightSurface.ts.
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { ROOF_ALIGNED, limitGrid, maxHeightAt, type HeightAt, type LimitGrid } from '../engine/heightSurface'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { FlagChip } from './ui'
import { U } from './Units'

/** Geodetic limit bands. One blue ramp, light to dark (validated as an ordinal ramp: monotone, visible steps). */
export const LIMIT_BANDS = [
  { below: 40, color: '#86b6ef', label: 'under 40 m' },
  { below: 80, color: '#5598e7', label: '40–80 m' },
  { below: 120, color: '#2a78d6', label: '80–120 m' },
  { below: 150, color: '#1c5cab', label: '120–150 m' },
  { below: Infinity, color: '#104281', label: '150 m or more' },
]
const UNKNOWN_FILL = '#c9ccd1', UNKNOWN_HATCH = '#6b7079', BAND_EDGE = '#0b2545'
const bandOf = (z: number) => LIMIT_BANDS.findIndex((b) => z < b.below)

type Area = 'downtown' | 'site' | 'drawn'
type Box = [number, number, number, number] // local x0, y0, x1, y1 (EPSG:26910 minus CITY_ORIGIN)
interface SurfaceState {
  on: boolean
  area: Area
  drawn: Box | null
  drawing: boolean
  corner: [number, number] | null
  hover: { x: number; y: number; at: HeightAt; ground: number | null } | null
}
export const useHeightSurface = create<SurfaceState>(() => ({ on: false, area: 'downtown', drawn: null, drawing: false, corner: null, hover: null }))

/** The footprint layer's extent: the downtown peninsula and the south False Creek shore. */
const DOWNTOWN: Box = [-2400, -2000, 2500, 1900]
const SITE_HALF = 300

/** Terrain clicks while drawing an area set its two corners. Returns true when the click was used. */
export function drawClick(x: number, y: number): boolean {
  const s = useHeightSurface.getState()
  if (!s.drawing) return false
  if (!s.corner) { useHeightSurface.setState({ corner: [x, y] }); return true }
  const [ax, ay] = s.corner
  if (Math.abs(x - ax) < 20 || Math.abs(y - ay) < 20) return true // too thin: wait for a better second corner
  useHeightSurface.setState({ drawn: [Math.min(ax, x), Math.min(ay, y), Math.max(ax, x), Math.max(ay, y)], drawing: false, corner: null, area: 'drawn', on: true })
  return true
}

function useAreaBox(): { box: Box | null; step: number } {
  const { area, drawn } = useHeightSurface()
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel)
  if (area === 'downtown') return { box: DOWNTOWN, step: 10 }
  if (area === 'site') return t ? { box: [t.x - SITE_HALF, t.y - SITE_HALF, t.x + SITE_HALF, t.y + SITE_HALF], step: 2 } : { box: null, step: 2 }
  if (!drawn) return { box: null, step: 2 }
  const size = Math.max(drawn[2] - drawn[0], drawn[3] - drawn[1])
  return { box: drawn, step: Math.max(2, Math.ceil(size / 500)) }
}

/** Colour bands, a hatch where the limit is unknown, nothing where no cone applies, and a line between bands. */
function surfaceTexture(g: LimitGrid): THREE.CanvasTexture {
  const s = Math.max(1, Math.min(4, Math.floor(2048 / Math.max(g.cols, g.rows))))
  const W = g.cols * s, H = g.rows * s
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const bands = LIMIT_BANDS.map((b) => rgb(b.color)), fill = rgb(UNKNOWN_FILL), hatch = rgb(UNKNOWN_HATCH), edge = rgb(BAND_EDGE)
  const code = new Int8Array(g.state.length) // band index, -1 unknown, -2 none
  for (let k = 0; k < code.length; k++) code[k] = g.state[k] === 0 ? -2 : g.state[k] === 1 ? -1 : bandOf(g.limit[k])
  for (let py = 0; py < H; py++) {
    const r = g.rows - 1 - Math.floor(py / s) // canvas runs north to south
    for (let px = 0; px < W; px++) {
      const c = Math.floor(px / s), k = r * g.cols + c, b = code[k], o = (py * W + px) * 4
      let col: number[], a: number
      if (b === -2) { col = fill; a = 0 }
      else if (b === -1) { const on = (px + py) % 10 < 3; col = on ? hatch : fill; a = on ? 210 : 120 }
      else { col = bands[b]; a = 165 }
      const east = c + 1 < g.cols && px % s === s - 1 && code[k + 1] !== b
      const south = r > 0 && py % s === s - 1 && code[k - g.cols] !== b
      if ((east || south) && b !== -2) { col = edge; a = 230 }
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A grid draped on the terrain (a little above it), carrying the surface texture. */
function drapedPlane(box: Box, grids: HeightGrid[], lift: number): THREE.BufferGeometry {
  const [x0, y0, x1, y1] = box
  const n = Math.max(2, Math.min(200, Math.ceil(Math.max(x1 - x0, y1 - y0) / 25)))
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n
      pos.push(x, y, Math.max(0, sampleTerrain(grids, x, y) ?? 0) + lift)
      uv.push(i / n, j / n)
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** The 3D layer, inside CityScene's z-up group (local metres). `grids` are the terrain rings for draping. */
export default function HeightSurfaceLayer({ grids }: { grids: HeightGrid[] }) {
  const { on, area, corner, drawing } = useHeightSurface()
  const present = useStore((s) => s.phase) === 'present'
  const { box, step } = useAreaBox()
  const key = box?.map((v) => Math.round(v)).join(',') ?? ''
  const surface = useMemo(() => {
    if (!on || !box) return null
    const grid = limitGrid({ x0: box[0] + CITY_ORIGIN[0], y0: box[1] + CITY_ORIGIN[1], x1: box[2] + CITY_ORIGIN[0], y1: box[3] + CITY_ORIGIN[1] }, step)
    // Snap the drawn box to whole cells so the texture lines up with the grid.
    const snapped: Box = [box[0], box[1], box[0] + grid.cols * step, box[1] + grid.rows * step]
    return { texture: surfaceTexture(grid), geometry: drapedPlane(snapped, grids, area === 'downtown' ? 3 : 1.5), snapped }
  }, [on, key, step, grids, area]) // `key` stands for `box` (a new array each render)
  useEffect(() => () => { surface?.texture.dispose(); surface?.geometry.dispose() }, [surface])
  const outline = useMemo(() => {
    if (!surface || area === 'downtown') return null
    const [x0, y0, x1, y1] = surface.snapped
    const pts: [number, number, number][] = []
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[i + 1]
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 20))
      for (let s = 0; s <= m; s++) {
        const x = ax + ((bx - ax) * s) / m, y = ay + ((by - ay) * s) / m
        pts.push([x, y, Math.max(0, sampleTerrain(grids, x, y) ?? 0) + 2])
      }
    }
    return pts
  }, [surface, area, grids])
  const move = (e: ThreeEvent<PointerEvent>) => {
    const x = e.point.x, y = -e.point.z
    useHeightSurface.setState({ hover: { x, y, at: maxHeightAt([x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]]), ground: sampleTerrain(grids, x, y) } })
  }
  const down = (e: ThreeEvent<PointerEvent>) => { if (drawClick(e.point.x, -e.point.z)) e.stopPropagation() }
  return (
    <>
      {surface && !present && (
        <mesh geometry={surface.geometry} renderOrder={2} onPointerMove={move} onPointerOut={() => useHeightSurface.setState({ hover: null })} onPointerDown={down}>
          <meshBasicMaterial map={surface.texture} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-8} />
        </mesh>
      )}
      {outline && !present && <Line points={outline} color={BAND_EDGE} lineWidth={2} dashed dashSize={20} gapSize={12} />}
      {drawing && (
        // Catches clicks over the water (the scene's ground plane would move the tower); land clicks reach the terrain first.
        <mesh position={[0, 0, 0.5]} onPointerDown={down}>
          <planeGeometry args={[14000, 14000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
      {drawing && corner && (
        <Line points={[[corner[0], corner[1], 0], [corner[0], corner[1], Math.max(0, sampleTerrain(grids, corner[0], corner[1]) ?? 0) + 120]]} color={BAND_EDGE} lineWidth={3} />
      )}
    </>
  )
}

// ---------- DOM: toggle, area, legend, readout, cone parameters ----------
const Swatch = ({ color, hatch = false }: { color: string; hatch?: boolean }) => (
  <span className="inline-block h-3 w-4 shrink-0 rounded-sm border border-black/10"
    style={{ background: hatch ? `repeating-linear-gradient(135deg, ${UNKNOWN_HATCH} 0 2px, ${UNKNOWN_FILL} 2px 6px)` : color }} />
)

function Readout() {
  const hover = useHeightSurface((s) => s.hover)
  if (!hover) return <p className="text-slate-500">Point at the coloured area to read the max height there.</p>
  const { at, ground } = hover
  const where = `${(hover.x + CITY_ORIGIN[0]).toFixed(0)} E, ${(hover.y + CITY_ORIGIN[1]).toFixed(0)} N`
  return (
    <div className="rounded border border-line bg-slate-50 px-1.5 py-1">
      {at.state === 'limit' && at.governing ? (
        <>
          <div>
            Max height here <b className="text-ink"><U>{`${(at.limit as number).toFixed(1)} m`}</U></b> geodetic ±<U>{`${at.u95} m`}</U>
            {ground !== null && <> (about <U>{`${((at.limit as number) - Math.max(0, ground)).toFixed(0)} m`}</U> above the terrain)</>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            Set by {at.governing.id} {at.governing.name} · {CONE_PARAMS[at.governing.id].tier}
            <FlagChip flag={CONE_PARAMS[at.governing.id].flag} />
          </div>
          {at.covering.length > 1 && <div className="text-slate-500">Also covered by {at.covering.filter((c) => c !== at.governing).map((c) => c.id).join(', ')} (higher limits)</div>}
        </>
      ) : at.state === 'unknown' ? (
        <div>
          <b className="text-ink">Limit unknown</b>: {at.unknown.map((c) => `${c.id} ${c.name}`).join(', ')} {at.unknown.length > 1 ? 'have' : 'has'} no estimate yet, so no number is given here.
        </div>
      ) : (
        <div><b className="text-ink">No view-cone limit</b> here. Other height rules still apply.</div>
      )}
      {at.nearEdge && <div className="text-flag-unresolved">Within 1.5 m of a cone edge: check the exact line.</div>}
      <div className="text-[10px] text-slate-500">{where} · estimate; the City View Cone Assessment governs</div>
    </div>
  )
}

function ConeParameters() {
  const rows = [...CONES].sort((a, b) => Number(!CONE_PARAMS[a.id]) - Number(!CONE_PARAMS[b.id]) || a.id.localeCompare(b.id, 'en', { numeric: true }))
  return (
    <details className="rounded border border-line">
      <summary className="cursor-pointer select-none px-1.5 py-1 font-medium text-ink">Lower-boundary parameters · {CONES.length} cones</summary>
      <div className="space-y-1.5 border-t border-line px-1.5 py-1.5">
        <p className="text-slate-500">
          Z = Lv + k·D, with D measured along the cone axis from its origin. Lv is the City's viewpoint elevation (eye level, City
          open data); k is the slope from Council reports and City site sheets (research packet C01).
        </p>
        {rows.map((c) => {
          const p = CONE_PARAMS[c.id]
          return (
            <div key={c.id} className="leading-snug">
              <div className="flex items-center justify-between gap-2">
                <span><b className="text-ink">{c.id}</b> {c.name} · Lv <U>{`${c.Lv} m`}</U></span>
                <FlagChip flag={p ? p.flag : 'unresolved'} />
              </div>
              {p ? (
                <div className="text-slate-500">k {p.k} · {p.tier === 'endorsed' ? 'endorsed, value unconfirmed' : p.tier} · ±{p.u95} m · {p.source}</div>
              ) : (
                <div className="text-slate-500">
                  No estimate: limit unknown.{ROOF_ALIGNED.includes(c.id) ? ' Roof-aligned: held at limit unknown until the 1008 Cambie roof test passes (spec §11).' : ' Needs a City site sheet or Request 0.'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}

/** The layer's controls, legend, readout and parameters (shown in the Real Vancouver overlay column). */
export function HeightSurfacePanel({ bare = false }: { bare?: boolean }) {
  const { on, area, drawing, corner, drawn } = useHeightSurface()
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel)
  const set = (patch: Partial<SurfaceState>) => useHeightSurface.setState(patch)
  const areaBtn = (a: Area, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}
      className={`rounded border px-1.5 py-0.5 ${area === a && on ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line bg-white text-ink hover:bg-slate-50'}`}>{label}</button>
  )
  return (
    <div className={bare ? 'space-y-1.5 text-[11px] text-slate-600' : 'w-80 shrink-0 space-y-1.5 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm'}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 font-semibold text-ink">
          <input type="checkbox" checked={on} onChange={(e) => set({ on: e.target.checked, hover: null })} /> Height limit surface
        </label>
        <span className="text-[10px] text-slate-500">view cones only</span>
      </div>
      {on && (
        <>
          <div className="flex flex-wrap gap-1">
            {areaBtn('downtown', 'Downtown', () => set({ area: 'downtown', drawing: false, corner: null }))}
            {areaBtn('site', t ? `Around ${t.name}` : 'Around the tower', () => set({ area: 'site', drawing: false, corner: null }))}
            {areaBtn('drawn', drawn ? 'Drawn area' : 'Draw an area', () => set({ area: 'drawn', drawing: !drawn, corner: null }))}
            {area === 'drawn' && drawn && !drawing && (
              <button type="button" className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50" onClick={() => set({ drawing: true, corner: null })}>Redraw</button>
            )}
          </div>
          {drawing && <p className="rounded bg-ink/85 px-1.5 py-1 text-white">{corner ? 'Now click the opposite corner on the ground.' : 'Click one corner of the area on the ground.'}</p>}
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Lowest estimated limit, geodetic (CGVD28 assumed)</div>
            {LIMIT_BANDS.map((b) => <div key={b.label} className="flex items-center gap-1.5"><Swatch color={b.color} />{b.label}</div>)}
            <div className="flex items-center gap-1.5"><Swatch color="" hatch />Limit unknown: a covering cone has no estimate</div>
            <div className="flex items-center gap-1.5"><Swatch color="#ffffff" />No fill: no view-cone limit (other rules apply)</div>
          </div>
          <Readout />
        </>
      )}
      <ConeParameters />
    </div>
  )
}
