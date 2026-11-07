// The streets around the Real Vancouver study site, for the public realm checks and the Streets list (7 Nov). Loads the
// City street centrelines (public/data/city_streets.json, the layer the 3D view draws) and the parcel layer once, finds
// the streets along the site (engine/siteStreets.ts) once per site outline, and keeps the answer in a small store that
// useResults reads. The user's per-street settings live in the study site itself (saved and undone with the design).
import { useEffect } from 'react'
import { create } from 'zustand'
import { validateRing, type Pt, type StudySite } from '../engine/site'
import { DEFAULT_CITY_LINK, siteStreets, type CityLinkInput, type SiteStreetsResult, type StreetLineLike, type StreetSetting } from '../engine/siteStreets'
import type { CityStreetsCtx } from '../engine/publicRealm'
import { useStore } from '../store'
import { loadParcelLayer } from './siteParcels'

export const STREETS_SOURCE = 'City of Vancouver street and lane centrelines (OGL-Vancouver) for the names; right-of-way measured by the Toolkit across the street to the facing City parcels (Property parcel polygons, OGL-Vancouver, 2026-10-27)'

let linesP: Promise<StreetLineLike[]> | null = null
export function loadStreetLines(): Promise<StreetLineLike[]> {
  linesP ??= (async () => {
    const r = await fetch('./data/city_streets.json')
    if (!r.ok) throw new Error(`city_streets.json: HTTP ${r.status}`)
    const d = await r.json() as { version: number; origin: number[]; lines: StreetLineLike[] }
    if (d.version !== 1 || d.origin?.[0] !== 491300 || d.origin?.[1] !== 5458600) throw new Error('city_streets.json: unsupported frame')
    return d.lines.filter((l) => l.points.length >= 2)
  })()
  linesP.catch(() => { linesP = null })
  return linesP
}

interface StreetsState { ringKey: string | null; result: SiteStreetsResult | null; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null }
export const useSiteStreetsStore = create<StreetsState>(() => ({ ringKey: null, result: null, status: 'idle', error: null }))

const ringKey = (ring: Pt[] | null) => (ring ? ring.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';') : null)

/** Find the streets for this outline (once; later calls with the same outline do nothing). */
export function requestSiteStreets(ring: Pt[] | null) {
  const key = ringKey(ring)
  const st = useSiteStreetsStore.getState()
  if (key === st.ringKey && st.status !== 'error') return
  if (!ring || !key) { useSiteStreetsStore.setState({ ringKey: null, result: null, status: 'idle', error: null }); return }
  useSiteStreetsStore.setState({ ringKey: key, result: null, status: 'loading', error: null })
  Promise.all([loadStreetLines(), loadParcelLayer()]).then(([lines, layer]) => {
    if (useSiteStreetsStore.getState().ringKey !== key) return
    useSiteStreetsStore.setState({ result: siteStreets(ring, lines, layer.polys), status: 'ready' })
  }, (e: Error) => {
    if (useSiteStreetsStore.getState().ringKey === key) useSiteStreetsStore.setState({ status: 'error', error: e.message })
  })
}

const validSiteRing = (site: StudySite | null) => (site && !validateRing(site.ring) ? (site.ring as Pt[]) : null)

/** The streets of the open Real Vancouver site (loads them when needed); `anyProject` also while the competition is open (Sources page). */
export function useSiteStreets(anyProject = false): StreetsState {
  const ring = useStore((s) => (anyProject || s.project === 'city' ? validSiteRing(s.citySite) : null))
  useEffect(() => { requestSiteStreets(ring) }, [ring])
  const st = useSiteStreetsStore()
  // Until the request for a new outline has run, the store still holds the old outline's streets: never show those.
  return st.ringKey === ringKey(ring) ? st : { ...st, result: null, status: ring ? 'loading' : 'idle' }
}

/** What the Real Vancouver public realm checks read: the streets (once found) and the settings kept in the site. */
export function streetsCtx(site: StudySite | null, result: SiteStreetsResult | null): CityStreetsCtx | null {
  if (!site || !result) return null
  return { streets: result.streets, settings: site.streets ?? {}, link: site.link ?? null, station: site.station ?? null }
}

// ---------- editing the settings (each edit is one undoable change to the study site) ----------
function patchSite(patch: Partial<StudySite>) {
  const s = useStore.getState()
  if (!s.citySite) return
  s.set({ citySite: { ...s.citySite, ...patch } })
}
export function setStreetSetting(key: string, patch: Partial<StreetSetting>) {
  const site = useStore.getState().citySite
  if (!site) return
  const cur = site.streets?.[key] ?? { type: null }
  patchSite({ streets: { ...(site.streets ?? {}), [key]: { ...cur, ...patch } } })
}
/** Changing a street's type resets its frontage inputs to that type's starting values. */
export function setStreetType(key: string, type: StreetSetting['type']) {
  const site = useStore.getState().citySite
  if (!site) return
  patchSite({ streets: { ...(site.streets ?? {}), [key]: { type } } })
}
export function setCityLink(patch: Partial<CityLinkInput> | null) {
  const site = useStore.getState().citySite
  if (!site) return
  patchSite({ link: patch === null ? undefined : { ...(site.link ?? DEFAULT_CITY_LINK), ...patch } })
}
export function setStation(station: string | null) { patchSite({ station }) }
