// Floor plates and the façade model the interior studies share (daylight, sun exposure, ventilation, glazing, indoor
// temperature), ported from Sinnie Choi's Sun & Wind Studio (study.js: STRATS, DEFAULT_ZONES, zoneFor, band, edgesOf,
// cardinalOf, stratParts, devT, zoneAvgT, obstructionAngles; physics.js faceOffset). Each floor is rasterised on a grid in
// the tower's own axes, as the Studio's floor mask is, so a ray walked across the plate leaves through a façade whose
// compass face (N, E, S, W) is found the Studio's way (cardinalOf with the floor's rotation).
import { towerFloors } from '../massing'
import type { Floor, Tower, UseId } from '../types'
import type { Pt } from '../shadow'
import { floorPlates } from '../../lib/floorPick'

export type Face = 'N' | 'E' | 'S' | 'W'
export const ORI: Face[] = ['N', 'E', 'S', 'W']
export const FACE_AZ: Record<Face, number> = { N: 0, E: 90, S: 180, W: 270 }
export const FACE_NAME: Record<Face, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }

export type StratId = 'curtain' | 'punched' | 'overhang' | 'louvres' | 'fins' | 'eggcrate' | 'lightshelf' | 'balcony' | 'doubleskin' | 'pvspandrel' | 'greenwall' | 'windscreen'
export interface Strat { name: string; blurb: string; d: { wwr: number; shgc: number; depth: number; pv: number }; device: boolean; depthLabel?: string; mod?: number; ventBoost?: number; screen?: boolean }

/** The façade strategies of the Studio's Façade tab, with their default glazing, glass and device depth. */
export const STRATS: Record<StratId, Strat> = {
  curtain: { name: 'Curtain wall', blurb: 'Floor-to-floor glazing over a spandrel band, no external device.', d: { wwr: 0.6, shgc: 0.4, depth: 0, pv: 0 }, device: false },
  punched: { name: 'Punched windows', blurb: 'Windows 1.8 m wide in a solid wall, each in a reveal that shades like a small egg-crate.', d: { wwr: 0.35, shgc: 0.4, depth: 0.4, pv: 0 }, device: true, depthLabel: 'Reveal depth' },
  overhang: { name: 'Horizontal overhang', blurb: 'A continuous shelf at the head of the glass. Best on the south.', d: { wwr: 0.5, shgc: 0.4, depth: 0.9, pv: 0 }, device: true, depthLabel: 'Overhang depth' },
  louvres: { name: 'Horizontal louvres', blurb: 'Slats at 0.5 m pitch: the shading of a deep overhang at a fraction of the projection.', d: { wwr: 0.55, shgc: 0.4, depth: 0.3, pv: 0 }, device: true, depthLabel: 'Slat depth' },
  fins: { name: 'Vertical fins', blurb: 'Fins at 1.5 m pitch, for the low east and west sun.', d: { wwr: 0.5, shgc: 0.4, depth: 0.6, pv: 0 }, device: true, depthLabel: 'Fin depth' },
  eggcrate: { name: 'Egg-crate', blurb: 'Louvres and fins together: the strongest shading, at a cost to view and daylight.', d: { wwr: 0.5, shgc: 0.4, depth: 0.4, pv: 0 }, device: true, depthLabel: 'Depth' },
  lightshelf: { name: 'Light shelf', blurb: 'A shelf at 2.1 m shades the view window and bounces daylight off the ceiling.', d: { wwr: 0.6, shgc: 0.4, depth: 0.9, pv: 0 }, device: true, depthLabel: 'Shelf depth' },
  balcony: { name: 'Balconies', blurb: 'A slab and railing on every floor, each shading the glass below as a deep overhang.', d: { wwr: 0.55, shgc: 0.4, depth: 1.8, pv: 0 }, device: true, depthLabel: 'Balcony depth' },
  doubleskin: { name: 'Double-skin façade', blurb: 'An outer glass layer with a ventilated cavity: solar gain cut to about 65%, windows can open higher up.', d: { wwr: 0.7, shgc: 0.4, depth: 0.8, pv: 0 }, device: false, mod: 0.65, depthLabel: 'Cavity width', ventBoost: 1.6 },
  pvspandrel: { name: 'PV spandrel', blurb: 'Photovoltaic panels on the opaque band of each floor.', d: { wwr: 0.4, shgc: 0.4, depth: 0, pv: 0.8 }, device: false },
  greenwall: { name: 'Planted spandrel', blurb: 'A living wall on the spandrel band; pairs with a smaller window.', d: { wwr: 0.3, shgc: 0.4, depth: 0, pv: 0 }, device: false },
  windscreen: { name: 'Terrace wind screens', blurb: '1.5 m glass screens along terrace edges, halving the wind people feel there.', d: { wwr: 0.55, shgc: 0.4, depth: 0, pv: 0 }, device: false, screen: true },
}

