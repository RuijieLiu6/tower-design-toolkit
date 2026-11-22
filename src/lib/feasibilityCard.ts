// Economics lens on design options (product #2, 21 Nov: "different people design with it, the public participates"):
// a small feasibility card per scheme in the Design options view (#/options), with the land residual and the
// non-residential FSR margin, and how each moved against the parent scheme (the baseline, the first option). Pure:
// it reruns the economics node (engine/economics.ts) and the FSR summary (engine/vtcRules.ts) on each option's saved
// design, with one set of economics settings for every scheme, so a change is the design's alone. Every figure says
// what it rests on; team assumptions are named as such.
import { economics, money, type EconInputs, type EconPresets, type Verdict } from '../engine/economics'
import type { Flag, Tower } from '../engine/types'
import { BRIEF, fsrSummary, MIN_NONRES_FSR, SITE, TIER_LABEL, type FsrTier } from '../engine/vtcRules'

/** The economics settings shared by every scheme (lib/econStore.ts, without the concept's own items). */
export type EconSettings = Omit<EconInputs, 'siteArea' | 'homeM2' | 'hotelM2PerKey' | 'concept'>

/** The site area a scheme divides by (lib/siteArea.ts projectSiteArea), with its source and flag. */
export interface CardSite { area: number | null; source: string; flag: Flag }

/** What the card needs of an option's design (lib/project/design.ts Design). */
export interface CardDesign {
  project: 'vtc' | 'city'
  towers: Record<'vtc' | 'city', Tower[]>
  fsrTier: FsrTier
  liftPresets: { homeM2: number; hotelM2PerKey: number }
}

export interface Figure {
  /** The number, or null when it cannot be computed (no floor area, no site area, no rule on this site). */
  value: number | null
  /** The figure as shown. */
  text: string
  /** What it rests on, in a few words (team assumptions named). */
  basis: string
  /** The full basis, for the hover. */
  detail: string
  flag: Flag
}

export interface FeasibilityCard {
  project: 'vtc' | 'city'
  /** Land residual after costs, profit and the CAC (EconResult.rlvAfter; without the concept's own costs). */
  residual: Figure & { verdict: Verdict; land: number | null }
  /** Non-residential FSR on the design's tier, and its margin over 9.0 where the brief's rule applies. */
  nonRes: Figure & { fsr: number | null; margin: number | null; tier: FsrTier }
}

