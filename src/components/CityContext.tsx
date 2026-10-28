// Real Vancouver context: City footprints (LiDAR heights where processed, "height unknown" outlines elsewhere) and the
// MRDEM terrain rings out to the North Shore mountains. Data: public/data/ (layers.json), built by tools/build_city_*.py.
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { create } from 'zustand'
import { LOOKS, type Look } from '../data/stages'
import { rectCorners } from '../engine/massing'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { indexFootprints, type FootprintIndex } from '../engine/viewFrom'
import { useResults } from '../hooks/useResults'
import {
  decodeFootprints, decodeHeights, decodeTerrain, groundUnder, layerBytes, sampleGrid, sampleTerrain,
  type Footprint, type FootprintHeights, type HeightGrid, type Manifest,
} from '../lib/cityLayers'
import { REMOVAL_CAVEAT, REMOVAL_FLAG, maskHeights, maskIndex, removalCounts, removalUnder, visibleIndex, type Removal } from '../lib/cityRemoval'
import { rtinIndices } from '../lib/terrainMesh'
import { cellInside, groundDisplayPatch, isGroundDetail, mosaicGrids, isTerrainDetail, loadTerrainDetails, nameTerrain, terrainBasis } from '../lib/terrainDetails'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { withoutHistory } from '../lib/project/history'
import { applyBuildingForms, is2009Part, loadCityGeometry, type StreetData } from '../lib/cityGeometry'
import CityStreets, { useStreetDisplay } from './CityStreets'
import { useViewFromStore } from '../lib/viewFromStore'
import ContextLayersScene, { ContextLayersPanel } from './ContextLayers'
import HeightSurfaceLayer, { HeightSurfacePanel, drawClick } from './HeightSurface'
import Label from './Label'
import { CONE_STYLE, FlagChip } from './ui'

interface CityData {
  streets: StreetData | null; roofParts: number; manifest: Manifest; footprints: Footprint[]; heights: FootprintHeights | null
  r1: HeightGrid; r2: HeightGrid; ground: HeightGrid[]; grids: HeightGrid[]; detailStatus: 'loading' | 'ready' | 'partial'; detailErrors: string[]
  /** Indices into footprints: outlines with no height in any source, drawn as display-only placeholders (never in a calculation). */
  placeholders: ReadonlySet<number>; placeholderHeight: number
}

