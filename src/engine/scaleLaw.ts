// Scale law along the height (gap G78, Study 4 C's mid-height swell): a part's plan scale as a curve through points
// {t, scale}, t the share of the part's height (0 at z0, 1 at z1). One part can then widen and narrow again between its
// foot and its top, so a swell is one continuous tower, not stacked parts on a law (the round-8 workaround, G89).
//
// Curves:
// - `smooth` (default): a monotone cubic through the points (Fritsch–Carlson). It never overshoots a point, and at a
//   point that is a peak or a dip the slope is zero, so a swell has a rounded waist with no kink. Between points the
//   section is a smooth curve; per storey the harness and the slicer read it at each storey's mid-height.
// - `linear`: straight lines between the points (a polyline in section: faces are planar within each segment).
// The law is a designer input (geometry), not a coefficient: no source is needed and none is claimed.
//
// Also here (gap G85): a per-storey rotation offset, `ripple`: degrees added to the part's rotation, a sine of the
// height, `deg · sin(2π (z − z0) / wavelength + phase)`. With z0 on a storey line, a wavelength of two storeys and phase 0
// turn the storeys alternately +deg and −deg at their mid-heights (Study 4 C's "floor ripple"); longer: a wave.
//
// `partFrameAt` is the one place a free-form part's scale, rotation and centre are worked out at a height: the old
// fields (`scaleTop` with `scaleProfile`, `steps`, `twist`, `lean`) exactly as TOOLKIT_FREEFORM.md defines them, plus
// `scaleLaw` (which replaces scaleTop/scaleProfile when given; `steps` still multiply on top) and `ripple`.

export interface ScalePoint { t: number; scale: number }
export interface ScaleLaw {
  /** Points along the part's height: t from 0 (z0) to 1 (z1), the plan scale there. Need not start at 0 or end at 1. */
  points: ScalePoint[] | [number, number][]
  /** Curve through the points (default smooth). */
  curve?: 'smooth' | 'linear'
}
export interface Ripple {
  /** Amplitude (degrees, counter-clockwise positive). */
  deg: number
  /** Wavelength along the height (m). */
  wavelength: number
  /** Phase (degrees) at the part's foot (default 0). */
  phase?: number
}

const norm = (law: ScaleLaw): ScalePoint[] => {
  const pts = (law.points as (ScalePoint | [number, number])[]).map((p) => (Array.isArray(p) ? { t: p[0], scale: p[1] } : p))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.scale))
    .sort((a, b) => a.t - b.t)
  const out: ScalePoint[] = []
  for (const p of pts) if (!out.length || p.t - out[out.length - 1].t > 1e-9) out.push(p); else out[out.length - 1] = p
  return out
}

/** Problems with a law (empty when it can be used): fewer than one point, t outside 0–1, a scale of zero or less. */
export function scaleLawIssues(law: ScaleLaw | null | undefined): string[] {
  if (!law) return []
  const pts = norm(law), out: string[] = []
  if (!pts.length) out.push('the scale law has no points')
  if (pts.some((p) => p.t < -1e-9 || p.t > 1 + 1e-9)) out.push('a point lies outside the part (t must be 0 to 1)')
  if (pts.some((p) => !(p.scale > 0))) out.push('a scale must be above 0')
  if (law.curve && law.curve !== 'smooth' && law.curve !== 'linear') out.push(`unknown curve "${law.curve}" (smooth or linear)`)
  return out
}

/** Fritsch–Carlson tangents for a monotone cubic through the points. */
function tangents(p: ScalePoint[]): number[] {
  const n = p.length, d: number[] = [], m: number[] = new Array(n).fill(0)
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].scale - p[i].scale) / (p[i + 1].t - p[i].t))
  if (n < 2) return m
  m[0] = d[0]; m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i] }
  }
  return m
}

/** The plan scale at t (share of the part's height, clamped to 0–1). Before the first point and after the last: flat. */
export function scaleAt(law: ScaleLaw, t: number): number {
  const p = norm(law)
  if (!p.length) return 1
  const x = Math.max(0, Math.min(1, t))
  if (x <= p[0].t) return p[0].scale
  if (x >= p[p.length - 1].t) return p[p.length - 1].scale
  let i = 0
  while (i < p.length - 2 && x > p[i + 1].t) i++
  const a = p[i], b = p[i + 1], h = b.t - a.t, u = (x - a.t) / h
  if (law.curve === 'linear') return a.scale + (b.scale - a.scale) * u
  const m = tangents(p)
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2
  return h00 * a.scale + h10 * h * m[i] + h01 * b.scale + h11 * h * m[i + 1]
}

/** The law's widest point: its t and scale (sampled every 1/1000 of the height). */
export function scalePeak(law: ScaleLaw): { t: number; scale: number } {
  let best = { t: 0, scale: -Infinity }
  for (let k = 0; k <= 1000; k++) { const s = scaleAt(law, k / 1000); if (s > best.scale + 1e-12) best = { t: k / 1000, scale: s } }
  return best
}

/** A swell law: 1 at the foot (or `base`), `peak` at share `at` of the height, `top` at the top. */
export const swellLaw = (at: number, peak: number, top: number, base = 1, curve: ScaleLaw['curve'] = 'smooth'): ScaleLaw =>
  ({ points: [{ t: 0, scale: base }, { t: Math.max(0.01, Math.min(0.99, at)), scale: peak }, { t: 1, scale: top }], curve })

/** Rotation offset (degrees) of the ripple at height z above the part's foot z0. */
export const rippleAt = (r: Ripple | null | undefined, z: number, z0: number): number =>
  r && r.wavelength > 0 && r.deg ? r.deg * Math.sin((2 * Math.PI * (z - z0)) / r.wavelength + ((r.phase ?? 0) * Math.PI) / 180) : 0

type P2 = [number, number]
/** The free-form part fields that set its frame at a height (TOOLKIT_FREEFORM.md, plus `scaleLaw` and `ripple`). */
export interface FramePart {
  z0: number; z1: number
  centre?: P2; rotation?: number; twist?: number; lean?: P2
  scaleTop?: number; scaleProfile?: number; steps?: { z: number; scale: number }[]
  scaleLaw?: ScaleLaw | null; ripple?: Ripple | null
}

/** A part's plan scale `k`, rotation (degrees) and centre at height z (m), as the slicer places its plan there. */
export function partFrameAt(p: FramePart, z: number): { k: number; rot: number; centre: P2; t: number } {
  const t = Math.max(0, Math.min(1, (z - p.z0) / Math.max(1e-6, p.z1 - p.z0)))
  let k = p.scaleLaw ? scaleAt(p.scaleLaw, t) : 1 - (1 - (p.scaleTop ?? 1)) * t ** (p.scaleProfile ?? 1)
  for (const st of p.steps ?? []) if (z >= st.z) k *= st.scale
  const rot = (p.rotation ?? 0) + (p.twist ?? 0) * t + rippleAt(p.ripple, z, p.z0)
  const c0 = p.centre ?? [0, 0], lean = p.lean ?? [0, 0]
  return { k, rot, centre: [c0[0] + lean[0] * t, c0[1] + lean[1] * t], t }
}
