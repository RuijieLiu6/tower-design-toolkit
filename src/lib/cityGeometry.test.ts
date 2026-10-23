import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyBuildingForms, loadCityGeometry, solidRings, type BuildingForms } from './cityGeometry'
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
    expect(merged.footprints.length).toBe(fp.length - new Set(geo.forms!.replace).size + geo.forms!.forms.length + (geo.forms!.repairs ?? []).reduce((sum, r) => sum + r.parts.length - 1, 0))
    expect(merged.heights!.roof.length).toBe(merged.footprints.length)
    for (const f of geo.forms!.forms) for (const [x,y] of f.outer) {
      expect(x).toBeGreaterThanOrEqual(-1300); expect(x).toBeLessThanOrEqual(-300)
      expect(y).toBeGreaterThanOrEqual(400); expect(y).toBeLessThanOrEqual(1400)
    }
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
