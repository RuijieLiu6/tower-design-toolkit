// Height limits and a height suggestion at any location in Real Vancouver, combined by source (Ruijie Liu's choice,
// 3 Nov 2026), after Vista v37 (Ruijie Liu, github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e):
//   - Zoning: the basic district-schedule height (engine/heightPolicy.ts, Vista's height_policy.json; unverified).
//   - View cones, two kinds, never mixed up:
//       estimate  the 8 cones with CONE_PARAMS: the City-sourced lower boundary Z = Lv + k·D, with ±U95 and its flag.
//       study     the other 16: Vista's Imagine default study surface (explorer/viewcone-ui.js planeInput, city mode):
//                 a plane from the modelled observer eye (terrain at the cone origin + 1.6 m) rising or falling to
//                 120 m at one fixed downtown reference, Vista's model (0, 0) = 49.2827 N, 123.1207 W. Rebuilt here on
//                 the Real Vancouver terrain (CGVD28); the 120 m is read as CGVD28. A TEAM / STUDY ASSUMPTION, not a
//                 City ceiling.
//   - Suggestion: the lowest of the zoning height and every covering cone's surface minus the ground and Vista's
//     0.1 m clearance, naming what controls it. Without a zoning number it is partial (cones only), never complete.
//   - Stack: Vista's stacked-block suggestion (explorer/view-height-suggestion.js): scale every block of a tower
//     together until each block top clears the lowest surface over that block's own footprint (exact: a plane's
//     minimum over a clipped polygon is at a vertex), keeping each block at least 1 m tall.
// Points and rings here are EPSG:26910 (absolute) unless named local; heights are geodetic (CGVD28 assumed) unless
// named "above ground".
import { CONES, CONE_PARAMS, bisector, pointInRing, type Cone } from './viewCones'
import { readRule, type HeightPolicy, type ZoningResult } from './heightPolicy'
import { overlapPieces, vistaToCity, type Pt } from './vista'
import type { Flag } from './types'

/** Vista's Imagine defaults (imagine-city.js S.studyHeightM, explorer.js state.eyeH, imagine-city-engine.js clearance). */
export const STUDY = { heightAtReferenceM: 120, eyeHeightM: 1.6, clearanceM: 0.1, minPartHeightM: 1 } as const
/** Vista's downtown reference: its model origin (0, 0), as EPSG:26910. */
export const VISTA_REFERENCE: Pt = vistaToCity([0, 0])

/** z(x, y) = z0 + a·(x − x0) + b·(y − y0), relative to a point near the cone so absolute UTM numbers stay exact. */
export interface Plane3 { x0: number; y0: number; z0: number; a: number; b: number }
export const planeZ = (p: Plane3, q: Pt) => p.z0 + p.a * (q[0] - p.x0) + p.b * (q[1] - p.y0)

export type SurfaceKind = 'estimate' | 'study'
export interface ConeSurface {
  cone: Cone
  kind: SurfaceKind
  plane: Plane3
  flag: Flag
  /** ±95% band (m), estimates only. */
  u95: number | null
  /** One line for the readout. */
  label: string
  source: string
  /** Study surfaces: the eye elevation used and what the plane runs to. */
  eye?: number | null
  referenceName?: string
  /** Study surfaces: modelled eye minus the City's viewpoint elevation Lv (m); large where the City's viewpoint is on a deck or platform. */
  eyeMinusLv?: number | null
}

/** The City-sourced estimate as a plane, or null for a cone without CONE_PARAMS. */
export function estimateSurface(cone: Cone): ConeSurface | null {
  const prm = CONE_PARAMS[cone.id]
  if (!prm) return null
  const O = cone.ring[0], u = bisector(cone)
  return {
    cone, kind: 'estimate', plane: { x0: O[0], y0: O[1], z0: cone.Lv, a: prm.k * u[0], b: prm.k * u[1] }, flag: prm.flag, u95: prm.u95,
    label: `City-sourced estimate, Z = Lv + k·D (k ${prm.k}, ±${prm.u95} m)`, source: prm.source,
  }
}

/**
 * Vista's Imagine default study surface for one cone (viewcone-ui.js planeInput with options.city): from the eye at
 * the origin to `height` at the reference; the distant-edge centroid stands in when the reference is within 1 m of the
 * origin; a flat ceiling at `height` when the ground at the origin is unknown.
 */
