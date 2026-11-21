import { describe, expect, it } from 'vitest'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import type { Pt } from '../shadow'
import type { ClimatePayload, Prism } from './types'
import { porousDrag, runWindStudy, screenK, towerZones, treeDrag, type PorousObstacle } from './wind'
import { massing } from '../../lib/swRun'
import type { ImportedStorey, Tower } from '../types'

const C = climateJson as unknown as ClimatePayload
const sq = (cx: number, cy: number, w: number, d = w): Pt[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]

// A tower east of an open plaza, the wind from the west (true north = frame +y): the plaza is upwind of the tower.
const PLAZA = sq(-10, 0, 40)
const TOWER = { towers: [{ id: 't', name: 'T', height: 60, blocks: [{ ring: sq(60, 0, 20), z0: 0, z1: 60, podium: false }] }] }
const site = (context: Prism[] = []) => ({ project: 'vtc', ring: PLAZA, context, latLon: [49.28, -123.12], northDeg: 0, ground: 0 }) as never
const run = (porous?: PorousObstacle[], context: Prism[] = []) =>
  runWindStudy(site(context), TOWER as never, C, { season: 'year', cell: 4, single: { dir: 270, speed: 5 }, ...(porous ? { porous } : {}) })
// A row of trees 15 m upwind of the plaza: 8 m crowns every 8 m, crown 2–10 m.
const row = (porosity: number): PorousObstacle[] => Array.from({ length: 13 }, (_, i) => ({ kind: 'tree', at: [-45, -48 + i * 8] as Pt, crown: 8, base: 2, top: 10, porosity }))
// A solid wall in the same place and to the same height, 4 m thick.
const WALL: Prism[] = [{ ring: sq(-45, 0, 4, 104), z0: 0, z1: 10 }]

describe('wind: trees and porous screens (G13)', () => {
  const none = run()
  const trees = run(row(0.3))
  const wall = run(undefined, WALL)
  it('a row of porous trees upwind calms the plaza, but less than a solid wall of the same height', () => {
    expect(trees.porousArea).toBeGreaterThan(0)
    // Within the Studio's short spin-up run the crowns' wake is shallow (about 2% here); a solid wall reads ~65%.
    expect(trees.sitePeakMean!).toBeLessThan(none.sitePeakMean! * 0.99)
    expect(wall.sitePeakMean!).toBeLessThan(trees.sitePeakMean!)
  })
  it('denser crowns shelter more', () => {
    const dense = run(row(0.05))
    expect(dense.sitePeakMean!).toBeLessThan(trees.sitePeakMean!)
  })
  it('porosity 1.0 is no obstacle: the same study, cell for cell', () => {
    const open = run(row(1))
    expect(open.porousArea).toBe(0)
    expect(open.runs).toBe(none.runs)
    expect(Array.from(open.mean)).toEqual(Array.from(none.mean))
    expect(open.sitePeakMean).toBe(none.sitePeakMean)
    const screen = run([{ kind: 'screen', line: [[-45, -50], [-45, 50]], top: 4, porosity: 1 }])
    expect(Array.from(screen.mean)).toEqual(Array.from(none.mean))
  })
  it('a porous screen calms the plaza; a more open one less', () => {
    const tight = run([{ kind: 'screen', line: [[-45, -50], [-45, 50]], top: 6, porosity: 0.2 }])
    const loose = run([{ kind: 'screen', line: [[-45, -50], [-45, 50]], top: 6, porosity: 0.7 }])
    expect(tight.sitePeakMean!).toBeLessThan(loose.sitePeakMean!)
    expect(loose.sitePeakMean!).toBeLessThan(none.sitePeakMean!)
  })
  it('drag from porosity: open is none, closed is more; leaf area density wins over porosity', () => {
    expect(screenK(1)).toBe(0)
    expect(screenK(0.2)).toBeGreaterThan(screenK(0.5))
    expect(screenK(0.5)).toBeCloseTo(1.28, 1)
    expect(treeDrag({ crown: 8, porosity: 1 })).toBe(0)
    expect(treeDrag({ crown: 8, porosity: 0.1 })).toBeGreaterThan(treeDrag({ crown: 8, porosity: 0.5 }))
    expect(treeDrag({ crown: 8, porosity: 0.1, lad: 1 })).toBeCloseTo(0.2, 9)
    expect(treeDrag({ crown: 8 })).toBeCloseTo(1 / 21, 9)
    // A bare trunk below the pedestrian layer's top still counts by its crown's share of it; a crown above 6 m does not.
    const grid = { x0: -20, y0: -20, cell: 4, nx: 10, ny: 10 }
    expect(porousDrag([{ kind: 'tree', at: [0, 0], crown: 8, base: 7, top: 15, porosity: 0.2 }], grid)).toBeNull()
    expect(porousDrag([{ kind: 'tree', at: [0, 0], crown: 8, base: 2, top: 15, porosity: 0.2 }], grid)).not.toBeNull()
  })
})

