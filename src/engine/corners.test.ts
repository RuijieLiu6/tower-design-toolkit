// G3 (vtc-entry TOOL_DEFICITS): corner type read from the geometry, research R5 §4.1. B8c (5 m chamfers, setting left
// at sharp) still read "sharp corners: High"; B8a, B8b and B9a read Low only because they were declared.
import { describe, expect, it } from 'vitest'
import { minAreaRect, readCorners, simplify, towerCorners } from './corners'
import { importedTower, rect, stack, type P } from './testStoreys'
import type { Tower } from './types'
import { DEFAULT_WIND_SCREEN, YVR_ROSE, windScreen, type WindRose } from './windScreen'

const chamfer = (w: number, c: number, cx = 0, cy = 0): P[] => { const x = w / 2; return ([[-x + c, -x], [x - c, -x], [x, -x + c], [x, x - c], [x - c, x], [-x + c, x], [-x, x - c], [-x, -x + c]] as P[]).map(([a, b]) => [a + cx, b + cy]) }
/** B13a's tower plate: a 50 m square with a double recession of 1.25 m steps at every corner. */
const B13A: P[] = [[-22.5, -25], [22.5, -25], [22.5, -23.75], [23.75, -23.75], [23.75, -22.5], [25, -22.5], [25, 22.5], [23.75, 22.5], [23.75, 23.75], [22.5, 23.75], [22.5, 25], [-22.5, 25], [-22.5, 23.75], [-23.75, 23.75], [-23.75, 22.5], [-25, 22.5], [-25, -22.5], [-23.75, -22.5], [-23.75, -23.75], [-22.5, -23.75]]
/** A square with tangent quarter-circle corners of radius r (n segments each). */
const rounded = (w: number, r: number, n = 6): P[] => {
  const x = w / 2 - r, out: P[] = []
  for (const [cx, cy, a0] of [[x, -x, -90], [x, x, 0], [-x, x, 90], [-x, -x, 180]] as const) for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
const turnAll = (r: P[], deg: number, c: P = [0, 0]): P[] => { const a = (deg * Math.PI) / 180; return r.map(([x, y]) => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]) }

describe('G3: corner type read from the plan (R5 §4.1)', () => {
  it('a plain square reads sharp', () => {
    const r = readCorners(rect(50, 50))
    expect(r.kind).toBe('sharp')
    expect(r.bB).toBe(0)
  })
  it('a 50 m square with 3 m chamfers reads chamfered, b/B 0.06', () => {
    const r = readCorners(chamfer(50, 3))
    expect(r.kind).toBe('chamfered')
    expect(r.bB).toBeCloseTo(0.06, 6)
    expect(r.corners.every((k) => k.kind === 'chamfered' && Math.abs(k.b - 3) < 1e-9)).toBe(true)
    // Turned and moved, the minimum-area rectangle finds the same frame.
    const t = readCorners(turnAll(chamfer(50, 3, 7, -4), 23, [3, 1]))
    expect(t.kind).toBe('chamfered')
    expect(t.bB).toBeCloseTo(0.06, 6)
  })
  it('B13a’s 1.25 m double recession reads recessed, two steps, b/B 0.05', () => {
    const r = readCorners(B13A)
    expect(r.kind).toBe('recessed')
    expect(r.steps).toBe(2)
    expect(r.bB).toBeCloseTo(0.05, 6)
    expect(readCorners(B13A.map(([x, y]) => [x + 17, y + 2])).kind).toBe('recessed')
  })
  it('reads tangent-arc corners and a round plan as rounded, b = r', () => {
    const r = readCorners(rounded(50, 5))
    expect(r.kind).toBe('rounded')
    expect(r.bB).toBeCloseTo(0.1, 6)
    const circle: P[] = Array.from({ length: 48 }, (_, i) => [25 * Math.cos((2 * Math.PI * i) / 48), 25 * Math.sin((2 * Math.PI * i) / 48)])
    expect(readCorners(circle).kind).toBe('rounded')
    expect(readCorners(circle).bB).toBeCloseTo(0.5, 1)
  })
  it('a notch in the middle of a face leaves the corners sharp (C10 tier 2)', () => {
    const notch: P[] = [[-27, -27], [27, -27], [27, -22.5], [22.5, -22.5], [22.5, 22.5], [27, 22.5], [27, 27], [-27, 27]]
    expect(readCorners(notch).kind).toBe('sharp')
  })
  it('drops nearly collinear points before it reads (slicing leaves points along straight walls)', () => {
    const dense: P[] = [[-25, -25], [0, -25.02], [25, -25], [25, 0], [25, 25], [-25, 25]]
    expect(simplify(dense)).toHaveLength(4)
    expect(minAreaRect(dense).B).toBeCloseTo(50, 1)
  })
})

