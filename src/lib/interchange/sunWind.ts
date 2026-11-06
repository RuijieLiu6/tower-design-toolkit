// Tower Design Toolkit → Sinnie Choi's Sun & Wind Studio (github.com/xubynii/sun-wind-studio): the massing in that tool's
// own JSON model format, so the selected tower is studied there for sun, shadow, wind, daylight and energy.
// Ruijie (6 Nov 2026): "link the toolkit to sun & wind studio on the branch".
//
// Two ways over, both made in the browser, nothing uploaded:
//   - One click (components/SunWindSend.tsx): the Toolkit opens Sun & Wind Studio and hands the payload over by
//     postMessage. Its receiver (toolkit.js) is on the branch ruijie/tower-toolkit-link until Sinnie merges it.
//   - A file: sunWindFile() is the JSON Sun & Wind Studio's "Your model" import already reads ({meshes: [{layer, role,
//     part, v, f}]}, metres, z up; a file with a top-level `meta` is read as a whole site, so the model file has none).
//     For Real Vancouver, sunWindSiteFile() is a site file (with `meta`) for its Site tab.
//
// Frames. Competition site: both tools centre the block at (0, 0) with its 144.8 m side along x, so the massing is sent
// in place. Real Vancouver: Sun & Wind Studio's site is the competition block, so the buildings around the tower go as a
// site of their own, everything shifted so the tower's massing is centred at (0, 0); the site file's origin is (0, 0) so
// Sun & Wind Studio does not shift the massing again (its importer shifts a model within 400 m of a site's origin).
//
// North. The Toolkit reads true north on the competition model at 45° clockwise from +Y (context.ts, from the model's
// drawn north arrow); Sun & Wind Studio takes +Y as north. The payload carries trueNorthDeg and the receiver says when
// they differ; neither tool is changed here (open question for Sinnie and Ruijie).
import { earClip } from '../coneVolume'
import { buildScene, LAYER } from '../export/scene'
import { towerFloors } from '../../engine/massing'
import type { Tower, UseId } from '../../engine/types'
import type { Footprint, FootprintHeights } from '../cityLayers'

export const SW_PROTOCOL = 'tdt-sunwind@1'
/** Sinnie's live page (served from her main branch). */
export const SW_URL = 'https://xubynii.github.io/sun-wind-studio/'
export const SW_BRANCH = 'ruijie/tower-toolkit-link'
/** Context around a Real Vancouver tower (m from the massing's centre). */
export const SW_CONTEXT_RADIUS = 350

/**
 * Toolkit use → Sun & Wind Studio program (its PROG keys). Team mapping (🟧): civic/cultural and public amenity both go to
 * its "Public facility" (its "amenity" is a sky garden / landscape floor), sky lobbies too; plant to "Plant / refuge".
 */
export const SW_PROGRAM: Record<UseId, string> = {
  retail: 'retail', office: 'office', hotel: 'hotel', residential: 'resi', civic: 'public', amenity: 'public', mechanical: 'mep',
}

export interface SwMesh { layer: string; role: 'massing' | 'context'; part?: 'mass'; v: number[]; f: number[] }
export interface SwStorey { level: number; prog: string; z0: number; z1: number }
export interface SwSite {
  meta: { source: string; units: 'm'; origin: [number, number]; north: '+y'; lat: number; lon: number; tz: number; city: string; toolkit: { project: 'city'; centre: [number, number]; groundElevation: number; radius: number; note: string } }
  site: { polygon: [number, number][]; area: number } | null
  meshes: { layer: 'existing'; v: number[]; f: number[]; top: number; source: string }[]
  future: []; curves: []; labels: []; uses: []
}
export interface SwPayload {
  protocol: typeof SW_PROTOCOL
  from: 'Tower Design Toolkit'
  project: 'vtc' | 'city'
  /** What Sun & Wind Studio shows as the file name. */
  name: string
  rev: number
  units: 'm'
  /** True north, degrees clockwise from +Y of the sent frame. */
  trueNorthDeg: number
  tower: { name: string; height: number; storeys: number; centre: [number, number] }
  /** The selected tower (role massing, one closed solid per storey) and the other design towers (role context). */
  meshes: SwMesh[]
  /** The selected tower's storeys bottom up, with the Sun & Wind Studio program for each. */
  program: SwStorey[]
  /** Real Vancouver only: the buildings around the tower as a Sun & Wind Studio site. */
  site: SwSite | null
  notes: string[]
}

