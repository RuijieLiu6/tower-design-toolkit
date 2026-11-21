// Wind on each terrace, roof and open storey (research R5 §1.3–§1.6, tool gap G4): the free-stream speed at the deck
// (deckWind.ts) times a local factor K by deck type and edge exposure, a screen factor and a neighbour factor, read
// per sample point and per 10° wind direction, then as the comfort class per season from the hourly record.
//
// For each sample point and wind direction (R5 eq. 4.2: U_p = U_z · K · S_screen · S_nb) the point looks upwind along
// the deck: the edge it meets first is the edge the wind crosses to reach it. An open edge exposes the point; a wall of
// the storey above shelters it. Looking downwind, a wall facing the wind sends downwash onto a setback terrace. R5's K
// table, as applied here (each value with R5's mark):
//   open to the sky (roof, setback):
//     sheltered by the storey above (wake)                0.7   team
//     downwash: a wall facing the wind rises ΔH behind     √Ce(z + 0.7 ΔH) / √Ce(z), at least the open-edge factor   team (stagnation fraction unverified)
//     wind crossing a windward open edge (γ ≤ 45°)         1.2   team, after Ledo et al. 2011 rooftop speed-up 1.2–1.6 (unverified)
//     crossing a side edge (45° < γ < 135°)                1.0   team
//   slab above (open storey, loggia):
//     sheltered (a wall upwind), or wind across the axis    0.5   team (Gu et al. 2023, unverified)
//     through-flow, windward open edge and open downwind   1.14  inference: √(Cp,ww − Cp,lw) = √(0.8 + 0.5), NBC 4.1.7.5.(2)
//     windward open edge, wall downwind (loggia)            0.6   team
//   within 0.2 L of the upwind corner of a side edge       1.3   inference: Bernoulli √(1 − Cp), Cp = −0.7 (NBC 4.1.7.5.(2)(c)); roofs, setbacks and loggias (R5: T1, T2, T4)
// Cover factor (gap G24, team step; review R3-8 cites Gu et al. 2023, unverified): a slab shelters by how deep the deck
// reaches under it against the headroom. Depth D = twice the mean distance of the deck's sample points to its nearest
// open edge (a strip open on one side: its width; open on both sides: half of it); f = (D/h − 0.25) / 0.75, held to 0–1.
// At D ≥ h (f = 1) the slab-above K values hold; at D ≤ h/4 (f = 0) the cover is an overhang and the deck reads as open
// to the sky; between, K = K_open + f (K_slab − K_open) per point and wind direction, the two end points being the table's
// own values (wind under a canopy reaches about as far in as the opening is high: team reading, unverified).
// Shared air (gap G38, team step; wind review R3-16): each storey's deck is read from its own outline, so an opening of
// the storeys above directly over a covered deck (a garden storey whose upper storeys open at a corner) left the deck
// below blind to it. A point of a covered deck whose own slab is missing (no plate of the storeys above lies over it
// within the deck's headroom, so the air at the point runs up through the storeys above with no slab between) is read
// twice: with the deck's cover factor, and with the cover factor of its own headroom up to the first plate over it
// (none: open to the sky, factor 0). It takes the more exposed of the two (the larger K x GEM factor), per wind direction.
// The deck keeps its type and its other points; the note counts the points that share the air above.
// Screen factor (R5 §1.4, team values after Hörteborn et al. 2023): none under 1.2 m; full within 3 h of the screen, back
// to 1 at 10 h; by porosity β: ≤ 0.10 → 0.5 (1.1 when the wind meets it over 60° off square), ≤ 0.40 → 0.4, ≤ 0.60 → 0.6,
// else 0.85. Neighbour factor (team): 0.7 when a building taller than the deck lies upwind within the hour's sector
// (± 22.5°) and within 10 of its own widths across the wind. Turbulence (R5 §1.5): TI 0.2 on open decks, 0.35 in wakes,
// sheltered and solid-screen zones; the gust-equivalent mean GEM = max(U, U (1 + 3 TI) / 1.85) is what both criteria read.
// Limits (R5 §1.7): K values are screening multipliers; any deck within one class of its target needs a wind tunnel or
// CFD study; the safety reading uses one typical year (Toronto asks for 30), so it is indicative only. Safety is the
// largest over all the deck's sample points (gap G38: it was read at the comfort-worst point only, so a screen that
// eased comfort there could hide a worse safety point elsewhere), with the point that gives it.
import { BINS, binDir, CRITERIA, DECK_SEASONS, classOf, hoursAbove, profileRatio, readSeasons, type Criteria, type CriteriaSet, type DeckHours, type DeckOptions, type DeckRead, type DeckSeason } from './deckWind'
import { angDiff, segDist, trueAz, type Deck, type DeckEdge } from './decks'

