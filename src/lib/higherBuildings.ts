// Higher Buildings: the City's current policy geography as one Planning map item (Milestone A, 9 Nov 2026).
// Data: src/data/higherBuildings.json, digitized from the City's Higher Buildings Policy Review exhibit boards (p.40,
// "Current Higher Buildings Policy Area"), georeferenced to City street centre lines; method and accuracy in the file and
// in 04 Tool Plan/higher-buildings/METHOD.md. Policy status is kept apart from geometry accuracy: an adopted policy with
// an approximate, digitized boundary.
// State: the layer (pinned on the map) and its label are separate settings, remembered in this browser; preview (hover or
// keyboard focus on the item) and selection (the inspector) are transient. None of it touches the site, the towers, the
// camera, the calculations, north or the datum.
import { create } from 'zustand'
import data from '../data/higherBuildings.json'
import { siteRelation, toLocal, type PolicyPart, type RelationResult } from '../engine/policyArea'
import type { Pt } from '../engine/site'

export const HB = data
export const HB_LAYER = data.layers[0]
/** EPSG:26910 origin of the local frame; the same numbers as CITY_ORIGIN in store.ts (a test keeps them equal). */
export const HB_ORIGIN: [number, number] = [491300, 5458600]

export const HB_PARTS: PolicyPart[] = HB_LAYER.parts.map((p) => ({
  id: p.id, label: p.label, sizeClass: p.sizeClass as PolicyPart['sizeClass'], areaM2: p.areaM2, toleranceM: p.toleranceM,
  ring: toLocal(p.ring, HB_ORIGIN),
}))
export const HB_LABEL_AT: Pt = [HB_LAYER.labelAt[0] - HB_ORIGIN[0], HB_LAYER.labelAt[1] - HB_ORIGIN[1]]
/** Places the label may stand, well inside the central core, nearest the core's pole first (the map takes the first that keeps clear of the site's label). */
export const HB_LABEL_SPOTS: Pt[] = HB_LAYER.labelCandidates
  .map((p) => [p[0] - HB_ORIGIN[0], p[1] - HB_ORIGIN[1]] as Pt)
  .sort((a, b) => Math.hypot(a[0] - HB_LABEL_AT[0], a[1] - HB_LABEL_AT[1]) - Math.hypot(b[0] - HB_LABEL_AT[0], b[1] - HB_LABEL_AT[1]))
/** Published policy draws a solid line; review or reference material a dashed one (and says so in words). */
export const HB_DASHED = HB_LAYER.status !== 'published'
export const HB_TOLERANCE = { min: Math.min(...HB_PARTS.map((p) => p.toleranceM)), max: Math.max(...HB_PARTS.map((p) => p.toleranceM)) }

/** "2026-05-14" -> "14 May 2026" (dates in the data are local calendar dates, never shifted by time zone). */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`
}

interface Prefs { shown: boolean; labels: boolean }
const KEY = 'ts.higherBuildings.v1'
export function readPrefs(storage: Pick<Storage, 'getItem'> | null): Prefs {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return { shown: v?.shown === true, labels: v?.labels !== false }
  } catch { return { shown: false, labels: true } }
}
const storage = () => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

interface HbState extends Prefs {
  /** Hover or keyboard focus on the item (dock row, search option, the map label): a brief outline and label. */
  preview: boolean
  /** The map label is under the pointer. */
  hover: boolean
  /** The inspector is open: outline and fill stand out. */
  selected: boolean
  /** The inspector folded to one line (while framing, so the whole area shows). */
  compact: boolean
  /** The view before Frame area, for Back (model frame, as camera requests take it). */
  previous: { position: [number, number, number]; target: [number, number, number]; fov: number } | null
}
export const useHigherBuildings = create<HbState>(() => ({ ...readPrefs(storage()), preview: false, hover: false, selected: false, compact: false, previous: null }))
useHigherBuildings.subscribe((s, p) => {
  if (s.shown !== p.shown || s.labels !== p.labels) try { storage()?.setItem(KEY, JSON.stringify({ shown: s.shown, labels: s.labels })) } catch { /* this session only */ }
})

/** Drawn on the map now: pinned, previewed, hovered or selected. */
export const hbVisible = (s: Pick<HbState, 'shown' | 'preview' | 'hover' | 'selected'>) => s.shown || s.preview || s.hover || s.selected
export const pinLayer = (on: boolean) => useHigherBuildings.setState({ shown: on })
export const showLabels = (on: boolean) => useHigherBuildings.setState({ labels: on })
export const previewHb = (on: boolean) => useHigherBuildings.setState({ preview: on })
export const selectHb = () => useHigherBuildings.setState({ selected: true, compact: false, preview: false })
export const closeHb = () => useHigherBuildings.setState({ selected: false, compact: false })

/** The site's geographic relationship to the current policy area, or null without a valid site. */
export function hbRelation(ring: Pt[] | null | undefined): RelationResult | null {
  if (!ring || ring.length < 3) return null
  try { return siteRelation(ring, HB_PARTS) } catch { return null }
}

/** Search: the Planning entry's note in the address search (no network, no site change). */
export const HB_SEARCH_NOTE = 'Planning layer · City policy area'
/** Words that find the item in search (the Planning group, apart from place names). */
export const matchesHb = (q: string) => {
  const t = q.trim().toLowerCase()
  if (t.length < 3) return false
  return 'higher buildings'.startsWith(t) || /^(tall|tower|polic|planning|hbp)/.test(t) || /higher build|tall build|height polic|building polic/.test(t)
}
