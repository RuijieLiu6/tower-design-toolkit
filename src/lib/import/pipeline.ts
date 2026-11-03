// Import pipeline (research P14-M02 -> M03 -> M05 -> M04): pick objects, fix units and axes, rotate to true north,
// place, set the zero level, check health, then slice storeys. Split into stages so the dialog recomputes only
// what a change affects.

import { bounds, detectPodiumTop, mergeMeshes, transformMesh, type Bounds, type MeshData } from '../../engine/importGeom'
import { carryTags, hullOf, meshVolume, sliceStoreys, tagByBands, MIN_FLOOR_AREA } from '../../engine/imported'
import { plateAreas, sliceSegments } from '../../engine/importGeom'
import { healthReport, topology, UNIT_SCALE, type HealthItem, type Topology, type Unit } from '../../engine/meshHealth'
import type { Band, ImportedMass, ImportedStorey, UseId } from '../../engine/types'
import { toUtm10 } from '../../engine/relaxAviation'
import type { RawImport } from './types'

export type Placement = 'keep' | 'centre' | 'utm' | 'custom' | 'anchor' | 'earth'

/**
 * Aligning an uploaded model to the map (Rhino item 11, after Vista's georeference.js, Ruijie Liu): a point of the model
 * (file plan, scaled to metres) lands on a point of the project (project frame), turned by `turn` degrees
 * counter-clockwise on top of the north rotation. 'earth' uses the file's Earth anchor for the model point.
 */
export interface AnchorOptions { model: [number, number]; city: [number, number]; turn: number }
export type DatumMode = 'zero' | 'lowest' | 'geodetic' | 'custom'
export type NorthMode = 'base' | 'true' | 'street' | 'magnetic' | 'file' | 'custom' | 'unresolved'

export interface ImportOptions {
  /** Layers left out. */
  excluded: string[]
  unit: Unit
  unitConfirmed: boolean
  upAxis: 'z' | 'y'
  placement: Placement
  offset: [number, number]
  datum: DatumMode
  dz: number
  north: NorthMode
  /** Used when north is 'custom'. */
  northDeg: number
  f2f: number
  /** null = detect from the model. */
  podiumTop: number | null
  podiumF2F: number
  /** Used when placement is 'anchor' (and the turn when it is 'earth'). */
  anchor?: AnchorOptions
}

export interface ProjectFrame {
  project: 'vtc' | 'city'
  /** True north, degrees clockwise from the project's +Y. */
  northDeg: number
  /** Where "Centre on site" puts the mass. */
  siteCentre: [number, number]
  /** Project ground elevation (m, geodetic), for files modelled at real elevations. */
  groundElevation: number
  /** Local origin of the project in UTM 10N, when it has one. */
  utmOrigin: [number, number] | null
}

/** Downtown street grid: +Y along the north-west streets puts true north 45.3° clockwise (derived from City parcels). */
export const STREET_GRID_NORTH = 45.3
/** Magnetic declination at the site, October 2026: about 15.4° east (research P14-M03, own WMM2025 evaluation, not checked against NOAA). */
export const MAGNETIC_DECLINATION = 15.4

export const NORTH_LABEL: Record<NorthMode, string> = {
  base: 'Same frame as this project\'s base model',
  true: 'File +Y points to true north',
  street: 'File +Y runs along the downtown street grid (north-west)',
  magnetic: 'File +Y points to magnetic north (a compass arrow)',
  file: 'Use the north saved in the file',
  custom: 'Enter the angle',
  unresolved: 'Not sure yet: keep it unresolved',
}

export const DATUM_LABEL: Record<DatumMode, string> = {
  zero: 'File z = 0 is the entrance floor',
  lowest: 'The lowest point of the model is the entrance floor',
  geodetic: 'File heights are elevations above sea level (geodetic)',
  custom: 'Subtract a set height',
}

/** Stage A: selected objects as one mesh, in metres, z up, still in the file's plan frame. */
export function stageA(raw: RawImport, o: Pick<ImportOptions, 'excluded' | 'unit' | 'upAxis'> & { scaleOverride?: number }) {
  const picked = raw.objects.filter((x) => !o.excluded.includes(x.layer))
  const merged = mergeMeshes(picked.map((x) => x.mesh))
  const scale = o.scaleOverride ?? UNIT_SCALE[o.unit]
  const mesh = transformMesh(merged, { yUp: o.upAxis === 'y', scale })
  return { mesh, bounds: bounds(mesh), objects: picked.length, triangles: merged.indices.length / 3, sources: [...new Set(picked.map((x) => x.meshSource))] }
}

