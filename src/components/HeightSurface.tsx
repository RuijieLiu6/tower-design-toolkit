// Height limits and suggestion surface (Context Model C01-M03, extended with Vista v37's height model, Ruijie Liu,
// 3 Nov 2026): over downtown, the whole city, around the selected tower, or an area the user draws, three views:
//   View cones  the lowest cone surface: the 8 City-sourced estimates solid, the 16 Vista study surfaces striped
//               (a team assumption, not a City ceiling).
//   Zoning      Vista's basic zoning height references (by-law cited, unverified); grey hatch where the district has
//               no number (DD, CD-1, untranscribed), never a guessed height.
//   Suggestion  the lowest of zoning and cones above the ground (0.1 m clearance), pale where zoning has no number.
// A readout under the cursor names every source and its flag; the cone parameters list both kinds of surface.
// Maths: engine/heightGrid.ts, engine/heightModel.ts, engine/heightPolicy.ts; data: lib/heightData.ts.
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { heightGrid, type HeightGrid as LimitRaster } from '../engine/heightGrid'
import { suggestAt, type ConeSurface, type Suggestion } from '../engine/heightModel'
import { readRule } from '../engine/heightPolicy'
import { ROOF_ALIGNED } from '../engine/heightSurface'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import { CITY_PLINTH } from '../lib/plinth'
import { groundFrom, heightPolicyNow, surfacesFor, useHeightPolicy } from '../lib/heightData'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { FlagChip } from './ui'
import { U } from './Units'

/** Geodetic limit bands for the cone view. One blue ramp, light to dark (validated as an ordinal ramp). */
export const LIMIT_BANDS = [
  { below: 40, color: '#86b6ef', label: 'under 40 m' },
  { below: 80, color: '#5598e7', label: '40–80 m' },
  { below: 120, color: '#2a78d6', label: '80–120 m' },
  { below: 150, color: '#1c5cab', label: '120–150 m' },
  { below: Infinity, color: '#104281', label: '150 m or more' },
]
/** Heights above the ground (zoning and suggestion views): a green ramp, so they are never read as geodetic limits. */
export const HEIGHT_BANDS = [
  { below: 12, color: '#c7e9c0', label: 'under 12 m' },
  { below: 24, color: '#a1d99b', label: '12–24 m' },
  { below: 48, color: '#74c476', label: '24–48 m' },
  { below: 90, color: '#41ab5d', label: '48–90 m' },
  { below: 150, color: '#238b45', label: '90–150 m' },
  { below: Infinity, color: '#005a32', label: '150 m or more' },
]
const UNKNOWN_FILL = '#c9ccd1', UNKNOWN_HATCH = '#6b7079', BAND_EDGE = '#0b2545'

type Area = 'downtown' | 'city' | 'site' | 'drawn'
export type SurfaceMode = 'cones' | 'zoning' | 'suggestion'
type Box = [number, number, number, number] // local x0, y0, x1, y1 (EPSG:26910 minus CITY_ORIGIN)
interface Hover { x: number; y: number; ground: number | null; answer: Suggestion }
interface SurfaceState {
  on: boolean
  mode: SurfaceMode
  area: Area
  drawn: Box | null
  drawing: boolean
  corner: [number, number] | null
  hover: Hover | null
  /** The 24 cone surfaces on the loaded terrain (set by the layer), for the parameters list. */
  surfaces: ConeSurface[] | null
}
export const useHeightSurface = create<SurfaceState>(() => ({ on: false, mode: 'cones', area: 'downtown', drawn: null, drawing: false, corner: null, hover: null, surfaces: null }))

/** The footprint layer's extent: the downtown peninsula and the south False Creek shore. */
const DOWNTOWN: Box = [-2400, -2000, 2500, 1900]
/** The whole Real Vancouver plinth (every building and draped City layer). */
const CITY: Box = [CITY_PLINTH.x0, CITY_PLINTH.y0, CITY_PLINTH.x1, CITY_PLINTH.y1]
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
  if (area === 'city') return { box: CITY, step: 25 }
  if (area === 'site') return t ? { box: [t.x - SITE_HALF, t.y - SITE_HALF, t.x + SITE_HALF, t.y + SITE_HALF], step: 2 } : { box: null, step: 2 }
  if (!drawn) return { box: null, step: 2 }
  const size = Math.max(drawn[2] - drawn[0], drawn[3] - drawn[1])
  return { box: drawn, step: Math.max(2, Math.ceil(size / 500)) }
}

