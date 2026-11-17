// Site limits beyond height (17 Nov 2026, Sinnie: tower separation and floor plate size, merged with the height limits
// into one Site limits tool). Read from the City of Vancouver Downtown South Guidelines (adopted 30 July 1991, amended
// 1994, 1997 and 10 June 2004), opened 17 Nov 2026:
//   4.2.4 / 4.1.x  "Higher elements (i.e. those portions of a building over 70 feet (21.4 m) in height) of the building
//                  are a minimum of 80 feet (24.4 m) away from an adjacent tower."
//   4.1.3 (a)      "The maximum horizontal tower width or depth dimension is 90 feet." (floor plates above 70 ft)
//   4.1.3 (b)      "The maximum floor plate of any tower will be limited to 6,500 square feet gross (including elevator
//                  cores, storage, stairs, enclosed balconies, etc. but excluding open balconies)."
// They are written for residential towers in Downtown South; elsewhere downtown they are benchmarks (the City's June
// 2025 Residential Tower Floor Plates bulletin, not opened, sets context-specific limits). So every line is flagged
// unverified, and office floors are reported without a cap. Geometry in the project frame (metres).
import { blockSpans } from './blocks'
import { towerFloors, towerMasses } from './massing'
import type { Prism } from './sw/types'
import type { RuleResult, Tower } from './types'

export const TOWER_ABOVE_M = 21.4, SEPARATION_M = 24.4, PLATE_MAX_M2 = 604, WIDTH_MAX_M = 27.4
const SRC = { label: 'City of Vancouver, Downtown South Guidelines (1991, amended 2004)', page: '4.1.3 and 4.2.4', url: 'https://guidelines.vancouver.ca/' }
type Pt = [number, number]

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
const inside = (p: Pt, r: Pt[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o } return o }
/** Shortest plan distance between two rings (0 when they overlap), and the two closest points. */
export function ringDistance(a: Pt[], b: Pt[]): { d: number; p: Pt; q: Pt } {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return { d: 0, p: a[0], q: a[0] }
  let best = { d: Infinity, p: a[0], q: b[0] }
  const near = (p: Pt, ring: Pt[], flip: boolean) => {
    for (let i = 0; i < ring.length; i++) {
      const s = ring[i], e = ring[(i + 1) % ring.length], d = segDist(p, s, e)
      if (d < best.d) {
        const dx = e[0] - s[0], dy = e[1] - s[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / L)) : 0
        const q: Pt = [s[0] + t * dx, s[1] + t * dy]
        best = flip ? { d, p: q, q: p } : { d, p, q }
      }
    }
  }
  for (const p of a) near(p, b, false)
  for (const p of b) near(p, a, true)
  return best
}

/** A tower's plan outlines above 21.4 m (its blocks that reach above, or an imported mass's footprint). */
export function upperRings(t: Tower): Pt[][] {
  return towerMasses(t).filter((m) => m.z1 > TOWER_ABOVE_M + 0.01).map((m) => m.ring as Pt[])
}

export interface SeparationHit { towerId: string; other: string; d: number; p: Pt; q: Pt; kind: 'proposed' | 'existing' }
export interface SeparationResult { tower: Tower; rules: RuleResult[]; nearest: SeparationHit | null; hits: SeparationHit[] }