describe('G3: the wind screen uses the reading unless the corners are declared', () => {
  const oneSector: WindRose = (() => { const bins = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]); bins[0] = [20, 20, 10, 10, 0]; return { ...YVR_ROSE, rose: { 'year.comfort': { hours: 100, calm: 40, variable: 0, bins } } } })()
  const screen = (t: Tower, corner = DEFAULT_WIND_SCREEN.corner) => windScreen([t], { northDeg: 0, context: [], contextLoaded: true }, { ...DEFAULT_WIND_SCREEN, corner }, oneSector)
  const line = (t: Tower, corner = DEFAULT_WIND_SCREEN.corner) => screen(t, corner).rules.find((x) => x.id === `corner-${t.id}`)!
  // B8c: 5 m chamfers on a 50 m plate over a podium, setting left at its default.
  const b8c = importedTower(stack([{ n: 3, f2f: 4, ring: rect(90, 60), podium: true }, { n: 70, f2f: 4, ring: chamfer(50, 5, 17, 2) }]), { podiumTop: 12 })
  const plain = importedTower(stack([{ n: 70, f2f: 4, ring: rect(50, 50) }]))

  it('reads B8c as chamfered, b/B 0.10, and rates its corners Low', () => {
    expect(DEFAULT_WIND_SCREEN.corner).toBe('auto')
    expect(towerCorners(b8c)).toMatchObject({ kind: 'chamfered', share: 1, credit: 1 })
    const l = line(b8c)
    expect(l.value).toBe('read from the model: chamfered, b/B 0.10: Low')
    expect(l.state).toBe('pass')
    expect(screen(b8c).towers[0].sectors[0].corner).toBe('low')
  })
  it('a plain square tower reads sharp: High on a tall tower', () => {
    expect(line(plain).value).toBe('read from the model: sharp on a 280 m tower: High')
  })
  it('shows both when declared, and the declared setting governs', () => {
    expect(line(b8c, 'sharp').value).toBe('declared sharp; read from the model: chamfered, b/B 0.10 on a 292 m tower: High')
    const b13 = importedTower(stack([{ n: 72, f2f: 4, ring: B13A }]))
    expect(line(b13, 'stepped').value).toBe('declared stepped; read from the model: recessed (2 steps), b/B 0.05: Low')
    expect(line(b13).value).toBe('read from the model: recessed (2 steps), b/B 0.05: Low')
    expect(line(plain, 'chamfered').value).toBe('declared chamfered; read from the model: sharp: Low')
  })
  it('gives no credit to a cut under b/B 0.05, and reads only the height above H/3', () => {
    const small = importedTower(stack([{ n: 70, f2f: 4, ring: chamfer(50, 1.5) }]))
    expect(line(small).value).toBe('read from the model: chamfered, b/B 0.03 (under the 0.05 the screen credits) on a 280 m tower: High')
    // Chamfered only below H/3: the upper tower is sharp.
    const low = importedTower(stack([{ n: 30, f2f: 4, ring: chamfer(50, 5) }, { n: 40, f2f: 4, ring: rect(50, 50) }]))
    expect(towerCorners(low).kind).toBe('sharp')
    // Chamfered over half the height above H/3 (the top), sharp below: credited, with its share.
    const top = importedTower(stack([{ n: 40, f2f: 4, ring: rect(50, 50) }, { n: 30, f2f: 4, ring: chamfer(50, 5) }]))
    const c = towerCorners(top)
    expect(c.kind).toBe('chamfered')
    expect(c.credit).toBeCloseTo(30 / 47, 6) // storeys 24–70 have their mid-height above H/3 = 93.3 m
    expect(c.text).toBe('chamfered, b/B 0.10 over 64% of the height above H/3')
  })
  it('a parametric tower of blocks reads sharp', () => {
    const box: Tower = { id: 'b', name: 'Box', x: 0, y: 0, rotation: 30, width: 46, depth: 46, height: 285, f2f: 4.2, podiumHeight: 0, podiumWidth: 46, podiumDepth: 46, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0 }
    expect(towerCorners(box).kind).toBe('sharp')
  })
})
