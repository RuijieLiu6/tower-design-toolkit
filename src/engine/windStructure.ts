// Wind and structure screening (research P10-M02 slenderness and wind procedure, P10-M01 lateral system shortlist,
// P03-M02 pedestrian wind-study triggers). Classification only: no loads, drifts or comfort maps. Packet P10 had two
// critique rounds and no final gate, so items the research corrected stay "unverified" here; P03 passed three rounds.
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { towerFloors } from './massing'

const NBC: Source = { label: 'National Building Code of Canada 2020, Div B 4.1.7 (2nd printing, 2025)', url: 'https://nrc-publications.canada.ca/eng/view/ft/?id=515340b5-f4e0-4798-be69-692e4ec423e8&dp=2&dsl=en' }
const COMMENTARY: Source = { label: 'NBC 2020 Structural Commentaries, Commentary I (wind)', url: 'https://nrc-publications.canada.ca/eng/view/object/?id=b9fddc27-86f2-496b-9aa4-b66c45164ba6' }
const TABLE_4189: Source = { label: 'NBC 2020 Table 4.1.8.9, Seismic Category SC4 column (as read in research P10)', url: NBC.url }
const TEAM: Source = { label: 'Team assumption (research P10 r1, editable)' }

/** Presets the designer can change (team assumptions). */
export interface WindPresets {
  /** With no model frequency, towers at or above this height default to the Wind Tunnel Procedure. */
  tunnelDefaultHeight: number
  /** Lowest natural frequency from the engineer's model (Hz), or null when there is none (code Ta must not be used). */
  f1: number | null
}
export const DEFAULT_WIND_PRESETS: WindPresets = { tunnelDefaultHeight: 180, f1: null }

/** Height-weighted width across a wind at angle deg to the tower's own axes (podium slices count). All slices share the
 *  tower's rotation, so sampling relative angles finds the true minimum (aligned directions included). */
function effectiveWidth(t: Tower, deg: number) {
  const a = (deg * Math.PI) / 180
  const across = (w: number, d: number) => Math.abs(w * Math.cos(a)) + Math.abs(d * Math.sin(a))
  const along = (w: number, d: number) => Math.abs(w * Math.sin(a)) + Math.abs(d * Math.cos(a))
  let sw = 0, sd = 0, sh = 0
  for (const f of towerFloors(t)) {
    const h = f.z1 - f.z0
    const [w, d] = f.podium ? [t.podiumWidth, t.podiumDepth] : [t.width, t.depth]
    sw += h * across(w, d); sd += h * along(w, d); sh += h
  }
  return { w: sh ? sw / sh : t.width, d: sh ? sd / sh : t.depth }
}

export interface WindProcedure {
  tower: Tower
  H: number
  /** Minimum effective width over 10° azimuth steps, and the effective depth along that wind. */
  w: number
  d: number
  aspect: number
  acrossWind: number
  procedure: 'tunnel' | 'dynamic'
  trigger: string
  rules: RuleResult[]
}

export function windProcedure(t: Tower, p: WindPresets = DEFAULT_WIND_PRESETS): WindProcedure {
  const H = t.height
  let best = { w: Infinity, d: 0 }
  for (let deg = 0; deg < 180; deg += 10) { const e = effectiveWidth(t, deg); if (e.w < best.w) best = e }
  const { w, d } = best
  const aspect = H / w
  const acrossWind = Math.sqrt(w * d) / H
  const f1 = p.f1
  const rules: RuleResult[] = []
  const add = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string) =>
    rules.push({ id, label, value, threshold, state, flag, source, note })

  add('height-60', 'Dynamically sensitive by height', `${H.toFixed(0)} m`, 'over 60 m: Dynamic or Wind Tunnel Procedure', H > 60 ? 'warn' : 'pass', 'verified', { ...NBC, page: '4.1.7.2(2)(b)' },
    'Every 244–305 m tower is dynamically sensitive; the Static Procedure is not available.')
  add('aspect', 'Slenderness H / effective width', `${aspect.toFixed(2)} : 1 (w = ${w.toFixed(1)} m)`, 'up to 4 not sensitive by slenderness; 4–6 dynamically sensitive; over 6 with occupants: tunnel required',
    aspect > 6 ? 'fail' : aspect > 4 ? 'warn' : 'pass', 'verified', { ...NBC, page: '4.1.7.2(2)(c), (3)(b); width per 4.1.7.8(4)' },
    'Effective width is height-weighted over storeys (podium included) and the minimum over wind directions in 10° steps; rectangular plates only. Check against the code’s equation graphic.')
  add('across-wind', 'Across-wind dominance √(w·d) / H', acrossWind.toFixed(2), '1/3 or more: along-wind may govern; below 1/3: across-wind accelerations govern',
    acrossWind < 1 / 3 ? 'warn' : 'pass', 'verified', { ...COMMENTARY, page: 'para. 108' })
  const f1State: RuleState = f1 === null ? (H >= p.tunnelDefaultHeight ? 'fail' : 'unknown') : f1 <= 0.25 ? 'fail' : f1 < 1 ? 'warn' : 'pass'
  add('f1', 'Lowest natural frequency f1', f1 === null ? 'no model frequency' : `${f1} Hz`,
    f1 === null ? `none supplied: towers of ${p.tunnelDefaultHeight} m or more default to the tunnel` : 'at or below 0.25 Hz: tunnel required; 0.25–1 Hz: dynamic',
    f1State, f1 === null ? 'team_assumption' : 'verified', f1 === null ? { ...TEAM, page: `default ${p.tunnelDefaultHeight} m` } : { ...NBC, page: '4.1.7.2(2)(a), (3)(a)' },
    'Use the engineer’s model frequency. The code’s empirical period Ta is for seismic loads, not wind (Commentary J).')
  const slender = aspect > 10 ? 'fail' : aspect > 7 ? 'warn' : 'pass'
  add('super-slender', 'Super-slender band', `${aspect.toFixed(2)} : 1`, 'up to 7; above 10 expect tuned mass dampers, shaping or windbreak floors', slender, 'team_assumption', TEAM,
    'No sourced threshold; precedent only (432 Park Avenue, about 15:1, two dampers and windbreak floors).')

  const tunnelBy = aspect > 6 ? 'slenderness over 6' : f1 !== null && f1 <= 0.25 ? 'f1 at or below 0.25 Hz' : f1 === null && H >= p.tunnelDefaultHeight ? `height of ${p.tunnelDefaultHeight} m or more with no model frequency (team default)` : ''
  return { tower: t, H, w, d, aspect, acrossWind, procedure: tunnelBy ? 'tunnel' : 'dynamic', trigger: tunnelBy || 'dynamically sensitive (height over 60 m)', rules }
}