export interface FeasibilityChange {
  /** False when the two schemes are on different projects: their figures do not compare. */
  comparable: boolean
  residual: number | null
  margin: number | null
  fsr: number | null
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const signed = (v: number, f: (x: number) => string) => (Math.abs(v) < 1e-9 ? 'no change' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`)

/** The residual's basis: the method, then each kind of input with its flag (team assumptions named). */
export function residualBasis(p: EconPresets, s: EconSettings, land: 'entered' | 'estimated' | 'none', edited: number): { short: string; detail: string } {
  const team = [`soft cost ${pct(p.softShare.value)}`, `finance ${(p.financeRate.value * 100).toFixed(1)}% over ${p.buildYears.value} years`, ...(land === 'entered' ? ['the land price'] : []), ...(edited ? [`${edited} edited ledger row${edited === 1 ? '' : 's'}`] : [])]
  const landText = land === 'entered' ? 'land price entered by you (team assumption)' : land === 'estimated' ? 'land estimated from current zoning × the land rate (unverified)' : 'no land price to compare with'
  return {
    short: `Estimate: market values unverified; team assumptions: ${team.join(', ')}`,
    detail: [
      'Indicative estimate, Program Value Visualizer method and its Vancouver 2026 pack (research P08): not an appraisal.',
      `Market values unverified (most grade C); hard cost on the ${s.costBasis === 'pvv' ? 'Altus 2026 lines (unverified)' : 'research basis, P08-M03 (unverified)'}; profit ${pct(p.profitOnCost.value)} on cost (${p.profitOnCost.flag.replace(/_/g, ' ')}); CAC ${pct(p.cacShare.value)} of the land lift (${p.cacShare.flag.replace(/_/g, ' ')}).`,
      `Team assumptions: ${team.join(', ')}; ${landText}.`,
      `Permit after 30 Sep ${s.permitYear}${s.includeRegional ? ', Metro Vancouver and TransLink charges included' : ', regional charges left out'}; the concept’s own items (open storeys, damper, trees) not included.`,
      'Every scheme uses the same economics settings (this browser’s), so a change is the design’s.',
    ].join(' '),
  }
}

/** One scheme's card: its residual and its non-residential FSR margin, each with its basis. */
export function feasibilityCard(d: CardDesign, site: CardSite, s: EconSettings, p: EconPresets, edited = 0): FeasibilityCard {
  const towers = d.towers[d.project] ?? []
  const e = economics(towers, { ...s, siteArea: site.area, homeM2: d.liftPresets.homeM2, hotelM2PerKey: d.liftPresets.hotelM2PerKey }, p)
  const land = s.landPrice != null ? 'entered' : e.land != null ? 'estimated' : 'none'
  const rb = residualBasis(p, s, land, edited)
  const computed = e.verdict !== 'incomplete'
  const residual: FeasibilityCard['residual'] = {
    value: computed ? e.rlvAfter : null, text: computed ? money(e.rlvAfter) : 'no floor area yet', basis: rb.short, detail: rb.detail,
    flag: 'unverified', verdict: e.verdict, land: e.land,
  }
  const area = d.project === 'vtc' ? SITE.area : site.area
  const tier = d.fsrTier
  const f = area ? fsrSummary(towers, area) : null
  const fsr = f ? (tier === 1 ? f.tier1 : tier === 2 ? f.tier2 : f.tier3) : null
  let nonRes: FeasibilityCard['nonRes']
  if (d.project === 'vtc') {
    const margin = fsr! - MIN_NONRES_FSR
    nonRes = {
      value: margin, fsr, margin, tier, text: `${fsr!.toFixed(2)} FSR · ${margin < 0 ? '−' : '+'}${Math.abs(margin).toFixed(2)} ${margin < 0 ? 'under' : 'over'} ${MIN_NONRES_FSR.toFixed(1)}`,
      basis: `Brief’s 9.0 minimum (verified rule); ${TIER_LABEL[tier]} (the team’s reading of which uses count)`,
      detail: `${BRIEF}, pp.16, 19: a minimum of 9.0 FSR of non-residential, high-employment floor area (verified). Gross floor area from the design on ${TIER_LABEL[tier]}, which uses count being the team’s interpretation until the organiser answers; divided by the competition block (brief p.15, about ${Math.round(SITE.area).toLocaleString('en-CA')} m²).`,
      flag: 'verified',
    }
  } else {
    nonRes = {
      value: null, fsr, margin: null, tier,
      text: fsr == null ? 'no study site yet' : `${fsr.toFixed(2)} FSR · no 9.0 minimum here`,
      basis: fsr == null ? 'No site area: choose a study site' : `No margin on a real site: 9.0 is the competition brief’s rule; ${TIER_LABEL[tier]}`,
      detail: `The 9.0 non-residential minimum belongs to the Vancouver Tall Challenge brief (pp.16, 19); a real Vancouver site’s zoning sets its own density, which this card does not read. ${fsr == null ? site.source : `Gross floor area from the design on ${TIER_LABEL[tier]}, divided by the study site (${site.source}).`}`,
      flag: fsr == null ? 'unresolved' : site.flag,
    }
  }
  return { project: d.project, residual, nonRes }
}

/** A scheme's figures against its parent's (child − parent). */
export function feasibilityChange(card: FeasibilityCard, parent: FeasibilityCard): FeasibilityChange {
  const comparable = card.project === parent.project
  const diff = (a: number | null, b: number | null) => (comparable && a != null && b != null ? a - b : null)
  return { comparable, residual: diff(card.residual.value, parent.residual.value), margin: diff(card.nonRes.margin, parent.nonRes.margin), fsr: diff(card.nonRes.fsr, parent.nonRes.fsr) }
}

/** A change in words: "+C$12.0 M", "−0.40 FSR", "no change", or "—" when it does not compare. */
export function changeText(v: number | null, kind: 'money' | 'fsr'): string {
  if (v == null) return '—'
  return signed(v, kind === 'money' ? (x) => money(x) : (x) => `${x.toFixed(2)} FSR`)
}
