// Real Vancouver context: City footprints (LiDAR heights where processed, "height unknown" outlines elsewhere) and the
// MRDEM terrain rings out to the North Shore mountains. Data: public/data/ (layers.json), built by tools/build_city_*.py.
import { Line } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { LOOKS, type Look } from '../data/stages'
import { rectCorners, towerFootprint } from '../engine/massing'
import { CONES, CONE_PARAMS } from '../engine/viewCones'
import { indexFootprints, type FootprintIndex } from '../engine/viewFrom'
import { useResults } from '../hooks/useResults'
import {
  decodeFootprints, decodeHeights, decodeTerrain, groundUnder, layerBytes, sampleGrid, sampleTerrain,
  type Footprint, type FootprintHeights, type HeightGrid, type Manifest,
} from '../lib/cityLayers'
import { REMOVAL_CAVEAT, REMOVAL_FLAG, REMOVAL_RULE, maskHeights, maskIndex, removalCounts, removalUnder, visibleIndex, type Removal } from '../lib/cityRemoval'
import { useHideUnderDesign } from '../lib/hideUnderDesign'
import { rtinIndices } from '../lib/terrainMesh'
import { registerGround } from '../lib/cameraClamp'
import { footprintBounds, registerViewLimit } from '../lib/viewLimit'
import { CITY_PLINTH, SEA_Z, insidePlinth, plinthRing, plinthTopGrid, sampleDrawn, skirtPositions, type Side } from '../lib/plinth'
import PlinthBase from './Plinth'
import { cellInside, groundDisplayPatch, isGroundDetail, mosaicGrids, isTerrainDetail, loadTerrainDetails, nameTerrain, terrainBasis } from '../lib/terrainDetails'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { withoutHistory } from '../lib/project/history'
import { applyBuildingForms, is2009Part, loadCityGeometry, type StreetData } from '../lib/cityGeometry'
import { VISTA_ATTRIBUTION, VISTA_SOURCES, chooseHeight, isEstimate, loadVistaBuildings, seatVista, type BuildingModel, type HeightBasis, type VistaBuildings } from '../lib/vistaBuildings'
import { useCityModel, type CityModel } from '../lib/cityModel'
import { useSceneStyle, type SceneStyle } from '../lib/sceneStyle'
import { VISTA, VISTA_LOOK, setParkMask, setWaterMask, useVistaLook, vistaShaded } from '../lib/vistaLook'
import { BUILDING_USES, SWATCH_BORDER, USE_BASES, USE_BASIS_TEXT, partUse, useColor, type BuildingUse, type UseBasis } from '../lib/buildingUse'
import { contextFacadeMaterial, contextGroundMaterial, contextPavingMaterial, contextWaterMaterial, facadeAttribute, useVistaTextures, vistaFamily, vistaSeed, type VistaTextures } from './ContextStyle'
import CityStreets, { useStreetDisplay } from './CityStreets'
import VistaStreets, { VistaStreetLines } from './VistaStreets'
import { useViewFromStore } from '../lib/viewFromStore'
import { demolishedIndices, useSiteStore } from '../lib/siteStore'
import ContextLayersScene, { ContextLayersPanel, useContextLayers } from './ContextLayers'
import HeightSurfaceLayer, { HeightSurfacePanel, drawClick, useHeightSurface } from './HeightSurface'
import Label from './Label'
import { CONE_STYLE, FlagChip } from './ui'
import { ViewportDock, useDock } from './ViewportDock'
import { ExistingConeCrossings, coneCrossingsFor } from './ConeVolumes'
import VistaCones, { ConeVisibilityPanel } from './VistaCones'
import { earClip } from '../lib/coneVolume'
import { shownSummary, useConeVisibility } from '../lib/coneVisibility'
import { SKYLINE_CAP_DEG } from '../engine/coneSection'


interface CityData extends BuildingModel {
  streets: StreetData | null; roofParts: number; manifest: Manifest; footprints: Footprint[]; heights: FootprintHeights | null
  r1: HeightGrid; r2: HeightGrid; ground: HeightGrid[]; grids: HeightGrid[]; detailStatus: 'loading' | 'ready' | 'partial'; detailErrors: string[]
  /** Indices into footprints: outlines with no height in any source, drawn as display-only placeholders (never in a calculation). */
  placeholders: ReadonlySet<number>; placeholderHeight: number
}

const read = async (file: string) => {
  const r = await fetch(`./data/${file}`)
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
  return r.arrayBuffer()
}

const cache: Partial<Record<CityModel, Promise<CityData>>> = {}
/** The first stage: terrain (and, for the City model, its footprints with LiDAR heights). Once per session and model. */
function loadCity(model: CityModel): Promise<CityData> {
  const p = cache[model] ??= (async () => {
    const r = await fetch('./data/layers.json')
    if (!r.ok) throw new Error(`layers.json: HTTP ${r.status}`)
    const manifest = (await r.json()) as Manifest
    const layer = (id: string) => manifest.layers.find((l) => l.id === id)
    const fp = model === 'city' ? layer('footprints') : undefined, h = model === 'city' ? layer('footprint_heights') : undefined
    const t1 = layer('terrain_r1'), t2 = layer('terrain_r2')
    if (!t1?.grid || !t2?.grid || (model === 'city' && !fp)) throw new Error('layers.json lacks footprints or terrain')
    const [fb, b1, b2, hb] = await Promise.all([fp ? read(fp.file) : null, read(t1.file), read(t2.file), h ? read(h.file) : null])
    const footprints = fb ? decodeFootprints(fb) : []
    const r1 = nameTerrain(decodeTerrain(b1, t1.grid), t1), r2 = nameTerrain(decodeTerrain(b2, t2.grid), t2)
    return { model, vista: null, manifest, footprints, streets: null, roofParts: 0, heights: hb ? decodeHeights(hb, footprints.length) : null,
      r1, r2, ground: [], grids: [r1, r2], detailStatus: 'loading', detailErrors: [], placeholders: new Set<number>(), placeholderHeight: 0 } as CityData
  })()
  p.catch(() => { delete cache[model] })
  return p
}

const detailedCache: Partial<Record<CityModel, Promise<CityData>>> = {}
/** The second stage: detailed ground, streets and the buildings (Vista's model, or the City roof forms). */
function loadDetailedCity(base: CityData): Promise<CityData> {
  return detailedCache[base.model] ??= (async () => {
    const vistaModel = base.model === 'vista'
    const [details, geometry, vistaLoad] = await Promise.all([
      loadTerrainDetails(base.manifest, read), loadCityGeometry(base.manifest, read, false, !vistaModel),
      vistaModel ? loadVistaBuildings(base.manifest, read).catch((e: Error) => e) : null,
    ])
    const errors = [...details.errors, ...geometry.errors]
    const ground = details.loaded.filter((d) => isGroundDetail(d.layer)).map((d) => d.grid).sort((a, b) => a.step - b.step)
    const r2 = details.loaded.find((d) => d.layer.id === 'terrain_r2_detail')?.grid ?? base.r2
    const grids = [...ground, base.r1, r2]
    let buildings: Pick<CityData, 'footprints' | 'heights' | 'placeholders' | 'vista' | 'roofParts' | 'placeholderHeight'>
    if (vistaModel) {
      const v = vistaLoad instanceof Error || !vistaLoad ? null : vistaLoad
      if (vistaLoad instanceof Error) errors.push(`Vista buildings: ${vistaLoad.message}`)
      else if (!vistaLoad) errors.push('Vista buildings: layer missing from layers.json')
      buildings = { footprints: v?.footprints ?? [], heights: v ? seatVista(v.footprints, v.vista, grids) : null, vista: v?.vista ?? null,
        placeholders: new Set<number>(), roofParts: v?.footprints.length ?? 0, placeholderHeight: 0 }
    } else {
      buildings = { ...applyBuildingForms(base.footprints, base.heights, geometry.forms), vista: null,
        roofParts: geometry.forms?.forms.length ?? 0, placeholderHeight: geometry.forms?.placeholderHeight ?? 0 }
    }
    return { ...base, ...buildings, streets: geometry.streets, ground, r2, grids, detailStatus: errors.length ? 'partial' : 'ready', detailErrors: errors }
  })()
}

