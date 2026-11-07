// Streets around a Real Vancouver study site (7 Nov): names from the City street layer, right-of-way measured to the
// facing parcels, never a street type guessed. On the real data (default site) and on a synthetic block.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeFootprints } from '../lib/cityLayers'
import defaultSite from '../data/defaultSite.json'
import { againstStreet, extentAlong, siteStreets, streetName, type StreetLineLike } from './siteStreets'

type Pt = [number, number]
const data = (f: string) => new URL(`../../public/data/${f}`, import.meta.url)
const bin = (f: string) => { const b = readFileSync(data(f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }

describe('streets around the study site', () => {
  it('names streets the City way, in plain case', () => {
    expect(streetName('W PENDER ST')).toBe('W Pender St')
    expect(streetName('W 16TH AV')).toBe('W 16th Av')
    expect(streetName('  ')).toBe('Unnamed street')
  })

  it('a synthetic block: four streets, widths measured to the facing lots, a lot line where a neighbour sits', () => {
    // Site 0..60 × 0..40; streets on the south (20 m), west (30 m) and north (20 m); a neighbour lot on the east.
    const ring: Pt[] = [[0, 0], [60, 0], [60, 40], [0, 40]]
    const lines: StreetLineLike[] = [
      { name: 'SOUTH ST', kind: 'street', points: [[-100, -10], [200, -10]] },
      { name: 'WEST ST', kind: 'street', points: [[-15, -100], [-15, 200]] },
      { name: 'NORTH ST', kind: 'street', points: [[-100, 50], [200, 50]] },
    ]
    const parcels = [
      { outer: [[0, 0], [60, 0], [60, 40], [0, 40]] as Pt[] }, // the site
      { outer: [[60, 0], [90, 0], [90, 40], [60, 40]] as Pt[] }, // east neighbour
      { outer: [[0, -60], [60, -60], [60, -20], [0, -20]] as Pt[] }, // across the south street
      { outer: [[-90, 0], [-30, 0], [-30, 40], [-90, 40]] as Pt[] }, // across the west street
      // nothing across the north street: twice the centreline distance
    ]
    const r = siteStreets(ring, lines, parcels)
    const by = Object.fromEntries(r.streets.map((s) => [s.key, s]))
    expect(Object.keys(by).sort()).toEqual(['NORTH ST', 'SOUTH ST', 'WEST ST'])
    expect(by['SOUTH ST']).toMatchObject({ name: 'South St', frontage: 60, basis: 'parcels' })
    expect(by['SOUTH ST'].row).toBeCloseTo(20, 6)
    expect(by['WEST ST'].row).toBeCloseTo(30, 6)
    expect(by['NORTH ST']).toMatchObject({ basis: 'centreline' })
    expect(by['NORTH ST'].row).toBeCloseTo(20, 6)
    expect(by['SOUTH ST'].out).toEqual([expect.closeTo(0, 6), expect.closeTo(-1, 6)])
    expect(r.lotLine).toBeCloseTo(40, 6)
    // A podium 1 m back from the south line covers 50 m of it; a tower 20 m wide spans 20 m along it.
    const pod: Pt[] = [[5, 1], [55, 1], [55, 30], [5, 30]]
    expect(againstStreet(pod, by['SOUTH ST'].edges)).toEqual({ setback: expect.closeTo(1, 6), covered: expect.closeTo(50, 6), span: expect.closeTo(50, 6) })
    expect(extentAlong([[20, 10], [40, 10], [40, 30], [20, 30]], by['SOUTH ST'].edges)).toBeCloseTo(20, 6)
  })

  it('the default site: Granville, W Pender, Howe and Dunsmuir, at their measured downtown widths', () => {
    const streets = JSON.parse(readFileSync(data('city_streets.json'), 'utf8')) as { lines: StreetLineLike[] }
    const parcels = decodeFootprints(bin('parcels.bin'))
    const r = siteStreets(defaultSite.ring as Pt[], streets.lines, parcels)
    const names = r.streets.filter((s) => s.kind === 'street').map((s) => s.key).sort()
    console.log(r.streets.map((s) => `${s.key} ${s.kind} front ${s.frontage.toFixed(1)} row ${s.row.toFixed(2)} [${s.rowRange.map((v) => v.toFixed(2)).join('–')}] ${s.basis} cl ${s.toCentreline.toFixed(2)} rays ${s.rays}`).join('\n'), r.lotLine, r.noStreet)
    expect(names).toEqual(['DUNSMUIR ST', 'GRANVILLE ST', 'HOWE ST', 'W PENDER ST'])
    for (const s of r.streets) expect(s.basis).toBe('parcels')
  })
})
