// Massing efficiency from the form alone, ported from Sinnie Choi's Sun & Wind Studio (energy.js formStudy, rate,
// daylitShare). The Studio reads each floor's facade[o] (exposed mask edge per face), terrace, roof and coveredVoid;
// here they come from the SwFloor plates (floorExposure), so the input is SwFloor[] of one tower.
//
// Deviations: envelope areas are measured from the plate rings' edges (exact lengths) rather than the 1 m mask's
// stair-stepped edges; roofs / terraces / soffits from mask overlap between floors that touch (cells × h²). The
// slenderness uses the lowest floor's bounding box in the tower's axes (the Studio's floors[0].w / d).
//
// Twists and leans (tool gap G27, energy review R3-7): a twisted or leaning tower's storey outlines step a little at
// every slab, so the overlap test read a sliver of terrace on one side and of soffit on the other at each storey (B21c,
// 90° over 71 storeys: envelope per floor area 0.403, where a smooth warped skin adds about 0.001). Built, that skin is
// one warped or sloped wall. Where two touching storeys keep the same plate area, the upper stands on most of the lower
// and no step is wide enough to stand on (WARP_* below, team values), the strip between them is counted as warped wall:
// no terrace, no soffit, only the extra area of a wall leaning across the step (`warped`). A real setback changes the
// plate's area and keeps its terrace.
import { ORI, type Face, type SwFloor } from './plate'

export type Rating = 0 | 1 | 2 | 3 | 4
export const RATE_L = ['A', 'B', 'C', 'D', 'E'] as const
export const RATE_COL = ['#1F7A4D', '#7fb800', '#fab219', '#ec835a', '#B3362B'] as const

/** A–E band of a value (energy.js rate). */
export function rate(v: number, bands: number[], higherBetter: boolean): Rating {
  let i = 0
  if (higherBetter) { while (i < bands.length && v < bands[i]) i++ } else { while (i < bands.length && v > bands[i]) i++ }
  return Math.min(4, i) as Rating
}

/** What the Studio keeps on each floor: façade length per face, exposed roof (top floor) / terrace, and the void under the
 *  floor above; `warped`: the extra wall area (m²) where the step to the floor above is a twist or lean (G27), else 0. */
export interface FloorExposure { facade: Record<Face, number>; roof: number; terrace: number; coveredVoid: number; warped: number }

/** Largest change of plate area between two storeys still read as one plate turned or shifted (a turn or a shift keeps
 *  the area; 3% covers the 1 m mask's noise; team value). */
export const WARP_AREA_CHANGE = 0.03
/** Smallest share of the lower plate the upper one stands on (team value). */
export const WARP_OVERLAP = 0.9
/** Widest step between the two outlines (m) still bridged by a leaning wall: a wider one is a ledge people can stand on,
 *  the deck width decks.ts already requires of a terrace (DECK_MIN_WIDTH; team value). */
export const WARP_STEP_MAX = 1.5

type Pt2 = [number, number]
/** Distance from a point to the nearest edge of a set of rings. */
function toRings(x: number, y: number, rings: Pt2[][]): number {
  let d = Infinity
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0
    d = Math.min(d, Math.hypot(x - ax - u * dx, y - ay - u * dy))
  }
  return d
}
/** Points every half metre or less along a set of rings, each with the length of edge it stands for. */
function along(rings: Pt2[][]): { x: number; y: number; dl: number }[] {
  const out: { x: number; y: number; dl: number }[] = []
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.5))
    for (let k = 0; k < n; k++) out.push({ x: ax + ((bx - ax) * (k + 0.5)) / n, y: ay + ((by - ay) * (k + 0.5)) / n, dl: L / n })
  }
  return out
}
const maskArea = (f: SwFloor) => { let n = 0; for (const c of f.mask.cells) n += c; return n * f.mask.h * f.mask.h }

/**
 * The step from floor a to the floor b on it, when it is a twist or a lean (G27): the extra wall area (m²) of a skin
 * leaning across it, the sum along a's outline of h·(√(1 + (d/h)²) − 1) with d the distance to b's outline; null for a
 * real step (a setback, an overhang, a change of plan). `open`: a's area b leaves open; `under`: b's area a does not carry.
 */
export function warpStep(a: SwFloor, b: SwFloor, open: number, under: number): number | null {
  const Aa = maskArea(a), Ab = maskArea(b)
  if (!(Aa > 0 && Ab > 0)) return null
  if (Math.abs(open - under) > WARP_AREA_CHANGE * Math.max(Aa, Ab)) return null
  if (open > (1 - WARP_OVERLAP) * Aa || under > (1 - WARP_OVERLAP) * Ab) return null
  let extra = 0
  for (const p of along(a.rings as Pt2[][])) {
    const d = toRings(p.x, p.y, b.rings as Pt2[][])
    if (d > WARP_STEP_MAX) return null
    extra += p.dl * a.h * (Math.sqrt(1 + (d / a.h) ** 2) - 1)
  }
  for (const p of along(b.rings as Pt2[][])) if (toRings(p.x, p.y, a.rings as Pt2[][]) > WARP_STEP_MAX) return null
  return extra
}

