import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyBuildingForms, is2009Part, loadCityGeometry, solidRings, type BuildingForms } from './cityGeometry'
import { decodeFootprints, decodeHeights, type Footprint, type Manifest } from './cityLayers'
import { indexFootprints, pickAt } from '../engine/viewFrom'
import { footprintMask, gridOver, ringArea, shadowMask } from '../engine/shadow'

const dir = new URL('../../public/data/', import.meta.url)
const read = async (f: string) => { const b = readFileSync(new URL(f, dir)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const manifest = JSON.parse(readFileSync(new URL('layers.json', dir), 'utf8')) as Manifest
const base: Footprint = { id: 10, outer: [[0,0],[10,0],[10,10],[0,10]], holes: [] }
const tower: Footprint = { id: -2, outer: [[3,3],[7,3],[7,7],[3,7]], holes: [] }
const data: BuildingForms = { version: 1, origin: [491300,5458600], baseCount: 1, baseSha256: 'fixture', tile: 'fixture', replace: [0], forms: [
  { ...base, id: -1, holes: [tower.outer], ground: 0, roof: 6, max: 7, points: 100 },
  { ...tower, ground: 0, roof: 60, max: 61, points: 100000 },
] }

describe('measured City building forms and streets', () => {
  it('picks podium and tower at their separate roof levels and removes the old whole-footprint extrusion', () => {
    const merged = applyBuildingForms([base], null, data)
    expect(merged.footprints).toHaveLength(2)
    const idx = indexFootprints(merged.footprints)
    expect(pickAt(idx, merged.heights, 1, 1)).toMatchObject({ kind: 'roof', roof: 6 })
    expect(pickAt(idx, merged.heights, 5, 5)).toMatchObject({ kind: 'roof', roof: 60 })
    expect(merged.heights!.points[1]).toBe(65535)
  })
  it('repairs a self-touching historical outline without losing its original height association', () => {
    const repaired = { ...data, replace: [], forms: [], repairs: [{ index: 0, parts: [tower, { ...tower, outer: tower.outer.map(([x,y]) => [x+10,y] as [number,number]) }] }] }
    const h = { ground: new Float32Array([2]), roof: new Float32Array([12]), max: new Float32Array([13]), points: new Uint16Array([99]) }
    const merged = applyBuildingForms([base], h, repaired)
    expect(merged.footprints).toHaveLength(2)
    expect([...merged.heights!.roof]).toEqual([12,12])
  })
  it('retains a courtyard in both the ground mask and overhead-sun shadow', () => {
    const courtyard = { ...base, holes: [tower.outer] }
    const rings = solidRings(courtyard)
    expect(rings.reduce((s, r) => s + ringArea(r), 0)).toBeCloseTo(84)
    const occ = { prisms: rings.map((ring) => ({ ring, z0: 0, z1: 6 })), tris: [] }
    const grid = gridOver(0, 0, 10, 10, 1)
    expect(footprintMask(occ, grid)[55]).toBe(0)
    expect(shadowMask(occ, grid, [0,0,1])[55]).toBe(0)
    expect(shadowMask(occ, grid, [0,0,1])[11]).toBe(1)
  })
  it('loads real geometry in the same frame, with valid replacement indices and separate levels', async () => {
    const geo = await loadCityGeometry(manifest, read)
    expect(geo.errors).toEqual([])
    expect(geo.forms!.forms.length).toBeGreaterThan(500)
    expect(geo.streets!.lines.length).toBeGreaterThan(2000)
    const fp = decodeFootprints(await read('footprints_downtown.bin'))
    const heights = decodeHeights(await read('footprint_heights.bin'), fp.length)
    const merged = applyBuildingForms(fp, heights, geo.forms)
    const replaced = new Set(geo.forms!.replace)
    expect(merged.footprints.length).toBe(fp.length - replaced.size + geo.forms!.forms.length + (geo.forms!.repairs ?? []).filter((r) => !replaced.has(r.index)).reduce((sum, r) => sum + r.parts.length - 1, 0) + (geo.forms!.outlines?.length ?? 0))
    expect(merged.heights!.roof.length).toBe(merged.footprints.length)
    // Every 2022 roof part lies inside the processed LiDAR mosaic (four 1 km tiles since 27 Oct: E 490000-492000, N 5458000-5460000);
    // the City's 2009 heights fill the ring around it, never a footprint the 2022 forms replaced.
    const [x0, y0, x1, y1] = [-1300, -600, 700, 1400]
    const lidar = geo.forms!.forms.filter((f) => !is2009Part(f.id)), older = geo.forms!.forms.filter((f) => is2009Part(f.id))
    expect(lidar.length).toBeGreaterThan(5000)
    expect(older.length).toBeGreaterThan(3000)
    for (const f of lidar) for (const [x,y] of f.outer) {
      expect(x).toBeGreaterThanOrEqual(x0); expect(x).toBeLessThanOrEqual(x1)
      expect(y).toBeGreaterThanOrEqual(y0); expect(y).toBeLessThanOrEqual(y1)
    }
    expect(new Set(geo.forms!.replace).size).toBe(geo.forms!.replace.length) // the two layers replace different outlines
    // Placeholders are outlines that stay "height unknown": drawn for display, never given a height.
    expect(merged.placeholders.size).toBe(geo.forms!.placeholders!.length + (geo.forms!.outlinePlaceholders?.length ?? 0))
    // The view-cone ring (27 Oct): 2009 parts and outlines reach Queen Elizabeth Park (south) and Trout Lake (east).
    const ys = older.flatMap((f) => f.outer.map(([, y]) => y)), xs = older.flatMap((f) => f.outer.map(([x]) => x))
    expect(Math.min(...ys)).toBeLessThan(-3500)
    expect(Math.max(...xs)).toBeGreaterThan(5000)
    for (const i of merged.placeholders) expect(Number.isFinite(merged.heights!.roof[i])).toBe(false)
    expect(geo.streets!.lines.some((l) => l.name.includes('ROBSON'))).toBe(true)
    expect(geo.streets!.lines.some((l) => l.width === null)).toBe(true)
  })
  it('retains measured buildings when the independent street layer cannot load', async () => {
    const geo = await loadCityGeometry(manifest, async (file) => { if (file === 'city_streets.json') throw new Error('offline'); return read(file) })
    expect(geo.forms).not.toBeNull(); expect(geo.streets).toBeNull(); expect(geo.errors).toHaveLength(1)
  })
  it('rejects replacements built for another footprint ordering instead of changing unrelated buildings', async () => {
    const stale = { ...manifest, layers: manifest.layers.map((l) => l.id === 'footprints' ? { ...l, sha256: 'different' } : l) }
    const geo = await loadCityGeometry(stale, read, true)
    expect(geo.forms).toBeNull(); expect(geo.errors[0]).toContain('do not match')
    expect(applyBuildingForms([base], null, geo.forms).footprints).toEqual([base])
  })
})
