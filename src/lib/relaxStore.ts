// Relaxation masks (C01-M06): which routes the user has switched on and whether the masks are drawn. Off by default:
// relaxations are never applied automatically. Kept for this session only (not part of the design).
import { create } from 'zustand'
import type { Instrument } from '../engine/relaxAviation'

interface RelaxState {
  /** Draw the per-cone masks in Real Vancouver. */
  show: boolean
  /** Routes the user switched on (each relaxes only its own cones). */
  on: Instrument[]
  /** Site area for the Exceptional Downtown Site test (m²); unknown until entered. */
  siteArea: number | null
}
export const useRelax = create<RelaxState>(() => ({ show: false, on: [], siteArea: null }))
export const toggleInstrument = (k: Instrument) => useRelax.setState((s) => ({ on: s.on.includes(k) ? s.on.filter((x) => x !== k) : [...s.on, k] }))
