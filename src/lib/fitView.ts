// Fit the camera to an outline (Ruijie, 4 Nov: "once you click on the neighbourhood, bring the view fit the boundary of
// the neighbourhood"). The view looks from a fixed direction (north up by default, so the outline reads like a map) and
// is moved and zoomed until every point of the outline sits inside the part of the view the overlays leave free, with a
// small margin. Perspective makes the near edge larger than the far one, so the fit is solved by iteration, not by the
// bounding box. Model frame: x east, y north, z up (metres).

export type V3 = [number, number, number]
export interface CamFit { position: V3; target: V3; fov: number }

export interface FitOptions {
  /** Width / height of the view. */
  aspect: number
  /** Vertical field of view, degrees (35). */
  fov?: number
  /** Camera height above the horizon seen from the target, degrees (60; 90 = straight down). */
  elevationDeg?: number
  /** Bearing from the target to the camera, degrees clockwise from north (180: camera south, north up). */
  azimuthDeg?: number
  /** Fractions of the view covered by overlays: top and bottom of the height, each side of the width. */
  insets?: { top: number; bottom: number; side?: number }
  /** Share of the free band the outline fills (0.9). */
  fill?: number
  /** The smallest ground span shown, metres (300), so a tiny outline is not filled edge to edge. */
  minSpan?: number
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** The camera's frame for a view direction: `dir` from the target towards the camera, `r` screen right, `u` screen up. */
export function viewBasis(elevationDeg: number, azimuthDeg: number): { dir: V3; f: V3; r: V3; u: V3 } {
  const el = (Math.min(89.9, Math.max(5, elevationDeg)) * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180
  const dir: V3 = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)]
  const f: V3 = [-dir[0], -dir[1], -dir[2]]
  const r = norm([f[1], -f[0], 0]) // f x z-up
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  return { dir, f, r, u }
}

/** Normalised screen position (-1..1 each way, y up) of `p` seen from `cam` along the basis; z = depth in metres. */
export function project(p: V3, cam: V3, b: { f: V3; r: V3; u: V3 }, tanHalf: number, aspect: number): V3 {
  const v: V3 = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]]
  const depth = dot(v, b.f)
  return [dot(v, b.r) / (depth * tanHalf * aspect), dot(v, b.u) / (depth * tanHalf), depth]
}

/**
 * A camera that shows every point inside the free band of the view. The target stays on the points' mean height; the
 * camera moves along the view direction (zoom) and the target slides on that level (pan) until the points' screen
 * extent is centred in the band and fills `fill` of it in the tighter direction.
 */
export function fitPoints(points: readonly V3[], o: FitOptions): CamFit {
  const fov = o.fov ?? 35, tanHalf = Math.tan((fov * Math.PI) / 360), aspect = Math.max(0.2, o.aspect)
  const top = o.insets?.top ?? 0, bottom = o.insets?.bottom ?? 0, side = o.insets?.side ?? 0, fill = o.fill ?? 0.9
  const b = viewBasis(o.elevationDeg ?? 60, o.azimuthDeg ?? 180)
  const pts = points.length ? points : [[0, 0, 0] as V3]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zs = 0
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); zs += p[2] }
  const z = zs / pts.length
  // The free band in screen units, and where its middle is.
  const availX = Math.max(0.2, 2 - 4 * side) * fill, availY = Math.max(0.2, 2 - 2 * top - 2 * bottom) * fill
  const midY = bottom - top
  const minSpan = o.minSpan ?? 300
  let t: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, z]
  let d = Math.max(minSpan, x1 - x0, y1 - y0) / (2 * tanHalf) // a first guess, refined below
  // Screen up's direction on the ground (unit) and how much a ground step along it moves the screen (sin of elevation).
  const g = norm([b.u[0], b.u[1], 0]), gu = Math.max(0.05, Math.hypot(b.u[0], b.u[1]))
  for (let i = 0; i < 40; i++) {
    const cam: V3 = [t[0] + b.dir[0] * d, t[1] + b.dir[1] * d, t[2] + b.dir[2] * d]
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity, behind = false
    for (const p of pts) {
      const q = project(p, cam, b, tanHalf, aspect)
      if (q[2] <= 1) { behind = true; break }
      sx0 = Math.min(sx0, q[0]); sx1 = Math.max(sx1, q[0]); sy0 = Math.min(sy0, q[1]); sy1 = Math.max(sy1, q[1])
    }
    if (behind) { d *= 1.5; continue }
    // Zoom: the extent shrinks about in proportion to the distance.
    const k = Math.max((sx1 - sx0) / availX, (sy1 - sy0) / availY)
    // Pan: slide the target so the extent's middle sits in the band's middle (screen units -> metres at the target).
    const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2 - midY
    const mx = cx * d * tanHalf * aspect, my = (cy * d * tanHalf) / gu
    t = [t[0] + b.r[0] * mx + g[0] * my, t[1] + b.r[1] * mx + g[1] * my, z]
    d = Math.max(minSpan / (2 * tanHalf), d * (0.25 + 0.75 * k)) // damped: perspective makes k approximate
    if (Math.abs(k - 1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break
  }
  return { position: [t[0] + b.dir[0] * d, t[1] + b.dir[1] * d, t[2] + b.dir[2] * d], target: t, fov }
}
