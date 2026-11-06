// Imagine Vancouver (after Vista v37) on the real Vista buildings: the join to Vista's table, the three scenarios, the
// rule that every changed building clears every surface over each of its parts, assemblies moving together, the CSV.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTerrain, sampleTerrain, type Manifest } from '../lib/cityLayers'
import { loadVistaBuildings, seatVista } from '../lib/vistaBuildings'
import { coneSurfaces } from './heightModel'
import { buildingRow, imagine, imagineCsv, prepareImagine, type ImagineTable } from './imagine'
import type { Pt } from './vista'

const O: Pt = [491300, 5458600]
const DIR = new URL('../../public/data/', import.meta.url)
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const layer = (id: string) => manifest.layers.find((l) => l.id === id)!
const grids = [decodeTerrain(read(layer('terrain_r1').file), layer('terrain_r1').grid!), decodeTerrain(read(layer('terrain_r2').file), layer('terrain_r2').grid!)]
const table = JSON.parse(readFileSync(new URL('vista/imagine_zoning.json', DIR), 'utf8')) as ImagineTable
const surfaces = coneSurfaces((p) => sampleTerrain(grids, p[0] - O[0], p[1] - O[1]))

describe('Imagine Vancouver on the Vista buildings', { timeout: 180_000 }, async () => {
  const vb = (await loadVistaBuildings(manifest, async (f) => read(f)))!
  const seated = seatVista(vb.footprints, vb.vista, grids)
  const prep = prepareImagine(table, { footprints: vb.footprints, ground: seated.ground, roof: seated.roof }, surfaces, O)
  const existing = imagine(prep, 'existing'), zoning = imagine(prep, 'zoning'), views = imagine(prep, 'views')

  it("joins every Vista building to Vista's own table by OSM way number", () => {
    expect(table.osm).toHaveLength(61407)
    expect(table.status.filter((s) => s === 0)).toHaveLength(44402)
    // Vista's own parts only: the OpenStreetMap fill beyond Vista's model (4 Nov) has no row and is never changed.
    const fill = vb.vista.fill
    const missing = [...prep.partRow].filter((r, p) => r < 0 && vb.vista.asset[p] !== fill).length
    expect(missing).toBe(0)
    if (fill >= 0) prep.partRow.forEach((r, p) => { if (vb.vista.asset[p] === fill) expect(r).toBe(-1) })
  })
  it('existing changes nothing; height references change only buildings with a zoning number', () => {
    expect(existing.stats.changed).toBe(0)
    expect(zoning.stats.changed).toBeGreaterThan(1000)
    prep.groups.forEach((g, i) => { if (!g.resolved) expect(zoning.groups[i].scale).toBe(1) })
  })
  it('with view cones: every changed part clears every surface over it by 0.1 m; both kinds of surface control somewhere', () => {
    expect(views.stats.mapped).toBeGreaterThan(18000)
    expect(views.stats.byEstimate).toBeGreaterThan(0)
    expect(views.stats.byStudy).toBeGreaterThan(0)
    let checked = 0
    for (let p = 0; p < prep.hits.length && checked < 3000; p++) {
      if (!prep.hits[p].length || !views.groups[prep.partGroup[p]].changed || !Number.isFinite(views.roof[p])) continue
      // Under a surface that runs below the ground the stack goes to zero height (Vista: "no positive height").
      if (views.groups[prep.partGroup[p]].scale === 0) expect(views.roof[p]).toBeCloseTo(prep.groups[prep.partGroup[p]].base, 6)
      else expect(views.roof[p]).toBeLessThanOrEqual(prep.hits[p][0].z - 0.1 + 1e-4)
      checked++
    }
    expect(checked).toBeGreaterThan(500)
  })
  it("Vista's assemblies move together: one scale for every part", () => {
    const assembled = prep.groups.filter((g) => g.rows.length > 1)
    expect(assembled.length).toBeGreaterThan(100)
    for (const g of assembled.slice(0, 50)) {
      const i = prep.groups.indexOf(g), s = views.groups[i].scale
      for (const p of g.parts) if (Number.isFinite(views.roof[p])) expect(views.roof[p]).toBeCloseTo(g.base + (seated.roof[p] - g.base) * s, 3)
    }
  })
  it('exports the comparison with the height source and the surface kind, under the ODbL attribution', () => {
    const rowOf = new Map(table.osm.map((id, r) => [id, r]))
    const parts = new Map<number, number[]>()
    vb.footprints.forEach((f, p) => { const r = rowOf.get(f.id)!; parts.set(r, [...(parts.get(r) ?? []), p]) })
    const src = () => ({ text: 'OSM height tag (unverified)', estimated: false })
    const ctl = views.groups.findIndex((g) => g.control?.kind === 'study')
    const r = prep.groups[ctl].rows[0]
    const row = (res: typeof views) => buildingRow(prep, res, r, parts.get(r)!, src)!
    const csv = imagineCsv([{ existing: row(existing), zoning: row(zoning), views: row(views) }], table.attribution)
    expect(csv.split('\n')[0]).toMatch(/OpenStreetMap contributors \(ODbL\)/)
    expect(csv).toMatch(/^osm_id,existing_height_m,existing_height_source/m)
    expect(csv).toMatch(/study surface \(assumption, not a City ceiling\)/)
  })
})