let cache: Promise<CityData> | null = null
/** Loads every layer once per session (the canvas remounts when switching projects). */
function loadCity(): Promise<CityData> {
  cache ??= (async () => {
    const get = async (f: string) => {
      const r = await fetch(`./data/${f}`)
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`)
      return r.arrayBuffer()
    }
    const r = await fetch('./data/layers.json')
    if (!r.ok) throw new Error(`layers.json: HTTP ${r.status}`)
    const manifest = (await r.json()) as Manifest
    const layer = (id: string) => manifest.layers.find((l) => l.id === id)
    const fp = layer('footprints'), t1 = layer('terrain_r1'), t2 = layer('terrain_r2'), h = layer('footprint_heights')
    if (!fp || !t1?.grid || !t2?.grid) throw new Error('layers.json lacks footprints or terrain')
    const [fb, b1, b2, hb] = await Promise.all([get(fp.file), get(t1.file), get(t2.file), h ? get(h.file) : null])
    const footprints = decodeFootprints(fb)
    const r1 = nameTerrain(decodeTerrain(b1, t1.grid), t1), r2 = nameTerrain(decodeTerrain(b2, t2.grid), t2)
    return { manifest, footprints, streets: null, roofParts: 0, heights: hb ? decodeHeights(hb, footprints.length) : null,
      r1, r2, ground: [], grids: [r1, r2], detailStatus: 'loading', detailErrors: [], placeholders: new Set<number>(), placeholderHeight: 0 }

  })()
  cache.catch(() => { cache = null })
  return cache
}

let detailedCache: Promise<CityData> | null = null
function loadDetailedCity(base: CityData): Promise<CityData> {
  detailedCache ??= (async () => {
    const read = async (file: string) => {
      const r = await fetch(`./data/${file}`)
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
      return r.arrayBuffer()
    }
    const [details, geometry] = await Promise.all([loadTerrainDetails(base.manifest, read), loadCityGeometry(base.manifest, read)])
    const buildings = applyBuildingForms(base.footprints, base.heights, geometry.forms)
    const errors = [...details.errors, ...geometry.errors]
    const ground = details.loaded.filter((d) => isGroundDetail(d.layer)).map((d) => d.grid).sort((a, b) => a.step - b.step)
    const r2 = details.loaded.find((d) => d.layer.id === 'terrain_r2_detail')?.grid ?? base.r2
    return { ...base, ...buildings, streets: geometry.streets, roofParts: geometry.forms?.forms.length ?? 0, ground, r2, grids: [...ground, base.r1, r2],
      placeholderHeight: geometry.forms?.placeholderHeight ?? 0, detailStatus: errors.length ? 'partial' : 'ready', detailErrors: errors }
  })()
  return detailedCache
}

export function useCityData() {
  const [state, setState] = useState<{ data: CityData | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let live = true
    loadCity().then(async (base) => {
      if (live) setState({ data: base, error: null })
      if (!detailedCache) followTerrain(base)
      const data = await loadDetailedCity(base)
      followTerrain(data)
      if (live) setState({ data, error: null })
    }, (e: Error) => live && setState({ data: null, error: e.message }))
    return () => { live = false }
  }, [])
  return state
}

const hasHeight = (h: FootprintHeights | null, i: number) => !!h && Number.isFinite(h.ground[i]) && Number.isFinite(h.roof[i]) && h.roof[i] > h.ground[i]

// ---------- existing buildings under the design (opt-in, after Vista's automatic demolition; lib/cityRemoval.ts) ----------
/** Session only and off by default, so the default demo draws every City building and every one blocks views. */
export const useHideUnderDesign = create<{ on: boolean }>(() => ({ on: false }))
const NO_REMOVAL: Removal = { hidden: new Set(), byTower: [] }

/** Footprints hidden under the Real Vancouver design towers while the toggle is on (indices into data.footprints). */
export function useRemoval(data: CityData | null): Removal {
  const on = useHideUnderDesign((s) => s.on)
  const towers = useStore((s) => s.towers.city)
  const r = useMemo(() => (on && data && towers.length ? removalUnder(data.footprints, towers) : NO_REMOVAL), [on, data, towers])
  // Keep the same set while the same buildings stay hidden, so meshes and sightlines only redo work when it changes.
  const key = [...r.hidden].join(',')
  const hidden = useMemo(() => r.hidden, [data, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { hidden, byTower: r.byTower }
}

const baseIndex = new WeakMap<Footprint[], FootprintIndex>()
/** Picking and ray-cast inputs for View from here and Vista: the City footprints without those hidden under the design. */
export function useCityObstacles() {
  const { data, error } = useCityData()
  const { hidden } = useRemoval(data)
  const idx = useMemo(() => {
    if (!data) return null
    let i = baseIndex.get(data.footprints)
    if (!i) { i = indexFootprints(data.footprints); baseIndex.set(data.footprints, i) }
    return maskIndex(i, hidden)
  }, [data, hidden])
  const heights = useMemo(() => (data ? maskHeights(data.heights, hidden) : null), [data, hidden])
  return { data, error, idx, heights, hidden }
}

/** Leaves hidden footprints out of a merged mesh by rewriting its draw index; the mesh itself is built once per data load. */
function useHiddenParts(geom: THREE.BufferGeometry | null, ranges: [number, number, number][], hidden: ReadonlySet<number>) {
  useEffect(() => {
    if (!geom || (!hidden.size && !geom.index)) return
    let index = geom.index
    if (!index) { index = new THREE.BufferAttribute(new Uint32Array(geom.getAttribute('position').count), 1); geom.setIndex(index) }
    geom.setDrawRange(0, visibleIndex(ranges, hidden, index.array as Uint32Array))
    index.needsUpdate = true
  }, [geom, ranges, hidden])
}

// ---------- terrain ----------
/** Half the side of CityScene's 0 m ground plane (14 km square in Viewport.tsx). */
const PLANE_HALF = 7000
/** R2 (6-25 km away) is meshed to within about this many metres of the 60 m data (RTIN, see lib/terrainMesh.ts). */
const R2_MAX_ERROR = 1

/**
 * Heightfield mesh. Water reads about -2 m in MRDEM (a lidar-time level), so inside the scene's 0 m ground plane the
 * plane covers it and cuts the coastline; outside, water nodes take the plane's colour so the sea stays seamless.
 * R1 is drawn at full 30 m resolution (outlines and blocks sit on it) minus the all-water cells under the plane.
 * R2 (`inner` given) skips R1's square, stitches its boundary nodes to R1 and is simplified within R2_MAX_ERROR.
 */
function terrainGeometry(g: HeightGrid, look: Look, inner: HeightGrid | null, patches: HeightGrid[] = [], adaptive = false): THREE.BufferGeometry {
  const { cols, rows, step, x0, y0, z } = g
  const pos = new Float32Array(cols * rows * 3)
  const col = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  const shown = new Float32Array(cols * rows)
  const sea = new THREE.Color(look.water)
  const land = new THREE.Color(look.ground)
  const low = land.clone().multiplyScalar(0.86)
  const high = land.clone().multiplyScalar(0.66)
  const c = new THREE.Color()
  const half = inner ? -inner.x0 : 0
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k, x = x0 + k * step, y = y0 + r * step
      let h = z[i]
      if (inner && Math.abs(x) <= half && Math.abs(y) <= half) h = sampleGrid(inner, x, y) ?? h
      shown[i] = h
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = h
      uv[i * 2] = (x + PLANE_HALF) / (2 * PLANE_HALF); uv[i * 2 + 1] = (y + PLANE_HALF) / (2 * PLANE_HALF)
      ;(h > 0 ? c.copy(low).lerp(high, Math.min(1, h / 1000)) : c.copy(sea)).toArray(col, i * 3)
    }
  }
  let index: Uint32Array
  if (inner || adaptive) {
    const inHole = (k: number, r: number) => {
      const x = x0 + k * step, y = y0 + r * step
      return !!inner && x >= -half && x + step <= half && y >= -half && y + step <= half
    }
    index = rtinIndices(shown, cols, rows, { tile: 64, maxError: adaptive ? 0.15 : R2_MAX_ERROR, skipCell: inHole })
  } else {
    const idx = new Uint32Array((cols - 1) * (rows - 1) * 6)
    let n = 0
    for (let r = 0; r < rows - 1; r++) {
      for (let k = 0; k < cols - 1; k++) {
        const x = x0 + k * step, y = y0 + r * step
        if (patches.some((p) => cellInside(p, x, y, step))) continue
        const a = r * cols + k, b = a + 1, d = a + cols, e = d + 1
        if (Number.isNaN(z[a] + z[b] + z[d] + z[e])) continue // no data: leave a hole, never fill it
        const wet = !(z[a] > 0 || z[b] > 0 || z[d] > 0 || z[e] > 0)
        if (wet && x >= -PLANE_HALF && x + step <= PLANE_HALF && y >= -PLANE_HALF && y + step <= PLANE_HALF) continue // under the plane
        idx.set([a, b, e, a, e, d], n)
        n += 6
      }
    }
    index = idx.subarray(0, n)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geom.setIndex(new THREE.BufferAttribute(index, 1))
  geom.computeVertexNormals()
  return geom
}

// ---------- visual finish: City parks tint the ground; the City's 2002 shoreline is drawn over the sea plane ----------
interface Finish { parks: { names: string[]; polys: [number, number[]][] } | null; shoreline: { lines: number[][] } | null }
let finishCache: Promise<Finish> | null = null
function useFinish(manifest: Manifest): Finish {
  const [f, setF] = useState<Finish>({ parks: null, shoreline: null })
  useEffect(() => {
    const get = async (id: string) => {
      const e = manifest.layers.find((l) => l.id === id)
      if (!e) return null
      const r = await fetch(`./data/${e.file}`)
      return r.ok ? r.json() : null
    }
    finishCache ??= Promise.all([get('parks'), get('shoreline')]).then(([parks, shoreline]) => ({ parks, shoreline }), () => ({ parks: null, shoreline: null }))
    let live = true
    finishCache.then((v) => live && setF(v))
    return () => { live = false }
  }, [manifest])
  return f
}

/** Park outlines painted into a texture over the 0 m plane's square; the terrain multiplies it in (white = no tint). */
function parkTexture(parks: Finish['parks'], tint: string): THREE.CanvasTexture | null {
  if (!parks || typeof document === 'undefined') return null
  const n = 2048, s = n / (2 * PLANE_HALF)
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')
  if (!g) return null
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, n, n)
  g.fillStyle = tint
  for (const [, flat] of parks.polys) {
    g.beginPath()
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const px = (flat[i] / 10 + PLANE_HALF) * s, py = n - (flat[i + 1] / 10 + PLANE_HALF) * s
      if (i) g.lineTo(px, py); else g.moveTo(px, py)
    }
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function Shoreline({ lines, grids, color }: { lines: number[][]; grids: HeightGrid[]; color: string }) {
  const geom = useMemo(() => {
    const p: number[] = []
    for (const flat of lines) {
      for (let i = 0; i + 3 < flat.length; i += 2) {
        const ax = flat[i] / 10, ay = flat[i + 1] / 10, bx = flat[i + 2] / 10, by = flat[i + 3] / 10
        p.push(ax, ay, Math.max(0, sampleTerrain(grids, ax, ay) ?? 0) + 0.4, bx, by, Math.max(0, sampleTerrain(grids, bx, by) ?? 0) + 0.4)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }, [lines, grids])
  useEffect(() => () => geom.dispose(), [geom])
  return <lineSegments geometry={geom}><lineBasicMaterial color={color} transparent opacity={0.9} /></lineSegments>
}

function Terrain({ data, look, onPick }: { data: CityData; look: Look; onPick: (x: number, y: number) => void }) {
  const finish = useFinish(data.manifest)
  const patches = useMemo(() => mosaicGrids(data.ground).map((g) => groundDisplayPatch(g, data.r1)), [data])
  const detailed = useMemo(() => patches.map((g) => terrainGeometry(g, look, null, [], true)), [patches, look])
  const r1 = useMemo(() => terrainGeometry(data.r1, look, null, patches), [data, look, patches])
  const r2 = useMemo(() => terrainGeometry(data.r2, look, data.r1), [data, look])
  const parks = useMemo(() => parkTexture(finish.parks, look.park), [finish.parks, look.park])
  useEffect(() => () => { r1.dispose(); r2.dispose(); detailed.forEach((g) => g.dispose()) }, [r1, r2, detailed])
  useEffect(() => () => parks?.dispose(), [parks])
  // Only R1 takes clicks (placing towers); raycasting R2's half a million triangles is not worth it.
  // While the height surface is drawing an area, ground clicks set its corners instead of moving the tower.
  const pick = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (!drawClick(e.point.x, -e.point.z)) onPick(e.point.x, -e.point.z) }
  return (
    <>
      <mesh geometry={r1} receiveShadow onPointerDown={pick}>
        <meshStandardMaterial key={parks ? 'p' : 'n'} vertexColors map={parks} roughness={1} metalness={0} />
      </mesh>
      {detailed.map((geometry, i) => <mesh key={i} geometry={geometry} receiveShadow onPointerDown={pick}>
        <meshStandardMaterial key={parks ? 'p' : 'n'} vertexColors map={parks} roughness={1} metalness={0} />
      </mesh>)}
      {finish.shoreline && <Shoreline lines={finish.shoreline.lines} grids={data.grids} color={look.shore} />}
      <mesh geometry={r2} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>
    </>
  )
}

// ---------- buildings ----------
/** Extrudes the chosen footprints from `base(i)` to `top(i)` into one merged mesh, with the draw ranges useHiddenParts needs. */
function prisms(data: CityData, pick: (i: number) => boolean, base: (i: number) => number, top: (i: number) => number, uv = false) {
  const parts: THREE.BufferGeometry[] = []
  const ranges: [number, number, number][] = []
  let at = 0
  data.footprints.forEach((f, i) => {
    if (!pick(i)) return
    const shape = new THREE.Shape(f.outer.map(([x, y]) => new THREE.Vector2(x, y)))
    shape.holes = f.holes.map((ring) => new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))))
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, { depth: top(i) - base(i), bevelEnabled: false })
    g.translate(0, 0, base(i))
    if (g.index) { const indexed = g; g = indexed.toNonIndexed(); indexed.dispose() }
    if (!uv) g.deleteAttribute('uv')
    g.computeVertexNormals()
    const n = g.getAttribute('position').count
    ranges.push([i, at, n])
    at += n
    parts.push(g)
  })
  const geom = parts.length ? mergeGeometries(parts) : null
  parts.forEach((p) => p.dispose())
  return { geom, ranges }
}

/**
 * Stepped LiDAR 2022 roof parts, then the City's 2009 heights in the ring outside the 2022 core (a shade darker, an
 * older survey), with legacy LOD1 blocks only outside replacement coverage. Solid clay, ghosted in x-ray.
 */
function Buildings({ data, look, ghost, hidden }: { data: CityData; look: Look; ghost: boolean; hidden: ReadonlySet<number> }) {
  const h = data.heights
  const meshes = useMemo(() => [false, true].map((older) => prisms(data,
    (i) => hasHeight(h, i) && is2009Part(data.footprints[i].id) === older, (i) => h!.ground[i], (i) => h!.roof[i])), [data, h])
  useEffect(() => () => meshes.forEach((m) => m.geom?.dispose()), [meshes])
  useHiddenParts(meshes[0].geom, meshes[0].ranges, hidden)
  useHiddenParts(meshes[1].geom, meshes[1].ranges, hidden)
  return (
    <>
      {meshes.map((m, k) => m.geom && (
        <mesh key={k} geometry={m.geom} castShadow={!ghost} receiveShadow>
          <meshStandardMaterial color={k ? look.older : look.context} roughness={0.92} metalness={0} transparent opacity={ghost ? 0.45 : 1} depthWrite={!ghost} />
        </mesh>
      ))}
    </>
  )
}

/** Diagonal hatch, one stripe every 4 m (extrusion UVs are in metres). */
function hatchTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas')
  cv.width = cv.height = 32
  const g = cv.getContext('2d')
  if (!g) return null
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32)
  g.strokeStyle = '#6b7079'; g.lineWidth = 5
  for (const d of [-32, 0, 32]) { g.beginPath(); g.moveTo(d, 32); g.lineTo(d + 32, 0); g.stroke() }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(0.25, 0.25)
  return t
}

/**
 * Outlines with no height in any source (on the 2015 map with nothing of the City's 2009 heights on them: mostly small
 * garages and laneway houses the generalised 2009 survey leaves out, or newer buildings): hatched, translucent blocks
 * of a nominal height, chosen by Ruijie (27 Oct) as display only. They are not picked, cast no shadow and stay
 * "height unknown" for views, solar and cones.
 */
function Placeholders({ data, xray, hidden }: { data: CityData; xray: boolean; hidden: ReadonlySet<number> }) {
  const { geom, ranges } = useMemo(() => {
    const grids = data.grids, base = new Map<number, number>()
    for (const i of data.placeholders) base.set(i, Math.max(0, Math.min(...data.footprints[i].outer.map(([x, y]) => sampleTerrain(grids, x, y) ?? 0))))
    return prisms(data, (i) => data.placeholders.has(i), (i) => base.get(i)!, (i) => base.get(i)! + data.placeholderHeight, true)
  }, [data])
  const hatch = useMemo(() => hatchTexture(), [])
  useEffect(() => () => { geom?.dispose(); hatch?.dispose() }, [geom, hatch])
  useHiddenParts(geom, ranges, hidden)
  if (!geom) return null
  // Labelled together with the flat outlines (UnknownOutlines), so no building class has two labels.
  return (
    <mesh geometry={geom} raycast={() => null} renderOrder={2}>
      <meshStandardMaterial color="#c3c6cb" map={hatch} roughness={1} transparent opacity={xray ? 0.22 : 0.45} depthWrite={false} />
    </mesh>
  )
}

/** Footprints without a LiDAR height: flat outlines draped on the terrain. Never extruded to a guessed height. */
function UnknownOutlines({ data, xray, hidden }: { data: CityData; xray: boolean; hidden: ReadonlySet<number> }) {
  const { geom, anchor, count, ranges } = useMemo(() => {
    const grids = data.grids
    const pts: number[] = []
    const ranges: [number, number, number][] = []
    let sx = 0, sy = 0, count = 0
    data.footprints.forEach((f, i) => {
      if (hasHeight(data.heights, i) || data.placeholders.has(i)) return // placeholders are drawn as blocks instead
      count++
      sx += f.outer[0][0]; sy += f.outer[0][1]
      const start = pts.length / 3
      for (const ring of [f.outer, ...f.holes]) {
        const zs = ring.map(([x, y]) => Math.max(0, sampleTerrain(grids, x, y) ?? 0) + 0.4)
        ring.forEach(([x, y], k) => {
          const m = (k + 1) % ring.length
          pts.push(x, y, zs[k], ring[m][0], ring[m][1], zs[m])
        })
      }
      ranges.push([i, start, pts.length / 3 - start])
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const ax = count ? sx / count : 0, ay = count ? sy / count : 0
    return { geom: g, anchor: [ax, ay, (sampleTerrain(grids, ax, ay) ?? 0) + 70] as [number, number, number], count, ranges }
  }, [data])
  useEffect(() => () => geom.dispose(), [geom])
  useHiddenParts(geom, ranges, hidden)
  const shown = count - [...hidden].filter((i) => !hasHeight(data.heights, i) && !data.placeholders.has(i)).length
  const blocks = data.placeholders.size - [...hidden].filter((i) => data.placeholders.has(i)).length
  if (!shown && !blocks) return null
  // One label for everything without a height: the flat outlines and the hatched placeholders.
  const text = [shown && `${shown.toLocaleString()} 2015 outlines`, blocks && `${blocks.toLocaleString()} hatched ${data.placeholderHeight} m placeholders`].filter(Boolean).join(' + ')
  return (
    <>
      {shown > 0 && <lineSegments geometry={geom}>
        <lineBasicMaterial color={xray ? '#6f8299' : '#80858d'} transparent opacity={0.85} />
      </lineSegments>}
      <Label text={`No height data: ${text} (display only)`} position={anchor} size={0.015} color="#4a4f57" />
    </>
  )
}

// ---------- view-cone plan outlines draped on the terrain ----------
/** The flat cone wedges sit at 0.2 m and vanish under land; these outlines follow the ground (colour rule as ConeWedge). */
function DrapedCones({ data }: { data: CityData }) {
  const { cones } = useResults()
  const sel = useStore((s) => s.selectedTower)
  const checks = cones.find((c) => c.tower.id === sel)?.checks ?? []
  const lines = useMemo(() => {
    const grids = data.grids
    return CONES.map((cone) => {
      const pts: [number, number, number][] = []
      const ring = cone.ring.map(([x, y]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]] as [number, number])
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1]
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 20))
        for (let s = 0; s < steps; s++) {
          const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps
          pts.push([x, y, Math.max(0, sampleTerrain(grids, x, y) ?? 0) + 0.8])
        }
      }
      pts.push(pts[0])
      return { id: cone.id, pts }
    })
  }, [data])
  return (
    <>
      {lines.map(({ id, pts }) => {
        const state = checks.find((k) => k.cone.id === id)?.state ?? null
        const prm = CONE_PARAMS[id]
        const active = !!state && state !== 'outside'
        const color = state && state !== 'outside' ? CONE_STYLE[state].color : prm ? '#4f7fae' : '#7d838c'
        return <Line key={id} points={pts} color={color} lineWidth={active ? 2.5 : 1.5} dashed={!prm} dashSize={40} gapSize={25} />
      })}
    </>
  )
}

// ---------- ground under the selected tower ----------
const round1 = (v: number) => Math.round(v * 10) / 10

/** Terrain under the selected tower's footprint (corner average, range over corners and centre). */
function useTowerGround(data: CityData | null) {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel) ?? null
  const g = useMemo(() => (t && data ? groundUnder(data.grids, rectCorners(t.x, t.y, t.width, t.depth, t.rotation)) : null),
    [data, t?.x, t?.y, t?.width, t?.depth, t?.rotation])
  const corners = t ? rectCorners(t.x, t.y, t.width, t.depth, t.rotation) : []
  const basis = data && t ? terrainBasis(data.grids, [...corners, [t.x, t.y]]) : 'no terrain data'
  return { t, g, basis }
}

/** Where the terrain under the selected tower disagrees with the tower's base elevation, say so (no silent fix). */
function GroundCheck({ data }: { data: CityData }) {
  const base = useStore((s) => s.groundElevation)
  const { t, g, basis } = useTowerGround(data)
  if (!t || !g || Math.abs(g.value - base) < 1.5) return null
  return (
    <Label text={`Ground here about ${g.value.toFixed(1)} m (${basis}, CGVD28, unverified); tower base set to ${base.toFixed(1)} m`}
      position={[t.x, t.y - Math.max(t.depth, 30), Math.max(g.value, base) + 6]} size={0.014} color="#6e5800" background="rgba(255,243,205,0.95)" />
  )
}

/**
 * In 'terrain' mode (the default) the project base follows the terrain under the selected tower. A store
 * subscription, not a component: the 3D view only commits on animation frames, which stop while it is hidden and
 * take seconds in software WebGL. The follow-up is folded into the edit that caused it (withoutHistory), so undoing
 * a move restores the base it had. Re-armed with the detailed ground once it loads.
 */
let followed: CityData | null = null, unfollow: (() => void) | null = null
function followTerrain(data: CityData) {
  if (followed === data) return
  followed = data
  unfollow?.()
  const apply = (s: ReturnType<typeof useStore.getState>) => {
    if (s.project !== 'city' || s.groundMode !== 'terrain') return
    const t = s.towers.city.find((k) => k.id === s.selectedTower)
    const g = t ? groundUnder(data.grids, rectCorners(t.x, t.y, t.width, t.depth, t.rotation)) : null
    if (g && Math.abs(round1(g.value) - s.groundElevation) >= 0.05) withoutHistory(() => useStore.getState().set({ groundElevation: round1(g.value) }))
  }
  unfollow = useStore.subscribe(apply)
  apply(useStore.getState())
}

/**
 * Says where the tower base comes from: the terrain (default, flagged unverified) or a value set by hand, with a
 * one-click switch either way. The base moves every view-cone result (top = base + height).
 */
function GroundCard({ data }: { data: CityData }) {
  const base = useStore((s) => s.groundElevation)
  const mode = useStore((s) => s.groundMode)
  const { t, g, basis } = useTowerGround(data)
  const terrain = g ? round1(g.value) : null
  if (!t) return null
  const following = mode === 'terrain' && terrain !== null
  const btn = 'rounded border border-line bg-white px-1.5 py-0.5 font-medium text-ink hover:bg-slate-50'
  return (
    <div className="w-80 shrink-0 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm" data-testid="ground-card">
      <div className="flex items-center justify-between gap-2">
        <b className="text-ink">Tower base {base.toFixed(1)} m</b>
        <FlagChip flag={following ? 'unverified' : 'team_assumption'} />
      </div>
      <div aria-live="polite">
        {following
          ? <>From the terrain under {t.name} · follows the tower when it moves</>
          : mode === 'terrain'
            ? <>No terrain under {t.name}: the base stays at {base.toFixed(1)} m</>
            : <>Set by hand{terrain !== null && Math.abs(terrain - base) >= 0.05 ? <> · <b className="text-flag-unresolved">{Math.abs(terrain - base).toFixed(1)} m {base < terrain ? 'below' : 'above'} the terrain</b></> : null}</>}
      </div>
      {g && terrain !== null && (
        <div>Terrain {terrain.toFixed(1)} m (corner average; {g.min.toFixed(1)}–{g.max.toFixed(1)} m under the footprint) · {basis} · CGVD28</div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {mode === 'terrain'
          ? <button type="button" className={btn} onClick={() => useStore.getState().set({ groundMode: 'manual' })}>Set the base by hand</button>
          : terrain !== null && <button type="button" className={btn} onClick={() => useStore.getState().set({ groundMode: 'terrain', groundElevation: terrain })}>Follow the terrain ({terrain.toFixed(1)} m)</button>}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">The base moves every view-cone result (top = base + height). One base for all towers in this project; edit it in Design.</div>
    </div>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/**
 * Opt-in: hide the City buildings under the design (Vista's automatic demolition). Says what is hidden, under which
 * tower, and that it is the team's hypothesis. Also mounted inline in the Vista panel.
 */
export function HideUnderDesignCard({ inline = false }: { inline?: boolean }) {
  const { data } = useCityData()
  const on = useHideUnderDesign((s) => s.on)
  const towers = useStore((s) => s.towers.city)
  const { hidden, byTower } = useRemoval(data)
  if (!data || !towers.length) return null
  const c = removalCounts(hidden, data.heights)
  const under = byTower.filter((b) => b.indices.length).map((b) => b.name)
  return (
    <div className={inline ? 'mt-2 rounded-md border border-line p-2 text-[11px]' : 'w-80 shrink-0 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm'}>
      <label className="flex items-center gap-1.5 font-medium text-ink">
        <input type="checkbox" checked={on} onChange={(e) => useHideUnderDesign.setState({ on: e.target.checked })} />
        Hide existing buildings under the design
      </label>
      {!on && <div className="text-[10px] text-slate-500">Off: every City building is drawn and blocks sightlines.</div>}
      {on && (
        <>
          <div aria-live="polite">
            {c.total
              ? <>Hidden: <b className="text-ink">{plural(c.total, 'existing building footprint')}</b> under {under.join(', ')} ({plural(c.measured, 'LiDAR 2022 roof part')}, {plural(c.outlines, '2015 outline')} with no height).</>
              : 'No City building lies under the design towers.'}
          </div>
          <div className="mt-1 flex items-start gap-1.5">
            <span className="shrink-0"><FlagChip flag={REMOVAL_FLAG} /></span>
            <span className="text-[10px] leading-snug text-slate-500">{REMOVAL_CAVEAT} Footprints that overlap a tower or podium outline (inset 0.5 m, so shared walls stay) leave the drawing, View from here and Vista's rooftop views. Parts of a building outside the outline stay. Rule from Vista's automatic demolition.</span>
          </div>
        </>
      )}
    </div>
  )
}

/** Everything the Real Vancouver scene draws from public/data. Rendered inside CityScene's z-up group. */
export default function CityContext({ look, xray, onPick }: { look: Look; xray: boolean; onPick: (x: number, y: number) => void }) {
  const { data } = useCityData()
  const { hidden } = useRemoval(data)
  const grids = useMemo(() => (data ? data.grids : []), [data])
  if (!data) return null
  return (
    <>
      <Terrain data={data} look={look} onPick={onPick} />
      <CityStreets streets={data.streets} ground={data.ground} coarse={data.r1} />
      <Buildings data={data} look={look} ghost={xray} hidden={hidden} />
      <UnknownOutlines data={data} xray={xray} hidden={hidden} />
      <Placeholders data={data} xray={xray} hidden={hidden} />
      <DrapedCones data={data} />
      <GroundCheck data={data} />
      <HeightSurfaceLayer grids={grids} />
      <ContextLayersScene manifest={data.manifest} grids={grids} xray={xray} />
    </>
  )
}

// ---------- legend (DOM, outside the canvas) ----------
const mb = (b: number) => `${(b / 1e6).toFixed(2)} MB`

/** Lists every context layer with its source, licence, retrieval date, datum and flag. */
export function CityLegend() {
  const { data, error } = useCityData()
  const streetDisplay = useStreetDisplay()
  if (error) {
    return (
      <div className="absolute right-3 top-3 max-w-xs rounded-md border border-line bg-white/95 p-2 text-[11px] text-slate-600 shadow-sm">
        <b className="text-ink">Context layers not loaded.</b> {error}. Build them with the scripts in <code>tools/</code> (see README).
      </div>
    )
  }
  if (!data) return <div className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm">Loading Vancouver context…</div>
  const { manifest, footprints, heights } = data
  const withHeight = footprints.filter((_, i) => hasHeight(heights, i)).length
  const older = footprints.filter((f) => is2009Part(f.id)).length
  const firstLoad = manifest.layers.filter((l) => !l.lazy)
  const total = firstLoad.reduce((s, l) => s + layerBytes(l), 0)
  const onDemand = manifest.layers.filter((l) => l.lazy && !isTerrainDetail(l) && !['building_forms', 'building_forms_2009', 'city_streets', 'shoreline', 'parks'].includes(l.id)).length
  const fas = manifest.layers.flatMap((l) => l.false_assumptions ?? [])
  return (
    <div className="absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 overflow-y-auto">
    <details className="group shrink-0 rounded-md border border-line bg-white/95 text-[11px] text-slate-600 shadow-sm open:w-80">
      <summary className="cursor-pointer select-none px-2 py-1.5 text-ink">
        <b>Context layers</b> · {firstLoad.length} · {mb(total)}{onDemand ? ` · ${onDemand} more on demand` : ''}
        <span className="block font-normal text-slate-600" role="status">{data.detailStatus === 'loading' ? 'Loading building forms, streets and terrain…' : `Ground: ${data.ground.length ? 'City LiDAR 1 m where covered' : 'MRDEM 30 m'} · Mountains: ${data.r2.step} m`}</span>
        <span className="block font-normal text-slate-500">{data.roofParts.toLocaleString()} measured building parts (LiDAR 2022 core, City 2009 around it to the view cones' outer edge) · {data.streets ? 'City streets loaded' : 'Streets unavailable'}</span>
      </summary>
      <div className="space-y-2 border-t border-line px-2 py-2">
        <p>
          <b className="text-ink">{(data.roofParts - older).toLocaleString()} roof parts from City LiDAR 2022</b> (the 2 × 2 km core) and{' '}
          <span className="mr-1 inline-block h-2.5 w-3.5 rounded-sm border border-black/10 align-middle" style={{ background: LOOKS.clay.older }} />
          <b className="text-ink">{older.toLocaleString()} from the City's 2009 heights</b> around it, across the 24 view cones and the gaps between them (an older survey, a shade darker; 2009 buildings no longer on the 2015 map are left out).{' '}
          {withHeight.toLocaleString()} solid parts in total. <b>No height data</b> (never a guessed height): {(footprints.length - withHeight - data.placeholders.size).toLocaleString()} flat 2015 outlines
          {data.placeholders.size > 0 && <> and {data.placeholders.size.toLocaleString()} hatched {data.placeholderHeight} m placeholders (mostly garages and laneway houses under 60 m², which the generalised 2009 survey leaves out or which are newer; display only, in no calculation)</>}.
          One building, one representation: a LiDAR 2022 part wins over a City 2009 part, which wins over a 2015 outline or placeholder; anything overlapping a higher-ranked building by half of the smaller footprint is left out, smaller overlaps are cut away.
        </p>
        <p>Detailed ground covers {data.ground.length} City LiDAR 1 km tile{data.ground.length === 1 ? '' : 's'} ({manifest.layers.filter(isGroundDetail).map((l) => l.id.replace('terrain_ground_', '')).join(', ')}). Elsewhere, and in gaps under buildings or water, ground uses MRDEM at 30 m. The 2022 survey and 2015 footprints do not represent all current development.</p>
        {data.detailErrors.length > 0 && <p role="alert">Some detailed context could not load. The available base layers remain visible; reload to try again. {data.detailErrors.join('; ')}</p>}
        <p>Roof forms retain measured setbacks and separate podium levels at 1 m plan resolution. Roofs are grouped in 3 m elevation bands; slopes and facades remain approximate. The 2015 outlines outside the processed area have not been updated.</p>
        {data.roofParts > 0 && <button type="button" className="rounded border border-line px-2 py-1 font-medium text-ink hover:bg-slate-50" onClick={() => {
          useViewFromStore.getState().set({ looking: false, picking: false })
          useStore.getState().set({ cameraRequest: { position: [-1700, -150, 650], target: [-800, 900, 30], fov: 50 } })
        }}>Inspect extracted buildings</button>}
        {data.streets && <div className="space-y-1">
          <b className="text-ink">Streets and lanes</b>
          <label className="flex items-center gap-1"><input type="checkbox" checked={streetDisplay.surfaces} onChange={(e) => useStreetDisplay.setState({ surfaces: e.target.checked })} /> Approximate road surfaces</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={streetDisplay.names} onChange={(e) => useStreetDisplay.setState({ names: e.target.checked })} /> Main street names</label>
          <p>City centre lines with recorded surface widths. Centre lines follow the right of way and may differ from the physical road centre. Curbs, sidewalks and medians are not surveyed by this layer. Missing widths and bridges are shown as reference lines.</p>
        </div>}
        <p>Ground uses only bare-earth returns. The City's published 8.1 cm vertical accuracy describes the source survey, not this interpolated model.</p>
        <p><span className="mr-1 inline-block h-2.5 w-3.5 rounded-sm border border-black/10 align-middle" style={{ background: LOOKS.clay.water }} /><b className="text-ink">Water</b> is a plane at 0 m CGVD28: it shows wherever the ground model is at or below 0 m, so the coast follows the terrain. <span className="mr-1 inline-block h-0.5 w-3.5 align-middle" style={{ background: LOOKS.clay.shore }} />The line is the City's approximate 2002 shoreline (not updated since). Neither is a surveyed shoreline or bathymetry. <span className="mr-1 inline-block h-2.5 w-3.5 rounded-sm border border-black/10 align-middle" style={{ background: '#cfdcc4' }} />Green ground marks City parks.</p>
        <ul className="space-y-1.5">
          {manifest.layers.map((l) => (
            <li key={l.id} className="leading-snug">
              <div className="flex items-center justify-between gap-2">
                <a className="font-medium text-ink underline decoration-line underline-offset-2" href={l.source.url} target="_blank" rel="noreferrer">{l.title}</a>
                <FlagChip flag={l.flag} />
              </div>
              <div>{l.source.publisher} · {l.licence.name} · retrieved {l.source.retrieved} · {mb(l.bytes)}</div>
              <div className="text-slate-500">{l.crs.horizontal}{l.datum.vertical ? ` · ${l.datum.vertical}` : ''}</div>
            </li>
          ))}
        </ul>
        {fas.map((f) => (
          <p key={f.claim} className="border-l-2 border-flag-false pl-2">
            <span className="font-semibold text-flag-false">False assumption: </span>{f.claim}. <span className="text-slate-500">{f.correction}</span>
          </p>
        ))}
        <p className="text-[10px] text-slate-500">{[...new Set(manifest.layers.map((l) => l.attribution))].join(' ')}</p>
      </div>
    </details>
    <GroundCard data={data} />
    <HideUnderDesignCard />
    <HeightSurfacePanel />
    <ContextLayersPanel manifest={manifest} />
    </div>
  )
}
