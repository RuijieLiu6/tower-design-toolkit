import { describe, expect, it, vi } from 'vitest'
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import { ringArea } from '../../engine/importGeom'
import { towerFloors } from '../../engine/massing'
import { toUtm10 } from '../../engine/relaxAviation'
import { read3dmWith } from '../import/rhino'
import type { ProjectFrame } from '../import/pipeline'
import { buildModel, defaultOptions, explainEmpty } from './build'
import { mixedUnitsNoNorth, noGeometry, TYPICAL, typicalTower } from './fixtures'
import { autoMapping, mappingRows } from './mapping'

// rhino3dm starts its WebAssembly per file; under load (the evaluation run in parallel) that can pass 5 s.
vi.setConfig({ testTimeout: 30_000 })

const frame: ProjectFrame = { project: 'vtc', northDeg: 0, siteCentre: [0, 0], groundElevation: 0, utmOrigin: null }
const bands = [{ use: 'office' as const, share: 1 }]

async function typical() {
  const rh = await rhino3dm()
  const f = typicalTower(rh)
  const raw = read3dmWith(rh, f.bytes, f.name)
  const mapping = autoMapping(raw)
  const opts = defaultOptions(raw, mapping, frame, 4.2)
  return { raw, mapping, opts, built: buildModel({ raw, mapping, opts, frame, bands, podiumUse: 'retail' }) }
}

describe('role mapping guesses (team assumption, confirmed by the person)', () => {
  it('maps the typical file by layer name', async () => {
    const { raw, mapping } = await typical()
    expect(mapping.by).toBe('layer')
    expect(mapping.rules).toEqual({
      'Massing::Tower A': { role: 'tower' }, 'Massing::Tower B': { role: 'tower' }, 'Massing::Podium': { role: 'podium', use: 'retail' },
      'Program::Office': { role: 'program', use: 'office' }, 'Program::Hotel': { role: 'program', use: 'hotel' }, 'Program::Residential': { role: 'program', use: 'residential' },
      Core: { role: 'core' }, 'Site::Lot line': { role: 'site' }, Context: { role: 'context' }, Setbacks: { role: 'ignore' },
    })
    const rows = mappingRows(raw, 'layer', 'role')
    expect(rows.find((r) => r.key === 'Context')).toMatchObject({ objects: 3, triangles: 36 })
    expect(rows.find((r) => r.key === 'Site::Lot line')).toMatchObject({ objects: 0, curves: 1, closedCurves: 1 })
  })
})

