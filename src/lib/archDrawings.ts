// The Architectural set's drawings (17 Nov 2026, Sinnie: "simple black and white clean architectural drawing style …
// with black poche walls for floor plans and section"). Canvas, true scale, from the same DrawData as the board
// drawings (lib/boardDrawings.ts): context plan, site plan, floor plans and the roof plan with poché walls, columns and
// an indicative core (stairs and lift shafts), sections along and across the tower with poché slabs and walls, an
// exterior axonometric, and an OMA-style exploded program stack. The core is indicative: a square of the tower's core
// share, centred on the plate (as the section in engine/drawings.ts draws it); columns are spaced at most 9 m.
import { offsetPoly } from '../engine/drawn'
import { USES, type UseId } from '../engine/types'
import { drawCaption, styleFont, SCALES, type BoardStyle, type DrawData, type DrawingSpec } from './boardDrawings'

type Pt = [number, number]
type Rect = { x: number; y: number; w: number; h: number }
type Tower = DrawData['towers'][number]

const signedArea = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2 }
const area = (r: Pt[]) => Math.abs(signedArea(r))
const ccw = (r: Pt[]) => (signedArea(r) >= 0 ? r : [...r].reverse())
const centroid = (r: Pt[]): Pt => r.reduce<Pt>((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0])
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const len = (a: Pt) => Math.hypot(a[0], a[1])
/** The run of floors of one use, bottom-up. */
function runs(t: Tower) {
  const out: { use: UseId; from: number; to: number; z0: number; z1: number; area: number; ring: Pt[] }[] = []
  for (const f of t.floors) {
    const last = out[out.length - 1]
    if (last && last.use === f.use && f.level === last.to + 1) { last.to = f.level; last.z1 = f.z1; last.area += f.area }
    else out.push({ use: f.use, from: f.level, to: f.level, z0: f.z0, z1: f.z1, area: f.area, ring: f.rings[0] ?? [] })
  }
  return out
}
/** A tower's main axis: the direction of the longest edge of its largest plate. */
function axisOf(t: Tower): { c: Pt; a: Pt; b: Pt } {
  const big = t.prisms.reduce((m, p) => (area(p.ring) > area(m.ring) ? p : m), t.prisms[0]).ring
  let best: Pt = [1, 0], L = 0
  big.forEach((p, i) => { const q = big[(i + 1) % big.length], d = sub(q, p), l = len(d); if (l > L) { L = l; best = [d[0] / l, d[1] / l] } })
  const top = t.prisms.reduce((m, p) => (p.z1 > m.z1 ? p : m), t.prisms[0])
  return { c: centroid(top.ring), a: best, b: [-best[1], best[0]] }
}
/** The indicative core of a tower: its ring, from the drawing data, else none. */
const coreOf = (t: Tower) => (t.core && t.core.length > 2 ? t.core : null)
/** Pick the listed scale that fits the extent (metres) in the box (mm). */
const fitScale = (exW: number, exH: number, bw: number, bh: number, want?: number) => want || SCALES.find((n) => (exW * 1000) / n <= bw && (exH * 1000) / n <= bh) || 5000

