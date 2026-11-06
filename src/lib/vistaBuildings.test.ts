import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { HeightGrid, Manifest } from './cityLayers'
import { CITY_PLINTH } from './plinth'
import { partUse } from './buildingUse'
import { buildingLabel, buildingSource, chooseHeight, HEIGHT_MODE, isEstimate, loadVistaBuildings, partsByOsmId, seatVista, VISTA_LAYER, type VistaBuildings } from './vistaBuildings'

const DIR = new URL('../../public/data/', import.meta.url)
const read = async (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const flat = (z: number): HeightGrid => ({ cols: 2, rows: 2, step: 40000, x0: -20000, y0: -20000, z: new Float32Array(4).fill(z) })

/** One building part, for the pure functions. */
const one = (o: Partial<Record<keyof VistaBuildings, number>> = {}): VistaBuildings => ({
  osmId: ['w1'], vistaId: ['buildings:w1'], asset: Uint8Array.of(0), fill: -1, heightM: Float32Array.of(o.heightM ?? 12), heightSource: Uint8Array.of(o.heightSource ?? 2), osmType: ['yes'], use: null, useBasis: null,
  clearance: Float32Array.of(o.clearance ?? 0), lidar2022: Float32Array.of(o.lidar2022 ?? NaN), lidar2022Max: Float32Array.of(o.lidar2022Max ?? NaN), city2009: Float32Array.of(o.city2009 ?? NaN),
})
const square = { id: 1, outer: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][], holes: [] }

// Real data (megabytes): a single test takes a second or two alone, longer while the whole suite runs in parallel.
describe("Vista's unified model as Real Vancouver's buildings", { timeout: 30_000 }, () => {
  it('decodes every part with its OSM id, a positive height and a known source, all on the model base', async () => {
    const layer = manifest.layers.find((l) => l.id === VISTA_LAYER)!
    expect(layer.licence.name).toMatch(/Open Database License/)
    expect(layer.attribution).toMatch(/OpenStreetMap contributors/)
    const v = (await loadVistaBuildings(manifest, read))!
    expect(v.footprints.length).toBe(layer.count)
    // A way's id is its OSM way number; a multipolygon relation of the fill has a negative id ("r" + its number).
    expect(v.vista.osmId.every((id, i) => id === (v.footprints[i].id < 0 ? `r${-v.footprints[i].id}` : `w${v.footprints[i].id}`))).toBe(true)
    const fill = v.vista.fill, own = v.vista.osmId.filter((_, i) => v.vista.asset[i] !== fill)
    expect(new Set(own).size).toBe(61402) // Vista's 61,407 objects less 5 under 1 m2 (tools/build_vista_buildings.py)
    // Vista's own key: asset + ':' + osmId, one per object, never shared between the core, the extension and the fill.
    const assets = ['buildings', 'ext_buildings', 'osm_fill']
    expect(v.vista.vistaId.every((k, i) => k === `${assets[v.vista.asset[i]]}:${v.vista.osmId[i]}`)).toBe(true)
    // The OpenStreetMap fill beyond Vista's model (4 Nov): as many buildings as the build added, none sharing an id with Vista's.
    const added = ((layer.source as { fill?: { stats: { added: number } } }).fill?.stats.added) ?? 0
    expect(fill >= 0).toBe(added > 0)
    expect(new Set(v.vista.vistaId).size).toBe(61402 + added)
    expect(new Set(v.vista.osmId).size).toBe(61402 + added)
    expect(v.vista.heightM.every((h) => h > 0)).toBe(true)
    for (const f of v.footprints) for (const [x, y] of f.outer) {
      expect(x > CITY_PLINTH.x0 && x < CITY_PLINTH.x1 && y > CITY_PLINTH.y0 && y < CITY_PLINTH.y1).toBe(true)
    }
    // Vista's own counts per height source (unified_*_index.json): tag, floor count, type estimate.
    const objects = partsByOsmId(v.vista), by = [0, 0, 0], byFill = [0, 0, 0]
    for (const parts of objects.values()) (v.vista.asset[parts[0]] === fill ? byFill : by)[v.vista.heightSource[parts[0]]]++
    expect(by).toEqual([5380, 6607, 49415])
    // The fill by Vista's rules (OSM height tag, floor count, type table), as the build counted them.
    const recorded = (layer.processing as { height_sources: Record<string, Record<string, number>> }).height_sources.osm_fill
    if (added) expect(byFill).toEqual(Object.values(recorded))
  })

  it('carries each part’s building type from OpenStreetMap use tags, other (never guessed) where OSM has none', async () => {
    const v = (await loadVistaBuildings(manifest, read))!.vista
    const by = new Map<string, number>(), basis = [0, 0, 0]
    // Vista's own parts (the fill beyond Vista's model takes its type from its own tags, or a point of interest on Vista's edge).
    v.osmId.forEach((_, i) => { if (v.asset[i] === v.fill) return; const u = partUse(v, i); by.set(u.use, (by.get(u.use) ?? 0) + 1); basis[v.useBasis![i]]++ })
    // tools/build_vista_buildings.py with the Overpass extract of 3 Nov (context-data/raw/osm-use-tags-2026-11-03): per part.
    expect(Object.fromEntries(by)).toEqual({ residential: 17712, retail: 2804, office: 419, hotel: 119, cultural: 220, institutional: 384, transit: 27, other: 40687 })
    expect(basis).toEqual([40687, 20251, 1434])
    expect(v.osmId.every((_, i) => (partUse(v, i).basis === 'none') === (partUse(v, i).use === 'other'))).toBe(true)
  })

  it('seats every building on the given ground; Vista\'s own terrain is never used', async () => {
    const v = (await loadVistaBuildings(manifest, read))!
    const h = seatVista(v.footprints, v.vista, [flat(30)])
    for (let i = 0; i < v.footprints.length; i += 97) {
      expect(h.roof[i] - 30).toBeCloseTo(chooseHeight(v.vista, i).height, 4)
      expect(h.ground[i] - 30).toBeCloseTo(v.vista.clearance[i], 4)
      expect(h.roof[i]).toBeGreaterThan(h.ground[i])
    }
  })
})

