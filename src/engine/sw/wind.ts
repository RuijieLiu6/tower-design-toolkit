// Pedestrian wind comfort, ported from Sinnie Choi's Sun & Wind Studio (study.js: buildSiteRaster / towerRaster →
// solidMask, runWind → lbmRun + downwash, roseFor → windRose, runWindStudy + summarise → runWindStudy, cls → lawsonClass)
// so it takes the site, massing and climate as inputs instead of the app's global state.
//
// Method, as Sun & Wind Studio has it: a two-dimensional D2Q9 lattice-Boltzmann flow at pedestrian level (BGK, τ 0.58,
// periodic domain driven by a body force held at a mean lattice speed of 0.05, bounce-back walls) around every obstacle
// taller than 3 m, run once per sector of the 8-sector wind rose, with and without the towers. Each cell's speed-up is
// its speed over the free stream (mean speed of the cells more than 24 m from any wall); the towers add the downwash
// amplification in front of their windward face from their height over the neighbours' mean height (reduced by a
// podium). The speed-ups times each sector's mean 10 m wind, weighted by the sector's share of the hours, give the
// period's mean pedestrian wind per cell, read against the Lawson bands (sitting ≤ 2.5, standing ≤ 4, strolling ≤ 6,
// walking ≤ 8, uncomfortable > 8 m/s). Gusty ground: 1.8 × the sector mean over 6 m/s in more than 5% of the hours.
// Reference height: by default none, as Sun & Wind Studio's pedestrian study: the speed-up (against the free stream at
// pedestrian level) multiplies the airport's 10 m wind directly ("site wind speed at 10 m"). The option `ref: 'site'`
// first carries the airport wind to the urban site with S&W's own transform from its ventilation study (siteWind:
// ASHRAE boundary layers as EnergyPlus, airport α 0.14 / 270 m, site α 0.25 / 400 m, z held at 10 m → × 0.63).
//
// Deviations from Sun & Wind Studio (each marked "Deviation" below):
//  • the domain is a square around the towers sized from their height (S&W: a fixed 680 × 440 m box at 4 m cells), so
//    any wind direction crosses the same depth of ground, and the shares are read on the ground within a study radius
//    of the towers rather than over the whole box;
//  • the rose is counted from the hourly records of the chosen season (calm hours left out, as S&W's rose does) instead
//    of S&W's monthly roses weighted by days; same 8 sectors centred on N, NE … NW;
//  • the downwash zone is applied for every tower (S&W has one tower), each against the context within 120 m;
//    a podium is read from the massing's podium blocks (S&W: a podium strategy dilated around the tower plate);
//  • added: a Lawson LDDC safety check from the hourly wind (the speed-up times each hour's wind carried to the site
//    with siteWind, over 15 m/s for more than 0.025% of the hours). S&W has no safety line. It always uses the site
//    transform: the raw airport 10 m wind reaches 15 m/s for more than 2 hours a year in the open, so without it every
//    open cell, towers or not, would read as unsafe.
//  • added (21 Nov, G13): trees and porous screens as momentum sinks in the lattice (`PorousObstacle`, see below), in
//    both runs (they are ground, not towers); S&W has only solid walls. Read their shelter as a floor, not a value:
//    the run is S&W's spin-up from rest (3.2 × n steps), in which a wall acts at once by bounce-back but a porous wake
//    is still forming (team check, 21 Nov: a 26-cell screen with k ≈ 4 slows its lee by ~17% in this run and by ~74%
//    in a 30 × longer one). The run length is kept, since changing it moves every result.
//  • changed (21 Nov, G13): a podium reads from all its storeys: its height is the top of the podium storeys stacked
//    from grade, and the tower's base plate is the first storey above them (an imported tower's upper podium storeys
//    used to read as the tower's base, so a 12 m pavilion read windier than a 6 m one).
import type { ClimatePayload, LegendBand, MassingPayload, Prism, SitePayload } from './types'
import { fillPolygon, type Grid, type Pt } from '../shadow'