// --- Lateral system shortlist (P10-M01) ---------------------------------------------------------------------------

export type Fit = 'shortlist' | 'check' | 'out'
export interface SystemFit { id: string; name: string; fit: Fit; route: string; reason: string; flag: Flag; source: Source }

/** Screening only, never a single best: which lateral systems survive this height at Vancouver's Seismic Category SC4. */
export function systemShortlist(t: Tower, wp: WindProcedure): SystemFit[] {
  const H = t.height
  const storeys = towerFloors(t).length
  const out: SystemFit[] = []
  out.push({ id: 'core-walls', name: 'Concrete core walls (ductile, coupled or partially coupled)', route: 'Listed SFRS, no SC4 height cap',
    fit: storeys > 70 ? 'check' : 'shortlist', reason: storeys > 70 ? `${storeys} storeys is past the ~70-storey precedent envelope for a core without outriggers` : `${storeys} storeys is within the ~70-storey precedent envelope`,
    flag: 'unverified', source: { ...TABLE_4189, page: 'ductile walls Rd 3.5–4.0; envelope is secondary precedent (team)' } })
  out.push({ id: 'outriggers', name: 'Core walls with outriggers or belt trusses', route: 'Core walls as the listed SFRS; outriggers as capacity-protected elements (lowest RdRo); special study likely',
    fit: wp.aspect > 6 || storeys > 70 ? 'shortlist' : 'check', reason: 'Engages the perimeter for drift and overturning; outriggers are not a listed SFRS in NBC 2020. Stiff outrigger floors shorten the real period: dynamic analysis.',
    flag: 'unverified', source: { ...TABLE_4189, page: '4.1.8.9(3), (5)' } })
  out.push({ id: 'md-walls', name: 'Moderately ductile concrete walls', route: 'Listed, capped at 60 m at SC4', fit: H > 60 ? 'out' : 'shortlist',
    reason: H > 60 ? `${H.toFixed(0)} m is above the 60 m SC4 cap` : 'within the 60 m cap', flag: 'unverified', source: { ...TABLE_4189, page: 'SC4 height limits' } })
  out.push({ id: 'steel-mrf', name: 'Steel ductile moment frame alone', route: 'Listed, no SC4 cap', fit: storeys > 40 ? 'check' : 'shortlist',
    reason: storeys > 40 ? 'steel frames alone become uneconomic above about 40 storeys (secondary sources)' : 'within the ~40-storey economy band', flag: 'team_assumption', source: TEAM })
  out.push({ id: 'brbf', name: 'Ductile buckling-restrained braced frame', route: 'Listed, capped at 40 m at SC4', fit: H > 40 ? 'out' : 'shortlist',
    reason: H > 40 ? `${H.toFixed(0)} m is above the 40 m SC4 cap` : 'within the 40 m cap', flag: 'unverified', source: { ...TABLE_4189, page: 'SC4 height limits' } })
  out.push({ id: 'diagrid', name: 'Diagrid or mega-frame', route: 'Not a listed SFRS: alternative solution (equivalence) with peer review; unlisted systems take Rd = Ro = 1.0',
    fit: 'check', reason: 'Possible only through the equivalence route; "other" SFRS are not permitted at SC3–SC4.', flag: 'unverified', source: { ...TABLE_4189, page: 'Commentary J paras 213–214' } })
  out.push({ id: 'timber', name: 'Mass timber lateral system', route: 'Timber SFRS limited to 20 m at SC4; prescriptive timber stops at 18 storeys / 76 m', fit: 'out',
    reason: 'A supertall lateral system must be concrete, steel or composite; timber can stay in a separated podium building.', flag: 'unverified', source: { label: 'BC Building Code 2024 3.2.2.93; NBC 2020 Table 4.1.8.9 (as read in research P10)' } })
  return out
}

