import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rectCorners } from '../engine/massing'
import { CONES } from '../engine/viewCones'
import { CITY_ORIGIN } from '../store'
import { decodeFootprints, decodeTerrain, groundUnder, layerBytes, layerFiles, sampleGrid, type Manifest } from './cityLayers'

const DIR = new URL('../../public/data/', import.meta.url)
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const sha256 = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('')
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const layer = (id: string) => manifest.layers.find((l) => l.id === id)!

// Real data (megabytes): a single test takes a second or two alone, longer while the whole suite runs in parallel.
describe('Real Vancouver context layers', { timeout: 30_000 }, () => {
  it('every layer cites source, licence, attribution, retrieval date, datum and a matching checksum', async () => {
    for (const l of manifest.layers) {
      expect(l.source.url, l.id).toMatch(/^https:\/\//)
      expect(l.source.retrieved, l.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Open data only; Vista's OpenStreetMap buildings are ODbL (share-alike, attribution in the app and the docs).
      expect(l.licence.name, l.id).toMatch(/Open Government Licence|Creative Commons Attribution|Open Database License|Ruijie Liu's own work \(Vista\)/)
      expect(l.attribution.length, l.id).toBeGreaterThan(20)
      expect(l.crs.horizontal, l.id).toBe('EPSG:26910')
      expect('vertical' in l.datum, l.id).toBe(true)
      for (const f of layerFiles(l)) expect(await sha256(read(f.file)), `${l.id}: ${f.file}`).toBe(f.sha256)
    }
  })

  it('first-load context data stays inside the 5 MB budget (with about 2.2 MB of app code); other layers load on demand', () => {
    const first = manifest.layers.filter((l) => !l.lazy).reduce((s, l) => s + layerBytes(l), 0)
    expect(first).toBeLessThan(2.6e6)
    for (const l of manifest.layers.filter((k) => k.lazy)) expect(layerBytes(l), l.id).toBeLessThan(12e6) // spec: 1-12 MB per layer
  })

  it('footprints decode to the manifest count at 40 bytes or less per building', () => {
    const l = layer('footprints')
    const fps = decodeFootprints(read(l.file))
    expect(fps.length).toBe(l.count)
    expect(l.bytes / fps.length).toBeLessThanOrEqual(40)
    for (const f of fps) {
      expect(f.outer.length).toBeGreaterThanOrEqual(3)
      for (const [x, y] of f.outer) { expect(Math.abs(x)).toBeLessThan(4000); expect(Math.abs(y)).toBeLessThan(4000) }
    }
  })

  it('terrain R1 sits 1-3 m below the City viewpoint elevation (eye level) at ground-level cone origins', () => {
    const l = layer('terrain_r1')
    const g = decodeTerrain(read(l.file), l.grid!)
    const diffs = CONES
      .filter((c) => !['E', 'G2'].includes(c.id)) // bridge deck and pier
      .map((c) => c.Lv - (sampleGrid(g, c.ring[0][0] - CITY_ORIGIN[0], c.ring[0][1] - CITY_ORIGIN[1]) as number))
      .sort((a, b) => a - b)
    const median = diffs[Math.floor(diffs.length / 2)]
    expect(median).toBeGreaterThan(1)
    expect(median).toBeLessThan(3)
  })

  it('offers the corner-average terrain under the default study tower, with its range, and nothing outside the data', () => {
    const r1 = layer('terrain_r1'), r2 = layer('terrain_r2')
    const grids = [decodeTerrain(read(r1.file), r1.grid!), decodeTerrain(read(r2.file), r2.grid!)]
    // Default City study tower: 30 x 30 m at 491636 E, 5458756 N (src/store.ts).
    const g = groundUnder(grids, rectCorners(491636 - CITY_ORIGIN[0], 5458756 - CITY_ORIGIN[1], 30, 30, 0))!
    expect(g.value).toBeGreaterThan(25)
    expect(g.value).toBeLessThan(40)
    expect(g.min).toBeLessThanOrEqual(g.value)
    expect(g.max).toBeGreaterThanOrEqual(g.value)
    expect(groundUnder(grids, rectCorners(30000, 0, 30, 30, 0))).toBeNull()
  })

  it('terrain sampling returns null outside the grid instead of a made-up height', () => {
    const l = layer('terrain_r1')
    const g = decodeTerrain(read(l.file), l.grid!)
    expect(sampleGrid(g, 7000, 0)).toBeNull()
    expect(sampleGrid(g, 0, 0)).not.toBeNull()
    // The last row and column are inside (the R2 ring stitches to them).
    expect(sampleGrid(g, g.x0 + (g.cols - 1) * g.step, g.y0 + (g.rows - 1) * g.step)).toBeCloseTo(g.z[g.z.length - 1], 3)
  })
})
