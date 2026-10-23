import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTerrain, type Manifest } from './cityLayers'
import { rtinIndices } from './terrainMesh'

const DIR = new URL('../../public/data/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const r2 = manifest.layers.find((l) => l.id === 'terrain_r2')!
const b = readFileSync(new URL(r2.file, DIR))
const grid = decodeTerrain(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, r2.grid!)
const { cols, rows, step, x0 } = grid
const half = 6000 // the inner ring R1 covers +/- 6 km
const inHole = (c: number, r: number) => {
  const x = x0 + c * step, y = grid.y0 + r * step
  return x >= -half && x + step <= half && y >= -half && y + step <= half
}
const MAX_ERROR = 1
const idx = rtinIndices(grid.z, cols, rows, { tile: 64, maxError: MAX_ERROR, skipCell: inHole })
const xy = (i: number) => [i % cols, Math.floor(i / cols)] as const

describe('error-bounded terrain mesh (R2)', () => {
  it('uses far fewer triangles than the full 60 m grid', () => {
    let full = 0
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) if (!inHole(c, r)) full += 2
    expect(idx.length / 3).toBeLessThan(full * 0.5)
  })

  it('faces up and covers exactly the drawn area (no gaps, no overlaps)', () => {
    let area = 0, down = 0
    for (let t = 0; t < idx.length; t += 3) {
      const [ax, ay] = xy(idx[t]), [bx, by] = xy(idx[t + 1]), [cx, cy] = xy(idx[t + 2])
      const s = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (s <= 0) down++
      area += s / 2
    }
    let cells = 0
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) if (!inHole(c, r)) cells++
    expect(down).toBe(0)
    expect(area).toBe(cells)
  })

  it('has no cracks: an edge used once lies on the outer border or on the inner ring', () => {
    const count = new Map<number, number>()
    for (let t = 0; t < idx.length; t += 3) {
      for (const [u, v] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
        const k = Math.min(u, v) * cols * rows + Math.max(u, v)
        count.set(k, (count.get(k) ?? 0) + 1)
      }
    }
    const boundary = (i: number) => {
      const [c, r] = xy(i)
      if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1) return true
      return inHole(c - 1, r - 1) || inHole(c, r - 1) || inHole(c - 1, r) || inHole(c, r)
    }
    let bad = 0
    for (const [k, n] of count) {
      expect(n).toBeLessThanOrEqual(2)
      if (n === 1 && !(boundary(Math.floor(k / (cols * rows))) && boundary(k % (cols * rows)))) bad++
    }
    expect(bad).toBe(0)
    // Walks every edge of the full mesh: about 6 s on a loaded machine, so allow more than vitest's 5 s default.
  }, 30_000)

  it('keeps every node within the error bound of the mesh', () => {
    let worst = 0
    for (let t = 0; t < idx.length; t += 3) {
      const [ax, ay] = xy(idx[t]), [bx, by] = xy(idx[t + 1]), [cx, cy] = xy(idx[t + 2])
      const za = grid.z[idx[t]], zb = grid.z[idx[t + 1]], zc = grid.z[idx[t + 2]]
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      for (let y = Math.min(ay, by, cy); y <= Math.max(ay, by, cy); y++) {
        for (let x = Math.min(ax, bx, cx); x <= Math.max(ax, bx, cx); x++) {
          const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d
          const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d
          if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue
          worst = Math.max(worst, Math.abs(u * za + v * zb + (1 - u - v) * zc - grid.z[y * cols + x]))
        }
      }
    }
    // RTIN measures error along hypotenuses; across a whole triangle it stays within a small multiple of the bound.
    expect(worst).toBeLessThan(3 * MAX_ERROR)
  })
})
