// A floor plan at the quality of Sun & Wind Studio's plan view (study.js drawPlan), drawn to the house drawing standards
// (arch-drawing-standards: cut profile heaviest, edges medium, surface and annotation thin; grid bubbles on chain lines,
// numbers one way and letters the other without I, O, Q; dimension strings outside the plan with 45° ticks, bays then
// overall; stairs with treads, break line, arrow and UP; a north arrow and a graphic scale).
// Underneath sits the result as one smooth image, clipped to the plate less the core.
// The plan is drawn in the floor's own axes turned by quarter turns so north is within 45° of up; the north arrow shows
// the rest. Everything is laid out in screen pixels, so line weights and lettering hold at any zoom.
// The core is the toolkit's own: lift shafts from engine/plan.ts coreLayout and exit stairs from engine/egress.ts, as the
// Plan tool and the board drawing place them.
import { useId, useMemo, type ReactNode } from 'react'
import { stairEnclosure, stairSpots, storeyLoads } from '../../engine/egress'
import { liftCheck } from '../../engine/lifts'
import { coreLayout } from '../../engine/plan'
import { band, STRATS, swFloors, zoneFor, type Face, type FacadeZone, type SwFloor } from '../../engine/sw/plate'
import { USES, type Tower } from '../../engine/types'
import { useStore } from '../../store'
import type { Raster } from './planRaster'

export interface PlanView { z: number; dx: number; dy: number }
type P2 = [number, number]

const INK = '#1F2227', GLASS = '#2F5F8A', GRID = '#7C838D', DIM = '#3B414A', TW = 0.3, CUT_Z = 1.2, SIDE: Record<Face, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'
const letter = (j: number) => LETTERS[j % LETTERS.length] + (j >= LETTERS.length ? String(Math.floor(j / LETTERS.length)) : '')
const fmtM = (v: number) => v.toFixed(2)
const niceLen = (maxM: number) => [50, 20, 10, 5, 2, 1].find((v) => v <= maxM) ?? 1

