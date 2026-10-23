import { describe, expect, it } from 'vitest'
import { guessUnit, guessUpAxis } from '../../engine/meshHealth'
import { bounds, mergeMeshes } from '../../engine/importGeom'
import { towerFloors } from '../../engine/massing'
import { towerPatch } from '../../engine/imported'
import type { Tower } from '../../engine/types'
import { readObj } from './obj'
import { buildMass, healthFor, stageA, stageB, stageC, topology, type ImportOptions, type ProjectFrame } from './pipeline'

/** OBJ text of boxes, y-up, in millimetres (as SketchUp exports by default). */
function objText(boxes: { name: string; b: number[] }[]) {
  const lines: string[] = []
  let base = 1
  for (const { name, b } of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b.map((v) => v * 1000)
    lines.push(`o ${name}`)
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) lines.push(`v ${x} ${z} ${-y}`)
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) lines.push(`f ${f.map((i) => i + base).join(' ')}`)
    base += 8
  }
  return lines.join('\n')
}

const frame: ProjectFrame = { project: 'vtc', northDeg: 45, siteCentre: [0, 0], groundElevation: 15, utmOrigin: null }

describe('import pipeline, end to end', () => {
  const raw = readObj(objText([{ name: 'Podium', b: [-50, -32, 0, 50, 32, 18] }, { name: 'Tower', b: [-20, -20, 0, 20, 20, 285] }]), 'massing.obj')
  const all = bounds(mergeMeshes(raw.objects.map((o) => o.mesh)))
  const upAxis = guessUpAxis(all)
  const unit = guessUnit({ height: all.max[1] - all.min[1], width: all.max[0] - all.min[0], depth: all.max[2] - all.min[2] })
  const opts: ImportOptions = { excluded: [], unit, unitConfirmed: true, upAxis, placement: 'keep', offset: [0, 0], datum: 'zero', dz: 0, north: 'true', northDeg: 0, f2f: 4.2, podiumTop: null, podiumF2F: 4.5 }
  const A = stageA(raw, opts)
  const topo = topology(A.mesh)
  const B = stageB(raw, A, opts, frame)
  const C = stageC(B.local, topo, opts, { bands: [{ use: 'office', share: 1 }], podiumUse: 'retail' })
  const health = healthFor(B, topo, C, frame, unit)

  it('guesses millimetres and y-up for a SketchUp-style OBJ', () => {
    expect(upAxis).toBe('y')
    expect(unit).toBe('mm')
    expect(A.bounds.max[2]).toBeCloseTo(285, 6)
  })
  it('turns a true-north file 45° clockwise into the VTC frame', () => {
    expect(B.rotation).toBeCloseTo(-45, 6)
    expect(B.fileNorthDeg).toBe(0)
  })
  it('reads a magnetic arrow as true north 15.4° counter-clockwise of +Y', () => {
    const m = stageB(raw, A, { ...opts, north: 'magnetic' }, frame)
    expect(m.fileNorthDeg).toBeCloseTo(-15.4, 6)
    expect(m.rotation).toBeCloseTo(-60.4, 6)
  })
  it('finds the podium, slices storeys and counts the overlap once', () => {
    expect(C.podiumTop).toBe(18)
    const pod = C.storeys.filter((s) => s.podium)
    expect(pod).toHaveLength(4)
    expect(pod[0].area).toBeCloseTo(6400, 0)
    expect(C.overlapArea).toBeGreaterThan(0)
    expect(health.find((h) => h.id === 'overlap')?.severity).toBe('warn')
    expect(health.find((h) => h.id === 'units')?.severity).toBe('pass')
  })
  it('agrees with the mesh volume for straight walls (plate-sum check)', () => {
    // Overlapping solids: the divergence volume double-counts the overlap, so compare a single-solid file.
    const one = readObj(objText([{ name: 'Tower', b: [-20, -20, 0, 20, 20, 285] }]), 'one.obj')
    const a1 = stageA(one, opts), t1 = topology(a1.mesh), b1 = stageB(one, a1, opts, frame)
    const c1 = stageC(b1.local, t1, opts, { bands: [{ use: 'office', share: 1 }], podiumUse: 'retail' })
    const sum = c1.storeys.reduce((s, x) => s + x.area * (x.z1 - x.z0), 0)
    expect(Math.abs(sum - (c1.volume ?? 0)) / (c1.volume ?? 1)).toBeLessThan(0.005)
  })
  it('integrates the plate union when solids overlap, so the check stays honest', () => {
    const sum = C.storeys.reduce((s, x) => s + x.area * (x.z1 - x.z0), 0)
    expect(C.volume).not.toBeNull()
    expect(Math.abs(sum - (C.volume ?? 0)) / (C.volume ?? 1)).toBeLessThan(0.005)
  })
  it('becomes a tower the existing checks read', () => {
    const mass = buildMass(raw, opts, B, C, health, 'm1')
    const base: Tower = { id: 'i', name: 'i', x: B.x, y: B.y, rotation: B.rotation, width: 1, depth: 1, height: 1, f2f: 4.2, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.25, plantEvery: 0 }
    const t = { ...base, ...towerPatch(mass) }
    const floors = towerFloors(t)
    expect(floors.length).toBe(C.storeys.filter((s) => s.hasFloor).length)
    expect(floors.reduce((s, f) => s + f.area, 0)).toBeCloseTo(4 * 6400 + (floors.length - 4) * 1600, -1)
    expect(mass.unitSource).toBe('confirmed')
    expect(mass.fileNorthDeg).toBe(0)
  })
})
