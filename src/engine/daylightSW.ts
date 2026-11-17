// Climate-based daylight for LEED v4.1 EQ Daylight, as Sinnie Choi's Sun & Wind Studio computes it: a TypeScript port of
// her physics.js (NOAA sun position for every hour of the CWEC typical year, Perez 1990 all-weather sky on each vertical
// face, Perez 1990 luminous efficacy, LM-83 occupied hours 8:00–18:00 clock time) and the daylight half of study.js
// (daylightFloor, dlSky, obstructionAngles, dfFactor, aseHours, aseFloor, daylightTower, aseTower, floorSig, zoneFor,
// band, edgesOf, stratParts, cardinalOf, periodInfo) with core.js maskLoops / toLocal, at her commit c24addb (16 Nov 2026).
//
// Per floor cell (1 m, every 2nd cell and every 2nd day as her tower run does): the sky component from sixteen sight lines
// to the glass under the CIE overcast sky, the light off the neighbours (BRE externally reflected component, obstruction
// angle from the context buildings within 160 m) and the BRE split-flux internally reflected component give the daylight
// factor; each face's window is then lit hour by hour by its own Perez sky to give daylight autonomy DA300, sDA300/50%
// and UDI 100–3000 lux (direct sun left to the blinds, as LM-83 does for sDA). ASE1000/250h walks one ray per 2° of
// sun azimuth and counts the occupied hours with ≥ 1,000 lux of direct sun through the window band after the zone's
// shading device. Her frame: +y is north, plates turn counter-clockwise by `rot` radians, faces are the four cardinal ones.
//
// Checked against her own code: tools/sunwind-daylight-fixtures.cjs records src/engine/daylight.fixtures.json and
// daylightSW.test.ts reproduces every case. The same Float32 / Float64 arrays as hers, in the same order, so the numbers
// agree to the last bit or nearly so.

export type Ori = 'N' | 'E' | 'S' | 'W'
export const ORI: Ori[] = ['N', 'E', 'S', 'W']
export const FACE_AZ: Record<Ori, number> = { N: 0, E: 90, S: 180, W: 270 }
/** Slab gap between floor plates (study.js GAP): the window band sits in f.h − GAP. */
export const GAP = 0.45

export type StratId = 'curtain' | 'punched' | 'overhang' | 'louvres' | 'fins' | 'eggcrate' | 'lightshelf' | 'balcony' | 'doubleskin' | 'pvspandrel' | 'greenwall' | 'windscreen'
/** Her façade strategy catalogue (study.js STRATS), the fields daylight reads: an external device, a solar modifier, her name. */
export const STRATS: Record<StratId, { name: string; device: boolean; mod?: number; ventBoost?: number }> = {
  curtain: { name: 'Curtain wall', device: false },
  punched: { name: 'Punched windows · deep reveals', device: true },
  overhang: { name: 'Horizontal overhang', device: true },
  louvres: { name: 'Horizontal louvres', device: true },
  fins: { name: 'Vertical fins', device: true },
  eggcrate: { name: 'Egg-crate', device: true },
  lightshelf: { name: 'Light shelf', device: true },
  balcony: { name: 'Balconies as overhangs', device: true },
  doubleskin: { name: 'Double-skin façade', device: false, mod: 0.65, ventBoost: 1.6 },
  pvspandrel: { name: 'PV spandrel', device: false },
  greenwall: { name: 'Planted spandrel · green wall', device: false },
  windscreen: { name: 'Terrace wind screens', device: false },
}

/** A façade strategy zone (her SW.zones): a face (or all), a level range, a strategy, glazing ratio and device depth. */
export interface Zone { face: Ori | 'all'; from: number; to: number; strat: StratId; wwr: number; shgc: number; depth: number; pv: number; operable: boolean }
export const DEFAULT_ZONE: Zone = { face: 'all', from: 1, to: 999, strat: 'curtain', wwr: 0.4, shgc: 0.4, depth: 0, pv: 0, operable: false }
/** Her default façade (study.js DEFAULT_ZONES): curtain wall north, fins east and west, an overhang south. */
export const DEFAULT_ZONES: Zone[] = [
  { face: 'N', from: 1, to: 999, strat: 'curtain', wwr: 0.35, shgc: 0.35, depth: 0, pv: 0, operable: true },
  { face: 'E', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.35, depth: 0.6, pv: 0, operable: true },
  { face: 'S', from: 1, to: 999, strat: 'overhang', wwr: 0.45, shgc: 0.35, depth: 0.9, pv: 0, operable: true },
  { face: 'W', from: 1, to: 999, strat: 'fins', wwr: 0.4, shgc: 0.35, depth: 0.8, pv: 0, operable: true },
]
/** Her daylight constants (study.js DL_R): reflectances, maintenance factor, UDI limits, sixteen sight lines. */
export const DL_R = { floor: 0.2, wall: 0.5, ceil: 0.8, erc: 0.2, maint: 0.9, udiLo: 100, udiHi: 3000, rays: 16 } as const
/** Her default glass visible transmittance (SW.glaz.vt) and sDA target (SW.dl.target, lux). */
export const DEFAULT_VT = 0.6
export const DEFAULT_TARGET = 300

/** Share of CIE overcast horizontal illuminance per radian of azimuth from altitudes with sines s1..s2. */
const cieBand = (s1: number, s2: number) => (3 * ((s2 * s2 - s1 * s1) / 2 + (2 * (s2 * s2 * s2 - s1 * s1 * s1)) / 3)) / (7 * Math.PI)
/** Share of a vertical window's sky light coming from above an obstruction angle t. */
const vertSkyAbove = (t: number) => 1 - (t / 2 + Math.sin(2 * t) / 4) / (Math.PI / 4)

// ------------------------------------------------------------------------------------------------ physics.js

