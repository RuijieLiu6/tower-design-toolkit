// Node built.nature-inputs (NODE_LIST #6): the City in Nature panel and the evidence hub read one input set. Before,
// the panel lacked the model trees, the planting at grade and the preset soil depth, and the hub lacked the Facade node's
// treated share and the QE Park answer from the cones, so the same design gave different canopy, cover and bird lines.
import { describe, expect, it } from 'vitest'
import { VTC_NORTH_DEG } from '../context'
import { evidenceGroups } from '../lib/evidence/engines'
import { trueNorthDeg } from '../lib/northView'
import { useStore } from '../store'
import { DEFAULT_NATURE, cityInNatureFrom, type ConeResult, type NatureInput, type NatureResult } from './cityInNature'
import { DEFAULT_FACADE, facadeCheck, type FacadeInput } from './facade'
import { DEFAULT_WEIGHT_PRESETS } from './storeyWeight'
import { importedTower, rect, stack } from './testStoreys'
import type { Tower } from './types'
import { SITE } from './vtcRules'

const s = useStore.getInitialState()
// 40 m square homes on a 60 m podium, the roof over the top storey (level 44) declared planted without its own depth.
const tower: Tower = { ...importedTower(stack([{ n: 3, f2f: 4.5, ring: rect(60, 60), podium: true }, { n: 40, f2f: 3.2, ring: rect(40, 40) }]), { podiumTop: 13.5, coreSide: 16 }), deckUses: [{ level: 44, use: 'planted' }] }
const trees = Array.from({ length: 12 }, (_, k) => ({ kind: 'tree', at: [-50 + 10 * (k % 6), -30 + 12 * Math.floor(k / 6)], crown: 7 }))
const input: NatureInput = { ...DEFAULT_NATURE, groundPorous: trees, groundPlantedM2: 900 }
const settings: FacadeInput = { ...DEFAULT_FACADE, treated: 0.9, wwr: { N: 0.5, E: 0.5, S: 0.4, W: 0.4 } }

/** What the panel's useNature hands the shared function, written out without React. */
function panel(project: 'vtc' | 'city', towers: Tower[], area: number | null, cones: ConeResult[] | null): NatureResult {
  const north = trueNorthDeg(project)
  return cityInNatureFrom(input, area, { project, towers, north, facade: facadeCheck(towers, settings, north), facadeFromSettings: true, facadeTreated: settings.treated, cones: project === 'city' ? cones : null, soilMm: DEFAULT_WEIGHT_PRESETS.soilMm })
}
function hub(project: 'vtc' | 'city', towers: Tower[], area: number | null, cones?: ConeResult[]): NatureResult {
  const g = evidenceGroups({ project, towers, fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: input, windPresets: s.windPresets, systemsPresets: s.systemsPresets, facade: settings, studyArea: area, cones })
  return g['built.city-in-nature'] as NatureResult
}
const pick = (r: NatureResult, ids: string[]) => ids.map((id) => { const x = r.rows.find((q) => q.id === id)!; return { id, value: x.value, state: x.state, note: x.note } })
const SAME = ['canopy', 'cover', 'retention', 'bird', 'bird-zone', 'views', 'qe-view']

describe('One input set for City in Nature (node built.nature-inputs)', () => {
  it('the panel and the evidence hub give the same canopy, cover, retention and bird readings for the same inputs', () => {
    const p = panel('vtc', [tower], SITE.area, null), h = hub('vtc', [tower], SITE.area)
    expect(pick(h, SAME)).toEqual(pick(p, SAME))
    const row = (id: string) => h.rows.find((r) => r.id === id)!
    // The model trees, the planting at grade and the deck soil reach the hub's lines …
    expect(row('canopy').value).toMatch(/modelled [\d,]+ m²/)
    expect(row('cover').value).toMatch(/modelled/)
    expect(row('cover').note).toMatch(/900 m² of planting at grade/)
    expect(row('retention').value).toMatch(/held in deck soil/)
    // … and the Facade node's treated share reaches the panel's and the hub's bird line alike.
    expect(row('bird').value).toBe('90%')
    expect(row('bird').note).toMatch(/From the Facade node’s treated share/)
  })

  it('on Real Vancouver the QE Park answer from the cones reaches both', () => {
    const cones: ConeResult[] = [{ overall: 'above', checks: [{ cone: { id: '3.2.2' }, state: 'above' }] }]
    const p = panel('city', [tower], 12000, cones), h = hub('city', [tower], 12000, cones)
    expect(pick(h, SAME)).toEqual(pick(p, SAME))
    expect(h.rows.find((r) => r.id === 'qe-view')!.value).toBe('enters, via the Higher Buildings pathway')
  })

  it('says so where the two could still differ: no cone results, facade defaults, a preset soil depth', () => {
    const h = evidenceGroups({ project: 'city', towers: [tower], fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: input, windPresets: s.windPresets, systemsPresets: s.systemsPresets, studyArea: 12000, weightPresets: { soilMm: 300 } })['built.city-in-nature'] as NatureResult
    const row = (id: string) => h.rows.find((r) => r.id === id)!
    expect(row('views').value).toMatch(/view-cone results not read here/)
    expect(row('bird-zone').note).toMatch(/Facade node’s defaults/)
    expect(row('retention').note).toMatch(/300 mm from the storey-weight presets/)
    // The competition site keeps its own wording.
    expect(hub('vtc', [tower], SITE.area).rows.find((r) => r.id === 'views')!.value).toBe('not modelled on the competition site')
    expect(VTC_NORTH_DEG).toBe(trueNorthDeg('vtc'))
  })
})
