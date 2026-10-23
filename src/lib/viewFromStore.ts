// "View from here" state: the picked viewpoint, the eye-level camera and capture requests (session only).
import { create } from 'zustand'
import { EYE_HEIGHT } from '../engine/viewFrom'

export interface Viewpoint {
  /** 'cone': a protected-view origin (Vista node), whose eye is the City's Lv. */
  kind: 'roof' | 'street' | 'tower' | 'cone'
  /** Local frame (EPSG:26910 minus the City origin), metres. */
  x: number
  y: number
  /** Standing surface, geodetic (CGVD28) metres; the eye is this + eye height. */
  stand: number
  label: string
  /** Where the standing height comes from. */
  basis: string
  footprint?: number
  towerId?: string
  /** Clip the viewer's own walls (inside a tower): near-plane distance in metres. */
  near?: number
  /** A fixed eye elevation (CGVD28 m) that the eye-height setting does not move: the City's Lv at a protected origin. */
  eyeAbs?: number
  /** Cone id for a protected-view origin. */
  coneId?: string
}

/** Eye elevation of a viewpoint: the fixed eye if it has one, else the standing surface plus the eye height. */
export const eyeZ = (vp: Viewpoint, eye: number) => vp.eyeAbs ?? vp.stand + eye

interface ViewFromState {
  picking: boolean
  viewpoint: Viewpoint | null
  looking: boolean
  /** Degrees clockwise from grid north. */
  bearing: number
  pitch: number
  hfov: number
  eye: number
  note: string | null
  captureReq: number
  capturing: boolean
  /** Keep map overlays (cone sheets, tints, height surface) in the eye-level view. */
  overlays: boolean
  set: (patch: Partial<Omit<ViewFromState, 'set'>>) => void
}

export const useViewFromStore = create<ViewFromState>((set) => ({
  picking: false, viewpoint: null, looking: false, bearing: 0, pitch: 0, hfov: 70, eye: EYE_HEIGHT, note: null, captureReq: 0, capturing: false, overlays: false,
  set: (patch) => set(patch),
}))
