// Geometry QA (docs/geometry-qa.md): how an imported, shifted, carved tower is read by the analysis nodes. The fixture
// (geometryQa.fixture.ts) is a podium with one large civic void carved out of its street side and a tower tier shifted
// over part of that void. The first blocks pin what the engine claims to keep; the last pins what it does not read
// (known limits, shown as "manual review" in the note), so a change to either is seen.
import { describe, expect, it } from 'vitest'
import { DEFAULT_FACADE, faces } from './facade'
import { FIXTURE_Y, PODIUM_TOP, PODIUM_U, RUNS, TIER_A, TIER_B, area, fixtureMesh, fixtureStoreys, fixtureTower, rect, type P } from './geometryQa.fixture'
import { detectPodiumTop } from './importGeom'
import { sliceStoreys } from './imported'
import { floorRing, readsStoreys, storeyOutline, towerFloors, towerFootprint, towerMasses } from './massing'
import { DEFAULT_PUBLIC_REALM, SITE_AREA, edgeLength, facadeRun, frontageCheck, masses, openSpace, streetwallCheck, streetwallStoreys, towerFormRules, type Neighbour } from './publicRealm'
import { skyStoreys } from './silhouette'
import { towerOccluders } from './solarRules'
import type { RuleResult } from './types'

const t = fixtureTower()
const input = DEFAULT_PUBLIC_REALM
const rule = (rules: RuleResult[], id: string) => rules.find((r) => r.id === id)!
const areas = (polys: P[][][]) => polys.map((pg) => area(pg[0])).sort((a, b) => a - b)
/** Open ground the engine should find: the site less the podium plate and the part of the void under tier B (20 × 8 m). */
const TRUE_OPEN = SITE_AREA - 3520 - 160

describe('fixture: mesh to storeys', () => {
  it('slices the mesh into the stored storeys, the civic void kept in the podium plate', () => {
    const m = fixtureMesh()
    const top = PODIUM_TOP + 56
    const podiumTop = detectPodiumTop(m, top)
    expect(podiumTop).toBe(PODIUM_TOP)
    const sl = sliceStoreys(m, { f2f: 4, podiumTop, podiumF2F: 4.5, top })
    const want = fixtureStoreys()
    expect(sl.map((s) => [s.level, s.z0, s.z1, s.podium, s.area, s.hasFloor])).toEqual(want.map((s) => [s.level, s.z0, s.z1, s.podium, s.area, s.hasFloor]))
    // One loop per storey; the podium's has the void's four corners (8 points, not the 4 of a hull).
    expect(sl.map((s) => s.loops.map((l) => l.length))).toEqual(want.map((s) => s.loops.map((l) => l.length)))
    const key = (r: P[]) => r.map((p) => p.join(',')).sort().join(' ')
    expect(key(sl[0].loops[0] as P[])).toBe(key(PODIUM_U))
    expect(key(sl[16].loops[0] as P[])).toBe(key(TIER_B))
  })
})

describe('ground public-realm cuts are kept where the engine claims them', () => {
  it('reads the ground, podium and tower outlines storey by storey, not one hull', () => {
    expect(readsStoreys(t)).toBe(true)
    const ground = storeyOutline(t, 'ground')!
    expect(ground).toHaveLength(1)
    expect(ground[0][0]).toHaveLength(8)
    expect(areas(ground)).toEqual([3520]) // the hull of the podium would be 4,000 m²
    expect(areas(storeyOutline(t, 'podium')!)).toEqual([3520])
    // Both tiers kept: neither lies within the other.
    expect(areas(storeyOutline(t, 'tower')!)).toEqual([1080, 1080])
    expect(masses([t]).map((m) => [m.kind, m.base, m.height, area(m.poly)])).toEqual([['podium', 0, PODIUM_TOP, 3520], ['tower', PODIUM_TOP, 69.5, 1080], ['tower', PODIUM_TOP, 69.5, 1080]])
  })

  it('counts the civic void as open ground, less the part the shifted tier overhangs', () => {
    const os = openSpace([t], input)
    // 0.5 m raster: within 0.5% (40 m²). The hull reading would leave 480 m² less; ignoring the overhang, 160 m² more.
    expect(Math.abs(os.open - TRUE_OPEN)).toBeLessThan(40)
    // Without the shift (tier B over tier A) the whole void is open.
    const straight = fixtureTower(fixtureStoreys([RUNS[0], RUNS[1], { ...RUNS[2], loops: [TIER_A] }]))
    expect(Math.abs(openSpace([straight], input).open - (SITE_AREA - 3520))).toBeLessThan(40)
  })

  it('sees the void as a break in the street face (massing variation)', () => {
    // The south face is two 28 m runs either side of the 24 m void; one hull would read 80 m unbroken.
    const run = facadeRun(streetwallStoreys(t), [0, -1])
    expect(run.longest).toBeCloseTo(28, 6)
    expect(run.extent).toBeCloseTo(80, 6)
  })

  it('measures the step-back from the shifted tier, not the typical storey', () => {
    const south = streetwallCheck([t], input).edges.find((e) => e.edge.id === 'south')!
    // Podium on the property line; tier B 12 m back, tier A 20 m back.
    expect(south).toMatchObject({ wallHeight: PODIUM_TOP, setback: 0, state: 'pass' })
    expect(south.stepBack).toBeCloseTo(12, 6)
  })

  it('measures tower separation from every tower storey (a tier shifted toward a neighbour)', () => {
    // A residential neighbour east of the tower: tier B (x ≤ 28) is 15 m from it, tier A (x ≤ 16), the typical storey, 27 m.
    const nb: Neighbour = { label: 'Neighbour', footprint: rect(43, -20, 63, 0), height: 100 }
    const sep = rule(towerFormRules([t], [nb]), 'pr-separation')
    expect(sep).toMatchObject({ value: '15.0 m between Shifted void and Neighbour (closest to its limit)', state: 'fail' })
    // An import without storey outlines keeps the old reading (its hull).
    const bare = { ...t, imported: { ...t.imported!, storeys: [] } }
    expect(rule(towerFormRules([bare], [nb]), 'pr-separation').value).toMatch(/^3\.0 m /) // hull x ≤ 40
  })

  it('casts shadows and reads the sky from the true storey outlines', () => {
    const occ = towerOccluders([t]).prisms
    expect(occ.filter((p) => p.z1 <= PODIUM_TOP).map((p) => area(p.ring as P[]))).toEqual([3520, 3520, 3520])
    expect(skyStoreys(t)!.slice(0, 3).map((s) => s.rings.map((r) => area(r as P[])))).toEqual([[3520], [3520], [3520]])
  })

  it('places the outlines with the tower', () => {
    const g = storeyOutline(t, 'ground')![0][0]
    expect(Math.min(...g.map((p) => p[1]))).toBeCloseTo(FIXTURE_Y - 25, 6)
    expect(Math.min(...g.map((p) => p[1]))).toBeCloseTo(-39.67, 6)
  })
})

