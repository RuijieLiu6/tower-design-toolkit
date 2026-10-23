// VTC hard-rules checker (research module P01-M01 + P01-M07, simplified for v0.1).
// Every rule cites the competition brief, which the team holds locally:
// "03 Vancouver Tall Competition Brief/.../_Vancouver Tall Challenge - ENG.pdf" (Buildner, 2026).
import { gfaByUse, towerFootprint } from './massing'
import type { RuleResult, Tower, UseId } from './types'

export const BRIEF = 'Vancouver Tall Challenge brief (Buildner 2026)'
/** Site per brief p.15: approx. 79.2 m x 144.8 m (260 ft x 475 ft). */
export const SITE = { width: 144.8, depth: 79.2, area: 144.8 * 79.2 }
export const HEIGHT_BAND_M: [number, number] = [244, 305]          // brief p.19: 244-305 m
export const HEIGHT_BAND_FT_M: [number, number] = [243.84, 304.8]  // brief p.19: 800-1000 ft, exact in metres
export const MIN_NONRES_FSR = 9.0                                  // brief pp.16, 19

export type FsrTier = 1 | 2 | 3
export const TIER_USES: Record<FsrTier, UseId[]> = {
  1: ['office'],
  2: ['office', 'retail', 'hotel'],
  3: ['office', 'retail', 'hotel', 'civic', 'amenity'],
}
export const TIER_LABEL: Record<FsrTier, string> = {
  1: 'Tier 1: office only',
  2: 'Tier 2: office + commercial + hotel',
  3: 'Tier 3: all non-residential (incl. civic, amenity)',
}

export function fsrSummary(towers: Tower[]) {
  const gfa = gfaByUse(towers)
  const total = Object.values(gfa).reduce((a, b) => a + b, 0)
  const tier = (t: FsrTier) => TIER_USES[t].reduce((s, u) => s + gfa[u], 0) / SITE.area
  return { gfa, total, totalFsr: total / SITE.area, tier1: tier(1), tier2: tier(2), tier3: tier(3) }
}

export function vtcRules(towers: Tower[], opts: { fsrTier: FsrTier; transitLink: boolean }): RuleResult[] {
  const out: RuleResult[] = []

  // 1. Height band, per tower. The brief gives both units; they differ at the edges.
  towers.forEach((t) => {
    const inM = t.height >= HEIGHT_BAND_M[0] && t.height <= HEIGHT_BAND_M[1]
    const inFt = t.height >= HEIGHT_BAND_FT_M[0] && t.height <= HEIGHT_BAND_FT_M[1]
    out.push({
      id: `height-${t.id}`,
      label: `Height band: ${t.name}`,
      value: `${t.height.toFixed(1)} m`,
      threshold: '244–305 m (800–1000 ft)',
      state: inM && inFt ? 'pass' : inM || inFt ? 'warn' : 'fail',
      flag: 'verified',
      source: { label: BRIEF, page: 'p.19 "Propose one or more towers within the 244–305 m (800–1000 ft) height range"' },
      note: inM !== inFt ? 'Passes in one unit only (800–1000 ft = 243.84–304.80 m). Ask Buildner before 3 Nov.' : 'Height measured to the architectural top (team assumption: CTBUH definition).',
    })
  })

  // 2. Non-residential FSR >= 9.0, on the chosen tier (interpretation switch).
  const f = fsrSummary(towers)
  const val = opts.fsrTier === 1 ? f.tier1 : opts.fsrTier === 2 ? f.tier2 : f.tier3
  const allAgree = (f.tier1 >= MIN_NONRES_FSR) === (f.tier3 >= MIN_NONRES_FSR)
  out.push({
    id: 'fsr-nonres',
    label: 'Non-residential FSR ≥ 9.0',
    value: `${val.toFixed(2)} (${TIER_LABEL[opts.fsrTier]})`,
    threshold: '≥ 9.0 FSR non-residential, high-employment',
    state: val >= MIN_NONRES_FSR ? (allAgree ? 'pass' : 'warn') : 'fail',
    flag: 'verified',
    source: { label: BRIEF, page: 'p.16 and p.19 "minimum of 9.0 FSR of non-residential, high-employment floor area"' },
    note: allAgree ? `Tier 1 ${f.tier1.toFixed(2)} · Tier 2 ${f.tier2.toFixed(2)} · Tier 3 ${f.tier3.toFixed(2)} agree.` : `Result depends on which uses count (Tier 1 ${f.tier1.toFixed(2)}, Tier 3 ${f.tier3.toFixed(2)}). Gross floor area, site ${SITE.area.toFixed(0)} m².`,
  })

  // 3. Containment within the block.
  const hx = SITE.width / 2 + 0.1, hy = SITE.depth / 2 + 0.1
  const outside = towers.filter((t) => [...towerFootprint(t), ...towerFootprint(t, true)]
    .some(([x, y]) => Math.abs(x) > hx || Math.abs(y) > hy))
  out.push({
    id: 'containment',
    label: 'Massing inside the block',
    value: outside.length ? `${outside.map((t) => t.name).join(', ')} extends past the block` : 'All massing inside',
    threshold: '79.2 m × 144.8 m consolidated block',
    state: outside.length ? 'fail' : 'pass',
    flag: 'team_assumption',
    source: { label: BRIEF, page: 'p.15 site "approximately 79.2 m × 144.8 m"' },
    note: 'Air-space encroachment over streets would be a departure the jury may accept if justified (p.32).',
  })

  // 4. Below-grade secondary transit entrance.
  out.push({
    id: 'transit',
    label: 'Below-grade transit connection',
    value: opts.transitLink ? 'Designed (declared)' : 'Not yet declared',
    threshold: 'Below-grade secondary entrance to the neighbouring station',
    state: opts.transitLink ? 'pass' : 'unknown',
    flag: 'verified',
    source: { label: BRIEF, page: 'p.19 "a below-grade secondary transit entrance connecting directly to the station on the neighboring site"' },
    note: 'Declared by the designer; the tool does not yet check the route geometry.',
  })

  // 5. Public-facing uses extending vertically (soft rule).
  const upper = towers.some((t) => t.bands.some((b, i) => i > 0 && (b.use === 'civic' || b.use === 'amenity')))
  out.push({
    id: 'vertical-public',
    label: 'Public uses extend vertically',
    value: upper ? 'Civic or amenity use above the podium' : 'Public uses at grade only',
    threshold: 'Encouraged, not required',
    state: upper ? 'pass' : 'warn',
    flag: 'verified',
    source: { label: BRIEF, page: 'p.19 "Explore how public-facing uses and spaces can extend vertically"' },
  })
  return out
}