export function useCityData() {
  const model = useCityModel((s) => s.model)
  const [state, setState] = useState<{ data: CityData | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let live = true
    loadCity(model).then(async (base) => {
      if (live) setState({ data: base, error: null })
      if (!detailedCache[model]) followTerrain(base)
      const data = await loadDetailedCity(base)
      followTerrain(data)
      if (live) setState({ data, error: null })
    }, (e: Error) => live && setState({ data: null, error: e.message }))
    return () => { live = false }
  }, [model])
  return state
}

const hasHeight = (h: FootprintHeights | null, i: number) => !!h && Number.isFinite(h.ground[i]) && Number.isFinite(h.roof[i]) && h.roof[i] > h.ground[i]

// ---------- existing buildings under the design (after Vista's automatic demolition; lib/cityRemoval.ts) ----------
// The switch lives in lib/hideUnderDesign.ts: on by default since 3 Nov (Ruijie), the person's choice remembered in this
// browser. Re-exported here so existing imports keep working.
export { useHideUnderDesign }
const NO_REMOVAL: Removal = { hidden: new Set(), byTower: [] }

/** Footprints hidden under the Real Vancouver design towers while the toggle is on (indices into data.footprints). */
export function useRemoval(data: CityData | null): Removal {
  const on = useHideUnderDesign((s) => s.on)
  const towers = useStore((s) => s.towers.city)
  const r0 = useMemo(() => (on && data && towers.length ? removalUnder(data.footprints, towers) : NO_REMOVAL), [on, data, towers])
  // Buildings the Real Vancouver study site replaces are demolished too, unless the user keeps them (insert by Integrate Vista, 4 Nov).
  const site = useSiteStore((s) => s.site)
  const r = useMemo(() => {
    const extra = data ? demolishedIndices(data.footprints, site) : []
    return extra.length ? { hidden: new Set([...r0.hidden, ...extra]), byTower: r0.byTower } : r0
  }, [r0, data, site])
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
/** Half the side of the square the park texture is painted over (uv 0..1 across it); it covers the plinth. */
const PLANE_HALF = 9000
/** The backdrop (R2 north of the plinth) is meshed to within about this many metres of its grid (RTIN, see lib/terrainMesh.ts). */
const R2_MAX_ERROR = 1
/** The backdrop fades toward the background colour over this distance north of the plinth, up to BACKDROP_FOG. */
const BACKDROP_FADE = 8000
const BACKDROP_FOG = 0.55
/** City building bases go this far below the lowest ground at their corners, so no base floats on a slope. */
const BASE_SINK = 1
/** The north edge runs on into the backdrop, so it gets no edge line. */
const CITY_EDGES: Side[] = ['south', 'east', 'west']
const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u) }
const inGrid = (g: HeightGrid, x: number, y: number) => x >= g.x0 && y >= g.y0 && x <= g.x0 + (g.cols - 1) * g.step && y <= g.y0 + (g.rows - 1) * g.step

/** The rows of `g` from `y` northward (rows run south to north), sharing its heights. */
function rowsFrom(g: HeightGrid, y: number): HeightGrid {
  const r0 = Math.max(0, Math.round((y - g.y0) / g.step))
  return { ...g, rows: g.rows - r0, y0: g.y0 + r0 * g.step, z: g.z.subarray(r0 * g.cols) }
}

/** The backdrop grid: R2 from `y` northward, padded with no-data to whole RTIN tiles, so no strip stays at full resolution. */
function backdropGrid(r2: HeightGrid, y: number, tile = 64): HeightGrid {
  const g = rowsFrom(r2, y)
  const cols = Math.ceil((g.cols - 1) / tile) * tile + 1, rows = Math.ceil((g.rows - 1) / tile) * tile + 1
  const z = new Float32Array(cols * rows).fill(NaN)
  for (let r = 0; r < g.rows; r++) z.set(g.z.subarray(r * g.cols, (r + 1) * g.cols), r * cols)
  return { ...g, cols, rows, z }
}

/**
 * Heightfield mesh. Water reads about -2 m in MRDEM (a lidar-time level), so on the plinth the flat sea (SEA_Z, drawn in
 * Viewport.tsx) covers it and cuts the coastline: cells with no node above 0 m are left out there. The plinth top is
 * drawn at full 30 m resolution (outlines and blocks sit on it) around the LiDAR patches set into it.
 * The backdrop (`stitch` given: R2 north of the plinth) takes the plinth top's heights on their shared edge, is
 * simplified within R2_MAX_ERROR, and fades toward the background with distance: a fogged backdrop, not the model.
 */