export function studySurface(cone: Cone, groundAtOrigin: number | null, opts: { heightM?: number; reference?: Pt } = {}): ConeSurface {
  const height = opts.heightM ?? STUDY.heightAtReferenceM, O = cone.ring[0]
  const base = { cone, kind: 'study' as const, flag: 'team_assumption' as Flag, u95: null }
  if (groundAtOrigin === null || !Number.isFinite(groundAtOrigin)) {
    return { ...base, plane: { x0: O[0], y0: O[1], z0: height, a: 0, b: 0 }, eye: null, referenceName: 'flat surface',
      label: `Study surface: flat ${height} m (no terrain at the origin); not a City ceiling`,
      source: `Vista v37 fallback: an adjustable flat study ceiling at ${height} m because the modelled observer elevation is unavailable. Not City height geometry.` }
  }
  const eye = groundAtOrigin + STUDY.eyeHeightM
  let ref = opts.reference ?? VISTA_REFERENCE, referenceName = 'downtown reference'
  if (Math.hypot(ref[0] - O[0], ref[1] - O[1]) < 1) {
    const d = cone.ring.map((q) => Math.hypot(q[0] - O[0], q[1] - O[1])), far = cone.ring.filter((_, i) => d[i] >= Math.max(...d) * 0.75)
    ref = [far.reduce((s, q) => s + q[0], 0) / far.length, far.reduce((s, q) => s + q[1], 0) / far.length]
    referenceName = 'distant edge'
  }
  const dx = ref[0] - O[0], dy = ref[1] - O[1], d2 = dx * dx + dy * dy
  const eyeMinusLv = eye - cone.Lv
  const gap = Math.abs(eyeMinusLv) >= 2 ? ` The modelled eye is ${Math.abs(eyeMinusLv).toFixed(1)} m ${eyeMinusLv < 0 ? 'below' : 'above'} the City's viewpoint elevation (Lv ${cone.Lv} m): Vista's default stands on the terrain, and decks, piers and platforms are not modelled.` : ''
  return {
    ...base, plane: { x0: O[0], y0: O[1], z0: eye, a: ((height - eye) * dx) / d2, b: ((height - eye) * dy) / d2 }, eye, referenceName, eyeMinusLv,
    label: `Study surface (Vista Imagine default): eye ${eye.toFixed(1)} m → ${height} m at the ${referenceName}; not a City ceiling`,
    source: `Vista v37 Imagine default (viewcone-ui.js): a plane from the modelled observer eye (terrain at the origin + ${STUDY.eyeHeightM} m = ${eye.toFixed(1)} m) to ${height} m at the ${referenceName === 'downtown reference' ? "downtown reference (Vista's model origin, 49.2827 N 123.1207 W)" : 'centroid of the far edge of the cone'}. Rebuilt on the Real Vancouver terrain (CGVD28); terrain and eye are approximate. A team/study assumption, not City height geometry.${gap}`,
  }
}

/** All 24 cones: the estimate where one exists (8), else Vista's study surface (16). `groundAt` takes EPSG:26910. */
export function coneSurfaces(groundAt: (p: Pt) => number | null, opts: { heightM?: number; reference?: Pt } = {}): ConeSurface[] {
  return CONES.map((c) => estimateSurface(c) ?? studySurface(c, groundAt(c.ring[0]), opts))
}

interface Bounds { x0: number; y0: number; x1: number; y1: number }
const boundsOf = (ring: Pt[]): Bounds => ({ x0: Math.min(...ring.map((p) => p[0])), y0: Math.min(...ring.map((p) => p[1])), x1: Math.max(...ring.map((p) => p[0])), y1: Math.max(...ring.map((p) => p[1])) })
const boundsCache = new WeakMap<Cone, Bounds>()
const coneBounds = (c: Cone) => { let b = boundsCache.get(c); if (!b) { b = boundsOf(c.ring); boundsCache.set(c, b) } return b }

export interface SurfaceHit { surface: ConeSurface; z: number }

/**
 * A study surface that runs below the viewer's eye here: Vista's one fixed downtown reference lies behind this view
 * (K Drake Street falls to −102 m across its wedge), so the plane descends from the eye. An artefact of the construction.
 */
export const descendsBelowEye = (h: SurfaceHit) => h.surface.kind === 'study' && h.surface.eye != null && h.z < h.surface.eye - 0.5
export const DESCENDS_NOTE = "This study surface runs below the viewer's eye here: Vista's fixed downtown reference lies behind this view, so the plane slopes down from the eye. Read it as an artefact of the construction, not a limit."
/** Every surface whose cone covers the point (EPSG:26910), lowest first. */
export function surfacesAt(p: Pt, surfaces: ConeSurface[]): SurfaceHit[] {
  const out: SurfaceHit[] = []
  for (const s of surfaces) {
    const b = coneBounds(s.cone)
    if (p[0] < b.x0 || p[0] > b.x1 || p[1] < b.y0 || p[1] > b.y1 || !pointInRing(p, s.cone.ring)) continue
    out.push({ surface: s, z: planeZ(s.plane, p) })
  }
  return out.sort((a, b) => a.z - b.z)
}

