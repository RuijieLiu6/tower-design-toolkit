// Sourced slenderness bands (P1 #9, book notes 21 Nov): base slenderness = height ÷ the narrowest tower width at its
// base (KPF Vancouver Tall Building Report, 2025, p.10). One reading shared by the wind procedure's band line and the
// streetwall's CDDG slenderness line, so the two never disagree. KPF summarises secondary literature: unverified.
import type { Flag, RuleState, Source } from './types'

/** Band edges (ratios) and the KPF higher-risk height (m). */
export const SLENDER = {
  /** KPF: most efficient between 5 and 6.67 (p.11). */
  efficient: [5, 6.67] as const,
  /** City-wide Design and Development Guidelines (draft) tip: 6:1 to 8:1 or more for tall towers. */
  cddg: 6,
  /** KPF: from 8:1 a tuned mass damper is expected, with cost and sales risk (pp.11, 32, 34; Dobson pp.69, 72). */
  damper: 8,
  /** KPF: over 10:1 damping is needed for comfort (p.11). */
  damping: 10,
  /** KPF: over 15:1 rare, cost climbs fast (p.11; Dobson p.69). */
  rare: 15,
  /** RC seismic book: the slenderest seismic RC example is 6.0 (pp.291, 416). */
  seismicRc: 6,
  /** Allen & Iano: 5 or more is already hard (p.51). */
  hard: 5,
  /** KPF higher-risk band: 800 ft (243.84 m) or more AND 8:1 or more (pp.29–34). */
  riskHeight: 243.84,
  /** The KPF test fits go to 1,000 ft (304.8 m) (Dobson p.73): beyond it the bands are extrapolated. */
  sampleHeight: 304.8,
}

export const KPF: Source = { label: 'KPF, Vancouver Tall Building Report (2025, in the City’s Higher Buildings Policy review): base slenderness and its bands', page: 'pp.10–11, 29–34' }
export const SLENDER_FLAG: Flag = 'unverified'

export interface SlenderReading {
  ratio: number
  base: number
  /** One word for the band. */
  band: 'stocky' | 'efficient' | 'slender' | 'damper' | 'damping' | 'rare'
  /** "5.54:1 (54 m): KPF efficient 5–6.67; CDDG ≥ 6" */
  value: string
  threshold: string
  /** Check at 8:1 or more. */
  state: RuleState
  /** Height ≥ 244 m and slenderness ≥ 8:1 (KPF higher-risk band). */
  risk: boolean
  note: string
  /** Node contract: why the tower lies outside the bands' boundary, when it does. */
  specialist?: string
}

const r2 = (v: number) => v.toFixed(2)
const m = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1))

/** The band reading for a tower of height H (m) whose narrowest base width is `base` (m). */
export function slenderBand(H: number, base: number): SlenderReading {
  const b = Math.max(1, base)
  const ratio = H / b
  const [lo, hi] = SLENDER.efficient
  const band: SlenderReading['band'] = ratio > SLENDER.rare ? 'rare' : ratio > SLENDER.damping ? 'damping' : ratio >= SLENDER.damper ? 'damper' : ratio > hi ? 'slender' : ratio >= lo ? 'efficient' : 'stocky'
  const risk = H >= SLENDER.riskHeight && ratio >= SLENDER.damper
  const word = { stocky: 'below KPF’s efficient band', efficient: 'in KPF’s efficient band', slender: 'past KPF’s efficient band, under the damper line', damper: 'damper expected (KPF)', damping: 'damping needed for comfort (KPF)', rare: 'rare; cost climbs fast (KPF)' }[band]
  const value = `${r2(ratio)}:1 (${m(b)} m): KPF efficient ${lo}–${hi}; CDDG ≥ ${SLENDER.cddg}; ${risk ? 'KPF higher-risk band: 800 ft (244 m) or more and 8:1 or more' : word}`
  const threshold = `Check at ${SLENDER.damper}:1 or more (KPF: dampers expected, with cost and sales risk); over ${SLENDER.damping} damping needed, over ${SLENDER.rare} rare`
  const notes = [
    `Base slenderness: height ÷ the narrowest tower width at its base (KPF p.10). Efficient ${lo}–${hi} (p.11); ${SLENDER.damper}:1 or more expects a tuned mass damper, with cost and sales risk (pp.11, 32, 34; Dobson, Vertical Studio deck, pp.69, 72); over ${SLENDER.damping} damping is needed for comfort; over ${SLENDER.rare} is rare.`,
    risk ? `Higher-risk band: ${m(H)} m is 800 ft (244 m) or more and the tower is ${SLENDER.damper}:1 or more (KPF pp.29–34, from New York cost and sales cases).` : `KPF’s higher-risk band needs both 800 ft (244 m) or more and ${SLENDER.damper}:1 or more (pp.29–34): ${H >= SLENDER.riskHeight ? 'the height is in it, the slenderness is not' : 'not reached'}.`,
    `Seismic reinforced-concrete examples stop at ${SLENDER.seismicRc.toFixed(1)} (RC seismic book pp.291, 416)${ratio > SLENDER.seismicRc ? `: at ${r2(ratio)} this tower is past every one` : ''}; ${SLENDER.hard} or more is already hard (Allen & Iano, The Architect’s Studio Companion, 6th ed., p.51, an NBC 2010 / IBC 2009 analogue).`,
  ]
  const why: string[] = []
  if (H > SLENDER.sampleHeight) why.push(`taller than the KPF test fits (1,000 ft, 304.8 m)`)
  if (ratio > SLENDER.seismicRc) why.push(`more slender than every seismic RC example in the book (${SLENDER.seismicRc.toFixed(1)})`)
  const specialist = why.length ? `Outside the bands’ evidence: ${why.join('; ')}. A structural and wind engineer confirms it.` : undefined
  return { ratio, base: b, band, value, threshold, state: ratio >= SLENDER.damper ? 'warn' : 'pass', risk, note: notes.join(' '), specialist }
}
