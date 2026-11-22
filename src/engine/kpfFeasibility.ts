// Feasibility readings beside the land residual (developer lens, 21 Nov): two KPF figures from the City's Higher
// Buildings Policy review, reported and never folded into the residual or any verdict.
// - Office stack: KPF fitted one plausible office tower on a Vancouver test block at about 650 ft (198 m) and
//   825,000 sf (76,600 m²) gross (KPF pp.6–8; Dobson, Vertical Studio deck, pp.66, 72). An analog tied to that block.
// - Cost against height: relative to a 300 ft tower, 800 ft 1.7–2.1×, 900 ft 2.1–3.0×, 1,000 ft and over 1.5–4.1×,
//   from New York cost data; KPF calls the correlation poor (pp.27–28).
// Both unverified (read once from the book notes), confidence B, state unknown.
import { floorAreasByUse, towerFloors } from './massing'
import type { RuleResult, Source, Tower } from './types'

const FT = 0.3048

/** KPF's plausible office tower on a Vancouver lot (pp.6–8; Dobson pp.66, 72). */
export const KPF_OFFICE_LOT = { heightM: 198, heightFt: 650, gfaM2: 76_600, gfaSf: 825_000 } as const

/** KPF cost factor against a 300 ft tower, by height band (pp.27–28). `from` in feet; the last band is open-ended. */
export const KPF_COST_BANDS = [
  { from: 800, low: 1.7, high: 2.1, label: '800 ft' },
  { from: 900, low: 2.1, high: 3.0, label: '900 ft' },
  { from: 1000, low: 1.5, high: 4.1, label: '1,000 ft and over' },
] as const

export const KPF_OFFICE_SOURCE: Source = { label: 'KPF, Vancouver Tall Building Report (2025, in the City’s Higher Buildings Policy review): plausible office tower on a Vancouver lot; Dobson, Vertical Studio deck (City of Vancouver)', page: 'KPF pp.6–8; Dobson pp.66, 72' }
export const KPF_COST_SOURCE: Source = { label: 'KPF, Vancouver Tall Building Report (2025, in the City’s Higher Buildings Policy review): construction cost against height, New York data, relative to a 300 ft tower', page: 'pp.27–28' }

/** Node contract for these lines: B, a sourced industry rule of thumb, and where it stops. */
export const KPF_READINGS_CONFIDENCE = 'B' as const
export const KPF_OFFICE_BOUNDARY = 'An analog: KPF fitted one office tower on a 94 × 63 m test block, so the figure does not hold for a split office stack, an off-optimal core, a larger block such as the competition’s (about 1.9 times the area) or a non-Vancouver market.'
export const KPF_COST_BOUNDARY = 'New York cost cases that KPF itself calls poorly correlated with height: a band for context only, not a cost plan, and silent below 800 ft and beyond its test fits at 1,000 ft.'

const m = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1))
const area = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`

/** The KPF band a height (m) falls in: the band at or below it; null under 800 ft. */
export function kpfCostBand(heightM: number) {
  const ft = heightM / FT
  const band = [...KPF_COST_BANDS].reverse().find((b) => ft >= b.from - 1e-6) ?? null
  return { ft, band }
}

/** Office floor area and the top of the highest office storey of one tower. */
export function officeStack(t: Tower): { gfa: number; top: number | null } {
  let gfa = 0, top: number | null = null
  for (const f of towerFloors(t)) {
    const a = floorAreasByUse(f).office ?? 0
    if (a <= 0) continue
    gfa += a
    top = Math.max(top ?? 0, f.z1)
  }
  return { gfa, top }
}

/** Office stack against KPF's lot test, for one tower. Reported: state unknown. */
export function officeStackReading(t: Tower): RuleResult {
  const { gfa, top } = officeStack(t)
  const L = KPF_OFFICE_LOT
  const over = gfa > L.gfaM2 || (top ?? 0) > L.heightM
  const value = gfa <= 0 ? 'No office floors' : `Office ${area(gfa)} (${Math.round((100 * gfa) / L.gfaM2)}% of KPF’s office tower), top of the office stack +${m(top ?? 0)} m`
  return {
    id: `kpf-office-${t.id}`, label: `Office stack against the KPF lot test (${t.name})`, value,
    threshold: `Reported, not a test: KPF fitted about ${area(L.gfaM2)} (${L.gfaSf.toLocaleString('en-CA')} sf) of office up to about ${L.heightM} m (${L.heightFt} ft) on a Vancouver lot`,
    state: 'unknown', flag: 'unverified', source: KPF_OFFICE_SOURCE,
    note: [
      over ? 'More office, or office higher, than KPF fitted in one tower: KPF expects a bigger core off its optimum, a split stack or other uses on top (pp.6–8; Dobson p.72).' : gfa > 0 ? 'Within KPF’s plausible office tower on both counts.' : 'This tower has no office floors to read.',
      `Confidence ${KPF_READINGS_CONFIDENCE} (sourced industry rule of thumb). Boundary: ${KPF_OFFICE_BOUNDARY}`,
      'Never part of the residual or of any verdict.',
    ].join(' '),
    ...(over && gfa > 0 ? { specialist: 'Past KPF’s office test fit: the core and lifts for this much office need the vertical-transportation consultant and the structural engineer.' } : {}),
  }
}

/** KPF's cost band against height, for one tower. Reported beside the residual: state unknown, never folded into it. */
export function costBandReading(t: Tower): RuleResult {
  const { ft, band } = kpfCostBand(t.height)
  const value = band
    ? `${m(t.height)} m (${Math.round(ft).toLocaleString('en-CA')} ft): ${band.low.toFixed(1)}–${band.high.toFixed(1)}× the cost of a 300 ft tower (KPF ${band.label} band)`
    : `${m(t.height)} m (${Math.round(ft).toLocaleString('en-CA')} ft): under 800 ft, below the bands KPF reports`
  return {
    id: `kpf-cost-${t.id}`, label: `Cost against height, KPF band (${t.name})`, value,
    threshold: 'Reported beside the residual, never in it: 800 ft 1.7–2.1×, 900 ft 2.1–3.0×, 1,000 ft and over 1.5–4.1× (relative to 300 ft)',
    state: 'unknown', flag: 'unverified', source: KPF_COST_SOURCE,
    note: [
      'KPF calls the correlation between height and cost poor (pp.27–28). Between two bands the band at or below the height is shown (team reading).',
      'The residual keeps its own cost basis (research P08-M03 height premium); this band does not change it.',
      `Confidence ${KPF_READINGS_CONFIDENCE} (sourced industry rule of thumb). Boundary: ${KPF_COST_BOUNDARY}`,
    ].join(' '),
    ...(ft > 1000 + 1e-6 ? { specialist: 'Taller than KPF’s test fits (1,000 ft, 304.8 m): a cost consultant prices it.' } : {}),
  }
}

/** Every reading for a design, tower by tower: the office stack, then the cost band. */
export function kpfReadings(towers: Tower[]): RuleResult[] {
  return towers.flatMap((t) => [officeStackReading(t), costBandReading(t)])
}
