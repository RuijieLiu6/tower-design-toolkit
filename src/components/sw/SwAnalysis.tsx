// What the analysis view draws for the Sun & Wind Studio tools: the ground studies as a coloured map on the ground
// (shadow, pedestrian wind, rain shelter), the façade studies on the tower faces (sun, driving rain), the façade zones
// on the tower (glazing, PV, energy), and the interior studies as a true floor plan of the level studied.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ORI, STRATS, swFloors, toNorth, zonesOf, zoneFor, type StratId } from '../../engine/sw/plate'
import { FACADE_BANDS, SHELTER_BANDS, type FaceRain, type GroundShelter } from '../../engine/sw/rain'
import { IRRADIANCE_BANDS, SHADOW_BANDS, type SunGround } from '../../engine/sw/sun'
import type { FacadeFace, LegendBand } from '../../engine/sw/types'
import { LAWSON_BANDS, type WindStudy } from '../../engine/sw/wind'
import type { Grid } from '../../engine/shadow'
import type { Tower } from '../../engine/types'
import { useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import DaylightStudio from './DaylightStudio'
import { InteriorDrawings } from './SwInteriorResults'

export type SwView = 'ground' | 'faces' | 'zones' | 'plan'
export const SW_VIEW: Partial<Record<SwId, SwView>> = {
  'built.sw-shadow': 'ground', 'built.sw-wind-comfort': 'ground', 'built.sw-rain-water': 'ground',
  'built.sw-sun-faces': 'faces', 'built.sw-rain-faces': 'faces',
  'built.sw-glazing': 'zones', 'built.sw-pv': 'zones', 'built.sw-energy': 'zones', 'built.sw-form': 'zones',
  'built.sw-daylight': 'plan', 'built.sw-daylight-factor': 'plan', 'built.sw-light-hour': 'plan', 'built.sw-natvent': 'plan', 'built.sw-airflow': 'plan', 'built.sw-indoor-temp': 'plan',
}

const bandOf = (bands: LegendBand[], v: number) => bands.find((b) => v <= b.to) ?? bands[bands.length - 1]

const WIND_DELTA_BANDS: LegendBand[] = [
  { to: -1, label: 'Calmer by over 1 m/s', color: '#2f7f74' }, { to: -0.25, label: 'Calmer', color: '#9fd1c4' }, { to: 0.25, label: 'About the same', color: '#eef0f2' },
  { to: 1, label: 'Windier', color: '#f2b77a' }, { to: 99, label: 'Windier by over 1 m/s', color: '#c2410c' },
]
const deltaCache = new WeakMap<WindStudy, Float32Array>()
function windDelta(w: WindStudy): Float32Array {
  let d = deltaCache.get(w)
  if (!d) { d = new Float32Array(w.mean.length); for (let k = 0; k < d.length; k++) d[k] = Number.isNaN(w.meanB[k]) && !Number.isNaN(w.mean[k]) ? 0 : w.mean[k] - w.meanB[k]; deltaCache.set(w, d) }
  return d
}

/** The ground layer of a tool: grid, values and bands. */
export function groundOf(id: SwId, data: Record<string, unknown>): { grid: Grid; values: Float32Array; bands: LegendBand[]; title: string } | null {
  if (id === 'built.sw-shadow' && data.g) { const g = data.g as SunGround; return { grid: g.grid, values: g.newShadow, bands: SHADOW_BANDS(g.th), title: `New shadow · ${data.when as string}` } }
  if (id === 'built.sw-wind-comfort' && data.w) {
    const w = data.w as WindStudy
    // "Overlay shows" (the Studio's Wind tab): Lawson comfort with the towers, or the change the towers make (m/s).
    if (useSwStudy.getState().windView === 'delta') return { grid: w.grid, values: windDelta(w), bands: WIND_DELTA_BANDS, title: 'Change in pedestrian wind caused by the towers, m/s' }
    return { grid: w.grid, values: w.mean, bands: LAWSON_BANDS, title: 'Pedestrian wind, Lawson bands' }
  }
  if (id === 'built.sw-rain-water' && data.sh) { const s = data.sh as GroundShelter; return { grid: s.grid, values: s.values, bands: SHELTER_BANDS, title: 'Ground sheltered from the rain, % of the year' } }
  return null
}

export function SwGround({ id, base }: { id: SwId; base: number }) {
  const out = useSwOut((s) => s.out[id])
  useSwStudy((s) => s.windView) // redraw when the wind overlay changes
  const layer = out ? groundOf(id, out.data) : null
  const tex = useMemo(() => {
    if (!layer) return null
    const { grid, values, bands } = layer
    const px = new Uint8Array(grid.nx * grid.ny * 4)
    for (let k = 0; k < grid.nx * grid.ny; k++) {
      const v = values[k]
      if (!Number.isFinite(v)) continue
      const c = new THREE.Color(bandOf(bands, v).color)
      px[k * 4] = c.r * 255; px[k * 4 + 1] = c.g * 255; px[k * 4 + 2] = c.b * 255; px[k * 4 + 3] = 215
    }
    const t = new THREE.DataTexture(px, grid.nx, grid.ny, THREE.RGBAFormat)
    t.magFilter = THREE.NearestFilter; t.needsUpdate = true
    return t
  }, [layer])
  useEffect(() => () => tex?.dispose(), [tex])
  if (!layer || !tex) return null
  const g = layer.grid
  return (
    <mesh position={[g.x0 + (g.nx * g.cell) / 2, g.y0 + (g.ny * g.cell) / 2, base + 0.2]} renderOrder={-5}>
      <planeGeometry args={[g.nx * g.cell, g.ny * g.cell]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}

function Quads({ quads, base }: { quads: { a: [number, number]; b: [number, number]; z0: number; z1: number; color: string }[]; base: number }) {
  const geom = useMemo(() => {
    const pos: number[] = [], col: number[] = []
    for (const q of quads) {
      const c = new THREE.Color(q.color)
      const P = [[q.a[0], q.a[1], base + q.z0], [q.b[0], q.b[1], base + q.z0], [q.b[0], q.b[1], base + q.z1], [q.a[0], q.a[1], base + q.z1]]
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P[i]); col.push(c.r, c.g, c.b) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [quads, base])
  useEffect(() => () => geom.dispose(), [geom])
  return <mesh geometry={geom} renderOrder={2}><meshBasicMaterial vertexColors side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} /></mesh>
}

export function SwFaces({ id, base }: { id: SwId; base: number }) {
  const out = useSwOut((s) => s.out[id])
  const quads = useMemo(() => {
    if (!out) return []
    if (id === 'built.sw-sun-faces') return ((out.data.faces as FacadeFace[]) ?? []).filter((f) => f.a && f.b).map((f) => ({ a: f.a!, b: f.b!, z0: f.z0, z1: f.z1, color: bandOf(IRRADIANCE_BANDS, f.value).color }))
    return ((out.data.faces as FaceRain[]) ?? []).map((f) => ({ a: f.a, b: f.b, z0: f.z0, z1: f.z1, color: bandOf(FACADE_BANDS, f.value).color }))
  }, [out, id])
  return quads.length ? <Quads quads={quads} base={base} /> : null
}

/** Strategy colours for the façade-zone view. */
export const STRAT_COL: Record<StratId, string> = {
  curtain: '#9cc3e4', punched: '#b9a58a', overhang: '#e0a23a', louvres: '#d0643f', fins: '#7a5ab8', eggcrate: '#8e3f6b', lightshelf: '#f2c744',
  balcony: '#6b9e78', doubleskin: '#4f8fb8', pvspandrel: '#2f855a', greenwall: '#3c8d5a', windscreen: '#9aa3ad',
}
export function SwZones({ towers, base, north }: { towers: Tower[]; base: number; north: number }) {
  const quads = useMemo(() => towers.flatMap((t) => {
    const zones = zonesOf(t), nr = (-north * Math.PI) / 180, c = Math.cos(nr), s = Math.sin(nr)
    const back = ([x, y]: [number, number]): [number, number] => [x * c - y * s, x * s + y * c]
    return swFloors(t, north, 1).flatMap((f) => f.edges.map((e) => {
      const z = zoneFor(zones, e.o, f.level)
      const a = back(toNorth(f, e.mx - (e.ux * e.L) / 2 + e.ox * 0.15, e.my - (e.uy * e.L) / 2 + e.oy * 0.15)), b = back(toNorth(f, e.mx + (e.ux * e.L) / 2 + e.ox * 0.15, e.my + (e.uy * e.L) / 2 + e.oy * 0.15))
      const hh = f.h * 0.92, gh = hh * z.wwr
      return { a, b, z0: f.z + hh - gh, z1: f.z + hh, color: STRAT_COL[z.strat] }
    }))
  }), [towers, north])
  return <Quads quads={quads} base={base} />
}

export function SwKey({ id, towers }: { id: SwId; towers: Tower[] }) {
  const out = useSwOut((s) => s.out[id])
  const busy = useSwOut((s) => !!s.busy[id])
  const view = SW_VIEW[id]
  const swatch = (b: { label: string; color: string }) => <span key={b.label} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label}</span>
  if (busy && !out) return <p className="text-muted" role="status">Running…</p>
  if (!out) return null
  if (view === 'ground') { const l = groundOf(id, out.data); return l ? <div><div className="mb-1 font-semibold text-ink">{l.title}</div><div className="flex flex-wrap gap-x-2 gap-y-1 text-muted">{l.bands.map(swatch)}</div></div> : null }
  if (view === 'faces') return <div><div className="mb-1 font-semibold text-ink">{id === 'built.sw-sun-faces' ? 'Sun on the faces, kWh/m² a year' : 'Driving rain on the faces (BS 8104)'}</div><div className="flex flex-wrap gap-x-2 gap-y-1 text-muted">{(id === 'built.sw-sun-faces' ? IRRADIANCE_BANDS : FACADE_BANDS).map(swatch)}</div></div>
  if (view === 'zones') {
    const used = [...new Set(towers.flatMap((t) => zonesOf(t).map((z) => z.strat)))]
    return <div><div className="mb-1 font-semibold text-ink">Façade zones: glass band by strategy</div><div className="flex flex-wrap gap-x-2 gap-y-1 text-muted">{used.map((k) => swatch({ label: STRATS[k].name, color: STRAT_COL[k] }))}</div><p className="mt-1 text-muted">{ORI.join(' · ')} faces; band height = glazing ratio.</p></div>
  }
  return null
}

/** The interior studies: the floor plan of the level studied, drawn large. */
export function SwPlanView({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  // The daylight tools share one viewer: the plan of the level with one layer at a time, as Sun & Wind Studio's plan view.
  if (id === 'built.sw-daylight' || id === 'built.sw-daylight-factor' || id === 'built.sw-light-hour') return <DaylightStudio id={id} />
  if (!out) return <p className="p-4 text-meta text-muted" role="status">Working…</p>
  return (
    <div className="h-full overflow-auto p-4" data-testid="sw-plan-view">
      <div className="mx-auto grid max-w-[44rem] gap-3 [&_[data-testid=floor-plan]]:!max-w-none">
        {(id === 'built.sw-natvent' || id === 'built.sw-airflow' || id === 'built.sw-indoor-temp') && <InteriorDrawings id={id} />}
      </div>
    </div>
  )
}
