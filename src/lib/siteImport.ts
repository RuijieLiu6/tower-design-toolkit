// A study-site boundary from a GeoJSON file, shared by the Site panel and the transfer centre: read and checked first
// (engine/geoLocate.ts), set as the site only on the person's say-so. Real Vancouver only (the competition keeps its block).
import { siteFromGeoJson, type ImportedBoundary } from '../engine/geoLocate'
import { ringMetrics } from '../engine/site'
import { newSite, useSiteStore } from './siteStore'
import { CITY_ORIGIN } from '../store'

export async function readSiteBoundary(f: File): Promise<ImportedBoundary> {
  if (f.size > 2_000_000) throw new Error('The file is larger than a site boundary (2 MB).')
  return siteFromGeoJson(JSON.parse(await f.text()), CITY_ORIGIN)
}

/** Makes the boundary the study site and says what came in; returns the ring's centre (the map may go there). */
export function setSiteBoundary(name: string, r: ImportedBoundary) {
  const s = useSiteStore.getState(), m = ringMetrics(r.ring)
  s.setSite(newSite(r.ring, 'geojson', `GeoJSON ${name.slice(0, 60)}${r.name ? ` (${r.name.slice(0, 40)})` : ''}, ${r.crs} → EPSG:26910`, { label: r.name }))
  s.set({ tool: null, message: { text: [`Boundary imported: ${Math.round(m.area).toLocaleString('en-CA')} m². ${r.provenance.operation} ${r.provenance.accuracy}`, ...r.notes].join(' '), kind: 'info' } })
  return m.centre
}