function hatchPattern(c: CanvasRenderingContext2D, ink: string, step = 6, w = 0.6) {
  const p = document.createElement('canvas'); p.width = p.height = step
  const x = p.getContext('2d')!
  x.strokeStyle = ink; x.lineWidth = w; x.beginPath(); x.moveTo(-1, step + 1); x.lineTo(step + 1, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(step - 1, step + 1); x.lineTo(step + 1, step - 1); x.stroke()
  return c.createPattern(p, 'repeat') ?? ink
}
function dotPattern(c: CanvasRenderingContext2D, ink: string, step = 5) {
  const p = document.createElement('canvas'); p.width = p.height = step
  const x = p.getContext('2d')!
  x.fillStyle = ink; x.fillRect(1, 1, 1, 1)
  return c.createPattern(p, 'repeat') ?? ink
}

/** Tools shared by the drawings: millimetre helpers, the scale bar and the north arrow. */
function kit(c: CanvasRenderingContext2D, k: number, f: Rect, st: BoardStyle) {
  const mm = (v: number) => v * k
  const font = (sz: number, b?: boolean) => `${b ? '600 ' : ''}${mm(sz)}px ${styleFont(st)}`
  const lw = (v: number) => { c.lineWidth = Math.max(0.6, mm(v)) }
  const scaleBar = (sc: number, kp: number) => {
    const want = (30 * sc) / 1000, bar = [5, 10, 20, 25, 50, 100, 200, 250, 500].reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
    const bx = mm(f.x + f.w - 8) - bar * kp, by = mm(f.y + f.h - 6)
    c.strokeStyle = c.fillStyle = st.ink; lw(0.18); c.strokeRect(bx, by, bar * kp, mm(1.2)); c.fillRect(bx, by, (bar * kp) / 4, mm(1.2)); c.fillRect(bx + (bar * kp) / 2, by, (bar * kp) / 4, mm(1.2))
    c.font = font(2); c.textAlign = 'center'; c.fillText('0', bx, by - mm(1)); c.fillText(`${bar} m`, bx + bar * kp, by - mm(1))
  }
  const north = (deg: number) => {
    const nx = mm(f.x + f.w - 9), ny = mm(f.y + 10)
    c.strokeStyle = c.fillStyle = st.ink; lw(0.25); c.beginPath(); c.arc(nx, ny, mm(4), 0, 7); c.stroke()
    c.save(); c.translate(nx, ny); c.rotate((deg * Math.PI) / 180)
    c.beginPath(); c.moveTo(0, -mm(4)); c.lineTo(mm(1.6), mm(2.4)); c.lineTo(0, mm(1)); c.closePath(); c.fill()
    c.beginPath(); c.moveTo(0, -mm(4)); c.lineTo(-mm(1.6), mm(2.4)); c.lineTo(0, mm(1)); c.closePath(); lw(0.2); c.stroke()
    c.font = font(2.4, true); c.textAlign = 'center'; c.fillText('N', 0, -mm(5)); c.restore()
  }
  return { mm, font, lw, scaleBar, north }
}

// ------------------------------------------------------------------ plans
interface PlanView { X: (x: number) => number; Y: (y: number) => number; kp: number; poly: (r: Pt[]) => void }

/** One tower plate in poché: the façade, columns, the core with its stairs and lifts, the use and area. */
function plate(c: CanvasRenderingContext2D, v: PlanView, t: Tower, ring: Pt[], use: UseId, st: BoardStyle, K: ReturnType<typeof kit>, ground: boolean) {
  const { poly, X, Y, kp } = v
  const r = ccw(ring)
  poly(r); c.fillStyle = st.paper; c.fill()
  // façade: an outer line and the glazing line inside it
  c.strokeStyle = st.ink; K.lw(0.35); poly(r); c.stroke()
  const inner = offsetPoly(r, -0.3); K.lw(0.12); poly(inner); c.stroke()
  // columns: black squares at the corners and at most 9 m apart, 0.8 m, inside the façade
  c.fillStyle = st.ink
  const col = (p: Pt) => { const s = 0.8 * kp; c.fillRect(X(p[0]) - s / 2, Y(p[1]) - s / 2, s, s) }
  const cr = offsetPoly(r, -1.1)
  cr.forEach((p, i) => { const q = cr[(i + 1) % cr.length], l = len(sub(q, p)), n = Math.max(1, Math.ceil(l / 9)); for (let j = 0; j < n; j++) col([p[0] + ((q[0] - p[0]) * j) / n, p[1] + ((q[1] - p[1]) * j) / n]) })
  // the core
  const core = coreOf(t)
  let labelAt = centroid(r)
  if (core) {
    // the core's own axes, from its sides
    const e1 = sub(core[1], core[0]), e2 = sub(core[3], core[0]), ax = { a: [e1[0] / len(e1), e1[1] / len(e1)] as Pt, b: [e2[0] / len(e2), e2[1] / len(e2)] as Pt }
    const cc = centroid(core), s = Math.sqrt(area(core)), h = s / 2 - 0.35
    const L = (u: number, w: number): Pt => [cc[0] + ax.a[0] * u + ax.b[0] * w, cc[1] + ax.a[1] * u + ax.b[1] * w]
    const box = (u0: number, w0: number, u1: number, w1: number) => { poly([L(u0, w0), L(u1, w0), L(u1, w1), L(u0, w1)]) }
    // core walls: a black band 0.35 m
    poly(core); c.fillStyle = st.ink; c.fill()
    box(-h, -h, h, h); c.fillStyle = st.paper; c.fill()
    const sw = Math.min(2.6, h * 0.5), sl = Math.min(5.6, h * 1.3)
    const stair = (u0: number, w0: number, du: number, dw: number) => {
      const u1 = u0 + du * sw, w1 = w0 + dw * sl
      c.strokeStyle = st.ink; K.lw(0.12)
      // treads, a centre wall and the climb line
      c.beginPath()
      for (let x = 0.3; x < sl - 0.3; x += 0.28) { const p = L(u0, w0 + dw * x), q = L(u1, w0 + dw * x); c.moveTo(X(p[0]), Y(p[1])); c.lineTo(X(q[0]), Y(q[1])) }
      c.stroke()
      const m0 = L((u0 + u1) / 2, w0 + dw * 0.3), m1 = L((u0 + u1) / 2, w1 - dw * 0.3)
      c.beginPath(); c.moveTo(X(m0[0]), Y(m0[1])); c.lineTo(X(m1[0]), Y(m1[1])); K.lw(0.35); c.stroke()
      box(u0, w0, u1, w1); c.lineWidth = Math.max(1, 0.2 * kp); c.stroke()
    }
    stair(-h, -h, 1, 1)
    stair(h, h, -1, -1)
    // lift shafts in the middle, two rows facing a lobby
    const u0 = -h + sw + 0.3, u1 = h - sw - 0.3, n = Math.max(0, Math.floor((u1 - u0) / 2.7))
    for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
      const a0 = u0 + i * 2.7, w0 = row ? h - 2.6 : -h, w1 = w0 + 2.6
      if (w1 - w0 > h) continue
      box(a0, w0, a0 + 2.5, w1); c.strokeStyle = st.ink; c.lineWidth = Math.max(1, 0.2 * kp); c.stroke()
      const p = L(a0 + 0.2, w0 + 0.2), q = L(a0 + 2.3, w1 - 0.2), p2 = L(a0 + 2.3, w0 + 0.2), q2 = L(a0 + 0.2, w1 - 0.2)
      K.lw(0.08); c.beginPath(); c.moveTo(X(p[0]), Y(p[1])); c.lineTo(X(q[0]), Y(q[1])); c.moveTo(X(p2[0]), Y(p2[1])); c.lineTo(X(q2[0]), Y(q2[1])); c.stroke()
    }
    const far = Math.max(...r.map((p) => dot(sub(p, cc), ax.b)))
    labelAt = L(0, (s / 2 + far) / 2)
  }
  // the use and the area
  c.fillStyle = st.ink; c.textAlign = 'center'; c.font = K.font(2.1, true)
  c.fillText(USES[use].label.replace(/ \/.*$/, '').toUpperCase(), X(labelAt[0]), Y(labelAt[1]))
  c.font = K.font(1.8); c.fillText(`${Math.round(area(r)).toLocaleString()} m²`, X(labelAt[0]), Y(labelAt[1]) + K.mm(2.6))
  // ground floor: entrance arrows on the two longest sides
  if (ground) {
    const edges = r.map((p, i) => ({ p, q: r[(i + 1) % r.length] })).sort((e1, e2) => len(sub(e2.q, e2.p)) - len(sub(e1.q, e1.p))).slice(0, 2)
    c.fillStyle = st.ink
    for (const e of edges) {
      const m: Pt = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2], d = sub(e.q, e.p), l = len(d), nIn: Pt = [-d[1] / l, d[0] / l]
      const tip: Pt = [m[0] + nIn[0] * 0.5, m[1] + nIn[1] * 0.5], b1: Pt = [m[0] - nIn[0] * 2.4 + (d[0] / l) * 1.2, m[1] - nIn[1] * 2.4 + (d[1] / l) * 1.2], b2: Pt = [m[0] - nIn[0] * 2.4 - (d[0] / l) * 1.2, m[1] - nIn[1] * 2.4 - (d[1] / l) * 1.2]
      c.beginPath(); c.moveTo(X(tip[0]), Y(tip[1])); c.lineTo(X(b1[0]), Y(b1[1])); c.lineTo(X(b2[0]), Y(b2[1])); c.closePath(); c.fill()
    }
  }
}

/** Section marks A and B on a plan: dash-dot lines through the tower with lettered heads. */
function sectionMarks(c: CanvasRenderingContext2D, v: PlanView, t: Tower, st: BoardStyle, K: ReturnType<typeof kit>) {
  const ax = axisOf(t), big = t.prisms.reduce((m, p) => (area(p.ring) > area(m.ring) ? p : m), t.prisms[0]).ring
  for (const [dir, tag] of [[ax.a, 'A'], [ax.b, 'B']] as [Pt, string][]) {
    const ext = Math.max(...big.map((p) => Math.abs(dot(sub(p, ax.c), dir)))) + 8
    const p: Pt = [ax.c[0] - dir[0] * ext, ax.c[1] - dir[1] * ext], q: Pt = [ax.c[0] + dir[0] * ext, ax.c[1] + dir[1] * ext]
    c.strokeStyle = st.ink; K.lw(0.18); c.setLineDash([K.mm(4), K.mm(1), K.mm(0.6), K.mm(1)])
    c.beginPath(); c.moveTo(v.X(p[0]), v.Y(p[1])); c.lineTo(v.X(q[0]), v.Y(q[1])); c.stroke(); c.setLineDash([])
    for (const e of [p, q]) {
      c.beginPath(); c.arc(v.X(e[0]), v.Y(e[1]), K.mm(2.4), 0, 7); c.fillStyle = st.paper; c.fill(); K.lw(0.25); c.stroke()
      c.fillStyle = st.ink; c.font = K.font(2.4, true); c.textAlign = 'center'; c.fillText(tag, v.X(e[0]), v.Y(e[1]) + K.mm(0.9))
    }
  }
}

