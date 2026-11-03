// Address search helpers (after Vista v34 address-search.js and its tests/test_address_search.cjs behaviour).
import { describe, expect, it, vi } from 'vitest'
import { cityRecords, createLookup, editDistance, geocoderPlaces, geocoderUrl, matchAreas, parseQuery, streetMatch, suggest } from './addressSearch'

const recs = cityRecords([
  { civic_number: '1128', std_street: 'W GEORGIA ST', geo_point_2d: { lon: -123.1236, lat: 49.2857 } },
  { civic_number: '1133', std_street: 'W GEORGIA ST', geo_point_2d: { lon: -123.1239, lat: 49.2862 } },
  { civic_number: '969', std_street: 'BURRARD ST', geo_point_2d: { lon: -123.1263, lat: 49.2810 } },
  { civic_number: '1480', std_street: 'HOWE ST', geo_point_2d: { lon: -123.1301, lat: 49.2757 } },
  { civic_number: '1480', std_street: 'HOWE ST', geo_point_2d: { lon: -123.1301, lat: 49.2757 } }, // duplicate row
  { civic_number: '12', std_street: 'E 1ST AV', geo_point_2d: { lon: -123.0, lat: 49.0 } }, // outside the box
])

describe('address suggestions on City records (Vista)', () => {
  it('reads records once, inside the box, without duplicates', () => {
    expect(recs).toHaveLength(4)
  })
  it('parses numbers, units and street words the City way', () => {
    expect(parseQuery('1128 West Georgia Street, Vancouver')).toEqual({ number: '1128', street: 'W GEORGIA ST' })
    expect(parseQuery('1203-1128 W Georgia')).toEqual({ number: '1128', street: 'W GEORGIA' })
    expect(parseQuery('Howe')).toEqual({ number: '', street: 'HOWE' })
  })
  it('tolerates typos: adjacent swaps and an unfinished word', () => {
    expect(editDistance('GEROG', 'GEORG')).toBe(1)
    expect(streetMatch('GEROG', 'W GEORGIA ST')).toEqual({ distance: 1 })
    expect(streetMatch('GE', 'W GEORGIA ST')).toEqual({ distance: 0 })
    expect(streetMatch('XZ', 'W GEORGIA ST')).toBeNull()
    const s = suggest(recs, '1128 w gerogia')
    expect(s.kind).toBe('guess') // street matched approximately: labelled, not asserted
    expect(suggest(recs, '1128 w georgia')).toMatchObject({ kind: 'match', items: [{ number: '1128' }] })
    expect(suggest(recs, 'burard')).toMatchObject({ kind: 'streets', approximate: true })
    expect(suggest(recs, '1129 w georgia')).toMatchObject({ kind: 'guess' })
  })
  it('neighbourhoods match by prefix or one edit', () => {
    const areas = [{ name: 'Downtown', lon: -123.12, lat: 49.28 }, { name: 'West End', lon: -123.13, lat: 49.285 }, { name: 'Mount Pleasant', lon: -123.1, lat: 49.26 }]
    expect(matchAreas(areas, 'west en').map((a) => a.name)).toEqual(['West End'])
    expect(matchAreas(areas, 'donwtown').map((a) => a.name)).toEqual(['Downtown'])
    expect(matchAreas(areas, '1128')).toEqual([])
  })
})

describe('BC Address Geocoder', () => {
  it('asks for parcel points in Vancouver inside the box', () => {
    const u = new URL(geocoderUrl('1128 W Georgia St'))
    expect(u.searchParams.get('addressString')).toBe('1128 W Georgia St, Vancouver, BC')
    expect(u.searchParams.get('locationDescriptor')).toBe('parcelPoint')
    expect(u.searchParams.get('localities')).toBe('Vancouver')
    expect(new URL(geocoderUrl('1128 W Georgia', true)).searchParams.get('autoComplete')).toBe('true')
  })
  it('keeps only scored civic points in Vancouver inside the box', () => {
    const f = (lon: number, lat: number, props: Record<string, unknown>) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props })
    const data = { type: 'FeatureCollection', features: [
      f(-123.1236, 49.2857, { fullAddress: '1128 W Georgia St, Vancouver, BC', score: 99, matchPrecision: 'CIVIC_NUMBER', localityName: 'Vancouver' }),
      f(-123.1236, 49.2857, { fullAddress: '1128 W Georgia St, Vancouver, BC', score: 98, matchPrecision: 'CIVIC_NUMBER', localityName: 'Vancouver' }),
      f(-122.9, 49.2, { fullAddress: '1 Main St, Burnaby, BC', score: 99, matchPrecision: 'CIVIC_NUMBER', localityName: 'Burnaby' }),
      f(-123.12, 49.28, { fullAddress: 'W Georgia St, Vancouver, BC', score: 90, matchPrecision: 'STREET', localityName: 'Vancouver' }),
      f(-123.12, 49.28, { fullAddress: '1 Low St, Vancouver, BC', score: 40, matchPrecision: 'CIVIC_NUMBER', localityName: 'Vancouver' }),
    ] }
    const strict = geocoderPlaces(data)
    expect(strict.map((p) => p.label)).toEqual(['1128 W Georgia St, Vancouver, BC'])
    expect(strict[0].utm[0]).toBeGreaterThan(491000)
    expect(geocoderPlaces(data, true).map((p) => p.kind)).toEqual(['address', 'area'])
    expect(geocoderPlaces({ nope: 1 })).toEqual([])
  })
  it('debounces, drops stale answers, does not cache failures, and says offline', async () => {
    vi.useFakeTimers()
    const answer = { type: 'FeatureCollection', features: [] }
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => answer }))
    const L = createLookup({ fetcher, delay: 100 })
    const seen: string[] = []
    L.search('112', (s) => seen.push(s.state))
    L.search('1128', (s) => seen.push(s.state))
    await vi.advanceTimersByTimeAsync(150)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['loading', 'loading', 'ready'])
    L.search('1128', (s) => seen.push(s.state)) // cached
    expect(seen.at(-1)).toBe('ready'); expect(fetcher).toHaveBeenCalledTimes(1)
    const failing = vi.fn(async () => { throw new Error('down') })
    const F = createLookup({ fetcher: failing, delay: 10, online: () => true })
    const out: string[] = []
    F.search('howe st', (s) => out.push(s.state === 'error' ? `error:${s.reason}` : s.state))
    await vi.advanceTimersByTimeAsync(50)
    F.search('howe st', (s) => out.push(s.state === 'error' ? `error:${s.reason}` : s.state))
    await vi.advanceTimersByTimeAsync(50)
    expect(out).toEqual(['loading', 'error:network', 'loading', 'error:network'])
    const off = createLookup({ fetcher, online: () => false })
    const o: string[] = []
    off.search('howe st', (s) => o.push(s.state === 'error' ? s.reason : s.state))
    expect(o).toEqual(['offline'])
    vi.useRealTimers()
  })
})
