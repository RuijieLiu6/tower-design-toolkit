// Real Vancouver's default buildings: Vista's unified city model (Ruijie Liu, vancouver-tall-view-tool @ 917b28e), built
// into public/data/vista_buildings.{bin,json} by tools/build_vista_buildings.py. Every building is an OpenStreetMap
// extrusion, (c) OpenStreetMap contributors, ODbL. Heights are Vista's, above each building's own base, and unverified;
// the app seats every building on its own ground (City LiDAR 2022 1 m, else MRDEM; CGVD28) and never uses Vista's Z.
import { BUILDING_USES, USE_BASES, partUse } from './buildingUse'
import { is2009Part } from './cityGeometry'
import { decodeFootprints, sampleTerrain, type Footprint, type FootprintHeights, type HeightGrid, type Manifest } from './cityLayers'

export const VISTA_LAYER = 'vista_buildings'
/** Vista's height sources (unified_*_index.json height_source codes 0, 1, 2). */
export const VISTA_SOURCES = ['OSM height tag', 'OSM floor count', 'estimate per building type'] as const
export const VISTA_ATTRIBUTION = 'Buildings © OpenStreetMap contributors (ODbL), via Vista'

export interface VistaBuildings {
  /** The OSM way, one per footprint part ("w" + OSM way number; a multipart building repeats it). */
  osmId: string[]
  /** Vista's own building key, `${asset}:${osmId}` ("buildings:w27926613"), as in building-view-heights.js and imagine_city.json. */
  vistaId: string[]
  /** 0 = Vista's central model (studio Rhino export of 2022 OSM), 1 = its OSM extension (current OSM). */
  asset: Uint8Array
  heightM: Float32Array
  /** Index into VISTA_SOURCES. */
  heightSource: Uint8Array
  osmType: string[]
  /** Elevated parts (bridges, overhangs): height of the underside above the ground. */
  clearance: Float32Array
  /** Building type (index into lib/buildingUse BUILDING_USES) and where it comes from (UseBasis order), when the layer has them. */
  use: Uint8Array | null
  useBasis: Uint8Array | null
  /** Measured heights of the City building each part matches (intersection over union >= 0.6), NaN where none. */
  lidar2022: Float32Array
  lidar2022Max: Float32Array
  city2009: Float32Array
}

interface AttrsFile {
  version: number; origin: number[]; count: number; binSha256: string; assets: string[]; heightSources: string[]; types: string[]; uses?: string[]; useBases?: string[]
  columns: Record<'asset' | 'heightM' | 'heightSource' | 'type' | 'clearanceM' | 'lidar2022P90Dm' | 'lidar2022MaxDm' | 'city2009Dm', number[]> & { use?: number[]; useBasis?: number[] }
}