describe('heights by source', () => {
  it("puts a measured height first (Ruijie, 3 Nov), and Vista's own height only when asked", () => {
    expect(HEIGHT_MODE).toBe('measured-first')
    const v = one({ heightM: 9, heightSource: 2, lidar2022: 64.2, lidar2022Max: 70.1, city2009: 60 })
    expect(chooseHeight(v, 0, 'vista')).toEqual({ height: 9, max: 9, basis: 'type-estimate' })
    expect(chooseHeight(v, 0)).toEqual({ height: expect.closeTo(64.2, 4), max: expect.closeTo(70.1, 4), basis: 'lidar2022' })
    expect(chooseHeight(one({ city2009: 7.5 }), 0, 'measured-first').basis).toBe('city2009')
    expect(chooseHeight(one({ heightSource: 1 }), 0, 'measured-first').basis).toBe('osm-levels')
    // An elevated part keeps Vista's own height: a measured roof of the building under it would be the wrong solid.
    expect(chooseHeight(one({ clearance: 5, lidar2022: 40 }), 0, 'measured-first').basis).toBe('type-estimate')
  })

  it('puts an elevated part on its clearance and leaves a part off the terrain unknown', () => {
    const v = one({ heightM: 12, clearance: 4 })
    const h = seatVista([square], v, [flat(10)])
    expect([h.ground[0], h.roof[0]]).toEqual([14, 22])
    const off = seatVista([{ ...square, outer: square.outer.map(([x, y]) => [x + 90000, y] as [number, number]) }], v, [flat(10)])
    expect(Number.isNaN(off.roof[0])).toBe(true)
  })

  it('names the model and the height basis in captions, and marks type estimates', () => {
    const d = { model: 'vista' as const, footprints: [square], vista: one({ heightSource: 0 }) }
    expect(buildingLabel(d, 0)).toBe('OSM building w1 (type unknown)')
    expect(buildingLabel({ ...d, vista: { ...d.vista!, use: Uint8Array.of(3), useBasis: Uint8Array.of(2) } }, 0)).toBe('OSM building w1 (hotel, OSM point of interest inside)')
    expect(buildingSource(d, 0)).toMatch(/Vista model, OSM height tag/)
    expect(isEstimate(d, 0)).toBe(false)
    expect(isEstimate({ ...d, vista: one({ heightSource: 2 }) }, 0)).toBe(true)
    const city = { model: 'city' as const, footprints: [{ ...square, id: -1_000_005 }], vista: null }
    expect(buildingSource(city, 0)).toMatch(/City 2009/)
    expect(buildingLabel(city, 0)).toBe('2009 height part 5')
  })
})