// ---- Lawson bands (Sun & Wind Studio: BANDS / BAND_COL / cls) --------------------------------------------------------
export const LAWSON_BANDS: LegendBand[] = [
  { to: 2.5, label: 'Sitting', color: '#3E8E7E' },
  { to: 4, label: 'Standing', color: '#8FC17A' },
  { to: 6, label: 'Strolling', color: '#E3C25C' },
  { to: 8, label: 'Walking', color: '#E08A3C' },
  { to: 99, label: 'Uncomfortable', color: '#B8362B' },
]
export const lawsonClass = (v: number) => (v <= 2.5 ? 0 : v <= 4 ? 1 : v <= 6 ? 2 : v <= 8 ? 3 : 4)
/** Gust factor on the mean (S&W windProfile / runWindStudy). */
export const GUST = 1.8
/** Lawson LDDC safety: mean (≈ gust-equivalent mean with gusts 1.8× the mean) over 15 m/s for more than 0.025% of hours. */
export const SAFETY = { speed: 15, share: 0.00025 }
/** Wind profile exponent, urban edge (S&W ALPHA). */
export const ALPHA = 0.25
/** Airport 10 m wind → the urban site at height z (S&W siteWind; z held at 10 m or more). */
export const siteWindFactor = (z = 10) => Math.pow(270 / 10, 0.14) * Math.pow(Math.max(10, z) / 400, ALPHA)

// ---- seasons (S&W PERIOD_PRESETS) ------------------------------------------------------------------------------------
export type Season = 'year' | 'winter' | 'spring' | 'summer' | 'fall'
export const SEASONS: Record<Season, { label: string; months: number[] }> = {
  year: { label: 'Whole year', months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  winter: { label: 'Winter · Dec–Feb', months: [11, 0, 1] },
  spring: { label: 'Spring · Mar–May', months: [2, 3, 4] },
  summer: { label: 'Summer · Jun–Aug', months: [5, 6, 7] },
  fall: { label: 'Fall · Sep–Nov', months: [8, 9, 10] },
}

// ---- wind rose from the hourly records -------------------------------------------------------------------------------
const SECTOR_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export interface RoseSector { dir: number; name: string; f: number; s: number; /** 10 m speeds of the hours in this sector. */ ws: Float32Array }
export interface Rose { sectors: RoseSector[]; hours: number; calm: number }

/** 8-sector rose of the season's hours: share of the non-calm hours and mean speed (wd = from, clockwise from true north). */
export function windRose(C: ClimatePayload, season: Season, range?: { d0: number; d1: number }): Rose {
  const months = new Set(SEASONS[season].months)
  // A day range (the Studio's From / To; d1 < d0 wraps over the new year) replaces the season's months.
  const inRange = range ? (doy: number) => (range.d1 >= range.d0 ? doy >= range.d0 && doy <= range.d1 : doy >= range.d0 || doy <= range.d1) : null
  const ends: number[] = []
  { let s = 0; for (let m = 0; m < 12; m++) { s += C.days[m]; ends.push(s) } }
  const lists: number[][] = SECTOR_NAMES.map(() => [])
  let hours = 0, calm = 0, m = 0
  for (let k = 0; k < 8760; k++) {
    const doy = Math.floor(k / 24) + 1
    while (m < 11 && doy > ends[m]) m++
    if (inRange ? !inRange(doy) : !months.has(m)) continue
    hours++
    const ws = C.hourly.ws[k], wd = C.hourly.wd[k]
    if (!(ws > 0) || !Number.isFinite(wd)) { calm++; continue }
    lists[Math.floor((((wd % 360) + 360 + 22.5) % 360) / 45)].push(ws)
  }
  const n = hours - calm
  const sectors = lists.map((l, i) => {
    let s = 0
    for (const v of l) s += v
    return { dir: i * 45, name: SECTOR_NAMES[i], f: n ? l.length / n : 0, s: l.length ? s / l.length : 0, ws: Float32Array.from(l).sort() }
  })
  return { sectors, hours, calm }
}

// ---- solids on the ground grid (S&W buildSiteRaster / towerRaster) -----------------------------------------------------
/** Obstacles count at pedestrian level when they reach above 3 m (S&W: H > 3) and start near the ground. */
const SOLID_TOP = 3, SOLID_BASE = 2

function ringBox(r: Pt[]): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of r) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y }
  return b
}

export interface TowerZone { cx: number; cy: number; w: number; d: number; height: number; podiumH: number; box: Box }

/**
 * The top of the storeys stacked without a gap on a block: an imported tower comes as one prism per storey, so its
 * podium is as tall as its podium storeys reach together, and a 3 m ground storey under a tower is part of the tower.
 * Parametric towers come as prisms from grade to each block's top, which never stack, so they read as before.
 */
function stackTop(blocks: Prism[], b: Prism): number {
  let top = b.z1
  for (let grew = true; grew;) {
    grew = false
    for (const o of blocks) if (Math.abs(o.z0 - top) <= 0.05 && o.z1 > top + 1e-6) { top = o.z1; grew = true }
  }
  return top
}

