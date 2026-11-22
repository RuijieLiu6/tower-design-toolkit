import { describe, expect, it } from 'vitest'
import { fixFor } from '../lib/fixes'
import { importedTower, rect, type P } from './testStoreys'
import { slopedColumnLean, structureCheck, STRUCTURE_TABS, TYPE10_DEG } from './structure'
import type { ImportedStorey, Tower } from './types'
import { windProcedure } from './windStructure'

const turn = (r: P[], deg: number): P[] => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return r.map(([x, y]) => [x * c - y * s, x * s + y * c]) }
const ringArea = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)

/** A 3-storey podium and `n` 4 m tower storeys of a 50 × 50 m plate, storey k turned by k × perStorey degrees. */
function twisted(n: number, perStorey: number): Tower {
  const storeys: ImportedStorey[] = []
  let z = 0
  const push = (r: P[], podium: boolean) => { storeys.push({ level: storeys.length + 1, z0: z, z1: z + 4, area: Math.round(ringArea(r) * 10) / 10, use: podium ? 'retail' : 'residential', podium, hasFloor: true, loops: [r] } as ImportedStorey); z += 4 }
  for (let k = 0; k < 3; k++) push(rect(90, 60), true)
  for (let k = 0; k < n; k++) push(turn(rect(50, 50), k * perStorey), false)
  return importedTower(storeys, { podiumTop: 12 })
}
const line = (t: Tower) => structureCheck(t, windProcedure(t)).rules.find((r) => r.id === 'sloped-columns')!

describe('Sloped columns, Type 10 (tool cycle 11, BCBC 2024 Table 4.1.8.6)', () => {
  it('reads the lean of a perimeter column that follows the turn: atan(r × turn / h)', () => {
    const lean = slopedColumnLean(twisted(40, 1))!
    const r = Math.hypot(25, 25), expected = (Math.atan((r * Math.PI) / 180 / 4) * 180) / Math.PI
    expect(lean.r).toBeCloseTo(r, 1)
    expect(lean.turn).toBeCloseTo(1, 3)
    expect(lean.deg).toBeCloseTo(expected, 1) // about 8.8°
    expect(slopedColumnLean(twisted(40, 0))).toBeNull()
  })

  it('is a Check with a specialist past 2°, a Pass for a gentle turn or a straight tower', () => {
    const steep = line(twisted(40, 1))
    expect(steep.state).toBe('warn')
    expect(steep.specialist).toMatch(/Type 10/)
    expect(steep.flag).toBe('verified')
    expect(steep.source.page).toBe('pp.4-484, 4-488')
    expect(fixFor('sloped-columns', 'warn', steep.value, steep.threshold, steep.flag)).toMatch(/vertical inside the turning slab edges/)
    expect(line(twisted(40, 0.2)).state).toBe('pass') // about 1.8°
    expect(line(twisted(40, 0)).value).toMatch(/no turning plate/)
    expect(TYPE10_DEG).toBe(2)
  })

  it('shows under System & seismic', () => {
    expect(STRUCTURE_TABS.find((g) => g.id === 'seismic')!.lines).toContain('sloped-columns')
  })
})
