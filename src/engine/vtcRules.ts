// VTC hard-rules checker (research module P01-M01 + P01-M07, simplified for v0.1).
// Every rule cites the competition brief, which the team holds locally:
// "03 Vancouver Tall Competition Brief/.../_Vancouver Tall Challenge - ENG.pdf" (Buildner, 2026).
import { CLASS_LABEL, DEFAULT_LIFT_PRESETS, planRises } from './lifts'
import { gfaByUse, towerFloors, towerFootprint, towerMasses } from './massing'
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

/** `siteArea`: the competition block by default; Real Vancouver passes its study site's area (insert by Integrate Vista, 4 Nov). */
export function fsrSummary(towers: Tower[], siteArea: number = SITE.area) {
  const gfa = gfaByUse(towers)
  const total = Object.values(gfa).reduce((a, b) => a + b, 0)
  const tier = (t: FsrTier) => TIER_USES[t].reduce((s, u) => s + gfa[u], 0) / siteArea
  return { gfa, total, totalFsr: total / siteArea, tier1: tier(1), tier2: tier(2), tier3: tier(3), siteArea }
}

/**
 * Levels a public lift route stops at (gap G42): a public sky room's level, reached by its own public lifts (access
 * 'dedicated') or by the tenants' shuttle to a sky lobby opened to visitors (visitor share above 0). Every other lift
 * the lift plan runs is a tenant lift (office, hotel or residents'), so the levels it alone serves are not public.
 */
export function publicStops(t: Tower): number[] {
  const r = t.skyRoom
  if (!r || !(r.access === 'dedicated' || r.visitorShare > 0)) return []
  return towerFloors(t).some((f) => f.level === r.level && f.skyLobby && !f.podium) ? [r.level] : []
}

/**
 * What carries public uses above the podium, one phrase each (gap G36): civic or amenity levels (bands or floors set
 * by level) and a public sky room. Since G42 a civic or amenity level counts only where a public lift route stops
 * (publicStops); the others are listed apart as not reached by a public route, with the tenant lifts that serve them.
 */
export function verticalPublicRead(towers: Tower[]): { counted: string[]; unreached: string[] } {
  const counted: string[] = [], unreached: string[] = []
  const lv = (ls: number[]) => (ls.length > 3 ? `L${ls[0]}–L${ls[ls.length - 1]} (${ls.length} floors)` : ls.map((l) => `L${l}`).join(', '))
  const floorsWord = (ls: number[]) => `Civic or amenity floor${ls.length > 1 ? 's' : ''} ${lv(ls)}`
  for (const t of towers) {
    const who = towers.length > 1 ? `${t.name}: ` : ''
    const floors = towerFloors(t)
    const stops = new Set(publicStops(t))
    // every civic or amenity level above the podium: from a band or set by level (a sky lobby is read as the sky room)
    const civic = floors.filter((f) => !f.podium && !f.skyLobby && (f.use === 'civic' || f.use === 'amenity'))
    const reached = civic.filter((f) => stops.has(f.level)).map((f) => f.level)
    const missed = civic.filter((f) => !stops.has(f.level))
    if (reached.length) counted.push(`${who}${floorsWord(reached)} above the podium, on the public route`)
    if (missed.length) {
      // the tenant lifts that stop there, from the lift plan (civic and amenity floors ride with the group below)
      const groups = planRises(t, DEFAULT_LIFT_PRESETS)
      const classes = [...new Set(missed.map((f) => groups.find((g) => g.cls !== 'public' && g.floors.some((x) => x.level === f.level))?.cls).filter((c): c is NonNullable<typeof c> => !!c))]
      const by = classes.length ? `reached by the ${classes.map((c) => (c === 'residential' ? "residents'" : CLASS_LABEL[c].toLowerCase())).join(' and ')} lifts only` : 'no lift stops there'
      unreached.push(`${who}${floorsWord(missed.map((f) => f.level))} not reached by a public route (${by})`)
    }
    const r = t.skyRoom, room = r ? floors.find((f) => f.level === r.level && f.skyLobby && !f.podium) : null
    if (r && room && r.visitorShare > 0) counted.push(`${who}Public sky room at L${r.level} (${r.free ? 'free entry' : 'ticketed'}, ${Math.round(r.visitorShare * 100)}% of the floor open to visitors${r.access === 'dedicated' ? ', its own public lifts' : ''})`)
  }
  return { counted, unreached }
}

/** What counts as public use above the podium (verticalPublicRead's counted phrases). */
export function verticalPublic(towers: Tower[]): string[] {
  return verticalPublicRead(towers).counted
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
  // Every stacked block's outline (shifted and twisted blocks included).
  const outside = towers.filter((t) => towerMasses(t).flatMap((m) => m.ring)
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

  // 5. Public-facing uses extending vertically (soft rule): civic or amenity levels above the podium where a public
  // lift route stops (G42), or a public sky room (G36: the line read the bands only). Tenant-only levels are listed apart.
  const vp = verticalPublicRead(towers)
  const upper = vp.counted.length > 0
  out.push({
    id: 'vertical-public',
    label: 'Public uses extend vertically',
    value: [upper ? vp.counted.join('; ') : 'Public uses at grade only', ...vp.unreached].join('; '),
    threshold: 'Encouraged, not required',
    state: upper ? 'pass' : 'warn',
    flag: 'verified',
    source: { label: BRIEF, page: 'p.19 "Explore how public-facing uses and spaces can extend vertically"' },
    note: "Counts a public sky room (a sky lobby opened to visitors, Schematic) and civic or amenity levels above the podium (bands or floors set in Program) only where a public lift route stops: the sky room's own public lifts, or the shuttle to a sky lobby opened to visitors. Levels the tenant lifts alone serve (office, hotel, residents') are listed as not reached by a public route; sky lobbies that stay tenant-only do not count.",
  })
  return out
}
