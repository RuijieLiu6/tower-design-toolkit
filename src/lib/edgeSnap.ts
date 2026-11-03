// Snapping a moving tower footprint onto site and parcel lines (Vista v10.1 "confirm before placing", item 6 on 3 Nov).
// Pure plan geometry in the project frame (m). A footprint corner snaps onto a target corner first; otherwise up to two
// footprint edges snap onto parallel target edges that overlap them, which lands a corner on a corner when both fit.
// Turns snap parallel to a nearby target edge. The UI bypasses all of it with Shift.

export type Pt = [number, number]
export type SnapKind = 'site' | 'parcel'
export interface SnapTarget { ring: Pt[]; kind: SnapKind }
export interface EdgeSnap { dx: number; dy: number; kind: SnapKind; how: 'corner' | 'edge'; segments: [Pt, Pt][] }
export interface AngleSnap { rotation: number; kind: SnapKind; segment: [Pt, Pt] }

/** Edges within this angle (deg) count as parallel. */
const PARALLEL_DEG = 2
const SIN_PAR = Math.sin((PARALLEL_DEG * Math.PI) / 180)

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l] }

function edges(ring: Pt[]): [Pt, Pt][] {
  const n = ring.length
  const out: [Pt, Pt][] = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) out.push([a, b])
  }
  return out
}

interface Line { n: Pt; s: number; seg: [Pt, Pt]; kind: SnapKind }

/**
 * The shift (within `tol` metres) that puts the footprint onto the targets, or null when nothing is in reach.
 * `rings` are the footprint outlines (a podium and its shaft, or an imported hull); `axis` limits the shift to one
 * direction (an arrow drag), in which case only edges snap.
 */
export function snapFootprint(rings: Pt[][], targets: SnapTarget[], tol: number, axis?: Pt): EdgeSnap | null {
  if (!targets.length || tol <= 0) return null
  // 1. Corner onto corner (plane moves only).
  if (!axis) {
    let best: EdgeSnap | null = null, bestD = tol
    for (const ring of rings) for (const p of ring) for (const t of targets) for (const q of t.ring) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (d <= bestD) { bestD = d; best = { dx: q[0] - p[0], dy: q[1] - p[1], kind: t.kind, how: 'corner', segments: [[q, q]] } }
    }
    if (best) return best
  }
  // 2. Edge onto a parallel, overlapping edge: candidate lines with the signed distance along the footprint edge's normal.
  const lines: Line[] = []
  for (const ring of rings) for (const [a, b] of edges(ring)) {
    const u = unit(sub(b, a)), n: Pt = [-u[1], u[0]], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (const t of targets) for (const [c, d] of edges(t.ring)) {
      const v = unit(sub(d, c))
      if (Math.abs(cross(u, v)) > SIN_PAR) continue
      const s = dot(sub(c, a), n)
      if (Math.abs(s) > tol) continue
      const t0 = dot(sub(c, a), u), t1 = dot(sub(d, a), u)
      if (Math.max(Math.min(t0, t1), 0) > Math.min(Math.max(t0, t1), L) + tol) continue
      lines.push({ n, s, seg: [c, d], kind: t.kind })
    }
  }
  if (!lines.length) return null
  if (axis) {
    const a = unit(axis)
    let best: Line | null = null, bestK = Infinity
    for (const l of lines) {
      const c = dot(l.n, a)
      if (Math.abs(c) < 0.5) continue
      const k = l.s / c
      if (Math.abs(k) <= tol && Math.abs(k) < Math.abs(bestK)) { bestK = k; best = l }
    }
    return best ? { dx: a[0] * bestK, dy: a[1] * bestK, kind: best.kind, how: 'edge', segments: [best.seg] } : null
  }
  lines.sort((p, q) => Math.abs(p.s) - Math.abs(q.s))
  const l1 = lines[0]
  // A second line in another direction, solved together with the first (both distances hold after the shift).
  const l2 = lines.find((l) => Math.abs(dot(l.n, l1.n)) < 0.5)
  if (l2) {
    const det = l1.n[0] * l2.n[1] - l1.n[1] * l2.n[0]
    const dx = (l1.s * l2.n[1] - l1.n[1] * l2.s) / det, dy = (l1.n[0] * l2.s - l1.s * l2.n[0]) / det
    if (Math.hypot(dx, dy) <= tol * 1.5) return { dx, dy, kind: l1.kind === 'site' || l2.kind === 'site' ? 'site' : 'parcel', how: 'edge', segments: [l1.seg, l2.seg] }
  }
  return { dx: l1.n[0] * l1.s, dy: l1.n[1] * l1.s, kind: l1.kind, how: 'edge', segments: [l1.seg] }
}

/**
 * Rotation (deg) that turns the footprint parallel to the nearest target edge, if within `tolDeg`. A rectangle repeats
 * every 90°, so an edge at 30° also catches 120°, 210° and 300°.
 */
export function snapAngle(rotation: number, targets: SnapTarget[], tolDeg: number, period = 90): AngleSnap | null {
  let best: AngleSnap | null = null, bestD = tolDeg
  for (const t of targets) for (const [c, d] of edges(t.ring)) {
    const a = (Math.atan2(d[1] - c[1], d[0] - c[0]) * 180) / Math.PI
    const diff = ((((rotation - a) % period) + period * 1.5) % period) - period / 2
    if (Math.abs(diff) < bestD || (Math.abs(diff) === bestD && t.kind === 'site')) { bestD = Math.abs(diff); best = { rotation: rotation - diff, kind: t.kind, segment: [c, d] } }
  }
  return best
}
