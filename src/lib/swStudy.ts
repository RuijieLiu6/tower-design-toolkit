// Settings shared by the Sun & Wind Studio tools (Sinnie, 13 Nov: "make new tools … one for each tool that exists in
// the sun wind studio … broken again to several smaller ones, including daylight analysis"). One store so the tools that
// read the same thing (the study date, the period, the wind, the daylight target) agree, as the Studio's tabs do.
import { create } from 'zustand'
import type { SunDate, SunPeriod } from '../engine/sw/sun'
import type { Season } from '../engine/sw/wind'

export type VentMode = 'cross' | 'single' | 'stack'
export type ThermalSystem = 'none' | 'win' | 'heat' | 'heatwin' | 'full'

export interface SwStudySettings {
  /** Shadow study: one day (date + hours) or a season of clear and cloudy days. */
  sunScope: 'date' | 'period'
  sunDate: SunDate
  sunPeriod: SunPeriod
  h0: number
  h1: number
  /** Wind studies: season of the airport record. */
  season: Season
  /** Daylight: lux target, blinds operated as LM-83 (off = blinds up, Sinnie's choice in the Studio). */
  dlTarget: number
  blinds: boolean
  /** Light at this hour and indoor temperature: month (0-11), day, hour. */
  month: number
  day: number
  hour: number
  /** Interior studies: the floor drawn (1 = lowest above grade); null = the Studio's default (55% up). */
  level: number | null
  /** Natural ventilation (the Studio's SW.vent). */
  vent: { mode: VentMode; band: 'fixed' | 'adaptive'; tmin: number; tmax: number; umax: number; open: number; dT: number }
  /** Photovoltaics (SW.pv): share of roof covered, module efficiency, performance ratio. */
  pv: { roof: number; eff: number; pr: number }
  /** Indoor temperature: what conditions the floor. */
  system: ThermalSystem
  /** Rain: run-off efficiency of the roof catchment. */
  rainEff: number
}

export const SW_DEFAULTS: SwStudySettings = {
  sunScope: 'date', sunDate: 'autumn', sunPeriod: 'year', h0: 10, h1: 16,
  season: 'year',
  dlTarget: 300, blinds: false,
  month: 5, day: 21, hour: 13, level: null,
  vent: { mode: 'cross', band: 'fixed', tmin: 12, tmax: 24, umax: 8, open: 0.1, dT: 3 },
  pv: { roof: 0.5, eff: 0.2, pr: 0.8 },
  system: 'heatwin',
  rainEff: 0.8,
}

const KEY = 'tdt.swStudy'
const read = (): SwStudySettings => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SwStudySettings> | null
    return v && typeof v === 'object' ? { ...SW_DEFAULTS, ...v, vent: { ...SW_DEFAULTS.vent, ...(v.vent ?? {}) }, pv: { ...SW_DEFAULTS.pv, ...(v.pv ?? {}) } } : SW_DEFAULTS
  } catch { return SW_DEFAULTS }
}

interface SwStudyState extends SwStudySettings { set: (p: Partial<SwStudySettings>) => void; reset: () => void }

export const useSwStudy = create<SwStudyState>((set, get) => ({
  ...(typeof window !== 'undefined' ? read() : SW_DEFAULTS),
  set: (p) => {
    set(p)
    const { set: _s, reset: _r, ...rest } = { ...get(), ...p } // eslint-disable-line @typescript-eslint/no-unused-vars
    try { localStorage.setItem(KEY, JSON.stringify(rest)) } catch { /* this visit only */ }
  },
  reset: () => { set(SW_DEFAULTS); try { localStorage.removeItem(KEY) } catch { /* nothing kept */ } },
}))

/** Day of year of a month (0-11) and day. */
export function doyOf(month: number, day: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let n = 0
  for (let i = 0; i < month; i++) n += days[i]
  return n + day
}

/** The floor an interior study draws: the chosen level, else 55% up the tower (the Studio's planLevel). */
export function studyLevel(levels: number, chosen: number | null): number {
  const L = chosen ?? Math.round(levels * 0.55)
  return Math.max(1, Math.min(levels, L))
}