// ---------------------------------------------------------------- the suggestion at a point or footprint
export type Controller = { kind: 'zoning'; rule: string; flag: Flag; label: string } | { kind: SurfaceKind; surface: ConeSurface; flag: Flag; label: string }
export type SuggestionStatus = 'ready' | 'partial' | 'none'
export interface Suggestion {
  /** ready: zoning has a number (and every covering cone a surface); partial: cones only, zoning has no number; none. */
  status: SuggestionStatus
  /** Height above the ground (m). On partial, the lowest KNOWN limit only. */
  heightM: number | null
  controlling: Controller | null
  ground: number | null
  zoning: ZoningResult | null
  cones: SurfaceHit[]
  /** Lowest cone surface minus the ground and the clearance (m above ground), when a cone covers. */
  coneHeightM: number | null
  notes: string[]
}

/** Combine one zoning result with the cone surfaces over a point or footprint (its lowest point: `hits`). */
export function combine(zoning: ZoningResult | null, hits: SurfaceHit[], ground: number | null, policy: Pick<HeightPolicy, 'rules'> | null): Suggestion {
  const notes: string[] = []
  const low = hits[0] ?? null
  const coneHeightM = low && ground !== null ? low.z - ground - STUDY.clearanceM : null
  const zoningH = zoning?.status === 'ready' ? zoning.heightM : null
  if (low && ground === null) notes.push('No terrain under this point: the cone limit cannot be turned into a height above the ground.')
  if (low?.surface.kind === 'study') notes.push(`The lowest cone (${low.surface.cone.id}) uses a study surface: a team assumption, not a City ceiling.`)
  if (low && descendsBelowEye(low)) notes.push(DESCENDS_NOTE)
  if (low?.surface.kind === 'estimate' && low.surface.u95) notes.push(`${low.surface.cone.id} is an estimate ±${low.surface.u95} m; the City View Cone Assessment governs.`)
  const coneCtl = (h: SurfaceHit): Controller => ({ kind: h.surface.kind, surface: h.surface, flag: h.surface.flag, label: `${h.surface.cone.id} ${h.surface.cone.name} (${h.surface.kind === 'estimate' ? 'City-sourced estimate' : 'study surface, assumption'})` })
  const zoneCtl = (): Controller => {
    const r = policy && zoning?.controlling ? readRule(policy, zoning.controlling) : null
    return { kind: 'zoning', rule: zoning?.controlling ?? '', flag: r?.flag ?? 'unverified', label: r?.label ?? `${zoningH} m basic zoning height` }
  }
  if (zoningH !== null) {
    if (coneHeightM !== null && coneHeightM < zoningH) return { status: 'ready', heightM: Math.max(0, coneHeightM), controlling: coneCtl(low as SurfaceHit), ground, zoning, cones: hits, coneHeightM, notes }
    return { status: 'ready', heightM: zoningH, controlling: zoneCtl(), ground, zoning, cones: hits, coneHeightM, notes }
  }
  if (zoning && zoning.status !== 'no_site') notes.push(zoning.status === 'partial' ? 'Some of the zoning here has no number, so no complete suggestion.' : 'No zoning number here (DD, CD-1 or a schedule not transcribed): the suggestion is incomplete, never a guessed height.')
  if (coneHeightM !== null) return { status: 'partial', heightM: Math.max(0, coneHeightM), controlling: coneCtl(low as SurfaceHit), ground, zoning, cones: hits, coneHeightM, notes }
  return { status: 'none', heightM: null, controlling: null, ground, zoning, cones: hits, coneHeightM, notes }
}

/** The suggestion at one point (EPSG:26910); the policy works in the local frame (`origin` subtracted). */
export function suggestAt(p: Pt, opts: { policy: HeightPolicy | null; surfaces: ConeSurface[]; ground: number | null; origin: Pt }): Suggestion {
  const zoning = opts.policy ? opts.policy.atPoint([p[0] - opts.origin[0], p[1] - opts.origin[1]]) : null
  return combine(zoning, surfacesAt(p, opts.surfaces), opts.ground, opts.policy)
}

