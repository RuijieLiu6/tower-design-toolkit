// Real Vancouver study site (after Vista v34 step 1, Ruijie Liu): the boundary, how it was made, the existing
// buildings it replaces, parcel choices, and the drawing / picking tools. The site is the project's `citySite`
// (store.ts, project file and schema by the Rhino interchange session, 4 Nov).
import { create } from 'zustand'
import type { Pt, SiteSource, StudySite } from '../engine/site'
import type { Flag } from '../engine/types'
import { useStore } from '../store'

export type { SiteSource, StudySite }

/** The area FSR divides by in Real Vancouver, published by useSiteAnalysis (lib/siteParcels.ts) for useResults. */
export interface SiteAreaInfo { area: number; basis: 'parcels' | 'boundary'; source: string; flag: Flag }

export type SiteTool = null | 'draw' | 'pick'
export interface Marker { at: Pt; label: string; kind: 'address' | 'street' | 'neighbourhood' | 'coordinate'; source: string }

interface SiteState {
  site: StudySite | null
  tool: SiteTool
  /** Drawing: vertices so far and the point under the cursor (local frame). */
  draft: Pt[]
  hover: Pt | null
  /** Picking: footprint indices chosen so far. */
  picked: number[]
  marker: Marker | null
  /** A place waiting for "Use as study site" to be confirmed. */
  pending: { at: Pt; label: string; source: string } | null
  message: { text: string; kind: 'info' | 'error' } | null
  /** Area for FSR (parcels or boundary) with its source and flag; null without a valid site. */
  fsrArea: SiteAreaInfo | null
  set: (patch: Partial<Omit<SiteState, 'set' | 'setSite'>>) => void
  setSite: (site: StudySite | null) => void
}

/** Where the site lived before it joined the project file (3–4 Nov); read once, then removed. */
const KEY = 'ts.citySite'
const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))
function loadLegacy(): StudySite | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<StudySite>
    if (!Array.isArray(d.ring) || d.ring.length < 3 || !d.ring.every(isPt)) return null
    const ints = (v: unknown) => (Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) as number[] : [])
    return {
      ring: d.ring, source: (['drawn', 'buildings', 'parcels', 'geojson'] as const).includes(d.source as SiteSource) ? d.source as SiteSource : 'drawn',
      note: String(d.note ?? '').slice(0, 400), label: typeof d.label === 'string' ? d.label.slice(0, 160) : null,
      replaced: ints(d.replaced), keepReplaced: d.keepReplaced === true, parcelsAdd: ints(d.parcelsAdd), parcelsSkip: ints(d.parcelsSkip),
      parcelLayer: typeof d.parcelLayer === 'string' ? d.parcelLayer : null, areaBasis: d.areaBasis === 'boundary' ? 'boundary' : 'parcels',
    }
  } catch { return null }
}
// The site itself is the project's `citySite` (saved, autosaved and undone with the design); `site` here mirrors it so
// the site tools read one store. The drawing state (tool, draft, picks, marker, messages) stays out of the project.
export const useSiteStore = create<SiteState>((set) => ({
  site: useStore.getState().citySite, tool: null, draft: [], hover: null, picked: [], marker: null, pending: null, message: null, fsrArea: null,
  set: (patch) => set(patch),
  setSite: (site) => useStore.getState().set({ citySite: site }),
}))
useStore.subscribe((s, prev) => { if (s.citySite !== prev.citySite) useSiteStore.setState({ site: s.citySite }) })
// Each site message is said once, through the app's live region (App.tsx); the panels and the map show it as plain text.
useSiteStore.subscribe((s, prev) => { if (s.message && s.message !== prev.message) useStore.getState().set({ announce: s.message.text }) })

let adopted = false
/**
 * Once per page, after the autosave is restored: a site kept in this browser before it joined the project file moves
 * into the project (unless the project already has one), and the old copy is removed.
 */
export async function adoptLegacySite(restored: Promise<void>): Promise<void> {
  if (adopted) return
  adopted = true
  await restored
  const legacy = loadLegacy()
  if (legacy && !useStore.getState().citySite) useStore.getState().set({ citySite: legacy })
  try { localStorage.removeItem(KEY) } catch { /* storage blocked */ }
}

/** Footprint indices by City id (ids are kept in the site, indices are per data load). */
export function idsToIndices(footprints: readonly { id: number }[], ids: readonly number[]): number[] {
  if (!ids.length) return []
  const want = new Set(ids), out: number[] = []
  footprints.forEach((f, i) => { if (want.has(f.id)) out.push(i) })
  return out
}

/** Indices of the buildings the study site replaces and shows as demolished (none when the user keeps them). */
export function demolishedIndices(footprints: readonly { id: number }[], site: StudySite | null): number[] {
  return site && !site.keepReplaced ? idsToIndices(footprints, site.replaced) : []
}

export const newSite = (ring: Pt[], source: SiteSource, note: string, extra: Partial<StudySite> = {}): StudySite => ({
  ring, source, note, label: null, replaced: [], keepReplaced: false, parcelsAdd: [], parcelsSkip: [], parcelLayer: null, areaBasis: 'parcels', ...extra,
})
