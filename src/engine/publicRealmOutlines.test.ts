// G10 (vtc-entry tool deficits, 21 Nov): the public-realm checks read an imported podium by its true storey outlines,
// not one convex hull (A10a's forum cut between a pavilion and the main podium stayed invisible). Storeys are built
// directly, the way the import pipeline stores them (as importedStoreys.test.ts).
import { describe, expect, it } from 'vitest'
import { towerPatch } from './imported'
import { storeyOutline } from './massing'
import { DEFAULT_PUBLIC_REALM, SITE_AREA, VTC_SITE, cityLinkGeometry, cityOpenSpace, frontageCheck, groundPlaneCheck, masses, openSpace, streetwallCheck, type PublicRealmInput } from './publicRealm'
import type { ImportedMass, ImportedStorey, RuleResult, Tower, UseId } from './types'

type P = [number, number]
const rect = (w: number, d: number, cx = 0, cy = 0): P[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
const area = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)

/** Storeys bottom-up from runs of equal plates (project frame: the tower stands at 0, 0, unturned). */
function stack(runs: { n: number; f2f: number; loops: P[][]; podium?: boolean; use?: UseId }[]): ImportedStorey[] {
  const out: ImportedStorey[] = []
  let z = 0
  for (const r of runs) for (let i = 0; i < r.n; i++) {
    out.push({ level: out.length + 1, z0: z, z1: z + r.f2f, area: r.loops.reduce((s, l) => s + area(l), 0), use: r.use ?? (r.podium ? 'retail' : 'office'), podium: !!r.podium, hasFloor: true, loops: r.loops })
    z += r.f2f
  }
  return out
}
const base: Tower = { id: 'i', name: 'Imported', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 4, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.2, plantEvery: 0 }
function importedTower(storeys: ImportedStorey[], podiumTop: number): Tower {
  const pts = storeys.flatMap((s) => s.loops.flat())
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const mass: ImportedMass = {
    meshId: 'm', fileName: 'test.3dm', format: '3dm', unit: 'm', unitSource: 'confirmed', fileNorthDeg: 0, northSource: 'test', datumShift: 0, datumSource: 'test',
    f2f: 4, podiumTop, podiumF2F: 4.5, storeys,
    // The whole-mesh hull (here the bounding box, the hull of these rectangles).
    hull: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], volume: null, top: storeys[storeys.length - 1].z1, health: { block: 0, warn: 0 },
  }
  return { ...base, ...towerPatch(mass) }
}

const input: PublicRealmInput = DEFAULT_PUBLIC_REALM
const withLink = (offset: number, openToSky = true): PublicRealmInput => ({ ...input, link: { ...input.link, axis: 'ns', offset, width: 9.1, openToSky } })
const rule = (rules: RuleResult[], id: string) => rules.find((r) => r.id === id)!
const site: P[] = [[VTC_SITE.xMin, VTC_SITE.yMin], [VTC_SITE.xMax, VTC_SITE.yMin], [VTC_SITE.xMax, VTC_SITE.yMax], [VTC_SITE.xMin, VTC_SITE.yMax]]

// (1) A podium in two parts, 18 m high: a 30 × 60 m pavilion (x −60…−30) and a 60 × 60 m main podium (x 0…60), with a
// 30 m open gap between them (x −30…0); a 40 × 40 m tower on the main part. Its hull would be 120 × 60 m.
const pavilion = rect(30, 60, -45, 0), main = rect(60, 60, 30, 0), shaft = rect(40, 40, 30, 0)
const split = importedTower(stack([{ n: 4, f2f: 4.5, loops: [pavilion, main], podium: true }, { n: 50, f2f: 4, loops: [shaft] }]), 18)