/** Each tower's distance, above 21.4 m, to the other proposed towers and to existing buildings over 21.4 m tall. */
export function separationCheck(towers: Tower[], context: Prism[]): SeparationResult[] {
  const tall = context.filter((p) => p.z1 > TOWER_ABOVE_M)
  return towers.map((t) => {
    const mine = upperRings(t)
    const hits: SeparationHit[] = []
    if (mine.length) {
      for (const o of towers) {
        if (o.id === t.id) continue
        const theirs = upperRings(o)
        let best: SeparationHit | null = null
        for (const a of mine) for (const b of theirs) { const r = ringDistance(a, b); if (!best || r.d < best.d) best = { towerId: t.id, other: o.name, d: r.d, p: r.p, q: r.q, kind: 'proposed' } }
        if (best) hits.push(best)
      }
      const reach = SEPARATION_M * 3
      for (const c of tall) {
        let best: SeparationHit | null = null
        for (const a of mine) { const r = ringDistance(a, c.ring as Pt[]); if (r.d <= reach && (!best || r.d < best.d)) best = { towerId: t.id, other: `existing building, ${Math.round(c.z1)} m`, d: r.d, p: r.p, q: r.q, kind: 'existing' } }
        if (best) hits.push(best)
      }
    }
    hits.sort((a, b) => a.d - b.d)
    const nearest = hits[0] ?? null
    const rules: RuleResult[] = []
    if (!mine.length) rules.push({ id: 'sep-low', label: 'Tower separation', value: `no part above ${TOWER_ABOVE_M} m`, threshold: `${SEPARATION_M} m between parts above ${TOWER_ABOVE_M} m`, state: 'pass', flag: 'unverified', source: SRC, note: 'The guideline applies to the portions of a building over 70 ft (21.4 m).' })
    else {
      const close = hits.filter((h) => h.d < SEPARATION_M)
      rules.push({ id: 'sep-min', label: 'Tower separation', value: nearest ? `${nearest.d.toFixed(1)} m to ${nearest.other}` : 'no tower within 73 m',
        threshold: `at least ${SEPARATION_M} m (80 ft) above ${TOWER_ABOVE_M} m (70 ft)`, state: close.length ? (close.some((h) => h.d < SEPARATION_M * 0.75) ? 'fail' : 'warn') : 'pass', flag: 'unverified', source: SRC,
        note: `${close.length ? `${close.length} ${close.length === 1 ? 'tower is' : 'towers are'} closer than ${SEPARATION_M} m. ` : ''}Measured in plan between the parts above 21.4 m, to the other proposed towers and to existing buildings over 21.4 m; a benchmark outside Downtown South.` })
    }
    return { tower: t, rules, nearest, hits }
  })
}

export interface PlateResult { tower: Tower; rules: RuleResult[]; plate: number; width: number; use: 'residential' | 'office' | 'mixed' | 'none' }

/** Each tower's largest floor plate and widest plan dimension above 21.4 m, against the residential limits. */
export function plateCheck(towers: Tower[]): PlateResult[] {
  return towers.map((t) => {
    const up = towerFloors(t).filter((f) => f.z0 >= TOWER_ABOVE_M - 0.01 && !f.podium)
    const res = up.filter((f) => f.use === 'residential' || f.use === 'hotel')
    const plate = Math.max(0, ...(res.length ? res : up).map((f) => f.area))
    // widest plan dimension of the blocks above 21.4 m (their own width and depth; an imported mass: its bounding size)
    const spans = t.imported ? [] : blockSpans(t).filter((s) => s.z1 > TOWER_ABOVE_M + 0.01 && !s.podium)
    const width = spans.length ? Math.max(...spans.map((s) => Math.max(s.block.width, s.block.depth))) : Math.max(t.width, t.depth)
    const use: PlateResult['use'] = !up.length ? 'none' : res.length === up.length ? 'residential' : res.length ? 'mixed' : 'office'
    const rules: RuleResult[] = []
    if (!up.length) rules.push({ id: 'plate-low', label: 'Tower floor plate', value: `no floor above ${TOWER_ABOVE_M} m`, threshold: `${PLATE_MAX_M2} m² above ${TOWER_ABOVE_M} m`, state: 'pass', flag: 'unverified', source: SRC })
    else {
      const capped = use !== 'office'
      const over = plate > PLATE_MAX_M2
      rules.push({ id: 'plate-area', label: capped ? 'Residential floor plate' : 'Tower floor plate (office)', value: `${Math.round(plate)} m² (${Math.round(plate * 10.7639).toLocaleString('en-CA')} sq ft)`,
        threshold: capped ? `at most ${PLATE_MAX_M2} m² (6,500 sq ft) gross` : 'no cap for office floors', state: !capped ? 'pass' : over ? (plate > PLATE_MAX_M2 * 1.15 ? 'fail' : 'warn') : 'pass', flag: 'unverified', source: SRC,
        note: capped ? 'Gross, cores and stairs included, open balconies out; the largest residential or hotel plate above 21.4 m. The City may accept a larger plate for a better massing response.' : 'The 6,500 sq ft limit is written for residential towers; office plates are reported only.' })
      rules.push({ id: 'plate-width', label: 'Tower width or depth', value: `${width.toFixed(1)} m (${Math.round(width * 3.28084)} ft)`, threshold: `at most ${WIDTH_MAX_M} m (90 ft)`,
        state: !capped ? 'pass' : width > WIDTH_MAX_M ? (width > WIDTH_MAX_M * 1.15 ? 'fail' : 'warn') : 'pass', flag: 'unverified', source: SRC,
        note: 'The widest plan dimension of the tower above 21.4 m; 75–85 ft facing the street is called optimum.' })
    }
    return { tower: t, rules, plate, width, use }
  })
}