/** Cells of floor a that floor b (same tower, same grid) does not cover. */
function uncovered(a: SwFloor, b: SwFloor | null): number {
  const m = a.mask, h = m.h
  let n = 0
  for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
    if (!m.cells[iy * m.nx + ix]) continue
    if (!b) { n++; continue }
    const q = b.mask, jx = Math.round((m.x0 - q.x0) / h) + ix, jy = Math.round((m.y0 - q.y0) / h) + iy
    if (!(jx >= 0 && jy >= 0 && jx < q.nx && jy < q.ny && q.cells[jy * q.nx + jx])) n++
  }
  return n * h * h
}

/** facade / roof / terrace / coveredVoid / warped of each floor (index-aligned with `floors`), from the plates. */
export function floorExposure(floors: SwFloor[]): FloorExposure[] {
  const above = (f: SwFloor) => floors.find((g) => g !== f && g.towerId === f.towerId && Math.abs(g.z - (f.z + f.h)) < 0.05) ?? null
  return floors.map((f) => {
    const facade: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }
    for (const e of f.edges) facade[e.o] += e.L
    const up = above(f)
    const open = uncovered(f, up)
    if (!up) return { facade, roof: open, terrace: 0, coveredVoid: 0, warped: 0 }
    const under = uncovered(up, f)
    const warped = (open > 0 || under > 0) && up.rings !== f.rings ? warpStep(f, up, open, under) : null
    return warped != null ? { facade, roof: 0, terrace: 0, coveredVoid: 0, warped } : { facade, roof: 0, terrace: open, coveredVoid: under, warped: 0 }
  })
}

/** Share of floor cells within 6 m of a façade or void (energy.js daylitShare). */
export function daylitShare(floors: SwFloor[]): number {
  let lit = 0, tot = 0
  for (const fl of floors) {
    const m = fl.mask, h = m.h, cap = Math.round(6 / h)
    const inside = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < m.nx && iy < m.ny && !!m.cells[iy * m.nx + ix]
    const dist = new Int16Array(m.nx * m.ny).fill(-1), q: number[] = []
    for (let iy = 0; iy < m.ny; iy++) for (let ix = 0; ix < m.nx; ix++) {
      if (!inside(ix, iy)) continue
      tot++
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!inside(ix + dx, iy + dy)) { dist[iy * m.nx + ix] = 1; q.push(ix, iy); break }
    }
    let head = 0
    while (head < q.length) {
      const ix = q[head++], iy = q[head++], d = dist[iy * m.nx + ix]
      if (d >= cap) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jy = iy + dy
        if (!inside(jx, jy)) continue
        const k = jy * m.nx + jx
        if (dist[k] < 0) { dist[k] = d + 1; q.push(jx, jy) }
      }
    }
    for (let k = 0; k < dist.length; k++) if (dist[k] > 0) lit++
  }
  return tot ? lit / tot : 0
}

export interface FormMetric { k: string; v: number; fmt: string; bench: string; r: Rating; why: string }
export interface FormStudy {
  /** Floor area, conditioned volume (area × floor-to-floor), envelope (façade + warped wall + roofs + soffits + ground slab). */
  gfa: number; vol: number; env: number
  facTot: number; fac: Record<Face, number>
  roof: number; soffit: number; slab: number
  /** G27: extra wall area where storey steps read as a twist or lean (m²), and how many steps did. */
  warped: number; warpSteps: number
  /** Form factor (envelope m² per floor m²), surface-to-volume (m⁻¹), heat-loss index (W/m²K per m² floor). */
  ff: number; sv: number; hli: number
  /** The square prism of the same height and volume: its form factor and heat-loss index, side (m). */
  ffRef: number; hliRef: number; side: number
  /** Heat loss and envelope against that prism (1 = as compact). */
  relHeat: number; relEnv: number
  daylit: number
  /** Outdoor area: terraces, roofs and covered voids (m²). */
  outdoor: number
  /** Solar-facing (S + half E and W) and north shares of the façade. */
  south: number; north: number
  /** Height over the lowest plate's short side. */
  slender: number
  metrics: FormMetric[]
  /** Mean rating (0 = A … 4 = E) and its rounded letter index. */
  score: number; overall: Rating; letter: (typeof RATE_L)[number]
  H: number
}

const fmtI = (v: number) => Math.round(v).toLocaleString('en-CA')