function terrainGeometry(g: HeightGrid, look: Look, opt: { patches?: HeightGrid[]; adaptive?: boolean; stitch?: HeightGrid } = {}): THREE.BufferGeometry {
  const { cols, rows, step, x0, y0, z } = g
  const { patches = [], adaptive = false, stitch } = opt
  const pos = new Float32Array(cols * rows * 3)
  const col = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  const shown = new Float32Array(cols * rows)
  const sea = new THREE.Color(look.water)
  const land = new THREE.Color(look.ground)
  // Vista's Plain look keeps one terrain colour (its shader adds the light and the paper grain); the others darken with height.
  const vista = look === VISTA_LOOK
  const low = vista ? land.clone() : land.clone().multiplyScalar(0.86)
  const high = vista ? land.clone() : land.clone().multiplyScalar(0.66)
  const bg = new THREE.Color(look.background)
  const c = new THREE.Color()
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = r * cols + k, x = x0 + k * step, y = y0 + r * step
      let h = z[i]
      if (stitch && inGrid(stitch, x, y)) h = sampleGrid(stitch, x, y) ?? h
      shown[i] = h
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Number.isNaN(h) ? 0 : h // no-data nodes are in no triangle
      uv[i * 2] = (x + PLANE_HALF) / (2 * PLANE_HALF); uv[i * 2 + 1] = (y + PLANE_HALF) / (2 * PLANE_HALF)
      if (h > 0) c.copy(low).lerp(high, Math.min(1, h / 1000)); else c.copy(sea)
      if (stitch) c.lerp(bg, BACKDROP_FOG * smooth((y - CITY_PLINTH.y1) / BACKDROP_FADE))
      c.toArray(col, i * 3)
    }
  }
  let index: Uint32Array
  if (stitch || adaptive) {
    index = rtinIndices(shown, cols, rows, { tile: 64, maxError: adaptive ? 0.15 : R2_MAX_ERROR })
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
        if (wet && x >= CITY_PLINTH.x0 && x + step <= CITY_PLINTH.x1 && y >= CITY_PLINTH.y0 && y + step <= CITY_PLINTH.y1) continue // under the sea
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

/**
 * What the city's site model is made of: its 30 m top (lib/plinth.ts plinthTopGrid), the 1 m LiDAR patches set into
 * it, and the drawn ground height anywhere (the camera floor, building bases and tower footings all read it).
 */
interface CitySurface { top: HeightGrid; patches: HeightGrid[]; at: (x: number, y: number) => number }
const surfaces = new WeakMap<CityData, CitySurface>()
function citySurface(data: CityData): CitySurface {
  let s = surfaces.get(data)
  if (s) return s
  const top = plinthTopGrid(data.r1, data.r2)
  const patches = mosaicGrids(data.ground).map((g) => groundDisplayPatch(g, data.r1))
  const at = (x: number, y: number) => {
    for (const g of patches) { const h = sampleGrid(g, x, y); if (h !== null) return Math.max(SEA_Z, h) }
    const h = sampleDrawn(top, x, y)
    if (h !== null) return Math.max(SEA_Z, h)
    const b = sampleGrid(data.r2, x, y) // off the plinth: the backdrop's mesh is within 1 m of R2
    return b === null ? 0 : Math.max(0, b) + R2_MAX_ERROR
  }
  s = { top, patches, at }
  surfaces.set(data, s)
  return s
}

/** The backdrop's south face where it reaches past the plinth (west and east of it), from its edge down to the base. */
function backdropFront(r2: HeightGrid, top: HeightGrid): THREE.BufferGeometry {
  const g = rowsFrom(r2, CITY_PLINTH.y1)
  const west: [number, number, number][] = [], east: [number, number, number][] = []
  for (let k = 0; k < g.cols; k++) {
    const x = g.x0 + k * g.step
    const h = inGrid(top, x, g.y0) ? (sampleGrid(top, x, g.y0) ?? g.z[k]) : g.z[k]
    if (Number.isNaN(h)) continue
    if (x <= CITY_PLINTH.x0) west.push([x, g.y0, h])
    if (x >= CITY_PLINTH.x1) east.push([x, g.y0, h])
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute([...skirtPositions(west, CITY_PLINTH.bottom), ...skirtPositions(east, CITY_PLINTH.bottom)], 3))
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

/** Park outlines painted into a texture over the plinth's square; the terrain multiplies it in (white = no tint). */
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

/**
 * OSM water (public/data/water.json, tools/build_water_mask.py) as a black-on-white mask over the same square as the park
 * mask (about 5.9 m a pixel), for Vista's terrain shader. Display only: no elevation changes.
 */
let waterCache: Promise<number[][][] | null> | null = null
function loadWater(manifest: Manifest): Promise<number[][][] | null> {
  waterCache ??= (async () => {
    const layer = manifest.layers.find((l) => l.id === 'water')
    if (!layer) return null
    const r = await fetch(`./data/${layer.file}`)
    if (!r.ok) throw new Error(`${layer.file}: HTTP ${r.status}`)
    const j = (await r.json()) as { version: number; origin: number[]; polygons: number[][][] }
    if (j.version !== 1 || j.origin[0] !== 491300 || j.origin[1] !== 5458600) throw new Error('water: unsupported frame')
    return j.polygons
  })()
  return waterCache
}

function waterTexture(polys: number[][][] | null): THREE.CanvasTexture | null {
  if (!polys || typeof document === 'undefined') return null
  const n = 3072, s = n / (2 * PLANE_HALF)
  const cv = document.createElement('canvas')
  cv.width = cv.height = n
  const g = cv.getContext('2d')
  if (!g) return null
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n)
  g.fillStyle = '#000000'
  for (const rings of polys) {
    g.beginPath()
    for (const flat of rings) {
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const px = (flat[i] / 10 + PLANE_HALF) * s, py = n - (flat[i + 1] / 10 + PLANE_HALF) * s
        if (i) g.lineTo(px, py); else g.moveTo(px, py)
      }
      g.closePath()
    }
    g.fill('evenodd')
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

function useWaterMask(manifest: Manifest, on: boolean) {
  const [polys, setPolys] = useState<number[][][] | null>(null)
  useEffect(() => { if (!on) return; let live = true; loadWater(manifest).then((p) => live && setPolys(p), () => {}); return () => { live = false } }, [manifest, on])
  const tex = useMemo(() => (on ? waterTexture(polys) : null), [on, polys])
  useEffect(() => { setWaterMask(tex); return () => { tex?.dispose(); setWaterMask(null) } }, [tex])
}

function Shoreline({ lines, grids, color }: { lines: number[][]; grids: HeightGrid[]; color: string }) {
  const geom = useMemo(() => {
    const p: number[] = []
    for (const flat of lines) {
      for (let i = 0; i + 3 < flat.length; i += 2) {
        const ax = flat[i] / 10, ay = flat[i + 1] / 10, bx = flat[i + 2] / 10, by = flat[i + 3] / 10
        if (!insidePlinth(CITY_PLINTH, ax, ay) || !insidePlinth(CITY_PLINTH, bx, by)) continue // the 2002 line runs on past UBC
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
  const surface = citySurface(data)
  const detailed = useMemo(() => surface.patches.map((g) => terrainGeometry(g, look, { adaptive: true })), [surface, look])
  const r1 = useMemo(() => terrainGeometry(surface.top, look, { patches: surface.patches }), [surface, look])
  const r2 = useMemo(() => terrainGeometry(backdropGrid(data.r2, CITY_PLINTH.y1), look, { stitch: surface.top }), [data, surface, look])
  const front = useMemo(() => backdropFront(data.r2, surface.top), [data, surface])
  // The walls meet the top on its boundary nodes (30 m), where the sea is the flat plane, not MRDEM's -2 m.
  const ring = useMemo(() => plinthRing(CITY_PLINTH, (x, y) => Math.max(SEA_Z, sampleGrid(surface.top, x, y) ?? SEA_Z), surface.top.step), [surface])
  const parks = useMemo(() => parkTexture(finish.parks, look.park), [finish.parks, look.park])
  useEffect(() => () => { r1.dispose(); r2.dispose(); front.dispose(); detailed.forEach((g) => g.dispose()) }, [r1, r2, front, detailed])
  useEffect(() => () => parks?.dispose(), [parks])
  // Context style: Vista's paving on land and its grass watercolour in the City's parks (a black-on-white park mask).
  const context = useSceneStyle((s) => s.style) === 'context'
  const tex = useVistaTextures(context)
  const contextGround = useMemo(() => (tex ? contextGroundMaterial(tex, parkTexture(finish.parks, '#000000'), PLANE_HALF) : null), [tex, finish.parks])
  useEffect(() => () => contextGround?.dispose(), [contextGround])
  // Vista's Plain look: Vista's terrain shading with its park wash, from the same black-on-white park mask.
  const vista = look === VISTA_LOOK && !context
  const vistaGround = useMemo(() => (vista ? vistaShaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), 'terrain') : null), [vista])
  const mask = useMemo(() => (vista ? parkTexture(finish.parks, '#000000') : null), [vista, finish.parks])
  useEffect(() => { setParkMask(mask, PLANE_HALF); return () => { mask?.dispose(); setParkMask(null, PLANE_HALF) } }, [mask])
  useEffect(() => () => vistaGround?.dispose(), [vistaGround])
  // The water specks: OSM water drawn over the terrain in the water colour (display only).
  useWaterMask(data.manifest, vista)
  const ground = contextGround ?? vistaGround
  const groundKey = contextGround ? 'context' : 'vista'
  // Only the plinth top takes clicks (placing towers); the backdrop is scenery.
  // While the height surface is drawing an area, ground clicks set its corners instead of moving the tower.
  const pick = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (!drawClick(e.point.x, -e.point.z)) onPick(e.point.x, -e.point.z) }
  return (
    <>
      {ground ? <mesh key={groundKey} geometry={r1} material={ground} receiveShadow onPointerDown={pick} /> : <mesh key="plain" geometry={r1} receiveShadow onPointerDown={pick}>
        <meshStandardMaterial key={parks ? 'p' : 'n'} vertexColors map={parks} roughness={1} metalness={0} />
      </mesh>}
      {detailed.map((geometry, i) => ground ? <mesh key={`${groundKey}${i}`} geometry={geometry} material={ground} receiveShadow onPointerDown={pick} /> : <mesh key={`p${i}`} geometry={geometry} receiveShadow onPointerDown={pick}>
        <meshStandardMaterial key={parks ? 'p' : 'n'} vertexColors map={parks} roughness={1} metalness={0} />
      </mesh>)}
      {tex && <ContextWater tex={tex} />}
      {finish.shoreline && <Shoreline lines={finish.shoreline.lines} grids={data.grids} color={look.shore} />}
      <PlinthBase plinth={CITY_PLINTH} ring={ring} look={look} pad={1} edges={CITY_EDGES} />
      {vistaGround ? <mesh key="vista-r2" geometry={r2} material={vistaGround} receiveShadow /> : <mesh key="plain-r2" geometry={r2} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>}
      <mesh geometry={front}>
        <meshStandardMaterial color={look.plinth} roughness={1} metalness={0} />
      </mesh>
    </>
  )
}

/** Context style's sea: Vista's turquoise wash with ripples, laid just over the plinth's flat sea (Viewport's Ground still takes clicks). */
function ContextWater({ tex }: { tex: VistaTextures }) {
  const size: [number, number] = [CITY_PLINTH.x1 - CITY_PLINTH.x0, CITY_PLINTH.y1 - CITY_PLINTH.y0]
  const mat = useMemo(() => { const m = contextWaterMaterial(tex, size); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; return m }, [tex]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { mat.normalMap?.dispose(); mat.dispose() }, [mat])
  return (
    <mesh material={mat} position={[(CITY_PLINTH.x0 + CITY_PLINTH.x1) / 2, (CITY_PLINTH.y0 + CITY_PLINTH.y1) / 2, SEA_Z + 0.02]} receiveShadow raycast={() => null}>
      <planeGeometry args={size} />
    </mesh>
  )
}

// ---------- buildings ----------
/**
 * The same prism without its downward-facing cap: every base sits in the ground (BASE_SINK) or over a clearance no
 * camera can see from below (CameraClamp), so it is never seen, and dropping it saves about a fifth of the triangles.
 */
function withoutUnderside(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal')
  const keep: number[] = []
  for (let t = 0; t < nrm.count; t += 3) if (nrm.getZ(t) > -0.5) keep.push(t)
  if (keep.length * 3 === nrm.count) return g
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) {
    const src = g.getAttribute(name), size = src.itemSize, arr = new Float32Array(keep.length * 3 * size)
    keep.forEach((t, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < size; c++) arr[(k * 3 + v) * size + c] = src.getComponent(t + v, c) })
    out.setAttribute(name, new THREE.BufferAttribute(arr, size))
  }
  g.dispose()
  return out
}

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
    g = withoutUnderside(g)
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
 * Vista's model: OpenStreetMap buildings, those with a height from a tag or a floor count in clay and those with an
 * estimate per building type a shade off. City model: stepped LiDAR 2022 roof parts, then the City's 2009 heights in
 * the ring outside the 2022 core (a shade off, an older survey). Solid clay, ghosted in x-ray.
 */
function Buildings(props: { data: CityData; look: Look; ghost: boolean; hidden: ReadonlySet<number> }) {
  return props.data.vista ? <VistaBuildingMesh {...props} vista={props.data.vista} /> : <CityBuildings {...props} />
}

/**
 * Vista's model in one mesh. Plain: each building in the light tint of its type (lib/buildingUse.ts), a shade off where
 * its height is a type estimate. Context: Vista's facades (ContextStyle.tsx), once its textures have loaded.
 */
function VistaBuildingMesh({ data, look, ghost, hidden, vista: v }: { data: CityData; look: Look; ghost: boolean; hidden: ReadonlySet<number>; vista: VistaBuildings }) {
  const style = useSceneStyle((s) => s.style)
  const typeColours = useVistaLook((s) => s.typeColours)
  const invalidate = useThree((s) => s.invalidate)
  const vistaLook = look === VISTA_LOOK && !ghost
  const h = data.heights
  const m = useMemo(() => {
    const at = citySurface(data).at
    const base = (i: number) => (v.clearance[i] > 0 ? h!.ground[i] : data.footprints[i].outer.reduce((k, [x, y]) => Math.min(k, at(x, y)), h!.ground[i]) - BASE_SINK)
    const out = prisms(data, (i) => hasHeight(h, i), base, (i) => h!.roof[i])
    if (!out.geom) return out
    const count = out.geom.getAttribute('position').count
    out.geom.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(count * 3), 3, true)) // filled below
    out.geom.setAttribute('aFacade', facadeAttribute(count, out.ranges, (i) => {
      const f = data.footprints[i]
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const [x, y] of f.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
      const seed = vistaSeed(v.osmId[i])
      return { ...vistaFamily(v.osmType[i], h!.roof[i] - h!.ground[i], Math.max(x1 - x0, y1 - y0), seed), seed, base: h!.ground[i], top: h!.roof[i] }
    }))
    return out
  }, [data, h, v])
  useEffect(() => () => m.geom?.dispose(), [m])
  // Colours: the light tint of each building's type ("Colour buildings by type", on by default), or Vista's white;
  // a building whose height is a type estimate a shade off.
  useEffect(() => {
    const attr = m.geom?.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!attr) return
    const rgb = attr.array as Uint8Array, c = new THREE.Color()
    for (const [i, start, n] of m.ranges) {
      c.set(typeColours ? useColor(partUse(v, i).use) : VISTA.buildings).multiplyScalar(isEstimate(data, i) ? 0.93 : 1)
      const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255)
      for (let k = start; k < start + n; k++) { rgb[k * 3] = r; rgb[k * 3 + 1] = g; rgb[k * 3 + 2] = b }
    }
    attr.needsUpdate = true
    invalidate()
  }, [m, typeColours, v, data, invalidate])
  useHiddenParts(m.geom, m.ranges, hidden)
  const vistaMat = useMemo(() => (vistaLook ? vistaShaded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), 'buildings') : null), [vistaLook])
  useEffect(() => () => vistaMat?.dispose(), [vistaMat])
  const tex = useVistaTextures(style === 'context' && !ghost)
  const facade = useMemo(() => (tex ? contextFacadeMaterial(tex) : null), [tex])
  useEffect(() => () => facade?.dispose(), [facade])
  if (!m.geom) return null
  // Separate keys: reusing one mesh across styles would leave three's default material behind when `material` is dropped.
  if (facade) return <mesh key="context" geometry={m.geom} material={facade} castShadow receiveShadow />
  if (vistaMat) return <mesh key="vista" geometry={m.geom} material={vistaMat} castShadow receiveShadow />
  return (
    <mesh key="plain" geometry={m.geom} castShadow={!ghost} receiveShadow>
      <meshStandardMaterial vertexColors color={ghost ? look.context : '#ffffff'} roughness={0.92} metalness={0} transparent opacity={ghost ? 0.45 : 1} depthWrite={!ghost} />
    </mesh>
  )
}