describe('known limits: not read on a carved or split storey (manual review)', () => {
  it('frontage length and streetwall continuity span the void as if it were wall', () => {
    // The void is 24 m of the 80 m south face; both readings take the part's whole extent.
    expect(frontageCheck([t], input).edges.find((e) => e.edge.id === 'south')!.length).toBeCloseTo(80, 6)
    expect(streetwallCheck([t], input).edges.find((e) => e.edge.id === 'south')!.continuity).toBeCloseTo(80 / edgeLength('south'), 9)
  })

  it('hulls each storey for masses, floor rings, facade area and the footprint', () => {
    // towerMasses / floorRing: one convex hull per storey run, so the void is filled (4,000 m², not 3,520).
    expect(towerMasses(t).map((m) => [m.z0, m.z1, m.podium, area(m.ring as P[])])).toEqual([[0, PODIUM_TOP, true, 4000], [PODIUM_TOP, 53.5, false, 1080], [53.5, 69.5, false, 1080]])
    expect(area(floorRing(t, towerFloors(t)[0]) as P[])).toBe(4000)
    // Facade: hull perimeters, so the void's 2 × 20 m side walls (540 m² over the podium height) are missing.
    expect(faces([t], DEFAULT_FACADE, 0).reduce((s, f) => s + f.area, 0)).toBeCloseTo(260 * PODIUM_TOP + 132 * 40 + 132 * 16, 6)
    // towerFootprint: the median tower storey (tier A) only, and the hull of the podium storeys.
    expect(area(towerFootprint(t) as P[])).toBe(1080)
    expect(Math.max(...towerFootprint(t).map((p) => p[0]))).toBe(16)
    expect(area(towerFootprint(t, true) as P[])).toBe(4000)
    // Plate size proxies: an equivalent rectangle of the median plate, not its outline.
    expect([t.width, t.depth, t.podiumWidth, t.podiumDepth]).toEqual([36, 30, 75, 46.9])
  })

  it('hulls a storey split in two parts (a civic room through the plate) for masses, keeps it for the public realm', () => {
    const split: P[][] = [rect(-20, -5, -6, 25), rect(6, -5, 16, 25)]
    const s = fixtureTower(fixtureStoreys([RUNS[0], { ...RUNS[1], loops: split }, RUNS[2]]))
    expect(area(towerMasses(s)[1].ring as P[])).toBe(1080) // the 12 m gap filled
    expect(areas(storeyOutline(s, 'tower')!)).toEqual([300, 420, 1080])
    expect(skyStoreys(s)![5].rings).toHaveLength(2)
  })

  it('leaves out an open storey that cuts through nothing (a void modelled as a gap, not as a solid)', () => {
    // Storeys 8–10 open (no plate at mid-height): no floor, a gap in the masses. A void modelled as a closed solid slices
    // as floor instead: only the note can say so.
    const st = fixtureStoreys().map((x) => (x.level >= 8 && x.level <= 10 ? { ...x, area: 0, hasFloor: false, loops: [] } : x))
    const o = fixtureTower(st)
    expect(towerFloors(o).map((f) => f.level)).not.toContain(9)
    expect(towerMasses(o).map((m) => [m.z0, m.z1])).toEqual([[0, PODIUM_TOP], [PODIUM_TOP, 29.5], [41.5, 53.5], [53.5, 69.5]])
  })
})