export function towerZones(massing: MassingPayload): TowerZone[] {
  const out: TowerZone[] = []
  for (const t of massing.towers) {
    if (!t.blocks.length) continue
    const shaft = t.blocks.filter((b) => !b.podium)
    const plate = shaft.length ? shaft : t.blocks
    // S&W uses the base floor plate (fl.cx, fl.cy, fl.w, fl.d): here the bounding box of the lowest non-podium block.
    const z0 = Math.min(...plate.map((b) => b.z0))
    const base = plate.filter((b) => b.z0 <= z0 + 0.5)
    const bb = base.map((b) => ringBox(b.ring)).reduce(union)
    const all = t.blocks.map((b) => ringBox(b.ring)).reduce(union)
    // The podium's height is the top of its storeys stacked from grade (not the first storey's top).
    const pod = t.blocks.filter((b) => b.podium)
    const podiumH = Math.max(0, ...pod.filter((b) => b.z0 <= SOLID_BASE).map((b) => stackTop(pod, b)))
    const height = Number.isFinite(t.height) && t.height > 0 ? t.height : Math.max(...t.blocks.map((b) => b.z1))
    out.push({ cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, w: bb[2] - bb[0], d: bb[3] - bb[1], height, podiumH, box: all })
  }
  return out
}

// ---- trees and porous screens (G13, 21 Nov) --------------------------------------------------------------------------
/**
 * A tree at pedestrian level: a round crown in plan over a height band. Its drag is a canopy momentum sink,
 * S = −Cd · a · |u| u (the quadratic leaf-area drag of canopy-flow models: Shaw & Schumann 1992, Boundary-Layer
 * Meteorol. 61; as reviewed in Majumdar, Vita, Ramponi, Glover & van Reeuwijk 2024, "The drag length is key to
 * quantifying tree canopy drag", arXiv:2411.01570). Cd = 0.2, the value most urban CFD uses (range 0.1–0.3, per a
 * review citing Gromke et al. 2015; unverified against the original). Leaf area density a, in this order:
 *  • `lad` as given (m² of leaf per m³ of crown; CFD studies use 0.1–4, same review, unverified);
 *  • from `porosity` (the share of the view through the crown, 0 opaque … 1 bare): Beer–Lambert across the crown
 *    depth, porosity = exp(−G · a · D) with G = 0.5 for randomly oriented leaves and D the crown diameter
 *    (Campbell & Norman 1998, An Introduction to Environmental Biophysics; textbook, not re-checked here);
 *  • neither: the drag length of real trees, (a · Cd)⁻¹ ≈ 21 m (field median, Majumdar et al. 2024), a light crown and
 *    the cautious choice for a comfort check (the same paper finds simulations often use about 5 m, i.e. 4× the drag).
 */
export interface PorousTree {
  kind: 'tree'
  /** Crown centre in the project frame (m). */
  at: Pt
  /** Crown diameter (m). */
  crown: number
  /** Crown base (clear trunk) above grade (m); default 2 (team assumption). */
  base?: number
  /** Tree top above grade (m). */
  top: number
  /** Optical porosity of the crown, 0 (opaque) to 1 (no leaves). 1 is no obstacle. */
  porosity?: number
  /** Leaf area density (m²/m³); wins over `porosity`. */
  lad?: number
}
/**
 * A porous screen (fence, louvred or perforated wall, hedge drawn as a line): a pressure drop across it,
 * Δp = k · ½ρu² (the momentum-extraction form of windbreak models, Wilson 1985, J. Wind Eng. Ind. Aerodyn. 21), spread
 * over the one cell it crosses. k from the open share β of its face: the bleed ratio α = β^0.4 (Guan, Zhang & Zhu 2003,
 * Agric. For. Meteorol. 118: 75–84; the exponent is unverified against the full text) and the actuator-disc momentum
 * balance k = 4(1 − α)/α (team derivation; Rankine–Froude theory, small-k form). β 0.5 gives k ≈ 1.3, β 0.2 gives k ≈ 3.6.
 */
export interface PorousScreen {
  kind: 'screen'
  /** The screen's line in plan, project frame (m), two or more points. */
  line: Pt[]
  /** Bottom of the screen above grade (m); default 0. */
  base?: number
  /** Top of the screen above grade (m). */
  top: number
  /** Open share of the screen face, 0 (solid) to 1 (open). 1 is no obstacle. */
  porosity: number
}
export type PorousObstacle = PorousTree | PorousScreen

/** Canopy drag coefficient (see PorousTree). */
export const TREE_CD = 0.2
/** Drag length (a · Cd)⁻¹ of a tree when neither porosity nor leaf area density is given (m; Majumdar et al. 2024). */
export const TREE_DRAG_LENGTH = 21
/** Leaf-angle extinction coefficient G for the porosity → leaf area density step (spherical leaf angles). */
export const LEAF_G = 0.5
/**
 * The pedestrian layer a porous obstacle's drag is weighed over: its height band's share of the lowest 6 m (team
 * assumption: twice the 3 m solid threshold, so a crown above head height still shelters the walk below it in part
 * and a bare trunk does not; the flow over the top is not modelled, as for the solids).
 */
