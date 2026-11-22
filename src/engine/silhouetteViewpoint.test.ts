// Viewpoint silhouette (R7 tool 1, R7d TP1): the outline and the sky through the tower from the City's view-cone
// origins and named viewpoints, against a contrast line. Generated towers only.
import { describe, expect, it } from 'vitest'
import { withBlocks } from './massing'
import { arcmin2 } from './silhouette'
import {
  ALL_VIEWPOINTS, CONE_VIEWPOINTS, CONTRAST, DEFAULT_SITE_GROUND, UTM_ORIGIN, viewpointOutline, viewpointReading, viewpointReadings, viewpointRules, viewSite, type ViewSite,
} from './silhouetteViewpoint'
import { importedTower, rect, ringArea, stack, type P } from './testStoreys'
import type { Block, ImportedStorey, Tower } from './types'

const T0: Tower = { id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 54, depth: 54, height: 300, f2f: 4, podiumHeight: 0, podiumWidth: 54, podiumDepth: 54, podiumUse: 'retail', bands: [{ use: 'residential', share: 1 }], coreShare: 0.25, plantEvery: 0 }
const blk = (id: string, height: number, width: number, depth: number, dx = 0, dy = 0): Block => ({ id, height, width, depth, dx, dy, rotation: 0 })
const tower = (blocks: Block[], at: Partial<Tower> = {}) => withBlocks({ ...T0, ...at }, blocks)
const VTC = viewSite('vtc')
const QE = CONE_VIEWPOINTS.find((v) => v.id === 'qe')!

describe('where the tower stands and where the city looks from', () => {
  it('uses the Real Vancouver origin and places the competition block on the default site, as Open in Real Vancouver does', async () => {
    const { CITY_ORIGIN } = await import('../store')
    expect(UTM_ORIGIN).toEqual(CITY_ORIGIN)
    const { competitionToCity, DEFAULT_CITY_SITE } = await import('../lib/defaultSite')
    const t = tower([blk('s', 200, 40, 40)], { x: 30, y: -12, rotation: 0 })
    const moved = competitionToCity([t], DEFAULT_CITY_SITE.ring as P[])[0]
    // the tower's centre in EPSG:26910 by both routes, and true north 45.2° from the model's +Y (the brief's 45°, read on the real block)
    const r = viewpointReading(t, { bearing: 0, distance: 1000 }, { site: VTC })!
    const centre: P = [r.viewpoint.at[0], r.viewpoint.at[1] - 1000]
    expect(centre[0]).toBeCloseTo(moved.x + CITY_ORIGIN[0], 2)
    expect(centre[1]).toBeCloseTo(moved.y + CITY_ORIGIN[1], 2)
    expect(VTC.turnDeg).toBeCloseTo(45.2, 1)
    expect(VTC.ground).toBe(DEFAULT_SITE_GROUND)
    expect(DEFAULT_SITE_GROUND).toBeCloseTo(23.4, 1)
  })

  it('has one viewpoint per City view-cone origin, Queen Elizabeth Park holding cones 3.2.1–3.2.4 at Lv 124.6 m', () => {
    expect(QE).toMatchObject({ name: 'Queen Elizabeth Park', cones: ['3.2.1', '3.2.2', '3.2.3', '3.2.4'], eye: 124.6, kind: 'cone', terrainDeg: 1.7 })
    expect(QE.at).toEqual([491816.07, 5454381.78])
    expect(CONE_VIEWPOINTS[0].id).toBe('qe')
    // 24 cones, 16 distinct origins; every cone id belongs to exactly one viewpoint
    expect(CONE_VIEWPOINTS).toHaveLength(16)
    const ids = CONE_VIEWPOINTS.flatMap((v) => v.cones)
    expect(ids).toHaveLength(24)
    expect(new Set(ids).size).toBe(24)
    expect(ALL_VIEWPOINTS.filter((v) => v.kind === 'named').map((v) => v.id)).toEqual(['kits-point', 'lonsdale-quay'])
    expect(ALL_VIEWPOINTS.filter((v) => v.kind === 'named').every((v) => v.flag === 'team_assumption')).toBe(true)
  })

  it('reads the QE Park sightline to the default site as R7 does: 4.71 km at 356.8°, inside cone 3.2.3', () => {
    const r = viewpointReading(tower([blk('s', 244, 54, 54)]), 'qe', { site: VTC })!
    expect(r.distance).toBeGreaterThan(4705)
    expect(r.distance).toBeLessThan(4718)
    expect(r.bearing).toBeCloseTo(356.8, 1)
    expect(r.inCones).toEqual(['3.2.3'])
    // R7d §2: a 244 m top reads 1.72° above the eye, a 305 m top 2.46°; the 1.70° ridge crosses the tower at about +242.6 m (R7 §0)
    expect(r.top.deg).toBeCloseTo(1.72, 2)
    expect(viewpointReading(tower([blk('s', 305, 54, 54)]), 'qe', { site: VTC })!.top.deg).toBeCloseTo(2.46, 2)
    expect(r.terrain!.deg).toBe(1.7)
    expect(r.terrain!.z).toBeGreaterThan(242.2)
    expect(r.terrain!.z).toBeLessThan(243)
    // the same tower on Real Vancouver, away from the default site: no terrain line read for that sightline
    const away = viewpointReading(tower([blk('s', 244, 54, 54)], { x: 516, y: -900 }), 'qe', { site: viewSite('city') })!
    expect(away.terrain).toBeNull()
  })

  it('sets the pass line by contrast: R7d §7 at 4.7 km, 13.7 m / 188 m² clear and 21.9 m / 470 m² overcast', () => {
    const t = tower([blk('s', 244, 54, 54)])
    const clear = viewpointReading(t, 'qe', { site: VTC })!, grey = viewpointReading(t, 'qe', { site: VTC, contrast: 'overcast' })!
    expect(CONTRAST.clear).toMatchObject({ arcmin: 10, arcmin2: 100 })
    expect(CONTRAST.overcast).toMatchObject({ arcmin: 16, arcmin2: 250 })
    expect(clear.line.m).toBeCloseTo(13.7, 1)
    expect(clear.line.m2).toBeCloseTo(188, 0)
    expect(grey.line.m).toBeCloseTo(21.9, 1)
    expect(Math.round(grey.line.m2)).toBe(470)
  })
})

