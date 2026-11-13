// Address search without the network (Sinnie, 12 Nov: "the search bar is not working"). The published app cannot reach
// the City open-data portal or the BC Address Geocoder (the page may not fetch outside its own files), so the search now
// reads what the app already ships: every City lot's civic address from the parcel layer (parcels.json, City of
// Vancouver open data, OGL-Vancouver) placed at the lot's centre, and the 22 local areas (local_areas.json). The online
// geocoder stays an optional extra where the network is allowed.
import { fromCity } from '../engine/geoLocate'
import type { Pt } from '../engine/site'
import { normalizeStreet, type CityRecord, type LocalArea } from './addressSearch'
import { loadNeighbourhoods } from './localAreas'
import { loadParcelLayer } from './siteParcels'
import { CITY_ORIGIN } from '../store'

const lonLat = (p: Pt): [number, number] => fromCity([p[0] + CITY_ORIGIN[0], p[1] + CITY_ORIGIN[1]], 'EPSG:4326') as [number, number]

let records: Promise<CityRecord[]> | null = null
/** One record per civic address of a City lot, at the lot's centre (the first lot when an address has several). */
export function bundledRecords(): Promise<CityRecord[]> {
  records ??= loadParcelLayer().then((layer) => {
    const out: CityRecord[] = [], seen = new Set<string>()
    const { rows, streets } = layer.attrs
    for (let i = 0; i < rows.length; i++) {
      const civic = String(rows[i][0] ?? '').trim(), street = streets[rows[i][1]] ?? ''
      if (!civic || !street || !/^\d/.test(civic)) continue
      const key = `${civic} ${street}`.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      const o = layer.polys[i]?.outer
      if (!o?.length) continue
      let x = 0, y = 0
      for (const [px, py] of o) { x += px; y += py }
      const [lon, lat] = lonLat([x / o.length, y / o.length])
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
      out.push({ number: civic, street: normalizeStreet(street), lon, lat })
    }
    return out
  })
  records.catch(() => { records = null })
  return records
}

let areas: Promise<LocalArea[]> | null = null
export function bundledAreas(): Promise<LocalArea[]> {
  areas ??= loadNeighbourhoods().then((f) => f.areas.map((a) => { const [lon, lat] = lonLat(a.at); return { name: a.name, lon, lat } }))
  areas.catch(() => { areas = null })
  return areas
}
