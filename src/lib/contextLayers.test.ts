import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeFootprints } from './cityLayers'
import { decodeTrees, heightClassLabel, parcelMesh, parcelRow, valueBand, type ParcelAttrs, type Tree } from './contextLayers'

// Packed by tools/build_city_layers.py from synthetic City-style exports (python -I tools/test_city_layers.py --emit ...);
// expected.json was decoded independently in Python.
const DIR = new URL('./fixtures/context-v1/', import.meta.url)
const bin = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const json = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as T
const expected = json<{ trees: Tree[]; parcel_count: number }>('expected.json')

describe('context layers v1 decoders', () => {
  it('decode the trees the Python packer wrote, value for value', () => {
    expect(decodeTrees(bin('trees.bin'))).toEqual(expected.trees)
  })

  it('label a height class, a recorded height and a missing height, never inventing one', () => {
    const names = json<{ names: string[] }>('trees.json').names
    const trees = decodeTrees(bin('trees.bin'))
    const label = (n: string) => trees.filter((t) => names[t.name] === n).map(heightClassLabel)
    expect(label('Katsura')).toEqual(['3.0 m (recorded height)'])
    expect(label('Elm')).toEqual(['height unknown'])
    expect(label('Prunus')).toEqual(['height unknown'])
    expect(label('Red Maple').sort()).toEqual(['City height class 15 ft (about 4.6 m)', 'City height class 25 ft (about 7.6 m)'])
  })

  it('decode parcels and their land values; a parcel without a tax row has no value', () => {
    const polys = decodeFootprints(bin('parcels.bin'))
    const attrs = json<ParcelAttrs>('parcels.json')
    expect(polys.length).toBe(expected.parcel_count)
    expect(attrs.rows.length).toBe(polys.length)
    const rows = attrs.rows.map((_, i) => parcelRow(attrs, i))
    const georgia = rows.find((r) => r.address === '900 W Georgia St')!
    expect([georgia.landK, georgia.improvementK, georgia.folios, georgia.zoning]).toEqual([3000, 1200, 2, 'DD'])
    expect(rows.find((r) => r.address === '1100 Hornby St')!.perM2).toBeNull()
    expect(valueBand(null, attrs.breaks)).toBe(-1)
  })

  it('drape every parcel as triangles that add up to its own area and map back to it (hover readout)', () => {
    const polys = decodeFootprints(bin('parcels.bin'))
    const attrs = json<ParcelAttrs>('parcels.json')
    // A synthetic ring parcel with a hole, to check holes stay open.
    const ring: typeof polys[number] = { id: 99, outer: [[0, 0], [40, 0], [40, 30], [0, 30]], holes: [[[10, 10], [10, 20], [20, 20], [20, 10]]] }
    const all = [...polys, ring]
    const a2 = { ...attrs, rows: [...attrs.rows, ['1', 0, null, null, -1, 0, 1100] as ParcelAttrs['rows'][number]] }
    const m = parcelMesh(all, a2, () => 5)
    const shoelace = (r: [number, number][]) => Math.abs(r.reduce((s, [x, y], k) => { const [nx, ny] = r[(k + 1) % r.length]; return s + x * ny - nx * y }, 0)) / 2
    const area = new Float64Array(all.length)
    for (let t = 0; t < m.index.length / 3; t++) {
      const [a, b, c] = [m.index[t * 3], m.index[t * 3 + 1], m.index[t * 3 + 2]].map((v) => [m.positions[v * 3], m.positions[v * 3 + 1]])
      area[m.triangleParcel[t]] += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
    }
    all.forEach((f, i) => expect(area[i]).toBeCloseTo(shoelace(f.outer) - f.holes.reduce((s, h) => s + shoelace(h), 0), 1))
    expect(area[all.length - 1]).toBeCloseTo(1100, 6)
    expect([...m.band.slice(-8)].every((b) => b === -1)).toBe(true) // no tax row: the no-value colour
    expect(m.positions[2]).toBeCloseTo(5.8, 5) // draped on the ground, 0.8 m above it
  })

  it('put values into five ordered bands', () => {
    const breaks = [10, 20, 30, 40]
    expect([5, 10, 25, 39.9, 40, 1e9].map((v) => valueBand(v, breaks))).toEqual([0, 1, 2, 3, 4, 4])
  })
})