type Pt = [number, number]
export interface Screen { h: number; porosity: number }
export interface TerraceOptions extends DeckOptions {
  /** True north, degrees clockwise from the project frame's +y. */
  north: number
  /** A screen on every open edge (the wind settings), or none. */
  screen?: Screen | null
  /** A screen the façade gives one edge (a wind-screen zone at the deck's level), or none. */
  edgeScreen?: (d: Deck, e: DeckEdge) => Screen | null
  /** Buildings around, and the project's other towers (project frame, top above grade). */
  neighbours?: { ring: Pt[]; z1: number }[]
}
export type KCase = 'edge' | 'side' | 'corner' | 'downwash' | 'wake' | 'through' | 'loggia' | 'across' | 'sheltered'
export const K_CASES: KCase[] = ['edge', 'side', 'corner', 'downwash', 'wake', 'through', 'loggia', 'across', 'sheltered']
export const K_WORD: Record<KCase, string> = {
  edge: 'wind crossing the open edge', side: 'along a side edge', corner: 'corner stream at the upwind corner', downwash: 'downwash from the face above',
  wake: 'in the wake of the storey above', through: 'through-flow under the slab', loggia: 'into a loggia', across: 'across the open storey', sheltered: 'sheltered under the slab',
}
/** The screens R5 §1.6 tries, smallest first (height, then the more open screen). */
export const SCREEN_SET: Screen[] = [{ h: 1.5, porosity: 0.5 }, { h: 1.5, porosity: 0.25 }, { h: 2, porosity: 0.5 }, { h: 2, porosity: 0.25 }, { h: 2.5, porosity: 0.5 }, { h: 2.5, porosity: 0.25 }]

export interface DeckWind {
  deck: Deck
  /** The worst point's reading under the chosen criteria, per season. */
  read: DeckRead
  /** The same point under the other criteria set. */
  other: { criteria: Criteria; read: DeckRead }
  /** Share of the deck's sample points in each class, in the worst season. */
  share: number[]
  /** At the worst point in the worst season: the wind direction with most hours over the target, the edge it crosses
   *  and the K case. */
  governing: { dir: number; edgeAz: number | null; kCase: KCase; k: number; shared: boolean }
  /** Comfort hours a year over the target class limit at the worst point. */
  hoursOver: number
  /**
   * Indicative safety (every hour of one typical year), the largest over all the deck's sample points (gap G38): London
   * hours at 15 m/s or more and the Toronto gust share, each its own maximum; `at` is the point with the most London
   * hours (ties: the larger gust share, then the comfort-worst point), with its nearest open edge, whether it reads as
   * the comfort-worst point does, and the London hours at the comfort-worst point. Null for one wind case.
   */
  safety: {
    londonHours: number; london: boolean; torontoShare: number; toronto: boolean
    at: Pt; atWorst: boolean; edge: { az: number; dist: number } | null; worstHours: number
  } | null
  /** Points under an opening of the storeys above with no slab between (gap G38, team step): how many, how many of them
   *  open to the sky, and whether the worst point's governing reading came from the air above; null when none. */
  sharedAir: { points: number; sky: number; governs: boolean } | null
  /** The screen in place: from the wind settings on every open edge, or the façade's wind-screen zones on some. */
  screen: (Screen & { from: 'setting' | 'facade'; edges: number }) | null
  /** A deck with a slab above: its depth under the slab, the headroom and the cover factor (1 = the slab-above K values,
   *  0 = read as open to the sky); null when open to the sky. */
  cover: { depth: number; headroom: number; factor: number } | null
  /** The smallest screen on every open edge that reaches the target ("sitting") and the next class ("standing"):
   *  'none' when no screen is needed, null when no screen in the set reaches it. */
  need: { sitting: Screen | 'none' | null; standing: Screen | 'none' | null }
}