/** File north for the chosen mode, or null when unresolved. */
export function fileNorth(raw: RawImport, o: Pick<ImportOptions, 'north' | 'northDeg'>, frame: ProjectFrame): number | null {
  switch (o.north) {
    case 'base': return frame.northDeg
    case 'true': return 0
    case 'street': return STREET_GRID_NORTH
    // Magnetic north lies east of true north, so true north is that many degrees counter-clockwise of +Y.
    case 'magnetic': return -MAGNETIC_DECLINATION
    case 'file': return raw.fileNorthDeg
    case 'custom': return o.northDeg
    default: return null
  }
}

export interface Placed {
  /** Mesh in the tower frame: plan centre at (0, 0), z = 0 at the entrance floor, not yet rotated. */
  local: MeshData
  /** Tower centre in the project frame and rotation (deg counter-clockwise) that turns file north to project north. */
  x: number
  y: number
  rotation: number
  datumShift: number
  /** Distance from the project origin before re-centring (m), for the health check. */
  originDistance: number
  rawCentre: [number, number]
  fileNorthDeg: number | null
}

/** Stage B: north, placement and zero level. */
export function stageB(raw: RawImport, a: { mesh: MeshData; bounds: Bounds }, o: ImportOptions, frame: ProjectFrame): Placed {
  const b = a.bounds
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2
  const fn = fileNorth(raw, o, frame)
  // Rotate counter-clockwise by (file north - project north) so the file's north lands on the project's; an anchor
  // placement adds its own turn.
  const turn = o.placement === 'anchor' || o.placement === 'earth' ? o.anchor?.turn ?? 0 : 0
  const rotation = normDeg((fn == null ? 0 : fn - frame.northDeg) + turn)
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const rc: [number, number] = [cx * c - cy * s, cx * s + cy * c]
  let x = rc[0], y = rc[1]
  const onto = (model: [number, number], city: [number, number]): [number, number] => [city[0] + (cx - model[0]) * c - (cy - model[1]) * s, city[1] + (cx - model[0]) * s + (cy - model[1]) * c]
  const ea = earthPoint(raw, o, frame)
  if (o.placement === 'anchor' && o.anchor) [x, y] = onto(o.anchor.model, o.anchor.city)
  else if (o.placement === 'earth' && ea) [x, y] = onto(ea.model, ea.city)
  else if (o.placement === 'centre') [x, y] = frame.siteCentre
  else if (o.placement === 'utm' && frame.utmOrigin) { x = rc[0] - frame.utmOrigin[0]; y = rc[1] - frame.utmOrigin[1] }
  else if (o.placement === 'custom') { x = rc[0] + o.offset[0]; y = rc[1] + o.offset[1] }
  const datumShift = o.datum === 'lowest' ? b.min[2] : o.datum === 'geodetic' ? frame.groundElevation : o.datum === 'custom' ? o.dz : 0
  const local = transformMesh(a.mesh, { translate: [-cx, -cy, -datumShift] })
  return { local, x, y, rotation, datumShift, originDistance: Math.hypot(x, y), rawCentre: [cx, cy], fileNorthDeg: fn }
}

export interface Sliced {
  storeys: ImportedStorey[]
  podiumTop: number
  top: number
  volume: number | null
  overlapArea: number
}

