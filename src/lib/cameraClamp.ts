// The orbit camera never goes under the ground. Each scene registers how high its ground is (a lookup in height grids
// it already holds, never a raycast) and the plinth the orbit target has to stay over; CameraClamp applies the rules
// below every frame, after OrbitControls, a camera preset or the Schematic lens has placed the camera.
import type { Plinth } from './plinth'

/** A point in the model frame (x east, y north, z up, metres). */
export type V3 = [number, number, number]

/** Lowest eye above the ground under it: below the street presets' 1.6 m, above the default 1 m near plane. */
export const EYE_CLEARANCE = 1.2
/** Just under horizontal, so a user orbit never ends up below its target looking up (see relaxPolar for presets). */
export const MAX_POLAR = Math.PI / 2.02
/** The closest the orbit camera can come to its target, so zooming in never collapses onto it. */
export const MIN_DISTANCE = 2

export interface SceneGround { at: (x: number, y: number) => number; plinth: Plinth | null }
const flat = () => 0
export const sceneGround: SceneGround = { at: flat, plinth: null }

/** Make `g` the current scene's ground; the returned function puts back the flat default if `g` is still current. */
export function registerGround(g: SceneGround): () => void {
  sceneGround.at = g.at
  sceneGround.plinth = g.plinth
  return () => { if (sceneGround.at === g.at) { sceneGround.at = flat; sceneGround.plinth = null } }
}

/**
 * Keeps the orbit target over the plinth and on or above the ground by moving camera and target together (a pan that
 * stops at the edge), then keeps the camera at least EYE_CLEARANCE above the ground under it.
 */
export function clampView(cam: V3, target: V3, ground: (x: number, y: number) => number, plinth: Plinth | null): { cam: V3; target: V3; moved: boolean; above: number } {
  const dx = plinth ? Math.min(plinth.x1, Math.max(plinth.x0, target[0])) - target[0] : 0
  const dy = plinth ? Math.min(plinth.y1, Math.max(plinth.y0, target[1])) - target[1] : 0
  const dz = Math.max(0, ground(target[0] + dx, target[1] + dy) - target[2])
  const t: V3 = [target[0] + dx, target[1] + dy, target[2] + dz]
  const c: V3 = [cam[0] + dx, cam[1] + dy, cam[2] + dz]
  const under = ground(c[0], c[1])
  const lift = c[2] < under + EYE_CLEARANCE
  if (lift) c[2] = under + EYE_CLEARANCE
  return { cam: c, target: t, moved: dx !== 0 || dy !== 0 || dz !== 0 || lift, above: c[2] - under }
}

/**
 * For a camera request (a preset or a protected viewpoint) whose target lies inside the ground, say behind a hill:
 * the target slides back along the line of sight to where it meets the ground, so the eye and the view stay exactly
 * as asked and only the orbit's pivot moves. A camera inside the ground is left to clampView.
 */
export function sightTarget(cam: V3, target: V3, ground: (x: number, y: number) => number): V3 {
  const at = (f: number): V3 => [cam[0] + (target[0] - cam[0]) * f, cam[1] + (target[1] - cam[1]) * f, cam[2] + (target[2] - cam[2]) * f]
  const below = (p: V3) => p[2] < ground(p[0], p[1])
  if (!below(target) || below(cam)) return target
  let lo = 0, hi = 1
  for (let s = 1; s <= 32; s++) { if (below(at(s / 32))) { hi = s / 32; break } lo = s / 32 }
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (below(at(m))) hi = m; else lo = m }
  return at(lo)
}

/** Angle between straight up and the camera, seen from the target (OrbitControls' polar angle). */
export function polarOf(cam: V3, target: V3): number {
  const dx = cam[0] - target[0], dy = cam[1] - target[1], dz = cam[2] - target[2]
  const r = Math.hypot(dx, dy, dz)
  return r ? Math.acos(Math.max(-1, Math.min(1, dz / r))) : 0
}

/**
 * The polar limit for a camera a preset placed below its target (an eye-level view looking up at a tower): the limit
 * starts at the preset's own angle, follows the camera back up as the user orbits, and never lets it sink further.
 */
export const relaxPolar = (limit: number, phi: number) => Math.max(MAX_POLAR, Math.min(limit, phi))

/** A near plane that cannot cut into the ground below the eye or the target in front of it (never above `base`). */
export const nearFor = (base: number, aboveGround: number, toTarget: number) => Math.min(base, Math.max(0.3, 0.5 * Math.min(aboveGround, toTarget)))
