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
function drawPlanKind(c: CanvasRenderingContext2D, k: number, f: Rect, spec: DrawingSpec, d: DrawData, st: BoardStyle, kind: PlanKind): [string, number] {
  const K = kit(c, k, f, st)
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
  K.north(d.north)
  K.scaleBar(sc, kp)
  return [title, sc]
}

// ------------------------------------------------------------------ sections
function drawSection(c: CanvasRenderingContext2D, k: number, f: Rect, spec: DrawingSpec, d: DrawData, st: BoardStyle): [string, number] {
  const K = kit(c, k, f, st)
  const main = d.towers.reduce((m, t) => (Math.max(...t.prisms.map((p) => p.z1)) > Math.max(...m.prisms.map((p) => p.z1)) ? t : m), d.towers[0])
  const ax = axisOf(main), cross = spec.axis === 'cross'
  const dir = cross ? ax.b : ax.a, depth: Pt = cross ? [-ax.a[0], -ax.a[1]] : ax.b
  const U = (p: Pt) => dot(sub(p, ax.c), dir), W = (p: Pt) => dot(sub(p, ax.c), depth)
  const prisms = d.towers.flatMap((t) => t.prisms.map((p) => ({ ...p, t })))
  const us = prisms.flatMap((p) => p.ring.map(U))
  const top = Math.max(...prisms.map((p) => p.z1))
  const u0 = Math.min(...us) - 25, u1 = Math.max(...us) + 25
  const sc = fitScale(u1 - u0, top + 26, f.w - 30, f.h - 16, spec.scale)
  const kp = K.mm(1000 / sc), uc = (u0 + u1) / 2
  const gy = K.mm(f.y + (f.h - 10) / 2) + ((top + 26) / 2) * kp - 14 * kp
  const X = (u: number) => K.mm(f.x + (f.w - 22) / 2) + (u - uc) * kp, Y = (z: number) => gy - z * kp
  // the city behind the cut, pale
  for (const o of d.context) {
    const w = o.ring.map(W); if (Math.max(...w) < 0 || Math.min(...w) > 160) continue
    const uu = o.ring.map(U), a = Math.max(u0, Math.min(...uu)), b = Math.min(u1, Math.max(...uu)); if (b <= a) continue
    c.fillStyle = '#efefef'; c.fillRect(X(a), Y(o.z1), (b - a) * kp, o.z1 * kp); c.strokeStyle = '#b8b8b8'; K.lw(0.08); c.strokeRect(X(a), Y(o.z1), (b - a) * kp, o.z1 * kp)
  }
  // the tower beyond the cut: its silhouette and floor lines, fine
  for (const p of prisms) {
    const w = p.ring.map(W); if (Math.max(...w) < 0) continue
    const uu = p.ring.map(U), a = Math.min(...uu), b = Math.max(...uu)
    c.fillStyle = st.paper; c.fillRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp); c.strokeStyle = st.ink; K.lw(0.12); c.strokeRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp)
    c.strokeStyle = '#bdbdbd'; K.lw(0.06); c.beginPath(); for (const fl of p.t.floors) if (fl.z0 > p.z0 + 0.1 && fl.z0 < p.z1 - 0.1) { c.moveTo(X(a), Y(fl.z0)); c.lineTo(X(b), Y(fl.z0)) } c.stroke()
  }
  // the earth: a hatched band, a heavy ground line
  c.fillStyle = hatchPattern(c, '#8a8a8a', 7, 0.6); c.fillRect(K.mm(f.x + 3), gy, K.mm(f.w - 6), 6 * kp)
  // the cut: poché slabs, end walls and core walls
  const ink = st.ink, slab = Math.max(K.mm(0.5), 0.35 * kp), wall = Math.max(K.mm(0.6), 0.3 * kp), coreW = Math.max(K.mm(0.7), 0.35 * kp)
  for (const p of prisms) {
    const zs: number[] = []
    p.ring.forEach((a, i) => { const b = p.ring[(i + 1) % p.ring.length], wa = W(a), wb = W(b); if ((wa < 0) !== (wb < 0)) { const s = wa / (wa - wb); zs.push(U([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s])) } })
    zs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < zs.length; i += 2) {
      const a = zs[i], b = zs[i + 1]
      c.fillStyle = st.paper; c.fillRect(X(a), Y(p.z1), (b - a) * kp, (p.z1 - p.z0) * kp)
      c.fillStyle = ink
      for (const fl of p.t.floors) if (fl.z0 >= p.z0 - 0.01 && fl.z0 <= p.z1 + 0.01) c.fillRect(X(a), Y(fl.z0) - slab / 2, (b - a) * kp, slab)
      c.fillRect(X(a), Y(p.z1) - slab, (b - a) * kp, slab * 1.6) // roof slab
      c.fillRect(X(a), Y(p.z1) - slab * 2.6, wall, slab * 2.6); c.fillRect(X(b) - wall, Y(p.z1) - slab * 2.6, wall, slab * 2.6) // parapets
      // façade: glazing as two fine lines with spandrels at the slabs
      K.lw(0.1); c.strokeStyle = ink; for (const x of [X(a) + wall * 0.3, X(b) - wall * 0.3]) { c.beginPath(); c.moveTo(x, Y(p.z1)); c.lineTo(x, Y(p.z0)); c.stroke() }
      const core = coreOf(p.t)
      if (core) {
        const cu = core.map(U), cw = core.map(W)
        if (Math.min(...cw) < 0 && Math.max(...cw) > 0) {
          const c0 = Math.max(a, Math.min(...cu)), c1 = Math.min(b, Math.max(...cu)), zt = p.z1 + (p.z1 >= top - 0.01 ? 4.5 : 0)
          c.fillRect(X(c0), Y(zt), coreW, (zt - p.z0) * kp); c.fillRect(X(c1) - coreW, Y(zt), coreW, (zt - p.z0) * kp)
          if (zt > p.z1) c.fillRect(X(c0), Y(zt), (c1 - c0) * kp, slab)
          K.lw(0.08); c.beginPath(); const mid = X((c0 + c1) / 2); c.moveTo(mid, Y(zt)); c.lineTo(mid, Y(p.z0)); c.stroke()
        }
      }
    }
  }
  // foundation under the cut towers, then the ground line over everything
  for (const t of d.towers) { const uu = t.prisms.flatMap((p) => p.ring.map(U)); const a = Math.min(...uu), b = Math.max(...uu); c.fillStyle = ink; c.fillRect(X(a) - 1.5 * kp, gy, (b - a + 3) * kp, Math.max(K.mm(0.8), 1.4 * kp)) }
  c.strokeStyle = ink; K.lw(0.6); c.beginPath(); c.moveTo(K.mm(f.x + 3), gy); c.lineTo(K.mm(f.x + f.w - 3), gy); c.stroke()
  // use labels inside the cut runs, and level marks on the right
  const rs = runs(main)
  c.font = K.font(1.9, true); c.textAlign = 'center'; c.fillStyle = ink
  const ucut = (() => { const uu = main.prisms.flatMap((p) => p.ring.map(U)); return (Math.min(...uu) + Math.max(...uu)) / 2 })()
  for (const r of rs) if ((r.z1 - r.z0) * kp > K.mm(4)) { const txt = USES[r.use].label.replace(/ \/.*$/, '').toUpperCase(); const y = Y((r.z0 + r.z1) / 2) + K.mm(0.7), w = c.measureText(txt).width; c.fillStyle = st.paper; c.fillRect(X(ucut) - w / 2 - 3, y - K.mm(2.4), w + 6, K.mm(3.2)); c.fillStyle = ink; c.fillText(txt, X(ucut), y) }
  const marks: [number, string][] = [[0, '±0.00 GROUND'], ...rs.slice(1).map((r) => [r.z0, `+${r.z0.toFixed(2)} L${r.from}`] as [number, string]), [top, `+${top.toFixed(2)} ROOF`]]
  const lx = K.mm(f.x + f.w - 26)
  let last = Infinity
  c.font = K.font(1.9); c.textAlign = 'left'
  for (const [z, t] of marks) {
    const y = Y(z); if (Math.abs(last - y) < K.mm(3.2)) continue; last = y
    c.strokeStyle = ink; K.lw(0.1); c.setLineDash([K.mm(1), K.mm(0.8)]); c.beginPath(); c.moveTo(X(u1 - 25), y); c.lineTo(lx - K.mm(2), y); c.stroke(); c.setLineDash([])
    c.fillStyle = ink; c.beginPath(); c.moveTo(lx, y); c.lineTo(lx - K.mm(1.4), y - K.mm(1.8)); c.lineTo(lx + K.mm(1.4), y - K.mm(1.8)); c.closePath(); c.fill()
    c.fillText(t, lx + K.mm(2.4), y - K.mm(0.4))
  }
  K.scaleBar(sc, kp)
  return [cross ? 'Section B–B, across the tower' : 'Section A–A, along the tower', sc]
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