/** A building of the Real Vancouver context, already seated: z0 and z1 above its own ground, metres. */
export interface ContextBuilding { ring: [number, number][]; z0: number; z1: number; source: string }

export interface PayloadOptions {
  project: 'vtc' | 'city'
  selectedId: string
  northDeg: number
  groundElevation: number
  meshOf: (meshId: string) => { positions: ArrayLike<number>; indices: ArrayLike<number> } | undefined
  rev: number
  /** Real Vancouver: buildings near the tower (nearbyBuildings) and the study site boundary, if any (project frame). */
  context?: ContextBuilding[]
  siteRing?: [number, number][] | null
  latLon?: [number, number]
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** A closed solid over any simple ring (concave allowed): bottom down, top up, sides out. Holes are filled. */
export function extrude(ring: [number, number][], z0: number, z1: number): { v: number[]; f: number[] } | null {
  let r = ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6 })
  if (r.length < 3 || !(z1 > z0)) return null
  if (r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) < 0) r = [...r].reverse()
  const n = r.length, v: number[] = [], f: number[] = []
  for (const [x, y] of r) v.push(r3(x), r3(y), r3(z0))
  for (const [x, y] of r) v.push(r3(x), r3(y), r3(z1))
  const tris = earClip(r)
  if (!tris.length) return null
  for (const [a, b, c] of tris) {
    // earClip keeps the ring's (CCW) turn: a b c faces up.
    f.push(n + a, n + b, n + c)
    f.push(a, c, b)
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push(i, j, n + j, i, n + j, n + i) }
  return { v, f }
}

/**
 * Real Vancouver buildings whose outline centre lies within `radius` of `centre` (project frame), seated on a flat
 * ground as Sun & Wind Studio has one: z0 = the part's clearance (bridges, overhangs), z1 = its height above its own
 * ground. Parts with no height in any source and those `hidden` (removed under the design) are left out.
 */
export function nearbyBuildings(
  footprints: Footprint[], heights: FootprintHeights | null, centre: [number, number], radius: number,
  o: { hidden?: ReadonlySet<number>; clearance?: ArrayLike<number> | null; placeholders?: ReadonlySet<number>; source: (i: number) => string },
): ContextBuilding[] {
  if (!heights) return []
  const out: ContextBuilding[] = []
  footprints.forEach((fp, i) => {
    if (o.hidden?.has(i) || o.placeholders?.has(i)) return
    const g = heights.ground[i], roof = heights.roof[i]
    if (!Number.isFinite(g) || !Number.isFinite(roof) || roof - g < 0.5) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of fp.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    if (Math.hypot((x0 + x1) / 2 - centre[0], (y0 + y1) / 2 - centre[1]) > radius) return
    const c = Math.max(0, Number(o.clearance?.[i] ?? 0) || 0)
    out.push({ ring: fp.outer, z0: c, z1: c + (roof - g), source: o.source(i) })
  })
  return out
}