/** One façade zone: a strategy for one face (or all) over a range of levels. Later zones win where they overlap. */
export interface FacadeZone { face: Face | 'all'; from: number; to: number; strat: StratId; wwr: number; shgc: number; depth: number; pv: number; operable: boolean }

export const DEFAULT_ZONE: FacadeZone = { face: 'all', from: 1, to: 999, strat: 'curtain', wwr: 0.4, shgc: 0.4, depth: 0, pv: 0, operable: false }
/** The Studio's starting façade: plain north, fins east and west, an overhang south, all windows openable. */
export const DEFAULT_ZONES: FacadeZone[] = [
  { face: 'N', from: 1, to: 999, strat: 'curtain', wwr: 0.35, shgc: 0.35, depth: 0, pv: 0, operable: true },
  { face: 'E', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.35, depth: 0.6, pv: 0, operable: true },
  { face: 'S', from: 1, to: 999, strat: 'overhang', wwr: 0.45, shgc: 0.35, depth: 0.9, pv: 0, operable: true },
  { face: 'W', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.35, depth: 0.8, pv: 0, operable: true },
]

/** The zones of a tower (its own, or the Studio's defaults). */
export const zonesOf = (t: Tower): FacadeZone[] => (t.facadeZones && t.facadeZones.length ? t.facadeZones : DEFAULT_ZONES)

export function zoneFor(zones: FacadeZone[], face: Face, level: number): FacadeZone {
  let z: FacadeZone | null = null
  for (const q of zones) if ((q.face === face || q.face === 'all') && level >= q.from && level <= q.to) z = q
  return z ?? DEFAULT_ZONE
}

/** Glass visible transmittance (the Studio's SW.glaz.vt). */
export const GLASS_VT = 0.6
/** Slab gap between floor plates (the Studio's GAP). */
export const GAP = 0.45
export const DL_WP = 0.8
export const DL_E = 16000
export const DL_SUB = 6
export const ND_PARTS = { cut: 0, dim: 1 }
export const DL_R = { floor: 0.2, wall: 0.5, ceil: 0.8, erc: 0.2, maint: 0.9, udiLo: 100, udiHi: 3000, rays: 16, blind: 0.2 }
/** Share of the light a device intercepts that its surfaces still pass inward (about Radiance's 0.5 reflectance). */
export const DEV_REFL: Partial<Record<StratId, number>> = { louvres: 0.2, fins: 0.15, eggcrate: 0.15, punched: 0.1, lightshelf: 0.35, overhang: 0.08, balcony: 0.08 }

/** Share of CIE overcast horizontal illuminance per radian of azimuth from altitudes with sines s1..s2. */
export const cieBand = (s1: number, s2: number) => (3 * ((s2 * s2 - s1 * s1) / 2 + (2 * (s2 * s2 * s2 - s1 * s1 * s1)) / 3)) / (7 * Math.PI)
/** Share of a vertical window's sky light coming from above an obstruction angle t. */
export const vertSkyAbove = (t: number) => 1 - (t / 2 + Math.sin(2 * t) / 4) / (Math.PI / 4)