/** First edge a ray from p along d meets, and how far. */
function rayHit(p: Pt, d: Pt, edges: DeckEdge[]): number {
  let bi = -1, bt = Infinity
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], ex = e.b[0] - e.a[0], ey = e.b[1] - e.a[1], den = d[0] * ey - d[1] * ex
    if (Math.abs(den) < 1e-12) continue
    const wx = e.a[0] - p[0], wy = e.a[1] - p[1], t = (wx * ey - wy * ex) / den, s = (wx * d[1] - wy * d[0]) / den
    if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && t < bt) { bt = t; bi = i }
  }
  return bi
}
/** The screen factor at distance x from a screen the wind meets at γ off square, and whether it is a solid screen's zone. */
export function screenFactor(sc: Screen | null | undefined, x: number, gamma: number): { S: number; solid: boolean } {
  if (!sc || sc.h < 1.2) return { S: 1, solid: false }
  const full = sc.porosity <= 0.1 ? (gamma > 60 ? 1.1 : 0.5) : sc.porosity <= 0.4 ? 0.4 : sc.porosity <= 0.6 ? 0.6 : 0.85
  if (x <= 3 * sc.h) return { S: full, solid: sc.porosity <= 0.1 }
  if (x >= 10 * sc.h) return { S: 1, solid: false }
  return { S: full + ((1 - full) * (x - 3 * sc.h)) / (7 * sc.h), solid: false }
}
const gem = (ti: number) => Math.max(1, (1 + 3 * ti) / 1.85)
/** How much more headroom than the deck's own (m) a point needs before it counts as under an opening above (G38). */
export const SHARED_AIR_TOL = 0.05

/** Cover ratio (depth over headroom) below which a slab is an overhang (f = 0), and from which it shelters fully (f = 1). Team step. */
export const COVER_OPEN = 0.25, COVER_FULL = 1
/** The cover factor for a deck reaching `depth` under a slab `headroom` above it (gap G24, team step): 0–1. */
export function coverFactor(depth: number, headroom: number): number {
  if (!(headroom > 0)) return 1
  const r = depth / headroom
  return Math.max(0, Math.min(1, (r - COVER_OPEN) / (COVER_FULL - COVER_OPEN)))
}
/** A covered deck's depth under the slab: twice the mean distance of its sample points to the nearest open edge (m). */
export function coverDepth(d: Pick<Deck, 'pts' | 'edges'>): number {
  const open = d.edges.filter((e) => e.open)
  if (!open.length || !d.pts.length) return Infinity
  let s = 0
  for (const p of d.pts) { let m = Infinity; for (const e of open) m = Math.min(m, segDist(p, e.a, e.b)); s += m }
  return (2 * s) / d.pts.length
}

/** The wind on each deck (R5 §1.6). */
export function terraceWind(decks: Deck[], H: DeckHours, o: TerraceOptions): DeckWind[] {
  const crit = CRITERIA[o.criteria] ?? CRITERIA.london2019
  const otherKey: Criteria = o.criteria === 'toronto2022' ? 'london2019' : 'toronto2022'
  return decks.map((d) => deckWind(d, H, o, crit, otherKey))
}