/** Everything about the plan that does not depend on the zoom: geometry in view metres (x right, y up). */
function useGeometry(f: SwFloor, t: Tower, zones: FacadeZone[]) {
  const lp = useStore((s) => s.liftPresets), ep = useStore((s) => s.egressPresets)
  return useMemo(() => {
    const q = Math.round(f.rot / (Math.PI / 2)), c = Math.round(Math.cos((q * Math.PI) / 2)), s = Math.round(Math.sin((q * Math.PI) / 2)), delta = f.rot - (q * Math.PI) / 2
    const rv = (x: number, y: number): P2 => [x * c - y * s, x * s + y * c]
    const rings = f.rings.map((r) => r.map(([x, y]) => rv(x, y)))
    const box = (rs: P2[][]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of rs) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } return { x0, y0, x1, y1 } }
    const B = box(rings)
    let gross = 0
    for (const r of rings) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; gross += Math.abs(a / 2) }
    const inRings = (x: number, y: number) => { let o = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o } return o }
    const edges = f.edges.map((e) => {
      const m = rv(e.mx, e.my), u = rv(e.ux, e.uy), o = rv(e.ox, e.oy), z = zoneFor(zones, e.zf, f.level), Bd = band(f, z)
      // the plan cut is at 1.2 m and steps up to catch the windows (the drafting convention), so a glazed face reads as glazing
      // even where its sill is higher; a face with next to no glass is solid wall
      return { m, u, o, L: e.L, face: e.o, z, st: STRATS[z.strat], D: z.depth || 0, inGlass: z.wwr > 0.05 && Bd.gh > 0.3, sill: Bd.sp }
    })
    const maxDev = Math.min(3, Math.max(0, ...edges.map((e) => (e.st.device || e.z.strat === 'doubleskin' ? e.D : 0))))
    // core: the engine's square, with the toolkit's shafts and stairs inside it
    const cc = rv(f.core.x, f.core.y), ch = f.core.half
    type Rect = { x0: number; y0: number; x1: number; y1: number }
    const rect = (cx: number, cy: number, a: number, b: number): Rect => ({ x0: cx - a / 2, y0: cy - b / 2, x1: cx + a / 2, y1: cy + b / 2 })
    let shafts: (Rect & { stop: boolean })[] = [], stairs: (Rect & { inCore: boolean })[] = [], tread = 0.28
    try {
      const lift = liftCheck(t, lp, ep), lay = coreLayout(t, lift, lp, ep), r = lay.core > 0.5 ? (2 * ch) / lay.core : 1, zc = f.z + CUT_Z
      shafts = lay.shafts.filter((sh) => !sh.outside && sh.z0 <= zc && sh.z1 > zc).map((sh) => { const p = rv(sh.x * r, sh.y * r); return { ...rect(cc[0] + p[0], cc[1] + p[1], lay.side * r, lay.side * r), stop: sh.stops.has(f.level) } })
      const seen = new Set<string>()
      shafts = shafts.filter((sh) => { const k = `${sh.x0.toFixed(2)},${sh.y0.toFixed(2)}`; if (seen.has(k)) return false; seen.add(k); return true })
      const loads = storeyLoads(t, ep, { homeM2: lp.homeM2, hotelM2PerKey: lp.hotelM2PerKey }), st = loads.find((x) => x.level === f.level) ?? loads[0]
      const enc = stairEnclosure(st?.stairMm || 1100, st?.f2f ?? f.h, ep)
      tread = ep.tread
      stairs = stairSpots(t, Math.max(2, Math.round(ep.stairs)), enc.a, enc.b).map((sp) => {
        const k = sp.inCore ? r : 1, p = rv(sp.x * k, sp.y * k), a = (q % 2 ? enc.b : enc.a) * k, b = (q % 2 ? enc.a : enc.b) * k
        return { ...rect((sp.inCore ? cc[0] : 0) + p[0], (sp.inCore ? cc[1] : 0) + p[1], a, b), inCore: sp.inCore }
      }).filter((sr) => sr.inCore || (inRings(sr.x0 + 0.2, sr.y0 + 0.2) && inRings(sr.x1 - 0.2, sr.y1 - 0.2)))
    } catch { /* a plain core */ }
    // structural grid: bays near 9 m across the tower plate, columns 0.6 m inside the façade, carried over a wider podium
    let tb = B
    try { const tf = swFloors(t, 0, 4).find((x) => !x.podium); if (tf) tb = box(tf.rings.map((r) => r.map(([x, y]) => rv(x, y)))) } catch { /* this floor's own box */ }
    const lines = (a: number, b: number, lo2: number, hi2: number) => {
      const lo = a + 0.6, hi = b - 0.6
      if (hi - lo < 3) return [(a + b) / 2]
      const n = Math.max(1, Math.round((hi - lo) / 9)), st = (hi - lo) / n, out: number[] = []
      for (let v = lo - Math.floor((lo - (lo2 + 0.6)) / st + 1e-6) * st; v <= hi2 - 0.6 + 1e-6 && out.length < 24; v += st) out.push(v)
      return out
    }
    const GX = lines(tb.x0, tb.x1, B.x0, B.x1), GY = lines(tb.y0, tb.y1, B.y0, B.y1)
    const cols: P2[] = []
    for (const x of GX) for (const y of GY) {
      if (Math.abs(x - cc[0]) <= ch + 0.6 && Math.abs(y - cc[1]) <= ch + 0.6) continue
      if ([[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]].every(([dx, dy]) => inRings(x + dx, y + dy))) cols.push([x, y])
    }
    return { rv, c, s, delta, rings, B, gross, edges, maxDev, cc, ch, shafts, stairs, tread, GX, GY, cols }
  }, [f, t, zones, lp, ep])
}