/** The hourly climate (her LAB.CLIMATE after weather.json): station, monthly clock offsets, days per month, 8,760 hours. */
export interface HourlyClimate { lat: number; lon: number; elev: number | null; tz: number[]; days: number[]; t: ArrayLike<number>; ghi: ArrayLike<number>; dni: ArrayLike<number>; dhi: ArrayLike<number>
  /** Hourly wind speed (m/s at the station), direction (deg) and rain (mm), for ventilation; zeros when absent. */
  ws?: ArrayLike<number>; wd?: ArrayLike<number>; rain?: ArrayLike<number> }

const PZ = [[-0.008, 0.588, -0.062, -0.060, 0.072, -0.022], [0.130, 0.683, -0.151, -0.019, 0.066, -0.029], [0.330, 0.487, -0.221, 0.055, -0.064, -0.026], [0.568, 0.187, -0.295, 0.109, -0.152, -0.014],
  [0.873, -0.392, -0.362, 0.226, -0.462, 0.001], [1.132, -1.237, -0.412, 0.288, -0.823, 0.056], [1.060, -1.600, -0.359, 0.264, -1.127, 0.131], [0.678, -0.327, -0.250, 0.156, -1.377, 0.251]]
const EPS = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2]
const DIF = { a: [97.24, 107.22, 104.97, 102.39, 100.71, 106.42, 141.88, 152.23], b: [-0.46, 1.15, 2.96, 5.59, 5.94, 3.83, 1.90, 0.35], c: [12.00, 0.59, -5.53, -13.95, -22.75, -36.15, -53.24, -45.27], d: [-8.91, -3.95, -8.77, -13.90, -23.74, -28.83, -14.03, -7.98] }
const DIR = { a: [57.20, 98.99, 109.83, 110.34, 106.36, 107.19, 105.75, 101.18], b: [-4.55, -3.46, -4.90, -5.84, -3.97, -1.25, 0.77, 1.58], c: [-2.98, -1.21, -1.71, -1.99, -1.75, -1.51, -1.26, -1.10], d: [117.12, 12.38, -8.81, -4.56, -6.16, -26.73, -34.44, -8.29] }
const EXT_ILL = [131153, 130613, 128992, 126816, 124731, 123240, 122652, 123120, 124576, 126658, 128814, 130471]
export const ALBEDO = 0.2

/** NOAA solar position (physics.js sunAt): altitude, azimuth from north clockwise, cosine of the zenith. */
export function sunAt(lat: number, lon: number, doy: number, hour: number, tz: number) {
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const ha = (((hour * 60 + eq + 4 * lon - 60 * tz) / 4 - 180) * Math.PI) / 180
  const cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha); const zen = Math.acos(Math.max(-1, Math.min(1, cz)))
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(decl) - Math.sin(lat) * cz) / (Math.cos(lat) * Math.sin(zen) || 1e-9)))); if (ha > 0) az = 2 * Math.PI - az
  return { alt: Math.PI / 2 - zen, az, cz }
}

