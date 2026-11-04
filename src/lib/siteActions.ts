// The Site step's actions on the map (Ruijie, 3 Nov: "if they click on the map they could choose to build the massing
// there or they could replace the existing building or they could select multiple building to replace, and they could
// draw select property line boxes to combine … combine property line … will change the context as well").
//
// Each action changes the project's study site (store.citySite, through lib/siteStore) as ONE undo step and says what
// it did. Lots are City parcels (public/data/parcels.bin, OGL-Vancouver, 2026-10-27 snapshot) combined only with the
// exact union along shared lot lines (engine/site.ts exactUnion, Vista import-parcels.js): never snapped or guessed.
// A site made of lots replaces the existing buildings standing mostly on it (shown as demolished, team assumption).
import { create } from 'zustand'
import { exactUnion, normalizeRing, outlineKey, overlapArea, PARCEL_MIN_M2, polyArea, ringMetrics, signedArea, siteFromFootprints, validateRing, type Poly, type Pt } from '../engine/site'
import { breakStep, undo } from './project/history'
import { newSite, useSiteStore, type StudySite } from './siteStore'

export interface Outline { id?: number; outer: readonly (readonly [number, number])[] | Pt[]; holes: readonly (readonly (readonly [number, number])[])[] | Pt[][] }

/** A building counts as standing on the site when at least this share of its footprint lies inside (team preset). */
export const ON_SITE_SHARE = 0.5

// ---------------------------------------------------------------- pure geometry (tested in siteActions.test.ts)

const bboxOf = (ring: readonly (readonly [number, number])[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}
const apart = (a: [number, number, number, number], b: [number, number, number, number]) => a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]
const polyOf = (o: Outline): Poly => [o.outer as Pt[], ...(o.holes as Pt[][])]

/** Indices of footprints standing mostly (≥ ON_SITE_SHARE of their area) inside the ring. */
export function buildingsOn(ring: Pt[], footprints: readonly Outline[], share = ON_SITE_SHARE): number[] {
  if (validateRing(ring)) return []
  const box = bboxOf(ring), out: number[] = []
  footprints.forEach((f, i) => {
    if (f.outer.length < 3 || apart(bboxOf(f.outer), box)) return
    const p = polyOf(f), a = polyArea(p)
    if (a > 0 && overlapArea(ring, p) / a >= share) out.push(i)
  })
  return out
}

/** Unique building ids for footprint indices (a building in several parts shares one id). */
export const idsOf = (footprints: readonly Outline[], indices: readonly number[]): number[] => [...new Set(indices.map((i) => footprints[i]?.id).filter((v): v is number => Number.isInteger(v)))]

export type LotUnion =
  | { ok: true; ring: Pt[]; lots: number[]; area: number; dropped: number[]; pieces: number; duplicates: number }
  | { ok: false; reason: string }

/**
 * One site from City lots: records with the same outline count once (strata, air-space), the lots are joined with the
 * exact union, and the union must be one piece. With `keep`, a union in several pieces (lots on blocks across a street
 * or lane) keeps one piece and lists the lots left out: the piece the given box covers most (a box drawn over lots),
 * or the largest (`true`); otherwise it is refused, said in plain words.
 */
export function unionOfLots(lots: readonly Outline[], indices: readonly number[], keep: Pt[] | boolean = false): LotUnion {
  const uniq = new Map<string, number>()
  for (const i of indices) { const l = lots[i]; if (l && l.outer.length >= 3) { const k = outlineKey(polyOf(l)); if (!uniq.has(k)) uniq.set(k, i) } }
  const unique = [...uniq.values()]
  if (!unique.length) return { ok: false, reason: 'No City lot there.' }
  const merged = exactUnion(unique.map((i) => polyOf(lots[i])))
  if (!merged) return { ok: false, reason: 'These lots do not meet along exactly shared lot lines (a gap or an overlap in the City layer), so they are not combined. Nothing was snapped.' }
  let piece = merged[0]
  if (merged.length > 1) {
    if (!keep) return { ok: false, reason: `These lots do not share a lot line (a street, lane or gap lies between them), so they would make ${merged.length} separate sites. Choose lots on the same block.` }
    const score = (p: Poly) => (Array.isArray(keep) ? overlapArea(keep, p) : 0)
    piece = merged.reduce((a, b) => (score(b) > score(a) + 1e-6 || (Math.abs(score(b) - score(a)) <= 1e-6 && polyArea(b) > polyArea(a)) ? b : a))
  }
  const ring = normalizeRing(piece[0])
  const inPiece = (i: number) => { const p = polyOf(lots[i]), a = polyArea(p); return a > 0 && overlapArea(ring, p) / a > 0.5 }
  const chosen = unique.filter(inPiece)
  const dropped = unique.filter((i) => !inPiece(i))
  return { ok: true, ring, lots: chosen, area: Math.abs(signedArea(ring)), dropped, pieces: merged.length, duplicates: indices.length - unique.length }
}

