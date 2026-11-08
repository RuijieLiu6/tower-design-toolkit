import { describe, expect, it } from 'vitest'
import { mapTexels, HOURS_RAMP, LOSS_RAMP } from '../components/solarRamps'
import { RAMP } from '../components/energyRamp'
import { USES } from '../engine/types'
import type { SunHours } from '../engine/solarRules'
import { BUILDING_USES, contrast, luminance, useColor } from './buildingUse'
import { DATA, MODEL, PHASE_COLOR } from './design/tokens'
import {
  ANALYSIS_LAYERS, DISPLAY_MODES, LOSS_SIDE, SEQUENTIAL, activeLayer, cityStyleFor, layerOfNode, modeColours, modeFromCityStyle, modeSupport,
  rampColour, shownMode, ticks, type DisplayMode,
} from './displayMode'

const MODES = DISPLAY_MODES.map((m) => m.id)

describe('display modes (design system §9)', () => {
  it('offers Massing, Program, Analysis and Materials, each saying what it shows', () => {
    expect(MODES).toEqual(['massing', 'program', 'analysis', 'materials'])
    for (const m of DISPLAY_MODES) expect(m.hint.length).toBeGreaterThan(20)
  })

  it('colours the model by mode: neutral massing, uses in Program, one analytical layer only in Analysis', () => {
    expect(modeColours('massing')).toEqual({ tower: 'neutral', context: 'neutral', analysis: false })
    expect(modeColours('program')).toEqual({ tower: 'use', context: 'use', analysis: false })
    expect(modeColours('analysis')).toEqual({ tower: 'neutral', context: 'neutral', analysis: true })
    expect(modeColours('materials')).toEqual({ tower: 'neutral', context: 'materials', analysis: false })
  })

  it('never fakes materials: the competition model has none, so it shows Massing and says why', () => {
    expect(modeSupport('materials', 'city').ok).toBe(true)
    const vtc = modeSupport('materials', 'vtc')
    expect(vtc.ok).toBe(false)
    if (!vtc.ok) expect(vtc.why).toMatch(/no material/i)
    for (const m of ['massing', 'program', 'analysis'] as DisplayMode[]) expect(modeSupport(m, 'vtc').ok).toBe(true)
    expect(shownMode('materials', 'vtc')).toBe('massing')
    expect(shownMode('materials', 'city')).toBe('materials')
  })

  it('keeps Real Vancouver’s Plain / Context style and “Colour buildings by type” in step, both ways, without loops', () => {
    for (const m of MODES) {
      const { style, typeColours } = cityStyleFor(m)
      // Applying a mode to the old switches and reading them back gives the same mode (no ping-pong).
      expect(modeFromCityStyle(m, style, typeColours)).toBe(m)
    }
    expect(modeFromCityStyle('massing', 'context', false)).toBe('materials')
    expect(modeFromCityStyle('materials', 'plain', false)).toBe('massing')
    expect(modeFromCityStyle('materials', 'plain', true)).toBe('program')
    expect(modeFromCityStyle('massing', 'plain', true)).toBe('program')
    expect(modeFromCityStyle('program', 'plain', false)).toBe('massing')
    expect(modeFromCityStyle('analysis', 'plain', false)).toBe('analysis')
  })

  it('shows one analytical layer: the one asked for while its check runs, else the first that runs', () => {
    const runs = (on: string[]) => (node: string) => on.includes(node)
    expect(layerOfNode('built.solar-access')).toBe('solar')
    expect(layerOfNode('built.energy-carbon')).toBe('surface-sun')
    expect(layerOfNode('built.wind-screen')).toBe('wind')
    expect(layerOfNode('built.fsr')).toBeNull()
    expect(activeLayer('wind', runs(['built.solar-access', 'built.wind-screen']))).toBe('wind')
    expect(activeLayer('wind', runs(['built.solar-access']))).toBe('solar')
    expect(activeLayer(null, runs(['built.energy-carbon']))).toBe('surface-sun')
    expect(activeLayer('solar', runs([]))).toBeNull()
    expect(new Set(ANALYSIS_LAYERS.map((l) => l.node)).size).toBe(ANALYSIS_LAYERS.length)
  })
})

describe('the neutral model and the selection', () => {
  it('draws the proposal lighter than the context, with edges that read on both', () => {
    expect(luminance(MODEL.proposed)).toBeGreaterThan(luminance(MODEL.context))
    expect(contrast(MODEL.edge, MODEL.proposed)).toBeGreaterThanOrEqual(3)
    expect(contrast(MODEL.edge, MODEL.context)).toBeGreaterThanOrEqual(2)
  })

  it('outlines the selection in blue on a white keyline, so it reads on the light model and on dark data colours', () => {
    expect(contrast(MODEL.selected, MODEL.keyline)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(MODEL.keyline, DATA.sequential[DATA.sequential.length - 1])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(MODEL.selected, MODEL.background)).toBeGreaterThanOrEqual(3)
  })
})