export interface FaceSky { az: number; sky: Float32Array; gnd: Float32Array; beam: Float32Array; skyL: Float32Array; gndL: Float32Array; beamL: Float32Array }
/** Every hour of the typical year: sun, Perez sky state, luminous efficacy, the LM-83 occupied hours (physics.js prep). */
export interface SkyPrep {
  n: number; doy: Int16Array; mon: Int8Array; hr: Int8Array; alt: Float32Array; az: Float32Array; cz: Float32Array
  T: Float32Array; ghi: Float32Array; dni: Float32Array; dhi: Float32Array
  F1: Float32Array; F2: Float32Array; effD: Float32Array; effB: Float32Array; Ed: Float32Array; Eb: Float32Array
  occ: Int32Array
  /** Station wind, direction and rain by hour; the ASHRAE 55 prevailing mean outdoor temperature and daily means. */
  ws: Float32Array; wd: Float32Array; rain: Float32Array; tpma: Float32Array; daily: Float32Array
  faces: Map<number, FaceSky>
}
export function prep(C: HourlyClimate): SkyPrep {
  const n = 8760, lat = (C.lat * Math.PI) / 180, lon = C.lon
  const o: SkyPrep = { n, doy: new Int16Array(n), mon: new Int8Array(n), hr: new Int8Array(n), alt: new Float32Array(n), az: new Float32Array(n), cz: new Float32Array(n),
    T: Float32Array.from(C.t), ghi: Float32Array.from(C.ghi), dni: Float32Array.from(C.dni), dhi: Float32Array.from(C.dhi),
    F1: new Float32Array(n), F2: new Float32Array(n), effD: new Float32Array(n), effB: new Float32Array(n), Ed: new Float32Array(n), Eb: new Float32Array(n), occ: new Int32Array(0),
    ws: Float32Array.from(C.ws ?? new Array(n).fill(0)), wd: Float32Array.from(C.wd ?? new Array(n).fill(0)), rain: Float32Array.from(C.rain ?? new Array(n).fill(0)), tpma: new Float32Array(n), daily: new Float32Array(365), faces: new Map() }
  const mStart: number[] = []; { let s = 0; for (let m = 0; m < 12; m++) { mStart.push(s); s += C.days[m] } }
  for (let k = 0; k < n; k++) {
    const doy = Math.floor(k / 24) + 1, he = (k % 24) + 1; let m = 11; for (let q = 0; q < 12; q++) { if (doy <= mStart[q] + C.days[q]) { m = q; break } }
    o.doy[k] = doy; o.mon[k] = m; o.hr[k] = he; const p = sunAt(lat, lon, doy, he - 0.5, -8); o.alt[k] = p.alt; o.az[k] = p.az; o.cz[k] = p.cz
    const dhi = o.dhi[k], dni = o.dni[k]; if (p.alt <= 0.01 || dhi <= 0) continue
    const z = Math.PI / 2 - p.alt; const zeta = 1.041 * z * z * z; const eps = ((dhi + dni) / (dhi + 1e-4) + zeta) / (1 + zeta); let b = 0; while (b < 7 && eps > EPS[b]) b++
    const altD = (p.alt * 180) / Math.PI; const am = (1 - (0.1 * (C.elev || 4)) / 1000) / (Math.sin(p.alt) + 0.15 / Math.pow(altD + 3.885, 1.253))
    const delta = (dhi * 93.73 * am) / EXT_ILL[m]; const c = PZ[b]
    o.F1[k] = Math.max(0, c[0] + c[1] * delta + c[2] * z); o.F2[k] = c[3] + c[4] * delta + c[5] * z
    const W = Math.exp(0.07 * (o.T[k] - 3) - 0.075) // precipitable water from a dew point ~3 K under air temperature (her note)
    o.effD[k] = Math.max(0, DIF.a[b] + DIF.b[b] * W + DIF.c[b] * p.cz + DIF.d[b] * Math.log(Math.max(1e-4, delta)))
    o.effB[k] = Math.max(0, DIR.a[b] + DIR.b[b] * W + DIR.c[b] * Math.exp(5.73 * z - 5) + DIR.d[b] * delta)
    o.Ed[k] = dhi * o.effD[k]; o.Eb[k] = dni * o.effB[k]
  }
  // occupied hours, LM-83: 8:00 to 18:00 local clock time (daylight saving from the climate's monthly offsets) → hour-ending in standard time
  const occ: number[] = []; for (let k = 0; k < n; k++) { const m = o.mon[k]; const dst = (C.tz[m] || -8) + 8; const clockEnd = o.hr[k] + dst; if (clockEnd >= 9 && clockEnd <= 18) occ.push(k) }
  o.occ = Int32Array.from(occ)
  // ASHRAE 55 prevailing mean outdoor temperature: mean of the previous seven daily means
  const dm = o.daily; for (let d = 0; d < 365; d++) { let s = 0; for (let q = 0; q < 24; q++) s += o.T[d * 24 + q]; dm[d] = s / 24 }
  for (let d = 0; d < 365; d++) { let s = 0; for (let q = 1; q <= 7; q++) s += dm[(d - q + 365) % 365]; const v = s / 7; for (let q = 0; q < 24; q++) o.tpma[d * 24 + q] = v }
  return o
}
/** Irradiance (W/m²) and illuminance (lux) on a vertical face of compass azimuth az (deg) for every hour, Perez 1990 (physics.js face). */
export function face(P: SkyPrep, az: number): FaceSky {
  const key = Math.round(((az % 360) + 360) % 360); const hit = P.faces.get(key); if (hit) return hit
  const n = P.n, a0 = (key * Math.PI) / 180, b85 = Math.cos((85 * Math.PI) / 180)
  const sky = new Float32Array(n), gnd = new Float32Array(n), beam = new Float32Array(n), skyL = new Float32Array(n), gndL = new Float32Array(n), beamL = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    if (P.alt[k] <= 0.01) continue; const cosT = Math.cos(P.alt[k]) * Math.cos(P.az[k] - a0); const a = Math.max(0, cosT), b = Math.max(b85, P.cz[k])
    const s = Math.max(0, P.dhi[k] * ((1 - P.F1[k]) * 0.5 + (P.F1[k] * a) / b + P.F2[k])); sky[k] = s; beam[k] = P.dni[k] * a; gnd[k] = P.ghi[k] * ALBEDO * 0.5
    skyL[k] = s * P.effD[k]; beamL[k] = beam[k] * P.effB[k]; gndL[k] = (P.Eb[k] * P.cz[k] + P.Ed[k]) * ALBEDO * 0.5
  }
  const f: FaceSky = { az: key, sky, gnd, beam, skyL, gndL, beamL }; P.faces.set(key, f); return f
}
/** Compass azimuth offset of a floor's faces: its rotation folded into ±45° (physics.js faceOffset). */
export function faceOffset(rot: number) { const d = ((((rot * 180) / Math.PI) % 90) + 90) % 90; return -(d > 45 ? d - 90 : d) }

// ------------------------------------------------------------------------------------------------ the period