describe('the outline from a viewpoint', () => {
  it('a plain square box: one width all the way up, the competition grid seen near its diagonal from QE Park (76.3 m), no change', () => {
    const r = viewpointReading(tower([blk('s', 244, 54, 54)]), 'qe', { site: VTC })!
    expect(r.changes).toEqual([])
    expect(r.largest).toBeNull()
    expect(r.narrowest!.m).toBeCloseTo(r.widest!.m, 6)
    expect(r.narrowest).toMatchObject({ z0: 0, z1: 244 })
    // the grid is 45.2° from east and the sightline 3.2° west of north: 54 (cos 42° + sin 42°)
    const phi = ((45.2287 - (360 - r.bearing)) * Math.PI) / 180
    expect(r.widest!.m).toBeCloseTo(54 * (Math.cos(phi) + Math.sin(phi)), 1)
    expect(r.widest!.m).toBeCloseTo(76.3, 1)
    expect(r.state).toBe('warn')
    expect(r.reads).toEqual({ outline: false, sky: false })
  })

  it('a 9 m step on all faces reads from QE Park (25.4 m, about 19′); 5 m steps read at clear contrast but not overcast', () => {
    const big = viewpointReading(tower([blk('lo', 150, 54, 54), blk('hi', 150, 36, 36)]), 'qe', { site: VTC })!
    expect(big.largest!.size).toBeCloseTo(18 * 1.4123, 1)
    expect(big.largest!.z0).toBeCloseTo(150, 6)
    expect(big.largest!.arcmin).toBeGreaterThan(18)
    expect(big.largest!.arcmin).toBeLessThan(19)
    expect(big.narrowest).toMatchObject({ z0: 150, z1: 300 })
    expect(big.widest).toMatchObject({ z0: 0, z1: 150 })
    expect(big.state).toBe('pass')
    const small = tower([blk('lo', 150, 54, 54), blk('hi', 150, 44, 44)])
    const c = viewpointReading(small, 'qe', { site: VTC })!, o = viewpointReading(small, 'qe', { site: VTC, contrast: 'overcast' })!
    expect(c.largest!.size).toBeCloseTo(14.1, 1) // over 13.7 m
    expect(c.state).toBe('pass')
    expect(o.state).toBe('warn') // under 21.9 m
  })

  it('C’s 2 km pass can vanish from QE Park: a 4.5 m step on two faces reads from 2 km but not from 4.7 km', () => {
    const t = tower([blk('lo', 150, 54, 54), blk('hi', 150, 49.5, 49.5, -2.25, -2.25)])
    const near = viewpointReading(t, { bearing: 180, distance: 2000 }, { site: VTC })!
    const qe = viewpointReading(t, 'qe', { site: VTC })!
    expect(qe.largest!.size).toBeLessThan(qe.line.m)
    expect(qe.state).toBe('warn')
    expect(near.largest!.arcmin).toBeGreaterThan(qe.largest!.arcmin * 2)
  })

  it('a viewpoint at any bearing and distance from the tower, with the eye 1.6 m above its grade unless given', () => {
    const t = tower([blk('s', 200, 40, 20)], { x: 400, y: 300 })
    const site = viewSite('city', 10)
    for (const bearing of [0, 90, 200, 315]) {
      const r = viewpointReading(t, { bearing, distance: 2500 }, { site })!
      expect(r.distance).toBeCloseTo(2500, 6)
      expect((r.bearing + 180) % 360).toBeCloseTo(bearing, 6)
      expect(r.eye).toBeCloseTo(11.6, 9)
    }
    // the city frame's +Y is grid north: from the north the 40 m face is seen, from the east the 20 m one
    expect(viewpointReading(t, { bearing: 0, distance: 2500 }, { site })!.widest!.m).toBeCloseTo(40, 6)
    expect(viewpointReading(t, { bearing: 90, distance: 2500 }, { site })!.widest!.m).toBeCloseTo(20, 6)
    expect(viewpointReading(t, { bearing: 90, distance: 2500, eye: 50, name: 'Roof' }, { site })!.viewpoint).toMatchObject({ name: 'Roof', eye: 50, kind: 'custom' })
  })
})

