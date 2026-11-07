import { describe, expect, it } from 'vitest'
import { DEFAULT_NATURE, cityInNature, detentionVolume, fourthStoreyTop, glazingBelow, isBinding, type NatureInput } from './cityInNature'
import { SITE } from './vtcRules'

const run = (patch: Partial<NatureInput> = {}, site: number | null = SITE.area, cones: string[] | null = null) => cityInNature({ ...DEFAULT_NATURE, ...patch }, site, cones)
const row = (r: ReturnType<typeof run>, id: string) => r.rows.find((x) => x.id === id)!

describe('City in Nature ledger (P05-M01)', () => {
  it('is a ledger, not a score: nothing is judged until entered, and there is no composite', () => {
    const r = run()
    expect(r).not.toHaveProperty('score')
    expect(r.binding).toEqual({ passed: 0, failed: 0, open: 6, total: 6 }) // + detention, first stage, indoor and outdoor water (P05-M04)
    expect(row(r, 'canopy').state).toBe('unknown')
    expect(row(r, 'eds-eligible').state).toBe('pass') // 11,468 m² ≥ 8,000 m², computed
    expect(r.coverage).toEqual({ '4.1': false, '4.2': false, '4.3': false, '4.4': true })
  })
  it('only by-law and rezoning requirements can fail; reference lines say Check at worst', () => {
    const r = run({ canopyM2: 500, retainedM3: 100, birdTreatedPct: 20, habitatAssessment: false, engineeredRainwater: false })
    for (const x of r.rows) if (!isBinding(x.force)) expect(x.state).not.toBe('fail')
    expect(row(r, 'canopy').state).toBe('warn')
    expect(row(r, 'retention').state).toBe('warn')
    expect(row(r, 'bird').state).toBe('warn')
    expect(row(r, 'habitat').state).toBe('fail')
    expect(row(r, 'rain-pathway').state).toBe('fail')
    expect(r.binding.failed).toBe(2)
  })
  it('computes shares of the site and moves the canopy line with the R019 site type', () => {
    const c = run({ canopyM2: 1500 })
    expect(row(c, 'canopy').value).toBe('13.1%')
    expect(row(c, 'canopy').state).toBe('pass')
    expect(row(run({ canopyM2: 1500, siteType: 'B' }), 'canopy').state).toBe('warn')
    expect(row(run({ canopyM2: 1500, siteType: 'A' }), 'canopy').note).toMatch(/22% minimum/)
    expect(row(run({ retainedM3: 600 }), 'retention').value).toBe('52 mm')
    expect(row(run({ vegetatedM2: 5000 }), 'cover').state).toBe('unknown') // Type C has no cover line
    expect(row(run({ vegetatedM2: 5000, siteType: 'B' }), 'cover').state).toBe('pass')
  })
  it('treats entering the QE Park view as a pathway with a checklist, and keeps the corrected false assumption', () => {
    const r = run({ entersQEView: true })
    expect(row(r, 'qe-view').state).toBe('warn')
    expect(row(r, 'eds-criteria').state).toBe('warn')
    expect(row(run({ entersQEView: true, pvg34: { lions: true, openSpaceCanopy: true, undrip: true } }), 'eds-criteria').state).toBe('pass')
    const qe = r.falseAssumptions.find((f) => /failure/.test(f.claim))!
    expect(qe.source.page).toMatch(/p\.9/)
  })
  it('in Real Vancouver: no site area, views from the cone results, a cone entry is Check not Fail', () => {
    const r = run({ canopyM2: 1000 }, null, ['above', 'clear'])
    expect(row(r, 'canopy').value).toBe('needs a site area')
    expect(row(r, 'eds-eligible').state).toBe('unknown')
    expect(row(r, 'views').state).toBe('warn')
    expect(row(run({}, null, ['clear']), 'views').state).toBe('pass')
    expect(row(run({}, null, ['limit_unknown']), 'views').state).toBe('unknown')
  })
  it('counts a written note as coverage of an ODP direction', () => {
    expect(run({ notes: { '4.1': 'Rain garden along the lane.' } }).coverage['4.1']).toBe(true)
  })
  it('gives every row a source and a flag, for the evidence report', () => {
    for (const x of run().rules) { expect(x.source.label.length).toBeGreaterThan(10); expect(x.flag).toBeTruthy() }
  })
})