export interface DlPeriod { from: string; to: string }
export interface DlPeriodInfo { d0: number; d1: number; days: number; full: boolean; label: string }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Month-day to month-day of any year (study.js periodInfo). */
export function periodInfo(p: DlPeriod, days: number[]): DlPeriodInfo {
  const parse = (s: string) => { const q = String(s || '01-01').split('-'); const m = Math.min(12, Math.max(1, parseInt(q[0], 10) || 1)) - 1; const d = Math.min(days[m], Math.max(1, parseInt(q[1], 10) || 1)); return { m, d } }
  const doyOf = (m: number, d: number) => { let n = 0; for (let i = 0; i < m; i++) n += days[i]; return n + d }
  const a = parse(p.from), b = parse(p.to); const d0 = doyOf(a.m, a.d), d1 = doyOf(b.m, b.d)
  const nd = d1 >= d0 ? d1 - d0 + 1 : 365 - d0 + 1 + d1; const full = nd >= 365
  return { d0, d1, days: nd, full, label: full ? 'whole year' : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}` }
}
export const inPeriod = (PI: DlPeriodInfo, doy: number) => PI.full || (PI.d1 >= PI.d0 ? doy >= PI.d0 && doy <= PI.d1 : doy >= PI.d0 || doy <= PI.d1)

// ------------------------------------------------------------------------------------------------ floors

/** A floor plate in her terms: 1 m cells of a w × d grid in the plate's own frame (centre cx, cy; turned rot radians). */
export interface DlMask { nx: number; ny: number; x0: number; y0: number; cells: Uint8Array }
export interface DlFloor {
  /** 0-based index (level = i + 1, which the zones' from/to read). */
  i: number
  /** Floor level and floor-to-floor (m). */
  z: number; h: number
  w: number; d: number; cx: number; cy: number; rot: number
  /** Core side (m), a square centred on the tower position. */
  core: number
  /** Plate area as her finishMask counts it (w × d × solid share). */
  area: number
  mask: DlMask
  /** Window head by face from an uploaded model, or the ceiling height (hers; absent for the Toolkit's plates). */
  open?: Partial<Record<Ori, [number, number]>>; ceil?: number
}
/** Her newMask + finishMask: a w × d grid of 1 m cells, solid where `inside(lx, ly)` holds at the cell centre (all when absent); the area she counts. */
export function maskFloor(base: Omit<DlFloor, 'mask' | 'area'>, inside?: (lx: number, ly: number) => boolean): DlFloor {
  const nx = Math.max(1, Math.ceil(base.w)), ny = Math.max(1, Math.ceil(base.d))
  const m: DlMask = { nx, ny, x0: -base.w / 2, y0: -base.d / 2, cells: new Uint8Array(nx * ny).fill(1) }
  if (inside) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) if (!inside(m.x0 + ix + 0.5, m.y0 + iy + 0.5)) m.cells[iy * nx + ix] = 0
  let solid = 0, total = 0
  for (let iy = 0; iy < ny; iy++) { if (m.y0 + iy + 0.5 > base.d / 2) continue; for (let ix = 0; ix < nx; ix++) { if (m.x0 + ix + 0.5 > base.w / 2) continue; total++; if (m.cells[iy * nx + ix]) solid++ } }
  return { ...base, mask: m, area: base.w * base.d * (total ? solid / total : 1) }
}
const toLocal = (f: DlFloor, x: number, y: number) => { const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.cx, dy = y - f.cy; return { x: dx * c + dy * s, y: -dx * s + dy * c } }

/** The zone that applies to a face at a level: the last listed that matches (study.js zoneFor). */
export function zoneFor(zones: Zone[], face: Ori, level: number): Zone {
  let z: Zone | null = null; for (const q of zones) { if ((q.face === face || q.face === 'all') && level >= q.from && level <= q.to) z = q } return z || DEFAULT_ZONE
}
/** The window band of a face: head, glass height and sill (study.js band). */
export function band(f: DlFloor, o: Ori, z: Zone) {
  const hh = f.h - GAP; let head = hh; const op = f.open?.[o]
  if (op) head = Math.min(hh, Math.max(0.6, op[1])); else if (f.ceil) head = Math.min(hh, Math.max(1.8, f.ceil))
  const gh = Math.max(0.3, Math.min(head, hh * z.wwr)); return { hh, head, gh, sp: Math.max(0, head - gh) }
}
/** Closed rectilinear outlines of a floor's solid cells in local coordinates (core.js maskLoops): outer loops counter-clockwise, holes clockwise. */
export function maskLoops(f: DlFloor) {
  const m = f.mask, W2 = f.w / 2, D2 = f.d / 2
  const solid = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < m.nx && iy < m.ny && m.x0 + ix + 0.5 <= W2 && m.y0 + iy + 0.5 <= D2 && !!m.cells[iy * m.nx + ix]
  const X = (ix: number) => Math.min(W2, m.x0 + ix), Y = (iy: number) => Math.min(D2, m.y0 + iy)
  const edges = new Map<string, [number, number][]>(); const key = (x: number, y: number) => x.toFixed(2) + ',' + y.toFixed(2)
  const add = (ax: number, ay: number, bx: number, by: number) => { const k = key(ax, ay); let l = edges.get(k); if (!l) { l = []; edges.set(k, l) } l.push([bx, by]) }
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!solid(ix, iy)) continue
    if (!solid(ix, iy - 1)) add(X(ix), Y(iy), X(ix + 1), Y(iy)); if (!solid(ix + 1, iy)) add(X(ix + 1), Y(iy), X(ix + 1), Y(iy + 1))
    if (!solid(ix, iy + 1)) add(X(ix + 1), Y(iy + 1), X(ix), Y(iy + 1)); if (!solid(ix - 1, iy)) add(X(ix), Y(iy + 1), X(ix), Y(iy))
  }
  const loops: { pts: [number, number][]; outer: boolean; area: number }[] = []
  for (const [k0, outs] of edges) {
    while (outs.length) {
      const start = k0.split(',').map(Number) as [number, number]; const pts: [number, number][] = [start]; let guard = 0
      let next = outs.pop()
      while (next && guard++ < 100000) { const kk = key(next[0], next[1]); if (kk === k0) break; pts.push(next); const o = edges.get(kk); if (!o || !o.length) break; next = o.pop() }
      if (pts.length >= 4) {
        const simp: [number, number][] = []
        for (let i = 0; i < pts.length; i++) { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]; if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-6) simp.push(b) }
        let area = 0; for (let i = 0; i < simp.length; i++) { const a = simp[i], b = simp[(i + 1) % simp.length]; area += a[0] * b[1] - b[0] * a[1] }
        if (Math.abs(area) > 1) loops.push({ pts: simp, outer: area > 0, area: Math.abs(area) / 2 })
      }
    }
  }
  return loops
}
/** Outline edges of a plate with their world orientation (study.js edgesOf; the fields daylight reads). */
export function edgesOf(f: DlFloor): { L: number; o: Ori }[] {
  const out: { L: number; o: Ori }[] = []; const c = Math.cos(f.rot), s = Math.sin(f.rot)
  for (const lp of maskLoops(f)) {
    const pts = lp.pts, n = pts.length
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.5) continue
      const ux = dx / L, uy = dy / L, sgn = lp.outer ? 1 : -1, ox = uy * sgn, oy = -ux * sgn; const wx = ox * c - oy * s, wy = ox * s + oy * c
      const deg = (((Math.atan2(wy, wx) * 180) / Math.PI) % 360 + 360) % 360; const o: Ori = deg < 45 || deg >= 315 ? 'E' : deg < 135 ? 'N' : deg < 225 ? 'W' : 'S'
      out.push({ L, o })
    }
  }
  return out
}
/** The world face a local direction (nx, ny) on a plate turned rot points to (study.js cardinalOf). */
export function cardinalOf(nx: number, ny: number, rot: number): Ori {
  const a = Math.atan2(ny, nx) + rot; const deg = (((a * 180) / Math.PI) % 360 + 360) % 360; return deg < 45 || deg >= 315 ? 'E' : deg < 135 ? 'N' : deg < 225 ? 'W' : 'S'
}
/** What a zone's device cuts off the window (cut, a share of the glass height) and dims (dim) for a sun position (study.js stratParts). */
export function stratParts(z: Zone, alt: number, azDeg: number, faceAz: number, gh: number) {
  const st = STRATS[z.strat]; const D = z.depth; let dim = st.mod || 1, cut = 0; if (!st.device || D <= 0) return { cut, dim }
  const hsa = ((azDeg - faceAz + 540) % 360) - 180; const c = Math.cos((hsa * Math.PI) / 180); if (c <= 0.02) return { cut, dim }
  const tanProf = Math.tan(alt) / c, tanH = Math.abs(Math.tan((hsa * Math.PI) / 180)); const g = Math.max(0.5, gh)
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
/** A device's effect on diffuse light (study.js dfFactor): a transmission factor, a light-shelf flag and the depth above the head. */
export function dfFactor(z: Zone) {
  const st = STRATS[z.strat], D = z.depth; let k = 1
  switch (z.strat) {
    case 'louvres': k = Math.max(0.2, 1 - (0.6 * D) / 0.5); break
    case 'fins': k = Math.max(0.4, 1 - (0.4 * D) / 1.5); break
    case 'eggcrate': k = Math.max(0.15, (1 - (0.6 * D) / 0.5) * (1 - (0.4 * D) / 1.5)); break
    case 'punched': k = 0.75 * Math.max(0.6, 1 - (0.3 * D) / 1.8); break
    case 'doubleskin': k = 0.8; break
    default: k = 1
  }
  return { k, shelf: z.strat === 'lightshelf', top: st.device && (z.strat === 'overhang' || z.strat === 'balcony' || z.strat === 'lightshelf') ? D : 0 }
}

/** A context building as her site raster lists it: plan centre and roof height (m). */
export interface DlBuilding { x: number; y: number; top: number }
/** Obstruction angle above the work plane (0.8 m) per face, from the mean roof and distance of the buildings 15–160 m off that face (study.js obstructionAngles). */
export function obstructionAngles(f: DlFloor, bld: DlBuilding[]): Record<Ori, number> {
  const out = {} as Record<Ori, number>; const z = f.z + 0.8
  const N: Record<Ori, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }
  for (const o of ORI) {
    const n = N[o]; let hs = 0, ds = 0, c = 0
    for (const b of bld) { const dx = b.x - f.cx, dy = b.y - f.cy, d = Math.hypot(dx, dy); if (d < 15 || d > 160) continue; if ((dx * n[0] + dy * n[1]) / d < 0.6) continue; hs += b.top; ds += d; c++ }
    const hn = c ? hs / c : 0, dn = c ? Math.max(25, ds / c) : 60; out[o] = Math.atan(Math.max(0, hn - z) / dn)
  }
  return out
}

// ------------------------------------------------------------------------------------------------ daylight

/** What a run is given beyond the floors: façade zones, glass VT, sDA target (lux), core position, context, the ASE period. */
export interface DlSettings { zones: Zone[]; vt: number; target: number; posX: number; posY: number; bld: DlBuilding[]; period: DlPeriod }
/** Caches shared by the floors of one run (her dlSkyCache and aseHours.c). */
export interface DlCache { sky: Map<string, DlSkyHours>; ase: { key: string; v: AseHours | null } | null }
export const newCache = (): DlCache => ({ sky: new Map(), ase: null })

interface DlSkyHours { n: number; mon: Int8Array; N: { sky: Float32Array; gnd: Float32Array }; E: { sky: Float32Array; gnd: Float32Array }; S: { sky: Float32Array; gnd: Float32Array }; W: { sky: Float32Array; gnd: Float32Array } }
/** The occupied hours and each face's hourly sky for one floor rotation, every hs-th day (study.js dlSky). */
function dlSky(P: SkyPrep, f: DlFloor, hs: number, cache: DlCache): DlSkyHours {
  const off = faceOffset(f.rot); const key = Math.round(off) + ':' + hs; const hit = cache.sky.get(key); if (hit) return hit
  const idx: number[] = []; for (const k of P.occ) if ((P.doy[k] - 1) % hs === 0) idx.push(k)
  const n = idx.length; const mon = new Int8Array(n); idx.forEach((k, j) => (mon[j] = P.mon[k]))
  const per = {} as Record<Ori, { sky: Float32Array; gnd: Float32Array }>
  for (const o of ORI) { const F = face(P, FACE_AZ[o] + off); const sky = new Float32Array(n), gnd = new Float32Array(n); idx.forEach((k, j) => { sky[j] = F.skyL[k]; gnd[j] = F.gndL[k] }); per[o] = { sky, gnd } }
  const out: DlSkyHours = { n, mon, ...per }; cache.sky.set(key, out); return out
}

export interface DlFloorResult {
  /** Daylight factor and daylight autonomy per mask cell (0 outside the computed cells). */
  df: Float32Array; da: Float32Array; step: number
  mean: number; pctLit: number; daMean: number; udiS: number; udiU: number; udiE: number; pctOver: number
  /** Monthly daylight share (for dimming), cells computed, hours simulated, the uniform internally reflected DF. */
  dsf: number[]; cells: number; target: number; hours: number; irc: number
}
/** Daylight factor, DA, sDA, UDI of one floor (study.js daylightFloor; her tower run uses step 2, hs 2). */
export function daylightFloor(P: SkyPrep, f: DlFloor, step: number, hs: number, s: DlSettings, cache: DlCache): DlFloorResult {
  step = step || 1; hs = hs || 1
  const m = f.mask, lvl = f.i + 1, hh = f.h - GAP, W2 = f.w / 2, D2 = f.d / 2; const cc = toLocal(f, s.posX, s.posY), ch = f.core / 2; const tau = s.vt * DL_R.maint
  const solid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < m.nx && cy < m.ny && m.x0 + cx + 0.5 <= W2 && m.y0 + cy + 0.5 <= D2 && !!m.cells[cy * m.nx + cx]
  const inCore = (x: number, y: number) => Math.abs(x - cc.x) <= ch && Math.abs(y - cc.y) <= ch
  const obs = obstructionAngles(f, s.bld); const NR = DL_R.rays, dphi = (2 * Math.PI) / NR; const dirs: [number, number][] = []; for (let i = 0; i < NR; i++) { const a = (i + 0.5) * dphi; dirs.push([Math.cos(a), Math.sin(a)]) }
  const fi: Record<Ori, number> = { N: 0, E: 1, S: 2, W: 3 }
  const nc = m.nx * m.ny, sc = new Float32Array(nc * 4), df = new Float32Array(nc), cellList: number[] = []
  for (let iy = 0; iy < m.ny; iy += step) for (let ix = 0; ix < m.nx; ix += step) {
    if (!solid(ix, iy)) continue; const x0 = m.x0 + ix + 0.5, y0 = m.y0 + iy + 0.5; if (inCore(x0, y0)) continue; const ci = iy * m.nx + ix; cellList.push(ci)
    for (const [dx, dy] of dirs) {
      let x = x0, y = y0, px = ix, py = iy, hit: { D: number; o: Ori } | null = null
      for (let k = 1; k < 160; k++) {
        x += dx * 0.5; y += dy * 0.5; if (inCore(x, y)) break; const gx = Math.floor(x - m.x0), gy = Math.floor(y - m.y0)
        if (!solid(gx, gy)) { let nx = gx !== px ? Math.sign(gx - px) : 0, ny = gy !== py ? Math.sign(gy - py) : 0; if ((nx && ny) || (!nx && !ny)) { if (Math.abs(dx) >= Math.abs(dy)) { nx = Math.sign(dx); ny = 0 } else { ny = Math.sign(dy); nx = 0 } } hit = { D: k * 0.5, o: cardinalOf(nx, ny, f.rot) }; break }
        px = gx; py = gy
      }
      if (!hit) continue; const z = zoneFor(s.zones, hit.o, lvl); const B = band(f, hit.o, z); const d = Math.max(0.5, hit.D); const F = dfFactor(z); const sill = Math.max(0, B.sp - 0.8), head = Math.max(sill + 0.1, B.head - 0.8)
      const a0 = Math.atan(sill / d), a2 = Math.atan(head / (d + F.top)); if (a2 <= a0) continue; const ob = obs[hit.o], a1 = Math.max(a0, Math.min(a2, ob))
      let v = dphi * cieBand(Math.sin(a1), Math.sin(a2)) + DL_R.erc * dphi * cieBand(Math.sin(a0), Math.sin(a1)); v *= tau * F.k; if (F.shelf) v *= d < 4 ? 0.9 : 1.15; sc[ci * 4 + fi[hit.o]] += v
    }
  }
  // internally reflected component (BRE split-flux), uniform over the plate: glass area by face, room surfaces, reflectances
  let perim = 0; const Wg: Record<Ori, number> = { N: 0, E: 0, S: 0, W: 0 }
  for (const e of edgesOf(f)) { const z = zoneFor(s.zones, e.o, lvl); const B = band(f, e.o, z); perim += e.L; Wg[e.o] += e.L * B.gh * tau * dfFactor(z).k }
  const Af = f.area || cellList.length * step * step, walls = (perim + 4 * f.core) * hh, Atot = 2 * Af + walls, Rm = (DL_R.floor * Af + DL_R.ceil * Af + DL_R.wall * walls) / Atot
  const Rfw = (DL_R.floor * Af + (DL_R.wall * walls) / 2) / (Af + walls / 2), Rcw = (DL_R.ceil * Af + (DL_R.wall * walls) / 2) / (Af + walls / 2), kI = 0.85 / (Atot * (1 - Rm))
  const fo = {} as Record<Ori, number>; for (const o of ORI) fo[o] = vertSkyAbove(obs[o])
  let ircDF = 0; for (const o of ORI) ircDF += kI * Wg[o] * ((0.396 * fo[o] + DL_R.erc * 0.396 * (1 - fo[o])) * Rfw + 0.1 * Rcw)
  const target = s.target || 300; let sum = 0, n = 0, lit = 0, daSum = 0, uS = 0, uU = 0, uE = 0
  for (const ci of cellList) { const v = sc[ci * 4] + sc[ci * 4 + 1] + sc[ci * 4 + 2] + sc[ci * 4 + 3] + ircDF; df[ci] = v; sum += v; n++ }
  const sky = dlSky(P, f, hs, cache); const da = new Float32Array(nc); const dsfM = new Float64Array(12), hM = new Float64Array(12)
  const N = sky.n; const irc = new Float32Array(N); const sN = sky.N, sE = sky.E, sS = sky.S, sW = sky.W
  for (let j = 0; j < N; j++) { let v = 0; for (const o of ORI) { const q = sky[o]; v += Wg[o] * ((q.sky[j] * fo[o] + DL_R.erc * q.sky[j] * (1 - fo[o])) * Rfw + q.gnd[j] * Rcw) } irc[j] = kI * v; hM[sky.mon[j]]++ }
  // sky light through each face scales with that face's Perez sky against the CIE overcast vertical/horizontal ratio 0.396
  const kN = new Float32Array(N), kE = new Float32Array(N), kS = new Float32Array(N), kW = new Float32Array(N)
  for (let j = 0; j < N; j++) { kN[j] = sN.sky[j] / 0.396; kE[j] = sE.sky[j] / 0.396; kS[j] = sS.sky[j] / 0.396; kW[j] = sW.sky[j] / 0.396 }
  const cellDsf = new Float64Array(12)
  for (const ci of cellList) {
    const a = sc[ci * 4], b = sc[ci * 4 + 1], c = sc[ci * 4 + 2], d = sc[ci * 4 + 3]; let ok = 0, sl = 0, u = 0, e = 0; cellDsf.fill(0)
    for (let j = 0; j < N; j++) { const E = a * kN[j] + b * kE[j] + c * kS[j] + d * kW[j] + irc[j]; if (E >= target) { ok++; cellDsf[sky.mon[j]] += 1 } else cellDsf[sky.mon[j]] += E / target; if (E < DL_R.udiLo) sl++; else if (E > DL_R.udiHi) e++; else u++ }
    const daC = ok / N; da[ci] = daC; daSum += daC; if (daC >= 0.5) lit++; uS += sl / N; uU += u / N; uE += e / N; for (let q = 0; q < 12; q++) dsfM[q] += cellDsf[q]
  }
  for (let q = 0; q < 12; q++) dsfM[q] = hM[q] && n ? dsfM[q] / (hM[q] * n) : 0
  return { df, da, step, mean: n ? sum / n : 0, pctLit: n ? lit / n : 0, daMean: n ? daSum / n : 0, udiS: n ? uS / n : 0, udiU: n ? uU / n : 0, udiE: n ? uE / n : 0, pctOver: n ? uE / n : 0, dsf: Array.from(dsfM), cells: n, target, hours: sky.n * hs, irc: ircDF }
}

interface AseHours { bins: { az: number; alt: Float32Array; E: Float32Array }[]; occN: number; hours: number }
/** Occupied hours of the period with ≥ 1,000 lux of direct horizontal-equivalent sun, grouped by 2° of azimuth (study.js aseHours). */
function aseHours(P: SkyPrep, PI: DlPeriodInfo, cache: DlCache): AseHours {
  const key = PI.d0 + ':' + PI.d1; if (cache.ase && cache.ase.key === key && cache.ase.v) return cache.ase.v
  const bins = new Map<number, { az: number; alt: number[]; E: number[] }>(); let occN = 0
  for (const k of P.occ) {
    if (!inPeriod(PI, P.doy[k])) continue; occN++; if (P.alt[k] <= 0.03) continue; const E = P.Eb[k] * Math.sin(P.alt[k]); if (E < 1000) continue
    const b = Math.round((P.az[k] * 90) / Math.PI); let o = bins.get(b); if (!o) { o = { az: b * 2, alt: [], E: [] }; bins.set(b, o) } o.alt.push(P.alt[k]); o.E.push(E)
  }
  const v: AseHours = { bins: [...bins.values()].map((o) => ({ az: o.az, alt: Float32Array.from(o.alt), E: Float32Array.from(o.E) })), occN, hours: [...bins.values()].reduce((q, o) => q + o.alt.length, 0) }
  cache.ase = { key, v }; return v
}
export interface AseFloorResult { hrs: Float32Array; step: number; pctOver: number; cells: number; positions: number; period: DlPeriodInfo; thr: number }
/** Annual sunlight exposure ASE1000/250h of one floor (study.js aseFloor; her tower run uses the coarse 2 m step). */
export function aseFloor(P: SkyPrep, f: DlFloor, coarse: boolean, s: DlSettings, days: number[], cache: DlCache): AseFloorResult {
  const m = f.mask, lvl = f.i + 1, W2 = f.w / 2, D2 = f.d / 2; const cc = toLocal(f, s.posX, s.posY), ch = f.core / 2; const tau = s.vt; const off = faceOffset(f.rot)
  const solid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < m.nx && cy < m.ny && m.x0 + cx + 0.5 <= W2 && m.y0 + cy + 0.5 <= D2 && !!m.cells[cy * m.nx + cx]
  const inCore = (x: number, y: number) => Math.abs(x - cc.x) <= ch && Math.abs(y - cc.y) <= ch
  const PI = periodInfo(s.period, days); const AH = aseHours(P, PI, cache); const step = coarse ? 2 : 1; const hrs = new Float32Array(m.nx * m.ny); let n = 0, over = 0
  const thr = 250 * (PI.full ? 1 : AH.occN / 3650); const c = Math.cos(-f.rot), sn = Math.sin(-f.rot)
  const B = AH.bins.map((b) => { const a = (b.az * Math.PI) / 180, sx = Math.sin(a), sy = Math.cos(a); return { b, dx: sx * c - sy * sn, dy: sx * sn + sy * c } })
  for (let iy = 0; iy < m.ny; iy += step) for (let ix = 0; ix < m.nx; ix += step) {
    if (!solid(ix, iy)) continue; const x0 = m.x0 + ix + 0.5, y0 = m.y0 + iy + 0.5; if (inCore(x0, y0)) continue; n++; let Hh = 0
    for (const { b, dx, dy } of B) {
      let x = x0, y = y0, px = ix, py = iy, hit: { D: number; o: Ori } | null = null
      for (let k = 1; k < 200; k++) {
        x += dx * 0.5; y += dy * 0.5; if (inCore(x, y)) break; const gx = Math.floor(x - m.x0), gy = Math.floor(y - m.y0)
        if (!solid(gx, gy)) { let nx = gx !== px ? Math.sign(gx - px) : 0, ny = gy !== py ? Math.sign(gy - py) : 0; if ((nx && ny) || (!nx && !ny)) { if (Math.abs(dx) >= Math.abs(dy)) { nx = Math.sign(dx); ny = 0 } else { ny = Math.sign(dy); nx = 0 } } hit = { D: k * 0.5, o: cardinalOf(nx, ny, f.rot) }; break }
        px = gx; py = gy
      }
      if (!hit) continue; const z = zoneFor(s.zones, hit.o, lvl); const Bd = band(f, hit.o, z), sp = Bd.sp, gh = Bd.gh; const faz = FACE_AZ[hit.o] + off
      for (let j = 0; j < b.alt.length; j++) {
        const al = b.alt[j]; const hz = hit.D * Math.tan(al); if (hz < sp || hz > sp + gh) continue; if (b.E[j] * tau < 1000) continue
        const pr = stratParts(z, al, b.az, faz, gh); if (hz > sp + gh * (1 - pr.cut)) continue; if (b.E[j] * tau * pr.dim >= 1000) Hh++
      }
    }
    hrs[iy * m.nx + ix] = Hh; if (Hh >= thr) over++
  }
  return { hrs, step, pctOver: n ? over / n : 0, cells: n, positions: AH.hours, period: PI, thr }
}

// ------------------------------------------------------------------------------------------------ the tower

/** Floors that share plate, rotation, zones and obstruction give the same result: her signature (study.js floorSig). */
export function floorSig(f: DlFloor, s: DlSettings): string {
  const m = f.mask; let h = 0; for (let k = 0; k < m.cells.length; k++) if (m.cells[k]) h = (h * 31 + k) % 1000000007
  const obs = obstructionAngles(f, s.bld)
  return JSON.stringify([m.nx, m.ny, m.x0, m.y0, h, f.w, f.d, f.h, f.core, f.rot.toFixed(3), toLocal(f, s.posX, s.posY), f.open, f.ceil, ORI.map((o) => s.zones.indexOf(zoneFor(s.zones, o, f.i + 1))), ORI.map((o) => Math.round(obs[o] * 90))])
}
export interface DlRow { i: number; area: number; mean: number; pctLit: number; pctOver: number; da: number; udiS: number; udiU: number; udiE: number; dsf: number[]; target: number; hourly: boolean; sig: number }
export interface DlTower { rows: DlRow[]; sda: number; over: number; mean: number; da: number; udiS: number; udiU: number; udiE: number; target: number; hourly: boolean; unique: number; plans: DlFloorResult[] }
/** Every floor at her tower resolution (2 m cells, every 2nd day), area-weighted (study.js daylightTower). */
export function daylightTower(P: SkyPrep, floors: DlFloor[], s: DlSettings, cache: DlCache = newCache(), onFloor?: (i: number, n: number) => void): DlTower {
  const memo = new Map<string, number>(); const plans: DlFloorResult[] = []
  const rows = floors.map((f, q) => {
    const sig = floorSig(f, s); let ix = memo.get(sig)
    if (ix === undefined) { onFloor?.(q, floors.length); ix = plans.length; plans.push(daylightFloor(P, f, 2, 2, s, cache)); memo.set(sig, ix) }
    const r = plans[ix]
    return { i: f.i, area: f.area, mean: r.mean, pctLit: r.pctLit, pctOver: r.pctOver, da: r.daMean, udiS: r.udiS, udiU: r.udiU, udiE: r.udiE, dsf: r.dsf, target: r.target, hourly: true, sig: ix }
  })
  const A = rows.reduce((q, r) => q + r.area, 0); const aw = (g: (r: DlRow) => number) => rows.reduce((q, r) => q + g(r) * r.area, 0) / Math.max(1, A)
  return { rows, sda: aw((r) => r.pctLit), over: aw((r) => r.pctOver), mean: aw((r) => r.mean), da: aw((r) => r.da), udiS: aw((r) => r.udiS), udiU: aw((r) => r.udiU), udiE: aw((r) => r.udiE), target: s.target || 300, hourly: true, unique: memo.size, plans }
}
export interface AseTower { rows: { i: number; area: number; pct: number; sig: number }[]; pct: number; period: string; plans: AseFloorResult[] }
/** ASE of every floor, coarse, area-weighted (study.js aseTower). */
export function aseTower(P: SkyPrep, floors: DlFloor[], s: DlSettings, days: number[], cache: DlCache = newCache(), onFloor?: (i: number, n: number) => void): AseTower {
  const memo = new Map<string, number>(); const plans: AseFloorResult[] = []
  const rows = floors.map((f, q) => {
    const sig = floorSig(f, s); let ix = memo.get(sig)
    if (ix === undefined) { onFloor?.(q, floors.length); ix = plans.length; plans.push(aseFloor(P, f, true, s, days, cache)); memo.set(sig, ix) }
    return { i: f.i, area: f.area, pct: plans[ix].pctOver, sig: ix }
  })
  const A = rows.reduce((q, r) => q + r.area, 0)
  return { rows, pct: rows.reduce((q, r) => q + r.pct * r.area, 0) / Math.max(1, A), period: periodInfo(s.period, days).label, plans }
}

/** LEED v4.1 EQ Daylight option 1 points as her app reads sDA300/50% (study.js keyItems / leedCard): 40 / 55 / 75% → 1 / 2 / 3. */
export const sdaPoints = (sda: number) => (sda >= 0.75 ? 3 : sda >= 0.55 ? 2 : sda >= 0.4 ? 1 : 0)
