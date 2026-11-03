import { afterEach, describe, expect, it } from 'vitest'
import { CASES, runCase } from '../eval/cases'
import { sectionDrawing } from '../engine/drawings'
import { demoDesign } from './demo'
import {
  areaFromM2, areaToM2, convertText, formatArea, formatLength, fromMetres, inputValue, LENGTH_UNITS, M2_PER_FT2, normalizeUnit, setUnit, toMetres, useUnits,
} from './units'

afterEach(() => useUnits.setState({ unit: 'm' }))

describe('round trips', () => {
  const values = [0, 0.001, 0.3048, 1, 3.2, 12.75, 46, 126.37, 244, 285, 300, 304.8, 1000.5, 5458589.7]

  it('converts lengths and areas back to the same metres', () => {
    for (const u of LENGTH_UNITS) for (const m of values) expect(toMetres(fromMetres(m, u), u)).toBeCloseTo(m, 9)
    for (const u of LENGTH_UNITS) for (const a of [0, 1, 455, 2116, 11468]) expect(areaToM2(areaFromM2(a, u), u)).toBeCloseTo(a, 9)
    expect(fromMetres(0.3048, 'ft')).toBe(1)
    expect(areaFromM2(M2_PER_FT2, 'ft')).toBe(1)
  })

  it('never drifts when an input shows a value and it is read back, again and again', () => {
    for (const u of LENGTH_UNITS) for (const m0 of values) {
      let m = m0
      for (let i = 0; i < 100; i++) m = toMetres(inputValue(m, u), u)
      expect(Math.abs(m - m0)).toBeLessThan(1e-9 * Math.max(1, m0))
    }
  })

  it('falls back to metres for an unknown stored unit', () => {
    expect(normalizeUnit('ft')).toBe('ft')
    expect(normalizeUnit('yards')).toBe('m')
    expect(normalizeUnit(null)).toBe('m')
  })
})

describe('formatting', () => {
  it('formats lengths and areas in each unit', () => {
    expect(formatLength(300, 'm')).toBe('300.00 m')
    expect(formatLength(300, 'ft')).toBe('984.25 ft')
    expect(formatLength(300, 'mm')).toBe('300,000 mm')
    expect(formatLength(300, 'ft', 0)).toBe('984 ft')
    expect(formatArea(455, 'm')).toBe('455 m²')
    expect(formatArea(455, 'ft')).toBe('4,898 ft²')
    expect(formatArea(455, 'mm')).toBe('455 m²') // areas stay in m² in millimetre mode
    expect(formatLength(NaN, 'ft')).toBe('—')
  })

  it('rewrites engine text, keeping each number\'s precision', () => {
    expect(convertText('300.0 m · needs 244–305 m (800–1000 ft)', 'ft')).toBe('984.3 ft · needs 801–1,001 ft (800–1000 ft)')
    expect(convertText('2 stairs × 1,426 mm, both in the core', 'ft')).toBe('2 stairs × 4.68 ft, both in the core')
    expect(convertText('core 455 m² of a 2,116 m² plate', 'ft')).toBe('core 4,898 ft² of a 22,776 ft² plate')
    expect(convertText('4.6 m²/person', 'ft')).toBe('49.5 ft²/person')
    expect(convertText('lease depth 12.0 m', 'mm')).toBe('lease depth 12,000 mm')
    expect(convertText('core 455 m², stair 1,426 mm', 'mm')).toBe('core 455 m², stair 1,426 mm')
    expect(convertText('offset −5.0 m', 'ft')).toBe('offset −16.4 ft')
    expect(convertText('79.2 m × 144.8 m', 'ft')).toBe('259.8 ft × 475.1 ft')
  })

  it('leaves rates, speeds, volumes, times and kilometres alone', () => {
    const keep = '$7,000/m² · 3.5 m/s · 438 m³ · 10 min · within 6 km · kg/m² · value per m²'
    expect(convertText(keep, 'ft')).toBe(keep)
    expect(convertText(keep, 'mm')).toBe(keep)
  })

  it('shows metre mode exactly as written', () => {
    const s = '300.0 m · 1,426 mm · 455 m² · 4.6 m²/person'
    expect(convertText(s, 'm')).toBe(s)
  })
})

describe('the viewer\'s choice', () => {
  it('is kept in the store (and in this browser when storage exists)', () => {
    setUnit('ft')
    expect(useUnits.getState().unit).toBe('ft')
    setUnit('m')
    expect(useUnits.getState().unit).toBe('m')
  })

  it('does not change any evaluation result: engines work in metres whatever is shown', async () => {
    const run = async () => Promise.all(CASES.map(async (c) => { const r = await runCase(c); return { id: r.id, observed: r.observed, pass: r.pass } }))
    const results = []
    for (const u of LENGTH_UNITS) { setUnit(u); results.push(JSON.stringify(await run())) }
    expect(results[1]).toBe(results[0])
    expect(results[2]).toBe(results[0])
  }, 60_000)
})

describe('drawings', () => {
  const t = demoDesign().towers.vtc[0]
  const base = { northDeg: 45, projectLabel: 'Competition site', date: '2026-11-03' }

  it('draws a feet scale bar and labels in feet, and keeps the paper size in millimetres', () => {
    const sheet = sectionDrawing(t, { ...base, mode: 'sheet', unit: 'ft' }).svg
    expect(sheet).toMatch(/>ft<\/text>/)
    expect(sheet).toContain('at A2 (594 × 420 mm)')
    expect(sheet).not.toMatch(/>[^<]*\d m<\/text>/) // no label left in metres
    const tight = sectionDrawing(t, { ...base, mode: 'tight', unit: 'ft' }).svg
    expect(tight).toContain('Scale bar in feet')
  })

  it('draws exactly as before in metres (the default)', () => {
    expect(sectionDrawing(t, { ...base, mode: 'sheet', unit: 'm' }).svg).toBe(sectionDrawing(t, { ...base, mode: 'sheet' }).svg)
  })
})