export default function StudioPlan({ f, t, zones, w, h, raster, grids = true, view, sun, closed, label, pad = [0, 0, 0, 0], marks = true, children }: {
  f: SwFloor; t: Tower; zones: FacadeZone[]; w: number; h: number; raster?: Raster | null; grids?: boolean; view?: PlanView | null
  sun?: { az: number; alt: number } | null; closed?: Partial<Record<Face, boolean>> | null; label: string
  /** Pixels kept clear at the top, right, bottom and left (for a card or a bar beside the drawing). */
  pad?: [number, number, number, number]; marks?: boolean; children?: ReactNode
}) {
  const G = useGeometry(f, t, zones), cid = useId().replace(/:/g, '')
  const { B, maxDev } = G
  // fit: the plate with its devices, the annotation around it, then the pads
  const mL = grids ? 50 : marks ? 12 : 8, mT = grids ? 50 : 12, mR = grids ? 64 : marks ? 46 : 8, mB = grids ? 64 : marks ? 30 : 8, sunM = sun ? 26 : 0
  const availW = Math.max(40, w - pad[1] - pad[3] - mL - mR - 2 * sunM), availH = Math.max(40, h - pad[0] - pad[2] - mT - mB - 2 * sunM)
  const k0 = Math.min(availW / (B.x1 - B.x0 + 2 * maxDev), availH / (B.y1 - B.y0 + 2 * maxDev))
  const z = view?.z ?? 1, k = k0 * z
  const cx0 = pad[3] + mL + sunM + availW / 2, cy0 = pad[0] + mT + sunM + availH / 2
  const ox = (cx0 - k0 * (B.x0 + B.x1) / 2 - w / 2) * z + w / 2 + (view?.dx ?? 0), oy = (cy0 + k0 * (B.y0 + B.y1) / 2 - h / 2) * z + h / 2 + (view?.dy ?? 0)
  const S = (x: number, y: number): P2 => [ox + k * x, oy - k * y]
  const pt = (p: P2) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  const poly = (pts: P2[]) => `M${pts.map((p) => pt(S(p[0], p[1]))).join('L')}Z`
  const rectD = (r: { x0: number; y0: number; x1: number; y1: number }) => poly([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]])
  const ringsD = G.rings.map(poly).join(' ')
  const coreR = { x0: G.cc[0] - G.ch, y0: G.cc[1] - G.ch, x1: G.cc[0] + G.ch, y1: G.cc[1] + G.ch }
  const out: ReactNode[] = []
  let key = 0
  const line = (a: P2, b: P2, stroke: string, sw: number, dash?: string) => { const A = S(a[0], a[1]), Bq = S(b[0], b[1]); out.push(<line key={key++} x1={A[0].toFixed(1)} y1={A[1].toFixed(1)} x2={Bq[0].toFixed(1)} y2={Bq[1].toFixed(1)} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />) }
  const quad = (pts: P2[], attrs: { fill?: string; stroke?: string; sw?: number; dash?: string } = {}) => out.push(<path key={key++} d={poly(pts)} fill={attrs.fill ?? INK} stroke={attrs.stroke ?? 'none'} strokeWidth={attrs.sw} strokeDasharray={attrs.dash} />)
  const text = (x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number; rot?: number; halo?: boolean; haloW?: number; spacing?: number } = {}) => out.push(
    <text key={key++} x={x.toFixed(1)} y={y.toFixed(1)} fontSize={o.size ?? 10} textAnchor={o.anchor ?? 'middle'} fill={o.fill ?? INK} fontWeight={o.weight ?? 500} letterSpacing={o.spacing} transform={o.rot ? `rotate(${o.rot} ${x.toFixed(1)} ${y.toFixed(1)})` : undefined}
      stroke={o.halo === false ? undefined : '#fff'} strokeWidth={o.halo === false ? undefined : o.haloW ?? 3} paintOrder="stroke" strokeLinejoin="round" style={{ fontVariantNumeric: 'tabular-nums' }}>{s}</text>)

  // ---- blinds down on a face (the Studio's blindBands)
  if (closed) for (const e of G.edges) { if (!closed[e.face]) continue; const at = (u: number, v: number): P2 => [e.m[0] + e.u[0] * u + e.o[0] * v, e.m[1] + e.u[1] * u + e.o[1] * v], h2 = e.L / 2 - 0.2; quad([at(-h2, -0.5), at(h2, -0.5), at(h2, -1.3), at(-h2, -1.3)], { fill: 'rgba(43,51,61,0.7)' }) }

  // ---- shading devices: overhangs and shelves are above the cut (dashed), louvres below it, fins are cut
  for (const e of G.edges) {
    const at = (u: number, v: number): P2 => [e.m[0] + e.u[0] * u + e.o[0] * v, e.m[1] + e.u[1] * u + e.o[1] * v], h2 = e.L / 2, D = e.D, s = e.z.strat
    const q = (u0: number, u1: number, v0: number, v1: number): P2[] => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
    if (!(D > 0.05) || e.L < 0.8) continue
    if (s === 'overhang' || s === 'lightshelf') quad(q(-h2 - 0.1, h2 + 0.1, 0, D), { fill: 'none', stroke: '#4B5057', sw: 0.8, dash: '5 3' })
    if (s === 'louvres' || s === 'eggcrate') { quad(q(-h2, h2, 0.02, D), { fill: 'none', stroke: '#5F646B', sw: 0.7 }); if (k * D > 8) line(at(-h2, D * 0.5), at(h2, D * 0.5), '#8A8F96', 0.5) }
    if (s === 'fins' || s === 'eggcrate') { const n = Math.max(1, Math.floor(e.L / 1.5)), stp = e.L / n; if (k * stp > 3) for (let i = 0; i < n; i++) { const u = -h2 + (i + 0.5) * stp; quad(q(u - 0.05, u + 0.05, 0, D), { stroke: INK, sw: 0.5 }) } else quad(q(-h2, h2, 0, D), { fill: 'none', stroke: '#5F646B', sw: 0.6 }) }
    if (s === 'balcony') { quad(q(-h2 - 0.05, h2 + 0.05, 0, D), { fill: '#FAFAF8', stroke: '#5F646B', sw: 0.8 }); line(at(-h2 - 0.05, D - 0.04), at(h2 + 0.05, D - 0.04), INK, 1.4) }
    if (s === 'doubleskin') { const Dd = Math.max(0.3, D); line(at(-h2, Dd), at(h2, Dd), GLASS, 1.4) }
  }

  // ---- façade, cut at 1.2 m: frames and glass where the cut passes the glass band, solid wall where it does not
  for (const e of G.edges) {
    const at = (u: number, v: number): P2 => [e.m[0] + e.u[0] * u + e.o[0] * v, e.m[1] + e.u[1] * u + e.o[1] * v], h2 = e.L / 2
    const q = (u0: number, u1: number, v0: number, v1: number): P2[] => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
    const tip = `${SIDE[e.face]} face · ${e.st.name} · glass from ${e.sill.toFixed(2)} m${e.z.operable ? ' · windows open' : ' · fixed glazing'}`
    const from = out.length
    if (e.z.strat === 'punched' && e.inGlass) {
      const T = Math.max(TW, e.D), nW = Math.max(1, Math.floor(e.L / 2.4)), stp = e.L / nW, wd = Math.min(1.8, stp - 0.4)
      let u = -h2
      if (wd > 0.4) for (let i = 0; i < nW; i++) { const c0 = -h2 + (i + 0.5) * stp; quad(q(u, c0 - wd / 2, -T, 0)); line(at(c0 - wd / 2, -T / 2), at(c0 + wd / 2, -T / 2), GLASS, 1, e.z.operable ? undefined : '4 2.5'); for (const v of [-T, -T + 0.06]) line(at(c0 - wd / 2, v), at(c0 + wd / 2, v), INK, 0.6); u = c0 + wd / 2 }
      quad(q(u, h2, -T, 0))
    } else if (e.inGlass) {
      line(at(-h2, 0), at(h2, 0), INK, 1.5); line(at(-h2 + TW, -TW), at(h2 - TW, -TW), INK, 1.5)
      if (TW * k >= 4) line(at(-h2 + TW, -TW / 2), at(h2 - TW, -TW / 2), GLASS, 1, e.z.operable ? undefined : '4 2.5')
      quad(q(-h2, -h2 + TW, -TW, 0)); quad(q(h2 - TW, h2, -TW, 0)) // corner posts close the cut profile
      if (k * 1.5 > 5) { const n = Math.max(1, Math.round(e.L / 1.5)), mw = Math.max(0.04, 0.5 / k); for (let i = 1; i < n; i++) { const u = -h2 + (i * e.L) / n; quad(q(u - mw, u + mw, -TW, 0.14)) } }
    } else quad(q(-h2, h2, -TW, 0))
    out.push(<g key={key++}><title>{tip}</title>{out.splice(from)}</g>)
  }

  // ---- core: 300 mm walls, lift shafts crossed, exit stairs with treads, break line, arrow and UP
  {
    const T = 0.3, r = coreR
    out.push(<path key={key++} d={rectD(r)} fill="#fff" />)
    const occupied = (x: number, y: number) => [...G.shafts, ...G.stairs].some((b) => x >= b.x0 - 0.3 && x <= b.x1 + 0.3 && y >= b.y0 - 0.3 && y <= b.y1 + 0.3)
    for (const sh of G.shafts) {
      out.push(<path key={key++} d={rectD(sh)} fill="#fff" stroke={INK} strokeWidth={0.9} />)
      if ((sh.x1 - sh.x0) * k > 5) { line([sh.x0, sh.y0], [sh.x1, sh.y1], INK, 0.5); line([sh.x0, sh.y1], [sh.x1, sh.y0], INK, 0.5) }
    }
    for (const st of G.stairs) {
      const vert = st.y1 - st.y0 >= st.x1 - st.x0, len = vert ? st.y1 - st.y0 : st.x1 - st.x0, wid = vert ? st.x1 - st.x0 : st.y1 - st.y0
      // the end nearer the core's middle is the landing people come in by
      const mid = vert ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, cm = st.inCore ? (vert ? G.cc[1] : G.cc[0]) : (vert ? (B.y0 + B.y1) / 2 : (B.x0 + B.x1) / 2), flip = mid < cm
      const at = (p: number, q2: number): P2 => { const pp = flip ? len - p : p; return vert ? [st.x0 + q2, st.y0 + pp] : [st.x0 + pp, st.y0 + q2] }
      const fw = (wid - 0.1) / 2, land = Math.min(fw, len * 0.28)
      out.push(<path key={key++} d={rectD(st)} fill="#fff" stroke={INK} strokeWidth={1.4} />)
      if (wid * k < 9) continue
      quad([at(land, fw), at(len - land, fw), at(len - land, fw + 0.1), at(land, fw + 0.1)], { fill: 'none', stroke: INK, sw: 0.6 })
      const step = k * G.tread > 2.2 ? G.tread : k * G.tread * 2 > 2.2 ? G.tread * 2 : 0
      if (step) for (let p = land; p <= len - land + 1e-6; p += step) { line(at(p, 0), at(p, fw), INK, 0.4); line(at(p, fw + 0.1), at(p, wid), INK, 0.4) }
      const cut = land + (len - 2 * land) * 0.55
      line(at(cut - 0.45, 0), at(cut + 0.45, fw), INK, 1.1)
      line(at(land, fw / 2), at(cut, fw / 2), INK, 0.7)
      { const tip2 = S(...at(cut, fw / 2)), bb = S(...at(cut - 0.5, fw / 2)), dx = tip2[0] - bb[0], dy = tip2[1] - bb[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L
        out.push(<path key={key++} d={`M${pt(tip2)}L${(tip2[0] - ux * 6 - uy * 3).toFixed(1)},${(tip2[1] - uy * 6 + ux * 3).toFixed(1)}L${(tip2[0] - ux * 6 + uy * 3).toFixed(1)},${(tip2[1] - uy * 6 - ux * 3).toFixed(1)}Z`} fill={INK} />) }
      if (k * land > 15 && k * fw > 16) { const p = S(...at(land * 0.5, fw / 2)); text(p[0], p[1] + 3, 'UP', { size: 8, halo: false, weight: 600 }) }
      // door from the lobby onto the landing, leaf and swing
      if (k > 6) { const d0 = at(0, fw + 0.1 + (fw - 0.9) / 2), d1 = at(0, fw + 0.1 + (fw - 0.9) / 2 + 0.9), lf = at(0.9, fw + 0.1 + (fw - 0.9) / 2), A = S(...d0), Bq = S(...d1), Lq = S(...lf), rr = 0.9 * k
        const sweep = ((Lq[0] - A[0]) * (Bq[1] - A[1]) - (Lq[1] - A[1]) * (Bq[0] - A[0])) > 0 ? 1 : 0
        out.push(<line key={key++} x1={A[0]} y1={A[1]} x2={Bq[0]} y2={Bq[1]} stroke="#fff" strokeWidth={2.6} />)
        out.push(<path key={key++} d={`M${pt(A)}L${pt(Lq)}A${rr.toFixed(1)},${rr.toFixed(1)} 0 0 ${sweep} ${pt(Bq)}`} fill="none" stroke={INK} strokeWidth={0.6} />) }
    }
    // walls last so the cut reads heaviest; two ways in where nothing stands behind the wall
    out.push(<path key={key++} d={`${rectD(r)} ${rectD({ x0: r.x0 + T, y0: r.y0 + T, x1: r.x1 - T, y1: r.y1 - T })}`} fill={INK} fillRule="evenodd" />)
    if (G.ch * k > 14) {
      const sides: { p: P2; n: P2 }[] = [{ p: [r.x1, G.cc[1]], n: [1, 0] }, { p: [r.x0, G.cc[1]], n: [-1, 0] }, { p: [G.cc[0], r.y0], n: [0, -1] }, { p: [G.cc[0], r.y1], n: [0, 1] }]
      const free = sides.filter((sd) => !occupied(sd.p[0] - sd.n[0] * 0.9, sd.p[1] - sd.n[1] * 0.9))
      for (const sd of (free.length >= 2 ? free.slice(0, 2) : free)) {
        const tx = -sd.n[1], ty = sd.n[0], a: P2 = [sd.p[0] - tx * 0.6, sd.p[1] - ty * 0.6], b: P2 = [sd.p[0] + tx * 0.6, sd.p[1] + ty * 0.6]
        quad([[a[0] + sd.n[0] * 0.02, a[1] + sd.n[1] * 0.02], [b[0] + sd.n[0] * 0.02, b[1] + sd.n[1] * 0.02], [b[0] - sd.n[0] * (T + 0.02), b[1] - sd.n[1] * (T + 0.02)], [a[0] - sd.n[0] * (T + 0.02), a[1] - sd.n[1] * (T + 0.02)]], { fill: '#fff' })
        for (const e of [a, b]) line(e, [e[0] - sd.n[0] * T, e[1] - sd.n[1] * T], INK, 0.6)
      }
      if (!G.shafts.length && !G.stairs.length) { const p = S(G.cc[0], G.cc[1]); text(p[0], p[1] + 3, 'CORE', { size: 9, fill: '#5F646B', halo: false }) }
    }
  }

  // ---- structure: columns always; grid lines, bubbles and dimension strings when asked
  if (k * 0.8 >= 2.5) for (const [x, y] of G.cols) quad([[x - 0.4, y - 0.4], [x + 0.4, y - 0.4], [x + 0.4, y + 0.4], [x - 0.4, y + 0.4]])
  const devPx = maxDev * k, left = S(B.x0, 0)[0] - devPx, right = S(B.x1, 0)[0] + devPx, top = S(0, B.y1)[1] - devPx, bot = S(0, B.y0)[1] + devPx
  if (grids) {
    const chain = '12 3 2 3', R = 9, yB = top - 30, xB = left - 30, d1 = 26, d2 = 46
    const stride = (vs: number[]) => { const gap = vs.length > 1 ? Math.abs(vs[1] - vs[0]) * k : 99; return gap < 20 ? Math.ceil(20 / gap) : 1 }
    const sx = stride(G.GX), sy = stride(G.GY)
    G.GX.forEach((x, i) => { const X = S(x, 0)[0]; out.push(<line key={key++} x1={X} y1={yB + R} x2={X} y2={bot + d1} stroke={GRID} strokeWidth={0.6} strokeDasharray={chain} />); if (i % sx === 0) { out.push(<circle key={key++} cx={X} cy={yB} r={R} fill="#fff" stroke={INK} strokeWidth={0.9} />); text(X, yB + 3.5, String(i + 1), { halo: false, weight: 600 }) } })
    G.GY.forEach((y, j) => { const Y = S(0, y)[1]; out.push(<line key={key++} x1={xB + R} y1={Y} x2={right + d1} y2={Y} stroke={GRID} strokeWidth={0.6} strokeDasharray={chain} />); if (j % sy === 0) { out.push(<circle key={key++} cx={xB} cy={Y} r={R} fill="#fff" stroke={INK} strokeWidth={0.9} />); text(xB, Y + 3.5, letter(j), { halo: false, weight: 600 }) } })
    // dimension strings: bays, then overall; 45° ticks; figures above the line, read from the bottom and the right
    const tick = (x: number, y: number) => out.push(<line key={key++} x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} stroke={DIM} strokeWidth={1.2} />)
    const string = (vals: number[], pos: number, horiz: boolean) => {
      const px = (v: number) => (horiz ? S(v, 0)[0] : S(0, v)[1]), a = px(vals[0]), b = px(vals[vals.length - 1])
      out.push(horiz ? <line key={key++} x1={a - 5} y1={pos} x2={b + 5} y2={pos} stroke={DIM} strokeWidth={0.7} /> : <line key={key++} x1={pos} y1={a + 5} x2={pos} y2={b - 5} stroke={DIM} strokeWidth={0.7} />)
      vals.forEach((v, i) => {
        const p = px(v)
        if (horiz) tick(p, pos); else tick(pos, p)
        if (i === 0) return
        const p0 = px(vals[i - 1]), len = Math.abs(v - vals[i - 1]), s = fmtM(len)
        if (Math.abs(p - p0) < s.length * 5.6 + 3) return
        if (horiz) text((p + p0) / 2, pos - 4, s, { size: 10, fill: DIM }); else text(pos - 4, (p + p0) / 2, s, { size: 10, fill: DIM, rot: -90 })
      })
    }
    const within = (vs: number[], a: number, b: number) => vs.filter((v) => v > a + 0.05 && v < b - 0.05)
    string([B.x0, ...within(G.GX, B.x0, B.x1), B.x1], bot + d1, true); string([B.x0, B.x1], bot + d2, true)
    string([B.y0, ...within(G.GY, B.y0, B.y1), B.y1], right + d1, false); string([B.y0, B.y1], right + d2, false)
    for (const x of [B.x0, B.x1]) { const X = S(x, 0)[0]; out.push(<line key={key++} x1={X} y1={bot + 5} x2={X} y2={bot + d2 + 5} stroke={DIM} strokeWidth={0.6} />) }
    for (const y of [B.y0, B.y1]) { const Y = S(0, y)[1]; out.push(<line key={key++} x1={right + 5} y1={Y} x2={right + d2 + 5} y2={Y} stroke={DIM} strokeWidth={0.6} />) }
  }

  // ---- the use and the gross area, in the widest clear part of the floor
  {
    const name = USES[f.use]?.label.replace(/ \/.*$/, '').toUpperCase() ?? String(f.use).toUpperCase(), area = `${Math.round(G.gross).toLocaleString('en-CA')} m² gross`, need = Math.max(name.length * 7.6, area.length * 5.6) + 14
    const between = (vs: number[], lo: number, hi: number, want: number) => { let best: [number, number] | null = null; const all = [lo, ...vs.filter((v) => v > lo && v < hi), hi]; for (let i = 0; i + 1 < all.length; i++) if (!best || Math.abs((all[i] + all[i + 1]) / 2 - want) < Math.abs((best[0] + best[1]) / 2 - want)) best = [all[i], all[i + 1]]; return best! }
    const c = coreR, bands: { x: [number, number]; y: [number, number] }[] = [
      { x: [c.x1 + 0.4, B.x1 - TW - 0.4], y: [B.y0 + TW + 0.4, B.y1 - TW - 0.4] }, { x: [B.x0 + TW + 0.4, B.x1 - TW - 0.4], y: [B.y0 + TW + 0.4, c.y0 - 0.4] },
      { x: [B.x0 + TW + 0.4, c.x0 - 0.4], y: [B.y0 + TW + 0.4, B.y1 - TW - 0.4] }, { x: [B.x0 + TW + 0.4, B.x1 - TW - 0.4], y: [c.y1 + 0.4, B.y1 - TW - 0.4] }]
    for (const b of bands) {
      // between two grid lines each way, so no line runs through the words
      const bx = grids ? between(G.GX, b.x[0], b.x[1], (b.x[0] + b.x[1]) / 2) : b.x, by = grids ? between(G.GY, b.y[0], b.y[1], G.cc[1]) : b.y
      const use = (bx[1] - bx[0]) * k >= need ? bx : b.x, useY = (by[1] - by[0]) * k >= 36 ? by : b.y
      if ((use[1] - use[0]) * k < need || (useY[1] - useY[0]) * k < 36) continue
      const p = S((use[0] + use[1]) / 2, (useY[0] + useY[1]) / 2)
      text(p[0], p[1] - 2, name, { size: 11, weight: 700, spacing: 0.6, haloW: 5 }); text(p[0], p[1] + 12, area, { size: 10, fill: '#4A515B', haloW: 5 })
      break
    }
  }

  // ---- where the sun is at this hour: outside the annotation, on its compass bearing
  if (sun && sun.alt > 0) {
    const a = (sun.az * Math.PI) / 180 + G.delta, dx = Math.sin(a), dy = -Math.cos(a), cxs = (left + right) / 2, cys = (top + bot) / 2
    const hx = (right - left) / 2 + (grids ? (dx > 0 ? 58 : 44) : 6), hy = (bot - top) / 2 + (grids ? (dy > 0 ? 58 : 44) : 6)
    const tt = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hy / Math.abs(dy) : Infinity) + 16, x = cxs + dx * tt, y = cys + dy * tt
    out.push(<g key={key++} stroke="#D98A1E" strokeWidth={1.6} strokeLinecap="round"><title>{`Sun · ${Math.round(sun.az)}° from north, ${Math.round(sun.alt)}° high`}</title>
      <line x1={x - dx * 11} y1={y - dy * 11} x2={x - dx * 24} y2={y - dy * 24} strokeDasharray="4 3" />
      {Array.from({ length: 8 }, (_, i) => { const q = (i * Math.PI) / 4; return <line key={i} x1={x + Math.cos(q) * 7} y1={y + Math.sin(q) * 7} x2={x + Math.cos(q) * 9.5} y2={y + Math.sin(q) * 9.5} /> })}
      <circle cx={x} cy={y} r={4.6} fill="#F5B83D" strokeWidth={1.2} /></g>)
  }

  // ---- north arrow and graphic scale, fixed to the frame
  if (marks) {
    const nx = w - pad[1] - 24, ny = pad[0] + 28
    out.push(<g key={key++} transform={`translate(${nx} ${ny})`}><title>North</title><circle r={13} fill="#fff" stroke={INK} strokeWidth={1} /><path d="M0,-10 L5.5,7 L0,3.5 L-5.5,7 Z" fill={INK} transform={`rotate(${((G.delta * 180) / Math.PI).toFixed(1)})`} /><text y={-17} fontSize={9} textAnchor="middle" fill={INK} fontWeight={600}>N</text></g>)
    const Lm = niceLen(110 / k), bw = Lm * k, bx = pad[3] + 12, by = h - pad[2] - 12
    out.push(<g key={key++}><title>{`Scale bar: ${Lm} m`}</title><rect x={bx} y={by - 5} width={bw} height={5} fill="#fff" stroke={INK} strokeWidth={0.8} /><rect x={bx} y={by - 5} width={bw / 2} height={5} fill={INK} />
      <text x={bx + bw + 5} y={by} fontSize={10} fill={INK} stroke="#fff" strokeWidth={3} paintOrder="stroke">{Lm} m</text><text x={bx} y={by - 8} fontSize={9} fill="#4A515B" stroke="#fff" strokeWidth={3} paintOrder="stroke">0</text></g>)
  }

  const m = raster ? `matrix(${(k * G.c).toFixed(5)} ${(-k * G.s).toFixed(5)} ${(-k * G.s).toFixed(5)} ${(-k * G.c).toFixed(5)} ${ox.toFixed(2)} ${oy.toFixed(2)})` : undefined
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className="block select-none" data-testid="floor-plan" data-scale={k.toFixed(2)} strokeLinecap="butt" strokeLinejoin="miter" fontFamily="inherit">
      <defs><clipPath id={cid}><path d={`${ringsD} ${rectD(coreR)}`} clipRule="evenodd" /></clipPath></defs>
      <path d={ringsD} fill={raster ? '#fff' : '#F6F6F3'} />
      {raster && <g clipPath={`url(#${cid})`}><image href={raster.href} x={raster.x0} y={raster.y0} width={raster.w} height={raster.h} preserveAspectRatio="none" transform={m} style={{ imageRendering: 'auto' }} data-testid="plan-raster" /></g>}
      {out}
      {children}
    </svg>
  )
}