/** Form-only metrics rated A–E for towers (energy.js formStudy). `height` overrides the top of the floors. */
export function formStudy(floors: SwFloor[], height?: number): FormStudy {
  const fs = [...floors].sort((a, b) => a.z - b.z)
  const ex = floorExposure(fs)
  const gfa = fs.reduce((s, f) => s + f.area, 0), vol = fs.reduce((s, f) => s + f.area * f.h, 0)
  const fac: Record<Face, number> = { N: 0, E: 0, S: 0, W: 0 }
  let facTot = 0, roof = 0, soffit = 0, warped = 0, warpSteps = 0
  fs.forEach((f, i) => {
    for (const o of ORI) { const A = ex[i].facade[o] * f.h; fac[o] += A; facTot += A }
    roof += ex[i].terrace + ex[i].roof
    soffit += i > 0 ? ex[i - 1].coveredVoid : 0
    if (ex[i].warped > 0) { warped += ex[i].warped; warpSteps++ }
  })
  const slab = fs[0]?.area ?? 0, env = facTot + warped + roof + soffit + slab
  const ff = env / gfa, sv = env / vol, hli = ((facTot + warped) * 0.73 + (roof + soffit + slab) * 0.18) / gfa
  const top = fs[fs.length - 1], H = height ?? (top ? top.z + top.h : 0)
  const side = Math.sqrt(vol / H), envRef = 4 * side * H + 2 * side * side, ffRef = envRef / gfa, hliRef = (4 * side * H * 0.73 + 2 * side * side * 0.18) / gfa
  const daylit = daylitShare(fs)
  const outdoor = ex.reduce((s, e) => s + e.terrace + e.roof + e.coveredVoid, 0)
  const south = (fac.S + 0.5 * fac.E + 0.5 * fac.W) / Math.max(1, facTot), north = fac.N / Math.max(1, facTot)
  let w = 0, d = 0
  if (fs[0]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of fs[0].rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } w = x1 - x0; d = y1 - y0 }
  const slender = H / Math.max(1e-6, Math.min(w, d))
  const dS = Math.abs(south - 0.47)
  const metrics: FormMetric[] = [
    { k: 'Form factor', v: ff, fmt: ff.toFixed(2) + ' m²/m²', bench: '≤ 0.30 compact · 0.5+ articulated', r: rate(ff, [0.3, 0.4, 0.5, 0.6], false), why: 'Envelope area per m² of floor: every extra m² of skin is heat loss and cost.' },
    { k: 'Surface-to-volume', v: sv, fmt: sv.toFixed(3) + ' m⁻¹', bench: '≤ 0.09 towers · 0.18+ low-rise', r: rate(sv, [0.09, 0.12, 0.15, 0.18], false), why: 'The same idea per m³ of conditioned volume.' },
    { k: 'Compactness vs square prism', v: envRef / env, fmt: Math.round(envRef / env * 100) + '%', bench: '100% = as compact as a square prism of the same height and volume', r: rate(envRef / env, [0.9, 0.8, 0.7, 0.6], true), why: 'How much extra skin the voids, steps and shifts add.' },
    { k: 'Heat-loss index', v: hli, fmt: hli.toFixed(2) + ' W/m²K', bench: '≤ 0.25 good · 0.5+ leaky form', r: rate(hli, [0.25, 0.32, 0.4, 0.5], false), why: 'Envelope × typical U-values (0.73 for a 40% glazed wall, 0.18 for roofs and soffits) per m² of floor, before any envelope choice.' },
    { k: 'Daylit floor area', v: daylit, fmt: Math.round(daylit * 100) + '%', bench: '≥ 75% shallow plates · < 30% deep plates', r: rate(daylit, [0.75, 0.6, 0.45, 0.3], true), why: 'Share of indoor area within 6 m of a façade or void: lighting energy and quality of space.' },
    { k: 'Solar-facing façade', v: south, fmt: Math.round(south * 100) + '%', bench: '40–55% balanced', r: (dS < 0.06 ? 0 : dS < 0.12 ? 1 : dS < 0.18 ? 2 : 3) as Rating, why: 'South plus half of east and west: winter gains and summer overheating both rise with it.' },
    { k: 'North-facing façade', v: north, fmt: Math.round(north * 100) + '%', bench: '≤ 25%', r: rate(north, [0.22, 0.28, 0.34, 0.4], false), why: 'Loses heat without solar gain.' },
    { k: 'Exposed roofs and soffits', v: (roof + soffit) / gfa, fmt: fmtI(roof + soffit) + ' m² · ' + Math.round((roof + soffit) / gfa * 100) + '% of GFA', bench: '≤ 3% for a plain shaft', r: rate((roof + soffit) / gfa, [0.03, 0.06, 0.1, 0.15], false), why: 'Terraces and voids add horizontal envelope, the costliest kind.' },
  ]
  const score = metrics.reduce((s, m) => s + m.r, 0) / metrics.length, overall = Math.round(score) as Rating
  return { gfa, vol, env, facTot, fac, roof, soffit, slab, warped, warpSteps, ff, sv, hli, ffRef, hliRef, daylit, outdoor, south, north, slender, metrics, score, overall, letter: RATE_L[overall], relHeat: hli / hliRef, relEnv: env / envRef, side, H }
}