// An imported tower: one prism per storey, a pavilion podium of one or two 6 m storeys under a 20 m tower plate.
const storey = (level: number, z0: number, z1: number, w: number, podium: boolean): ImportedStorey =>
  ({ level, z0, z1, area: w * w, use: podium ? 'retail' : 'office', podium, hasFloor: true, loops: [sq(0, 0, w)] })
function imported(podiumStoreys: number, pavilion = 60): Tower {
  const st: ImportedStorey[] = []
  let z = 0
  for (let i = 0; i < podiumStoreys; i++) { st.push(storey(st.length + 1, z, z + 6, pavilion, true)); z += 6 }
  while (z < 120) { st.push(storey(st.length + 1, z, z + 4, 20, false)); z += 4 }
  return { id: 'imp', name: 'Imported', x: 0, y: 0, rotation: 0, width: 20, depth: 20, height: 120, f2f: 4, podiumHeight: podiumStoreys * 6, podiumWidth: 60, podiumDepth: 60,
    podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, imported: { storeys: st, podiumTop: podiumStoreys * 6 } as never } as Tower
}

describe('wind: a podium reads from its true storeys (G13)', () => {
  it('every podium storey of an imported tower is podium; the base plate is the first tower storey', () => {
    const m = massing([imported(2)])
    expect(m.towers[0].blocks.filter((b) => b.podium).map((b) => [b.z0, b.z1])).toEqual([[0, 6], [6, 12]])
    const z = towerZones(m)[0]
    expect(z.podiumH).toBe(12)
    expect(z.w).toBeCloseTo(20, 6)
    expect(z.d).toBeCloseTo(20, 6)
  })
  it('a 12 m pavilion no longer reads windier than a 6 m one', () => {
    // A 24 m pavilion round a 20 m plate: the downwash zone (0.22 H upwind of the centre) reaches past it onto the ground.
    const study = (t: Tower) => runWindStudy({ project: 'vtc', ring: sq(0, 0, 100), context: [], latLon: [49.28, -123.12], northDeg: 0, ground: 0 } as never, massing([t]), C, { season: 'year', cell: 4, single: { dir: 270, speed: 5 } })
    const six = study(imported(1, 24)), twelve = study(imported(2, 24))
    expect(towerZones(massing([imported(2, 24)]))[0].w).toBeCloseTo(20, 6)
    expect(twelve.amps[0].amp).toBeLessThan(six.amps[0].amp)
    expect(twelve.sitePeak!).toBeLessThanOrEqual(six.sitePeak! + 1e-6)
    expect(twelve.maxS).toBeLessThanOrEqual(six.maxS + 1e-6)
  })
  it('a 3 m ground storey under a tower is a wall at pedestrian level', () => {
    const t = imported(0)
    t.imported!.storeys.forEach((s) => { s.z0 = s.level * 3 - 3; s.z1 = s.level * 3 })
    const w = runWindStudy({ project: 'vtc', ring: null, context: [], latLon: [49.28, -123.12], northDeg: 0, ground: 0 } as never, massing([t]), C, { season: 'year', cell: 8, single: { dir: 270, speed: 5 } })
    expect(w.solid.some((v) => v)).toBe(true)
  })
})
