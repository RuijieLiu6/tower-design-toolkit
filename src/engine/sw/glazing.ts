// Solar gain through the glass and low-sun glare by façade zone, and the tower's window-to-wall ratio, ported from
// Sinnie Choi's Sun & Wind Studio (study.js solarStudy, stratT, zoneLabel, zoneGlazing; keyItems 'strat' WWR).
//
// Deviations from the Studio (stated, not hidden):
//  - Beam on each face comes from the CWEC hourly direct-normal irradiance on the face's true azimuth (faceHours),
//    unobstructed, times an optional context share `shade` (default 1). The Studio measures the sunlit area of each
//    floor face from its shadow renders on sample days (self- and context-shading included) and scales by sunshine.
//  - Glare hours need the sun to be out: direct-normal over 120 W/m² (the WMO sunshine threshold) with the sun under
//    25°, in front of the face and more than half its beam let through the device (the Studio: rendered sunlit area
//    over 3% of the face on clear-sky sample days, weighted by sunshine).
//  - Devices are evaluated against the face's true azimuth (the Studio uses the cardinal azimuth for the device and the
//    true geometry for the beam).
//  - Facets (G7, plate.ts): an edge off its plate's main grid takes the zone of the facets facing its true sector, and
//    when it shares a zone with main faces ('all', or none) its gain and glare are kept in their own row, so a chamfer's
//    glare is reported as the chamfer's, not inside a neighbouring face's zone.
//  - Added (not in the Studio): `diffuse`, sky and ground gain through the glass after the device's sky transmission,
//    and monthly splits; the Studio's heat through glazing is beam only, and so are `un` / `sh` here.
import { FULL_YEAR, faceHours, inPeriod, prepClimate, type Period } from './climate'
import type { ClimatePayload } from './types'
import { DEFAULT_ZONE, GLASS_VT, ORI, STRATS, band, isFacetFace, stratParts, zoneAvgT, zoneFaceName, zoneFor, type Face, type FacadeZone, type Sector, type StratId, type SwFloor } from './plate'

/** Share of beam a zone's glass lets through at one sun position (study.js stratT = (1 − cut) × dim of stratParts). */
export function stratT(z: FacadeZone, alt: number, azDeg: number, faceAz: number, gh: number): number {
  const p = stratParts(z, alt, azDeg, faceAz, gh)
  return (1 - p.cut) * p.dim
}

/** Zone label as the Studio writes it (study.js zoneLabel). */
export function zoneLabel(z: FacadeZone, topLevel = 999): string {
  if (z === DEFAULT_ZONE) return 'Unassigned faces'
  const to = Math.min(z.to, topLevel)
  return `${z.face === 'all' ? 'All' : isFacetFace(z.face) ? zoneFaceName(z.face) : z.face} · L${z.from}${to > z.from ? '–L' + to : ''}`
}

const tCache = new WeakMap<object, Map<string, number>>()
/** Beam-weighted device transmission of a zone on a face over the year (the Studio's Z.tAvg, used by zoneGlazing as t). */
export function zoneSolarT(C: ClimatePayload, z: FacadeZone, faceAz: number, gh: number): number {
  const P = prepClimate(C)
  let m = tCache.get(P)
  if (!m) { m = new Map(); tCache.set(P, m) }
  const key = JSON.stringify([z.strat, z.depth, Math.round(faceAz), gh.toFixed(2)])
  const hit = m.get(key)
  if (hit != null) return hit
  const F = faceHours(P, faceAz)
  let s = 0, w = 0
  for (let k = 0; k < P.n; k++) { const b = F.beam[k]; if (!(b > 0)) continue; s += b * stratT(z, P.alt[k], P.az[k] * 180 / Math.PI, faceAz, gh); w += b }
  const v = w ? s / w : (STRATS[z.strat].mod || 1)
  m.set(key, v)
  return v
}

