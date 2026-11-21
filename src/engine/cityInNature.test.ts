import { describe, expect, it } from 'vitest'
import { DEFAULT_NATURE, SOIL_RETAIN, cityInNature, detentionVolume, fourthStoreyTop, glazingBelow, isBinding, modelCanopy, plantedSoil, soilRetained, type NatureInput } from './cityInNature'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
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

// G41 (vtc-entry TOOL_DEFICITS, City in Nature review R4-9): retention stayed a typed number while the deck-use input
// records planted decks and their soil. Their soil storage now joins the reading, shown apart from the typed volume.
describe('G41: rain held in the soil of declared planted decks', () => {
  // 40 m square homes on a 60 m podium; the roof over the top storey (level 44) is the deck to declare.
  const tower = (deckUses?: Tower['deckUses']): Tower => ({ ...importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 40, f2f: 3.2, ring: rect(40, 40) }]), { podiumTop: 13.5, coreSide: 16 }), ...(deckUses ? { deckUses } : {}) })
  const ret = (t: Tower, typed: number | null = 300) => row(cityInNature({ ...DEFAULT_NATURE, retainedM3: typed }, SITE.area, null, { plantedSoil: plantedSoil([t]) }), 'retention')

  it('declaring a 450 mm planted roof raises the retention reading, shown apart from the typed volume', () => {
    const bare = ret(tower())
    expect(bare.value).toBe(`${Math.round((300 / SITE.area) * 1000)} mm`) // as before: the typed volume alone
    const decks = plantedSoil([tower([{ level: 44, use: 'planted', soilMm: 450 }])])
    expect(decks).toHaveLength(1)
    expect(decks[0]).toMatchObject({ level: 44, soilMm: 450, given: true })
    expect(decks[0].area).toBeCloseTo(1600, 0)
    const held = soilRetained(decks)
    expect(held.m3).toBeCloseTo(1600 * 0.45 * SOIL_RETAIN.value, 0) // 144 m³ at 0.2 mm of water per mm of soil
    const roof = ret(tower([{ level: 44, use: 'planted', soilMm: 450 }]))
    // 300 m³ typed over 11,468 m² is 26 mm; 144 m³ in the roof soil adds 12.6 mm
    expect(roof.value).toBe('39 mm: 26 mm typed + 13 mm held in deck soil')
    expect(parseFloat(roof.value)).toBeGreaterThan(parseFloat(bare.value))
    expect(roof.note).toMatch(/team assumption, to confirm/)
    expect(SOIL_RETAIN.flag).toBe('team_assumption')
    expect(SOIL_RETAIN.source).toMatch(/^Team assumption, to confirm/)
  })

  it('reads the soil alone when no volume is typed, and only decks the deck-use input calls planted', () => {
    const soilOnly = ret(tower([{ level: 44, use: 'planted', soilMm: 450 }]), null)
    expect(soilOnly.value).toMatch(/^\d+(\.\d)? mm: typed volume not entered \+ \d+(\.\d)? mm held in deck soil$/)
    expect(soilOnly.entered).toBe(false) // computed, not entered
    expect(soilOnly.state).toBe('warn') // a reference line: Check at worst
    expect(plantedSoil([tower([{ level: 44, use: 'occupied' }])])).toEqual([])
    // a planted deck without a depth takes the weight presets' soil (600 mm)
    expect(plantedSoil([tower([{ level: 44, use: 'planted' }])])[0]).toMatchObject({ soilMm: 600, given: false })
  })
})