/** Lots a plan rectangle touches (any overlap of at least 1 m²). */
export function lotsTouching(rect: [number, number, number, number], lots: readonly Outline[]): number[] {
  const [x0, y0, x1, y1] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])]
  const ring: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const out: number[] = []
  lots.forEach((l, i) => {
    if (l.outer.length < 3 || apart(bboxOf(l.outer), [x0, y0, x1, y1])) return
    if (overlapArea(ring, polyOf(l)) >= PARCEL_MIN_M2) out.push(i)
  })
  return out
}

/**
 * The buildings a new site outline replaces: those standing on it, plus any the user replaced by hand outside the old
 * outline (kept: they were chosen one by one). Buildings that stood on the old outline but not on the new one return.
 */
export function replacedFor(next: Pt[], prev: StudySite | null, footprints: readonly Outline[]): number[] {
  const on = idsOf(footprints, buildingsOn(next, footprints))
  if (!prev) return on
  const onPrev = new Set(validateRing(prev.ring) ? [] : idsOf(footprints, buildingsOn(prev.ring, footprints)))
  const byHand = prev.replaced.filter((id) => !onPrev.has(id))
  return [...new Set([...on, ...byHand])]
}

// ---------------------------------------------------------------- the Site step's map state

export interface SiteMenu {
  /** Plan point clicked (local frame) and the ground height there, for anchoring the menu in 3D. */
  at: Pt
  z: number
  /** Footprint index under the click (data.footprints), or null on open ground. */
  building: number | null
  buildingLabel: string | null
  /** City lot under the click (parcel layer index), or null on a street or outside the parcel layer. */
  lot: number | null
  lotLabel: string | null
  /** Where the menu opens from the click (towards the room left in the view) and its height limit (px). */
  place?: Placement
}
/** Which way a card opens from its point on the map, towards the room left in the view. */
export interface Placement { up: boolean; left: boolean; maxH: number }
/** Where an action happened: the plan point, the ground height there, and which way its note opens. */
export interface Where { at: Pt; z: number; place?: Placement }
export interface Toast { id: number; text: string; at: Pt | null; z: number; place?: Placement; undoable: boolean; kind: 'info' | 'error' }

interface SiteStepState {
  menu: SiteMenu | null
  /** Select several buildings to replace (the clicks go to SiteRig's pick tool; this flag shows the Done bar). */
  multi: boolean
  /** Draw a box over lots: the corners in plan while dragging. */
  box: boolean
  boxDraft: [Pt, Pt] | null
  toast: Toast | null
  /** Neighbourhood picked from the list (its outline is drawn on the map). */
  area: string | null
}
export const useSiteStep = create<SiteStepState>(() => ({ menu: null, multi: false, box: false, boxDraft: null, toast: null, area: null }))

let toastId = 0
/** Say what an action did, near where it happened; also announced to screen readers. */
export function tell(text: string, opts: { at?: Pt | null; z?: number; place?: Placement; undoable?: boolean; kind?: 'info' | 'error' } = {}) {
  useSiteStep.setState({ toast: { id: ++toastId, text, at: opts.at ?? null, z: opts.z ?? 0, place: opts.place, undoable: !!opts.undoable, kind: opts.kind ?? 'info' } })
  useSiteStore.getState().set({ message: { text, kind: opts.kind ?? 'info' } }) // announced once by lib/siteStore
}

/** Undo the last design step (the action just done) and say so. */
export function undoLast() {
  if (undo()) tell('Undone: the site is back as it was.')
}

/** One undo step: the site changes alone, apart from edits just before or after it. */
function commit(site: StudySite | null) {
  breakStep()
  useSiteStore.getState().setSite(site)
  breakStep()
}

