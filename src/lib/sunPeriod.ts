// The time period of the sun studies, as Sun & Wind Studio's Sun tab sets it (study.js PERIOD_PRESETS, period-note):
// preset chips, a From / To day ('MM-DD', any year; To before From wraps over the new year), and a one-line note with
// the days, the sunshine hours (CWEC hours with direct sun, DNI ≥ 120 W/m², the WMO definition) and where the wind
// mostly comes from (8 sectors, calm hours under 0.5 m/s left out).
import type { ClimatePayload } from '../engine/sw/types'

export const PERIOD_PRESETS: { name: string; from: string; to: string }[] = [
  { name: 'Whole year', from: '01-01', to: '12-31' },
  { name: 'Winter · Dec–Feb', from: '12-01', to: '02-28' },
  { name: 'Spring · Mar–May', from: '03-01', to: '05-31' },
  { name: 'Summer · Jun–Aug', from: '06-01', to: '08-31' },
  { name: 'Fall · Sep–Nov', from: '09-01', to: '11-30' },
  { name: 'Equinox day · 21 Mar', from: '03-21', to: '03-21' },
  { name: 'Equinox week', from: '03-18', to: '03-24' },
]

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Day of year (1-365) of 'MM-DD'; 29 Feb reads as 28 Feb. Bad input reads as 1 Jan. */
export function doyOfMd(md: string): number {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(md)
  if (!m) return 1
  const mo = Math.min(12, Math.max(1, Number(m[1]))) - 1, d = Math.min(DAYS[mo], Math.max(1, Number(m[2])))
  let n = 0
  for (let i = 0; i < mo; i++) n += DAYS[i]
  return n + d
}

export const periodRange = (from: string, to: string) => ({ d0: doyOfMd(from), d1: doyOfMd(to) })
export const periodDays = (from: string, to: string) => { const { d0, d1 } = periodRange(from, to); return d1 >= d0 ? d1 - d0 + 1 : 365 - d0 + 1 + d1 }
export const presetOf = (from: string, to: string) => PERIOD_PRESETS.find((p) => p.from === from && p.to === to) ?? null

const md = (s: string) => { const d = doyOfMd(s); let m = 0, n = d; while (n > DAYS[m]) { n -= DAYS[m]; m++ } return `${n} ${MON[m]}` }
/** The period as a person reads it: the preset's name, else "18 Mar – 24 Mar". */
export function periodLabel(from: string, to: string): string {
  const p = presetOf(from, to)
  if (p) return p.name
  return from === to ? md(from) : `${md(from)} – ${md(to)}`
}

const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export interface PeriodInfo { days: number; sunHours: number; wind: { name: string; share: number }[] }
/** Days, sunshine hours and the two main wind directions of the period, from the hourly record. */
export function periodInfo(from: string, to: string, C: ClimatePayload | null | undefined): PeriodInfo {
  const { d0 } = periodRange(from, to), days = periodDays(from, to)
  if (!C) return { days, sunHours: 0, wind: [] }
  const h = C.hourly, count = new Array(8).fill(0)
  let sun = 0, windy = 0
  for (let i = 0; i < days; i++) {
    const doy = ((d0 - 1 + i) % 365) + 1
    for (let q = 0; q < 24; q++) {
      const k = (doy - 1) * 24 + q
      if (h.dni[k] >= 120) sun++
      if (h.ws[k] >= 0.5) { count[Math.round((((h.wd[k] % 360) + 360) % 360) / 45) % 8]++; windy++ }
    }
  }
  const wind = count.map((n, i) => ({ name: SECTORS[i], share: windy ? n / windy : 0 })).sort((a, b) => b.share - a.share).slice(0, 2)
  return { days, sunHours: sun, wind }
}
