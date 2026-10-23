// Lift strategy comparator (research P11-M02): single-deck direct vs sky lobby, computed with the lift check, and
// double-deck and destination control shown with the checks the research supports. Their round-trip formulas were
// not retrieved, so they are never given a capacity or a core area here (research P11-M02 method and limits).
import { DEFAULT_EGRESS_PRESETS, type EgressPresets } from './egress'
import { DEFAULT_LIFT_PRESETS, liftCheck, suggestSkyLobby, type LiftPresets, type LiftResult } from './lifts'
import { towerFloors } from './massing'
import type { Flag, Floor, RuleResult, RuleState, Source, Tower } from './types'

export type StrategyId = 'direct' | 'skylobby' | 'doubledeck' | 'destination'
export interface StrategyOption {
  id: StrategyId
  name: string
  /** Cars, shafts and core come from the lift check (computed) or are not computed (roadmap). */
  computed: boolean
  result: LiftResult | null
  transfers: string
  fails: number
  warns: number
  checks: RuleResult[]
  note: string
}

const PETERS: Source = { label: 'Peters, lift planning guidance (as summarised in research P11)' }
const UQ: Source = { label: 'University of Queensland Design Standard DS-11 (research P11)' }
const TSBC: Source = { label: 'Technical Safety BC elevating devices page (research P11: silent on double-deck)' }
const VBBL_FF: Source = { label: 'VBBL 2019', page: '3.2.6.5.(5)' }
const MAKERS: Source = { label: 'Manufacturer figures cited in research P11 (P11-S33), not independent' }
const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })

const count = (r: LiftResult | null, s: RuleState) => (r ? r.rules.filter((x) => x.state === s).length : 0)

/** Double-deck needs every served floor at one height (two cabs serve adjacent floors together). Served = tower
 * floors above grade that a passenger car stops at: not the podium (own exits and lifts) and not plant. */
export function floorHeights(floors: Floor[]) {
  const served = floors.filter((f) => !f.podium && f.z0 > 0.5 && f.use !== 'mechanical')
  const heights = [...new Set(served.map((f) => Math.round((f.z1 - f.z0) * 100) / 100))].sort((a, b) => a - b)
  return { served, heights, uniform: heights.length <= 1 }
}

export function liftStrategies(t: Tower, lp: LiftPresets = DEFAULT_LIFT_PRESETS, ep: EgressPresets = DEFAULT_EGRESS_PRESETS) {
  const direct = liftCheck({ ...t, skyLobbies: [], skyRoom: null }, lp, ep, { skipDirect: true })
  const level = t.skyLobbies?.length ? null : suggestSkyLobby(t)
  const sky = t.skyLobbies?.length ? liftCheck(t, lp, ep, { skipDirect: true }) : level !== null ? liftCheck({ ...t, skyLobbies: [level] }, lp, ep, { skipDirect: true }) : null
  const skyAt = t.skyLobbies?.length ? t.skyLobbies : level !== null ? [level] : []

  const { served, heights, uniform } = floorHeights(towerFloors(t))
  const options: StrategyOption[] = [
    { id: 'direct', name: 'Single-deck, direct', computed: true, result: direct, transfers: 'none', fails: count(direct, 'fail'), warns: count(direct, 'warn'), checks: [], note: 'Every rise starts at grade.' },
    {
      id: 'skylobby', name: t.skyLobbies?.length ? `Sky lobby at L${skyAt.join(', L')}` : skyAt.length ? `Sky lobby at L${skyAt[0]} (suggested)` : 'Sky lobby', computed: !!sky, result: sky,
      transfers: skyAt.length ? `one, above L${skyAt[0]}` : '—', fails: count(sky, 'fail'), warns: count(sky, 'warn'), checks: [],
      note: sky ? 'Shuttles to the sky lobby; upper rises start there. A transfer is a design choice (direct travel is a London office criterion; a public sky room can make it a destination).' : 'This tower is too short or too uniform for a sky lobby to be suggested.',
    },
    {
      id: 'doubledeck', name: 'Double-deck', computed: false, result: null, transfers: 'none (two-floor lobby at grade)', fails: 0, warns: 0,
      checks: [
        rule('dd-uniform', 'Served floors at one height', uniform ? `all ${served.length} at ${heights[0] ?? '—'} m` : `${heights.length} different heights: ${heights.join(', ')} m`, 'every stopped floor equal height, or adjustable-spacing cabs', uniform ? 'pass' : 'fail', 'verified', PETERS),
        rule('dd-capacity', 'Cars, shafts and core', 'not computed', 'a round-trip formula for double-deck groups', 'unknown', 'unresolved', PETERS, 'The double-deck round-trip method was not retrieved in research; nothing is estimated until it is implemented from worked cases and validated.'),
        rule('dd-regulator', 'Regulator acceptance', 'not confirmed', 'acceptance by Technical Safety BC', 'unknown', 'unresolved', TSBC),
        rule('dd-firefighter', 'Firefighter lift with double-deck passenger cars', 'needs agreement', 'firefighter lift reaches every floor with at most one change', 'unknown', 'unresolved', VBBL_FF, 'The firefighter lift itself stays single-deck; the authority having jurisdiction has to agree the arrangement.'),
      ],
      note: 'Halves the stops and puts two cabs in each shaft; needs equal floor heights and a two-level entrance lobby.',
    },
    {
      id: 'destination', name: 'Destination control', computed: false, result: null, transfers: 'as the chosen layout', fails: 0, warns: 0,
      checks: [
        rule('dc-awt', 'Average waiting time', 'simulation not performed', '≤ 0.8 × the nominated interval', 'unknown', 'verified', UQ, 'The rule is an institutional design standard (Australia), not a code; it needs a traffic simulation, which is roadmap.'),
        rule('dc-gain', 'Up-peak gain claimed by makers', '25–30% (not applied)', 'independent evidence', 'unknown', 'unverified', MAKERS, 'Marketing figures: the comparator does not shrink any group by them.'),
      ],
      note: 'Groups passengers by destination at the lobby; a dispatch strategy on top of a layout, not a layout of its own.',
    },
  ]
  // Recommended: the computed layout with no failing lift rule and the smallest core.
  const ok = options.filter((o) => o.computed && o.result && o.fails === 0)
  const best = ok.length ? ok.reduce((a, b) => (b.result!.requiredMax < a.result!.requiredMax ? b : a)).id : null
  return { options, best, uniform }
}