/** Compass offset of a floor's faces from the cardinal directions (physics.js faceOffset). */
export function faceOffset(rot: number): number { const d = (((rot * 180) / Math.PI) % 90 + 90) % 90; return -(d > 45 ? d - 90 : d) }
/** The compass face a local outward normal (nx, ny) points to, for a floor turned by rot (study.js cardinalOf). */
export function cardinalOf(nx: number, ny: number, rot: number): Face {
  const a = Math.atan2(ny, nx) + rot
  const deg = (((a * 180) / Math.PI) % 360 + 360) % 360
  return deg < 45 || deg >= 315 ? 'E' : deg < 135 ? 'N' : deg < 225 ? 'W' : 'S'
}

export interface PlateEdge { o: Face; L: number; mx: number; my: number; ux: number; uy: number; ox: number; oy: number; /** compass azimuth of the outward normal (deg) */ az: number }
export interface PlateMask { nx: number; ny: number; x0: number; y0: number; /** cell size (m) */ h: number; cells: Uint8Array }

/** One floor as the Studio's studies see it, in the tower's own axes (x along its width), metres. */
export interface SwFloor {
  /** Index in the tower's above-grade floor list (0-based; the Studio's f.i). */
  i: number
  level: number
  use: UseId
  podium: boolean
  /** Floor level above grade and floor-to-floor height (m). */
  z: number
  h: number
  /** Net floor area (the toolkit's), m². */
  area: number
  /** Rotation from the floor's axes to the north frame (+y = true north), radians counter-clockwise. */
  rot: number
  /** Centre of the floor's axes in the north frame (m). */
  cx: number
  cy: number
  /** Plate outlines in the floor's axes. */
  rings: Pt[][]
  mask: PlateMask
  /** Square core: centre and half side in the floor's axes. */
  core: { x: number; y: number; half: number }
  edges: PlateEdge[]
  towerId: string
}