describe('rainwater and bird-friendly glazing (P05-M04, P05-M05)', () => {
  it('reproduces the By-law example and sizes the competition block', () => {
    expect(detentionVolume(2500, 0.75).V).toBeCloseTo(58.1, 0)
    expect(detentionVolume(11468, 0.95).V).toBeGreaterThan(420) // research: about 440 m³ at C 0.95
    expect(detentionVolume(11468, 0.61).V).toBeLessThan(190) // research: about 170 m³ at C 0.61
    expect(detentionVolume(10000, 0.95).QoLs).toBeCloseTo(25)
    expect(row(run(), 'rain-detention').value).toMatch(/about 4\d\d m³/)
    expect(row(run({ vegetatedM2: 4000 }), 'rain-detention').value).toMatch(/C 0\.79/)
    expect(row(run(), 'rain-first-stage').value).toMatch(/172 m³/) // 15 mm × 11,468 m²
    expect(row(run({}, null), 'rain-detention').value).toBe('needs a site area')
    expect(row(run({ vegetatedM2: 1000 }), 'rain-outdoor-water').value).toMatch(/120,000 L\/month/)
    expect(row(run(), 'rain-detention').force).toBe('bylaw_requirement')
  })
  it('measures Vancouver’s bird zone from the storeys and the facade glazing', () => {
    expect(fourthStoreyTop([[{ z1: 4.5 }, { z1: 9 }, { z1: 13.5 }, { z1: 18 }, { z1: 22 }]])).toBe(18)
    expect(fourthStoreyTop([])).toBeNull()
    const faces = [{ z0: 0, z1: 18, length: 100, wwr: 0.5 }, { z0: 18, z1: 300, length: 46, wwr: 0.6 }]
    expect(glazingBelow(faces, 12)).toBe(600)
    const r = cityInNature({ ...DEFAULT_NATURE, birdTreatedPct: 85 }, SITE.area, null, { fourthStoreyTop: 18, faces })
    expect(row(r, 'bird-zone').value).toMatch(/900 m² of glazing, 135 m² untreated/)
    expect(row(r, 'bird-zone').state).toBe('warn')
    expect(row(run(), 'bird-zone').state).toBe('unknown')
    expect(row(run(), 'bird-markers').threshold).toMatch(/5 cm vertically OR 10 cm horizontally/)
  })
  it('keeps the corrected readings visible', () => {
    const claims = run().falseAssumptions.map((f) => f.claim).join(' ')
    expect(claims).toMatch(/48 mm/)
    expect(claims).toMatch(/AND 10 cm/)
    expect(claims).toMatch(/0–1 m/)
  })
})

describe('one treated share for City in Nature and the Facade node (node audit, 7 Nov)', () => {
  it('reads the Facade node’s share when the ledger’s own is not entered, and says so', () => {
    const bird = (patch: Partial<NatureInput>, facadeTreated: number | null) => cityInNature({ ...DEFAULT_NATURE, ...patch }, SITE.area, null, { facadeTreated }).rows.find((r) => r.id === 'bird')!
    expect(bird({}, 0.9)).toMatchObject({ value: '90%', state: 'pass' })
    expect(bird({}, 0.9).note).toMatch(/^From the Facade node/)
    expect(bird({ birdTreatedPct: 50 }, 0.9)).toMatchObject({ value: '50%' })
    expect(bird({ birdTreatedPct: 50 }, 0.9).note).not.toMatch(/Facade node/)
    expect(bird({}, null).value).toBe('not entered')
  })
})

describe('the QE Park view answered by the view-cone check on Real Vancouver (node audit, 7 Nov)', () => {
  const qe = (patch: Partial<NatureInput>, qeFromCones: boolean | null | undefined) => cityInNature({ ...DEFAULT_NATURE, ...patch }, 11225, null, { qeFromCones }).rows.find((r) => r.id === 'qe-view')!
  it('uses the cones when the ledger is not answered, and keeps a typed answer', () => {
    expect(qe({}, true)).toMatchObject({ value: 'enters, via the Higher Buildings pathway', state: 'warn' })
    expect(qe({}, true).note).toMatch(/View-cone height check/)
    expect(qe({}, false)).toMatchObject({ value: 'stays clear', state: 'pass' })
    expect(qe({}, null)).toMatchObject({ value: 'not answered', state: 'unknown' })
    expect(qe({}, undefined)).toMatchObject({ value: 'not answered' })
    expect(qe({ entersQEView: false }, true)).toMatchObject({ value: 'stays clear' })
  })
  it('says what to do when the tower enters the view', async () => {
    const { fixFor } = await import('../lib/fixes')
    expect(fixFor('qe-view', 'warn', 'enters, via the Higher Buildings pathway')).toMatch(/pathway, not a failure/)
  })
})
