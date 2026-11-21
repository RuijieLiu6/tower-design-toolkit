// A twisted tower read by the interior studies (tool gaps G27, G28; energy review R3-7 on B21c).
import { describe, expect, it } from 'vitest'
import type { ImportedStorey, Tower } from '../types'
import { swFloors } from './plate'
import { floorExposure, formStudy } from './form'

type P = [number, number]
const base = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 45, depth: 45, height: 280, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 60,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0, ...patch,
})
const shoelace = (r: P[]) => Math.abs(r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x * y2 - x2 * y }, 0) / 2)
/** A W × D rectangle about (cx, cy) turned by deg, counter-clockwise. */
const rect = (W: number, D: number, deg = 0, cx = 0, cy = 0): P[] => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]] as P[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])
}
/** An imported tower of 4 m storeys, one outline per storey. */
const imported = (loops: P[][], patch: Partial<Tower> = {}): Tower => {
  const storeys: ImportedStorey[] = loops.map((loop, i) => ({ level: i + 1, z0: i * 4, z1: i * 4 + 4, area: shoelace(loop), use: 'office', podium: false, hasFloor: true, loops: [loop] }))
  return { ...base({ height: loops.length * 4, ...patch }), imported: { storeys } as unknown as Tower['imported'] }
}
const N = 70
/** 45 m square, turned 90° over 70 storeys (B21c's 1.3° a storey), and the same square straight. */
const twisted = (n = N, total = 90, side = 45) => imported(Array.from({ length: n }, (_, i) => rect(side, side, (total * i) / (n - 1))))
const straight = () => imported(Array.from({ length: N }, () => rect(45, 45)))

describe('a twist\'s storey steps are a warped wall, not terraces and soffits (G27)', () => {
  it('a 90° twist over 70 storeys reads within 1% of the untwisted envelope', () => {
    const tw = formStudy(swFloors(twisted(), 0)), st = formStudy(swFloors(straight(), 0))
    expect(st.warpSteps).toBe(0)
    expect(tw.warpSteps).toBe(N - 1)
    expect(Math.abs(tw.ff / st.ff - 1)).toBeLessThan(0.01)
    expect(Math.abs(tw.env / st.env - 1)).toBeLessThan(0.01)
    // only the top roof and the ground slab are horizontal, as on the straight tower
    expect(tw.soffit).toBe(0)
    expect(tw.roof).toBeCloseTo(st.roof, -2)
    // the leaning skin adds about 0.001 to the form factor (review R3-7)
    expect(tw.warped / tw.gfa).toBeGreaterThan(0.0003)
    expect(tw.warped / tw.gfa).toBeLessThan(0.003)
  })
  it('a real 4.5 m setback still counts its terrace', () => {
    const loops = Array.from({ length: 20 }, (_, i) => (i < 10 ? rect(45, 45) : rect(40.5, 45, 0, -2.25, 0)))
    const fl = swFloors(imported(loops), 0)
    const ex = floorExposure(fl)
    expect(ex[9].warped).toBe(0)
    expect(ex[9].terrace).toBeGreaterThan(0.85 * 45 * 4.5)
    expect(ex[9].terrace).toBeLessThan(1.15 * 45 * 4.5)
    // and on a twisted tower, the setback storey keeps it while the turns around it read as warped wall
    const tl = Array.from({ length: 20 }, (_, i) => (i < 10 ? rect(45, 45, i * 1.3) : rect(40.5, 45, i * 1.3)))
    const te = floorExposure(swFloors(imported(tl), 0))
    expect(te[9].terrace).toBeGreaterThan(100)
    expect(te[5].terrace).toBe(0)
    expect(te[5].warped).toBeGreaterThan(0)
    expect(te[15].terrace).toBe(0)
  })
  it('a lean (each storey shifted 0.3 m) is a sloped wall; a 2 m shift a storey is a step', () => {
    const lean = floorExposure(swFloors(imported(Array.from({ length: 10 }, (_, i) => rect(45, 45, 0, i * 0.3, 0))), 0))
    expect(lean.every((e) => e.terrace === 0 && e.coveredVoid === 0)).toBe(true)
    expect(lean.reduce((s, e) => s + e.warped, 0)).toBeGreaterThan(0)
    const jog = floorExposure(swFloors(imported(Array.from({ length: 10 }, (_, i) => rect(45, 45, 0, i * 2, 0))), 0))
    expect(jog[4].terrace).toBeGreaterThan(80)
    expect(jog[4].warped).toBe(0)
  })
})