// The Ridge Gate (R7 concept 2) in miniature on Real Vancouver, due north of QE Park: a 40 m square tower whose top four
// storeys are two 5 m ears either side of a 30 m slot along the sightline, under a bridge storey; the core steps into
// the east ear there (the core-top input is another engineer's).
describe('sky through the tower from a viewpoint', () => {
  const ear = (x: number) => rect(5, 40, x, 0)
  const site: ViewSite = viewSite('city', 20)
  const gate = (at: P, sill = 280, rotation = 0) => {
    const n = Math.round(sill / 4)
    const st = stack([{ n, f2f: 4, ring: rect(40, 40) }, { n: 4, f2f: 4, ring: rect(40, 40) }, { n: 1, f2f: 4, ring: rect(40, 6) }])
      .map((s): ImportedStorey => (s.level > n && s.level <= n + 4 ? { ...s, loops: [ear(-17.5), ear(17.5)], area: 2 * ringArea(ear(0)) } : s))
    const t = importedTower(st, { coreSide: 16 })
    return { ...t, x: at[0], y: at[1], rotation, coreSteps: [{ fromLevel: n + 1, side: 4, centre: [17.5, 0] as [number, number] }] } as Tower
  }
  // due north of the QE origin, 4.7 km away, off the default site
  const north: P = [491816.07 - UTM_ORIGIN[0], 5454381.78 + 4700 - UTM_ORIGIN[1]]

  it('reads the gate as sky (30 × 16 m = 480 m²), which the 8-view open-band rule leaves out under a narrow bridge', async () => {
    const t = gate(north)
    const r = viewpointReading(t, 'qe', { site })!
    expect(r.distance).toBeCloseTo(4700, 0)
    expect(r.sky.read).toBe(true)
    expect(r.sky.openings).toHaveLength(1)
    const o = r.sky.largest!
    expect(o.width).toBeCloseTo(30, 6)
    expect(o.z1 - o.z0).toBeCloseTo(16, 6)
    expect(o.area).toBeCloseTo(480, 6)
    expect(o.sky).toBeCloseTo(480, 6)
    // R7: 480 m² reads about 256 arcmin² from QE Park, just over the overcast line
    expect(o.skyArcmin2).toBeGreaterThan(250)
    expect(o.skyArcmin2).toBeLessThan(260)
    expect(r.reads.sky).toBe(true)
    expect(r.state).toBe('pass')
    expect(viewpointReading(t, 'qe', { site, contrast: 'overcast' })!.state).toBe('pass')
    const { silhouetteReading } = await import('./silhouette')
    expect(silhouetteReading(t).sky.bands).toEqual([]) // the bridge plate is smaller than the ears': no open band
    // seen across the slot (from the east) the ears overlap: no sky
    expect(viewpointReading(t, { bearing: 90, distance: 4700 }, { site })!.sky.openings).toEqual([])
    // with the core still at the centre (no step) it blocks the middle of the slot
    const cored = viewpointReading({ ...t, coreSteps: [] } as Tower, 'qe', { site })!
    expect(cored.sky.largest!.width).toBeLessThan(10)
  })

  it('does not count what stands behind, nor the part of an opening below the terrain line behind', () => {
    const t = gate(north)
    const behind = { prisms: [{ ring: rect(80, 30, north[0], north[1] + 200), z0: 0, z1: 400, name: 'Tower B' }], what: 'a test neighbour' }
    const hid = viewpointReading(t, 'qe', { site, context: behind })!
    expect(hid.sky.openings).toEqual([])
    expect(hid.sky.behind).toEqual({ area: expect.closeTo(480, 6), names: ['Tower B'] })
    expect(hid.state).toBe('warn')
    // on the competition site the ridge behind crosses the tower at +242.6 m: a gate with its sill at +232 m shows 10.6 m of
    // its 16 m against the mountainside, the rest against the sky
    // the slot turned onto the QE sightline (the competition grid's +Y points 45.2° west of north; the sightline 3.2°)
    const low = viewpointReading(gate([0, 0], 232, 360 - VTC.turnDeg - 356.81), 'qe', { site: VTC })!
    const o = low.sky.largest!
    expect(o.area).toBeCloseTo(480, 0)
    expect(o.sky).toBeCloseTo(30 * (248 - low.terrain!.z), 1)
    expect(o.skyArcmin2).toBeLessThan(o.arcmin2)
  })

  it('reads no sky in a twist’s waist (its plates keep their area): that reads as outline changes', () => {
    const sq = (deg: number): P[] => { const a = (deg * Math.PI) / 180; return rect(50, 50).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as P) }
    const st: ImportedStorey[] = Array.from({ length: 60 }, (_, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: 2500, use: 'residential', podium: false, hasFloor: true, loops: [sq((90 * i) / 59)] }))
    const t = { ...importedTower(st), x: north[0], y: north[1] } as Tower
    const r = viewpointReading(t, 'qe', { site })!
    expect(r.sky.openings).toEqual([])
    expect(r.changes.length).toBeGreaterThan(0)
  })

  it('reads three open storeys round a 24 m core as the 8-view reading does when seen straight on', async () => {
    const shaft = rect(50, 50), core = rect(24, 24)
    const st = stack([{ n: 20, f2f: 4, ring: shaft }, { n: 3, f2f: 4, ring: core }, { n: 20, f2f: 4, ring: shaft }])
    const t = { ...importedTower(st, { coreSide: 24 }), x: north[0], y: north[1] } as Tower
    const r = viewpointReading(t, 'qe', { site })!
    expect(r.sky.openings.map((o) => Math.round(o.width * 10) / 10)).toEqual([13, 13])
    expect(r.sky.openings.every((o) => Math.abs(o.area - 156) < 1e-6)).toBe(true)
    expect(r.sky.largest!.arcmin2).toBeCloseTo(arcmin2(156, Math.hypot(r.distance, 20 + 86 - 124.6)), 6)
  })
})