type PlanKind = 'context' | 'site' | 'plan' | 'roof'
function drawPlanKind(c: CanvasRenderingContext2D, k: number, f: Rect, spec: DrawingSpec, d0: DrawData, st: BoardStyle, kind: PlanKind): [string, number] {
  const K = kit(c, k, f, st)
  const d = kind === 'plan' || kind === 'roof' ? turnData(d0) : d0
  const prisms = d.towers.flatMap((t) => t.prisms)
  const upper = (kind === 'plan' && (spec.level ?? 1) > 1) || kind === 'roof'
  const own: Pt[] = [...(upper ? [] : d.site ?? []), ...prisms.flatMap((p) => p.ring)]
  const xs = own.map((p) => p[0]), ys = own.map((p) => p[1])
  const B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  const bcx = (B.x0 + B.x1) / 2, bcy = (B.y0 + B.y1) / 2
  const pad = kind === 'context' ? 170 : kind === 'site' ? 45 : upper ? 8 : 12
  const sc = fitScale(B.x1 - B.x0 + pad * 2, B.y1 - B.y0 + pad * 2, f.w - 8, f.h - 16, spec.scale)
  const kp = K.mm(1000 / sc), cx = K.mm(f.x + f.w / 2), cy = K.mm(f.y + (f.h - 10) / 2)
  const X = (x: number) => cx + (x - bcx) * kp, Y = (y: number) => cy - (y - bcy) * kp
  const poly = (r: Pt[]) => { c.beginPath(); r.forEach((q, i) => (i ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1])))); c.closePath() }
  const v: PlanView = { X, Y, kp, poly }
  const level = Math.max(1, spec.level ?? 1)
  // the city around: grey blocks on the context plan, fine outlines on the others
  for (const o of d.context) {
    poly(o.ring)
    if (kind === 'context') { c.fillStyle = '#c9c9c9'; c.fill() }
    else if (kind === 'roof' || kind === 'site' || level === 1) { c.fillStyle = kind === 'site' ? '#ececec' : st.paper; c.fill(); K.lw(0.1); c.strokeStyle = '#7a7a7a'; c.stroke() }
  }
  if (d.site) {
    if (kind === 'site') { c.save(); poly(d.site); c.clip(); c.fillStyle = dotPattern(c, '#9a9a9a', 6); c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore() }
    c.strokeStyle = st.ink; K.lw(kind === 'context' ? 0.4 : 0.3); c.setLineDash([K.mm(4), K.mm(1.2), K.mm(0.8), K.mm(1.2)]); poly(d.site); c.stroke(); c.setLineDash([])
  }
  let title = ''
  if (kind === 'context') {
    for (const p of prisms) { poly(p.ring); c.fillStyle = st.ink; c.fill() }
    if (d.site) { const q = centroid(d.site); c.fillStyle = st.ink; c.font = K.font(2.6, true); c.textAlign = 'left'; c.fillText('SITE', X(q[0]) + K.mm(9), Y(q[1]) - K.mm(6)) }
    title = 'Context plan'
  } else if (kind === 'roof') {
    for (const t of d.towers) {
      for (const p of [...t.prisms].sort((a, b) => a.z1 - b.z1)) {
        poly(p.ring); c.fillStyle = st.paper; c.fill(); c.strokeStyle = st.ink; K.lw(0.4); c.stroke()
        K.lw(0.1); poly(offsetPoly(ccw(p.ring), -0.5)); c.stroke()
        const q = centroid(p.ring); c.fillStyle = st.ink; c.font = K.font(1.9); c.textAlign = 'center'; c.fillText(`+${p.z1.toFixed(1)}`, X(q[0]), Y(q[1]) + (p === t.prisms.reduce((m, x) => (x.z1 > m.z1 ? x : m)) ? K.mm(6) : 0))
      }
      const core = coreOf(t)
      if (core) { poly(core); c.fillStyle = hatchPattern(c, st.ink, 6, 0.6); c.fill(); c.strokeStyle = st.ink; K.lw(0.35); c.stroke(); const q = centroid(core); c.fillStyle = st.paper; c.font = K.font(1.9, true); c.textAlign = 'center'; const w = c.measureText('PLANT').width; c.fillRect(X(q[0]) - w / 2 - 2, Y(q[1]) - K.mm(2.2), w + 4, K.mm(3)); c.fillStyle = st.ink; c.fillText('PLANT', X(q[0]), Y(q[1])) }
    }
    title = 'Roof plan'
  } else {
    const lvl = kind === 'site' ? 1 : level
    let z = 0
    for (const t of d.towers) {
      const fl = t.floors.find((x) => x.level === lvl) ?? t.floors[Math.min(lvl, t.floors.length) - 1]
      if (!fl) continue
      z = fl.z0
      const zc = (fl.z0 + fl.z1) / 2
      // what is above the cut, dashed (overhangs, the tower over a podium); below, a fine line
      for (const p of t.prisms) { if (p.z0 <= zc && zc < p.z1) continue; poly(p.ring); c.strokeStyle = st.ink; K.lw(0.13); if (p.z0 > zc) c.setLineDash([K.mm(1.5), K.mm(1)]); c.stroke(); c.setLineDash([]) }
      for (const r of fl.rings) plate(c, v, t, r, fl.use, st, K, lvl === 1)
      if (kind === 'plan' && lvl === 1) sectionMarks(c, v, t, st, K)
    }
    title = kind === 'site' ? 'Site plan' : lvl === 1 ? 'Ground floor plan' : `${spec.label ?? 'Floor plan'}, level ${lvl}, +${z.toFixed(1)} m`
  }
  if (kind === 'plan') {
    const main = mainOf(d), lv = Math.max(1, spec.level ?? 1), fl0 = main.floors.find((x) => x.level === lv) ?? main.floors[Math.min(lv, main.floors.length) - 1]
    const big = fl0?.rings[0] ?? main.prisms.reduce((m, p) => (area(p.ring) > area(m.ring) ? p : m), main.prisms[0]).ring
    const xs2 = big.map((p) => p[0]), ys2 = big.map((p) => p[1]), x0 = Math.min(...xs2), x1 = Math.max(...xs2), y0 = Math.min(...ys2), y1 = Math.max(...ys2)
    const gx = bays(x0, x1), gyy = bays(y0, y1), ext = 5
    c.strokeStyle = '#8a8f96'; K.lw(0.08); c.setLineDash([K.mm(2.2), K.mm(0.6), K.mm(0.3), K.mm(0.6)]); c.beginPath()
    for (const x of gx) { c.moveTo(X(x), Y(y1 + ext)); c.lineTo(X(x), Y(y0 - 2)) }
    for (const y of gyy) { c.moveTo(X(x0 - ext), Y(y)); c.lineTo(X(x1 + 2), Y(y)) }
    c.stroke(); c.setLineDash([])
    gx.forEach((x, i) => bubble(c, X(x), Y(y1 + ext) - K.mm(2.2), String(i + 1), st, K))
    gyy.forEach((y, i) => bubble(c, X(x0 - ext) - K.mm(2.2), Y(y), LETTERS[gyy.length - 1 - i], st, K))
    dim(c, X(x0), Y(y1 + ext + 4.5), X(x1), Y(y1 + ext + 4.5), `${(x1 - x0).toFixed(2)}`, st, K)
    dim(c, X(x0 - ext - 4.5), Y(y0), X(x0 - ext - 4.5), Y(y1), `${(y1 - y0).toFixed(2)}`, st, K)
  }
  K.north(d.north)
  K.scaleBar(sc, kp)
  return [title, sc]
}

// ------------------------------------------------------------------ project north
/** The tallest tower: the one the plans and sections are about. */
const mainOf = (d: DrawData) => d.towers.reduce((m, t) => (Math.max(...t.prisms.map((p) => p.z1)) > Math.max(...m.prisms.map((p) => p.z1)) ? t : m), d.towers[0])
/** The drawing data turned to project north (17 Nov, Sinnie: "floor plans should be drawn as project north not true north"):
 *  the main tower's long side runs across the sheet; `north` keeps pointing at true north for the arrow. */
