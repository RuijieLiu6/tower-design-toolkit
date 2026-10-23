// Decoders for the Real Vancouver context layers v1, packed by tools/build_city_layers.py (layouts documented there).
// Positions are metres in the local frame (EPSG:26910 minus CITY_ORIGIN). Missing values stay null: a tree without a
// height is "height unknown", a parcel without a tax row has no land value.
import { ShapeUtils, Vector2 } from 'three'
import type { Footprint } from './cityLayers'

export type ContextLayerId = 'trees' | 'parcels' | 'zoning' | 'heritage' | 'traffic'
export const CONTEXT_LAYER_IDS: ContextLayerId[] = ['trees', 'parcels', 'zoning', 'heritage', 'traffic']

export interface Tree {
  x: number
  y: number
  /** Height in whole feet (the City's classes are 15, 25, ... 105 ft), or null when the City has none. */
  feet: number | null
  /** True when the value is one of the City's height classes (15-105 ft midpoints); false for a recorded value. */
  isClass: boolean
  /** Index into the layer's common-name list. */
  name: number
}

/** TST1: varint zigzag deltas in decimetres, u8 height code, varint name index. */
export function decodeTrees(buf: ArrayBuffer): Tree[] {
  const bytes = new Uint8Array(buf)
  const magic = String.fromCharCode(...bytes.subarray(0, 4))
  if (magic !== 'TST1') throw new Error(`trees: bad magic ${magic}`)
  const n = new DataView(buf).getUint32(4, true)
  let p = 8
  const varint = () => {
    let v = 0, shift = 0, b: number
    do { b = bytes[p++]; v += (b & 0x7f) * 2 ** shift; shift += 7 } while (b & 0x80)
    return v
  }
  const zz = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2 }
  const out: Tree[] = []
  let x = 0, y = 0
  for (let i = 0; i < n; i++) {
    x += zz(); y += zz()
    const hc = bytes[p++]
    out.push({ x: x / 10, y: y / 10, feet: hc & 0x7f ? hc & 0x7f : null, isClass: (hc & 0x80) !== 0, name: varint() })
  }
  if (p !== bytes.length) throw new Error(`trees: ${bytes.length - p} trailing bytes`)
  return out
}

export const treeHeightM = (t: Tree) => (t.feet === null ? null : t.feet * 0.3048)

/** Readout text: the City's class, a recorded height, or "height unknown". */
export function heightClassLabel(t: Tree): string {
  if (t.feet === null) return 'height unknown'
  const m = (t.feet * 0.3048).toFixed(1)
  return t.isClass ? `City height class ${t.feet} ft (about ${m} m)` : `${m} m (recorded height)`
}

export interface ParcelAttrs {
  streets: string[]
  zoning: string[]
  /** Quintile breaks of land value per m2 (dollars). */
  breaks: number[]
  rows: [string, number, number | null, number | null, number, number, number][]
  year: string | null
}
export interface ParcelRow { address: string; landK: number | null; improvementK: number | null; zoning: string | null; folios: number; m2: number; perM2: number | null }

export function parcelRow(a: ParcelAttrs, i: number): ParcelRow {
  const [civic, street, land, impr, zone, folios, m2] = a.rows[i]
  return {
    address: `${civic} ${a.streets[street] ?? ''}`.trim(), landK: land, improvementK: impr,
    zoning: zone >= 0 ? a.zoning[zone] : null, folios, m2, perM2: land === null || !m2 ? null : (land * 1000) / m2,
  }
}

/** Land value band 0-4 from quintile breaks, or -1 without a value. */
export function valueBand(perM2: number | null, breaks: number[]): number {
  if (perM2 === null) return -1
  let b = 0
  while (b < breaks.length && perM2 >= breaks[b]) b++
  return b
}

/**
 * Draped parcel fill: triangles of every parcel (holes kept), a band per parcel for colouring, and the parcel index of
 * each triangle (for the hover readout). `ground` gives the terrain height at a point.
 */
export function parcelMesh(polys: Footprint[], attrs: ParcelAttrs, ground: (x: number, y: number) => number, lift = 0.8) {
  const pos: number[] = [], band: number[] = [], idx: number[] = [], tri: number[] = [], outline: number[] = []
  polys.forEach((f, i) => {
    const b = valueBand(parcelRow(attrs, i).perM2, attrs.breaks)
    const base = pos.length / 3
    const rings = [f.outer, ...f.holes]
    for (const ring of rings) for (const [x, y] of ring) { pos.push(x, y, ground(x, y) + lift); band.push(b) }
    const faces = ShapeUtils.triangulateShape(f.outer.map(([x, y]) => new Vector2(x, y)), f.holes.map((h) => h.map(([x, y]) => new Vector2(x, y))))
    for (const [a, bb, c] of faces) { idx.push(base + a, base + bb, base + c); tri.push(i) }
    let o = base
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        const a = o + k, n = o + ((k + 1) % ring.length)
        outline.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2] + 0.1, pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2] + 0.1)
      }
      o += ring.length
    }
  })
  return { positions: Float32Array.from(pos), band: Int8Array.from(band), index: Uint32Array.from(idx), triangleParcel: Uint32Array.from(tri), outline: Float32Array.from(outline) }
}

/** Flat decimetre list [x, y, x, y, ...] to local metres. */
export function dmPoints(flat: number[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] / 10, flat[i + 1] / 10])
  return out
}

export interface ZoningData { districts: string[]; polys: [number, number[]][] }
export interface HeritageData { rows: [number, number, string, string, string, string, string[]][] }
export interface TrafficData { intersections: [number, number, string, string][]; segments: [string, number[]][] }

export const DESIGNATION_LABEL: Record<string, string> = {
  municipaldesignationm: 'municipal designation', provincialdesignationp: 'provincial designation', federaldesignationf: 'federal designation',
  heritagerevitalizationagreementh: 'heritage revitalization agreement', interiordesignationi: 'interior designation',
  landscapedesignationl: 'landscape designation', heritageconservationareaca: 'heritage conservation area', heritageconservationcovenanthc: 'heritage covenant',
}
