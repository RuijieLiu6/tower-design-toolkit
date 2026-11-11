// Returned storeys (tower-local loops, metres, z up) as the Toolkit's imported mass: the storey schedule the checks
// read (engine/imported.ts ImportedStorey) and a closed prism mesh per storey for the viewport (the pattern of the
// generated towers, lib/generateTowers.ts). The geometry is externally generated: the Massing sliders do not reshape it.
import { ShapeUtils, Vector2 } from 'three'
import { MIN_FLOOR_AREA } from '../../engine/imported'
import type { ImportedMass, ImportedStorey, UseId } from '../../engine/types'
import type { MeshEntry } from '../import/store'
import { ringArea } from './validate'
import type { ProposalStorey } from './contract'

type Pt = [number, number]
const r2 = (v: number) => Math.round(v * 100) / 100

/** Outer loops counter-clockwise, holes clockwise (the storey convention), whatever the tool sent. */
export function orientLoops(loops: Pt[][]): Pt[][] {
  return loops.map((l, i) => { const ccw = ringArea(l) > 0; return (i === 0) === ccw ? l : [...l].reverse() })
}

/** The convex hull of the points (Andrew's monotone chain), counter-clockwise. */
export function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  const upper: Pt[] = []
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** A closed prism of one storey (outer loop with holes) between z0 and z1: caps triangulated, walls as quads. */
export function prism(loops: Pt[][], z0: number, z1: number): { positions: number[]; indices: number[] } {
  const outer = loops[0], holes = loops.slice(1)
  const positions: number[] = [], indices: number[] = []
  const all = [outer, ...holes]
  const base = all.map((l) => { const off = positions.length / 3; for (const [x, y] of l) positions.push(x, y, z0); return off })
  const top = all.map((l) => { const off = positions.length / 3; for (const [x, y] of l) positions.push(x, y, z1); return off })
  const tris = ShapeUtils.triangulateShape(outer.map(([x, y]) => new Vector2(x, y)), holes.map((h) => h.map(([x, y]) => new Vector2(x, y))))
  const at = (li: number, k: number, up: boolean) => (up ? top : base)[li] + k
  // triangulateShape indexes the outer points then each hole's, in order
  const idx = (k: number, up: boolean) => { let li = 0, n = k; while (n >= all[li].length) { n -= all[li].length; li++ } return at(li, n, up) }
  for (const [a, b, c] of tris) { indices.push(idx(a, true), idx(b, true), idx(c, true)); indices.push(idx(a, false), idx(c, false), idx(b, false)) }
  all.forEach((l, li) => { for (let k = 0; k < l.length; k++) { const n = (k + 1) % l.length, a = at(li, k, false), b = at(li, n, false), c = at(li, n, true), d = at(li, k, true); indices.push(a, b, c, a, c, d) } })
  return { positions, indices }
}

export interface MassMeta { meshId: string; toolName: string; f2f: number; podiumUse: UseId; bandUse: UseId }

/** The storeys as an imported mass and its mesh. Uses come from the proposal where given, else podium/tower uses. */
export function massFromStoreys(input: ProposalStorey[], meta: MassMeta): { mass: ImportedMass; mesh: MeshEntry } {
  const positions: number[] = [], indices: number[] = []
  const corners: Pt[] = []
  let volume = 0
  const storeys: ImportedStorey[] = input.map((s, i) => {
    const loops = orientLoops(s.loops)
    const area = loops.reduce((sum, l) => sum + ringArea(l), 0) // holes are clockwise: they subtract
    const m = prism(loops, s.z0, s.z1), off = positions.length / 3
    positions.push(...m.positions); indices.push(...m.indices.map((k) => k + off))
    volume += area * (s.z1 - s.z0)
    corners.push(...loops[0])
    const podium = !!s.podium
    return { level: i + 1, z0: r2(s.z0), z1: r2(s.z1), area: Math.round(area * 10) / 10, use: s.use ?? (podium ? meta.podiumUse : meta.bandUse), podium, hasFloor: area >= MIN_FLOOR_AREA, loops }
  })
  const podiumTop = Math.max(0, ...storeys.filter((s) => s.podium).map((s) => s.z1))
  const towerStoreys = storeys.filter((s) => !s.podium)
  const f2f = towerStoreys.length ? r2((towerStoreys[towerStoreys.length - 1].z1 - towerStoreys[0].z0) / towerStoreys.length) : meta.f2f
  const podiumStoreys = storeys.filter((s) => s.podium)
  const podiumF2F = podiumStoreys.length ? r2(podiumTop / podiumStoreys.length) : 4.5
  const top = Math.max(...storeys.map((s) => s.z1))
  const mass: ImportedMass = {
    meshId: meta.meshId, fileName: `${meta.toolName} (connected tool)`, format: 'design-tool', unit: 'm', unitSource: 'chosen',
    fileNorthDeg: null, northSource: 'Tower-local frame: the tower keeps its own position and rotation', datumShift: 0, datumSource: 'Site grade, z = 0 (tool frame)',
    f2f, podiumTop: r2(podiumTop), podiumF2F, storeys, hull: hull(corners).map(([x, y]) => [r2(x), r2(y)] as Pt), volume: Math.round(volume), top: r2(top), health: { block: 0, warn: 0 },
  }
  const mesh: MeshEntry = {
    positions: new Float32Array(positions), indices: new Uint32Array(indices), openSegments: new Float32Array(0), flippedTriangles: new Uint32Array(0), health: [],
    report: { objects: storeys.length, triangles: indices.length / 3, sources: [`Returned by ${meta.toolName}`], skipped: [], notes: [], unitNote: 'Metres, tower-local frame, z up (as the tool declared)', northNote: 'The tower keeps its own rotation' },
  }
  return { mass, mesh }
}