function turnData(d: DrawData): DrawData {
  const main = mainOf(d), a = axisOf(main).a, T = (p: Pt): Pt => [p[0] * a[0] + p[1] * a[1], -p[0] * a[1] + p[1] * a[0]]
  const R = (r: Pt[]) => r.map(T)
  return {
    site: d.site ? R(d.site) : null,
    towers: d.towers.map((t) => ({ ...t, core: t.core ? R(t.core) : t.core, prisms: t.prisms.map((p) => ({ ...p, ring: R(p.ring) })), floors: t.floors.map((fl) => ({ ...fl, rings: fl.rings.map(R) })) })),
    context: d.context.map((o) => ({ ...o, ring: R(o.ring) })),
    north: d.north + (Math.atan2(a[1], a[0]) * 180) / Math.PI,
  }
}
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
/** Grid lines through the column bays of a span (columns at most 9 m apart, 1.1 m inside the façade). */
const bays = (u0: number, u1: number) => { const a = u0 + 1.1, b = u1 - 1.1, n = Math.max(1, Math.ceil((b - a) / 9)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n) }
function bubble(c: CanvasRenderingContext2D, x: number, y: number, txt: string, st: BoardStyle, K: ReturnType<typeof kit>) {
  c.beginPath(); c.arc(x, y, K.mm(2.2), 0, 7); c.fillStyle = st.paper; c.fill(); c.strokeStyle = st.ink; K.lw(0.2); c.stroke()
  c.fillStyle = st.ink; c.font = K.font(2.1, true); c.textAlign = 'center'; c.fillText(txt, x, y + K.mm(0.8))
}
/** A dimension line with ticks and its figure (canvas px), horizontal or vertical. */
function dim(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, txt: string, st: BoardStyle, K: ReturnType<typeof kit>) {
  c.strokeStyle = c.fillStyle = st.ink; K.lw(0.12); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1)
  for (const [x, y] of [[x0, y0], [x1, y1]]) { c.moveTo(x - K.mm(0.9), y + K.mm(0.9)); c.lineTo(x + K.mm(0.9), y - K.mm(0.9)) }
  c.stroke(); c.font = K.font(1.9); c.textAlign = 'center'
  if (Math.abs(y1 - y0) < 1) c.fillText(txt, (x0 + x1) / 2, y0 - K.mm(0.9))
  else { c.save(); c.translate(x0 - K.mm(0.9), (y0 + y1) / 2); c.rotate(-Math.PI / 2); c.fillText(txt, 0, 0); c.restore() }
}

// ------------------------------------------------------------------ sections
/** The key plan in a section's corner: the plate, the cut with its arrows the way it looks, and the north arrow. */
function keyPlan(c: CanvasRenderingContext2D, K: ReturnType<typeof kit>, f: Rect, t: Tower, dir: Pt, look: Pt, tag: string, north: number, st: BoardStyle) {
  const S = 24, x0 = f.x + 4, y0 = f.y + 4, big = t.prisms.reduce((m, p) => (area(p.ring) > area(m.ring) ? p : m), t.prisms[0]).ring, cc = centroid(big)
  const R = Math.max(...big.map((p) => len(sub(p, cc)))) * 1.45, s = K.mm(S) / (2 * R), X = (p: Pt) => K.mm(x0 + S / 2) + (p[0] - cc[0]) * s, Y = (p: Pt) => K.mm(y0 + S / 2) - (p[1] - cc[1]) * s
  c.fillStyle = st.paper; c.fillRect(K.mm(x0), K.mm(y0), K.mm(S), K.mm(S)); c.strokeStyle = '#9a9a9a'; K.lw(0.1); c.strokeRect(K.mm(x0), K.mm(y0), K.mm(S), K.mm(S))
  c.beginPath(); big.forEach((p, i) => (i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)))); c.closePath(); c.fillStyle = '#d6d6d6'; c.fill(); c.strokeStyle = st.ink; K.lw(0.15); c.stroke()
  const core = coreOf(t); if (core) { c.beginPath(); core.forEach((p, i) => (i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)))); c.closePath(); c.fillStyle = st.ink; c.fill() }
  const e = R * 0.92, p: Pt = [cc[0] - dir[0] * e, cc[1] - dir[1] * e], q: Pt = [cc[0] + dir[0] * e, cc[1] + dir[1] * e]
  c.strokeStyle = st.ink; K.lw(0.18); c.setLineDash([K.mm(1.6), K.mm(0.6), K.mm(0.3), K.mm(0.6)]); c.beginPath(); c.moveTo(X(p), Y(p)); c.lineTo(X(q), Y(q)); c.stroke(); c.setLineDash([])
  for (const [e2, lab] of [[p, tag], [q, `${tag}′`]] as [Pt, string][]) {
    const tip: Pt = [e2[0] + look[0] * R * 0.18, e2[1] + look[1] * R * 0.18]
    c.beginPath(); c.moveTo(X(e2), Y(e2)); c.lineTo(X(tip), Y(tip)); K.lw(0.25); c.stroke()
    c.fillStyle = st.ink; c.font = K.font(1.9, true); c.textAlign = 'center'; c.fillText(lab, X(e2) - (look[0] * K.mm(2.4)), Y(e2) + (look[1] * K.mm(2.4)) + K.mm(0.7))
  }
  // north arrow in the key plan's corner
  const nx = K.mm(x0 + S - 3.4), ny = K.mm(y0 + 3.6)
  c.save(); c.translate(nx, ny); c.rotate((north * Math.PI) / 180); c.fillStyle = st.ink
  c.beginPath(); c.moveTo(0, -K.mm(2.4)); c.lineTo(K.mm(1), K.mm(1.4)); c.lineTo(0, K.mm(0.6)); c.closePath(); c.fill()
  c.font = K.font(1.6, true); c.textAlign = 'center'; c.fillText('N', 0, -K.mm(2.8)); c.restore()
}