function deckWind(d: Deck, H: DeckHours, o: TerraceOptions, crit: CriteriaSet, otherKey: Criteria): DeckWind {
  const { edges, pts, z } = d, P = pts.length, covered = d.cover != null
  const depth = covered ? coverDepth(d) : 0, f = covered ? coverFactor(depth, d.cover!) : 0
  // G38: the cover factor of each point's own headroom where the storeys above open over it with no slab between (-1: none)
  const fp = new Float32Array(P).fill(-1)
  let nShared = 0, nSky = 0
  if (covered && d.ptCover) for (let p = 0; p < P; p++) {
    const h = d.ptCover[p]
    if (h != null && h <= d.cover! + SHARED_AIR_TOL) continue
    fp[p] = h == null ? 0 : coverFactor(depth, h); nShared++; if (h == null) nSky++
  }
  const prof = new Float32Array(BINS), nb = new Float32Array(BINS).fill(1)
  const gam = edges.map((e) => { const g = new Float32Array(BINS); for (let b = 0; b < BINS; b++) g[b] = angDiff(binDir(b), e.az); return g })
  const cx = pts.reduce((s, p) => s + p[0], 0) / P, cy = pts.reduce((s, p) => s + p[1], 0) / P
  const tall = (o.neighbours ?? []).filter((n) => n.z1 > z && n.ring.length >= 3).map((n) => ({ ring: n.ring, c: [n.ring.reduce((s, q) => s + q[0], 0) / n.ring.length, n.ring.reduce((s, q) => s + q[1], 0) / n.ring.length] as Pt }))
  // per point and direction: K, wake turbulence, the edge the wind crosses, the distance to it and the case
  const K = new Float32Array(P * BINS), TI = new Uint8Array(P * BINS), up = new Int16Array(P * BINS), xs = new Float32Array(P * BINS), kc = new Uint8Array(P * BINS), sh = new Uint8Array(P * BINS)
  for (let b = 0; b < BINS; b++) {
    const th = binDir(b), fa = ((th + o.north) * Math.PI) / 180, w: Pt = [Math.sin(fa), Math.cos(fa)], wd: Pt = [-w[0], -w[1]]
    prof[b] = profileRatio(z, th, o.exposure, o.profile)
    // a building taller than the deck upwind in this sector, within 10 of its widths across the wind
    const perp: Pt = [w[1], -w[0]]
    for (const n of tall) {
      const vx = n.c[0] - cx, vy = n.c[1] - cy, dist = Math.hypot(vx, vy)
      if (dist < 1e-6 || angDiff(trueAz(vx, vy, o.north), th) > 22.5) continue
      let lo = Infinity, hi = -Infinity
      for (const q of n.ring) { const s = q[0] * perp[0] + q[1] * perp[1]; lo = Math.min(lo, s); hi = Math.max(hi, s) }
      if (dist <= 10 * (hi - lo)) { nb[b] = 0.7; break }
    }
    // the upwind corner of each open side edge
    const corners = edges.map((e, i) => (e.open && gam[i][b] > 45 && gam[i][b] < 135 ? { c: e.a[0] * w[0] + e.a[1] * w[1] >= e.b[0] * w[0] + e.b[1] * w[1] ? e.a : e.b, r: 0.2 * e.L } : null))
    for (let p = 0; p < P; p++) {
      const at = p * BINS + b, q = pts[p], eu = rayHit(q, w, edges), ed = rayHit(q, wd, edges)
      const E = eu >= 0 ? edges[eu] : null, Dn = ed >= 0 ? edges[ed] : null, g = eu >= 0 ? gam[eu][b] : 0
      // the deck as open to the sky, and (covered) under its slab; the cover factor blends the two
      const sky = (): { k: number; c: KCase; ti: number } => {
        if (E && !E.open) return { k: 0.7, c: 'wake', ti: 1 }
        let k = g <= 45 ? 1.2 : 1.0, c: KCase = g <= 45 ? 'edge' : 'side'
        if (Dn && !Dn.open && (Dn.dH ?? 0) > 0 && angDiff(th, Dn.az + 180) <= 45) {
          // the larger of R5's downwash ratio and the open-edge factor (team: at height the NBC profile is flat, so the
          // ratio alone would read under a plain roof edge)
          k = Math.max(k, profileRatio(z + 0.7 * (Dn.dH ?? 0), th, o.exposure, o.profile) / prof[b]); c = 'downwash'
        }
        for (const cr of corners) if (cr && Math.hypot(q[0] - cr.c[0], q[1] - cr.c[1]) <= cr.r && k < 1.3) { k = 1.3; c = 'corner' }
        return { k, c, ti: 0 }
      }
      const slab = (): { k: number; c: KCase; ti: number } => {
        if (E && !E.open) return { k: 0.5, c: 'sheltered', ti: 1 }
        if (g > 45) return { k: 0.5, c: 'across', ti: 0 }
        if (!Dn || Dn.open) return { k: 1.14, c: 'through', ti: 0 }
        let k = 0.6, c: KCase = 'loggia'
        for (const cr of corners) if (cr && Math.hypot(q[0] - cr.c[0], q[1] - cr.c[1]) <= cr.r && k < 1.3) { k = 1.3; c = 'corner' }
        return { k, c, ti: 0 }
      }
      const kAt = (fv: number): { k: number; c: KCase; ti: number } => {
        if (!covered || fv <= 0) return sky()
        if (fv >= 1) return slab()
        const a = sky(), s2 = slab()
        return { k: a.k + fv * (s2.k - a.k), c: s2.c, ti: s2.ti }
      }
      let r = kAt(f)
      // G38: under an opening of the storeys above, the more exposed of the deck's cover and the point's own headroom
      if (fp[p] >= 0) { const r2 = kAt(fp[p]); if (r2.k * gem(r2.ti ? 0.35 : 0.2) > r.k * gem(r.ti ? 0.35 : 0.2) + 1e-9) { r = r2; sh[at] = 1 } }
      K[at] = r.k; TI[at] = r.ti; up[at] = eu; kc[at] = K_CASES.indexOf(r.c)
      xs[at] = E ? segDist(q, E.a, E.b) : 0
    }
  }
  // the multipliers with a given screen on each edge: comfort (GEM), mean, and gust
  const mults = (scr: (e: number) => Screen | null) => {
    const Fc = new Float32Array(P * BINS), Fg = new Float32Array(P * BINS)
    for (let at = 0; at < P * BINS; at++) {
      const b = at % BINS, e = up[at]
      let S = 1, solid = false
      if (e >= 0 && edges[e].open) { const r = screenFactor(scr(e), xs[at], gam[e][b]); S = r.S; solid = r.solid }
      const ti = TI[at] || solid ? 0.35 : 0.2, m = prof[b] * K[at] * S * nb[b]
      Fc[at] = m * gem(ti); Fg[at] = m * (1 + 3 * ti)
    }
    return { Fc, Fg }
  }
  const facade = edges.map((e, i) => (e.open && o.edgeScreen ? o.edgeScreen(d, edges[i]) : null))
  const scrNow = (e: number) => o.screen ?? facade[e]
  const { Fc, Fg } = mults(scrNow)
  // each point's reading (points with the same multipliers share it)
  const memo = new Map<string, DeckRead>()
  const reads: DeckRead[] = []
  for (let p = 0; p < P; p++) {
    const f = Fc.subarray(p * BINS, (p + 1) * BINS), key = Array.from(f, (v) => Math.round(v * 1000)).join(',')
    let r = memo.get(key)
    if (!r) { r = readSeasons(H, f, crit); memo.set(key, r) }
    reads.push(r)
  }
  let wi = 0
  for (let p = 1; p < P; p++) { const a = reads[p], b = reads[wi]; if (a.cls > b.cls || (a.cls === b.cls && a.v > b.v)) wi = p }
  const read = reads[wi], ws: DeckSeason = read.worst
  const share = new Array(crit.classes.length).fill(0)
  for (const r of reads) share[r.seasons[ws].cls] += 1 / P
  const fW = Fc.subarray(wi * BINS, (wi + 1) * BINS)
  const lim = crit.limits[crit.target]
  let gb = 0, gh = -1
  for (let b = 0; b < BINS; b++) { const a = H.comfort[ws].byBin[b]; if (!a.length || !(fW[b] > 0)) continue; let c = 0; for (let i = a.length - 1; i >= 0 && a[i] * fW[b] > lim; i--) c++; if (c > gh) { gh = c; gb = b } }
  const ga = wi * BINS + gb
  const screened = edges.filter((e, i) => e.open && scrNow(i)).length
  const firstFacade = facade.find((x) => x)
  return {
    deck: d, read,
    other: { criteria: otherKey, read: readSeasons(H, fW, CRITERIA[otherKey]) },
    share,
    governing: { dir: binDir(gb), edgeAz: up[ga] >= 0 ? edges[up[ga]].az : null, kCase: K_CASES[kc[ga]], k: K[ga], shared: sh[ga] === 1 },
    hoursOver: hoursAbove(H.comfort.year, fW, lim),
    safety: H.source === 'one' ? null : safetyOver(H, Fc, Fg, P, wi, pts, edges),
    sharedAir: nShared ? { points: nShared, sky: nSky, governs: sh[ga] === 1 } : null,
    screen: o.screen ? { ...o.screen, from: 'setting', edges: screened } : firstFacade ? { ...firstFacade, from: 'facade', edges: screened } : null,
    cover: covered ? { depth, headroom: d.cover!, factor: f } : null,
    need: screenNeed(H, crit, P, read.cls, (sc) => mults(() => sc).Fc),
  }
}

