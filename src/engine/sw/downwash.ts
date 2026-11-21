// Wind brought down the face (the Sun & Wind "Downwash" line, gap G40, proposal T20). The mean wind at 0.7 H is what a
// tall face sends down to the street (study.js). Read from the height alone, every tower in the brief's 244–305 m band
// failed it whatever its base, so the line now also reads what catches the downwash before the street, as the
// massing screen does: the podium step toward the strong-wind sectors (engine/windScreen.ts, the same reading) and a
// canopy around the base (the wind comfort node's canopy depth). Each takes a share off the brought-down speed by a
// labelled team factor; with neither, the value is the height-only reading as before. A screening value: only a
// wind-tunnel study by a wind engineer clears a tall tower's base.
import type { Tower } from '../types'
import { DEFAULT_WIND_SCREEN, podiumStepsToward, YVR_ROSE, type WindRose, type WindScreenPresets } from '../windScreen'
import { ALPHA } from './wind'

/**
 * Team factors (21 Nov 2026, gap G40; unverified, to calibrate with a wind tunnel or CFD). A podium step toward a
 * strong-wind sector takes up to `podiumMax` off the brought-down speed, in full at `podiumFull` m of podium beyond the
 * face (the wind fixes ask for a podium reaching 10 m or more), nothing below the screen's minimum step (3 m); each
 * sector weighs by its share of the strong-wind hours. A canopy takes up to `canopyMax`, in full at `canopyFull` m deep
 * (Sinnie Choi's wind engine reaches its full canopy effect at 6 m). The two multiply.
 */
export const DOWNWASH_TEAM = { podiumMax: 0.4, podiumFull: 10, canopyMax: 0.2, canopyFull: 6 } as const
export const DOWNWASH_FACTOR_LABEL = 'team factor (G40, unverified): a podium step toward the strong winds takes up to 40% off (in full at 10 m), a canopy up to 20% (in full at 6 m)'

export interface DownwashSector { sector: string; share: number; step: number; relief: number }
export interface DownwashReading {
  /** The height-only reading: the mean wind at 0.7 H (m/s). */
  raw: number
  /** After the podium step and the canopy (m/s). */
  value: number
  /** value ÷ raw. */
  factor: number
  podiumRelief: number
  canopyRelief: number
  canopy: number
  sectors: DownwashSector[]
}

/** The brought-down speed for the tallest tower `t` of height H at reference wind U10, with its podium step and a canopy. */
export function downwashReading(t: Tower | undefined, H: number, U10: number, o: { north: number; canopy?: number }, p: WindScreenPresets = DEFAULT_WIND_SCREEN, rose: WindRose = YVR_ROSE): DownwashReading {
  const raw = H > 0 ? U10 * Math.pow(Math.max(10, H * 0.7) / 10, ALPHA) : 0
  const sectors: DownwashSector[] = t ? podiumStepsToward(t, o.north, p, rose).map((s) => ({ ...s, relief: s.step >= p.podiumStepMin ? DOWNWASH_TEAM.podiumMax * Math.min(1, s.step / DOWNWASH_TEAM.podiumFull) : 0 })) : []
  const total = sectors.reduce((a, s) => a + s.share, 0)
  const podiumRelief = total > 0 ? sectors.reduce((a, s) => a + s.share * s.relief, 0) / total : 0
  const canopy = Math.max(0, o.canopy ?? 0)
  const canopyRelief = DOWNWASH_TEAM.canopyMax * Math.min(1, canopy / DOWNWASH_TEAM.canopyFull)
  const factor = (1 - podiumRelief) * (1 - canopyRelief)
  return { raw, value: raw * factor, factor, podiumRelief, canopyRelief, canopy, sectors }
}

/** What the reading took off, in words, or '' when nothing did. */
export function downwashReliefText(r: DownwashReading): string {
  const parts: string[] = []
  if (r.podiumRelief > 0) parts.push(`podium step toward the strong winds ${r.sectors.map((s) => `${s.sector} ${s.step.toFixed(1)} m`).join(', ')}: −${Math.round(r.podiumRelief * 100)}%`)
  if (r.canopyRelief > 0) parts.push(`canopy ${r.canopy.toFixed(1)} m deep: −${Math.round(r.canopyRelief * 100)}%`)
  return parts.join('; ')
}
