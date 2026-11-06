import { describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { read3dmWith } from '../import/rhino'
import type { ProjectFrame } from '../import/pipeline'
import { buildModel, defaultOptions } from './build'
import { rhinoLinkModel } from './fixtures'
import { autoMapping } from './mapping'

vi.setConfig({ testTimeout: 30_000 })
const frame: ProjectFrame = { project: 'vtc', northDeg: 0, siteCentre: [0, 0], groundElevation: 0, utmOrigin: null }

// The Rhino link 2.x (Ruijie, 6 Nov: "on Rhino's end defining the underground level, add landscape or any other urban
// design elements … and sync"): its layers map to roles by themselves, its settings travel as document text.
describe('a model from the Rhino link: below grade, landscape and urban design', () => {
  it('reads the link\'s settings, maps its layers, and gives the tower its basement levels', async () => {
    const rh = await rhino3dm()
    const f = rhinoLinkModel(rh)
    const raw = read3dmWith(rh, f.bytes, f.name)
    expect(raw.docStrings).toMatchObject({ 'tdt.ground_z': '0', 'tdt.basement_f2f': '3.2' })
    const mapping = autoMapping(raw)
    expect(mapping.rules).toMatchObject({
      'Toolkit::Tower massing': { role: 'tower' }, 'Toolkit::Below grade': { role: 'basement' },
      'Toolkit::Landscape': { role: 'landscape' }, 'Toolkit::Urban design': { role: 'urban' },
    })
    const opts = defaultOptions(raw, mapping, frame, 4.2)
    // The ground level set in Rhino is the entrance floor, even though the basement reaches 6.4 m below it.
    expect(opts).toMatchObject({ datum: 'custom', dz: 0 })
    const built = buildModel({ raw, mapping, opts, frame, bands: [{ use: 'office', share: 1 }], podiumUse: 'retail' })
    expect(built.blocked).toBeNull()
    expect(built.towers).toHaveLength(1)
    const t = built.towers[0].tower
    expect(t.height).toBeCloseTo(120, 1)
    expect(t.basement).toEqual({ levels: 2, f2f: 3.2, use: 'parking', extent: 'podium', from: 'model' })
    const roles = built.model.elements.map((e) => e.role)
    expect(roles).toContain('landscape')
    expect(roles).toContain('urban')
    const below = built.model.elements.find((e) => e.role === 'basement')
    expect(below?.geometry.kind === 'prism' && below.geometry.z0).toBeCloseTo(-6.4, 1)
  })
})