function drawSection(c: CanvasRenderingContext2D, k: number, f: Rect, spec: DrawingSpec, d0: DrawData, st: BoardStyle): [string, number] {
  const K = kit(c, k, f, st)
  const d = turnData(d0), main = mainOf(d)
  const ax = axisOf(main), cross = spec.axis === 'cross'
  // A–A runs along the tower (project east), looking project north; B–B across it, looking project west.
  const dir: Pt = cross ? [0, 1] : [1, 0], depth: Pt = cross ? [-1, 0] : [0, 1]
  const U = (p: Pt) => dot(sub(p, ax.c), dir), W = (p: Pt) => dot(sub(p, ax.c), depth)
  const prisms = d.towers.flatMap((t) => t.prisms.map((p) => ({ ...p, t })))
  const mu = main.prisms.flatMap((p) => p.ring.map(U)), ma = Math.min(...mu), mb = Math.max(...mu)
  const top = Math.max(...prisms.map((p) => p.z1)), over = top + 4.5
  const u0 = ma - 30, u1 = mb + 30
  const sc = fitScale(u1 - u0, over + 22, f.w - 46, f.h - 30, spec.scale)
  const kp = K.mm(1000 / sc), uc = (u0 + u1) / 2
  const gy = K.mm(f.y + 12) + (over + 6) * kp + Math.max(0, (K.mm(f.h - 30) - (over + 22) * kp) / 2)
  const X = (u: number) => K.mm(f.x + 14 + (f.w - 46) / 2) + (u - uc) * kp, Y = (z: number) => gy - z * kp
  const ink = st.ink, thin = Math.max(0.6, K.mm(0.08))
  // the city behind the cut, pale; the earth hatched
  for (const o of d.context) {
    const w = o.ring.map(W); if (Math.max(...w) < 0 || Math.min(...w) > 160) continue
    const uu = o.ring.map(U), a = Math.max(u0, Math.min(...uu)), b = Math.min(u1, Math.max(...uu)); if (b <= a) continue
    c.fillStyle = '#efefef'; c.fillRect(X(a), Y(o.z1), (b - a) * kp, o.z1 * kp); c.strokeStyle = '#bdbdbd'; c.lineWidth = thin; c.strokeRect(X(a), Y(o.z1), (b - a) * kp, o.z1 * kp)
  }
  c.fillStyle = hatchPattern(c, '#8a8a8a', 7, 0.6); c.fillRect(K.mm(f.x + 3), gy, K.mm(f.w - 6), Math.min(K.mm(f.y + f.h - 12) - gy, 14 * kp))
  // beyond the cut: each part's silhouette and floor lines in thin line
  for (const p of prisms) {
    if (Math.max(...p.ring.map(W)) < 0) continue
    const uu = p.ring.map(U), a = Math.min(...uu), b = Math.max(...uu)
    c.fillStyle = st.paper; c.fillRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp); c.strokeStyle = '#8a8f96'; c.lineWidth = thin; c.strokeRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp)
  }
  // the cut, as the Sun & Wind Studio draws it: rooms white, a poché slab over each storey, poché end walls with the
  // glazing between sill and head, poché core walls with the lift shafts crossed and the stair run, the overrun above
  const T = Math.max(K.mm(0.45), 0.35 * kp), TW = Math.max(K.mm(0.55), 0.3 * kp), TC = Math.max(K.mm(0.7), 0.35 * kp)
  const box = (x0: number, y0: number, x1: number, y1: number) => c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(0.6, Math.abs(x1 - x0)), Math.max(0.6, Math.abs(y1 - y0)))
  for (const p of prisms) {
    const zs: number[] = []
    p.ring.forEach((a, i) => { const b = p.ring[(i + 1) % p.ring.length], wa = W(a), wb = W(b); if ((wa < 0) !== (wb < 0)) { const s = wa / (wa - wb); zs.push(U([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s])) } })
    zs.sort((a, b) => a - b)
    const fls = p.t.floors.filter((fl) => fl.z0 >= p.z0 - 0.01 && fl.z1 <= p.z1 + 0.01)
    const core = coreOf(p.t), cu = core?.map(U) ?? [], cw = core?.map(W) ?? []
    const coreCut = core && Math.min(...cw) < 0 && Math.max(...cw) > 0
    for (let i = 0; i + 1 < zs.length; i += 2) {
      const a = zs[i], b = zs[i + 1]
      c.fillStyle = st.paper; c.fillRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp)
      c.fillStyle = ink
      for (const fl of fls) {
        box(X(a), Y(fl.z1) - T / 2, X(b), Y(fl.z1) + T / 2) // slab over the storey
        // end walls: an upstand to the sill and a spandrel down to the head, glass between as two fine lines
        const sill = Math.min(0.9, (fl.z1 - fl.z0) * 0.25), head = Math.min(0.6, (fl.z1 - fl.z0) * 0.18)
        for (const [x, s] of [[X(a), 1], [X(b), -1]] as [number, number][]) {
          box(x, Y(fl.z0), x + s * TW, Y(fl.z0 + sill)); box(x, Y(fl.z1 - head), x + s * TW, Y(fl.z1))
          c.strokeStyle = ink; c.lineWidth = thin; c.beginPath(); for (const o of [0.3, 0.7]) { c.moveTo(x + s * TW * o, Y(fl.z0 + sill)); c.lineTo(x + s * TW * o, Y(fl.z1 - head)) } c.stroke()
        }
      }
      box(X(a), Y(p.z0) - T / 2, X(b), Y(p.z0) + T / 2)
      box(X(a), Y(p.z1 + 1.1), X(a) + TW, Y(p.z1)); box(X(b) - TW, Y(p.z1 + 1.1), X(b), Y(p.z1)) // parapets
      if (coreCut) {
        const c0 = Math.max(a, Math.min(...cu)), c1 = Math.min(b, Math.max(...cu)), zt = p.z1 >= top - 0.01 ? over : p.z1, mid = (c0 + c1) / 2
        if (c1 - c0 > 1) {
          c.fillStyle = '#f2f2f2'; c.fillRect(X(c0), Y(zt), (c1 - c0) * kp, (zt - p.z0) * kp)
          c.fillStyle = ink; box(X(c0), Y(zt), X(c0) + TC, Y(p.z0)); box(X(c1) - TC, Y(zt), X(c1), Y(p.z0)); box(X(mid) - TC / 2, Y(zt), X(mid) + TC / 2, Y(p.z0))
          if (zt > p.z1) box(X(c0), Y(zt), X(c1), Y(zt) + T)
          c.strokeStyle = '#5f646b'; c.lineWidth = thin; c.beginPath()
          for (const fl of fls) {
            // lift shafts: crossed each storey; the stair: one flight per storey
            const y0 = Y(fl.z0), y1 = Y(fl.z1)
            c.moveTo(X(c0) + TC, y0); c.lineTo(X(mid) - TC / 2, y1); c.moveTo(X(mid) - TC / 2, y0); c.lineTo(X(c0) + TC, y1)
            c.moveTo(X(mid) + TC / 2, y0); c.lineTo(X(c1) - TC, y1)
          }
          c.stroke()
          c.fillStyle = ink; for (const fl of fls) box(X(mid), Y(fl.z1) - T / 2, X(c1), Y(fl.z1) + T / 2) // stair landings
        }
      }
    }
  }
  // grid lines through the column bays, bubbles above the overrun, bay dimensions chained
  const g = bays(ma, mb), yb = Y(-2), yt = Y(over + 6)
  c.strokeStyle = '#8a8f96'; c.lineWidth = thin; c.setLineDash([K.mm(2.2), K.mm(0.6), K.mm(0.3), K.mm(0.6)])
  c.beginPath(); for (const u of g) { c.moveTo(X(u), yb); c.lineTo(X(u), yt) } c.stroke(); c.setLineDash([])
  g.forEach((u, i) => bubble(c, X(u), yt - K.mm(2.4), cross ? LETTERS[i] : String(i + 1), st, K))
  for (let i = 0; i + 1 < g.length; i++) dim(c, X(g[i]), Y(over + 2.5), X(g[i + 1]), Y(over + 2.5), (g[i + 1] - g[i]).toFixed(2), st, K)
  // foundation and the ground line over everything
  c.fillStyle = ink; box(X(ma) - 1.5 * kp, gy, X(mb) + 1.5 * kp, gy + Math.max(K.mm(0.9), 1.4 * kp))
  c.strokeStyle = ink; K.lw(0.6); c.beginPath(); c.moveTo(K.mm(f.x + 3), gy); c.lineTo(K.mm(f.x + f.w - 3), gy); c.stroke()
  // the overall height, outside on the left
  dim(c, X(ma - 6), Y(0), X(ma - 6), Y(top), `${top.toFixed(2)} overall`, st, K)
  // use labels in the cut runs
  const rs = runs(main)
  c.font = K.font(1.9, true); c.textAlign = 'center'
  const ul = (ma + mb) / 2 + (mb - ma) * 0.22
  for (const r of rs) if ((r.z1 - r.z0) * kp > K.mm(4)) { const txt = USES[r.use].label.replace(/ \/.*$/, '').toUpperCase(); const y = Y((r.z0 + r.z1) / 2) + K.mm(0.7), w = c.measureText(txt).width; c.fillStyle = st.paper; c.fillRect(X(ul) - w / 2 - 3, y - K.mm(2.4), w + 6, K.mm(3.2)); c.fillStyle = ink; c.fillText(txt, X(ul), y) }
  // level datums: every storey that has room (3.4 mm apart), always the ground, each change of use and the roof
  const key = new Set<number>([0, top, ...rs.slice(1).map((r) => r.z0)])
  const lv = [...main.floors.map((fl) => [fl.z0, `L${fl.level}`] as [number, string]), [top, 'Roof'] as [number, string]]
  const lx = X(mb) + K.mm(8)
  let last = Infinity
  c.font = K.font(1.9); c.textAlign = 'left'
  const shown = lv.filter(([z]) => key.has(z)).map(([z]) => Y(z))
  for (const [z, nm] of lv) {
    const y = Y(z), must = key.has(z)
    if (!must && (Math.abs(last - y) < K.mm(6) || shown.some((s) => Math.abs(s - y) < K.mm(6)))) continue
    last = y
    c.strokeStyle = '#6b7078'; c.lineWidth = thin; c.setLineDash([K.mm(0.6), K.mm(0.6)]); c.beginPath(); c.moveTo(lx - K.mm(3), y); c.lineTo(lx + K.mm(20), y); c.stroke(); c.setLineDash([])
    c.strokeStyle = ink; K.lw(0.15); c.beginPath(); c.moveTo(lx, y); c.lineTo(lx - K.mm(1.2), y - K.mm(1.6)); c.lineTo(lx + K.mm(1.2), y - K.mm(1.6)); c.closePath(); c.stroke()
    c.fillStyle = ink; c.fillText(`${nm}  ${z > 0.005 ? '+' : '±'}${z.toFixed(2)}`, lx + K.mm(2), y - K.mm(0.5))
  }
  const tag = cross ? 'B' : 'A'
  keyPlan(c, K, f, main, dir, depth, tag, d.north, st)
  K.scaleBar(sc, kp)
  return [cross ? 'Section B–B′, across the tower' : 'Section A–A′, along the tower', sc]
}