describe('G10: a podium in separate parts is read part by part', () => {
  it('keeps the two podium parts apart, not one hull', () => {
    const pod = storeyOutline(split, 'podium')!
    expect(pod).toHaveLength(2)
    expect(pod.map((pg) => area(pg[0])).sort((a, b) => a - b)).toEqual([1800, 3600])
    expect(storeyOutline(split, 'ground')!.map((pg) => area(pg[0])).sort((a, b) => a - b)).toEqual([1800, 3600])
    expect(storeyOutline(split, 'tower')!.map((pg) => area(pg[0]))).toEqual([1600])
    expect(masses([split]).map((m) => [m.kind, Math.round(area(m.poly))])).toEqual(expect.arrayContaining([['podium', 1800], ['podium', 3600], ['tower', 1600]]))
  })

  it('counts the 30 m gap as open ground and finds the square in it', () => {
    const os = openSpace([split], input)
    // 0.5 m raster: within 1% of the true open area (the hull reading left 1,800 m² less).
    expect(Math.abs(os.open - (SITE_AREA - 5400)) / (SITE_AREA - 5400)).toBeLessThan(0.01)
    expect(os.open).toBeGreaterThan(SITE_AREA - 7200 + 1700)
    // The gap runs from the high street to the north street: 30 × 79.25 m, the largest clear rectangle.
    expect(os.largest!.x0).toBeCloseTo(-30, 0)
    expect(os.largest!.x1).toBeCloseTo(0, 0)
    expect(os.largest!.y1 - os.largest!.y0).toBeCloseTo(79.25, 1)
    const g = groundPlaneCheck([split], withLink(-15))
    expect(rule(g.rules, 'pr-open-share').value).toMatch(/^4[0-9]% /)
    expect(rule(g.rules, 'pr-pops-shape').value).toMatch(/^30\.\d × 79\.3 m/)
  })

  it('reads a link placed in the gap as clear of the buildings', () => {
    const g = groundPlaneCheck([split], withLink(-15))
    expect(g.link!.through).toBe('clear')
    expect(rule(g.rules, 'pr-link-sky')).toMatchObject({ value: 'Clear of the buildings, open to the sky', state: 'pass' })
    // Through the pavilion it cuts the podium; over the main part it passes under the tower.
    expect(groundPlaneCheck([split], withLink(-45)).link!.through).toBe('podium')
    expect(groundPlaneCheck([split], withLink(30)).link!.through).toBe('tower')
  })

  it('measures the frontage at grade without the gap', () => {
    const f = frontageCheck([split], input)
    // South: 30 m of pavilion and 60 m of main podium (the hull gave 120 m).
    expect(f.edges.find((e) => e.edge.id === 'south')!.length).toBeCloseTo(90, 6)
    expect(f.edges.find((e) => e.edge.id === 'west')!.length).toBeCloseTo(60, 6)
  })

  it('does the same on Real Vancouver: the open ground and the link across the gap', () => {
    const os = cityOpenSpace([split], site, 0.85)
    expect(os.built).toBeGreaterThan(5400 * 0.98)
    expect(os.built).toBeLessThan(5400 * 1.02)
    // The site's frame is centred on the block (x = 0) and runs along x, so a link across at −15 sits in the gap.
    const link = { enabled: true, along: false, offset: -15, width: 9.1, openToSky: true, srw: true }
    expect(cityLinkGeometry([split], site, link)!.through).toBe('clear')
    expect(cityLinkGeometry([split], site, { ...link, offset: -45 })!.through).toBe('podium')
  })

  it('counts a gap bridged by an upper podium storey as covered (open ground is free of overhead mass)', () => {
    // A10a's covered passage-room: the top podium storey spans the gap.
    const bridged = importedTower(stack([
      { n: 3, f2f: 4.5, loops: [pavilion, main], podium: true },
      { n: 1, f2f: 4.5, loops: [rect(120, 60, 0, 0)], podium: true },
      { n: 50, f2f: 4, loops: [shaft] },
    ]), 18)
    expect(storeyOutline(bridged, 'podium')!.map((pg) => area(pg[0]))).toEqual([7200])
    // The ground storey still has the gap: the frontage at grade is 90 m.
    expect(frontageCheck([bridged], input).edges.find((e) => e.edge.id === 'south')!.length).toBeCloseTo(90, 6)
    expect(Math.abs(openSpace([bridged], input).open - (SITE_AREA - 7200)) / (SITE_AREA - 7200)).toBeLessThan(0.01)
    const g = groundPlaneCheck([bridged], withLink(-15, false))
    expect(rule(g.rules, 'pr-link-sky').value).toBe('Covered passage under the podium')
  })

  it('leaves a courtyard in a podium storey open', () => {
    // Outer ring counter-clockwise, the courtyard clockwise (as the slicer stores them).
    const court = rect(20, 20, 30, 0).reverse()
    const ring = importedTower(stack([{ n: 4, f2f: 4.5, loops: [main, court], podium: true }, { n: 50, f2f: 4, loops: [rect(10, 10, 50, 20)] }]), 18)
    const pod = storeyOutline(ring, 'podium')!
    expect(pod).toHaveLength(1)
    expect(pod[0]).toHaveLength(2) // outer ring and its hole
    // The 10 × 10 m tower stands on the podium beside the courtyard, so the 400 m² courtyard is all the podium leaves open.
    expect(Math.abs(openSpace([ring], input).open - (SITE_AREA - 3600 + 400)) / SITE_AREA).toBeLessThan(0.005)
  })
})