function drawAxo(c: CanvasRenderingContext2D, k: number, f: Rect, d: DrawData, st: BoardStyle): [string, number] {
  const K = kit(c, k, f, st)
  const main = d.towers.reduce((m, t) => (t.floors.length > m.floors.length ? t : m), d.towers[0]), T = turnTo(main)
  const prisms = d.towers.flatMap((t) => t.prisms.map((p) => ({ ...p, ring: p.ring.map(T), t })))
  const own = prisms.flatMap((p) => p.ring)
  const cc = centroid(own)
  const near = d.context.map((o) => ({ ...o, ring: o.ring.map(T) })).filter((o) => o.ring.some((p) => Math.abs(p[0] - cc[0]) < 90 && Math.abs(p[1] - cc[1]) < 90))
  const site = d.site?.map(T) ?? null
  const pts: [number, number, number][] = [...prisms.flatMap((p) => p.ring.flatMap((q) => [[q[0], q[1], 0], [q[0], q[1], p.z1]] as [number, number, number][])), ...near.flatMap((o) => o.ring.map((q) => [q[0], q[1], 0] as [number, number, number]))]
  const { P } = isoFit(c, k, f, pts, 8)
  const lw = K.lw
  // the ground: neighbours as low grey blocks, the site outline dashed
  const blocks = near.map((o) => ({ ring: o.ring, z1: Math.min(o.z1, 30) })).sort((a, b) => { const ca = centroid(a.ring), cb = centroid(b.ring); return cb[0] + cb[1] - (ca[0] + ca[1]) })
  for (const o of blocks) isoPrism(c, P, o.ring, 0, o.z1, { ...st, ink: '#9c9c9c' }, lw, { side: ['#f4f4f4', '#e9e9e9'], top: '#fbfbfb' })
  if (site) { c.strokeStyle = st.ink; lw(0.25); c.setLineDash([K.mm(3), K.mm(1)]); c.beginPath(); site.forEach((p, i) => { const q = P(p, 0); if (i) c.lineTo(...q); else c.moveTo(...q) }); c.closePath(); c.stroke(); c.setLineDash([]) }
  // the towers, far to near, low to high
  const order = [...prisms].sort((a, b) => { const ca = centroid(a.ring), cb = centroid(b.ring); return (a.t === b.t ? 0 : cb[0] + cb[1] - (ca[0] + ca[1])) || a.z0 - b.z0 })
  for (const p of order) isoPrism(c, P, p.ring, p.z0, p.z1, st, lw, { side: [st.paper, '#dcdcdc'], top: st.paper }, p.t.floors.map((fl) => fl.z0), K.mm(1.2))
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
  drawCaption(c, k, f, st, no, title, sc ? `Scale 1:${sc} at A2` : spec.vt === 'axo' ? 'Isometric, to scale along the axes' : 'Exploded, floors by use')
}
