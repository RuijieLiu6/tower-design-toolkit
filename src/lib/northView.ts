// "Make the north arrow clickable: it turns the view to face north" (Ruijie, 6 Nov 2026).
// faceNorth(northDeg) turns the orbit camera about its target (same distance, same tilt) until true north points up the
// screen; at eye level (View from here, a protected viewpoint) the eye turns to look north instead. The turn takes the
// short way round, eases over about 0.7 s, is instant under reduced motion, and stops when the view is grabbed.
// NorthTurnRig (components/NorthTurnRig.tsx) runs it inside the canvas and keeps the compass arrows pointing north.
import { useStore } from '../store'
import { useViewFromStore } from './viewFromStore'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'

export const northView = {
  /** A turn asked for and not yet started: true north in degrees clockwise from the model's +Y. */
  want: null as number | null,
  /** Compass arrows to turn each frame so they point to true north on screen, with that north (deg from +Y). */
  arrows: new Map<HTMLElement, number>(),
  invalidate: null as null | (() => void),
  /** Stops a camera glide in progress (Real Vancouver's flights), so a turn to north is not undone by it. */
  stopFlight: null as null | (() => void),
}

export function faceNorth(northDeg: number) {
  const v = useViewFromStore.getState()
  // At eye level the camera stands still and looks around: face north there (bearing = degrees from grid north).
  if (v.looking) { v.set({ bearing: ((northDeg % 360) + 360) % 360 }); return }
  northView.stopFlight?.()
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

// ---------------------------------------------------------------- true north or project north (13 Nov, Sinnie)
// "I want to be able to toggle between true north and project north": the view turns so the chosen north points up the
// screen. True north is the model's true north (competition: 45° from the model grid; Real Vancouver: the UTM grid).
// Project north is the site's own grid: the competition model grid, or the side of the Real Vancouver lot nearest true
// north (its street grid). The compass arrow keeps pointing to true north either way.

export type NorthMode = 'true' | 'project'
const NORTH_KEY = 'ts.northMode'
export const useNorthMode = create<{ mode: NorthMode }>(() => {
  try { return { mode: localStorage.getItem(NORTH_KEY) === 'project' ? 'project' : 'true' } } catch { return { mode: 'true' } }
})

/** True north in degrees clockwise from the model's +Y. */
export const trueNorthDeg = (project: 'vtc' | 'city') => (project === 'vtc' ? VTC_NORTH_DEG : 0)

/**
 * Project north in degrees clockwise from the model's +Y: the competition model grid (0), or for a Real Vancouver site the
 * direction along its longest side, or across it, closest to true north (within ±45°). Null when there is no site.
 */
export function projectNorthDeg(project: 'vtc' | 'city', ring: readonly (readonly [number, number])[] | null | undefined): number | null {
  if (project === 'vtc') return 0
  if (!ring || ring.length < 3) return null
  let best = 0, deg = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI }
  })
  const bearing = 90 - deg
  const r = ((((bearing + 45) % 90) + 90) % 90) - 45 // the grid direction nearest true north
  return Math.round(r * 10) / 10
}

/** The north the view puts up the screen now. */
export function upNorthDeg(): number {
  const s = useStore.getState(), tn = trueNorthDeg(s.project)
  if (useNorthMode.getState().mode !== 'project') return tn
  return projectNorthDeg(s.project, s.project === 'city' ? (s.citySite?.ring as [number, number][] | undefined) : null) ?? tn
}

/** Choose true or project north, and turn the view to it. */
export function setNorthMode(mode: NorthMode) {
  useNorthMode.setState({ mode })
  try { localStorage.setItem(NORTH_KEY, mode) } catch { /* this visit only */ }
  faceNorth(upNorthDeg())
}