export interface GlazingZone {
  /** Index in `zones`, -1 for faces no zone covers (DEFAULT_ZONE). */
  i: number
  label: string
  /** The facets of one sector kept apart from the main faces that share their zone (G7); absent for a zone's own row. */
  facet?: Sector
  strat: StratId; stratName: string
  zone: FacadeZone
  /** kWh in the period: beam on the zone's façade, beam through its glass unshaded and with the device. */
  beam: number; un: number; sh: number
  /** Sky and ground gain through the glass after the device (kWh, added here). */
  diffuse: number
  /** Beam-weighted share let through the device. */
  tAvg: number
  /** Hours with low sun glare on any of the zone's faces. */
  glare: number
  /** Glazed, opaque and PV areas (m²). */
  areaGl: number; areaOp: number; pvArea: number
  /** Beam on the PV share of the spandrel (kWh). */
  pvBeam: number
  /** Daylight aperture: WWR × visible transmittance. */
  aperture: number
  floors: number
  /** Beam through glass with the device by month (kWh), and unshaded. */
  monSh: number[]; monUn: number[]
}
export interface GlazingStudy {
  zones: GlazingZone[]
  unTot: number; shTot: number
  /** Share of the unshaded beam gain the devices block. */
  blocked: number
  byFace: Record<Face, { un: number; sh: number }>
  /** Window-to-wall ratio over the tower (area-weighted over faces and floors), and by face. */
  wwr: number; wwrByFace: Record<Face, number>
  /** Glazed and gross wall area (m²). */
  glass: number; wall: number
}

/** Area-weighted window-to-wall ratio over all faces and floors (keyItems 'strat'): edge length × floor height. */
export function towerWWR(floors: SwFloor[], zones: FacadeZone[]): { wwr: number; byFace: Record<Face, number>; glass: number; wall: number } {
  const A: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }, G: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (const f of floors) for (const e of f.edges) { const a = e.L * f.h; A[e.o] += a; G[e.o] += a * zoneFor(zones, e.zf, f.level).wwr }
  const wall = ORI.reduce((s, o) => s + A[o], 0), glass = ORI.reduce((s, o) => s + G[o], 0)
  const byFace = {} as Record<Face, number>
  for (const o of ORI) byFace[o] = A[o] ? G[o] / A[o] : 0
  return { wwr: wall ? glass / wall : 0, byFace, glass, wall }
}

const GLARE_ALT = 25 * Math.PI / 180, SUN_OUT = 120

/**
 * Heat through glazing and low-sun glare by façade zone (study.js solarStudy, the zone part; PV is in pv.ts).
 * `shade` = share of the beam reaching the façade past the context (1 = unobstructed).
 */
