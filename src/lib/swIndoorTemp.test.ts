// G37 (vtc-entry TOOL_DEFICITS, facade review R3-14): the indoor-temperature line assumed heating and windows while the
// energy line counts cooling, and it read one storey (55% up) only. It now takes each storey's system from the Energy
// use line (or says where the two differ) and reads the study storey and the top storey of each use band.
import { describe, expect, it } from 'vitest'
import climateJson from '../data/climate/yvr-cwec2020.json'
import type { ClimatePayload } from '../engine/sw/types'
import { energyLineSys, sysFor, tempStoreys } from '../engine/sw/thermal'
import { importedTower, rect, stack } from '../engine/testStoreys'
import type { Tower } from '../engine/types'
import { computeSw } from './swRun'
import './swRunInterior'
import type { SwInputs } from './swInputs'
import { SW_DEFAULTS, type SwStudySettings } from './swStudy'

const C = climateJson as unknown as ClimatePayload
// A podium, a hotel band, an office band, a plant floor and homes on top: a small mixed-use tower.
const mixed = (): Tower => importedTower(stack([
  { n: 2, f2f: 4.5, ring: rect(40, 40), podium: true, use: 'retail' },
  { n: 6, f2f: 3.2, ring: rect(30, 30), use: 'hotel' },
  { n: 8, f2f: 3.8, ring: rect(30, 30), use: 'office' },
  { n: 1, f2f: 4.5, ring: rect(30, 30), use: 'mechanical' },
  { n: 7, f2f: 3.1, ring: rect(30, 30), use: 'residential' },
]), { podiumTop: 9, coreSide: 10 })
const inp = (t: Tower): SwInputs => ({ project: 'city', towers: [t], north: 0, site: null, context: [], ctxBlocks: [], C })
const lines = async (s: SwStudySettings) => {
  const t = mixed()
  const temp = await computeSw('built.sw-indoor-temp', inp(t), s)
  const energy = await computeSw('built.sw-energy', inp(t), s)
  return { temp, energy, over: temp.rules.find((r) => r.id === 'sw-temp-over')!, teui: energy.rules.find((r) => r.id === 'sw-teui')! }
}

describe('G37: one system per floor, and the hottest storey', () => {
  it('names the Energy use line’s system for each use and picks the storeys to read', () => {
    expect(energyLineSys('office')).toBe('full')
    expect(energyLineSys('residential')).toBe('full')
    expect(energyLineSys('amenity')).toBe('none')
    expect(energyLineSys('mechanical')).toBe('none')
    expect(sysFor('energy', 'hotel')).toBe('full')
    expect(sysFor('heatwin', 'hotel')).toBe('heatwin')
    const floors = mixed().imported!.storeys.map((s) => ({ level: s.level, use: s.use }))
    // the study storey (index 12, L13) and each band's top: retail L2, hotel L8, office L16, homes L24 (plant left out)
    expect(tempStoreys(floors, 12).map((i) => floors[i].level)).toEqual([2, 8, 13, 16, 24])
  })

  it('a tower set to heating and cooling reports the same system in both lines, and names the hottest storey read', async () => {
    const { temp, over, teui } = await lines({ ...SW_DEFAULTS, system: 'full' })
    expect(teui.note).toMatch(/^System: heating and cooling to 21 \/ 25 °C on every conditioned floor; mechanical floors unconditioned/)
    expect(over.note).toMatch(/System: heating and cooling, chosen in the settings\. The Energy use line counts the same system on these storeys\./)
    expect(over.note).not.toMatch(/different systems/)
    const read = temp.data.read as { level: number; overShare: number; over26: number; sys: string }[]
    expect(read.map((r) => r.level)).toEqual([2, 8, 13, 16, 24])
    expect(read.every((r) => r.sys === 'full')).toBe(true)
    const hottest = read.reduce((a, r) => (r.overShare > a.overShare || (r.overShare === a.overShare && r.over26 > a.over26) ? r : a))
    expect(temp.data.hottest).toBe(hottest.level)
    expect(over.label).toMatch(new RegExp(`^Overheating, level ${hottest.level} \\(`))
    expect(over.value).toMatch(/ h over 26 °C, hottest of 5 storeys read$/)
    expect(over.note).toMatch(/^Hottest of 5 storeys read \(the study storey, level 13, and the top storey of each use band; plant and amenity bands left out\): L2 retail /)
  }, 60000)

  it('follows the Energy use line by default, and states the mismatch when another system is chosen', async () => {
    expect(SW_DEFAULTS.system).toBe('energy')
    const def = await lines(SW_DEFAULTS)
    expect(def.over.note).toMatch(/System: as the Energy use line counts it, storey by storey \(heating and cooling on L2, L8, L13, L16, L24\), to its set points of 21 \/ 25 °C\./)
    const win = await lines({ ...SW_DEFAULTS, system: 'heatwin' })
    expect(win.over.note).toMatch(/System: heating and windows, chosen in the settings\. The Energy use line counts heating and cooling on L2, L8, L13, L16, L24: the two lines assume different systems for those storeys \(choose "As the Energy use line" to match\)\./)
    // Cooling on, as the energy line counts it, never reads hotter than windows alone on the same storeys.
    const h = (x: typeof def) => Math.max(...(x.temp.data.read as { over26: number }[]).map((r) => r.over26))
    expect(h(def)).toBeLessThanOrEqual(h(win))
  }, 60000)
})