/** Lowest point of each covering surface over a convex footprint (EPSG:26910), exact, lowest first. */
export function surfacesOver(ring: Pt[], surfaces: ConeSurface[]): (SurfaceHit & { at: Pt })[] {
  const out: (SurfaceHit & { at: Pt })[] = []
  const fb = boundsOf(ring)
  for (const s of surfaces) {
    const b = coneBounds(s.cone)
    if (fb.x1 < b.x0 || fb.x0 > b.x1 || fb.y1 < b.y0 || fb.y0 > b.y1) continue
    const pieces = overlapPieces(s.cone.ring, ring)
    if (!pieces?.length) continue
    let z = Infinity, at: Pt = ring[0]
    for (const piece of pieces) for (const q of piece) { const v = planeZ(s.plane, q); if (v < z) { z = v; at = q } }
    if (Number.isFinite(z)) out.push({ surface: s, z, at })
  }
  return out.sort((a, b) => a.z - b.z)
}

// ---------------------------------------------------------------- Vista's stacked-block suggestion for a tower
export interface StackPart { ring: Pt[]; z0: number; z1: number; label: string }
export type StackStatus = 'ready' | 'partial' | 'none' | 'no_positive_height' | 'unsupported'
export interface StackSuggestion {
  status: StackStatus
  /** The tallest whole-stack height that clears every surface (and the zoning number), m above the base. */
  maxHeightM: number | null
  currentHeightM: number
  /** max / current; Adjust applies min(1, scale) to every block height. */
  scale: number | null
  intrusion: boolean
  controlling: Controller | null
  controlPart: string | null
  controlPoint: [number, number, number] | null
  covered: string[]
  zoning: ZoningResult | null
  notes: string[]
}

/** Scale every block together so each block top clears the lowest surface over its own footprint (Vista view-height-1). */
export function stackSuggestion(parts: StackPart[], base: number, surfaces: ConeSurface[], zoning: ZoningResult | null, policy: Pick<HeightPolicy, 'rules'> | null, opts: { imported?: boolean } = {}): StackSuggestion {
  const total = parts.reduce((m, p) => Math.max(m, p.z1), 0)
  const out: StackSuggestion = { status: 'none', maxHeightM: null, currentHeightM: total, scale: null, intrusion: false, controlling: null, controlPart: null, controlPoint: null, covered: [], zoning, notes: [] }
  if (opts.imported) { out.status = 'unsupported'; out.notes.push('An uploaded model cannot be height-scaled block by block (Vista: imported models are not scaled). Edit it in Rhino, or read the limits below.'); return out }
  if (!parts.length || total <= 0) return out
  let bound = Infinity
  const covered = new Set<string>()
  for (const part of parts) {
    const ratio = part.z1 / total
    for (const hit of surfacesOver(part.ring, surfaces)) {
      covered.add(hit.surface.cone.id)
      const h = (hit.z - base - STUDY.clearanceM) / ratio
      if (h < bound) { bound = h; out.controlling = { kind: hit.surface.kind, surface: hit.surface, flag: hit.surface.flag, label: `${hit.surface.cone.id} ${hit.surface.cone.name} (${hit.surface.kind === 'estimate' ? 'City-sourced estimate' : 'study surface, assumption'})` }; out.controlPart = part.label; out.controlPoint = [hit.at[0], hit.at[1], hit.z] }
    }
  }
  out.covered = [...covered].sort()
  const zoningH = zoning?.status === 'ready' ? zoning.heightM : null
  if (zoningH !== null && zoningH < bound) {
    bound = zoningH
    const r = policy && zoning?.controlling ? readRule(policy, zoning.controlling) : null
    out.controlling = { kind: 'zoning', rule: zoning?.controlling ?? '', flag: r?.flag ?? 'unverified', label: r?.label ?? `${zoningH} m basic zoning height` }
    out.controlPart = 'whole tower'; out.controlPoint = null
  }
  if (!Number.isFinite(bound)) {
    out.notes.push(zoning && zoning.status !== 'no_site' ? 'No cone covers the tower and the zoning has no number here: nothing to suggest.' : 'No cone covers the tower.')
    return out
  }
  if (bound <= 0 || parts.some((p) => ((p.z1 - p.z0) / total) * bound < STUDY.minPartHeightM - 1e-9)) {
    out.status = 'no_positive_height'
    out.notes.push('The lowest surface leaves no block at least 1 m tall: the stack cannot be scaled to clear it.')
    return out
  }
  out.status = zoningH !== null ? 'ready' : 'partial'
  if (out.status === 'partial') out.notes.push('No zoning number here: the suggestion clears the cones only.')
  if (out.controlling && out.controlling.kind === 'study') out.notes.push('Controlled by a study surface (Vista Imagine default): a team assumption, not a City ceiling.')
  if (out.controlling && out.controlling.kind === 'study' && out.controlPoint && descendsBelowEye({ surface: out.controlling.surface, z: out.controlPoint[2] })) out.notes.push(DESCENDS_NOTE)
  out.maxHeightM = bound
  out.scale = bound / total
  out.intrusion = total > bound + 1e-6
  return out
}