// G12 (vtc-entry TOOL_DEFICITS, reviews R3-13 and R4-9): canopy and vegetated cover were typed numbers while the model
// holds trees (the ground wind study's porous trees) and planted decks. Each line now shows the modelled reading beside
// the typed one.
describe('G12: canopy and cover read from the model beside the typed values', () => {
  // 20 trees of 8 m crown on a 10 m grid: no crown overlaps another
  const grove = Array.from({ length: 20 }, (_, i) => ({ kind: 'tree', at: [(i % 5) * 10, Math.floor(i / 5) * 10], crown: 8, base: 2, top: 12 }))
  const canopyRow = (canopyM2: number | null, groundPorous?: { kind: string; at?: number[]; crown?: number }[]) =>
    row(cityInNature({ ...DEFAULT_NATURE, canopyM2 }, SITE.area, null, { groundPorous }), 'canopy')

  it('reads 20 trees of 8 m crown as 20 × π × 4² m² of canopy and uses it when nothing is typed', () => {
    const c = modelCanopy(grove)!
    expect(c.m2).toBeCloseTo(20 * Math.PI * 16, 6)
    expect(c.trees).toBe(20)
    const r = canopyRow(null, grove)
    expect(r.value).toBe(`${Math.round(((20 * Math.PI * 16) / SITE.area) * 1000) / 10}%: modelled 1,005 m² (typed not entered: the modelled value is used)`)
    expect(r.entered).toBe(false)
    expect(r.state).toBe('warn') // 8.8% under the Type C 10%: a target, Check at worst
    expect(r.note).toMatch(/simplification: overlapping crowns counted once/)
  })

  it('counts overlapping crowns once and says what the plain sum would be', () => {
    const two = [{ kind: 'tree', at: [0, 0], crown: 8 }, { kind: 'tree', at: [0, 0], crown: 8 }, { kind: 'screen' }]
    const c = modelCanopy(two)!
    expect(c.summed).toBeCloseTo(2 * Math.PI * 16, 6)
    expect(c.m2).toBeCloseTo(Math.PI * 16, 6)
    const half = modelCanopy([{ kind: 'tree', at: [0, 0], crown: 8 }, { kind: 'tree', at: [4, 0], crown: 8 }])!
    // two r = 4 circles 4 m apart: lens 2r² acos(d/2r) − (d/2)√(4r² − d²) = 19.65 m²
    expect(half.m2).toBeCloseTo(2 * Math.PI * 16 - (32 * Math.acos(0.5) - 2 * Math.sqrt(48)), 0)
    expect(canopyRow(null, two).note).toMatch(/added up whole they give 101 m²/)
  })

  it('a typed canopy far above the modelled one turns the line to Check with the difference', () => {
    const typedOnly = canopyRow(3000)
    expect(typedOnly.state).toBe('pass') // 26% on the typed figure alone
    const r = canopyRow(3000, grove)
    expect(r.state).toBe('warn')
    expect(r.value).toBe('26.2%: modelled 1,005 m² (typed 3,000 m²); typed is 1,995 m² above the model (+198%), Check')
    expect(r.entered).toBe(true)
    // within 10% of the model the typed figure judges as before, with the modelled one beside it
    const close = canopyRow(1050, grove)
    expect(close.value).toBe(`${Math.round((1050 / SITE.area) * 1000) / 10}%: modelled 1,005 m² (typed 1,050 m²)`)
    expect(close.value).not.toMatch(/Check/)
  })

  it('no trees and no typed value leave both lines as they were', () => {
    const before = run()
    for (const ctx of [{}, { groundPorous: [] }, { groundPorous: [{ kind: 'screen' }] }, { plantedSoil: [] }]) {
      const r = cityInNature(DEFAULT_NATURE, SITE.area, null, ctx)
      expect(row(r, 'canopy')).toEqual(row(before, 'canopy'))
      expect(row(r, 'cover')).toEqual(row(before, 'cover'))
    }
    expect(row(before, 'canopy').value).toBe('not entered')
    expect(row(before, 'cover').value).toBe('not entered')
    // a typed value with no trees in the model reads as before
    expect(canopyRow(3000, []).value).toBe(canopyRow(3000).value)
  })

  it('vegetated cover reads the planted decks plus typed ground planting', () => {
    const tower = (deckUses?: Tower['deckUses']): Tower => ({ ...importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 40, f2f: 3.2, ring: rect(40, 40) }]), { podiumTop: 13.5, coreSide: 16 }), ...(deckUses ? { deckUses } : {}) })
    const decks = plantedSoil([tower([{ level: 44, use: 'planted', soilMm: 450 }])])
    const cover = (vegetatedM2: number | null, groundPlantedM2?: number) => row(cityInNature({ ...DEFAULT_NATURE, vegetatedM2 }, SITE.area, null, { plantedSoil: decks, groundPlantedM2 }), 'cover')
    const modelOnly = cover(null, 400) // 1,600 m² roof + 400 m² at grade
    expect(modelOnly.value).toBe(`${Math.round((2000 / SITE.area) * 1000) / 10}%: modelled 2,000 m² (typed not entered: the modelled value is used)`)
    expect(modelOnly.entered).toBe(false)
    expect(modelOnly.note).toMatch(/L44 1,600 m².*400 m² of planting at grade, typed/)
    expect(cover(2100, 400).state).toBe('unknown') // within 10%: Type C has no reference line, as before
    const far = cover(5000)
    expect(far.value).toMatch(/modelled 1,600 m² \(typed 5,000 m²\); typed is 3,400 m² above the model \(\+213%\), Check$/)
    expect(far.state).toBe('warn')
  })
})
