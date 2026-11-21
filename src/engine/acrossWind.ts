// Natural frequency and across-wind response (gap G8, research R5 §4.2–4.3). An empirical first-mode frequency with its
// scatter, the NBC Commentary I across-wind acceleration chain (equation 7) at both ends of that scatter, the corner
// credit from wind-tunnel tests where R5 sources it, and the vortex-shedding check V = f1·B/St. Screening only: the
// engineer's model frequency and the wind tunnel test replace every number here.
import type { CornerKind } from './corners'

/** Air density (kg/m³) and Vancouver City Hall reference velocity pressures (kPa), NBC 2020 Table C-2 (verified page, R5 §4.3). */
export const RHO_AIR = 1.29
export const Q10 = 0.34
export const Q50 = 0.45
/** Damping ratio: team assumption, the Commentary sample's value (concrete 0.02, steel 0.01, composite 0.015: Commentary I para 57). */
export const DEFAULT_DAMPING = 0.015
/** Strouhal range for non-circular sections: about 0.12 for a sharp square (EN 1991-1-4 Fig. E.1) to about 1/7 (Commentary I para 104). */
export const ST_LOW = 0.1
export const ST_HIGH = 0.14
/** Peak acceleration limits at the 1-in-10-year wind, as a share of g (Commentary I para 113, verified page). */
export const ACCEL_LIMIT = { residential: 0.015, office: 0.025 }
const G = 9.81

/** First-mode frequency f1 = 46/H (EN 1991-1-4 F.2; ISO 4866 Annex D, ±50% "not uncommon"), with the ±50% screening band. */
export function f1Empirical(H: number): { central: number; lower: number; upper: number } {
  const c = H > 0 ? 46 / H : 0
  return { central: c, lower: c / 1.5, upper: c * 1.5 }
}

/** Dynamic exposure factor, rough terrain: C_e = 0.5 (z/12.7)^0.5, at least 0.5 (R5 §1.2; reproduces the Commentary's 1.9 at 183 m). */
export const ceRough = (z: number) => Math.max(0.5, 0.5 * Math.sqrt(Math.max(0, z) / 12.7))
/** Reference mean wind speed from a velocity pressure in kPa (m/s). */
export const speedOf = (q: number) => Math.sqrt((2 * q * 1000) / RHO_AIR)
/** Davenport's peak factor over an hour at frequency f (recalled, unverified; 3.79 against the Commentary sample's 3.74). */
export function peakFactor(f: number, T = 3600): number {
  const L = Math.sqrt(2 * Math.log(Math.max(1.0001, f * T)))
  return L + 0.5772 / L
}

export interface AcrossWindInput { H: number; w: number; d: number; f: number; damping: number; density: number; q10?: number; gp?: number }
export interface AcrossWind { VH: number; gp: number; ar: number; a: number; g: number }

/** Peak across-wind acceleration at the top (m/s²), NBC Commentary I equation (7), R5 equations 8.1–8.5. */
export function acrossWindAccel(i: AcrossWindInput): AcrossWind {
  const VH = speedOf(i.q10 ?? Q10) * Math.sqrt(ceRough(i.H))
  const gp = i.gp ?? peakFactor(i.f)
  const s = Math.sqrt(i.w * i.d)
  const ar = 78.5e-3 * (VH / (i.f * s)) ** 3.3
  const a = (i.f ** 2 * gp * s * ar) / (i.density * G * Math.sqrt(i.damping))
  return { VH, gp, ar, a, g: a / G }
}

/**
 * Corner credit on across-wind response, from base-moment reductions in tests (R5 §4.3, table 8.7), linear from 1.0 at
 * b/B = 0 to the tested points and held at the b/B 0.10 value (no extrapolation). Rounded and recessed: Ke et al. 2022,
 * 318 m tower with surroundings (via R3, read in full). Chamfered: 0.8 is a team default (0.6 is the literature's best,
 * Kwok et al. 1988, b/B not given). Applying moment reductions to accelerations is an inference. Null: no credit.
 */
export function cornerReduction(kind: CornerKind | 'mixed' | 'none', bB: number): { R: number; basis: string } | null {
  const lerp = (x0: number, y0: number, x1: number, y1: number) => y0 + ((Math.min(bB, x1) - x0) * (y1 - y0)) / (x1 - x0)
  const at = (r05: number, r10: number) => (bB <= 0.05 ? lerp(0, 1, 0.05, r05) : lerp(0.05, r05, 0.1, r10))
  if (kind === 'rounded') return { R: at(0.85, 0.49), basis: 'rounded corners, Ke et al. 2022 (via research R3)' }
  if (kind === 'recessed') return { R: at(0.69, 0.58), basis: 'recessed corners, Ke et al. 2022 (via research R3)' }
  if (kind === 'chamfered') return { R: bB <= 0.05 ? lerp(0, 1, 0.05, 0.8) : 0.8, basis: 'chamfered corners, 0.8 a team default; Kwok et al. 1988 report up to 40%, b/B not given' }
  return null
}

/** Critical vortex-shedding speed V = f·B/St (Commentary I equation 6). */
export const vortexSpeed = (f: number, B: number, St: number) => (f * B) / St