/** The City model (comparison): LiDAR 2022 roof parts in clay, the City's 2009 heights a shade off. */
function CityBuildings({ data, look, ghost, hidden }: { data: CityData; look: Look; ghost: boolean; hidden: ReadonlySet<number> }) {
  const h = data.heights
  const meshes = useMemo(() => {
    // Drawn from just below the lowest ground at the corners (heights unchanged), so no base floats where the ground falls;
    // elevated parts (bridges, overhangs) keep their clearance.
    const at = citySurface(data).at
    const base = (i: number) => (data.vista && data.vista.clearance[i] > 0 ? h!.ground[i]
      : data.footprints[i].outer.reduce((m, [x, y]) => Math.min(m, at(x, y)), h!.ground[i]) - BASE_SINK)
    return [false, true].map((older) => prisms(data, (i) => hasHeight(h, i) && isEstimate(data, i) === older, base, (i) => h!.roof[i]))
  }, [data, h])
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
  const clean = useDock((s) => s.hidden) // H: a clean view also drops this in-scene note (the dock says the same)
  if (!shown && !blocks) return null
  // One label for everything without a height: the flat outlines and the hatched placeholders.
  const text = [shown && `${shown.toLocaleString()} 2015 outlines`, blocks && `${blocks.toLocaleString()} hatched ${data.placeholderHeight} m placeholders`].filter(Boolean).join(' + ')
  return (
    <>
      {shown > 0 && <lineSegments geometry={geom}>
        <lineBasicMaterial color={xray ? '#6f8299' : '#80858d'} transparent opacity={0.85} />
      </lineSegments>}
      {!clean && <Label text={`No height data: ${text} (display only)`} position={anchor} size={0.015} color="#4a4f57" />}
    </>
  )
}