export function glazingStudy(floors: SwFloor[], zones: FacadeZone[], C: ClimatePayload, period: Period = FULL_YEAR, opts: { shade?: number; vt?: number } = {}): GlazingStudy {
  const P = prepClimate(C), shade = opts.shade ?? 1, vt = opts.vt ?? GLASS_VT
  const topLevel = floors.reduce((s, f) => Math.max(s, f.level), 0)
  const rowOf = new Map<string, GlazingZone>()
  const floorSets = new Map<GlazingZone, Set<number>>()
  // one row per zone; facets that share a zone with main faces get a row of their own per sector
  const row = (z: FacadeZone, facet: Sector | null): GlazingZone => {
    const i = zones.indexOf(z), apart = facet && !isFacetFace(z.face) ? facet : null, key = `${i}|${apart ?? ''}`
    let r = rowOf.get(key)
    if (!r) {
      const label = apart ? `${apart} facets · ${z === DEFAULT_ZONE ? 'no zone' : zoneLabel(z, topLevel)}` : zoneLabel(z, topLevel)
      r = { i, label, ...(apart ? { facet: apart } : {}), strat: z.strat, stratName: STRATS[z.strat].name, zone: z, beam: 0, un: 0, sh: 0, diffuse: 0, tAvg: 1, glare: 0, areaGl: 0, areaOp: 0, pvArea: 0, pvBeam: 0, aperture: z.wwr * vt, floors: 0, monSh: new Array(12).fill(0), monUn: new Array(12).fill(0) }
      rowOf.set(key, r); floorSets.set(r, new Set())
    }
    return r
  }
  // group floor faces that see the same sun the same way: zone, face, azimuth and glass height
  interface Group { r: GlazingZone; o: Face; az: number; gh: number; A: number; z: FacadeZone; tn: number; tw: number }
  const groups = new Map<string, Group>()
  for (const f of floors) for (const e of f.edges) {
    const z = zoneFor(zones, e.zf, f.level), r = row(z, e.facet), gh = band(f, z).gh, A = e.L * f.h, az = Math.round(e.az) % 360
    floorSets.get(r)!.add(f.i)
    r.areaGl += A * z.wwr; r.areaOp += A * (1 - z.wwr); r.pvArea += A * (1 - z.wwr) * z.pv
    const key = `${zones.indexOf(z)}|${r.facet ?? ''}|${e.o}|${az}|${gh.toFixed(2)}`
    const g = groups.get(key)
    if (g) g.A += A
    else groups.set(key, { r, o: e.o, az, gh, A, z, tn: 0, tw: 0 })
  }
  const G = [...groups.values()]
  const Fh = G.map((g) => faceHours(P, g.az))
  const avgT = G.map((g) => zoneAvgT(g.z, { sp: 0, gh: g.gh, head: g.gh }))
  const byFace = {} as Record<Face, { un: number; sh: number }>
  for (const o of ORI) byFace[o] = { un: 0, sh: 0 }
  const glaredAt = new Map<GlazingZone, number>()
  for (let k = 0; k < P.n; k++) {
    if (P.alt[k] <= 0.01 || !inPeriod(period, P.doy[k])) continue
    const alt = P.alt[k], azDeg = P.az[k] * 180 / Math.PI, mon = P.mon[k], low = alt < GLARE_ALT && P.dni[k] > SUN_OUT
    for (let j = 0; j < G.length; j++) {
      const g = G[j], F = Fh[j], z = g.z, r = g.r
      const dif = (F.sky[k] + F.gnd[k]) * g.A / 1000
      if (dif > 0) r.diffuse += dif * z.wwr * z.shgc * 0.9 * (STRATS[z.strat].mod || 1) * avgT[j]
      const bw = F.beam[k]
      if (!(bw > 0)) continue
      const beam = bw * g.A / 1000 * shade
      const t = stratT(z, alt, azDeg, g.az, g.gh), gain = beam * z.wwr * z.shgc * 0.9
      r.beam += beam; r.un += gain; r.sh += gain * t; r.monUn[mon] += gain; r.monSh[mon] += gain * t
      g.tn += t * beam; g.tw += beam
      byFace[g.o].un += gain; byFace[g.o].sh += gain * t
      r.pvBeam += beam * (1 - z.wwr) * z.pv
      if (low && t > 0.5 && bw / Math.max(1, P.dni[k]) > 0.03 && glaredAt.get(r) !== k) { glaredAt.set(r, k); r.glare++ }
    }
  }
  const out = [...rowOf.values()]
  for (const r of out) {
    r.floors = floorSets.get(r)!.size
    let tn = 0, tw = 0
    for (const g of G) if (g.r === r) { tn += g.tn; tw += g.tw }
    r.tAvg = tw ? tn / tw : (STRATS[r.strat].mod || 1)
  }
  out.sort((a, b) => (a.i < 0 ? 1e9 : a.i) - (b.i < 0 ? 1e9 : b.i))
  const unTot = out.reduce((s, r) => s + r.un, 0), shTot = out.reduce((s, r) => s + r.sh, 0)
  const W = towerWWR(floors, zones)
  return { zones: out, unTot, shTot, blocked: unTot > 0 ? 1 - shTot / unTot : 0, byFace, wwr: W.wwr, wwrByFace: W.byFace, glass: W.glass, wall: W.wall }
}
