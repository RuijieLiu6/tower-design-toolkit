// Real Vancouver context layers, built offline by tools/build_city_*.py into public/data/ and listed in layers.json.
// Positions are metres in the local frame: EPSG:26910 minus CITY_ORIGIN. Heights are CGVD28 metres.
// Nothing here invents a height: a building without a LiDAR value stays NaN ("height unknown").

export interface LayerEntry {
  id: string
  title: string
  file: string
  format: string
  bytes: number
  sha256: string
  count?: number
  grid?: TerrainGridMeta
  source: { name: string; publisher: string; url: string; retrieved: string; note?: string; request?: string | string[] }
  licence: { name: string; url: string }
  attribution: string
  crs: { horizontal: string; note?: string }
  datum: { vertical: string | null; note?: string; unverified?: string[]; [k: string]: unknown }
  processing?: Record<string, unknown>
  false_assumptions?: { claim: string; correction: string }[]
  flag: string
  /** Deferred until after the base scene or until switched on; not part of the first load. */
  lazy?: boolean
  /** Every file of the layer (the first is also `file`). */
  files?: { file: string; bytes: number; sha256: string }[]
}

/** All files of a layer with their sizes and checksums. */
export const layerFiles = (l: LayerEntry) => l.files ?? [{ file: l.file, bytes: l.bytes, sha256: l.sha256 }]
export const layerBytes = (l: LayerEntry) => layerFiles(l).reduce((s, f) => s + f.bytes, 0)
export interface Manifest { version: number; layers: LayerEntry[] }

export interface TerrainGridMeta { cols: number; rows: number; step_m: number; x0: number; y0: number; offset_m: number; scale_m: number; nodata: number }

export interface Footprint { id: number; outer: [number, number][]; holes: [number, number][][] }

/** TSF1: varint zigzag deltas in decimetres (layout in tools/build_city_footprints.py). */
export function decodeFootprints(buf: ArrayBuffer): Footprint[] {
  const dv = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const magic = String.fromCharCode(...bytes.subarray(0, 4))
  if (magic !== 'TSF1') throw new Error(`footprints: bad magic ${magic}`)
  const count = dv.getUint32(4, true)
  const q = dv.getFloat32(16, true)
  let p = 24
  const varint = () => {
    let v = 0, shift = 0, b: number
    do { b = bytes[p++]; v += (b & 0x7f) * 2 ** shift; shift += 7 } while (b & 0x80)
    return v
  }
  const zz = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2 }
  const out: Footprint[] = []
  let id = 0, fx = 0, fy = 0
  for (let i = 0; i < count; i++) {
    id += zz()
    const head = varint()
    const sizes = [Math.floor(head / 2)]
    if (head % 2) { const nh = varint(); for (let h = 0; h < nh; h++) sizes.push(varint()) }
    const rings: [number, number][][] = []
    let x = fx, y = fy
    sizes.forEach((n, r) => {
      const ring: [number, number][] = []
      for (let k = 0; k < n; k++) {
        x += zz(); y += zz()
        if (r === 0 && k === 0) { fx = x; fy = y }
        ring.push([Math.round(x * q * 1000) / 1000, Math.round(y * q * 1000) / 1000])
      }
      rings.push(ring)
    })
    out.push({ id, outer: rings[0], holes: rings.slice(1) })
  }
  if (p !== bytes.length) throw new Error(`footprints: ${bytes.length - p} trailing bytes`)
  return out
}

export interface HeightGrid { cols: number; rows: number; step: number; x0: number; y0: number; z: Float32Array; source?: string }

/** uint16 grid, rows south -> north; NaN where no data. */
export function decodeTerrain(buf: ArrayBuffer, g: TerrainGridMeta): HeightGrid {
  const q = new Uint16Array(buf)
  if (q.length !== g.cols * g.rows) throw new Error(`terrain: ${q.length} nodes, expected ${g.cols * g.rows}`)
  const z = new Float32Array(q.length)
  for (let i = 0; i < q.length; i++) z[i] = q[i] === g.nodata ? NaN : g.offset_m + q[i] * g.scale_m
  return { cols: g.cols, rows: g.rows, step: g.step_m, x0: g.x0, y0: g.y0, z }
}

/** Bilinear height at a local point, or null outside the grid or next to a no-data node. */
export function sampleGrid(g: HeightGrid, x: number, y: number): number | null {
  const fc = (x - g.x0) / g.step, fr = (y - g.y0) / g.step
  if (!(fc >= 0 && fr >= 0 && fc <= g.cols - 1 && fr <= g.rows - 1)) return null
  const c = Math.min(Math.floor(fc), g.cols - 2), r = Math.min(Math.floor(fr), g.rows - 2)
  const u = fc - c, v = fr - r, i = r * g.cols + c
  const v00 = g.z[i], v10 = g.z[i + 1], v01 = g.z[i + g.cols], v11 = g.z[i + g.cols + 1]
  const h = v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v
  return Number.isNaN(h) ? null : h
}

/** First grid (finest first) that covers the point. */
export const sampleTerrain = (grids: HeightGrid[], x: number, y: number) => {
  for (const g of grids) { const h = sampleGrid(g, x, y); if (h !== null) return h }
  return null
}

/**
 * Terrain under a footprint (local corners): the average of the corner heights is the value offered as the tower
 * base; min and max cover the corners and the centre. Null when any sample has no terrain.
 */
export function groundUnder(grids: HeightGrid[], corners: [number, number][]): { value: number; min: number; max: number } | null {
  const cx = corners.reduce((s, p) => s + p[0], 0) / corners.length, cy = corners.reduce((s, p) => s + p[1], 0) / corners.length
  const at = [...corners, [cx, cy] as [number, number]].map(([x, y]) => sampleTerrain(grids, x, y))
  if (at.some((h) => h === null)) return null
  const hs = at as number[]
  return { value: hs.slice(0, corners.length).reduce((s, h) => s + h, 0) / corners.length, min: Math.min(...hs), max: Math.max(...hs) }
}

export interface FootprintHeights { ground: Float32Array; roof: Float32Array; max: Float32Array; points: Uint16Array }

/** TSH1: per footprint (same order) int16 ground, roof P90, roof max in decimetres (-32768 = unknown), uint16 points. */
export function decodeHeights(buf: ArrayBuffer, count: number): FootprintHeights {
  const dv = new DataView(buf)
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4))
  if (magic !== 'TSH1') throw new Error(`heights: bad magic ${magic}`)
  const n = dv.getUint32(4, true)
  if (n !== count) throw new Error(`heights: ${n} rows for ${count} footprints`)
  const h: FootprintHeights = { ground: new Float32Array(n), roof: new Float32Array(n), max: new Float32Array(n), points: new Uint16Array(n) }
  const dm = (o: number) => { const v = dv.getInt16(o, true); return v === -32768 ? NaN : v / 10 }
  for (let i = 0; i < n; i++) {
    const o = 8 + i * 8
    h.ground[i] = dm(o); h.roof[i] = dm(o + 2); h.max[i] = dm(o + 4); h.points[i] = dv.getUint16(o + 6, true)
  }
  return h
}
