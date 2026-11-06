// "Make the north arrow clickable: it turns the view to face north" (Ruijie, 6 Nov 2026).
// faceNorth(northDeg) turns the orbit camera about its target (same distance, same tilt) until true north points up the
// screen; at eye level (View from here, a protected viewpoint) the eye turns to look north instead. The turn takes the
// short way round, eases over about 0.7 s, is instant under reduced motion, and stops when the view is grabbed.
// NorthTurnRig (components/NorthTurnRig.tsx) runs it inside the canvas and keeps the compass arrows pointing north.
import { useStore } from '../store'
import { useViewFromStore } from './viewFromStore'

export const northView = {
  /** A turn asked for and not yet started: true north in degrees clockwise from the model's +Y. */
  want: null as number | null,
  /** Compass arrows to turn each frame so they point to true north on screen, with that north (deg from +Y). */
  arrows: new Map<HTMLElement, number>(),
  invalidate: null as null | (() => void),
}

export function faceNorth(northDeg: number) {
  const v = useViewFromStore.getState()
  // At eye level the camera stands still and looks around: face north there (bearing = degrees from grid north).
  if (v.looking) { v.set({ bearing: ((northDeg % 360) + 360) % 360 }); return }
  northView.want = northDeg
  northView.invalidate?.()
}

/** Orbit azimuth (three.js theta = atan2(x, z) of the camera's offset from the target) that puts true north up the screen. */
export function northTheta(northDeg: number): number {
  // Model north (sin n, cos n) is three.js (sin n, 0, -cos n); the camera sits on the south side: theta = -n.
  return -(northDeg * Math.PI) / 180
}

/** Shortest signed turn from a to b (radians), in [-pi, pi). */
export function shortestTurn(a: number, b: number): number {
  const d = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
  return d
}

export const reducedMotion = () => useStore.getState().reducedMotion
