// Geographic location and site-boundary interchange (after Vista v34 georeference.js / georeference-ui.js, Ruijie
// Liu). Typed coordinates in WGS84 longitude/latitude, UTM 10N or Web Mercator become a point in the Real Vancouver
// frame; site boundaries go out and come in as GeoJSON with their coordinate provenance. Rules kept from Vista: the
// CRS is never guessed, every input is range-checked, boundaries are XY only (no vertical value is ever inferred).
// Frame difference from Vista: Tower Design Toolkit's frame IS EPSG:26910 (the City's numbers: NAD83(CSRS) lon/lat
// projected with GRS80 UTM 10N, no datum shift), so UTM input is exact here and WGS84 input is the approximate one.
import { toUtm10 } from './relaxAviation'
import { utm10ToLatLon } from './vista'
import { normalizeRing, ringMetrics, validateRing, type Pt } from './site'

export type InputCrs = 'EPSG:4326' | 'EPSG:26910' | 'EPSG:3857'
export const INPUT_CRS: { id: InputCrs; label: string; x: string; y: string; digits: number }[] = [
  { id: 'EPSG:4326', label: 'WGS84 · longitude / latitude', x: 'Longitude (°)', y: 'Latitude (°)', digits: 7 },
  { id: 'EPSG:26910', label: 'NAD83 / UTM zone 10N (the City numbers)', x: 'Easting (m)', y: 'Northing (m)', digits: 2 },
  { id: 'EPSG:3857', label: 'Web Mercator · metres', x: 'X (m)', y: 'Y (m)', digits: 2 },
]

const WEB_R = 6378137
const WEB_LIMIT = Math.PI * WEB_R
const WEB_LAT_LIMIT = 85.05112878

/** Vista normalizeCrs: only named systems; "urn:ogc:def:crs:EPSG::4326", "EPSG:4326" and "CRS84" are accepted. */
export function normalizeCrs(value: unknown): InputCrs {
  const s = String(value ?? '').trim().toUpperCase()
  const id = /CRS84$/.test(s) ? 'EPSG:4326' : s.replace(/^URN:OGC:DEF:CRS:EPSG::?/, 'EPSG:').replace(/^EPSG::/, 'EPSG:')
  if (id === 'EPSG:3157') return 'EPSG:26910' // NAD83(CSRS) / UTM 10N: the same numbers in this frame (C04 r3)
  if (id === 'EPSG:4326' || id === 'EPSG:3857' || id === 'EPSG:26910') return id
  throw new Error('Unsupported or missing horizontal CRS. Use EPSG:4326, EPSG:26910 (or EPSG:3157) or EPSG:3857; coordinates are never guessed.')
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export interface Provenance {
  sourceCrs: InputCrs
  targetCrs: 'EPSG:26910'
  axisOrder: string
  operation: string
  accuracy: string
  surveyVerified: false
  verticalDatum: null
}
/** What a conversion did, written next to every converted coordinate. */
export function provenance(crs: InputCrs): Provenance {
  return {
    sourceCrs: crs, targetCrs: 'EPSG:26910', axisOrder: crs === 'EPSG:4326' ? 'longitude,latitude' : 'easting,northing', surveyVerified: false, verticalDatum: null,
    operation: crs === 'EPSG:26910' ? 'None: the City layers use these numbers directly.'
      : crs === 'EPSG:4326' ? 'Longitude/latitude taken as NAD83(CSRS) (no WGS84 datum shift), projected with GRS80 UTM zone 10N (Krüger series).'
      : 'Web Mercator inverse (spherical, R = 6,378,137 m) to longitude/latitude, then as EPSG:4326.',
    accuracy: crs === 'EPSG:26910' ? 'Same frame as the City data.' : 'WGS84 and NAD83(CSRS) differ by about 1–2 m in Vancouver (unverified); not for survey or regulatory use.',
  }
}

/** Vista domain checks, then the point in EPSG:26910. */
export function toCity(x: number, y: number, crs: InputCrs): Pt {
  if (!finite(x) || !finite(y)) throw new Error('Coordinates must be finite numbers.')
  if (crs === 'EPSG:26910') {
    if (x < 100000 || x > 900000 || y < 0 || y > 9400000) throw new Error('Invalid EPSG:26910 easting/northing in metres.')
    return [x, y]
  }
  let lon = x, lat = y
  if (crs === 'EPSG:3857') {
    if (Math.abs(x) > WEB_LIMIT + 1e-6 || Math.abs(y) > WEB_LIMIT + 1e-6) throw new Error('EPSG:3857 coordinates exceed Web Mercator bounds.')
    lon = (x / WEB_R) * (180 / Math.PI)
    lat = (2 * Math.atan(Math.exp(y / WEB_R)) - Math.PI / 2) * (180 / Math.PI)
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error('Geographic input requires longitude, latitude in degrees.')
  if (lon < -126 - 1e-8 || lon > -120 + 1e-8 || lat < -1e-8 || lat > 84 + 1e-8) throw new Error('That position lies outside UTM zone 10 north (126°W–120°W); this model covers Vancouver.')
  return toUtm10(lat, lon)
}

/** EPSG:26910 to the named system (for the form and the export). */
export function fromCity(p: Pt, crs: InputCrs): Pt {
  if (crs === 'EPSG:26910') return [p[0], p[1]]
  const [lat, lon] = utm10ToLatLon(p)
  if (crs === 'EPSG:4326') return [lon, lat]
  if (Math.abs(lat) > WEB_LAT_LIMIT) throw new Error('Latitude exceeds Web Mercator bounds.')
  return [WEB_R * lon * (Math.PI / 180), WEB_R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
}

/**
 * One pasted text such as "49.2827, -123.1207" (latitude first, as map apps copy it) or "491300 5458600". Returns the
 * reading with the CRS it implies only when the text says so (a degree sign or N/S/E/W letters, or "E"/"N" labels);
 * plain number pairs come back unread, because coordinates are never guessed.
 */
export function parsePasted(text: string): { x: number; y: number; crs: InputCrs; note: string } | null {
  const t = text.trim().replace(/[−]/g, '-')
  const hemi = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])$/i)
  if (hemi) {
    const lat = Number(hemi[1]) * (hemi[2].toUpperCase() === 'S' ? -1 : 1), lon = Number(hemi[3]) * (hemi[4].toUpperCase() === 'W' ? -1 : 1)
    return { x: lon, y: lat, crs: 'EPSG:4326', note: 'Read as latitude N/S, longitude E/W.' }
  }
  const deg = t.match(/^(-?\d+(?:\.\d+)?)\s*°\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°$/)
  if (deg) return { x: Number(deg[2]), y: Number(deg[1]), crs: 'EPSG:4326', note: 'Read as latitude, longitude (the order map apps copy).' }
  const en = t.match(/^E?\s*(\d{6}(?:\.\d+)?)\s*(?:m\s*)?E?[\s,;]+N?\s*(\d{7}(?:\.\d+)?)\s*(?:m\s*)?N?$/i)
  if (en && /[EN]/i.test(t)) return { x: Number(en[1]), y: Number(en[2]), crs: 'EPSG:26910', note: 'Read as UTM 10N easting, northing.' }
  return null
}

