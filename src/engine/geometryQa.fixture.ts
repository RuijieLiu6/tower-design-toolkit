// Geometry QA fixture (docs/geometry-qa.md): the smallest imported tower that is both shifted and carved. Generated
// here, not a design model. Tower frame, metres, z = 0 at the entrance floor; outer rings counter-clockwise, as the
// slicer stores them.
//
//   L1–L3   podium, 4.5 m storeys: an 80 × 50 m plate with one large civic void carved out of its south side,
//           24 m wide and 20 m deep, open to the street and to the sky (a U-shaped plate, 3,520 m²).
//   L4–L13  tower tier A, 4 m storeys: 36 × 30 m, on the north half of the podium (x −20…16, y −5…25).
//   L14–L17 tower tier B, 4 m storeys: the same plate shifted 12 m east and 8 m south (x −8…28, y −13…17), so it
//           overhangs 20 × 8 m of the civic void.
//
// Placed at (0, FIXTURE_Y) on the competition block, the podium's south face lies on the south property line.
import { convexHull, type MeshData } from './importGeom'
import { towerPatch } from './imported'
import type { ImportedMass, ImportedStorey, Tower, UseId } from './types'

export type P = [number, number]

export const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
export const area = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)

/** The podium plate: 80 × 50 m less the civic void (x −12…12, y −25…−5), counter-clockwise. */
export const PODIUM_U: P[] = [[-40, -25], [-12, -25], [-12, -5], [12, -5], [12, -25], [40, -25], [40, 25], [-40, 25]]
/** The civic void at grade (tower frame). */
export const VOID = rect(-12, -25, 12, -5)
export const TIER_A = rect(-20, -5, 16, 25)
export const TIER_B = rect(-8, -13, 28, 17)
/** Part of the civic void under tier B (tower frame): 20 × 8 m. */
export const VOID_UNDER_B = rect(-8, -13, 12, -5)

export const PODIUM_TOP = 13.5
/** Tower y on the competition block: the podium's south face on the south property line (y −39.67). */
export const FIXTURE_Y = -39.67 + 25

interface Run { n: number; f2f: number; loops: P[][]; podium?: boolean; use?: UseId }
export const RUNS: Run[] = [
  { n: 3, f2f: 4.5, loops: [PODIUM_U], podium: true, use: 'retail' },
  { n: 10, f2f: 4, loops: [TIER_A] },
  { n: 4, f2f: 4, loops: [TIER_B] },
]

/** Storeys bottom-up, the way the import pipeline stores them (no file, no slicing). */
export function fixtureStoreys(runs: Run[] = RUNS): ImportedStorey[] {
  const out: ImportedStorey[] = []
  let z = 0
  for (const r of runs) for (let i = 0; i < r.n; i++) {
    out.push({ level: out.length + 1, z0: z, z1: z + r.f2f, area: r.loops.reduce((s, l) => s + area(l), 0), use: r.use ?? 'office', podium: !!r.podium, hasFloor: true, loops: r.loops })
    z += r.f2f
  }
  return out
}

const base: Tower = { id: 'qa', name: 'Shifted void', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 4, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.2, plantEvery: 0 }

/** The imported tower: storeys, the whole-mass convex hull (as `hullOf` stores it) and the fields `towerPatch` derives. */
export function fixtureTower(storeys: ImportedStorey[] = fixtureStoreys(), at: Partial<Tower> = {}): Tower {
  const mass: ImportedMass = {
    meshId: 'qa', fileName: 'fixture.3dm', format: '3dm', unit: 'm', unitSource: 'confirmed', fileNorthDeg: 0, northSource: 'fixture', datumShift: 0, datumSource: 'fixture',
    f2f: 4, podiumTop: storeys.some((s) => s.podium) ? PODIUM_TOP : 0, podiumF2F: 4.5, storeys,
    hull: convexHull(storeys.flatMap((s) => s.loops.flat()) as P[]),
    volume: null, top: storeys[storeys.length - 1].z1, health: { block: 0, warn: 0 },
  }
  return { ...base, ...towerPatch(mass), x: 0, y: FIXTURE_Y, ...at }
}

/**
 * The same massing as a triangle mesh: the walls of three stacked prisms (the slicer cuts walls only, so the caps are
 * left out), normals facing out. For the slicing tests: mesh → storeys without a file.
 */
export function fixtureMesh(): MeshData {
  const positions: number[] = [], indices: number[] = []
  const prism = (ring: P[], z0: number, z1: number) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], k = positions.length / 3
      positions.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z1)
      indices.push(k, k + 1, k + 2, k, k + 2, k + 3)
    }
  }
  prism(PODIUM_U, 0, PODIUM_TOP)
  prism(TIER_A, PODIUM_TOP, PODIUM_TOP + 40)
  prism(TIER_B, PODIUM_TOP + 40, PODIUM_TOP + 56)
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) }
}
