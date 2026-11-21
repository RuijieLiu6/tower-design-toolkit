// T10 / T11 (vtc-entry tool proposals): an imported tower is read from its stored storey outlines, not from one hull
// of the whole mesh, and its homes and hotel keys are laid out on each storey's own plate. Storeys are built directly
// (no file I/O, no slicing), the way the import pipeline stores them.
import { describe, expect, it } from 'vitest'
import { DEFAULT_ENERGY, areas, pvPotential, type Obstacle } from './energyCarbon'
import { DEFAULT_FACADE, faces } from './facade'
import { towerPatch } from './imported'
import { DEFAULT_INTERIOR, homeFloor, interiorCheck, plateTower } from './interior'
import { floorRing, readsStoreys, towerFloors, towerFootprint, towerMasses } from './massing'
import type { ImportedMass, ImportedStorey, Tower, UseId } from './types'
import { strategyOf, DEFAULT_WIND_PRESETS } from './windComfortInput'
import { DEFAULT_WIND_SCREEN, YVR_ROSE, windScreen, type WindRose } from './windScreen'

type P = [number, number]
const rect = (w: number, d: number, cx = 0, cy = 0): P[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
const area = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)
const bbox = (r: P[]) => ({ x0: Math.min(...r.map((p) => p[0])), x1: Math.max(...r.map((p) => p[0])), y0: Math.min(...r.map((p) => p[1])), y1: Math.max(...r.map((p) => p[1])) })

/** Storeys bottom-up from runs of equal plates (tower frame, m). */
function stack(runs: { n: number; f2f: number; ring: P[]; podium?: boolean; use?: UseId }[]): ImportedStorey[] {
  const out: ImportedStorey[] = []
  let z = 0
  for (const r of runs) for (let i = 0; i < r.n; i++) {
    out.push({ level: out.length + 1, z0: z, z1: z + r.f2f, area: Math.round(area(r.ring) * 10) / 10, use: r.use ?? (r.podium ? 'retail' : 'residential'), podium: !!r.podium, hasFloor: true, loops: [r.ring] })
    z += r.f2f
  }
  return out
}

const base: Tower = { id: 'i', name: 'Imported', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 4, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.2, plantEvery: 0 }

function importedTower(storeys: ImportedStorey[], o: { f2f: number; podiumTop: number; podiumF2F: number }, at: Partial<Tower> = {}): Tower {
  const pts = storeys.flatMap((s) => s.loops.flat())
  const b = bbox(pts)
  const top = storeys[storeys.length - 1].z1
  const mass: ImportedMass = {
    meshId: 'm', fileName: 'test.3dm', format: '3dm', unit: 'm', unitSource: 'confirmed', fileNorthDeg: 0, northSource: 'test', datumShift: 0, datumSource: 'test',
    f2f: o.f2f, podiumTop: o.podiumTop, podiumF2F: o.podiumF2F, storeys,
    // The old reading: the convex hull of the whole mass (here its bounding box, which is the hull of these rectangles).
    hull: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], volume: null, top, health: { block: 0, warn: 0 },
  }
  return { ...base, ...towerPatch(mass), ...at }
}

// A: a 50 × 50 m tower set 17 m east and 2 m north of the centre of a 90 × 60 × 24 m podium (towers A and B).
const podium = rect(90, 60), shaft = rect(50, 50, 17, 2)
const A = importedTower(stack([{ n: 6, f2f: 4, ring: podium, podium: true }, { n: 60, f2f: 4, ring: shaft }]), { f2f: 4, podiumTop: 24, podiumF2F: 4 })
// C: two tiers on a podium, 54 m then 44.28 m (tower C6), 30 and 20 storeys of homes.
const C = importedTower(stack([
  { n: 5, f2f: 4, ring: rect(70, 60), podium: true },
  { n: 30, f2f: 3.2, ring: rect(54, 54) },
  { n: 20, f2f: 3.2, ring: rect(44.28, 44.28) },
]), { f2f: 3.2, podiumTop: 20, podiumF2F: 4 })