// ---------- view-cone plan outlines draped on the terrain ----------

// ---------- footings under design towers ----------
/**
 * Where the ground falls away under a design tower, its base is made up to the tower's floor in the plinth colour (a
 * model maker's packing), so a tower on a slope never shows its underside. Display only: heights and checks unchanged.
 */
function TowerFootings({ at, look }: { at: (x: number, y: number) => number; look: Look }) {
  const towers = useTowers()
  const base = useStore((s) => s.groundElevation)
  const geom = useMemo(() => {
    const pos: number[] = []
    for (const t of towers) {
      const outlines = [towerFootprint(t)]
      if (!t.imported && t.podiumHeight > 0) outlines.push(towerFootprint(t, true))
      for (const o of outlines) {
        const area = o.reduce((a, p, i) => a + p[0] * o[(i + 1) % o.length][1] - o[(i + 1) % o.length][0] * p[1], 0)
        const ring = area < 0 ? [...o].reverse() : o
        let low = Infinity
        ring.forEach(([x, y], i) => {
          const [nx, ny] = ring[(i + 1) % ring.length]
          for (let s = 0; s < 4; s++) low = Math.min(low, at(x + ((nx - x) * s) / 4, y + ((ny - y) * s) / 4))
        })
        if (low < base - 0.05) pos.push(...skirtPositions(ring.map(([x, y]) => [x, y, base] as [number, number, number]), low - BASE_SINK, true))
      }
    }
    if (!pos.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [towers, base, at])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!geom) return null
  return <mesh geometry={geom} receiveShadow><meshStandardMaterial color={look.plinth} roughness={1} metalness={0} /></mesh>
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
    if (followed !== data) return // a newer data set took over (never two followers setting the base back and forth)
    if (s.project !== 'city' || s.groundMode !== 'terrain') return
    const t = s.towers.city.find((k) => k.id === s.selectedTower)
    const g = t ? groundUnder(data.grids, rectCorners(t.x, t.y, t.width, t.depth, t.rotation)) : null
    if (g && Math.abs(round1(g.value) - s.groundElevation) >= 0.05) withoutHistory(() => useStore.getState().set({ groundElevation: round1(g.value) }))
  }
  unfollow = useStore.subscribe(apply)
  apply(useStore.getState())
}
// Dev only: a hot reload of this file must drop the old copy's subscription, or the old and new copies (each with its own
// ground grids) set groundElevation back and forth until the stack overflows (Integrate Vista, 4 Nov).
if (import.meta.hot) import.meta.hot.dispose(() => { unfollow?.(); unfollow = null; followed = null })

/**
 * Says where the tower base comes from: the terrain (default, flagged unverified) or a value set by hand, with a
 * one-click switch either way. The base moves every view-cone result (top = base + height).
 */
