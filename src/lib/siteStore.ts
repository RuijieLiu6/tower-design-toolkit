// Real Vancouver study site (after Vista v34 step 1, Ruijie Liu): the boundary, how it was made, the existing
// buildings it replaces, parcel choices, and the drawing / picking tools. The site is kept in this browser
// (localStorage `ts.citySite`, wrapped: storage may be blocked) until it joins the project file.
import { create } from 'zustand'
import type { Pt } from '../engine/site'

export type SiteSource = 'drawn' | 'buildings' | 'parcels' | 'geojson'

export interface StudySite {
  /** Local frame (EPSG:26910 minus the City origin), open ring, counter-clockwise. */
  ring: Pt[]
  source: SiteSource
  /** How it was made, in words (shown and exported). */
  note: string
  /** Address or place it was placed from, if any. */
  label: string | null
  /** City footprint ids the design replaces (Vista "replace existing buildings"). */
  replaced: number[]
  /** Keep the replaced buildings standing instead of showing them as demolished. */
  keepReplaced: boolean
  /** Parcel choices by index into the parcel layer named by `parcelLayer` (its sha256): partial parcels added, inside ones left out. */
  parcelsAdd: number[]
  parcelsSkip: number[]
  parcelLayer: string | null
  /** Area for FSR: the parcels when they join exactly (default), or the boundary. */
  areaBasis: 'parcels' | 'boundary'
}

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
  set: (patch: Partial<Omit<SiteState, 'set' | 'setSite'>>) => void
  setSite: (site: StudySite | null) => void
}

const KEY = 'ts.citySite'
const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))
function load(): StudySite | null {
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
function save(site: StudySite | null) {
  try { if (site) localStorage.setItem(KEY, JSON.stringify(site)); else localStorage.removeItem(KEY) } catch { /* storage blocked: session only */ }
}

export const useSiteStore = create<SiteState>((set) => ({
  site: load(), tool: null, draft: [], hover: null, picked: [], marker: null, pending: null, message: null,
  set: (patch) => set(patch),
  setSite: (site) => { set({ site }); save(site) },
}))

export const newSite = (ring: Pt[], source: SiteSource, note: string, extra: Partial<StudySite> = {}): StudySite => ({
  ring, source, note, label: null, replaced: [], keepReplaced: false, parcelsAdd: [], parcelsSkip: [], parcelLayer: null, areaBasis: 'parcels', ...extra,
})
