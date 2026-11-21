// G19 (vtc-entry TOOL_DEFICITS): Tower B twisted 90° and 180° (B18a/B18b) held its floor area, but the across-wind line
// and its corner-credit range did not move: the screen credited corner shape only. The twist is now read from the
// storey outlines and earns the tested credit as a range (research R5 §4.3 table 8.7; R3 §1 and §3).
import { describe, expect, it } from 'vitest'
import { twistReduction, twistSway } from './acrossWind'
import { withBlocks } from './massing'
import { importedTower, rect, type P } from './testStoreys'
import { planAxis, towerTwist } from './twist'
import type { Block, ImportedStorey, Tower } from './types'
import { windProcedure } from './windStructure'

const turn = (r: P[], deg: number): P[] => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return r.map(([x, y]) => [x * c - y * s, x * s + y * c]) }
const ringArea = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)

/** A 3-storey 90 × 60 m podium and `n` tower storeys of `ring`, storey k turned by angle(k) (deg). */
function twisted(n: number, ring: P[], angle: (k: number) => number): Tower {
  const storeys: ImportedStorey[] = []
  let z = 0
  const push = (r: P[], podium: boolean) => { storeys.push({ level: storeys.length + 1, z0: z, z1: z + 4, area: Math.round(ringArea(r) * 10) / 10, use: podium ? 'retail' : 'residential', podium, hasFloor: true, loops: [r] }); z += 4 }
  for (let k = 0; k < 3; k++) push(rect(90, 60), true)
  for (let k = 0; k < n; k++) push(turn(ring, angle(k)), false)
  return importedTower(storeys, { podiumTop: 12 })
}
const rule = (t: Tower, id: string) => windProcedure(t).rules.find((x) => x.id === id)
const gs = (v: string) => [...v.matchAll(/(\d+\.\d)% g at/g)].map((m) => Number(m[1]))

