// "View from here" on the real Real Vancouver context layers (public/data, OGL-Vancouver and OGL-Canada).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeFootprints, decodeHeights, decodeTerrain, sampleTerrain, type Manifest } from '../lib/cityLayers'
import { castRay, hasHeight, indexFootprints, pickAt, skyline } from './viewFrom'

const DIR = new URL('../../public/data/', import.meta.url)
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const layer = (id: string) => manifest.layers.find((l) => l.id === id)!

const footprints = decodeFootprints(read(layer('footprints').file))
const heights = decodeHeights(read(layer('footprint_heights').file), footprints.length)
const r1 = decodeTerrain(read(layer('terrain_r1').file), layer('terrain_r1').grid!)
const r2 = decodeTerrain(read(layer('terrain_r2').file), layer('terrain_r2').grid!)
const idx = indexFootprints(footprints)
const terrain = (x: number, y: number) => sampleTerrain([r1, r2], x, y)

// Real data (megabytes): a single test takes a second or two alone, longer while the whole suite runs in parallel.
describe('views over the real context data', { timeout: 30_000 }, () => {
  it('can stand on every building with a LiDAR roof, at its own centroid', () => {
    let ok = 0, n = 0
    footprints.forEach((f, i) => {
      if (!hasHeight(heights, i)) return
      n++
      const cx = f.outer.reduce((s, p) => s + p[0], 0) / f.outer.length, cy = f.outer.reduce((s, p) => s + p[1], 0) / f.outer.length
      const p = pickAt(idx, heights, cx, cy)
      if (p.kind === 'roof' && p.index === i) ok++
    })
    // Centroids of L- and U-shaped buildings can fall outside them, so most, not all.
    expect(n).toBeGreaterThan(400)
    expect(ok / n).toBeGreaterThan(0.8)
  })
  it('sees the North Shore over the West End from a tall LiDAR roof, and no mountains to the south', () => {
    let best = -1
    footprints.forEach((_, i) => { if (hasHeight(heights, i) && (best < 0 || heights.roof[i] > heights.roof[best])) best = i })
    const f = footprints[best]
    const x = f.outer.reduce((s, p) => s + p[0], 0) / f.outer.length, y = f.outer.reduce((s, p) => s + p[1], 0) / f.outer.length
    const inp = { eye: [x, y, heights.roof[best] + 1.6] as [number, number, number], terrain, idx, heights, towers: [], farMin: 200 }
    const t0 = performance.now()
    const rays = skyline(inp, 5)
    const ms = performance.now() - t0
    expect(rays).toHaveLength(72)
    const north = castRay(inp, 0)
    expect(north.far?.height ?? 0).toBeGreaterThan(500)
    expect(north.farVisible).toBe(true)
    expect(castRay(inp, 180).far).toBeNull()
    expect(ms).toBeLessThan(4000)
  })
})