/** Indicative safety over every sample point (gap G38): the largest London hours and Toronto gust share, and where. */
function safetyOver(H: DeckHours, Fc: Float32Array, Fg: Float32Array, P: number, wi: number, pts: Pt[], edges: DeckEdge[]): NonNullable<DeckWind['safety']> {
  const memo = new Map<string, [number, number]>()
  let si = wi, sl = -1, ss = -1, tMax = 0, worstHours = 0
  for (let p = 0; p < P; p++) {
    const fc = Fc.subarray(p * BINS, (p + 1) * BINS), fg = Fg.subarray(p * BINS, (p + 1) * BINS)
    const key = Array.from(fc, (v) => Math.round(v * 1000)).join(',') + '|' + Array.from(fg, (v) => Math.round(v * 1000)).join(',')
    let v = memo.get(key)
    if (!v) { v = [hoursAbove(H.all, fc, 15), hoursAbove(H.all, fg, 25) / H.all.n]; memo.set(key, v) }
    const [lh, ts] = v
    if (p === wi) worstHours = lh
    tMax = Math.max(tMax, ts)
    // on a tie the comfort-worst point keeps the place, so a deck that reads alike everywhere names it
    if (lh > sl || (lh === sl && ts > ss) || (lh === sl && ts === ss && p === wi)) { sl = lh; ss = ts; si = p }
  }
  const q = pts[si]
  let edge: { az: number; dist: number } | null = null
  for (const e of edges) if (e.open) { const dd = segDist(q, e.a, e.b); if (!edge || dd < edge.dist) edge = { az: e.az, dist: dd } }
  return { londonHours: sl, london: sl / H.all.n > 0.00022, torontoShare: tMax, toronto: tMax > 0.001, at: q, atWorst: si === wi || sl === worstHours, edge, worstHours }
}