describe('the outline in a plain form, for drawing the view', () => {
  it('returns polygons in metres and angles, the openings as rectangles, and nothing that is not plain data', () => {
    const t = tower([blk('lo', 150, 54, 54), blk('hi', 150, 36, 36)])
    const o = viewpointOutline(t, 'qe', { site: VTC })!
    expect(JSON.parse(JSON.stringify(o))).toEqual(o)
    expect(o.viewpoint).toMatchObject({ id: 'qe', name: 'Queen Elizabeth Park', eye: 124.6 })
    expect(o.outline).toHaveLength(1)
    const m = o.outline[0].metres
    expect(m).toHaveLength(8)
    expect(Math.max(...m.map((p) => p[1]))).toBe(300)
    expect(Math.max(...m.map((p) => p[0])) - Math.min(...m.map((p) => p[0]))).toBeCloseTo(76.3, 1)
    // the angles: about 56′ wide at the base, the top 2.40° above the eye
    const a = o.outline[0].angles
    expect((Math.max(...a.map((p) => p[0])) - Math.min(...a.map((p) => p[0]))) * 60).toBeCloseTo(55.6, 0)
    expect(Math.max(...a.map((p) => p[1]))).toBeCloseTo(o.top.deg, 4)
    expect(o.parts).toHaveLength(2)
    expect(o.openings).toEqual([])
    expect(o.terrain!.deg).toBe(1.7)
  })
})