/** A cell of the mask is floor (inside the plate). */
export const solidAt = (m: PlateMask, cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < m.nx && cy < m.ny && !!m.cells[cy * m.nx + cx]
export const inCore = (f: SwFloor, x: number, y: number) => Math.abs(x - f.core.x) <= f.core.half && Math.abs(y - f.core.y) <= f.core.half

/** The glazing band of a face (study.js band): head under the slab gap, glass height from the WWR, sill below it. */
export function band(f: SwFloor, z: FacadeZone): { hh: number; head: number; gh: number; sp: number } {
  const hh = f.h - GAP, head = hh
  const gh = Math.max(0.3, Math.min(head, hh * z.wwr))
  return { hh, head, gh, sp: Math.max(0, head - gh) }
}

/** What a zone's device does to beam sun at one sun position: the share of the glass height cut off, and the dimming. */
export function stratParts(z: FacadeZone, alt: number, azDeg: number, faceAz: number, gh: number): { cut: number; dim: number } {
  const st = STRATS[z.strat], D = z.depth
  let dim = st.mod || 1, cut = 0
  if (!st.device || D <= 0) return { cut, dim }
  const hsa = ((azDeg - faceAz + 540) % 360) - 180, c = Math.cos((hsa * Math.PI) / 180)
  if (c <= 0.02) return { cut, dim }
  const tanProf = Math.tan(alt) / c, tanH = Math.abs(Math.tan((hsa * Math.PI) / 180)), g = Math.max(0.5, gh)
  switch (z.strat) {
    case 'overhang': case 'balcony': cut = Math.min(1, (D * tanProf) / g); break
    case 'louvres': dim *= 1 - Math.min(1, (D * tanProf) / 0.5); break
    case 'fins': dim *= 1 - Math.min(1, (D * tanH) / 1.5); break
    case 'eggcrate': dim *= (1 - Math.min(1, (D * tanProf) / 0.5)) * (1 - Math.min(1, (D * tanH) / 1.5)); break
    case 'punched': cut = Math.min(1, (D * tanProf) / g); dim *= 1 - Math.min(1, (D * tanH) / 1.8); break
    case 'lightshelf': { const hs = Math.min(2.1, g); cut = (hs / g) * Math.min(1, (D * tanProf) / hs); break }
  }
  return { cut, dim }
}

/** Share of sky one sight line gets through a zone's device (study.js devT). */
export function devT(z: FacadeZone, alt: number, hsa: number, hz: number, sill: number, head: number): number {
  const st = STRATS[z.strat], D = z.depth, base = z.strat === 'doubleskin' ? 0.8 : 1
  if (!st.device || D <= 0) return base
  const c = Math.cos((hsa * Math.PI) / 180)
  if (c <= 0.02) return 0
  const tanProf = Math.tan(alt) / c, tanH = Math.abs(Math.tan((hsa * Math.PI) / 180))
  let t = 1
  switch (z.strat) {
    case 'overhang': case 'balcony': if (hz > head - D * tanProf) t = 0; break
    case 'punched': t = hz > head - D * tanProf ? 0 : Math.max(0, 1 - (D * tanH) / 1.8); break
    case 'louvres': t = Math.max(0, 1 - (D * tanProf) / 0.5); break
    case 'fins': t = Math.max(0, 1 - (D * tanH) / 1.5); break
    case 'eggcrate': t = Math.max(0, 1 - (D * tanProf) / 0.5) * Math.max(0, 1 - (D * tanH) / 1.5); break
    case 'lightshelf': { const sh = 2.1 - DL_WP; if (hz < sh && hz > sh - D * tanProf) t = 0; break }
  }
  return base * (t + (DEV_REFL[z.strat] || 0) * (1 - t))
}

const avgTCache = new Map<string, number>()
/** A window's average transmission over the sky, flux-weighted, for the light reflected inside (study.js zoneAvgT). */
export function zoneAvgT(z: FacadeZone, B: { sp: number; gh: number; head: number }): number {
  const key = JSON.stringify([z.strat, z.depth, B.sp, B.gh, B.head])
  const hit = avgTCache.get(key)
  if (hit != null) return hit
  const sill = Math.max(0, B.sp - DL_WP), head = Math.max(sill + 0.1, B.head - DL_WP), hz = (sill + head) / 2
  let s = 0, w = 0
  for (let h = -75; h <= 75; h += 15) for (let a = 5; a <= 85; a += 10) {
    const al = (a * Math.PI) / 180, wt = Math.cos(al) * Math.cos(al) * Math.cos((h * Math.PI) / 180)
    s += devT(z, al, h, hz, sill, head) * wt; w += wt
  }
  const v = w ? s / w : 1
  avgTCache.set(key, v)
  return v
}

/** A context building as the obstruction estimate reads it: centre in the north frame and top above grade. */
export interface ContextBlock { x: number; y: number; top: number }

/** Mean obstruction angle in front of each face from the buildings 15–160 m away (study.js obstructionAngles). */
export function obstructionAngles(f: SwFloor, ctx: ContextBlock[]): Record<Face, number> {
  const out = {} as Record<Face, number>
  const z = f.z + 0.8
  const N: Record<Face, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }
  for (const o of ORI) {
    const n = N[o]
    let hs = 0, ds = 0, c = 0
    for (const b of ctx) {
      const dx = b.x - f.cx, dy = b.y - f.cy, d = Math.hypot(dx, dy)
      if (d < 15 || d > 160) continue
      if ((dx * n[0] + dy * n[1]) / d < 0.6) continue
      hs += b.top; ds += d; c++
    }
    const hn = c ? hs / c : 0, dn = c ? Math.max(25, ds / c) : 60
    out[o] = Math.atan(Math.max(0, hn - z) / dn)
  }
  return out
}

/** From the floor's axes to the north frame. */
export function toNorth(f: SwFloor, x: number, y: number): Pt {
  const c = Math.cos(f.rot), s = Math.sin(f.rot)
  return [f.cx + x * c - y * s, f.cy + x * s + y * c]
}