/** Decodes and checks the layer; null when the manifest has no Vista buildings. */
export async function loadVistaBuildings(manifest: Manifest, read: (file: string) => Promise<ArrayBuffer>): Promise<{ footprints: Footprint[]; vista: VistaBuildings } | null> {
  const layer = manifest.layers.find((l) => l.id === VISTA_LAYER)
  const attrsFile = layer?.files?.[1]?.file
  if (!layer || !attrsFile) return null
  const [bin, json] = await Promise.all([read(layer.file), read(attrsFile)])
  const a = JSON.parse(new TextDecoder().decode(json)) as AttrsFile
  const footprints = decodeFootprints(bin)
  const n = footprints.length, c = a.columns
  if (a.version !== 1 || a.origin?.[0] !== 491300 || a.origin?.[1] !== 5458600) throw new Error('Vista buildings: unsupported frame')
  if (n !== a.count || n !== layer.count || Object.values(c).some((col) => col.length !== n)) throw new Error('Vista buildings: attributes do not match the footprints')
  if (!c.heightM.every((h) => h > 0 && Number.isFinite(h)) || !c.heightSource.every((s) => s >= 0 && s < VISTA_SOURCES.length)) throw new Error('Vista buildings: invalid heights')
  const dm = (col: number[]) => Float32Array.from(col, (v) => (v < 0 ? NaN : v / 10))
  // Building types by name (the layer's order need not be the app's); sources in USE_BASES order (none, building tag, POI inside).
  const useIndex = c.use && c.useBasis && a.uses ? a.uses.map((u) => BUILDING_USES.findIndex((b) => b.id === u)) : null
  if (useIndex && (useIndex.some((k) => k < 0) || a.useBases?.length !== USE_BASES.length || !c.use!.every((k) => k < useIndex.length) || !c.useBasis!.every((b) => b < USE_BASES.length)))
    throw new Error('Vista buildings: unknown building types')
  return {
    footprints,
    vista: {
      osmId: footprints.map((f) => `w${f.id}`), vistaId: footprints.map((f, i) => `${a.assets[c.asset[i]]}:w${f.id}`), asset: Uint8Array.from(c.asset), heightM: Float32Array.from(c.heightM),
      heightSource: Uint8Array.from(c.heightSource), osmType: c.type.map((t) => a.types[t]), clearance: Float32Array.from(c.clearanceM),
      use: useIndex ? Uint8Array.from(c.use!, (k) => useIndex[k]) : null, useBasis: useIndex ? Uint8Array.from(c.useBasis!) : null,
      lidar2022: dm(c.lidar2022P90Dm), lidar2022Max: dm(c.lidar2022MaxDm), city2009: dm(c.city2009Dm),
    },
  }
}

/**
 * How a building's height is chosen: Vista's own height, or a measured one first where the building matches one
 * (LiDAR 2022, then City 2009), with Vista's height only where neither does.
 */
export type HeightMode = 'vista' | 'measured-first'
/** Ruijie's choice (3 Nov): Vista's model with each building at its best height, measured first. */
export const HEIGHT_MODE: HeightMode = 'measured-first'

export type HeightBasis = 'lidar2022' | 'city2009' | 'osm-tag' | 'osm-levels' | 'type-estimate'
const VISTA_BASIS: HeightBasis[] = ['osm-tag', 'osm-levels', 'type-estimate']

export function chooseHeight(v: VistaBuildings, i: number, mode: HeightMode = HEIGHT_MODE): { height: number; max: number; basis: HeightBasis } {
  if (mode === 'measured-first' && v.clearance[i] === 0) {
    if (v.lidar2022[i] > 0) return { height: v.lidar2022[i], max: Math.max(v.lidar2022[i], v.lidar2022Max[i] || 0), basis: 'lidar2022' }
    if (v.city2009[i] > 0) return { height: v.city2009[i], max: v.city2009[i], basis: 'city2009' }
  }
  return { height: v.heightM[i], max: v.heightM[i], basis: VISTA_BASIS[v.heightSource[i]] }
}

/**
 * Seats every part on the Toolkit's ground at its footprint's bounding-box centre (as Vista seats its own): ground =
 * terrain + clearance (the solid's underside), roof = terrain + height. Parts with no terrain under them stay unknown.
 */
export function seatVista(footprints: Footprint[], v: VistaBuildings, grids: HeightGrid[], mode: HeightMode = HEIGHT_MODE): FootprintHeights {
  const n = footprints.length
  const ground = new Float32Array(n).fill(NaN), roof = new Float32Array(n).fill(NaN), max = new Float32Array(n).fill(NaN)
  footprints.forEach((f, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of f.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    const g = sampleTerrain(grids, (x0 + x1) / 2, (y0 + y1) / 2)
    if (g === null) return
    const h = chooseHeight(v, i, mode)
    ground[i] = g + v.clearance[i]; roof[i] = g + h.height; max[i] = g + h.max
  })
  return { ground, roof, max, points: new Uint16Array(n) }
}

/** Vista's parts by OSM id (a multipart building has several). */
export function partsByOsmId(v: VistaBuildings): Map<string, number[]> {
  return groupBy(v.osmId)
}