describe('result lines', () => {
  it('judges QE Park and reports the other viewpoints, nearest first', () => {
    const t = tower([blk('lo', 150, 54, 54), blk('hi', 150, 36, 36)])
    const vp = viewpointReadings(t, { site: VTC, viewpoints: [{ name: 'Kits beach', bearing: 250, distance: 3000 }] })
    const rules = viewpointRules(vp.qe, vp.others)
    expect(rules.map((r) => r.id)).toEqual(['sil-qe', 'sil-viewpoints'])
    expect(rules[0]).toMatchObject({ state: 'pass', flag: 'team_assumption' })
    expect(rules[0].value).toMatch(/^reads by its outline: largest change narrows 25\.4 m at \+150 m, 19′ from 4\.7 km at 357°; width 50\.8–76\.3 m/)
    expect(rules[0].value).toContain('terrain line behind at 1.70° crosses the tower at +242.6 m')
    expect(rules[0].value).toMatch(/stands in view 3\.2\.3$/)
    expect(rules[0].threshold).toMatch(/^a change of ≥ 10′ \(13\.7 m from 4\.7 km\) or ≥ 100 arcmin² of sky through the tower \(188 m²\), clear sky \(13% contrast\); overcast: 16′ \/ 250 arcmin²/)
    expect(rules[1].state).toBe('unknown')
    expect(rules[1].value).toContain('Kits beach 3.0 km at 70°')
    // nearest first: Creekside Park's origin (cones J1, J2) is the nearest to the competition block
    expect(rules[1].value).toMatch(/^Creekside Park \(J1, J2\) 1\.4 km at /)
    expect(vp.others).toHaveLength(ALL_VIEWPOINTS.length) // the 15 other origins, 2 named places and the one given
    const box = viewpointReadings(tower([blk('s', 244, 54, 54)]), { site: VTC, contrast: 'overcast' })
    const line = viewpointRules(box.qe, box.others)[0]
    expect(line.state).toBe('warn')
    expect(line.value).toMatch(/^under the line \(16′ \/ 250 arcmin²\): largest change straight outline/)
  })

  it('lands in the evidence groups on both projects, with a fix for the warning', async () => {
    const { evidenceGroups } = await import('../lib/evidence/engines')
    const { fixFor } = await import('../lib/fixes')
    const { defaultTower, useStore } = await import('../store')
    const s = useStore.getState()
    const base = { fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets }
    for (const project of ['vtc', 'city'] as const) {
      const g = evidenceGroups({ ...base, project, towers: [defaultTower(project)] })
      const lines = (g['built.silhouette'] as { id: string; state: string; value: string; threshold: string }[][])[0]
      const qe = lines.find((x) => x.id === 'sil-qe')!
      expect(qe).toBeDefined()
      expect(lines.find((x) => x.id === 'sil-viewpoints')).toBeDefined()
      expect(fixFor('sil-qe', 'warn', qe.value, qe.threshold, 'team_assumption')).toMatch(/^Size the move to the Queen Elizabeth Park view/)
    }
    const grey = evidenceGroups({ ...base, project: 'vtc', towers: [defaultTower('vtc')], silhouetteContrast: 'overcast', silhouetteViewpoints: ['kits-point', { bearing: 90, distance: 800, name: 'Station roof' }] })
    const lines = (grey['built.silhouette'] as { id: string; value: string; threshold: string }[][])[0]
    expect(lines.find((x) => x.id === 'sil-qe')!.threshold).toContain('overcast (7% contrast)')
    expect(lines.find((x) => x.id === 'sil-viewpoints')!.value).toContain('Station roof 800 m at 270°')
  })
})
