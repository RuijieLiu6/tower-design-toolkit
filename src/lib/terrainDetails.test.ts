import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTerrain, sampleGrid, sampleTerrain, type HeightGrid, type Manifest } from './cityLayers'
import { groundDisplayPatch, loadTerrainDetails, terrainBasis } from './terrainDetails'
import { sampleCityTerrain } from '../engine/solarCity'

const DIR = new URL('../../public/data/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const grid = (id: string) => { const l = manifest.layers.find((l) => l.id === id)!; return decodeTerrain(read(l.file), l.grid!) }
const fine = grid('terrain_ground_490000_5459000'), coarse = grid('terrain_r1')

describe('City LiDAR ground and native mountain detail', () => {
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
    expect(fine.z).toEqual(before)
    expect([...p.z].every(Number.isFinite)).toBe(true)
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