/** The smallest screen in R5's set that brings every point to the target class, and to the next one, in every season. */
function screenNeed(H: DeckHours, crit: CriteriaSet, P: number, clsNow: number, fcOf: (sc: Screen) => Float32Array): DeckWind['need'] {
  const need: DeckWind['need'] = { sitting: clsNow <= crit.target ? 'none' : null, standing: clsNow <= crit.check ? 'none' : null }
  if (need.sitting && need.standing) return need
  const meets = (Fc: Float32Array, cls: number) => {
    for (let p = 0; p < P; p++) {
      const f = Fc.subarray(p * BINS, (p + 1) * BINS)
      for (const s of DECK_SEASONS) { const Hs = H.comfort[s]; if (hoursAbove(Hs, f, crit.limits[cls]) > crit.q * Hs.n) return false }
    }
    return true
  }
  for (const sc of SCREEN_SET) {
    if (need.sitting && need.standing) break
    const Fc = fcOf(sc)
    if (!need.standing && meets(Fc, crit.check)) need.standing = sc
    if (!need.sitting && meets(Fc, crit.target)) need.sitting = sc
  }
  return need
}

/** A class name with its speed (one decimal). */
export const classWord = (c: CriteriaSet, r: { cls: number; v: number }) => `${c.classes[r.cls]} (${r.v.toFixed(1)} m/s)`
export { classOf }
