// Tool cycle 12 (R7b P5, R7 Ridge Gate): parts that carry no floor area. A structure-only bridge counts for mass,
// silhouette and weight, but not for floor area, homes, keys or FSR.
import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { egressCheck } from './egress'
import { plateSumCheck } from './imported'
import { DEFAULT_INTERIOR, interiorCheck } from './interior'
import { gfaByUse, towerFloors, towerMasses, withBlocks } from './massing'
import { floorParts } from './openingField'
import { silhouetteSlices } from './silhouette'
import { DEFAULT_WEIGHT_PRESETS, GAMMA_C, HARD_DECK, SNOW_W, storeyWeights, USE_LOADS } from './storeyWeight'
import { structureOnlyArea, structureParts, withStructureOnly } from './structureOnly'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { ImportedStorey, Tower } from './types'

const total = (g: Record<string, number>) => Object.values(g).reduce((a, b) => a + b, 0)

// The gate of coreTop.test.ts, with (or without) a 44 × 6 m bridge storey 5 m deep over the two ears.
function gate(bridge: 'structure' | 'floor' | 'none'): Tower {
  const runs = [
    { n: 3, f2f: 4.5, ring: rect(60, 60), podium: true },
    { n: 40, f2f: 4, ring: rect(44, 44) },
    { n: 4, f2f: 4, ring: rect(44, 44), use: 'mechanical' as const },
    ...(bridge !== 'none' ? [{ n: 1, f2f: 5, ring: rect(44, 6), use: 'mechanical' as const }] : []),
  ]
  const st = stack(runs)
  const ears = st.slice(43, 47)
  for (const s of ears) { s.loops = [rect(12, 44, -16, 0), rect(12, 44, 16, 0)]; s.area = 2 * 12 * 44 }
  if (bridge === 'structure') st[47] = withStructureOnly(st[47], [rect(44, 6)])
  const t = importedTower(st, { podiumTop: 13.5, coreSide: 20 })
  return { ...t, interior: DEFAULT_INTERIOR, coreTop: 173.5 }
}

describe('structureOnly: parts that carry no floor area', () => {
  it('keeps a bridge out of floor area, homes and FSR', () => {
    const t = gate('structure'), bare = gate('none'), floored = gate('floor')
    const b = t.imported!.storeys[47]
    expect(b.hasFloor).toBe(false)
    expect(b.area).toBe(0)
    expect(b.structureOnly).toHaveLength(1)
    expect(b.loops).toHaveLength(1) // the outline stays for every reader of the storeys' outlines
    expect(towerFloors(t).map((f) => f.level)).not.toContain(48)
    expect(total(gfaByUse([t]))).toBeCloseTo(total(gfaByUse([bare])), 6)
    // the same bridge with a floor would add 264 m² of plant
    expect(total(gfaByUse([floored])) - total(gfaByUse([bare]))).toBeCloseTo(264, 6)
    expect(interiorCheck(t, towerFloors(t)).totals.homes).toBe(interiorCheck(bare, towerFloors(bare)).totals.homes)
    // nothing for egress to leave on the bridge storey
    expect(egressCheck(t).rules.find((r) => r.id.startsWith('ear-exits'))!.value).toMatch(/^L44–L47 /)
  })

  it('keeps the bridge in the mass, the silhouette and the weights', () => {
    const t = gate('structure'), bare = gate('none')
    expect(Math.max(...towerMasses(t).map((m) => m.z1))).toBeCloseTo(13.5 + 44 * 4 + 5, 6)
    expect(Math.max(...silhouetteSlices(t).map((s) => s.z1))).toBeCloseTo(194.5, 6)
    const w = storeyWeights(t), w0 = storeyWeights(bare)
    // a hard deck of 264 m² (0.25 m slab, finish, the snow share) and 100 m of facade over its 5 m: on the roof of L47
    const expected = 264 * (USE_LOADS.mechanical.slab * GAMMA_C + HARD_DECK + SNOW_W) + 100 * 5 * DEFAULT_WEIGHT_PRESETS.facadeKpa
    const roof = w.levels.find((l) => l.roof)!
    expect(roof.structure).toBeCloseTo(expected, 6)
    expect(w.total - w0.total).toBeCloseTo(expected, 6)
    expect(structureParts(t)).toHaveLength(1)
  })

  it('takes a part declared structure-only out of a storey that keeps a floor, once', () => {
    const s: ImportedStorey = stack([{ n: 1, f2f: 4, ring: rect(44, 44) }])[0]
    const ear: P[] = rect(10, 44, 17, 0)
    const one = withStructureOnly(s, [ear])
    expect(one.area).toBeCloseTo(1936 - 440, 6)
    expect(one.hasFloor).toBe(true)
    expect(one.loops).toHaveLength(2)
    expect(structureOnlyArea(one)).toBeCloseTo(440, 6)
    // a second call with the same outline changes nothing
    expect(withStructureOnly(one, [ear]).area).toBeCloseTo(one.area, 6)
    // the plate-sum cross-check adds the part back (it is in the mesh)
    const t = importedTower([one, ...stack([{ n: 1, f2f: 4, ring: rect(44, 44) }]).map((x) => ({ ...x, level: 2, z0: 4, z1: 8 }))])
    const m = { ...t.imported!, volume: 2 * 1936 * 4 }
    expect(plateSumCheck(m)!.error).toBeCloseTo(0, 6)
    // the part is not a part a person leaves
    expect(floorParts(t, towerFloors(t)[0])).toHaveLength(1)
  })

  it('does the same for a parametric block marked structure-only', () => {
    const p = defaultTower('vtc')
    const blocks = p.blocks!
    const top = blocks[blocks.length - 1]
    const t = withBlocks(p, [...blocks, { ...top, id: 'bridge', name: 'Bridge', height: 5, width: top.width, depth: 6, structureOnly: true }])
    const fl = towerFloors(t), fl0 = towerFloors(p)
    expect(fl.length).toBe(fl0.length)
    expect(total(gfaByUse([t]))).toBeCloseTo(total(gfaByUse([p])), 6)
    expect(Math.max(...towerMasses(t).map((m) => m.z1))).toBeCloseTo(Math.max(...towerMasses(p).map((m) => m.z1)) + 5, 6)
    expect(structureParts(t)).toHaveLength(1)
    expect(storeyWeights(t).total).toBeGreaterThan(storeyWeights(p).total)
  })
})