export const PED_LAYER = 6
/** Porosity is read no lower than this (a near-solid screen); draw a true wall as a building. */
const MIN_POROSITY = 0.01

const layerShare = (base: number, top: number) => Math.max(0, Math.min(top, PED_LAYER) - Math.max(0, base)) / PED_LAYER
const clampP = (p: number) => Math.min(1, Math.max(MIN_POROSITY, p))

/** Screen pressure-loss coefficient from the open share of its face (see PorousScreen). */
export function screenK(porosity: number): number {
  const a = Math.pow(clampP(porosity), 0.4)
  return (4 * (1 - a)) / a
}
/** A tree's drag per metre of crown, Cd · a (1/m) (see PorousTree). */
export function treeDrag(t: Pick<PorousTree, 'crown' | 'porosity' | 'lad'>): number {
  if (t.lad != null && Number.isFinite(t.lad)) return TREE_CD * Math.max(0, t.lad)
  if (t.porosity != null && Number.isFinite(t.porosity)) return t.porosity >= 1 ? 0 : (TREE_CD * -Math.log(clampP(t.porosity))) / (LEAF_G * Math.max(0.5, t.crown))
  return 1 / TREE_DRAG_LENGTH
}

/**
 * Drag on the ground grid: per cell, the coefficient K of the lattice sink u ← u / (1 + τ K |u|) (lattice units:
 * K = Cd · a · cell for a crown, ½ k for a screen one cell thick), each weighed by its share of the pedestrian layer.
 * Null when nothing drags (no obstacles, or every one fully open), so the run is the one without them, bit for bit.
 */
export function porousDrag(list: PorousObstacle[] | undefined, grid: Grid): Float32Array | null {
  if (!list?.length) return null
  const { nx, ny, cell: cs } = grid, drag = new Float32Array(nx * ny)
  let any = false
  const add = (k: number, v: number) => { drag[k] += v; any = true }
  for (const o of list) {
    if (!(Number.isFinite(o.top))) continue
    if (o.kind === 'tree') {
      const share = layerShare(o.base ?? 2, o.top), r = o.crown / 2
      const K = treeDrag(o) * cs * share
      if (!(K > 0) || !(r > 0) || !o.at || !Number.isFinite(o.at[0]) || !Number.isFinite(o.at[1])) continue
      const i0 = Math.max(0, Math.floor((o.at[0] - r - grid.x0) / cs)), i1 = Math.min(nx - 1, Math.floor((o.at[0] + r - grid.x0) / cs))
      const j0 = Math.max(0, Math.floor((o.at[1] - r - grid.y0) / cs)), j1 = Math.min(ny - 1, Math.floor((o.at[1] + r - grid.y0) / cs))
      let hit = 0
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (Math.hypot(grid.x0 + (i + 0.5) * cs - o.at[0], grid.y0 + (j + 0.5) * cs - o.at[1]) <= r) { add(j * nx + i, K); hit++ }
      }
      // A crown smaller than a cell: its drag on the cell it stands in, by its share of the cell's area.
      if (!hit) {
        const i = Math.floor((o.at[0] - grid.x0) / cs), j = Math.floor((o.at[1] - grid.y0) / cs)
        if (i >= 0 && j >= 0 && i < nx && j < ny) add(j * nx + i, K * Math.min(1, (Math.PI * r * r) / (cs * cs)))
      }
    } else {
      const K = 0.5 * screenK(o.porosity) * layerShare(o.base ?? 0, o.top)
      if (!(K > 0) || !o.line || o.line.length < 2) continue
      const cells = new Set<number>()
      for (let s = 1; s < o.line.length; s++) {
        const [ax, ay] = o.line[s - 1], [bx, by] = o.line[s]
        if (![ax, ay, bx, by].every(Number.isFinite)) continue
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cs / 4)))
        for (let q = 0; q <= n; q++) {
          const i = Math.floor((ax + ((bx - ax) * q) / n - grid.x0) / cs), j = Math.floor((ay + ((by - ay) * q) / n - grid.y0) / cs)
          if (i >= 0 && j >= 0 && i < nx && j < ny) cells.add(j * nx + i)
        }
      }
      for (const k of cells) add(k, K)
    }
  }
  return any ? drag : null
}

/** Distance from a point to a box (0 inside). */
export type Box = [number, number, number, number]
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]

const boxDist = (x: number, y: number, b: Box) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]))