export const CONTINUITY_RULE = 'Keep the core walls (the SFRS) continuous from the top to the foundation: no transfer or offset, including at the podium; open podium spaces wrap around the core (NBC 2020 4.1.8.10(4), where Ta ≥ 1 s).'

export const WIND_FALSE_ASSUMPTIONS = [{
  claim: 'A Strouhal number of about 1/5 applies to any tower shape.',
  correction: 'About 1/5 holds only for large circular structures; non-circular plans take about 1/7, which raises the critical vortex-shedding speed by about 40% (V = f·D / S). Commentary I recommends tunnel tests for non-circular sections.',
  source: { ...COMMENTARY, page: 'paras. 103–105' },
}]

// --- Pedestrian wind-study triggers (P03-M02) ----------------------------------------------------------------------

const P03 = {
  toronto: { label: 'City of Toronto, Pedestrian Level Wind Study Terms of Reference (2022)', url: 'https://www.toronto.ca/wp-content/uploads/2022/03/8f9c-CityPlanning-ToR-Wind-Guide.pdf' },
  hamilton: { label: 'City of Hamilton, Development Application Guidelines: Wind Study (20 Feb 2026)', url: 'https://www.hamilton.ca/sites/default/files/2026-02/pedguidelines-wind-study-ph1proposed.pdf' },
  london: { label: 'City of London, Wind Microclimate Guidelines (Aug 2019)', url: 'https://www.cityoflondon.gov.uk/assets/Services-Environment/wind-microclimate-guidelines.pdf' },
} satisfies Record<string, Source>

export interface StudyTrigger { id: string; jurisdiction: string; level: string; state: RuleState; source: Source; flag: Flag }

/** What each analog city would require for the tallest tower; Vancouver has no numeric trigger the research could find. */
export function windStudyTriggers(maxHeight: number): StudyTrigger[] {
  const H = maxHeight
  return [
    { id: 'toronto', jurisdiction: 'Toronto analog (downtown)', level: H > 100 ? 'High: CFD plus a wind-tunnel study at rezoning' : H >= 60 ? 'Between the extracted Low and High rows: read Table 1' : H > 20 ? 'Low: CFD phases 1 and 2' : 'Below the Low row', state: H > 100 ? 'warn' : H >= 60 ? 'unknown' : 'pass', source: { ...P03.toronto, page: 'Table 1' }, flag: 'verified' },
    { id: 'hamilton', jurisdiction: 'Hamilton analog', level: H >= 44 ? 'Quantitative wind-tunnel study' : H >= 20 ? 'Tunnel study if over 2× the surroundings or 2+ buildings of 20 m+' : 'No study', state: H >= 44 ? 'warn' : 'pass', source: { ...P03.hamilton, page: 'rules 1–3' }, flag: 'verified' },
    { id: 'london', jurisdiction: 'City of London analog', level: H > 100 ? 'Tunnel or CFD for massing, then both by independent consultants' : H > 25 ? 'Between the extracted bands: read the guideline' : 'No study unless sensitive uses (if not taller than the surroundings)', state: H > 100 ? 'warn' : H > 25 ? 'unknown' : 'pass', source: { ...P03.london, page: 'height bands' }, flag: 'verified' },
    { id: 'vancouver', jurisdiction: 'Vancouver', level: 'No numeric wind criteria or trigger found; Higher Buildings Policy asks for no adverse microclimate effects (qualitative)', state: 'unknown', source: { label: 'Research P03: City of Vancouver hosts returned HTTP 403, so absence is not proven' }, flag: 'unresolved' },
  ]
}

export const ANALOG_LABEL = 'Criteria: Toronto 2022 analog (team assumption). No City of Vancouver numeric wind criteria were found.'
export const NO_ENGINE_NOTE = 'No credible wind engine runs in a browser yet. Steady CFD (OpenFOAM) needs a server or a consultant, machine-learning surrogates have undisclosed training data, and Eddy3D needs Rhino 8. At massing stage even CFD cannot reliably predict gusts or safety exceedances (Toronto ToR). So this node shows study triggers and massing cues, not a comfort map (research P03-M05).'

export function windStudyRules(maxHeight: number): RuleResult[] {
  return windStudyTriggers(maxHeight).map((x) => ({ id: `trigger-${x.id}`, label: `Wind study: ${x.jurisdiction}`, value: x.level, threshold: 'analog rule for this height', state: x.state, flag: x.flag, source: x.source, note: ANALOG_LABEL }))
}
