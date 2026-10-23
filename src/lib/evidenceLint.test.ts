// Plan §4: unsourced thresholds fail. Runs every built engine on the default design of both projects (and a variant
// that exercises sky rooms, sky lobbies and plant floors) and fails on any result without a source, a stated
// threshold or a known flag, or a "verified" result with nothing a reader could check.
import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_REALM, frontageCheck, groundPlaneCheck, streetwallCheck } from '../engine/publicRealm'
import { DEFAULT_ECON } from '../engine/economics'
import { DEFAULT_MOBILITY, mobilityCheck } from '../engine/mobility'
import { DEFAULT_FACADE, facadeCheck } from '../engine/facade'
import { cityInNature, DEFAULT_NATURE } from '../engine/cityInNature'
import { egressCheck } from '../engine/egress'
import { liftCheck } from '../engine/lifts'
import { skyRoomCheck } from '../engine/skyRoom'
import { structureCheck } from '../engine/structure'
import { vtcRules, SITE } from '../engine/vtcRules'
import { windProcedure, windStudyRules } from '../engine/windStructure'
import type { RuleResult, Tower } from '../engine/types'
import { DEFAULT_SKY_ROOM, useStore } from '../store'
import { lintRow, lintRule, lintRules as lintAll, type LintIssue } from './evidenceLint'

let checked = 0
const lintRules = (node: string, rules: RuleResult[]) => { checked += rules.length; return lintAll(node, rules) }

const init = useStore.getInitialState()
const variants = (list: Tower[]): Tower[] => [...list, ...list.map((t) => ({ ...t, id: `${t.id}-sky`, skyLobbies: [20, 40], skyRoom: { ...DEFAULT_SKY_ROOM, level: 40 }, plantEvery: 15 }))]

function allIssues(): LintIssue[] {
  const out: LintIssue[] = []
  for (const project of ['vtc', 'city'] as const) {
    const towers = variants(init.towers[project])
    if (project === 'vtc') {
      out.push(...lintRules('built.vtc-rules', vtcRules(towers, { fsrTier: 2, transitLink: false })))
      out.push(...lintRules('built.vtc-rules', vtcRules(towers, { fsrTier: 1, transitLink: true })))
      out.push(...lintRules('built.pr-streetwall', streetwallCheck(towers, DEFAULT_PUBLIC_REALM).rules))
      out.push(...lintRules('built.pr-frontage', frontageCheck(towers, DEFAULT_PUBLIC_REALM).rules))
      out.push(...lintRules('built.pr-ground', groundPlaneCheck(towers, DEFAULT_PUBLIC_REALM).rules))
    }
    for (const t of towers) {
      const lift = liftCheck(t, init.liftPresets, init.egressPresets)
      const egress = egressCheck(t, init.egressPresets)
      out.push(...lintRules('built.core-lifts', lift.rules))
      out.push(...lintRules('built.egress', egress.rules))
      out.push(...lintRules('built.sky-room', skyRoomCheck(t, lift, egress, init.egressPresets, init.liftPresets).rules))
      const wp = windProcedure(t)
      out.push(...lintRules('wind', wp.rules))
      out.push(...lintRules('structure', structureCheck(t, wp).rules))
    }
    out.push(...lintRules('wind', windStudyRules(Math.max(...towers.map((t) => t.height)))))
    out.push(...lintRules('built.mobility', mobilityCheck(towers, { ...DEFAULT_MOBILITY, carStalls: 100, loadingB: 2, trucksPerHour: 2, dwellMin: 20 }, { project, transitLink: true, homeM2: 75, hotelM2PerKey: 40 }).rules))
    out.push(...lintRules('built.facade', facadeCheck(towers, { ...DEFAULT_FACADE, treated: 0.7, vlt: 0.5, shgc: 0.3 }, project === 'vtc' ? 45 : 0).rules))
    out.push(...lintRules('built.facade', facadeCheck(towers, DEFAULT_FACADE, 0).rules))
    out.push(...lintRules('city-in-nature', cityInNature(DEFAULT_NATURE, project === 'vtc' ? SITE.area : null, null).rules))
  }
  for (const [k, row] of Object.entries(DEFAULT_ECON)) {
    if (k === 'research') {
      const { cost, charges } = DEFAULT_ECON.research
      for (const [id, r] of [...Object.entries(cost.base), ...Object.entries(cost).filter(([i]) => i !== 'base'), ...Object.entries(charges)]) if (r && 'flag' in r) out.push(...lintRow('built.economics', `research.${id}`, r))
    } else if (k === 'valuePerGfa' || k === 'hardCost') for (const [u, r] of Object.entries(row as Record<string, { flag: never; source: string } | null>)) { if (r) out.push(...lintRow('built.economics', `${k}.${u}`, r)) }
    else out.push(...lintRow('built.economics', k, row as { flag: never; source: string }))
  }
  return out
}

describe('evidence lint: unsourced thresholds fail (plan §4)', () => {
  it('flags a result with no source, no threshold or an uncheckable "verified"', () => {
    const bad: RuleResult = { id: 'x', label: 'X', value: '1', threshold: '', state: 'pass', flag: 'verified', source: { label: 'Somewhere' } }
    expect(lintRule('n', bad).map((i) => i.problem)).toEqual(['no threshold stated', '"verified" without a checkable reference (page, clause, URL or source id)'])
    expect(lintRule('n', { ...bad, threshold: '≤ 1', source: { label: '' } }).map((i) => i.problem)).toContain('no source')
    expect(lintRule('n', { ...bad, threshold: '≤ 1', source: { label: 'Brief', page: 'p.19' } })).toEqual([])
  })
  it('passes every built node on both projects', () => {
    checked = 0
    const issues = allIssues()
    expect(issues.map((i) => `${i.node} › ${i.rule}: ${i.problem}`)).toEqual([])
    // Not a vacuous pass: the engines produced a real set of results.
    expect(checked).toBeGreaterThan(100)
  })
})