// ------------------------------------------------------------------ axonometric and program
const ISO = { cx: Math.cos(Math.PI / 6), sy: 0.5 }
/** Turn the model so the main tower's long side runs along +x: a true isometric of the tower, whatever the street grid. */
function turnTo(t: Tower) {
  const a = axisOf(t).a, cos = a[0], sin = a[1]
  return (p: Pt): Pt => [p[0] * cos + p[1] * sin, -p[0] * sin + p[1] * cos]
}
type Iso = (p: Pt, z: number) => Pt

function isoFit(c: CanvasRenderingContext2D, k: number, f: Rect, pts: [number, number, number][], padMm = 10, room = { left: 0, right: 0 }): { P: Iso; kpm: number } {
  const raw = pts.map(([x, y, z]) => [(x - y) * ISO.cx, -((x + y) * ISO.sy + z)] as Pt)
  const x0 = Math.min(...raw.map((p) => p[0])), x1 = Math.max(...raw.map((p) => p[0])), y0 = Math.min(...raw.map((p) => p[1])), y1 = Math.max(...raw.map((p) => p[1]))
  const bw = f.w - 2 * padMm - room.left - room.right, bh = f.h - 2 * padMm - 8
  const s = Math.min(bw / Math.max(1, x1 - x0), bh / Math.max(1, y1 - y0)) // mm per metre
  const ox = f.x + padMm + room.left + (bw - (x1 - x0) * s) / 2, oy = f.y + padMm + (bh - (y1 - y0) * s) / 2
  void c
  return { P: (p, z) => [(ox + ((p[0] - p[1]) * ISO.cx - x0) * s) * k, (oy + (-((p[0] + p[1]) * ISO.sy + z) - y0) * s) * k], kpm: s }
}

/** One prism in the axonometric: its visible sides (two greys by orientation), floor lines, the top. */
function isoPrism(c: CanvasRenderingContext2D, P: Iso, ring: Pt[], z0: number, z1: number, st: BoardStyle, lw: (v: number) => void, fill: { side: [string | CanvasPattern, string | CanvasPattern]; top: string | CanvasPattern }, floorZ: number[] = [], minGap = 4) {
  const r = ccw(ring)
  const faces = r.map((a, i) => { const b = r[(i + 1) % r.length], n: Pt = [b[1] - a[1], -(b[0] - a[0])]; return { a, b, n, vis: -(n[0] + n[1]) > 1e-9, depth: a[0] + a[1] + b[0] + b[1] } }).filter((x) => x.vis).sort((p, q) => q.depth - p.depth)
  for (const fc of faces) {
    const A = P(fc.a, z0), B = P(fc.b, z0), C = P(fc.b, z1), D = P(fc.a, z1)
    c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.lineTo(...C); c.lineTo(...D); c.closePath()
    c.fillStyle = fc.n[0] < fc.n[1] ? fill.side[0] : fill.side[1]; c.fill()
    if (floorZ.length > 1) {
      const gap = Math.abs(P(fc.a, floorZ[1])[1] - P(fc.a, floorZ[0])[1]), every = [1, 2, 5, 10].find((n) => gap * n >= minGap) ?? 10
      c.strokeStyle = '#b0b0b0'; lw(0.05); c.beginPath(); floorZ.forEach((z, i) => { if (i % every === 0 && z > z0 + 0.1 && z < z1 - 0.1) { const p = P(fc.a, z), q = P(fc.b, z); c.moveTo(...p); c.lineTo(...q) } }); c.stroke()
    }
    c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.lineTo(...C); c.lineTo(...D); c.closePath(); c.strokeStyle = st.ink; lw(0.2); c.stroke()
  }
  c.beginPath(); r.forEach((p, i) => { const q = P(p, z1); if (i) c.lineTo(...q); else c.moveTo(...q) }); c.closePath(); c.fillStyle = fill.top; c.fill(); c.strokeStyle = st.ink; lw(0.25); c.stroke()
}

/** One extruded mass in isometric, drawn to the house drawing standard (arch-drawing-standards §1/§2): faces filled with
 *  paper so nearer masses hide farther ones, floor lines thin (surface), edges medium, and vertical edges only where the
 *  façade really turns (a curved façade gets no line per facet). */
function isoMass(c: CanvasRenderingContext2D, P: Iso, ring: Pt[], z0: number, z1: number, o: { faces: [string, string]; top: string; edge: string; edgeMm: number; outMm?: number; surf?: { z: number[]; mm: number; colour: string; minGap: number } }, lw: (v: number) => void) {
  const r = ccw(ring), n = r.length
  const face = r.map((a, i) => { const b = r[(i + 1) % n], nn: Pt = [b[1] - a[1], -(b[0] - a[0])]; return { a, b, n: nn, vis: -(nn[0] + nn[1]) > 1e-9, depth: a[0] + a[1] + b[0] + b[1], i } })
  const turn = (i: number) => { const p = face[(i - 1 + n) % n].n, q = face[i].n, l = Math.hypot(p[0], p[1]) * Math.hypot(q[0], q[1]) || 1; return (Math.acos(Math.max(-1, Math.min(1, (p[0] * q[0] + p[1] * q[1]) / l))) * 180) / Math.PI }
  const vis = face.filter((x) => x.vis).sort((p, q) => q.depth - p.depth)
  for (const fc of vis) {
    const A = P(fc.a, z0), B = P(fc.b, z0), C = P(fc.b, z1), D = P(fc.a, z1)
    const tone = fc.n[0] < fc.n[1] ? o.faces[0] : o.faces[1]
    c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.lineTo(...C); c.lineTo(...D); c.closePath()
    c.fillStyle = tone; c.fill()
    // a hairline in the face's own tone closes the seams between the facets of a curve
    c.strokeStyle = tone; lw(0.05); c.stroke()
    const sf = o.surf
    if (sf && sf.z.length > 1) {
      const gap = Math.abs(P(fc.a, sf.z[1])[1] - P(fc.a, sf.z[0])[1]), every = [1, 2, 5, 10].find((m) => gap * m >= sf.minGap) ?? 10
      c.strokeStyle = sf.colour; lw(sf.mm); c.beginPath()
      sf.z.forEach((z, i) => { if (i % every === 0 && z > z0 + 0.1 && z < z1 - 0.1) { c.moveTo(...P(fc.a, z)); c.lineTo(...P(fc.b, z)) } })
      c.stroke()
    }
  }
  c.strokeStyle = o.edge; lw(o.edgeMm); c.lineCap = 'butt'; c.lineJoin = 'miter'; c.beginPath()
  for (const fc of vis) {
    c.moveTo(...P(fc.a, z0)); c.lineTo(...P(fc.b, z0))
    if (!face[(fc.i - 1 + n) % n].vis || turn(fc.i) > 25) { c.moveTo(...P(fc.a, z0)); c.lineTo(...P(fc.a, z1)) }
    if (!face[(fc.i + 1) % n].vis) { c.moveTo(...P(fc.b, z0)); c.lineTo(...P(fc.b, z1)) }
  }
  c.stroke()
  c.beginPath(); r.forEach((p, i) => { const q = P(p, z1); if (i) c.lineTo(...q); else c.moveTo(...q) }); c.closePath()
  c.fillStyle = o.top; c.fill(); c.strokeStyle = o.edge; lw(o.outMm ?? o.edgeMm); c.stroke()
  if (o.outMm) {
    // silhouette pen: the outer vertical edges and the foot of the visible faces
    lw(o.outMm); c.beginPath()
    for (const fc of vis) {
      c.moveTo(...P(fc.a, z0)); c.lineTo(...P(fc.b, z0))
      if (!face[(fc.i - 1 + n) % n].vis) { c.moveTo(...P(fc.a, z0)); c.lineTo(...P(fc.a, z1)) }
      if (!face[(fc.i + 1) % n].vis) { c.moveTo(...P(fc.b, z0)); c.lineTo(...P(fc.b, z1)) }
    }
    c.stroke()
  }
}
const inRing = (p: Pt, r: Pt[]) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) s = !s } return s }