// ---------------------------------------------------------------- GeoJSON site boundary

export const GEOJSON_NOTE = 'GeoJSON positions are longitude/latitude only (RFC 7946). No height is in the geometry and no vertical datum is implied; heights in Tower Design Toolkit are CGVD28 and are not part of this file.'

export interface SiteExport {
  ring: Pt[] /* local */
  name: string
  source: string
  sourceNote: string
  area: number
  parcelArea?: number | null
  parcels?: string[]
  origin: Pt
}

/** RFC 7946 FeatureCollection: the boundary (lon/lat, counter-clockwise), its centroid, and provenance properties. */
export function siteToGeoJson(s: SiteExport): object {
  const abs = normalizeRing(s.ring).map(([x, y]) => [x + s.origin[0], y + s.origin[1]] as Pt)
  const ll = abs.map((p) => fromCity(p, 'EPSG:4326').map((v) => Math.round(v * 1e8) / 1e8))
  const m = ringMetrics(normalizeRing(s.ring))
  const c = fromCity([m.centre[0] + s.origin[0], m.centre[1] + s.origin[1]], 'EPSG:4326')
  const prov = { ...provenance('EPSG:4326'), sourceCrs: 'EPSG:26910', targetCrs: 'EPSG:4326', axisOrder: 'longitude,latitude',
    operation: 'EPSG:26910 (the City numbers) to NAD83(CSRS) longitude/latitude (GRS80, Krüger series), written as RFC 7946 positions without a WGS84 shift.' }
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...ll, ll[0]]] }, properties: {
        role: 'Study site boundary', name: s.name, boundary_source: s.source, boundary_note: s.sourceNote, legal_boundary_verified: false,
        area_m2: Math.round(s.area * 100) / 100, parcel_area_m2: s.parcelArea == null ? null : Math.round(s.parcelArea * 100) / 100, parcels: s.parcels ?? [],
        epsg26910_ring: abs.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]),
        vertical_coordinate_in_geometry: false, coordinate_provenance: prov,
      } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [Math.round(c[0] * 1e8) / 1e8, Math.round(c[1] * 1e8) / 1e8] }, properties: { role: 'Study site centroid', vertical_coordinate_in_geometry: false } },
    ],
    towerDesignToolkit: { format: 'tower-design-toolkit-site@1', frame: 'EPSG:26910 (City numbers), local origin ' + s.origin.join(', '), after: 'Vista georeference-ui.js (Ruijie Liu)' },
    note: GEOJSON_NOTE,
  }
}

