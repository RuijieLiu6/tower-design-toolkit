import { describe, expect, it } from 'vitest'
import { bounds, convexHull, detectPodiumTop, mergeMeshes, plateAt, signedSegmentArea, signedVolume, sliceSegments, storeySchedule, transformMesh, unionSegmentArea } from './importGeom'
import { importedFloors, sliceStoreys, tagByBands, towerPatch } from './imported'
import { towerFloors } from './massing'
import type { ImportedMass, Tower } from './types'
import { box } from './testMeshes'

describe('slicing a known box', () => {
  const tower = box(-20, -20, 0, 20, 20, 280)
  it('cuts a 40 x 40 m plate at any height, and the volume is exact', () => {
    expect(unionSegmentArea(sliceSegments(tower, 100))).toBeCloseTo(1600, 6)
    expect(signedSegmentArea(sliceSegments(tower, 100))).toBeCloseTo(1600, 6)
    expect(signedVolume(tower)).toBeCloseTo(40 * 40 * 280, 3)
    expect(sliceSegments(tower, 300)).toHaveLength(0)
  })
  it('chains the cut into one counter-clockwise ring', () => {
    const p = plateAt(tower, 50)
    expect(p.loops).toHaveLength(1)
    expect(p.loops[0]).toHaveLength(4)
    expect(p.open).toBe(0)
  })
  it('gives the expected storey count and plate area per storey', () => {
    const s = sliceStoreys(tower, { f2f: 4, podiumTop: 0, podiumF2F: 4.5 })
    expect(s).toHaveLength(70)
    for (const x of s) expect(x.area).toBeCloseTo(1600, 1)
    expect(s.reduce((a, x) => a + x.area, 0)).toBeCloseTo(70 * 1600, 0)
  })
  it('counts the overlap of two un-joined boxes once', () => {
    // Podium 100 x 64 x 18 overlapping the tower: a plain shoelace sum would double-count the tower inside it.
    const m = mergeMeshes([box(-50, -32, 0, 50, 32, 18), tower])
    const seg = sliceSegments(m, 9)
    expect(signedSegmentArea(seg)).toBeCloseTo(6400 + 1600, 3)
    expect(unionSegmentArea(seg)).toBeCloseTo(6400, 3)
  })
  it('finds the podium step and slices podium storeys at about 4.5 m', () => {
    const m = mergeMeshes([box(-50, -32, 0, 50, 32, 18), tower])
    expect(detectPodiumTop(m, 280)).toBe(18)
    const s = sliceStoreys(m, { f2f: 4.2, podiumTop: 18, podiumF2F: 4.5 })
    expect(s.filter((x) => x.podium)).toHaveLength(4)
    expect(s.filter((x) => x.podium).every((x) => Math.abs(x.area - 6400) < 0.5)).toBe(true)
    expect(s.filter((x) => !x.podium)).toHaveLength(Math.floor((280 - 18) / 4.2))
  })
  it('measures a tapered tower at mid-height', () => {
    // Pyramid frustum: 40 m square at the base to 20 m at 100 m. Mid-height of storey 1 (z 2) is 39.6 m wide.
    const positions = new Float64Array([-20, -20, 0, 20, -20, 0, 20, 20, 0, -20, 20, 0, -10, -10, 100, 10, -10, 100, 10, 10, 100, -10, 10, 100])
    const m = { positions, indices: box(0, 0, 0, 1, 1, 1).indices }
    const s = sliceStoreys(m, { f2f: 4, podiumTop: 0, podiumF2F: 4.5 })
    expect(s[0].area).toBeCloseTo(39.6 * 39.6, 1)
  })
})

describe('geometry helpers', () => {
  it('turns a y-up mm file into z-up metres', () => {
    const m = transformMesh(box(0, 0, 0, 1000, 280000, 1000), { yUp: true, scale: 0.001 })
    const b = bounds(m)
    expect(b.max[2] - b.min[2]).toBeCloseTo(280, 6)
  })
  it('builds a counter-clockwise convex hull', () => {
    const h = convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]])
    expect(h).toHaveLength(4)
  })
  it('stacks the schedule without gaps', () => {
    const s = storeySchedule(285, 4.2, 18, 4.5)
    for (let i = 1; i < s.length; i++) expect(s[i].z0).toBeCloseTo(s[i - 1].z1, 9)
  })
})

describe('imported tower feeds the existing checks', () => {
  const m = mergeMeshes([box(-50, -32, 0, 50, 32, 18), box(-20, -20, 0, 20, 20, 285)])
  const storeys = tagByBands(sliceStoreys(m, { f2f: 4.2, podiumTop: 18, podiumF2F: 4.5 }), [{ use: 'office', share: 0.7 }, { use: 'residential', share: 0.3 }], 'retail')
  const mass: ImportedMass = {
    meshId: 'x', fileName: 'test.obj', format: 'obj', unit: 'm', unitSource: 'confirmed', fileNorthDeg: null, northSource: 'unresolved',
    datumShift: 0, datumSource: 'z = 0 is the entrance floor', f2f: 4.2, podiumTop: 18, podiumF2F: 4.5, storeys,
    hull: [[-50, -32], [50, -32], [50, 32], [-50, 32]], volume: null, top: 285, health: { block: 0, warn: 0 },
  }
  const base: Tower = { id: 'i1', name: 'Imported', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 4.2, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.25, plantEvery: 0 }
  const t: Tower = { ...base, ...towerPatch(mass) }
  it('takes its floors from the slices', () => {
    const f = towerFloors(t)
    expect(f).toHaveLength(storeys.length)
    expect(f.filter((x) => x.podium).every((x) => x.use === 'retail' && Math.abs(x.area - 6400) < 0.5)).toBe(true)
    expect(f.filter((x) => x.use === 'residential').length).toBeGreaterThan(0)
  })
  it('uses an equivalent rectangle of the typical plate', () => {
    expect(t.width * t.depth).toBeCloseTo(1600, -1)
    expect(t.height).toBe(285)
  })
  it('applies sky lobbies and plant floors like a box tower', () => {
    const sky = towerFloors({ ...t, skyLobbies: [30], plantEvery: 20 })
    expect(sky.find((x) => x.level === 30)?.skyLobby).toBe(true)
    expect(sky.filter((x) => x.use === 'mechanical').length).toBeGreaterThan(0)
    expect(importedFloors(t)).toEqual(towerFloors(t))
  })
})