/** The payload for the selected tower (the other towers go as context). */
export function sunWindPayload(towers: Tower[], o: PayloadOptions): SwPayload | null {
  const t = towers.find((k) => k.id === o.selectedId) ?? towers[0]
  if (!t) return null
  const scene = (list: Tower[]) => buildScene(list, { project: o.project, northDeg: o.northDeg, groundElevation: o.groundElevation, utmOrigin: null, meshOf: o.meshOf })
    .solids.filter((s) => s.layer !== LAYER.core) // the core sits inside the storeys: Sun & Wind Studio reads the envelope
  const own = scene([t])
  if (!own.length) return null
  // The massing's plan centre: Real Vancouver is sent centred on it.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of own) for (let i = 0; i < s.positions.length; i += 3) { x0 = Math.min(x0, s.positions[i]); x1 = Math.max(x1, s.positions[i]); y0 = Math.min(y0, s.positions[i + 1]); y1 = Math.max(y1, s.positions[i + 1]) }
  const centre: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2]
  const [dx, dy] = o.project === 'city' ? centre : [0, 0]
  const shift = (p: ArrayLike<number>) => { const v: number[] = []; for (let i = 0; i < p.length; i += 3) v.push(r3(p[i] - dx), r3(p[i + 1] - dy), r3(p[i + 2])); return v }
  const name = (s: string) => s.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim() || 'Tower'
  const meshes: SwMesh[] = own.map((s) => ({ layer: `Toolkit::${name(t.name)}::${s.layer.split('::').pop()}`, role: 'massing', part: 'mass', v: shift(s.positions), f: s.indices.slice() }))
  for (const other of towers) {
    if (other.id === t.id) continue
    for (const s of scene([other])) meshes.push({ layer: `Toolkit::Other design towers::${name(other.name)}`, role: 'context', v: shift(s.positions), f: s.indices.slice() })
  }
  const floors = towerFloors(t)
  const program: SwStorey[] = floors.map((f, i) => ({ level: i + 1, prog: f.skyLobby ? 'public' : SW_PROGRAM[f.use] ?? 'office', z0: r3(f.z0), z1: r3(f.z1) }))
  const notes = [
    'Sent from Tower Design Toolkit: LOD 100 massing, one closed solid per storey; the core is left out (it sits inside the storeys).',
    `Programs mapped to Sun & Wind Studio's list by the Toolkit team (team assumption): ${Object.entries(SW_PROGRAM).map(([k, p]) => `${k} → ${p}`).join(', ')}; sky lobbies → public.`,
  ]
  let site: SwSite | null = null
  if (o.project === 'city') {
    const ctx = (o.context ?? []).flatMap((b) => {
      const m = extrude(b.ring.map(([x, y]) => [x - dx, y - dy]), b.z0, b.z1)
      return m ? [{ layer: 'existing' as const, v: m.v, f: m.f, top: r3(b.z1), source: b.source }] : []
    })
    const ring = o.siteRing && o.siteRing.length >= 3 ? o.siteRing.map(([x, y]) => [r3(x - dx), r3(y - dy)] as [number, number]) : null
    const area = ring ? Math.abs(ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x * y2 - x2 * y }, 0) / 2) : 0
    const [lat, lon] = o.latLon ?? [49.2827, -123.1207]
    site = {
      meta: { source: `Tower Design Toolkit, Real Vancouver: buildings within ${SW_CONTEXT_RADIUS} m of ${name(t.name)}`, units: 'm', origin: [0, 0], north: '+y', lat, lon, tz: -8, city: 'Vancouver, BC',
        toolkit: { project: 'city', centre: [r3(centre[0]), r3(centre[1])], groundElevation: o.groundElevation, radius: SW_CONTEXT_RADIUS,
          note: 'Frame: Toolkit Real Vancouver local frame (EPSG:26910 minus the Toolkit origin) shifted by `centre`; buildings seated on flat ground at their own heights; courtyards filled. Buildings © OpenStreetMap contributors (ODbL) and City of Vancouver LiDAR 2022 (OGL-Vancouver), heights by source as the Toolkit shows them.' } },
      site: ring ? { polygon: ring, area: Math.round(area) } : null,
      meshes: ctx, future: [], curves: [], labels: [], uses: [],
    }
    notes.push(`Real Vancouver: ${ctx.length} buildings within ${SW_CONTEXT_RADIUS} m replace the competition site; the tower stands at ${o.groundElevation.toFixed(1)} m CGVD28, set to 0 here.`)
  }
  return {
    protocol: SW_PROTOCOL, from: 'Tower Design Toolkit', project: o.project, name: `${name(t.name)} (Tower Design Toolkit)`, rev: o.rev, units: 'm',
    trueNorthDeg: o.project === 'vtc' ? o.northDeg : 0,
    tower: { name: t.name, height: r3(t.height), storeys: floors.length, centre: [r3(centre[0] - dx), r3(centre[1] - dy)] },
    meshes, program, site, notes,
  }
}

/** The model file Sun & Wind Studio's "Your model" import reads today (no top-level `meta`). */
export function sunWindFile(p: SwPayload): string {
  const { site: _site, ...rest } = p // eslint-disable-line @typescript-eslint/no-unused-vars
  return JSON.stringify(rest)
}

/** Real Vancouver: the surroundings as a site file for Sun & Wind Studio's Site tab (it has `meta`). */
export function sunWindSiteFile(p: SwPayload): string | null {
  return p.site ? JSON.stringify(p.site) : null
}