// The presentation axonometric (17 Nov 2026, Sinnie; second pass the same day after a reference image: "axo view should
// look like this in present mode"): a grey city at its real height with cast shadows, streets mid grey, the City lots
// pale, the site stippled, street trees as white crowns, and the design in charcoal so it reads first. Line weights
// follow the house drawing standard (arch-drawing-standards): thin grey edges on the city, medium ink edges and a heavy
// silhouette on the design, thin floor lines. One isometric (30/30) turned to the tower's axis, one painter's order for
// buildings and trees, footprints the design replaces left out, the site boundary as a property line. The design is
// built from its floor plates (a parametric tower's casters each run from the ground to their block's top).
const AXO = { road: '#b7b7bb', lot: '#e6e6e8', lotEdge: '#9d9da2', shadow: '#a9a9ad', top: '#ececee', sideA: '#dadadd', sideB: '#f6f6f7', edge: '#6e6e73',
  tower: ['#56575c', '#3f4045'] as [string, string], towerTop: '#6b6c71', towerEdge: '#141416', floor: '#8a8b90' }
function stipple(c: CanvasRenderingContext2D, base: string) {
  const p = document.createElement('canvas'); p.width = p.height = 24
  const x = p.getContext('2d')!; x.fillStyle = base; x.fillRect(0, 0, 24, 24); x.fillStyle = '#8d8d92'
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 26; i++) x.fillRect(Math.floor(rnd() * 24), Math.floor(rnd() * 24), 1, 1)
  return c.createPattern(p, 'repeat') ?? base
}
function hull2(ps: Pt[]): Pt[] {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], up: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  return [...lo.slice(0, -1), ...up.slice(0, -1)]
}
function drawAxo(c: CanvasRenderingContext2D, k: number, f: Rect, d: DrawData, st: BoardStyle): [string, number] {
  const K = kit(c, k, f, st)
  const main = d.towers.reduce((m, t) => (t.floors.length > m.floors.length ? t : m), d.towers[0]), T = turnTo(main)
  type Mass = { ring: Pt[]; z0: number; z1: number; t: DrawData['towers'][number]; levels: number[] }
  const masses: Mass[] = d.towers.flatMap((t) => {
    const out: Mass[] = []
    for (const fl of t.floors) for (const r of fl.rings) {
      const ring = r.map(T)
      const last = out.find((m) => Math.abs(m.z1 - fl.z0) < 0.01 && m.ring.length === ring.length && m.ring.every((q, i) => Math.hypot(q[0] - ring[i][0], q[1] - ring[i][1]) < 0.05))
      if (last) { last.z1 = fl.z1; last.levels.push(fl.z0) } else out.push({ ring, z0: fl.z0, z1: fl.z1, t, levels: [fl.z0] })
    }
    if (!out.length) for (const p of t.prisms) out.push({ ring: p.ring.map(T), z0: p.z0, z1: p.z1, t, levels: [] })
    return out
  })
  const cc = centroid(masses.flatMap((m) => m.ring))
  const site = d.site?.map(T) ?? null
  const R = 120
  const inBox = (p: Pt) => Math.abs(p[0] - cc[0]) < R && Math.abs(p[1] - cc[1]) < R
  const inWide = (p: Pt) => Math.abs(p[0] - cc[0]) < R + 90 && Math.abs(p[1] - cc[1]) < R + 90 // to the frame's edge
  const under = (r: Pt[]) => { const m = centroid(r); return (site != null && inRing(m, site)) || masses.some((p) => inRing(m, p.ring) || r.some((q) => inRing(q, p.ring))) }
  const near = d.context.map((o) => ({ ring: o.ring.map(T), z1: o.z1 })).filter((o) => o.ring.some(inWide) && !under(o.ring))
  const trees = (d.trees ?? []).map((t) => ({ at: T([t.x, t.y]), h: Math.max(5, Math.min(22, t.h)) })).filter((t) => inWide(t.at) && !(site && inRing(t.at, site)))
  const lots = (d.lots ?? []).map((r) => r.map(T)).filter((r) => r.some((p) => Math.abs(p[0] - cc[0]) < R + 90 && Math.abs(p[1] - cc[1]) < R + 90))
  const box: Pt[] = [[cc[0] - R, cc[1] - R], [cc[0] + R, cc[1] - R], [cc[0] + R, cc[1] + R], [cc[0] - R, cc[1] + R]]
  const pts: [number, number, number][] = [...box.map((q) => [q[0], q[1], 0] as [number, number, number]), ...masses.flatMap((m) => m.ring.map((q) => [q[0], q[1], m.z1] as [number, number, number]))]
  const { P } = isoFit(c, k, f, pts, 6)
  const lw = K.lw
  const path = (r: Pt[], z: number) => { c.beginPath(); r.forEach((p, i) => { const q = P(p, z); if (i) c.lineTo(...q); else c.moveTo(...q) }); c.closePath() }
  c.save()
  c.beginPath(); c.rect(K.mm(f.x + 2), K.mm(f.y + 2), K.mm(f.w - 4), K.mm(f.h - 10)); c.clip()
  // the ground: streets, the lots, the site stippled
  c.fillStyle = st.streets ?? AXO.road; c.fillRect(K.mm(f.x + 2), K.mm(f.y + 2), K.mm(f.w - 4), K.mm(f.h - 10)) // streets to the frame's edge
  for (const r of lots) { path(r, 0); c.fillStyle = AXO.lot; c.fill(); c.strokeStyle = AXO.lotEdge; lw(0.1); c.stroke() }
  if (site) { path(site, 0); c.fillStyle = stipple(c, '#f7f7f8'); c.fill() }
  // shadows on the ground from a south-east sun: they fall back and to the left, as in the reference
  const sh: Pt = [-0.32, 1.05]
  c.fillStyle = AXO.shadow
  const shadow = (r: Pt[], h: number) => { path(hull2([...r, ...r.map((p) => [p[0] + sh[0] * h, p[1] + sh[1] * h] as Pt)]), 0); c.fill() }
  for (const o of near) shadow(o.ring, o.z1)
  for (const m of masses) shadow(m.ring, m.z1)
  for (const t of trees) { const r = t.h * 0.2, o: Pt = [t.at[0] + sh[0] * t.h * 0.55, t.at[1] + sh[1] * t.h * 0.55]; shadow([[o[0] - r, o[1] - r], [o[0] + r, o[1] - r], [o[0] + r, o[1] + r], [o[0] - r, o[1] + r]], 0) }
  // the site boundary as a property line
  if (site) { c.strokeStyle = st.ink; lw(0.3); c.setLineDash([K.mm(4), K.mm(0.8), K.mm(0.6), K.mm(0.8), K.mm(0.6), K.mm(0.8)]); path(site, 0); c.stroke(); c.setLineDash([]) }
  // buildings and trees, far to near
  const depth = (r: Pt[]) => Math.max(...r.map((p) => p[0] + p[1])) + Math.min(...r.map((p) => p[0] + p[1]))
  const mpx = Math.abs(P([0, 0], 1)[1] - P([0, 0], 0)[1]) // canvas px per metre of height
  const items: { d: number; draw: () => void }[] = near.map((o) => ({ d: depth(o.ring), draw: () => isoMass(c, P, o.ring, 0, o.z1, { faces: [AXO.sideB, AXO.sideA], top: AXO.top, edge: AXO.edge, edgeMm: 0.1 }, lw) }))
  for (const t of trees) items.push({ d: 2 * (t.at[0] + t.at[1]), draw: () => {
    const b = P(t.at, 0), w = t.h * 0.62 * mpx, h = t.h * 0.95 * mpx, cy = b[1] - t.h * 0.22 * mpx - h / 2
    c.strokeStyle = '#7c7c80'; lw(0.08); c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0], cy + h / 2); c.stroke()
    // a leafy crown: an oval with a scalloped edge, its shaded side a pale grey
    c.beginPath(); const n = 20
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, j = 1 + 0.08 * Math.sin(i * 2.7 + t.at[0]), x = b[0] + Math.sin(a) * (w / 2) * j, y = cy - Math.cos(a) * (h / 2) * j; if (i) c.lineTo(x, y); else c.moveTo(x, y) }
    c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#8e8e93'; lw(0.07); c.stroke()
    c.save(); c.clip(); c.fillStyle = '#e4e4e7'; c.fillRect(b[0] + w * 0.12, cy - h / 2, w, h); c.restore()
  } })
  for (const t of d.towers) {
    const nearest = (r: Pt[]) => Math.min(...r.map((p) => p[0] + p[1]))
    const mine = masses.filter((m) => m.t === t).sort((a, b) => a.z0 - b.z0 || nearest(b.ring) - nearest(a.ring))
    if (!mine.length) continue
    items.push({ d: Math.min(...mine.map((p) => depth(p.ring))), draw: () => {
      for (const m of mine) isoMass(c, P, m.ring, m.z0, m.z1, { faces: AXO.tower, top: AXO.towerTop, edge: AXO.towerEdge, edgeMm: 0.25, outMm: 0.45, surf: { z: m.levels, mm: 0.07, colour: AXO.floor, minGap: K.mm(1.2) } }, lw)
    } })
  }
  items.sort((a, b) => b.d - a.d).forEach((it) => it.draw())
  c.restore()
  return ['Exterior axonometric', 0]
}

