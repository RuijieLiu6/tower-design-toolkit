// The designer's own estimates against the engine readings for the same model (gap G81, Study 4 lesson 3). A hand
// study often counts area and homes with a rule of thumb (homes = residential area × efficiency ÷ area per home); the
// engine lays homes out storey by storey on the true plates. Side by side, each row gives the estimate, the engine's
// reading and the difference; for homes, when the estimate's own rule is given, the gap is split in two:
// - counting: the estimate's rule applied to the engine's own residential area, against the engine's homes (the method);
// - area: the estimate against its rule on the engine's area (the model's area differs from the one the estimate used).
// Arithmetic only: nothing here is a coefficient. The rule's numbers are the designer's, typed with the estimate.
import { fsrSummary, SITE } from './vtcRules'
import { interiorCheck } from './interior'
import { towerFloors } from './massing'
import type { RuleResult, Tower } from './types'

export interface DesignEstimates {
  /** Who made them, in a few words (shown in the lines). */
  by?: string
  /** Non-residential FSR (office, retail and hotel over the site area: the brief's tier 2). */
  nonResFsr?: number
  /** Homes. */
  homes?: number
  /** Gross floor area (m²). */
  gfa?: number
  /** Height (m). */
  height?: number
  /** The estimate's own homes rule: area per home (m²) and net-to-gross efficiency (0–1). */
  homeM2?: number
  efficiency?: number
}

const SRC = { label: "Designer's estimates (as typed) against the toolkit's readings of the same model (engine/estimateCheck.ts)" }
const pc = (a: number, b: number) => (b ? `${a >= b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(0)}%` : '—')
const n0 = (v: number) => Math.round(v).toLocaleString('en-CA')

export interface EstimateRow { id: string; what: string; estimate: number; engine: number; diff: number; split?: { counting: number; area: number; ruleOnEngine: number } }

/** Rows for each estimate given (the engine's homes as the interior layout counts them on the true plates). No site
 *  area (null): no FSR row. */
export function estimateRows(t: Tower, e: DesignEstimates, siteArea: number | null = SITE.area): EstimateRow[] {
  const out: EstimateRow[] = []
  const floors = towerFloors(t)
  const fsr = fsrSummary([t], siteArea ?? 1)
  if (e.nonResFsr != null && siteArea) out.push({ id: 'estimate-fsr', what: 'Non-residential FSR (tier 2)', estimate: e.nonResFsr, engine: fsr.tier2, diff: fsr.tier2 - e.nonResFsr })
  if (e.gfa != null) out.push({ id: 'estimate-gfa', what: 'Gross floor area (m²)', estimate: e.gfa, engine: fsr.total, diff: fsr.total - e.gfa })
  if (e.height != null) out.push({ id: 'estimate-height', what: 'Height (m)', estimate: e.height, engine: t.height, diff: t.height - e.height })
  if (e.homes != null) {
    const homes = interiorCheck(t, floors).totals.homes
    const row: EstimateRow = { id: 'estimate-homes', what: 'Homes', estimate: e.homes, engine: homes, diff: homes - e.homes }
    if (e.homeM2 && e.homeM2 > 0 && e.efficiency && e.efficiency > 0) {
      const ruleOnEngine = (fsr.gfa.residential * e.efficiency) / e.homeM2
      row.split = { ruleOnEngine, counting: homes - ruleOnEngine, area: ruleOnEngine - e.homes }
    }
    out.push(row)
  }
  return out
}

/** The rows as reported lines (state unknown: a comparison, never a pass or fail). */
export function estimateLines(t: Tower, e: DesignEstimates | null | undefined, siteArea: number | null = SITE.area): RuleResult[] {
  if (!e) return []
  const who = e.by ? ` (${e.by})` : ''
  return estimateRows(t, e, siteArea).map((r) => {
    const fmt = r.id === 'estimate-fsr' ? (v: number) => v.toFixed(2) : n0
    const split = r.split
      ? ` Split: the estimate's rule (${e.homeM2} m² a home at ${Math.round(e.efficiency! * 100)}%) on the engine's ${n0(fsr0(t, siteArea))} m² of homes gives ${n0(split0(r).ruleOnEngine)}; counting storey by storey adds ${n0(split0(r).counting)}, the model's different area ${n0(split0(r).area)}.`
      : r.id === 'estimate-homes' ? ' Give the estimate\'s area per home and efficiency to split the gap into counting and area.' : ''
    return {
      id: r.id, label: `${t.name}: ${r.what}, estimate against engine${who}`,
      value: `estimate ${fmt(r.estimate)}, engine ${fmt(r.engine)} (${r.diff >= 0 ? '+' : '−'}${fmt(Math.abs(r.diff))}, ${pc(r.engine, r.estimate)})`,
      threshold: 'reported: the engine reads the model as built', state: 'unknown', flag: 'verified', source: SRC,
      note: `The engine's number is the toolkit's reading of this model with its current settings.${split}`,
    } satisfies RuleResult
  })
}
const fsr0 = (t: Tower, siteArea: number | null) => fsrSummary([t], siteArea ?? 1).gfa.residential
const split0 = (r: EstimateRow) => r.split!
