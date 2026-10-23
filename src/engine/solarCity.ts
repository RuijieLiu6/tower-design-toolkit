// Real Vancouver inputs for the solar-access test: Table-1 spaces with City park polygons (src/data/solarSpaces.json,
// built by tools/build_solar_spaces.py), buildings with LiDAR heights, and the MRDEM terrain from the context layers.
// A building without a LiDAR height is never given one: it is left out of the baseline and counted.
import spacesData from '../data/solarSpaces.json'
import extraData from '../data/solarSpacesExtra.json'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import type { Occluders, Pt } from './shadow'
import type { ProtectedSpace, RuleId, T1Class } from './solarRules'

export interface CityBuilding { ring: Pt[]; ground: number; roof: number }

/** What the worker hands the job for the Real Vancouver project (absolute CGVD28 heights, local frame). */
export interface CityInput {
  /** Footprints with a LiDAR ground and roof (P90) height. */
  buildings: CityBuilding[]
  /** Centroids of footprints whose height is unknown. */
  unknown: Pt[]
  /** Detailed City ground first, followed by 30 m MRDEM fallback; null when unavailable. */
  terrain: HeightGrid | HeightGrid[] | null
}

interface SpaceRow { name: string; cls: T1Class; note?: '4.1' | '4.2' | '4.3'; parkName: string; parkClass: string; rings: Pt[][] }
const DATA = spacesData as unknown as { source: string; url: string; licence: string; retrieved: string; spaces: SpaceRow[]; missing: { name: string; cls: T1Class; note?: string }[] }

export const SPACES_SOURCE = { label: `${DATA.source}, ${DATA.licence}, retrieved ${DATA.retrieved}`, url: DATA.url }

// Spaces the parks data does not cover (src/data/solarSpacesExtra.json, built by tools/build_solar_extra.py): Table-1
// school sites from City parcels, the Davie and Robson Village north sidewalks (3.3.1), and the cenotaph circle (4.3.1).
interface ExtraRow { id: string; name: string; cls: T1Class | null; rule?: RuleId | 'cenotaph'; rings: Pt[][]; source: string; flag: 'verified' | 'unverified' }
const EXTRA = extraData as unknown as { source: string; licence: string; retrieved: string; spaces: ExtraRow[] }
export const EXTRA_SOURCE = { label: `${EXTRA.source}, ${EXTRA.licence}, retrieved ${EXTRA.retrieved}`, url: 'https://opendata.vancouver.ca/' }
/** Table-1 spaces still without a polygon (the plazas: no City dataset outlines them). */
export const MISSING_SPACES = DATA.missing.filter((m) => !EXTRA.spaces.some((e) => e.name === m.name))
const extraSpace = (e: ExtraRow): ProtectedSpace => ({ id: `city-${e.id}`, name: e.name, rings: e.rings, t1: e.cls ? { cls: e.cls } : null, ...(e.rule && e.rule !== 'cenotaph' ? { rule: e.rule } : {}), source: e.source })
/** The Victory Square cenotaph circle (4.3.1): shown and measured under both clock readings, never judged. */
export function cenotaphSpace(): ProtectedSpace | null {
  const e = EXTRA.spaces.find((x) => x.rule === 'cenotaph')
  return e ? extraSpace(e) : null
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Table-1 spaces that have a polygon in the City parks data (the park boundary stands in for the property line). */
export function table1Spaces(): ProtectedSpace[] {
  return DATA.spaces.map((s): ProtectedSpace => ({
    id: `city-${slug(s.parkName)}`, name: s.name, rings: s.rings, t1: { cls: s.cls, ...(s.note ? { note: s.note } : {}) },
    source: `City park polygon "${s.parkName}" (Park Board class ${s.parkClass}; Table-1 class from the guideline)`,
  })).concat(EXTRA.spaces.filter((e) => e.rule !== 'cenotaph').map(extraSpace))
}

export const centroidOf = (rings: Pt[][]): Pt => {
  const p = rings.flat()
  return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
}

export const sampleCityTerrain = (terrain: CityInput['terrain'], x: number, y: number) =>
  terrain ? sampleTerrain(Array.isArray(terrain) ? terrain : [terrain], x, y) : null

/** Elevation of a space: the median of the terrain at its vertices and centre, or null without terrain. */
export function elevationOf(rings: Pt[][], terrain: HeightGrid | HeightGrid[] | null): number | null {
  if (!terrain) return null
  const pts = [...rings.flat(), centroidOf(rings)]
  const hs = pts.map(([x, y]) => sampleCityTerrain(terrain, x, y)).filter((h): h is number => h !== null).sort((a, b) => a - b)
  return hs.length ? hs[Math.floor(hs.length / 2)] : null
}

/** Re-base casters on a receiver plane: dz is (caster base elevation − receiver elevation); parts below it are cut. */
export function liftOccluders(o: Occluders, dz: number): Occluders {
  if (dz === 0) return o
  const prisms = o.prisms.map((p) => ({ ring: p.ring, z0: Math.max(0, p.z0 + dz), z1: p.z1 + dz })).filter((p) => p.z1 > p.z0)
  const tris = o.tris.map((v, k) => (k % 3 === 2 ? Math.max(0, v + dz) : v))
  return { prisms, tris }
}

/** Buildings with heights within `radius` of a point, as casters above a receiver at elevation `zr`. */
export function cityBaseline(city: CityInput, centre: Pt, radius: number, zr: number): Occluders {
  const prisms = []
  for (const b of city.buildings) {
    if (b.roof <= zr) continue
    const [x, y] = b.ring[0]
    if (Math.hypot(x - centre[0], y - centre[1]) > radius) continue
    prisms.push({ ring: b.ring, z0: Math.max(0, b.ground - zr), z1: b.roof - zr })
  }
  return { prisms, tris: [] }
}

export const unknownNear = (city: CityInput, centre: Pt, radius: number) => city.unknown.filter(([x, y]) => Math.hypot(x - centre[0], y - centre[1]) <= radius).length

/** Distance from a point to the nearest vertex or edge of a space. */
export function distanceTo(rings: Pt[][], p: Pt): number {
  let best = Infinity
  for (const r of rings) {
    for (let k = 0, l = r.length - 1; k < r.length; l = k++) {
      const [ax, ay] = r[l], [bx, by] = r[k]
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
      const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0
      best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)))
    }
  }
  return best
}