function GroundCard({ data, bare = false }: { data: CityData; bare?: boolean }) {
  const base = useStore((s) => s.groundElevation)
  const mode = useStore((s) => s.groundMode)
  const { t, g, basis } = useTowerGround(data)
  const terrain = g ? round1(g.value) : null
  if (!t) return null
  const following = mode === 'terrain' && terrain !== null
  const btn = 'rounded border border-line bg-white px-1.5 py-0.5 font-medium text-ink hover:bg-slate-50'
  return (
    <div className={bare ? 'text-[11px] text-slate-600' : 'w-80 shrink-0 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm'} data-testid="ground-card">
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
 * The existing buildings under the design (Vista's automatic demolition): hidden by default since 3 Nov (Ruijie), so no
 * existing building shows through a proposal. Says what is hidden, under which tower, and that it is the team's
 * hypothesis; one click shows them again (remembered in this browser). In the Layers dock and inline in the Vista panel.
 */
export function HideUnderDesignCard({ inline = false, bare = false }: { inline?: boolean; bare?: boolean }) {
  const { data } = useCityData()
  const on = useHideUnderDesign((s) => s.on)
  const towers = useStore((s) => s.towers.city)
  const { hidden, byTower } = useRemoval(data)
  // While shown, how many existing footprints the towers overlap, so the card can say they show through the proposal.
  const overlap = useMemo(() => (!on && data && towers.length ? removalUnder(data.footprints, towers).hidden.size : 0), [on, data, towers])
  if (!data || !towers.length) return null
  const c = removalCounts(hidden, data.heights)
  const underTowers = byTower.filter((b) => b.indices.length)
  const bySite = hidden.size - new Set(underTowers.flatMap((b) => b.indices)).size
  const where = [underTowers.length ? `under ${underTowers.map((b) => b.name).join(', ')}` : '', bySite ? `${bySite.toLocaleString()} replaced by the study site` : ''].filter(Boolean).join('; ')
  const btn = 'mt-1 rounded border border-line bg-white px-2 py-0.5 font-medium text-ink hover:bg-slate-50'
  return (
    <div className={bare ? 'text-[11px] text-slate-600' : inline ? 'mt-2 rounded-md border border-line p-2 text-[11px]' : 'w-80 shrink-0 rounded-md border border-line bg-white/95 px-2 py-1.5 text-[11px] text-slate-600 shadow-sm'}>
      {inline && <div className="font-medium text-ink">Existing buildings under the design</div>}
      <div aria-live="polite">
        {on
          ? c.total
            ? <>Hidden: <b className="text-ink">{plural(c.total, 'existing building footprint')}</b> {where} ({data.model === 'vista' ? plural(c.measured, 'OSM building part') : <>{plural(c.measured, 'LiDAR 2022 roof part')}, {plural(c.outlines, '2015 outline')} with no height</>}).</>
            : 'No existing building lies under the design towers.'
          : <>All existing buildings are drawn{overlap ? <>, including <b className="text-ink">{plural(overlap, 'footprint')}</b> under the design that show through it</> : ''}; every one blocks sightlines.</>}
      </div>
      {on
        ? <button type="button" className={btn} onClick={() => useHideUnderDesign.setState({ on: false })}>Show the existing buildings again</button>
        : <button type="button" className={btn} onClick={() => useHideUnderDesign.setState({ on: true })}>Hide the existing buildings under the design</button>}
      <div className="mt-1 flex items-start gap-1.5">
        <span className="shrink-0"><FlagChip flag={REMOVAL_FLAG} /></span>
        <span className="text-[10px] leading-snug text-slate-500">{REMOVAL_CAVEAT} {REMOVAL_RULE} Hidden buildings leave the drawing, View from here and Vista's rooftop views; the view-study PDF states them. On by default (rule from Vista's automatic demolition); your choice is remembered in this browser.</span>
      </div>
    </div>
  )
}

/**
 * The study site as a lot surface in the Context style (Ruijie, 3 Nov: "for conbine property line of the earlier tab it
 * will change the context as well"): Vista's paving, warm-tinted, over the site the Site step made (drawn, from
 * buildings, or combined City parcels; lib/siteStore.ts `site.ring`), draped on the ground. The buildings it replaces are
 * already gone from the drawing (useRemoval, a hypothetical removal), and SiteRig draws the boundary in both styles.
 * Display only.
 */
function SiteSurface({ grids, tex }: { grids: HeightGrid[]; tex: VistaTextures }) {
  const site = useSiteStore((s) => s.site)
  const geom = useMemo(() => {
    if (!site || site.ring.length < 3) return null
    const ring = site.ring as [number, number][], pos: number[] = []
    for (const [a, b, c] of earClip(ring)) for (const k of [a, b, c]) { const [x, y] = ring[k]; pos.push(x, y, Math.max(0, sampleTerrain(grids, x, y) ?? 0) + 0.25) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [site, grids])
  const mat = useMemo(() => { const m = contextPavingMaterial(tex, false); m.color.set('#f2dfc4'); m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; return m }, [tex])
  useEffect(() => () => { geom?.dispose(); mat.dispose() }, [geom, mat])
  if (!geom) return null
  return <mesh geometry={geom} material={mat} receiveShadow raycast={() => null} renderOrder={1} />
}

/** Everything the Real Vancouver scene draws from public/data. Rendered inside CityScene's z-up group. */
export default function CityContext({ look, xray, onPick }: { look: Look; xray: boolean; onPick: (x: number, y: number) => void }) {
  const { data } = useCityData()
  const { hidden } = useRemoval(data)
  const grids = useMemo(() => (data ? data.grids : []), [data])
  const surface = data ? citySurface(data) : null
  useEffect(() => (surface ? registerGround({ at: surface.at, plinth: CITY_PLINTH }) : undefined), [surface])
  // The orbit view stays over the built model (lib/viewLimit.ts; Ruijie, 3 Nov): its edge is the buildings' bounding box.
  const builtEdge = useMemo(() => (data ? footprintBounds(data.footprints) : null), [data])
  useEffect(() => (builtEdge ? registerViewLimit(builtEdge) : undefined), [builtEdge])
  // Context style: Vista's streets replace the City street surfaces (finer detail around the selected tower).
  const context = useSceneStyle((s) => s.style) === 'context'
  const tex = useVistaTextures(context)
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  if (!data || !surface) return null
  return (
    <>
      <Terrain data={data} look={look} onPick={onPick} />
      <TowerFootings at={surface.at} look={look} />
      {/* Context: Vista's street surfaces; Vista's Plain look: its street lines; x-ray and the City model: City streets. */}
      {context && tex && <SiteSurface grids={grids} tex={tex} />}
      {context
        ? tex && <VistaStreets manifest={data.manifest} ground={surface.at} centre={[t?.x ?? 0, t?.y ?? 0]} tex={tex} />
        : look === VISTA_LOOK ? <VistaStreetLines manifest={data.manifest} ground={surface.at} color={VISTA.roads} />
        : <CityStreets streets={data.streets} ground={data.ground} coarse={data.r1} />}
      <Buildings data={data} look={look} ghost={xray} hidden={hidden} />
      <UnknownOutlines data={data} xray={xray} hidden={hidden} />
      <Placeholders data={data} xray={xray} hidden={hidden} />
      {/* Vista's view cones (outline, ceiling, featured corridor and origin, observer ray and wedge): components/VistaCones.tsx. */}
      <VistaCones grids={grids} />
      <ExistingConeCrossings footprints={data.footprints} heights={data.heights} hidden={hidden} xray={xray} />
      <GroundCheck data={data} />
      <HeightSurfaceLayer grids={grids} />
      <ContextLayersScene manifest={data.manifest} grids={grids} xray={xray} />
    </>
  )
}

// ---------- legend (DOM, outside the canvas) ----------
const mb = (b: number) => `${(b / 1e6).toFixed(2)} MB`

/** Lists every context layer with its source, licence, retrieval date, datum and flag. */
/**
 * Dock section: the view cones as Vista draws them, which ones show (the same switches as the Viewcone tab), and per
 * estimated cone how many existing buildings rise above its estimate (as drawn).
 */
function ConeLayersInfo({ data }: { data: CityData }) {
  const { hidden } = useRemoval(data)
  const shown = useConeVisibility((s) => s.hidden)
  const rows = coneCrossingsFor(data.footprints, data.heights).map((p) => ({ cone: p.cone, n: p.crossings.filter((c) => !hidden.has(c.index)).length }))
  return (
    <div className="space-y-1.5">
      <ConeVisibilityPanel compact />
      <p>
        Drawn as Vista's Viewcone volumes: each cone's ceiling over its corridor, curtains standing on the ceiling along every side up to
        a display cut (320–600 m, a scene cut, never a policy cap), and glowing edges. The featured cone (picked in Observer, else the one
        controlling the selected tower) is at Vista's single-cone strength and shows the buildings under it traced on its ceiling; the
        others are fainter. In Plan, as in Vista, only the plan outlines show. The outlines are the City ViewCone polygons, the same as
        Vista's to 0.01 m.
      </p>
      <p className="flex items-start gap-1.5">
        <span className="shrink-0"><FlagChip flag="team_assumption" /></span>
        <span>Ceilings: the City-sourced estimate Z = Lv + k·D for the {CONES.filter((c) => CONE_PARAMS[c.id]).length} cones that have one; for the other {CONES.filter((c) => !CONE_PARAMS[c.id]).length}, Vista's study surface, fainter and dashed: an assumption, not a City ceiling.</span>
      </p>
      <ul className="space-y-0.5">
        {rows.filter((r) => !shown[r.cone.id]).map((r) => (
          <li key={r.cone.id}>
            <b className="text-ink">{r.cone.id}</b> {r.cone.name}: {r.n.toLocaleString()} existing building part{r.n === 1 ? '' : 's'} (measured roof levels) rise{r.n === 1 ? 's' : ''} above its estimated lower boundary
          </li>
        ))}
      </ul>
      <p className="text-[10px]">
        Existing buildings are tinted blue inside the view with a dark blue line where the estimate crosses them; the design tower is red.
        Many existing buildings predate the protected views or were approved under them: this is a geometric reading of an estimate, not a finding.
        Hiding a cone hides its drawing only; checks and results are unchanged. The City View Cone Assessment governs.
      </p>
    </div>
  )
}

function ConeSummary() { return <>{shownSummary(useConeVisibility((s) => s.hidden))}</> }

/** Plain (pure tints by building type) or Context (Vista's textures), with the type legend. */
function StyleCard({ data }: { data: CityData }) {
  const style = useSceneStyle((s) => s.style)
  const typeColours = useVistaLook((s) => s.typeColours)
  const labels = useVistaLook((s) => s.labels)
  const v = data.vista
  const counts = useMemo(() => {
    const by = Object.fromEntries(BUILDING_USES.map((u) => [u.id, 0])) as Record<BuildingUse, number>
    const basis = Object.fromEntries(USE_BASES.map((b) => [b, 0])) as Record<UseBasis, number>
    if (v) { const seen = new Set<string>(); v.osmId.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); const u = partUse(v, i); by[u.use]++; basis[u.basis]++ } }) }
    return { by, basis }
  }, [v])
  const opt = (s: SceneStyle, label: string) => (
    <label className="flex items-center gap-1"><input type="radio" name="scene-style" checked={style === s} onChange={() => useSceneStyle.setState({ style: s })} /> {label}</label>
  )
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Style" className="flex gap-3">{opt('plain', 'Plain')}{opt('context', 'Context')}</div>
      <label className="flex items-center gap-1"><input type="checkbox" checked={labels} onChange={(e) => useVistaLook.setState({ labels: e.target.checked })} /> Place labels (Vista's neighbourhood names)</label>
      {style === 'plain' && v && <label className="flex items-center gap-1"><input type="checkbox" checked={typeColours} onChange={(e) => useVistaLook.setState({ typeColours: e.target.checked })} /> Colour buildings by type</label>}
      {style === 'plain' && <p>Plain is Vista's Plain look (City overview, Vista @ 917b28e): paper background, warm-grey terrain, blue-grey water, muted parks and white buildings with soft shading; with <b>Colour buildings by type</b> each building takes a light tint of its type instead of white.</p>}
      {style === 'plain' ? (v ? typeColours && <>
        <ul className="grid grid-cols-1 gap-0.5">
          {BUILDING_USES.map((u) => (
            <li key={u.id} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 shrink-0 rounded-sm" style={{ background: useColor(u.id), border: `1px solid ${SWATCH_BORDER}` }} />
              <span className="min-w-0 flex-1">{u.label}</span><span className="tabular-nums text-slate-600">{counts.by[u.id].toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <p>Type from {USE_BASES.filter((b) => b !== 'none').map((b) => `${USE_BASIS_TEXT[b]} (${counts.basis[b].toLocaleString()})`).join(', then ')}; {counts.basis.none.toLocaleString()} buildings have {USE_BASIS_TEXT.none} and stay <b>other</b>, never guessed from height or shape. Light tints of the design tower's programme colours, so an office reads as office everywhere; the design tower keeps its full colours and outline. A building whose height is an estimate per type is a shade darker.</p>
      </> : <p>Building types come from Vista's OpenStreetMap model; the City model has none, so it stays in plain clay.</p>) : (
        <p>Vista's <b>Context</b> look: facades by family with illustrative windows (Poly Haven textures, CC0), pale concrete paving and asphalt with centre dashes (Ruijie Liu's own images), grass watercolour in the City's parks, water with ripples (ProcTexture, CC0) and illustrative bridge decks. Streets © OpenStreetMap contributors (ODbL), via Vista. Materials, windows, widths and decks are illustrative, never surveyed.</p>
      )}
    </div>
  )
}

/** Vista's model is the default; the earlier City model (LiDAR 2022 + City 2009 heights) stays one click away for comparison. */
function BuildingModelSwitch() {
  const model = useCityModel((s) => s.model)
  const opt = (m: CityModel, label: string) => (
    <label className="flex items-start gap-1"><input type="radio" name="city-model" className="mt-0.5" checked={model === m} onChange={() => useCityModel.setState({ model: m })} /> {label}</label>
  )
  return (
    <fieldset className="space-y-0.5">
      <legend className="font-semibold text-ink">Buildings model</legend>
      {opt('vista', "Vista's unified model (OpenStreetMap; default)")}
      {opt('city', 'City model for comparison: LiDAR 2022 roofs in the core, City 2009 heights around them')}
      <p className="text-slate-500">Every check (solar, View from here, Vista, view cones, demolition) uses the model shown.</p>
    </fieldset>
  )
}

/** What Vista's buildings are, how their heights were made, and how they compare with the City's measured heights. */
function VistaBuildingsNote({ data }: { data: CityData }) {
  const v = data.vista
  const entry = data.manifest.layers.find((l) => l.id === 'vista_buildings')
  const check = entry?.processing?.height_check as { towers_over_60m_by_lidar?: number; towers_within_10pct?: number } | undefined
  const align = (entry?.processing?.alignment as Record<string, { median_offset_m: number; max_offset_m: number }> | undefined)?.city_2015_footprints
  const counts = useMemo(() => {
    const by: Record<HeightBasis, number> = { lidar2022: 0, city2009: 0, 'osm-tag': 0, 'osm-levels': 0, 'type-estimate': 0 }
    if (v) v.heightM.forEach((_, i) => { by[chooseHeight(v, i).basis]++ })
    return { by, buildings: v ? new Set(v.osmId).size : 0 }
  }, [v])
  if (!v) return <p role="alert">Vista's buildings did not load; see the error below.</p>
  const n = (b: HeightBasis) => <b className="text-ink">{counts.by[b].toLocaleString()}</b>
  return (
    <div className="space-y-1.5">
      <p>
        <b className="text-ink">{counts.buildings.toLocaleString()} buildings from Vista's unified model</b> ({data.footprints.length.toLocaleString()} footprint parts):
        the studio model's 2022 OpenStreetMap export in the centre and current OpenStreetMap around it. Footprints are taken through latitude/longitude into
        EPSG:26910{align ? ` (median ${align.median_offset_m} m from the City's 2015 footprints)` : ''}; each building stands on the City ground at its footprint's centre (CGVD28), never on Vista's SRTM terrain.
      </p>
      <p>
        Each part at its <b>best height</b> (Ruijie, 3 Nov): {n('lidar2022')} from City LiDAR 2022 roofs and {n('city2009')} from the City's 2009 heights where they cover at least half the footprint (measured),
        then Vista's OpenStreetMap values, <b>unverified</b>: {n('osm-tag')} from an {VISTA_SOURCES[0]}, {n('osm-levels')} from an {VISTA_SOURCES[1]} (3.2 m per level),{' '}
        <span className="mr-1 inline-block h-2.5 w-3.5 rounded-sm border border-black/10 align-middle" style={{ background: LOOKS.clay.older }} />
        {n('type-estimate')} {VISTA_SOURCES[2]} (a shade off; e.g. a house 8 m, an office 15 m). Picking a roof names its source.
        {check?.towers_over_60m_by_lidar ? <> Vista's own heights are within 10% of LiDAR for only {check.towers_within_10pct} of {check.towers_over_60m_by_lidar} parts over 60 m, which is why measured heights come first.</> : null}
      </p>
      <p className="text-[10px] text-slate-500">{VISTA_ATTRIBUTION}. The building layer, and the per-building height table combining it with City heights, are derivative databases of OpenStreetMap, offered under the Open Database License 1.0.</p>
    </div>
  )
}

export function CityLegend() {
  const { data, error } = useCityData()
  const streetDisplay = useStreetDisplay()
  const style = useSceneStyle((s) => s.style)
  const base = useStore((s) => s.groundElevation)
  const mode = useStore((s) => s.groundMode)
  const hideOn = useHideUnderDesign((s) => s.on)
  const hiddenCount = useRemoval(data).hidden.size
  const surfaceOn = useHeightSurface((s) => s.on)
  const layersOn = useContextLayers((s) => Object.values(s.on).filter(Boolean).length)
  const estimates = CONES.filter((c) => CONE_PARAMS[c.id]).length
  // Was a permanent box over the top-left of the view; now a note that stays dismissed once dismissed.
  const hint = { id: 'city-cones', content: <><b className="text-ink">{CONES.length} protected view cones</b> (City open data). <b className="text-ink">{estimates} have an estimated height limit</b> (solid outline, ceiling drawn in Vista's study-ceiling colour); the other <b className="text-ink">{CONES.length - estimates} are dashed: no City estimate</b> until the City answers Request 0, so their ceiling is Vista's study surface (an assumption). Show or hide them with the Viewcone tab. Ground, buildings and mountains are real data: see Data sources below.</> }
  const sources = 'Data sources & context layers'
  if (error) {
    return <ViewportDock anchored hint={hint} sections={[{ id: 'sources', title: sources, defaultOpen: true, children: (
      <p role="alert"><b className="text-ink">Context layers not loaded.</b> {error}. Build them with the scripts in <code>tools/</code> (see README).</p>
    ) }]} />
  }
  if (!data) return <ViewportDock anchored hint={hint} sections={[{ id: 'sources', title: sources, summary: 'loading…', defaultOpen: true, children: <p role="status">Loading Vancouver context…</p> }]} />
  const { manifest, footprints, heights } = data
  const withHeight = footprints.filter((_, i) => hasHeight(heights, i)).length
  const older = data.model === 'city' ? footprints.filter((f) => is2009Part(f.id)).length : 0
  const firstLoad = manifest.layers.filter((l) => !l.lazy)
  const total = firstLoad.reduce((s, l) => s + layerBytes(l), 0)
  const onDemand = manifest.layers.filter((l) => l.lazy && !isTerrainDetail(l) && !['building_forms', 'building_forms_2009', 'city_streets', 'shoreline', 'parks'].includes(l.id)).length
  const fas = manifest.layers.flatMap((l) => l.false_assumptions ?? [])
  return (
    <ViewportDock anchored hint={hint} sections={[
      { id: 'sources', title: sources, summary: `${firstLoad.length} · ${mb(total)}${onDemand ? ` · ${onDemand} on demand` : ''}`, children: (
        <div className="space-y-2">
          <p role="status">
            {data.detailStatus === 'loading' ? 'Loading buildings, streets and terrain…' : `Ground: ${data.ground.length ? 'City LiDAR 1 m where covered' : 'MRDEM 30 m'} · Mountains: ${data.r2.step} m`}
            {' · '}{data.roofParts.toLocaleString()} {data.model === 'vista' ? 'building parts (Vista)' : 'measured building parts'} · {data.streets ? 'City streets loaded' : 'Streets unavailable'}
          </p>
          <BuildingModelSwitch />
          {data.model === 'vista' ? <VistaBuildingsNote data={data} /> : <p>
            <b className="text-ink">{(data.roofParts - older).toLocaleString()} roof parts from City LiDAR 2022</b> (the 2 × 2 km core) and{' '}
            <span className="mr-1 inline-block h-2.5 w-3.5 rounded-sm border border-black/10 align-middle" style={{ background: LOOKS.clay.older }} />
            <b className="text-ink">{older.toLocaleString()} from the City's 2009 heights</b> around it, across the 24 view cones and the gaps between them (an older survey, a shade darker; 2009 buildings no longer on the 2015 map are left out).{' '}
            {withHeight.toLocaleString()} solid parts in total. <b>No height data</b> (never a guessed height): {(footprints.length - withHeight - data.placeholders.size).toLocaleString()} flat 2015 outlines
            {data.placeholders.size > 0 && <> and {data.placeholders.size.toLocaleString()} hatched {data.placeholderHeight} m placeholders (mostly garages and laneway houses under 60 m², which the generalised 2009 survey leaves out or which are newer; display only, in no calculation)</>}.
            One building, one representation: a LiDAR 2022 part wins over a City 2009 part, which wins over a 2015 outline or placeholder; anything overlapping a higher-ranked building by half of the smaller footprint is left out, smaller overlaps are cut away.
            {' '}Roof forms retain measured setbacks and separate podium levels at 1 m plan resolution, grouped in 3 m elevation bands. The 2022 survey and 2015 footprints do not represent all current development.
          </p>}
          <p>Detailed ground covers {data.ground.length} City LiDAR 1 km tile{data.ground.length === 1 ? '' : 's'} ({manifest.layers.filter(isGroundDetail).map((l) => l.id.replace('terrain_ground_', '')).join(', ')}). Elsewhere, and in gaps under buildings or water, ground uses MRDEM at 30 m. The model base is 15.8 × 15 km, enough for every building and City layer; north of it, the North Shore is a fogged backdrop (MRDEM terrain only).</p>
          {data.detailErrors.length > 0 && <p role="alert">Some detailed context could not load. The available base layers remain visible; reload to try again. {data.detailErrors.join('; ')}</p>}
          {data.roofParts > 0 && <button type="button" className="rounded border border-line px-2 py-1 font-medium text-ink hover:bg-slate-50" onClick={() => {
            useViewFromStore.getState().set({ looking: false, picking: false })
            useStore.getState().set({ cameraRequest: { position: [-1700, -150, 650], target: [-800, 900, 30], fov: 50 } })
          }}>{data.model === 'vista' ? 'Inspect downtown buildings' : 'Inspect extracted buildings'}</button>}
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
      ) },
      { id: 'style', title: 'Style & building types', defaultOpen: true, summary: style === 'context' ? 'Context (Vista textures)' : 'Plain', children: <StyleCard data={data} /> },
      { id: 'ground', title: 'Ground & tower base', defaultOpen: true, summary: `${base.toFixed(1)} m · ${mode === 'terrain' ? 'from the terrain' : 'set by hand'}`, children: <GroundCard data={data} bare /> },
      { id: 'existing', title: 'Existing buildings under the design', summary: hideOn ? (hiddenCount ? `${hiddenCount.toLocaleString()} hidden (hypothetical)` : 'none under the design') : 'all drawn', children: <HideUnderDesignCard bare /> },
      { id: 'height', title: 'Height-limit surface & cone parameters', summary: surfaceOn ? 'surface on' : 'off', children: <HeightSurfacePanel bare /> },
      { id: 'cones', title: 'View cone layers', summary: <ConeSummary />, children: <ConeLayersInfo data={data} /> },
      { id: 'more', title: 'More layers', summary: layersOn ? `${layersOn} on` : 'load when switched on', children: <ContextLayersPanel manifest={manifest} bare /> },
    ]} />
  )
}