// (2) A single box podium, on the high street and the arterial: the readings from before the change (main 43c28f3).
const cx = VTC_SITE.xMin + 50, cy = VTC_SITE.yMin + 32
const box = importedTower(stack([{ n: 4, f2f: 4.5, loops: [rect(100, 64, cx, cy)], podium: true }, { n: 66, f2f: 4, loops: [rect(46, 46, cx, cy)] }]), 18)
const twin: Tower = { ...base, id: 'b', name: 'Box', x: cx, y: cy, width: 46, depth: 46, height: 282, f2f: 4, podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, bands: [{ use: 'office', share: 1 }] }

describe('a single box podium reads as before', () => {
  it('keeps open space, POPS, transit plaza and the link', () => {
    const os = openSpace([box], input)
    expect(os.open).toBeCloseTo(5103.62059531555, 6)
    expect(os.built).toBeCloseTo(6370.19440468445, 6)
    expect(os.transitPlaza).toBe(false)
    expect(os.largest).toEqual({ area: 3560.8391379310347, x0: 27.458275862068973, x1: 72.39, y0: -39.67, y1: 39.58 })
    const read = (offset: number) => { const g = groundPlaneCheck([box], withLink(offset)); return [g.link!.through, ...g.rules.filter((r) => /^pr-(open-share|pops|pops-shape|transit-plaza|link-sky)$/.test(r.id)).map((r) => `${r.value} | ${r.state}`)] }
    const common = ['38% (4,338 m² of 11,474 m²) | pass', '3,561 m² in the largest clear rectangle of open ground (31%) | pass', '44.9 × 79.3 m (1:1.8), 3,561 m² | pass', 'No 6.1 × 6.1 m clear space near the south-west corner | fail']
    expect(read(40)).toEqual(['clear', ...common, 'Clear of the buildings, open to the sky | pass'])
    expect(read(15)).toEqual(['podium', ...common, 'Cuts through the podium, open to the sky | warn'])
    expect(read(-22)).toEqual(['tower', ...common, 'Passes under the tower | fail'])
    const c = cityOpenSpace([box], site, 0.85)
    expect(c.open).toBeCloseTo(5103.6205953155495, 6)
    expect(c.largest).toEqual({ area: 3560.8391379310347, x0: 27.458275862068973, x1: 72.39, y0: -39.625, y1: 39.625 })
  })

  it('keeps the frontage, the streetwalls, continuity and step-back', () => {
    expect(frontageCheck([box], input).edges.map((e) => [e.edge.id, e.length])).toEqual([['south', 100], ['west', 64], ['north', 100], ['east', 64]])
    const s = streetwallCheck([box], input)
    const walls = s.edges.map((e) => [e.edge.id, e.wallHeight, e.stepBack, e.setback, e.state])
    expect(walls).toEqual([['south', 18, 9, 0, 'pass'], ['west', 18, 27, 0, 'pass'], ['north', 18, 9, 15.25, 'pass'], ['east', 18, 27, 44.78, 'pass']])
    expect(s.edges[0].continuity).toBeCloseTo(0.6907031357922365, 12)
    expect(s.edges[1].continuity).toBeCloseTo(0.807570977917981, 12)
    const lines = s.rules.filter((r) => /^pr-(podium|stepback|continuity)/.test(r.id)).map((r) => `${r.id}: ${r.value} | ${r.state}`)
    expect(lines).toEqual([
      'pr-podium-south: 18.0 m on a 24.3 m street (height to width 0.74) | pass',
      'pr-podium-west: 18.0 m on a 30.2 m street (height to width 0.60) | pass',
      'pr-podium-north: 18.0 m on a 20.1 m street (height to width 0.90) | pass',
      'pr-podium-east: 18.0 m on a 20.1 m street (height to width 0.90) | pass',
      'pr-stepback: 9.0 m at the least | pass',
      'pr-continuity-south: 69% within 1 m of the property line (nearest face 0.0 m back) | warn',
      'pr-continuity-west: 81% within 1 m of the property line (nearest face 0.0 m back) | pass',
    ])
  })

  it('reads the same as the parametric box it describes', () => {
    expect(openSpace([box], input)).toEqual(openSpace([twin], input))
    expect(frontageCheck([box], input).edges.map((e) => e.length)).toEqual(frontageCheck([twin], input).edges.map((e) => e.length))
    const w = (t: Tower) => streetwallCheck([t], input).edges.map((e) => [e.wallHeight, e.stepBack, e.setback, e.continuity, e.state])
    expect(w(box)).toEqual(w(twin))
    for (const offset of [40, 15, -22]) expect(groundPlaneCheck([box], withLink(offset)).link).toEqual(groundPlaneCheck([twin], withLink(offset)).link)
  })
})