describe('T10: an imported tower is read from its storey outlines', () => {
  it('has the tower outline as its footprint, and the podium outline when asked, not the hull of the whole mass', () => {
    expect(readsStoreys(A)).toBe(true)
    const fp = towerFootprint(A)
    expect(area(fp)).toBeCloseTo(2500, 6)
    expect(bbox(fp)).toEqual({ x0: -8, x1: 42, y0: -23, y1: 27 })
    expect(area(towerFootprint(A, true))).toBeCloseTo(5400, 6)
    // Placed with the tower: moved and turned, same size.
    const turned = { ...A, x: 100, y: -40, rotation: 30 }
    expect(area(towerFootprint(turned))).toBeCloseTo(2500, 6)
    const c = towerFootprint(turned).reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0])
    const a = (30 * Math.PI) / 180
    expect(c[0]).toBeCloseTo(100 + 17 * Math.cos(a) - 2 * Math.sin(a), 6)
    expect(c[1]).toBeCloseTo(-40 + 17 * Math.sin(a) + 2 * Math.cos(a), 6)
  })

  it('takes the median tower storey as the footprint of a two-tier tower', () => {
    // 30 storeys at 54 m and 20 at 44.28 m: the median plate by area is on the lower tier.
    expect(area(towerFootprint(C))).toBeCloseTo(54 * 54, 6)
    expect(area(towerFootprint(C, true))).toBeCloseTo(70 * 60, 6)
  })

  it('splits its masses at the podium top and at the tier, and the last mass reaches the top', () => {
    const mA = towerMasses(A)
    expect(mA.map((m) => [m.z0, m.z1, m.podium, Math.round(area(m.ring))])).toEqual([[0, 24, true, 5400], [24, 264, false, 2500]])
    const mC = towerMasses(C)
    expect(mC.map((m) => [+m.z0.toFixed(6), +m.z1.toFixed(6), m.podium, Math.round(area(m.ring))])).toEqual([[0, 20, true, 4200], [20, 116, false, 2916], [116, 180, false, 1961]])
    // A crown above the last storey stays in the mass (height is the top of the mesh).
    expect(towerMasses({ ...C, height: 186 }).at(-1)!.z1).toBe(186)
  })

  it('gives each floor the outline of its own storey', () => {
    const fl = towerFloors(C)
    expect(fl).toHaveLength(55)
    const ringOf = (lv: number) => area(floorRing(C, fl.find((f) => f.level === lv)!))
    expect(ringOf(1)).toBeCloseTo(4200, 6)
    expect(ringOf(6)).toBeCloseTo(2916, 6)
    expect(ringOf(35)).toBeCloseTo(2916, 6)
    expect(ringOf(36)).toBeCloseTo(44.28 * 44.28, 6)
    expect(ringOf(55)).toBeCloseTo(44.28 * 44.28, 6)
  })

  it('merges storeys whose outlines differ only by slicing noise, and splits a real step', () => {
    const noisy = stack([{ n: 4, f2f: 4, ring: rect(50, 50) }, { n: 4, f2f: 4, ring: rect(50, 50) }])
    noisy[5] = { ...noisy[5], loops: [[[-25 + 1e-7, -25], [0, -25 - 1e-9], [25, -25], [25, 25 - 1e-7], [-25, 25]]] } // an extra point along a wall
    noisy[6] = { ...noisy[6], loops: [rect(50.4, 50)] }
    const t = importedTower(noisy, { f2f: 4, podiumTop: 0, podiumF2F: 4 })
    expect(towerMasses(t).map((m) => [m.z0, m.z1])).toEqual([[0, 24], [24, 28], [28, 32]])
    expect(floorRing(t, { z0: 20, z1: 24 })).toHaveLength(4) // the extra point along the wall is dropped
  })

  it('keeps the old reading for a drawn mass and for an import without storey outlines', () => {
    const drawn = { ...A, drawn: { pts: podium, base: 0, floors: 66, f2f: 4 } }
    expect(readsStoreys(drawn)).toBe(false)
    expect(area(towerFootprint(drawn))).toBeCloseTo(90 * 60, 6) // the hull of the whole mass
    expect(towerMasses(drawn)).toHaveLength(1)
    const bare = { ...A, imported: { ...A.imported!, storeys: [] } }
    expect(area(towerFootprint(bare))).toBeCloseTo(90 * 60, 6)
    expect(towerMasses(bare).map((m) => [m.z0, m.z1, m.blockId])).toEqual([[0, 264, 'imported']])
    expect(area(floorRing(bare, { z0: 100, z1: 104 }))).toBeCloseTo(90 * 60, 6)
  })

  it('gives the wind screen a podium step toward the wind (was 0 m for every imported tower)', () => {
    // Every strong hour from one sector at a time. The tower spans x −8…42, y −23…27 on a podium spanning x ±45, y ±30.
    const one = (k: number): WindRose => {
      const bins = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0])
      bins[k] = [20, 20, 10, 10, 0]
      return { ...YVR_ROSE, rose: { 'year.comfort': { hours: 100, calm: 40, variable: 0, bins } } }
    }
    const step = (t: Tower, k: number) => windScreen([t], { northDeg: 0, context: [], contextLoaded: false }, DEFAULT_WIND_SCREEN, one(k)).towers[0].sectors[0].podiumStep
    expect(step(A, 12)).toBeCloseTo(37, 6) // from the west: podium face at x = −45, tower face at x = −8
    expect(step(A, 0)).toBeCloseTo(3, 6) // from the north: 30 − 27 m
    expect(step(A, 8)).toBeCloseTo(7, 6) // from the south: 30 − 23 m
    expect(step({ ...A, drawn: { pts: podium, base: 0, floors: 66, f2f: 4 } }, 12)).toBe(0) // drawn masses as before
  })

  it('gives wind comfort the podium reach of an imported tower, as for a parametric one', () => {
    // towerPatch: a 50 × 50 tower plate on a 90 × 60 podium plate, so the smaller overhang is (60 − 50) / 2 = 5 m.
    expect(strategyOf(A, DEFAULT_WIND_PRESETS)).toMatchObject({ podiumH: 24, podiumExt: 5 })
  })

  it('measures the facade per run: podium walls to the podium top, tower walls above', () => {
    const f = faces([A], DEFAULT_FACADE, 0)
    expect(f.filter((x) => x.part === 'podium').reduce((s, x) => s + x.area, 0)).toBeCloseTo(2 * (90 + 60) * 24, 6)
    expect(f.filter((x) => x.part === 'tower').reduce((s, x) => s + x.area, 0)).toBeCloseTo(4 * 50 * 240, 6)
    expect(areas([A]).wall).toBeCloseTo(2 * (90 + 60) * 24 + 4 * 50 * 240, 6)
  })

  it('finds the podium roof and the setback roof for photovoltaics', () => {
    const ctx = { northDeg: 0, lat: 49.2827, lon: -123.1207, obstacles: [] as Obstacle[], mfa: 1, elec: 1 }
    const pod = pvPotential([A], DEFAULT_ENERGY, ctx).surfaces.find((s) => s.kind === 'podium')
    expect(pod?.area).toBeCloseTo(5400 - 2500, 6)
    const setback = pvPotential([C], DEFAULT_ENERGY, ctx).surfaces.find((s) => s.id === `${C.id}-roof-1`)
    expect(setback?.area).toBeCloseTo(2916 - 44.28 * 44.28, 1)
  })
})

