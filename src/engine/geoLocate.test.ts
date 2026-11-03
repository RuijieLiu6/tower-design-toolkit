// Geographic location and GeoJSON site boundaries (after Vista v34 georeference.js / georeference-ui.js).
import { describe, expect, it } from 'vitest'
import { fromCity, normalizeCrs, parsePasted, siteFromGeoJson, siteToGeoJson, toCity, type InputCrs } from './geoLocate'
import type { Pt } from './site'

const ORIGIN: Pt = [491300, 5458600]

describe('typed coordinates', () => {
  it('lon/lat of the QE Park origin lands on the City apex (open data = City service, C04 r3)', () => {
    const p = toCity(-123.1124363, 49.2421562, 'EPSG:4326')
    expect(Math.hypot(p[0] - 491816.07, p[1] - 5454381.78)).toBeLessThan(0.05)
  })
  it('UTM is the City frame itself; Web Mercator and lon/lat round-trip to well under a millimetre', () => {
    expect(toCity(491816.07, 5454381.78, 'EPSG:26910')).toEqual([491816.07, 5454381.78])
    for (const crs of ['EPSG:4326', 'EPSG:3857', 'EPSG:26910'] as InputCrs[]) {
      const q = fromCity([491636, 5458756], crs), back = toCity(q[0], q[1], crs)
      expect(Math.hypot(back[0] - 491636, back[1] - 5458756)).toBeLessThan(0.001)
    }
  })
  it('never guesses a CRS and range-checks every input (Vista)', () => {
    expect(() => normalizeCrs('EPSG:2154')).toThrow(/never guessed/)
    expect(normalizeCrs('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe('EPSG:4326')
    expect(normalizeCrs('EPSG:3157')).toBe('EPSG:26910')
    expect(() => toCity(-123.12, 95, 'EPSG:4326')).toThrow(/longitude, latitude/)
    expect(() => toCity(2.35, 48.85, 'EPSG:4326')).toThrow(/UTM zone 10/)
    expect(() => toCity(49.28, -123.12, 'EPSG:4326')).toThrow() // swapped order is rejected, not swapped back
    expect(() => toCity(5458600, 491300, 'EPSG:26910')).toThrow(/Invalid EPSG:26910/)
  })
  it('pasted text is read only when it says what it is', () => {
    expect(parsePasted('49.2827° N, 123.1207° W')).toMatchObject({ x: -123.1207, y: 49.2827, crs: 'EPSG:4326' })
    expect(parsePasted('49.2827°, -123.1207°')).toMatchObject({ x: -123.1207, y: 49.2827 })
    expect(parsePasted('E 491300 N 5458600')).toMatchObject({ x: 491300, y: 5458600, crs: 'EPSG:26910' })
    expect(parsePasted('49.2827, -123.1207')).toBeNull()
  })
})

describe('GeoJSON site boundary', () => {
  const ring: Pt[] = [[321, 141], [351, 141], [351, 171], [321, 171]]
  it('exports RFC 7946 lon/lat with no height and states its provenance', () => {
    const g = siteToGeoJson({ ring, name: 'Study site', source: 'drawn', sourceNote: 'Drawn on the plan', area: 900, origin: ORIGIN }) as {
      type: string; note: string; features: { geometry: { type: string; coordinates: number[][][] }; properties: Record<string, unknown> }[]
    }
    expect(g.type).toBe('FeatureCollection')
    const poly = g.features[0]
    expect(poly.geometry.type).toBe('Polygon')
    const positions = poly.geometry.coordinates[0]
    expect(positions.every((p) => p.length === 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)).toBe(true)
    expect(positions[0]).toEqual(positions[positions.length - 1])
    expect(poly.properties.vertical_coordinate_in_geometry).toBe(false)
    expect(poly.properties.legal_boundary_verified).toBe(false)
    expect(g.note).toMatch(/no vertical datum is implied/)
  })
  it('imports what it exported to within 2 mm (positions rounded to 1e-8°, about 1.1 mm)', () => {
    const g = siteToGeoJson({ ring, name: 'Study site', source: 'drawn', sourceNote: '', area: 900, origin: ORIGIN })
    const back = siteFromGeoJson(g, ORIGIN)
    expect(back.crs).toBe('EPSG:4326')
    back.ring.forEach((p, i) => expect(Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1])).toBeLessThan(0.002))
  })
  it('reads a legacy crs member, drops holes and heights with a note, and refuses broken rings', () => {
    const utm = { type: 'Feature', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::26910' } }, properties: { name: 'Lot A' },
      geometry: { type: 'Polygon', coordinates: [[[491621, 5458741, 33], [491651, 5458741, 33], [491651, 5458771, 33], [491621, 5458771, 33], [491621, 5458741, 33]], [[491630, 5458750], [491640, 5458750], [491640, 5458760], [491630, 5458750]]] } }
    const r = siteFromGeoJson(utm, ORIGIN)
    expect(r.crs).toBe('EPSG:26910'); expect(r.name).toBe('Lot A')
    expect(r.ring[0]).toEqual([321, 141])
    expect(r.notes.join(' ')).toMatch(/Holes/); expect(r.notes.join(' ')).toMatch(/Heights in the file were ignored/)
    const bow = { type: 'Polygon', coordinates: [[[-123.12, 49.28], [-123.11, 49.29], [-123.12, 49.29], [-123.11, 49.28], [-123.12, 49.28]]] }
    expect(() => siteFromGeoJson(bow, ORIGIN)).toThrow(/simple polygon/)
    expect(() => siteFromGeoJson({ type: 'Point', coordinates: [0, 0] }, ORIGIN)).toThrow(/No Polygon/)
  })
})