const ringArea = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const insideRing = (p: Pt, r: Pt[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o } return o }

/**
 * A tower's above-grade floors as the Studio's studies see them. `northDeg` is true north clockwise from the project
 * frame's +y (0 in Real Vancouver). `cell` is the grid size (1 m as the Studio's mask; 0.5 for finer plans).
 */
export function swFloors(t: Tower, northDeg: number, cell = 1): SwFloor[] {
  const plates = floorPlates(t)
  const all = towerFloors(t).filter((f) => f.z1 > 0)
  const turn = (t.rotation * Math.PI) / 180
  const rot = turn + (northDeg * Math.PI) / 180
  const nr = (northDeg * Math.PI) / 180
  const cN = [t.x * Math.cos(nr) - t.y * Math.sin(nr), t.x * Math.sin(nr) + t.y * Math.cos(nr)]
  const toLocal = (p: Pt): Pt => { const dx = p[0] - t.x, dy = p[1] - t.y, c = Math.cos(-turn), s = Math.sin(-turn); return [dx * c - dy * s, dx * s + dy * c] }
  const towerPlate = plates.filter((p) => !p.f.podium).map((p) => p.f.area)[0] ?? t.width * t.depth
  const coreHalf = Math.sqrt(Math.max(0, (t.coreShare ?? 0.25) * towerPlate)) / 2
  const memo = new Map<string, Pick<SwFloor, 'rings' | 'mask' | 'edges'>>()
  return plates.map(({ f, rings }, i): SwFloor => {
    // counter-clockwise, so each edge's outward normal (uy, -ux) points out of the plate (this sum is negative for a counter-clockwise ring)
    const local = rings.map((r) => { const q = r.map(toLocal); return ringArea(q) > 0 ? q.reverse() : q })
    const key = JSON.stringify(local.map((r) => r.map((p) => [Math.round(p[0] * 10), Math.round(p[1] * 10)])))
    let g = memo.get(key)
    if (!g) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const r of local) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
      x0 = Math.floor(x0 / cell) * cell; y0 = Math.floor(y0 / cell) * cell
      const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell))
      const cells = new Uint8Array(nx * ny)
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const p: Pt = [x0 + (ix + 0.5) * cell, y0 + (iy + 0.5) * cell]
        if (local.some((r) => insideRing(p, r))) cells[iy * nx + ix] = 1
      }
      const edges: PlateEdge[] = []
      for (const r of local) for (let k = 0; k < r.length; k++) {
        const a = r[k], b = r[(k + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy)
        if (L < 0.5) continue
        const ux = dx / L, uy = dy / L, ox = uy, oy = -ux // outward of a counter-clockwise ring
        const wx = ox * Math.cos(rot) - oy * Math.sin(rot), wy = ox * Math.sin(rot) + oy * Math.cos(rot)
        const az = ((90 - (Math.atan2(wy, wx) * 180) / Math.PI) % 360 + 360) % 360
        edges.push({ o: cardinalOf(ox, oy, rot), L, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, ux, uy, ox, oy, az })
      }
      g = { rings: local, mask: { nx, ny, x0, y0, h: cell, cells }, edges }
      memo.set(key, g)
    }
    return { i, level: f.level, use: f.use, podium: f.podium, z: f.z0, h: f.z1 - f.z0, area: f.area, rot, cx: cN[0], cy: cN[1], ...g, core: { x: 0, y: 0, half: f.podium ? coreHalf : coreHalf }, towerId: t.id }
  })
}

/** Floors that share plate, rotation, zone choice and height give the same interior result: a signature to compute once. */
export function floorSig(f: SwFloor, zones: FacadeZone[], extra = ''): string {
  return JSON.stringify([f.mask.nx, f.mask.ny, f.mask.x0, f.mask.y0, f.rings.length, f.edges.length, f.h.toFixed(2), f.rot.toFixed(3), f.core.half.toFixed(2), ORI.map((o) => zones.indexOf(zoneFor(zones, o, f.level))), extra])
}

export type { Floor }