describe('T11: an imported tower lays out each home and hotel floor on its own plate', () => {
  it('sizes each floor from its own storey: the upper tier on the smaller plate', () => {
    const fl = towerFloors(C)
    const low = plateTower(C, fl.find((f) => f.level === 20)!), high = plateTower(C, fl.find((f) => f.level === 50)!)
    expect([low.width, low.depth]).toEqual([C.width, C.depth])
    expect(C.width).toBeCloseTo(54, 6)
    expect(high.width).toBeCloseTo(44.28, 6)
    expect(high.depth).toBeCloseTo(44.28, 6)
    // The core keeps the tower's size.
    expect(Math.sqrt(high.coreShare * high.width * high.depth)).toBeCloseTo(Math.sqrt(C.coreShare * C.width * C.depth), 6)
  })

  it('counts fewer homes on a two-tier tower than if every floor used the median plate', () => {
    const fl = towerFloors(C)
    const homes = interiorCheck(C, fl).totals.homes
    const onTypical = homeFloor(C, DEFAULT_INTERIOR).homes * 50
    const c = Math.sqrt(C.coreShare * C.width * C.depth)
    const upper = homeFloor({ ...C, width: 44.28, depth: 44.28, coreShare: (c * c) / (44.28 * 44.28) }, DEFAULT_INTERIOR).homes
    expect(homes).toBe(homeFloor(C, DEFAULT_INTERIOR).homes * 30 + upper * 20)
    expect(homes).toBeLessThan(onTypical)
  })

  it('keeps every floor on the typical plate for a tower of equal storeys', () => {
    const fl = towerFloors(A)
    expect(interiorCheck(A, fl).totals.homes).toBe(homeFloor(A, DEFAULT_INTERIOR).homes * 60)
  })
})