/**
 * Per cell: a band and a pattern. Patterns are in texture pixels, so they read at any zoom: stripes = a study surface
 * controls (assumption); hatch = no number; pale with dots = partial (zoning has no number, cones only).
 */
function surfaceTexture(g: LimitRaster, mode: SurfaceMode): THREE.CanvasTexture {
  const s = Math.max(1, Math.min(4, Math.floor(2048 / Math.max(g.cols, g.rows))))
  const W = g.cols * s, H = g.rows * s
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const bands = (mode === 'cones' ? LIMIT_BANDS : HEIGHT_BANDS).map((b) => rgb(b.color)), fill = rgb(UNKNOWN_FILL), hatch = rgb(UNKNOWN_HATCH), edge = rgb(BAND_EDGE), white = [255, 255, 255], dot = [40, 44, 52]
  const bandOf = (z: number) => (mode === 'cones' ? LIMIT_BANDS : HEIGHT_BANDS).findIndex((b) => z < b.below)
  // code: -2 nothing, -1 no number (hatch), else band + 10 × variant (0 solid, 1 study stripes, 2 partial, 3 partial + study)
  const code = new Int16Array(g.cols * g.rows)
  for (let k = 0; k < code.length; k++) {
    if (mode === 'cones') code[k] = g.coneKind[k] === 0 ? -2 : bandOf(g.coneZ[k]) + (g.coneKind[k] === 2 ? 10 : 0)
    else if (mode === 'zoning') code[k] = g.zoningState[k] === 0 ? -2 : g.zoningState[k] === 2 ? -1 : bandOf(g.zoningH[k])
    else code[k] = g.sugState[k] === 0 ? (g.zoningState[k] === 2 ? -1 : -2) : bandOf(g.suggestion[k]) + 10 * ((g.sugControl[k] === 3 ? 1 : 0) + (g.sugState[k] === 2 ? 2 : 0))
  }
  for (let py = 0; py < H; py++) {
    const r = g.rows - 1 - Math.floor(py / s) // canvas runs north to south
    for (let px = 0; px < W; px++) {
      const c = Math.floor(px / s), k = r * g.cols + c, b = code[k], o = (py * W + px) * 4
      let col: number[], a: number
      if (b === -2) { col = fill; a = 0 }
      else if (b === -1) { const on = (px + py) % 10 < 3; col = on ? hatch : fill; a = on ? 210 : 120 }
      else {
        const band = b % 10, variant = Math.floor(b / 10), study = variant === 1 || variant === 3, partial = variant >= 2
        col = bands[band]; a = partial ? 95 : 165
        if (study && (px - py + 4096) % 9 < 2) { col = white; a = 215 }
        if (partial && px % 7 === 0 && py % 7 === 0) { col = dot; a = 200 }
      }
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
  const { on, area, corner, drawing, mode } = useHeightSurface()
  const present = useStore((s) => s.phase) === 'present'
  const { box, step } = useAreaBox()
  const { policy } = useHeightPolicy(on && mode !== 'cones')
  const surfaces = useMemo(() => surfacesFor(grids), [grids])
  const groundAt = useMemo(() => groundFrom(grids), [grids])
  useEffect(() => { useHeightSurface.setState({ surfaces }) }, [surfaces])
  const key = box?.map((v) => Math.round(v)).join(',') ?? ''
  const zoning = mode === 'cones' ? null : policy
  const surface = useMemo(() => {
    if (!on || !box) return null
    const grid = heightGrid({ x0: box[0] + CITY_ORIGIN[0], y0: box[1] + CITY_ORIGIN[1], x1: box[2] + CITY_ORIGIN[0], y1: box[3] + CITY_ORIGIN[1] }, step, surfaces, zoning, CITY_ORIGIN, groundAt)
    // Snap the drawn box to whole cells so the texture lines up with the grid.
    const snapped: Box = [box[0], box[1], box[0] + grid.cols * step, box[1] + grid.rows * step]
    return { texture: surfaceTexture(grid, mode), geometry: drapedPlane(snapped, grids, area === 'downtown' || area === 'city' ? 3 : 1.5), snapped }
  }, [on, key, step, grids, area, mode, zoning, surfaces, groundAt]) // `key` stands for `box` (a new array each render)
  useEffect(() => () => { surface?.texture.dispose(); surface?.geometry.dispose() }, [surface])
  const outline = useMemo(() => {
    if (!surface || area === 'downtown' || area === 'city') return null
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
    const x = e.point.x, y = -e.point.z, p: [number, number] = [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]]
    const ground = sampleTerrain(grids, x, y)
    useHeightSurface.setState({ hover: { x, y, ground, answer: suggestAt(p, { policy: heightPolicyNow(), surfaces, ground, origin: CITY_ORIGIN }) } })
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

// ---------- DOM: toggle, view, area, legend, readout, cone parameters ----------
const Swatch = ({ color, hatch = false, stripes = false, pale = false }: { color: string; hatch?: boolean; stripes?: boolean; pale?: boolean }) => (
  <span className="inline-block h-3 w-4 shrink-0 rounded-sm border border-black/10"
    style={{ background: hatch ? `repeating-linear-gradient(135deg, ${UNKNOWN_HATCH} 0 2px, ${UNKNOWN_FILL} 2px 6px)` : stripes ? `repeating-linear-gradient(45deg, #ffffff 0 1.5px, ${color} 1.5px 5px)` : color, opacity: pale ? 0.5 : 1 }} />
)

/** One cone surface as a line: id, name, kind, elevation, flag. */
function ConeLine({ s, z, ground }: { s: ConeSurface; z: number; ground: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Swatch color={s.kind === 'estimate' ? '#2a78d6' : '#2a78d6'} stripes={s.kind === 'study'} />
      <span><b className="text-ink">{s.cone.id}</b> {s.cone.name}: <U>{`${z.toFixed(1)} m`}</U>{s.u95 ? <> ±<U>{`${s.u95} m`}</U></> : null}
        {ground !== null && <> (<U>{`${(z - ground).toFixed(0)} m`}</U> above the terrain)</>}
        {' · '}{s.kind === 'estimate' ? 'City-sourced estimate' : 'study surface, not a City ceiling'}</span>
      <FlagChip flag={s.flag} />
    </div>
  )
}

function Readout() {
  const hover = useHeightSurface((s) => s.hover)
  const mode = useHeightSurface((s) => s.mode)
  if (!hover) return <p className="text-slate-500">Point at the coloured area to read the heights there.</p>
  const { answer, ground } = hover
  const policy = heightPolicyNow()
  const where = `${(hover.x + CITY_ORIGIN[0]).toFixed(0)} E, ${(hover.y + CITY_ORIGIN[1]).toFixed(0)} N`
  const zones = answer.zoning?.zones ?? []
  const ctl = answer.controlling
  return (
    <div className="space-y-0.5 rounded border border-line bg-slate-50 px-1.5 py-1">
      {mode !== 'cones' && (
        answer.status === 'none' ? <div><b className="text-ink">No suggestion here</b>: no zoning number and no view cone.</div> : (
          <div>
            {answer.status === 'ready' ? 'Suggested height here' : 'Cones allow up to'} <b className="text-ink"><U>{`${(answer.heightM as number).toFixed(1)} m`}</U></b> above the ground
            {ctl && <span className="ml-1 inline-flex flex-wrap items-center gap-1">· set by {ctl.label} <FlagChip flag={ctl.flag} /></span>}
          </div>
        )
      )}
      {policy ? (
        zones.length ? zones.map((z) => {
          const r = readRule(policy, z.ruleId, z.zone)
          return (
            <div key={z.id} className="flex flex-wrap items-center gap-1">
              <Swatch color={r.heightM !== null ? '#74c476' : UNKNOWN_FILL} hatch={r.heightM === null} />
              <span>Zoning <b className="text-ink">{z.zone}</b>: {r.heightM !== null ? <><U>{`${r.heightM} m`}</U> basic height</> : r.label}</span>
              <FlagChip flag={r.flag} />
              {policy.rules[z.ruleId]?.sourceUrl && <a className="text-accent underline" href={policy.rules[z.ruleId].sourceUrl} target="_blank" rel="noreferrer">by-law{policy.rules[z.ruleId].section ? ` ${policy.rules[z.ruleId].section}` : ''}</a>}
            </div>
          )
        }) : <div>Zoning: no mapped district here.</div>
      ) : mode !== 'cones' ? <div className="text-slate-500">Loading the zoning references…</div> : null}
      {answer.cones.length ? answer.cones.map((h) => <ConeLine key={h.surface.cone.id} s={h.surface} z={h.z} ground={ground} />) : <div><b className="text-ink">No view-cone limit</b> here. Other height rules still apply.</div>}
      {answer.notes.filter((n) => !/^The lowest cone|is an estimate/.test(n)).map((n) => <div key={n} className="text-flag-unresolved">{n}</div>)}
      <div className="text-[11px] text-slate-500">{where} · study tool after Vista (Ruijie Liu); the City's View Cone Assessment and by-laws govern</div>
    </div>
  )
}

function ConeParameters() {
  const surfaces = useHeightSurface((s) => s.surfaces)
  const rows = [...CONES].sort((a, b) => Number(!CONE_PARAMS[a.id]) - Number(!CONE_PARAMS[b.id]) || a.id.localeCompare(b.id, 'en', { numeric: true }))
  return (
    <details className="rounded border border-line">
      <summary className="cursor-pointer select-none px-1.5 py-1 font-medium text-ink">Lower-boundary parameters · {CONES.length} cones</summary>
      <div className="space-y-1.5 border-t border-line px-1.5 py-1.5">
        <p className="text-slate-500">
          City-sourced estimate: Z = Lv + k·D, with D measured along the cone axis from its origin. Lv is the City's viewpoint
          elevation (eye level, City open data); k is the slope from Council reports and City site sheets (research packet C01).
          Study surface (the other cones): Vista's Imagine default, a plane from the modelled eye (terrain at the origin + 1.6 m)
          to 120 m at Vista's downtown reference (49.2827 N, 123.1207 W). A team assumption, not a City ceiling.
        </p>
        {rows.map((c) => {
          const p = CONE_PARAMS[c.id], s = surfaces?.find((k) => k.cone.id === c.id)
          return (
            <div key={c.id} className="leading-snug">
              <div className="flex items-center justify-between gap-2">
                <span><b className="text-ink">{c.id}</b> {c.name} · Lv <U>{`${c.Lv} m`}</U></span>
                <FlagChip flag={p ? p.flag : s ? s.flag : 'unresolved'} />
              </div>
              {p ? (
                <div className="text-slate-500">k {p.k} · {p.tier === 'endorsed' ? 'endorsed, value unconfirmed' : p.tier} · ±{p.u95} m · {p.source}</div>
              ) : (
                <div className="text-slate-500">
                  No City-sourced estimate.{ROOF_ALIGNED.includes(c.id) ? ' Roof-aligned: no estimate until the 1008 Cambie roof test passes (spec §11).' : ' Needs a City site sheet or Request 0.'}
                  {s ? <> Study surface: eye <U>{`${(s.eye ?? 0).toFixed(1)} m`}</U> → <U>120 m</U> at the {s.referenceName}{s.eyeMinusLv !== undefined && s.eyeMinusLv !== null && Math.abs(s.eyeMinusLv) >= 2 ? <> (eye <U>{`${Math.abs(s.eyeMinusLv).toFixed(1)} m`}</U> {s.eyeMinusLv < 0 ? 'below' : 'above'} Lv: decks and platforms are not modelled)</> : null}.</> : ' Study surface: waiting for the terrain.'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}

const MODE_LABEL: Record<SurfaceMode, string> = { cones: 'View cones', zoning: 'Zoning heights', suggestion: 'Suggestion' }

function Legend({ mode }: { mode: SurfaceMode }) {
  if (mode === 'cones') return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">Lowest cone surface, geodetic (CGVD28 assumed)</div>
      {LIMIT_BANDS.map((b) => <div key={b.label} className="flex items-center gap-1.5"><Swatch color={b.color} />{b.label}</div>)}
      <div className="flex items-center gap-1.5"><Swatch color={LIMIT_BANDS[2].color} stripes />White stripes: a Vista study surface is lowest (assumption, not a City ceiling)</div>
      <div className="flex items-center gap-1.5"><Swatch color="#ffffff" />No fill: no view cone (other rules apply)</div>
    </div>
  )
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{mode === 'zoning' ? 'Basic zoning height, above the by-law grade' : 'Suggested height above the ground (lowest of zoning and cones, 0.1 m clearance)'}</div>
      {HEIGHT_BANDS.map((b) => <div key={b.label} className="flex items-center gap-1.5"><Swatch color={b.color} />{b.label}</div>)}
      {mode === 'suggestion' && <div className="flex items-center gap-1.5"><Swatch color={HEIGHT_BANDS[3].color} stripes />Stripes: a study surface controls (assumption)</div>}
      {mode === 'suggestion' && <div className="flex items-center gap-1.5"><Swatch color={HEIGHT_BANDS[3].color} pale />Pale, dotted: zoning has no number here; cones only</div>}
      <div className="flex items-center gap-1.5"><Swatch color="" hatch />No zoning number (DD, CD-1, not transcribed): never a guessed height</div>
      <div className="flex items-center gap-1.5"><Swatch color="#ffffff" />No fill: {mode === 'zoning' ? 'no mapped district' : 'nothing known'}</div>
    </div>
  )
}

/** The layer's controls, legend, readout and parameters (shown in the Real Vancouver overlay column). */
export function HeightSurfacePanel({ bare = false }: { bare?: boolean }) {
  const { on, area, drawing, corner, drawn, mode } = useHeightSurface()
  const { error } = useHeightPolicy(on && mode !== 'cones')
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel)
  const set = (patch: Partial<SurfaceState>) => useHeightSurface.setState(patch)
  const btn = (active: boolean, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded border px-1.5 py-0.5 ${active ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line bg-white text-ink hover:bg-slate-50'}`}>{label}</button>
  )
  return (
    <div className={bare ? 'space-y-1.5 text-[11px] text-slate-600' : 'w-80 shrink-0 space-y-1.5 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm'}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 font-semibold text-ink">
          <input type="checkbox" checked={on} onChange={(e) => set({ on: e.target.checked, hover: null })} /> Height limit surface
        </label>
        <span className="text-[11px] text-slate-500">zoning + view cones, after Vista</span>
      </div>
      {on && (
        <>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
            <span className="text-slate-500">Show</span>
            {(['cones', 'zoning', 'suggestion'] as SurfaceMode[]).map((m) => <span key={m}>{btn(mode === m, MODE_LABEL[m], () => set({ mode: m, hover: null }))}</span>)}
          </div>
          <div className="flex flex-wrap gap-1">
            {btn(area === 'downtown', 'Downtown', () => set({ area: 'downtown', drawing: false, corner: null }))}
            {btn(area === 'city', 'Whole city', () => set({ area: 'city', drawing: false, corner: null }))}
            {btn(area === 'site', t ? `Around ${t.name}` : 'Around the tower', () => set({ area: 'site', drawing: false, corner: null }))}
            {btn(area === 'drawn', drawn ? 'Drawn area' : 'Draw an area', () => set({ area: 'drawn', drawing: !drawn, corner: null }))}
            {area === 'drawn' && drawn && !drawing && (
              <button type="button" className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50" onClick={() => set({ drawing: true, corner: null })}>Redraw</button>
            )}
          </div>
          {drawing && <p className="rounded bg-ink/85 px-1.5 py-1 text-white">{corner ? 'Now click the opposite corner on the ground.' : 'Click one corner of the area on the ground.'}</p>}
          {error && mode !== 'cones' && <p role="alert" className="text-flag-unresolved">Zoning references did not load: {error}</p>}
          <Legend mode={mode} />
          <Readout />
        </>
      )}
      <ConeParameters />
    </div>
  )
}