describe('building uses: one labelled categorical palette', () => {
  it('takes every use colour from the categorical data palette, one each, never a workflow phase colour', () => {
    const colours = Object.values(USES).map((u) => u.color)
    for (const c of colours) expect(DATA.categorical as readonly string[]).toContain(c)
    expect(new Set(colours).size).toBe(colours.length)
    const phases = Object.values(PHASE_COLOR).flatMap((p) => [p.accent, ...p.tones])
    for (const c of colours) expect(phases).not.toContain(c)
  })

  it('draws an unknown building type as missing data (a neutral grey near the context), not as a kind', () => {
    expect(BUILDING_USES.find((u) => u.id === 'other')!.base).toBe(DATA.missing)
    expect(contrast(useColor('other'), MODEL.context)).toBeLessThan(1.15)
  })
})

describe('analytical scales', () => {
  it('interpolates in sRGB and clamps to the ends', () => {
    expect(rampColour(['#000000', '#ffffff'], 0.5).map((v) => Math.round(v * 255))).toEqual([128, 128, 128])
    expect(rampColour(['#000000', '#ffffff'], -1)).toEqual([0, 0, 0])
    expect(rampColour(['#000000', '#ffffff'], 7)).toEqual([1, 1, 1])
    expect(rampColour(['#000000', '#ffffff'], Number.NaN)).toEqual([0, 0, 0])
  })

  it('uses the sequential scale for sun hours and sun on surfaces, light to dark', () => {
    expect(HOURS_RAMP).toEqual([...SEQUENTIAL])
    expect(RAMP).toEqual([...SEQUENTIAL])
    for (let i = 1; i < SEQUENTIAL.length; i++) expect(luminance(SEQUENTIAL[i])).toBeLessThan(luminance(SEQUENTIAL[i - 1]))
  })

  it('draws hours lost on the diverging scale from its neutral middle (no change) to its dark end', () => {
    expect(LOSS_RAMP).toEqual([...LOSS_SIDE])
    expect(LOSS_SIDE[0]).toBe(DATA.diverging[(DATA.diverging.length - 1) / 2])
    expect(LOSS_SIDE[LOSS_SIDE.length - 1]).toBe(DATA.diverging[0])
  })

  it('states every legend’s range in ticks that include both ends', () => {
    expect(ticks(0, 6)).toEqual([0, 2, 4, 6])
    expect(ticks(350, 1150)).toEqual([350, 600, 800, 1150])
    expect(ticks(0, 3)).toEqual([0, 1, 2, 3])
    expect(ticks(0, 4.5)[0]).toBe(0)
    expect(ticks(0, 4.5).at(-1)).toBe(4.5)
    expect(ticks(5, 5)).toEqual([5])
  })

  it('maps sun hours with missing cells hatched apart from zero, and zero loss drawn as no change', () => {
    // 3 × 2 cells: one under a building (missing), one in full shade (0 h), the rest in sun; the design takes 2 h from one.
    const m = {
      grid: { nx: 3, ny: 2, x0: 0, y0: 0, cell: 5 }, possible: 6,
      proposal: Float32Array.from([0, 6, 6, 4, 6, 6]), baseline: Float32Array.from([0, 6, 6, 6, 6, 6]),
      covered: Uint8Array.from([0, 0, 0, 0, 0, 1]),
    } as unknown as SunHours
    const px = (d: Uint8Array, k: number) => [...d.slice(k * 4, k * 4 + 4)]
    const hours = mapTexels(m, 'hours')
    const zero = px(hours, 0)
    expect(zero.slice(0, 3)).toEqual(rampColour(SEQUENTIAL, 0).map((v) => Math.round(v * 255)))
    expect(zero[3]).toBeGreaterThan(0)
    // Cell 5 (i 2, j 1) is covered and on a hatch stripe: the missing grey, never the zero colour.
    const miss = px(hours, 5)
    expect(miss.slice(0, 3)).toEqual([0x9a, 0xa3, 0xaf])
    expect(miss.slice(0, 3)).not.toEqual(zero.slice(0, 3))
    const loss = mapTexels(m, 'loss')
    // No change is drawn (the neutral middle, opaque enough to see), not left blank like a gap in the data.
    expect(px(loss, 1).slice(0, 3)).toEqual(rampColour(LOSS_SIDE, 0).map((v) => Math.round(v * 255)))
    expect(px(loss, 1)[3]).toBeGreaterThan(100)
    // The 2 h the design takes away sits two thirds along the losing side.
    expect(px(loss, 3).slice(0, 3)).toEqual(rampColour(LOSS_SIDE, 2 / 3).map((v) => Math.round(v * 255)))
  })
})