// ---- the lattice-Boltzmann run (S&W runWind) ------------------------------------------------------------------------
const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1], EY = [0, 0, 1, 0, -1, 1, 1, -1, -1], OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6]
const W0 = 4 / 9, W1 = 1 / 9, W2 = 1 / 36

/** Neighbour of each cell in each of the 9 directions on the periodic grid, with bounce-back marked as −1. */
function neighbours(solid: Uint8Array, nx: number, ny: number): Int32Array {
  const N = nx * ny, nb = new Int32Array(9 * N)
  for (let k = 0; k < N; k++) {
    const x = k % nx, y = (k / nx) | 0
    for (let i = 0; i < 9; i++) {
      const kn = ((y + EY[i] + ny) % ny) * nx + ((x + EX[i] + nx) % nx)
      nb[i * N + k] = solid[kn] ? -1 : kn
    }
  }
  return nb
}

/**
 * D2Q9 BGK flow driven by a body force toward `toDeg` (frame azimuth, clockwise from +y), as S&W runWind: τ 0.58, the
 * force adjusted each step to hold a mean lattice speed of 0.05, speeds capped at 0.25 in the equilibrium, max(nx, ny)
 * × 3.2 steps. Collision and streaming are fused into one pass (same arithmetic, same result as S&W's two loops).
 * `drag` (porousDrag) adds a quadratic momentum sink per cell, taken semi-implicitly so it stays stable at any
 * strength: the equilibrium velocity u* (after the body force) becomes u* / (1 + τ K |u*|), which removes about
 * ρ K |u| u of momentum a step (the forcing is S&W's velocity shift, so a step's change is τ × force / ρ).
 */
