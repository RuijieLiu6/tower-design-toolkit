import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTerrain, sampleGrid, sampleTerrain, type HeightGrid, type Manifest } from './cityLayers'
import { groundDisplayPatch, loadTerrainDetails, mosaicGrids, terrainBasis } from './terrainDetails'
import { sampleCityTerrain } from '../engine/solarCity'

const DIR = new URL('../../public/data/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const grid = (id: string) => { const l = manifest.layers.find((l) => l.id === id)!; return decodeTerrain(read(l.file), l.grid!) }
const fine = grid('terrain_ground_490000_5459000'), coarse = grid('terrain_r1')

// Real data (megabytes): a single test takes a second or two alone, longer while the whole suite runs in parallel.
describe('City LiDAR ground and native mountain detail', { timeout: 30_000 }, () => {
  it('retains the source extent, metre spacing and explicit missing coverage', () => {
    expect([fine.x0, fine.y0, fine.cols, fine.rows, fine.step]).toEqual([-1299.5, 400.5, 1000, 1000, 1])
    expect([...fine.z].filter(Number.isFinite).length).toBe(826374)
    expect([...fine.z].filter(Number.isNaN).length).toBe(173626)
    expect(sampleGrid(fine, 336, 156)).toBeNull() // the default study tower is not in the downloaded tile
    expect(sampleTerrain([fine, coarse], 336, 156)).toBe(sampleGrid(coarse, 336, 156))
  })

  it('keeps analysis on measured heights and falls back at missing cells, also in the solar engine', () => {
    const small: HeightGrid = { cols: 2, rows: 2, x0: 0, y0: 0, step: 1, z: new Float32Array([10, 10, 10, 10]), source: 'City LiDAR' }
    const low = { ...small, z: new Float32Array([2, 2, 2, 2]), source: 'MRDEM' }
    expect(sampleCityTerrain([small, low], 0.5, 0.5)).toBe(10)
    small.z[3] = NaN
    expect(sampleCityTerrain([small, low], 0.5, 0.5)).toBe(2)
    expect(sampleTerrain([small], 0.5, 0.5)).toBeNull()
    expect(terrainBasis([small, low], [[0.5, 0.5]])).toBe('MRDEM')
  })

  it('joins every display-patch border to the coarse terrain without mutating source heights', () => {
    const before = fine.z.slice()
    const p = groundDisplayPatch(fine, coarse)
    expect((p.x0 - coarse.x0) % coarse.step).toBe(0)
    expect((p.y0 - coarse.y0) % coarse.step).toBe(0)
    for (let r = 0; r < p.rows; r++) for (const c of [0, p.cols - 1]) {
      expect(p.z[r*p.cols+c]).toBeCloseTo(sampleGrid(coarse, p.x0+c*p.step, p.y0+r*p.step)!, 4)
    }
    for (let c = 0; c < p.cols; c++) for (const r of [0, p.rows - 1]) {
      expect(p.z[r*p.cols+c]).toBeCloseTo(sampleGrid(coarse, p.x0+c*p.step, p.y0+r*p.step)!, 4)
    }
    // Element loops instead of toEqual on a million samples (toEqual alone took ~5 s under a loaded test run).
    expect(fine.z.every((v, i) => Object.is(v, before[i]))).toBe(true)
    expect(p.z.every(Number.isFinite)).toBe(true)
  })

  it('joins adjacent ground tiles into one grid, so they are drawn once with no seam', () => {
    const tile = (x0: number, v: number): HeightGrid => ({ cols: 3, rows: 2, step: 1, x0, y0: 0.5, z: Float32Array.from([v, v, v, v, v, NaN]) })
    const [m, ...rest] = mosaicGrids([tile(0.5, 1), tile(3.5, 2), { ...tile(0.25, 9), step: 0.5 }])
    expect(rest).toHaveLength(1) // a grid that does not align stays on its own
    expect([m.x0, m.cols, m.rows]).toEqual([0.5, 6, 2])
    expect([...m.z.subarray(0, 6)]).toEqual([1, 1, 1, 2, 2, 2])
    expect(Number.isNaN(m.z[8]) && Number.isNaN(m.z[11])).toBe(true) // missing samples stay missing
    expect(sampleGrid(m, 3.5, 0.5)).toBe(2)
    // The real four tiles: one 2 x 2 km grid, one display patch.
    const ground = manifest.layers.filter((l) => l.id.startsWith('terrain_ground_')).map((l) => decodeTerrain(read(l.file), l.grid!))
    const joined = mosaicGrids(ground)
    expect(joined).toHaveLength(1)
    expect([joined[0].cols, joined[0].rows]).toEqual([2000, 2000])
  })

  it('loads useful details even if one optional file fails', async () => {
    const result = await loadTerrainDetails(manifest, async (f) => {
      if (f === 'terrain_r2_detail.bin') throw new Error('offline')
      return read(f)
    })
    expect(result.loaded.some((d) => d.layer.id.startsWith('terrain_ground_'))).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('offline')
  })

  it('restores native 30 m mountain samples with the same extent and vertical datum', () => {
    const d = grid('terrain_r2_detail'), old = grid('terrain_r2')
    expect(d.step).toBe(30)
    expect(d.x0).toBe(old.x0)
    expect(d.y0).toBe(old.y0)
    expect((d.cols-1)*d.step).toBe((old.cols-1)*old.step)
    expect([...d.z].every(Number.isFinite)).toBe(true)
    expect(manifest.layers.find((l) => l.id === 'terrain_r2_detail')?.datum.vertical).toBe(manifest.layers.find((l) => l.id === 'terrain_r2')?.datum.vertical)
  })
})