const fmtM2 = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Replace existing buildings: with a site, they join its replaced list; without one, their footprints become the site. */
export function replaceBuildings(indices: number[], footprints: readonly Outline[], where?: Where, label?: string): boolean {
  const ids = idsOf(footprints, indices)
  if (!ids.length) { tell('No building to replace there.', { kind: 'error', ...where }); return false }
  const site = useSiteStore.getState().site
  const what = label ?? plural(ids.length, 'building')
  if (site && !validateRing(site.ring)) {
    const fresh = ids.filter((id) => !site.replaced.includes(id))
    if (!fresh.length) { tell(`${what[0].toUpperCase()}${what.slice(1)} ${ids.length === 1 ? 'is' : 'are'} already replaced.`, where); return false }
    const outside = indices.filter((i) => { const p = polyOf(footprints[i]), a = polyArea(p); return a > 0 && overlapArea(site.ring, p) / a < ON_SITE_SHARE }).length
    commit({ ...site, replaced: [...site.replaced, ...fresh], keepReplaced: false })
    tell(`Replaced ${what}: shown as demolished${outside ? ` (${outside === 1 ? 'it stands' : `${outside} stand`} outside the study site)` : ''}. A hypothetical removal (team assumption).`, { undoable: true, ...where })
    return true
  }
  const r = siteFromFootprints(indices.map((i) => ({ outer: footprints[i].outer as Pt[], holes: footprints[i].holes as Pt[][] })))
  if (!r) { tell('That building has no usable outline.', { kind: 'error', ...where }); return false }
  commit(newSite(r.ring, 'buildings', `${plural(ids.length, 'existing building')} replaced as the site: ${r.note}`, { replaced: ids }))
  tell(`Site set to ${what} (${fmtM2(ringMetrics(r.ring).area)}), shown as demolished. ${r.method === 'hull' ? 'They don\'t share walls, so the site is their convex hull. ' : ''}Use a lot for lot lines.`, { undoable: true, ...where })
  return true
}

export interface LotLayer { polys: readonly Outline[]; sha: string | null; label: (i: number) => string }

/** Make the site from lots (one undo step); the buildings standing on it are replaced. */
export function siteFromLots(indices: number[], layer: LotLayer, footprints: readonly Outline[], how: 'use' | 'add' | 'remove' | 'box', where?: Where, box?: Pt[]): boolean {
  const prev = useSiteStore.getState().site
  if (how === 'remove' && !indices.length) { commit(null); tell('Last lot removed: no study site now.', { undoable: true, ...where }); return true }
  const u = unionOfLots(layer.polys, indices, how === 'box' ? box ?? true : false)
  if (!u.ok) { tell(u.reason, { kind: 'error', ...where }); return false }
  const replaced = replacedFor(u.ring, prev, footprints)
  const names = u.lots.slice(0, 3).map(layer.label).join('; ') + (u.lots.length > 3 ? `; +${u.lots.length - 3} more` : '')
  const note = u.lots.length === 1 ? `City parcel at ${layer.label(u.lots[0])}` : `${u.lots.length} City parcels joined along shared lot lines (exact): ${names}`
  commit(newSite(u.ring, 'parcels', note, { label: u.lots.length === 1 ? layer.label(u.lots[0]) : `${layer.label(u.lots[0])} + ${plural(u.lots.length - 1, 'lot')}`, parcelLayer: layer.sha, replaced, keepReplaced: false, parcelsAdd: [...u.lots] }))
  const lead = how === 'add' ? 'Lot added' : how === 'remove' ? 'Lot removed' : how === 'box' ? `${plural(u.lots.length, 'lot')} selected by the box` : 'Site set to the lot'
  const tail = [
    `site ${fmtM2(u.area)} from ${plural(u.lots.length, 'lot')}`,
    replaced.length ? `${plural(replaced.length, 'building')} on it shown as demolished` : 'no building stands on it',
    u.dropped.length ? `${plural(u.dropped.length, 'lot')} across a street or lane left out (a site is one piece; the block the box covers most is kept)` : '',
    u.duplicates ? `${u.duplicates} repeated strata or air-space record${u.duplicates === 1 ? '' : 's'} counted once` : '',
  ].filter(Boolean).join('; ')
  tell(`${lead}: ${tail}. City parcels, a dated snapshot, not a survey.`, { undoable: true, ...where })
  return true
}

/** Lots the current site is made of (its included parcels), from the parcel match. */
export const lotsOfSite = (site: StudySite | null, included: readonly number[] | null | undefined): number[] => (site && site.source === 'parcels' ? [...(included ?? [])] : [])