export interface ImportedBoundary { ring: Pt[] /* local */; crs: InputCrs; provenance: Provenance; notes: string[]; name: string | null }

/**
 * A site boundary from GeoJSON (a FeatureCollection, a Feature or a bare geometry; Polygon or MultiPolygon). Positions
 * are EPSG:4326 unless a legacy `crs` member names another system (Vista rule: never guessed from the numbers).
 * Holes are dropped (a site has none) and z values are ignored; both are said. At most 1,024 vertices (Vista).
 */
export function siteFromGeoJson(json: unknown, origin: Pt): ImportedBoundary {
  const doc = json as Record<string, unknown> | null
  if (!doc || typeof doc !== 'object') throw new Error('Not a GeoJSON object.')
  const crsName = (doc.crs as { properties?: { name?: unknown } } | undefined)?.properties?.name
  const crs = crsName === undefined ? 'EPSG:4326' : normalizeCrs(crsName)
  const notes: string[] = []
  type G = { type?: string; coordinates?: unknown }
  const geoms: { g: G; name: string | null }[] = []
  const take = (f: unknown) => {
    const o = f as { type?: string; geometry?: G; properties?: Record<string, unknown> }
    if (o?.type === 'Feature' && o.geometry) geoms.push({ g: o.geometry, name: typeof o.properties?.name === 'string' ? o.properties.name : null })
    else if (o?.type === 'Polygon' || o?.type === 'MultiPolygon') geoms.push({ g: o as G, name: null })
  }
  if (doc.type === 'FeatureCollection' && Array.isArray(doc.features)) doc.features.forEach(take)
  else take(doc)
  const polys: { rings: number[][][]; name: string | null }[] = []
  for (const { g, name } of geoms) {
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) polys.push({ rings: g.coordinates as number[][][], name })
    else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) for (const p of g.coordinates as number[][][][]) polys.push({ rings: p, name })
  }
  if (!polys.length) throw new Error('No Polygon or MultiPolygon in the file.')
  if (polys.length > 1) notes.push(`${polys.length} polygons in the file: the largest one is used.`)
  let best: { ring: Pt[]; area: number; name: string | null } | null = null
  let count = 0, hadZ = false, hadHoles = false
  for (const p of polys) {
    if (!Array.isArray(p.rings) || !p.rings.length || !Array.isArray(p.rings[0])) throw new Error('Each polygon requires an outer ring.')
    if (p.rings.length > 1) hadHoles = true
    const outer = p.rings[0]
    if (outer.length < 4) throw new Error('A boundary ring needs at least three coordinates (and a closing one).')
    const ring: Pt[] = outer.map((q) => {
      if (++count > 1024) throw new Error('Use at most 1,024 boundary vertices.')
      if (!Array.isArray(q) || q.length < 2 || !finite(q[0]) || !finite(q[1])) throw new Error('Boundary positions must be [x, y] numbers.')
      if (q.length > 2) hadZ = true
      const [E, N] = toCity(q[0], q[1], crs)
      return [E - origin[0], N - origin[1]] as Pt
    })
    const r = normalizeRing(ring)
    const err = validateRing(r)
    if (err) throw new Error(`The boundary is not a simple polygon: ${err}`)
    const a = ringMetrics(r).area
    if (!best || a > best.area) best = { ring: r, area: a, name: p.name }
  }
  if (hadHoles) notes.push('Holes in the polygon were dropped: a study site has none.')
  if (hadZ) notes.push('Heights in the file were ignored: GeoJSON boundaries are read in plan only, and no vertical datum is implied.')
  if (crsName !== undefined) notes.push(`The file names ${String(crsName)}; RFC 7946 GeoJSON should be longitude/latitude.`)
  return { ring: best!.ring, crs, provenance: provenance(crs), notes, name: best!.name }
}