describe('G19: the twist read from the storey outlines', () => {
  it('reads a plan axis modulo 90°, and none for a round plan', () => {
    expect(planAxis(rect(50, 50))).toBeCloseTo(0, 6)
    expect(planAxis(turn(rect(50, 50), 30))).toBeCloseTo(30, 6)
    expect(planAxis(turn(rect(50, 50), 100))).toBeCloseTo(10, 6) // a square looks the same turned a quarter
    expect(planAxis(turn(rect(60, 30), 75))).toBeCloseTo(75, 6)
    const circle: P[] = Array.from({ length: 48 }, (_, i) => [25 * Math.cos((2 * Math.PI * i) / 48), 25 * Math.sin((2 * Math.PI * i) / 48)])
    expect(planAxis(circle)).toBeNull()
  })

  it('gives an untwisted square no twist and no twist credit', () => {
    const sq = twisted(70, rect(50, 50), () => 0)
    const tw = towerTwist(sq)
    expect(tw.deg).toBe(0)
    expect(tw.text).toBe('straight')
    expect(twistReduction(0)).toBeNull()
    expect(rule(sq, 'across-wind-accel')!.value).not.toMatch(/twist credit/)
    expect(rule(sq, 'twist')).toBeUndefined()
  })

  it('reads a 180° twist as 180°, with the sourced range on the across-wind line and the state unchanged (B18b)', () => {
    const n = 70
    const b18b = twisted(n, rect(50, 50), (k) => (180 * k) / (n - 1))
    const tw = towerTwist(b18b)
    expect(tw.total).toBeCloseTo(180, 6)
    expect(tw.perStorey).toBeCloseTo(180 / 69, 6)
    expect([tw.from, tw.to]).toEqual([4, 73])
    expect(tw.share).toBeCloseTo(1, 9)
    expect(tw.breaks).toEqual([])
    expect(tw.storeys[35].angle).toBeCloseTo((180 * 35) / 69, 6)
    // R5 table 8.7 (Tanaka et al.: 180° at 70% of the square's design wind load) and Shanghai Tower (R3 §1).
    const r = twistReduction(180)!
    expect(r.hi).toBeCloseTo(0.7, 9)
    expect(r.lo).toBeCloseTo(0.67, 9)
    expect(r.basis).toMatch(/Tanaka et al\. 2013/)
    const a = rule(b18b, 'across-wind-accel')!
    const [c, lo] = gs(a.value)
    const credit = a.value.match(/with the twist credit (\d+\.\d)–(\d+\.\d)% g$/)!.slice(1).map(Number)
    expect(credit[0]).toBeCloseTo(c * 0.67, 1)
    expect(credit[1]).toBeCloseTo(lo * 0.7, 1)
    expect(a.note).toMatch(/Twist credit R = 0\.67–0\.70 for a twist of 180° counter-clockwise from L4 to L73/)
    expect(a.note).toMatch(/an inference, shown as a range and never as a pass/)
    // The credit never moves the state: the same plate untwisted reads the same.
    const sq = rule(twisted(n, rect(50, 50), () => 0), 'across-wind-accel')!
    expect(gs(sq.value)).toEqual([c, lo])
    expect(a.state).toBe(sq.state)
    // The companion line: the stiffness the twist costs an outrigger or perimeter frame (Moon 2013, via R3 §3).
    const s = rule(b18b, 'twist')!
    expect(s.value).toMatch(/^180° counter-clockwise from L4 to L73 \(2\.6° per storey\); about \+36% top sway/)
    expect(s.state).toBe('warn')
    expect(s.note).toMatch(/59\.2 cm \(\+36%\) at 180°/)
  })

  it('reads a 90° twist as 90° (B18a), and either way round', () => {
    const n = 70
    const b18a = towerTwist(twisted(n, rect(50, 50), (k) => (90 * k) / (n - 1)))
    expect(b18a.total).toBeCloseTo(90, 6)
    expect(towerTwist(twisted(n, rect(50, 50), (k) => (-90 * k) / (n - 1))).total).toBeCloseTo(-90, 6)
    expect(towerTwist(twisted(n, rect(56, 40), (k) => 20 + (90 * k) / (n - 1))).total).toBeCloseTo(90, 6) // a rectangle, from 20°
    const r = twistReduction(90)!
    expect(r.lo).toBeCloseTo(0.82, 9) // Shanghai line
    expect(r.hi).toBeCloseTo(0.85, 9) // Tanaka line
    expect(twistSway(90)).toBeCloseTo(0.12, 9)
    expect(twistSway(180)).toBeCloseTo(0.36, 9)
    expect(twistReduction(360)).toEqual(twistReduction(180)) // no extrapolation
  })

  it('scales the credit for a twist over part of the height, and reads tiers and plan jumps as plan changes', () => {
    // Straight to L53, then 90° over the top 20 storeys.
    const crown = towerTwist(twisted(70, rect(50, 50), (k) => (k < 50 ? 0 : (90 * (k - 49)) / 20)))
    expect(crown.total).toBeCloseTo(90, 6)
    expect(crown.share).toBeCloseTo(21 / 70, 6)
    // Setback tiers keep their axis: straight.
    const tiers = towerTwist(twisted(60, rect(54, 54), () => 0))
    expect(tiers.deg).toBe(0)
    // A 30° jump in one storey is a change of plan, not a twist.
    const jump = towerTwist(twisted(40, rect(50, 50), (k) => (k < 20 ? 0 : 30)))
    expect(jump.deg).toBe(0)
    expect(jump.breaks).toEqual([24])
  })

  it('reads the blocks of a parametric tower the same way', () => {
    const blocks: Block[] = [{ id: 'p', width: 70, depth: 60, height: 12, dx: 0, dy: 0, rotation: 0, podium: true },
      ...Array.from({ length: 10 }, (_, k): Block => ({ id: `b${k}`, width: 40, depth: 40, height: 24, dx: 0, dy: 0, rotation: 10 * k }))]
    const base: Tower = { id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 252, f2f: 4, podiumHeight: 12, podiumWidth: 70, podiumDepth: 60, podiumUse: 'retail', bands: [{ use: 'residential', share: 1 }], coreShare: 0.2, plantEvery: 0 }
    expect(towerTwist(withBlocks(base, blocks)).total).toBeCloseTo(90, 6)
  })
})