describe('build: Rhino file + mapping → Layer 0 interchange model and towers', { timeout: 30_000 }, () => {
  it('finds two towers, attaches the podium and core to tower A, and tags storeys from program volumes', async () => {
    const { built, opts } = await typical()
    expect(built.blocked).toBeNull()
    expect(opts).toMatchObject({ unit: 'mm', north: 'file', datum: 'zero', placement: 'keep' })
    expect(built.towers.map((t) => t.tower.name)).toEqual(['Tower A', 'Tower B'])
    const [a, b] = built.towers.map((t) => t.tower)
    expect(a.height).toBeCloseTo(285, 1)
    expect(b.height).toBeCloseTo(150, 1)
    // Podium top from the podium volume (exact), 4 podium storeys at about 4.5 m.
    const m = built.model.towers[0]
    expect(m.schedule).toMatchObject({ podiumTop: 18, f2f: 4.2 })
    expect(m.schedule.podiumSource).toMatch(/Top of the podium volume/)
    const fa = towerFloors(a)
    expect(fa.filter((f) => f.podium)).toHaveLength(4)
    expect(fa.filter((f) => f.podium).every((f) => f.use === 'retail')).toBe(true)
    // Podium plate 100 x 64 = 6400 m² at the first storey (tower A's shaft is inside it).
    expect(fa[0].area).toBeCloseTo(6400, 0)
    // Uses from the zones, by mid-height.
    for (const f of fa.filter((x) => !x.podium)) {
      const mid = (f.z0 + f.z1) / 2
      const z = TYPICAL.zones.find((q) => mid >= q.z0 && mid <= q.z1)!
      expect(f.use, `L${f.level} at ${mid}`).toBe(z.use)
    }
    expect(a.imported!.storeys.filter((s) => s.src).length).toBe(m.taggedStoreys)
    expect(m.taggedStoreys).toBe(fa.length) // program volumes above, the podium volume (use: retail) below
    // Core 12 x 12 m in a 40 x 40 m plate: 9% (measured), the lifts do not resize it.
    expect(m.coreShare).toBeCloseTo(0.09, 3)
    expect(a).toMatchObject({ coreShare: 0.09, coreAuto: false })
    // Tower B: no program, no core: bands and the lift sizing.
    expect(built.model.towers[1].coreShare).toBeNull()
    expect(towerFloors(b).every((f) => f.use === 'office')).toBe(true)
    // Placement: file kept (north = +Y = project north); a tower's centre is that of its volumes, podium included.
    expect(a.x).toBeCloseTo(0, 2); expect(a.y).toBeCloseTo(0, 2); expect(a.rotation).toBeCloseTo(0, 6)
    expect(b.x).toBeCloseTo(32.5, 2)
  })

  it('keeps the site boundary, context prisms, provenance and the ignored list', async () => {
    const { built, raw } = await typical()
    const el = built.model.elements
    const site = el.filter((e) => e.role === 'site')
    expect(site).toHaveLength(1)
    const g = site[0].geometry
    expect(g.kind).toBe('polygon')
    if (g.kind === 'polygon') expect(ringArea(g.rings[0])).toBeCloseTo(TYPICAL.site.w * TYPICAL.site.d, 0)
    const ctx = el.filter((e) => e.role === 'context')
    expect(ctx.map((e) => (e.geometry.kind === 'prism' ? e.geometry.z1 : 0)).sort()).toEqual([60, 60, 90])
    for (const e of ctx) if (e.geometry.kind === 'prism') expect(ringArea(e.geometry.rings[0])).toBeGreaterThan(599)
    expect(ctx.filter((e) => e.provenance.block === 'Neighbour (member on Context)' || e.provenance.block === 'Neighbour')).toHaveLength(2)
    // Every element points back at its Rhino object.
    for (const e of el) {
      expect(e.provenance.file).toBe(raw.fileName)
      expect(e.provenance.objectId).toMatch(/^[0-9a-f-]{36}$/)
      expect(e.provenance.evidence).toBe('unverified') // guessed, not yet confirmed in the mapping screen
    }
    expect(el.find((e) => e.name === 'Tower A shaft')!.provenance.geometrySource).toBe('Exact planar faces rebuilt from the BRep (closed)')
    expect(new Set(el.map((e) => e.id)).size).toBe(el.length)
    const reasons = built.model.ignored.map((x) => `${x.layer}: ${x.reason}`)
    expect(reasons).toEqual(expect.arrayContaining([expect.stringMatching(/^Annotation: Text and dimensions/), expect.stringMatching(/^Setbacks: Layer "Setbacks" is set to Ignore/)]))
    // Plain-language checks cover units, north, datum, towers, program, core, site and context.
    expect(built.model.checks.map((c) => c.id)).toEqual(expect.arrayContaining(['units', 'north', 'datum', 'towers', 'program', 'core', 'site', 'context', 'ignored']))
    expect(built.model.checks.find((c) => c.id === 'units')!.text).toMatch(/millimetres, as the file says/)
  })

  it('confirmed rows carry the person\'s decision as a team assumption', async () => {
    const { raw, mapping, opts } = await typical()
    const m = buildModel({ raw, mapping: { ...mapping, confirmed: Object.keys(mapping.rules) }, opts, frame, bands, podiumUse: 'retail' })
    expect(new Set(m.model.elements.map((e) => e.provenance.evidence))).toEqual(new Set(['team_assumption']))
  })

  it('boundary: mixed units and no north are said in plain words, and nothing is silently fixed', async () => {
    const rh = await rhino3dm()
    const f = mixedUnitsNoNorth(rh)
    const raw = read3dmWith(rh, f.bytes, f.name)
    const mapping = autoMapping(raw)
    const opts = defaultOptions(raw, mapping, frame, 4.2)
    expect(opts.north).toBe('unresolved')
    const b = buildModel({ raw, mapping, opts, frame, bands, podiumUse: 'retail' })
    expect(b.blocked).toBeNull()
    expect(b.model.frame.north.flag).toBe('unresolved')
    const scale = b.model.checks.find((c) => c.id === 'scale-Context')!
    expect(scale.severity).toBe('warn')
    expect(scale.text).toMatch(/Context" is about [\d,]+× smaller than the massing: was it pasted from a file in other units\?/)
    expect(b.model.checks.find((c) => c.id === 'north')!.text).toMatch(/does not say/)
  })

  it('out of scope: no usable geometry stops with an explanation and no tower', async () => {
    const rh = await rhino3dm()
    const f = noGeometry(rh)
    const raw = read3dmWith(rh, f.bytes, f.name)
    const b = buildModel({ raw, mapping: autoMapping(raw), opts: defaultOptions(raw, autoMapping(raw), frame, 4.2), frame, bands, podiumUse: 'retail' })
    expect(b.towers).toHaveLength(0)
    expect(b.blocked).toBe(explainEmpty(raw))
    expect(b.blocked).toMatch(/no closed volumes .* only 1 TextDot, 3 Points, 1 open curve/)
  })
})

describe('Rhino item 11: aligning an uploaded model to the map', () => {
  const city: ProjectFrame = { project: 'city', northDeg: 0, siteCentre: [0, 0], groundElevation: 30, utmOrigin: [491300, 5458600] }
  const podiumCorners = (b: Awaited<ReturnType<typeof typical>>['built']) => { const e = b.model.elements.find((x) => x.role === 'podium')!; return e.geometry.kind === 'mesh' ? e.geometry.bbox : null }

  it('anchor: a model point lands on a map point, turned on top of north', async () => {
    const { raw, mapping, opts } = await typical()
    // The podium's south-west corner (-50, -32 m in the file) onto a point of the map, turned 90° counter-clockwise.
    const b = buildModel({ raw, mapping, opts: { ...opts, placement: 'anchor', anchor: { model: [-50, -32], city: [120, 340], turn: 90 } }, frame: city, bands, podiumUse: 'retail' })
    expect(b.blocked).toBeNull()
    expect(b.model.frame.north.rotation).toBeCloseTo(90, 6)
    // Turned 90°: the 100 x 64 m podium now spans 64 m in x and 100 m in y, with that corner at (120, 340).
    const [lo, hi] = podiumCorners(b)!
    expect(hi[0] - lo[0]).toBeCloseTo(64, 3)
    expect(hi[1] - lo[1]).toBeCloseTo(100, 3)
    expect(hi[0]).toBeCloseTo(120, 3) // (x, y) → (−y, x): the west edge becomes the south edge, the corner the south-east one
    expect(lo[1]).toBeCloseTo(340, 3)
    expect(b.model.frame.placement.anchor).toEqual({ model: [-50, -32], city: [120, 340], turn: 90 })
    expect(b.model.checks.find((c) => c.id === 'placement')!.text).toMatch(/goes on E 491420\.0, N 5458940\.0 \(EPSG:26910\), turned 90° counter-clockwise/)
  })

  it('earth: the file\'s Earth anchor puts its base point at its latitude and longitude (Krüger series)', async () => {
    const { raw, mapping, opts } = await typical()
    expect(raw.earthAnchor).toEqual({ lat: 49.2827, lon: -123.1207, basePoint: [0, 0, 0] })
    const b = buildModel({ raw, mapping, opts: { ...opts, placement: 'earth' }, frame: city, bands, podiumUse: 'retail' })
    const utm = toUtm10(49.2827, -123.1207)
    // File origin (0, 0) = the base point, so tower A (centre 0, 0 in the file) sits on the anchor itself.
    expect(b.towers[0].tower.x).toBeCloseTo(utm[0] - 491300, 2)
    expect(b.towers[0].tower.y).toBeCloseTo(utm[1] - 5458600, 2)
    expect(b.model.checks.find((c) => c.id === 'placement')).toMatchObject({ flag: 'unverified' })
    // Without a map frame (the competition site) an Earth anchor placement stops, in words.
    expect(buildModel({ raw, mapping, opts: { ...opts, placement: 'earth' }, frame, bands, podiumUse: 'retail' }).model.checks.find((c) => c.id === 'placement')!.severity).toBe('block')
  })
})