export function lbmRun(solid: Uint8Array, nx: number, ny: number, toDeg: number, drag: Float32Array | null = null): { ux: Float32Array; uy: Float32Array } {
  const N = nx * ny, nb = neighbours(solid, nx, ny)
  let f = new Float32Array(9 * N), g = new Float32Array(9 * N)
  const wts = [W0, W1, W1, W1, W1, W2, W2, W2, W2]
  for (let i = 0; i < 9; i++) f.fill(wts[i], i * N, (i + 1) * N)
  const th = toDeg * Math.PI / 180, fx0 = Math.sin(th), fy0 = Math.cos(th)
  const tau = 0.58, uT = 0.05, it = 1 / tau
  let F = 2e-5
  const steps = Math.round(Math.max(nx, ny) * 3.2)
  const ux = new Float32Array(N), uy = new Float32Array(N)
  const N2 = 2 * N, N3 = 3 * N, N4 = 4 * N, N5 = 5 * N, N6 = 6 * N, N7 = 7 * N, N8 = 8 * N
  for (let s = 0; s < steps; s++) {
    let umean = 0, cnt = 0
    const Fx = F * fx0 * tau, Fy = F * fy0 * tau
    for (let k = 0; k < N; k++) {
      if (solid[k]) continue
      const f0 = f[k], f1 = f[N + k], f2 = f[N2 + k], f3 = f[N3 + k], f4 = f[N4 + k], f5 = f[N5 + k], f6 = f[N6 + k], f7 = f[N7 + k], f8 = f[N8 + k]
      const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8
      let vx = (f1 - f3 + f5 - f6 - f7 + f8) / rho + Fx / rho
      let vy = (f2 - f4 + f5 + f6 - f7 - f8) / rho + Fy / rho
      if (drag) { const K = drag[k]; if (K > 0) { const d = 1 / (1 + tau * K * Math.sqrt(vx * vx + vy * vy)); vx *= d; vy *= d } }
      ux[k] = vx; uy[k] = vy
      const ax = ux[k], ay = uy[k]
      const sp = Math.sqrt(vx * vx + vy * vy)
      if (sp > 0.25) { vx *= 0.25 / sp; vy *= 0.25 / sp }
      const usq = 1.5 * (vx * vx + vy * vy)
      const r0 = W0 * rho, r1 = W1 * rho, r2 = W2 * rho
      let eu: number
      // post-collision values, streamed straight to the neighbours (bounce-back where the neighbour is solid)
      const p0 = f0 - (f0 - r0 * (1 - usq)) * it
      eu = 3 * vx; const p1 = f1 - (f1 - r1 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = 3 * vy; const p2 = f2 - (f2 - r1 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = -3 * vx; const p3 = f3 - (f3 - r1 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = -3 * vy; const p4 = f4 - (f4 - r1 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = 3 * (vx + vy); const p5 = f5 - (f5 - r2 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = 3 * (-vx + vy); const p6 = f6 - (f6 - r2 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = 3 * (-vx - vy); const p7 = f7 - (f7 - r2 * (1 + eu + 0.5 * eu * eu - usq)) * it
      eu = 3 * (vx - vy); const p8 = f8 - (f8 - r2 * (1 + eu + 0.5 * eu * eu - usq)) * it
      g[k] = p0
      let q: number
      q = nb[N + k]; if (q < 0) g[N3 + k] = p1; else g[N + q] = p1
      q = nb[N2 + k]; if (q < 0) g[N4 + k] = p2; else g[N2 + q] = p2
      q = nb[N3 + k]; if (q < 0) g[N + k] = p3; else g[N3 + q] = p3
      q = nb[N4 + k]; if (q < 0) g[N2 + k] = p4; else g[N4 + q] = p4
      q = nb[N5 + k]; if (q < 0) g[N7 + k] = p5; else g[N5 + q] = p5
      q = nb[N6 + k]; if (q < 0) g[N8 + k] = p6; else g[N6 + q] = p6
      q = nb[N7 + k]; if (q < 0) g[N5 + k] = p7; else g[N7 + q] = p7
      q = nb[N8 + k]; if (q < 0) g[N6 + k] = p8; else g[N8 + q] = p8
      umean += Math.sqrt(ax * ax + ay * ay) * (fx0 * ax + fy0 * ay > 0 ? 1 : 0.5); cnt++
    }
    umean /= Math.max(1, cnt)
    F = Math.max(0, F + Math.max(-1e-5, Math.min(1e-5, (uT - umean) * 4e-5)))
    const t = f; f = g; g = t
  }
  return { ux, uy }
}

/**
 * Speed-up over the free stream: |u| over the mean |u| of the open cells more than 24 m from any wall (S&W runWind).
 * Trees and screens count as walls for that distance (`near`), so their lee is not read as the free stream.
 */
function speedUp(solid: Uint8Array, nx: number, ny: number, cs: number, u: { ux: Float32Array; uy: Float32Array }, near: Float32Array | null = null): Float32Array {
  const N = nx * ny, dist = new Float32Array(N).fill(1e9)
  for (let k = 0; k < N; k++) {
    if (!solid[k] && !(near && near[k] > 0)) continue
    const x = k % nx, y = (k / nx) | 0
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue
      const j = yy * nx + xx, dd = Math.hypot(dx, dy) * cs
      if (dd < dist[j]) dist[j] = dd
    }
  }
  let ref = 0, rc = 0
  for (let k = 0; k < N; k++) if (!solid[k] && dist[k] > 24) { ref += Math.hypot(u.ux[k], u.uy[k]); rc++ }
  ref = ref / Math.max(1, rc) || 1
  const ratio = new Float32Array(N)
  for (let k = 0; k < N; k++) ratio[k] = solid[k] ? 0 : Math.hypot(u.ux[k], u.uy[k]) / ref
  return ratio
}

// ---- the study (S&W runWindStudy + summarise) ----------------------------------------------------------------------
export interface WindOptions {
  season: Season
  /** Cell size, m (S&W: 4). */
  cell: number
  /** Reference wind: the airport's 10 m wind as is (S&W, default) or carried to the urban site (S&W siteWind). */
  ref?: 'airport' | 'site'
  /** Hours of a day range instead of the season (the Studio's time period). */
  range?: { d0: number; d1: number }
  /** One wind case instead of the rose (the Studio's "one wind case"): from `dir` ° true north at `speed` m/s at 10 m. */
  single?: { dir: number; speed: number }
  /** Trees and porous screens on the ground (project frame), read as drag in both runs (with and without the towers). */
  porous?: PorousObstacle[]
}

const NAMES16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass16 = (deg: number) => NAMES16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
/** A rose of one wind case: every hour from one direction at one speed. */
export function singleRose(dir: number, speed: number): Rose {
  return { sectors: [{ dir, name: compass16(dir), f: 1, s: speed, ws: Float32Array.of(speed) }], hours: 1, calm: 0 }
}

export interface WindStudy {
  grid: Grid
  /** Period mean pedestrian wind (m/s) with the towers; NaN in buildings. */
  mean: Float32Array
  /** The same without the towers (context only); NaN in buildings. */
  meanB: Float32Array
  solid: Uint8Array
  /** Open ground the shares are read on (within `studyR` of the towers). */
  study: Uint8Array
  studyR: number
  studyArea: number
  /** Area (m²) per Lawson band on the study ground, with and without the towers. */
  cats: number[]
  catsB: number[]
  worse: number
  better: number
  maxS: number
  /** Highest mean on the open ground inside the site boundary (S&W "plaza peak"), null without a boundary. */
  sitePeak: number | null
  sitePeakMean: number | null
  /** Study ground with gusts (1.8 × mean) over 6 m/s in more than 5% of the hours, with and without the towers (m²). */
  gusty: number
  gustyB: number
  /** Study ground over the Lawson safety limit (m²), and the worst cell's share of hours over 15 m/s. */
  unsafe: number
  unsafeWorst: number
  rose: Rose
  /** Downwash amplification used for each tower. */
  amps: { amp: number; amp0: number; hn: number }[]
  /** Each wind sector's share of the hours, 10 m speed, the mean it gives over the study ground and the ground it makes a band windier. */
  sectors: { name: string; dir: number; f: number; s: number; groundMean: number; worse: number }[]
  runs: number
  /** Open ground under trees and screens that drag at pedestrian level (m²); 0 without any. */
  porousArea: number
}

export function runWindStudy(site: SitePayload, massing: MassingPayload, C: ClimatePayload, opt: WindOptions): WindStudy {
  const towers = towerZones(massing)
  const cs = opt.cell
  // Deviation: a square domain around the towers (and site), half-size = towers' half-extent + study radius + 100 m of
  // run-out for the periodic wake, at most S&W's 340 m.
  const Hmax = Math.max(...towers.map((t) => t.height))
  const studyR = Math.min(150, Math.max(50, 0.5 * Hmax))
  const bx = towers.map((t) => t.box).reduce(union)
  const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2
  const half = Math.min(340, Math.max(bx[2] - bx[0], bx[3] - bx[1]) / 2 + studyR + 100)
  const n = Math.ceil((2 * half) / cs)
  const grid: Grid = { x0: cx - (n * cs) / 2, y0: cy - (n * cs) / 2, cell: cs, nx: n, ny: n }
  const nx = n, ny = n, N = nx * ny, cellA = cs * cs

  // solids: context and towers taller than 3 m at pedestrian level
  const solidB = new Uint8Array(N)
  for (const p of site.context) if (p.z1 > SOLID_TOP && p.z0 <= SOLID_BASE) fillPolygon(solidB, grid, p.ring)
  const solid = solidB.slice()
  // A tower's storey counts with the storeys stacked on it (an imported 3 m ground storey under a tower is a wall).
  for (const t of massing.towers) for (const b of t.blocks) if (b.z0 <= SOLID_BASE && (b.z1 > SOLID_TOP || stackTop(t.blocks, b) > SOLID_TOP)) fillPolygon(solid, grid, b.ring)
  // trees and screens: drag per cell on the open ground
  const drag = porousDrag(opt.porous, grid)
  let porousArea = 0
  if (drag) for (let k = 0; k < N; k++) { if (solid[k]) drag[k] = 0; else if (drag[k] > 0) porousArea += cellA }

  // neighbours' mean height within 120 m of each tower (S&W: siteRaster.bld, default 20 m) → downwash amplification
  const ctx = site.context.filter((p) => p.z1 >= 3).map((p) => { const b = ringBox(p.ring); return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, top: p.z1 } })
  const amps = towers.map((t) => {
    let hs = 0, hc = 0
    for (const b of ctx) if (Math.hypot(b.x - t.cx, b.y - t.cy) < 120) { hs += b.top; hc++ }
    const hn = hc ? hs / hc : 20
    const amp0 = Math.min(2.1, Math.max(1, 1 + 0.45 * Math.log2(t.height / Math.max(8, hn))))
    // a podium catches the downwash (S&W: k = 1 − 0.8 · min(1, podium height / 30))
    const amp = t.podiumH > 0 ? 1 + (amp0 - 1) * (1 - 0.8 * Math.min(1, t.podiumH / 30)) : amp0
    return { amp, amp0, hn }
  })

  // study ground and site ground
  const study = new Uint8Array(N), inSite = new Uint8Array(N)
  if (site.ring) fillPolygon(inSite, grid, site.ring)
  let studyArea = 0
  for (let k = 0; k < N; k++) {
    if (solid[k]) { inSite[k] = 0; continue }
    const x = grid.x0 + ((k % nx) + 0.5) * cs, y = grid.y0 + (((k / nx) | 0) + 0.5) * cs
    if (towers.some((t) => boxDist(x, y, t.box) <= studyR)) { study[k] = 1; studyArea += cellA }
  }

  const rose = opt.single ? singleRose(opt.single.dir, opt.single.speed) : windRose(C, opt.season, opt.range)
  const kSite = siteWindFactor(), kRef = opt.ref === 'site' ? kSite : 1
  const mean = new Float32Array(N), meanB = new Float32Array(N), pOver6 = new Float32Array(N), pOver6B = new Float32Array(N)
  const over15 = new Float32Array(N)
  let runs = 0
  const sectors: WindStudy['sectors'] = []
  const hasContext = solidB.some((v) => v) || !!drag
  for (const r of rose.sectors) {
    if (!(r.f > 0)) continue
    // wind from r.dir (true north) → frame azimuth r.dir + northDeg; the flow goes the opposite way (S&W: dir + 180)
    const fromFrame = r.dir + site.northDeg, to = fromFrame + 180
    const th = to * Math.PI / 180, fx0 = Math.sin(th), fy0 = Math.cos(th)
    const ratio = speedUp(solid, nx, ny, cs, lbmRun(solid, nx, ny, to, drag), drag); runs++
    // Without the towers: a context-free domain is a uniform stream (speed-up 1), so the run is skipped then.
    let ratioB: Float32Array
    if (hasContext) { ratioB = speedUp(solidB, nx, ny, cs, lbmRun(solidB, nx, ny, to, drag), drag); runs++ } else ratioB = new Float32Array(N).fill(1)
    // downwash in front of each tower's windward face (S&W runWind zone)
    towers.forEach((t, ti) => {
      const amp = amps[ti].amp, depth = 0.22 * t.height, hw = Math.max(t.w, t.d) * 0.6
      if (amp <= 1) return
      for (let k = 0; k < N; k++) {
        if (solid[k]) continue
        const x = grid.x0 + ((k % nx) + 0.5) * cs - t.cx, y = grid.y0 + (((k / nx) | 0) + 0.5) * cs - t.cy
        const along = -(x * fx0 + y * fy0), across = Math.abs(-x * fy0 + y * fx0)
        if (along > 0 && along < depth && across < hw) ratio[k] *= 1 + (amp - 1) * (1 - along / depth)
      }
    })
    // the season's hours in this sector over the safety speed: ratio · k · ws > 15 ⇔ ws > 15 / (ratio · k) (ws sorted)
    const ws = r.ws, nws = ws.length
    let gs = 0, gn = 0, gw = 0
    for (let k = 0; k < N; k++) {
      if (solid[k]) continue
      const sa = ratio[k] * r.s * kRef, sb = solidB[k] ? sa : ratioB[k] * r.s * kRef
      mean[k] += r.f * sa; meanB[k] += r.f * sb
      if (study[k]) { gs += sa; gn++; if (lawsonClass(sa) > lawsonClass(sb)) gw += cellA }
      if (sa * GUST > 6) pOver6[k] += r.f
      if (sb * GUST > 6) pOver6B[k] += r.f
      if (study[k] && ratio[k] > 0 && nws && ws[nws - 1] * ratio[k] * kSite > SAFETY.speed) {
        const lim = SAFETY.speed / (ratio[k] * kSite)
        let lo = 0, hi = nws
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ws[mid] > lim) hi = mid; else lo = mid + 1 }
        over15[k] += nws - lo
      }
    }
    sectors.push({ name: r.name, dir: r.dir, f: r.f, s: r.s, groundMean: gn ? gs / gn : 0, worse: gw })
  }

  const cats = [0, 0, 0, 0, 0], catsB = [0, 0, 0, 0, 0]
  let worse = 0, better = 0, maxS = 0, gusty = 0, gustyB = 0, unsafe = 0, unsafeWorst = 0
  let sitePeak = -1, siteSum = 0, siteN = 0
  for (let k = 0; k < N; k++) {
    if (solid[k]) { mean[k] = NaN; meanB[k] = NaN; continue }
    if (inSite[k]) { if (mean[k] > sitePeak) sitePeak = mean[k]; siteSum += mean[k]; siteN++ }
    if (!study[k]) continue
    const s = mean[k], sb = meanB[k], a = lawsonClass(s), b = lawsonClass(sb)
    cats[a] += cellA; catsB[b] += cellA
    if (a > b) worse += cellA
    if (a < b) better += cellA
    if (s > maxS) maxS = s
    if (pOver6[k] > 0.05) gusty += cellA
    if (pOver6B[k] > 0.05) gustyB += cellA
    const sh = rose.hours ? over15[k] / rose.hours : 0
    if (sh > unsafeWorst) unsafeWorst = sh
    if (sh > SAFETY.share) unsafe += cellA
  }
  for (let k = 0; k < N; k++) if (solidB[k]) meanB[k] = NaN
  return {
    grid, mean, meanB, solid, study, studyR, studyArea, cats, catsB, worse, better, maxS,
    sitePeak: siteN ? sitePeak : null, sitePeakMean: siteN ? siteSum / siteN : null,
    gusty, gustyB, unsafe, unsafeWorst, rose, amps, runs, sectors, porousArea,
  }
}