/** Vista's parts by Vista's own key (`${asset}:${osmId}`). */
export function partsByVistaId(v: VistaBuildings): Map<string, number[]> {
  return groupBy(v.vistaId)
}

function groupBy(keys: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  keys.forEach((id, i) => { const list = m.get(id); if (list) list.push(i); else m.set(id, [i]) })
  return m
}

const BASIS_TEXT: Record<HeightBasis, string> = {
  lidar2022: 'City LiDAR 2022 roofs over the OSM footprint (measured)', city2009: 'City 2009 heights over the OSM footprint (older survey, measured)',
  'osm-tag': 'OSM height tag (unverified)', 'osm-levels': 'OSM floor count × 3.2 m (unverified)', 'type-estimate': 'estimate by building type (unverified)',
}

/** What a viewer of a city building part needs to know: which model and which height. */
export interface BuildingModel { model: 'vista' | 'city'; footprints: Footprint[]; vista: VistaBuildings | null }

/** Short name of a building part for viewpoint labels. */
export function buildingLabel(d: BuildingModel, i: number): string {
  const id = d.footprints[i].id
  if (d.model === 'vista' && d.vista) return `OSM building ${d.vista.osmId[i]} (${buildingType(d.vista, i)})`
  return is2009Part(id) ? `2009 height part ${-id - 1_000_000}` : id < 0 ? `LiDAR roof part ${-id}` : `Roof of building #${id}`
}

/** A part's type and where it comes from, for captions: "office, OSM tag", "hotel, OSM point of interest inside", "type unknown". */
export function buildingType(v: VistaBuildings, i: number): string {
  const u = partUse(v, i)
  if (u.basis === 'none') return 'type unknown'
  return `${BUILDING_USES.find((b) => b.id === u.use)!.label.toLowerCase()}, ${u.basis === 'osm-poi' ? 'OSM point of interest inside' : 'OSM tag'}`
}

/** Where a building part's height comes from, for captions. */
export function buildingSource(d: BuildingModel, i: number): string {
  if (d.model === 'vista' && d.vista) return `Vista model, ${BASIS_TEXT[chooseHeight(d.vista, i).basis]}`
  return is2009Part(d.footprints[i].id) ? 'City 2009 heights (older survey)' : 'LiDAR 2022'
}

/** Whether a part's height is an estimate (drawn a shade off, like the older survey in the City model). */
export function isEstimate(d: BuildingModel, i: number): boolean {
  if (d.model === 'vista' && d.vista) return chooseHeight(d.vista, i).basis === 'type-estimate'
  return is2009Part(d.footprints[i].id)
}

/** Which heights a viewer can stand on or be blocked by, in a few words. */
export function standableNote(d: BuildingModel): string {
  return d.model === 'vista' ? "best source first: City LiDAR 2022 or 2009 where measured, else Vista's OpenStreetMap tags, floor counts or type estimates, unverified" : "measured: LiDAR 2022 in the core, the City's 2009 heights around it"
}

/** The buildings a sightline is cast over, for a result's source line. */
export function rayBuildingsLabel(d: BuildingModel): string {
  return d.model === 'vista' ? "Vista's OpenStreetMap buildings on the City ground, each at its best height (City LiDAR 2022 or 2009 where measured, else OpenStreetMap, unverified)" : 'measured roofs (LiDAR 2022 P90 in the core, City 2009 heights around it)'
}

/** One line on what the buildings are, for captions and reports. */
export function buildingsNote(d: BuildingModel): string {
  if (d.model === 'vista') return `Buildings: Vista's unified model (${VISTA_ATTRIBUTION.replace('Buildings ', '')}) on the City ground; heights from City LiDAR 2022 or 2009 where measured, else OpenStreetMap (unverified).`
  return 'Buildings: LiDAR 2022 roof parts in the core, City 2009 heights around it (older survey); buildings without a height do not block (placeholders are display only).'
}