/** A grey made darker (k < 1) or lighter (k > 1): the second side and the top of a slab. */
const shade = (hex: string, k: number) => { const v = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * k + (k > 1 ? 18 : 0)))).toString(16).padStart(2, '0'); return `#${v}${v}${v}` }
const TONE: Record<UseId, string> = { retail: '#1c1c1c', civic: '#4a4a4a', office: '#7d7d7d', hotel: '#a9a9a9', residential: '#d4d4d4', amenity: '#ffffff', mechanical: 'hatch' }

function drawProgram(c: CanvasRenderingContext2D, k: number, f: Rect, d: DrawData, st: BoardStyle): [string, number] {
  const K = kit(c, k, f, st)
  const t = d.towers.reduce((m, x) => (x.floors.length > m.floors.length ? x : m), d.towers[0])
  const T = turnTo(t)
  const rs = runs(t).filter((r) => r.ring.length > 2).map((r) => ({ ...r, ring: r.ring.map(T) }))
  const gap = Math.max(4, (rs.reduce((a, r) => Math.max(a, r.z1), 0) / Math.max(1, rs.length)) * 0.35)
  const lifted = rs.map((r, i) => ({ ...r, dz: i * gap }))
  const pts: [number, number, number][] = lifted.flatMap((r) => r.ring.flatMap((q) => [[q[0], q[1], r.z0 + r.dz], [q[0], q[1], r.z1 + r.dz]] as [number, number, number][]))
  const { P } = isoFit(c, k, f, pts, 10, { left: 0, right: f.w * 0.36 })
  const hatch = hatchPattern(c, st.ink, 5, 0.6)
  for (const r of lifted) {
    const tone = TONE[r.use], side: string | CanvasPattern = tone === 'hatch' ? hatch : tone
    isoPrism(c, P, r.ring, r.z0 + r.dz, r.z1 + r.dz, st, K.lw, { side: [side, tone === 'hatch' ? side : shade(tone, 0.82)], top: tone === 'hatch' ? side : shade(tone, 1.12) })
  }
  // labels on the right, each with a leader to its slab
  const total = rs.reduce((a, r) => a + r.area, 0) || 1
  const lx = K.mm(f.x + f.w * 0.66)
  let lastY = -Infinity
  ;[...lifted].sort((a, b) => b.z0 - a.z0).forEach((r) => {
    const right = r.ring.reduce((m, p) => { const q = P(p, (r.z0 + r.z1) / 2 + r.dz); return q[0] > m[0] ? q : m }, [-Infinity, 0] as Pt)
    let y = right[1]; if (y - lastY < K.mm(13)) y = lastY + K.mm(13); lastY = y
    c.strokeStyle = st.ink; K.lw(0.12); c.beginPath(); c.moveTo(right[0] + K.mm(1), right[1]); c.lineTo(lx - K.mm(4), y); c.lineTo(lx - K.mm(1), y); c.stroke()
    c.beginPath(); c.arc(right[0] + K.mm(1), right[1], K.mm(0.5), 0, 7); c.fillStyle = st.ink; c.fill()
    const tone = TONE[r.use]; c.fillStyle = tone === 'hatch' ? hatch : tone; c.fillRect(lx, y - K.mm(3.6), K.mm(5), K.mm(5)); K.lw(0.12); c.strokeRect(lx, y - K.mm(3.6), K.mm(5), K.mm(5))
    c.fillStyle = st.ink; c.textAlign = 'left'; c.font = K.font(4.2, true); c.fillText(USES[r.use].label.replace(/ \/.*$/, '').toUpperCase(), lx + K.mm(7), y)
    c.font = K.font(2.8); c.fillText(`${r.from === r.to ? `L${r.from}` : `L${r.from}–${r.to}`} · ${Math.round(r.area).toLocaleString()} m² · ${Math.round((r.area / total) * 100)}%`, lx + K.mm(7), y + K.mm(4.4))
  })
  return ['Program stack', 0]
}

/** The Architectural set's drawing kinds, and the plans and sections in the black-and-white poché style. */
export const ARCH_KINDS = new Set(['context', 'roof', 'axo', 'program'])
export function drawArch(c: CanvasRenderingContext2D, k: number, f: Rect, spec: DrawingSpec, d: DrawData, st: BoardStyle, no: number) {
  c.save(); c.beginPath(); c.rect(k * f.x, k * f.y, k * f.w, k * f.h); c.clip()
  c.textBaseline = 'alphabetic'; c.lineJoin = 'miter'
  const [title, sc] = spec.vt === 'section' ? drawSection(c, k, f, spec, d, st)
    : spec.vt === 'axo' ? drawAxo(c, k, f, d, st)
    : spec.vt === 'program' ? drawProgram(c, k, f, d, st)
    : drawPlanKind(c, k, f, spec, d, st, spec.vt as PlanKind)
  c.restore()
  drawCaption(c, k, f, st, no, title, sc ? `Scale 1:${sc} at A2${spec.vt === 'plan' || spec.vt === 'roof' || spec.vt === 'section' ? ' · project north' : ''}` : spec.vt === 'axo' ? 'Isometric, to scale along the axes · shadows indicative' : 'Exploded, floors by use')
}
