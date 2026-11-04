// Real Vancouver's orbit view stays over the built model: the user can't zoom out or pan past the edge of the
// buildings (Ruijie, 3 Nov: "make this boundary the maxium that the user can zoom out so that they dont see the unbuild
// part"). The edge is the bounding box of the building footprints in use (Vista's model by default). CameraClamp applies
// limitView every frame after OrbitControls, presets and fly-tos, so every way of moving the camera obeys it; eye-level
// views (View from here, Observer) switch the controls off and are left alone, so the North Shore still shows.
import type { V3 } from './cameraClamp'

/** An axis-aligned rectangle in the model frame (x east, y north, metres). */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** The bounding box of every footprint vertex, or null without footprints. */
export function footprintBounds(fps: readonly { outer: readonly (readonly [number, number])[] }[]): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const f of fps) for (const [x, y] of f.outer) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null
}

/** The current scene's limit (null: no limit, e.g. the competition site). */
export const viewLimit: { rect: Rect | null } = { rect: null }

/** Make `rect` the limit; the returned function clears it if it is still the current one. */
export function registerViewLimit(rect: Rect | null): () => void {
  viewLimit.rect = rect
  return () => { if (viewLimit.rect === rect) viewLimit.rect = null }
}

export interface ViewShape {
  /** tan(vertical fov / 2) and width / height of the view. */
  tanHalf: number; aspect: number
  /** The screen's right and up directions projected on the ground (model x, y); right is a unit vector, up keeps its length. */
  right: [number, number]; up: [number, number]
}

/**
 * The orbit camera and target moved as little as possible so the view at the target stays inside `rect`: first the
 * distance shrinks until the view's ground extent around the target fits the rectangle, then the target (and the camera
 * with it) slides back inside. The view's direction never changes. The extent is the frame at the target's distance
 * (exact from straight above; looser for an oblique view, whose far side may show the backdrop and the mountains).
 */
export function limitView(cam: V3, target: V3, v: ViewShape, rect: Rect): { cam: V3; target: V3; moved: boolean } {
  const off: V3 = [cam[0] - target[0], cam[1] - target[1], cam[2] - target[2]]
  const d = Math.hypot(off[0], off[1], off[2])
  const hw = d * v.tanHalf * v.aspect, hh = d * v.tanHalf
  let ex = Math.abs(v.right[0]) * hw + Math.abs(v.up[0]) * hh
  let ey = Math.abs(v.right[1]) * hw + Math.abs(v.up[1]) * hh
  const w2 = (rect.x1 - rect.x0) / 2, h2 = (rect.y1 - rect.y0) / 2
  let s = 1
  if (ex > w2) s = Math.min(s, w2 / ex)
  if (ey > h2) s = Math.min(s, h2 / ey)
  const shrink = s < 0.9999
  if (!shrink) s = 1
  ex *= s; ey *= s
  const clampAxis = (t: number, lo: number, hi: number, e: number) => (lo + e > hi - e ? (lo + hi) / 2 : Math.min(hi - e, Math.max(lo + e, t)))
  const tx = clampAxis(target[0], rect.x0, rect.x1, ex), ty = clampAxis(target[1], rect.y0, rect.y1, ey)
  const t: V3 = [tx, ty, target[2]]
  const c: V3 = [tx + off[0] * s, ty + off[1] * s, target[2] + off[2] * s]
  const moved = shrink || Math.abs(tx - target[0]) > 1e-6 || Math.abs(ty - target[1]) > 1e-6
  return { cam: moved ? c : cam, target: moved ? t : target, moved }
}
