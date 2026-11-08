// The study site's parcels and area (after Vista v34 import-parcels.js, Ruijie Liu): loads the City parcel layer
// once (public/data/parcels.bin + parcels.json, OGL-Vancouver, 2026-10-27 snapshot), matches it under the site with
// engine/site.ts, and says which area FSR should use, with its source and flag. Also hands the boundary and the
// matched parcels to the tower tools (lib/siteGeometry.ts: confirm-before-placing and edge snapping read them).
import { dataFetch } from './loadProgress'
import { useEffect, useMemo, useState } from 'react'
import type { Flag } from '../engine/types'
import { matchParcels, ringMetrics, validateRing, type ParcelMatch, type Pt } from '../engine/site'
import { decodeFootprints, type Footprint } from './cityLayers'
import { parcelRow, type ParcelAttrs } from './contextLayers'
import { setSiteBoundary, setSiteParcels } from './siteGeometry'
import { adoptLegacySite, useSiteStore, type StudySite } from './siteStore'
import { whenRestored } from './project/session'

export interface ParcelLayer { polys: Footprint[]; attrs: ParcelAttrs; sha: string | null }
let cache: Promise<ParcelLayer> | null = null
export function loadParcelLayer(): Promise<ParcelLayer> {
  cache ??= (async () => {
    const get = async (f: string) => { const r = await dataFetch(f, f.startsWith('layers') ? 'the list of layers' : 'lots'); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r }
    const [b, j, m] = await Promise.all([get('parcels.bin').then((r) => r.arrayBuffer()), get('parcels.json').then((r) => r.json()), get('layers.json').then((r) => r.json()).catch(() => null)])
    const entry = (m as { layers?: { id: string; sha256?: string }[] } | null)?.layers?.find((l) => l.id === 'parcels')
    return { polys: decodeFootprints(b), attrs: j as ParcelAttrs, sha: entry?.sha256 ?? null }
  })()
  cache.catch(() => { cache = null })
  return cache
}

export function useParcelLayer(on = true) {
  const [s, setS] = useState<{ layer: ParcelLayer | null; error: string | null }>({ layer: null, error: null })
  useEffect(() => {
    if (!on) return
    let live = true
    loadParcelLayer().then((layer) => live && setS({ layer, error: null }), (e: Error) => live && setS({ layer: null, error: e.message }))
    return () => { live = false }
  }, [on])
  return s
}

export const PARCEL_SOURCE = 'City of Vancouver, Property parcel polygons (OGL-Vancouver, retrieved 2026-10-27), joined exactly along shared lot lines'

export interface SiteArea {
  /** Area FSR should divide by (m²), its basis, source and flag. */
  area: number
  basis: 'parcels' | 'boundary'
  source: string
  flag: Flag
  boundaryArea: number
  parcelArea: number | null
}

/** What the site's boundary area rests on, by how it was made. */
export function boundarySource(site: StudySite): { source: string; flag: Flag } {
  switch (site.source) {
    case 'drawn': return { source: 'Study boundary drawn on the plan (not a legal parcel)', flag: 'team_assumption' }
    case 'buildings': return { source: `${site.note} City footprint outlines, not lot lines`, flag: 'unverified' }
    case 'parcels': return { source: 'One City parcel outline (Property parcel polygons, OGL-Vancouver, retrieved 2026-10-27)', flag: 'unverified' }
    case 'geojson': return { source: `${site.note} (imported boundary; legal status not verified)`, flag: 'unverified' }
  }
}

/** Parcels under the site and the area FSR uses. Parcel choices made against another parcel-layer version are ignored (said). */
export function useSiteAnalysis(): { site: StudySite | null; match: ParcelMatch | null; area: SiteArea | null; layer: ParcelLayer | null; error: string | null; staleChoices: boolean } {
  const site = useSiteStore((s) => s.site)
  useEffect(() => { void adoptLegacySite(whenRestored()) }, [])
  const { layer, error } = useParcelLayer(!!site)
  const staleChoices = !!(site && layer?.sha && site.parcelLayer && site.parcelLayer !== layer.sha)
  const match = useMemo(() => {
    if (!site || !layer || validateRing(site.ring)) return null
    try { return matchParcels(site.ring, layer.polys, staleChoices ? [] : site.parcelsAdd, staleChoices ? [] : site.parcelsSkip) } catch { return null }
  }, [site, layer, staleChoices])
  const area = useMemo((): SiteArea | null => {
    if (!site || validateRing(site.ring)) return null
    const boundaryArea = ringMetrics(site.ring).area
    const parcelArea = match?.join.status === 'joined' ? match.join.area : null
    if (parcelArea !== null && site.areaBasis === 'parcels') return { area: parcelArea, basis: 'parcels', source: PARCEL_SOURCE, flag: 'unverified', boundaryArea, parcelArea }
    const b = boundarySource(site)
    return { area: boundaryArea, basis: 'boundary', source: b.source, flag: b.flag, boundaryArea, parcelArea }
  }, [site, match])
  // FSR in Real Vancouver divides by this (useResults reads it from the site store).
  useEffect(() => {
    const cur = useSiteStore.getState().fsrArea
    const next = area ? { area: area.area, basis: area.basis, source: area.source, flag: area.flag } : null
    if (JSON.stringify(cur) !== JSON.stringify(next)) useSiteStore.getState().set({ fsrArea: next })
  }, [area])
  // The tower tools read the site and parcels from lib/siteGeometry (their hook for this session).
  useEffect(() => {
    if (!site || validateRing(site.ring)) { setSiteBoundary('city', null); setSiteParcels('city', null); return }
    const b = boundarySource(site)
    setSiteBoundary('city', { ring: site.ring, label: site.label ? `Study site at ${site.label}` : site.source === 'drawn' ? 'Drawn study boundary' : site.note, flag: b.flag, source: b.source })
    setSiteParcels('city', match && layer ? match.included.map((i) => layer.polys[i].outer as Pt[]) : null)
  }, [site, match, layer])
  return { site, match, area, layer, error, staleChoices }
}

export const parcelLabel = (layer: ParcelLayer, i: number) => parcelRow(layer.attrs, i).address || `Parcel ${i + 1}`
