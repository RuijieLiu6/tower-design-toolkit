import { describe, expect, it } from 'vitest'
import { doyOfMd, periodDays, periodLabel, periodRange, presetOf } from './sunPeriod'

describe('sun study time period (Sun & Wind Studio From / To)', () => {
  it('reads MM-DD as a day of the year', () => {
    expect(doyOfMd('01-01')).toBe(1)
    expect(doyOfMd('03-21')).toBe(80)
    expect(doyOfMd('12-31')).toBe(365)
    expect(doyOfMd('02-29')).toBe(59)
  })
  it('counts days, wrapping over the new year', () => {
    expect(periodDays('01-01', '12-31')).toBe(365)
    expect(periodDays('03-18', '03-24')).toBe(7)
    expect(periodDays('12-01', '02-28')).toBe(90)
    expect(periodRange('12-01', '02-28')).toEqual({ d0: 335, d1: 59 })
  })
  it('names presets and custom ranges', () => {
    expect(presetOf('03-21', '03-21')?.name).toBe('Equinox day · 21 Mar')
    expect(periodLabel('01-01', '12-31')).toBe('Whole year')
    expect(periodLabel('03-18', '04-30')).toBe('18 Mar – 30 Apr')
    expect(periodLabel('07-04', '07-04')).toBe('4 Jul')
  })
})