/** Stage C: storeys at the chosen floor-to-floor, tagged by the tower's program bands. */
export function stageC(local: MeshData, topo: Topology, o: Pick<ImportOptions, 'f2f' | 'podiumTop' | 'podiumF2F'>, tags: { bands: Band[]; podiumUse: UseId; previous?: ImportedStorey[] }): Sliced {
  const top = Math.max(0, bounds(local).max[2])
  const podiumTop = o.podiumTop ?? detectPodiumTop(local, top)
  let storeys = sliceStoreys(local, { f2f: o.f2f, podiumTop, podiumF2F: o.podiumF2F, top })
  storeys = tags.previous?.length ? carryTags(storeys, tags.previous) : tagByBands(storeys, tags.bands, tags.podiumUse)
  // Overlap: where the plain sum of plates is larger than the union, separate solids overlap.
  let overlapArea = 0
  for (const s of storeys) {
    const { signed, area } = plateAreas(sliceSegments(local, (s.z0 + s.z1) / 2))
    if (signed > area + 1) overlapArea += signed - area
  }
  // Volume of the sliced range only (entrance floor to the top storey): the crown and any below-grade part are
  // taken off by integrating plates at 0.25 m, so the plate-sum check compares like with like.
  // Separate solids that overlap or touch double-count the divergence volume, so then integrate the plate union.
  const closed = topo.openEdges === 0
  const simple = closed && topo.nonManifoldEdges === 0 && overlapArea <= 1
  const b = bounds(local), lastTop = storeys.length ? storeys[storeys.length - 1].z1 : 0
  const total = meshVolume(local, simple)
  const volume = total != null ? total - integrate(local, lastTop, b.max[2]) - integrate(local, b.min[2], 0) : closed ? integrate(local, 0, lastTop) : null
  return { storeys, podiumTop, top, volume, overlapArea }
}

/**
 * The file's Earth anchor as a placement: its base point (file plan, scaled to metres) and where its latitude and
 * longitude fall in the project frame (EPSG:26910 by the Krüger series, minus the project origin). Real Vancouver only;
 * null when the file has no location or the project has no map frame.
 */
export function earthPoint(raw: RawImport & { unitScaleOverride?: number }, o: Pick<ImportOptions, 'unit' | 'upAxis'>, frame: ProjectFrame): { model: [number, number]; city: [number, number]; utm: [number, number] } | null {
  const ea = raw.earthAnchor
  if (!ea || !frame.utmOrigin) return null
  const s = raw.unitScaleOverride ?? UNIT_SCALE[o.unit]
  const [bx, by, bz] = ea.basePoint
  const model: [number, number] = o.upAxis === 'y' ? [bx * s, -bz * s] : [bx * s, by * s]
  const utm = toUtm10(ea.lat, ea.lon)
  return { model, city: [utm[0] - frame.utmOrigin[0], utm[1] - frame.utmOrigin[1]], utm }
}

export function healthFor(placed: Placed, topo: Topology, sliced: Sliced | null, frame: ProjectFrame, unit: string): HealthItem[] {
  return healthReport({ mesh: placed.local, topo, originDistance: placed.originDistance, rawCentre: placed.rawCentre, project: frame.project, unit, overlapArea: sliced?.overlapArea })
}

export function buildMass(raw: RawImport, o: ImportOptions, placed: Placed, sliced: Sliced, health: HealthItem[], meshId: string): ImportedMass {
  const northSource = o.north === 'unresolved' || placed.fileNorthDeg == null
    ? 'Unresolved: the file does not say and no choice was made'
    : `${NORTH_LABEL[o.north]} (${placed.fileNorthDeg}° clockwise from file +Y)`
  return {
    meshId, fileName: raw.fileName, format: raw.format, unit: o.unit,
    unitSource: raw.unit && raw.unit === o.unit ? 'file' : o.unitConfirmed ? 'confirmed' : 'chosen',
    fileNorthDeg: o.north === 'unresolved' ? null : placed.fileNorthDeg,
    northSource,
    datumShift: Math.round(placed.datumShift * 1000) / 1000,
    datumSource: `${DATUM_LABEL[o.datum]}${placed.datumShift ? ` (${placed.datumShift.toFixed(2)} m subtracted)` : ''}`,
    f2f: o.f2f, podiumTop: sliced.podiumTop, podiumF2F: o.podiumF2F,
    storeys: sliced.storeys,
    hull: hullOf(placed.local),
    volume: sliced.volume == null ? null : Math.round(sliced.volume),
    top: Math.round(sliced.top * 100) / 100,
    health: { block: health.filter((h) => h.severity === 'block').length, warn: health.filter((h) => h.severity === 'warn').length },
  }
}

export { topology, MIN_FLOOR_AREA }

function integrate(m: MeshData, z0: number, z1: number): number {
  if (z1 - z0 < 1e-6) return 0
  const n = Math.max(1, Math.ceil((z1 - z0) / 0.25)), h = (z1 - z0) / n
  let v = 0
  for (let i = 0; i < n; i++) v += plateAreas(sliceSegments(m, z0 + (i + 0.5) * h)).area * h
  return v
}

const normDeg = (d: number) => { let v = ((d % 360) + 360) % 360; if (v > 180) v -= 360; return Math.round(v * 1000) / 1000 }
