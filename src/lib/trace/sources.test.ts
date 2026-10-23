import { describe, expect, it } from 'vitest'
import { NODE_GROUPS, RULE_CARDS, cardMatches, cardsFor } from '../../data/ruleCards'
import { nodeById } from '../../data/registry'
import { cityInNature } from '../../engine/cityInNature'
import { egressCheck } from '../../engine/egress'
import { liftCheck } from '../../engine/lifts'
import { structureCheck } from '../../engine/structure'
import { lifeSafety } from '../../engine/lifeSafety'
import { fsrSummary, SITE, vtcRules } from '../../engine/vtcRules'
import { windProcedure } from '../../engine/windStructure'
import { useStore } from '../../store'
import { digestResults } from './digest'
import { groupKey, rulesBehind, sourceIndex, weakestOf, worstOf } from './sources'

/** The live results the app computes for the default competition design, plus a modelled cone result, without React. */
function liveLines() {
  const s = useStore.getInitialState()
  const towers = s.towers.vtc
  const nature = cityInNature(s.cityInNature, SITE.area, ['clear'])
  const results = {
    fsr: fsrSummary(towers),
    rules: vtcRules(towers, { fsrTier: s.fsrTier, transitLink: s.transitLink }),
    lifts: towers.map((t) => ({ tower: t, ...liftCheck(t, s.liftPresets, s.egressPresets) })),
    egress: towers.map((t) => ({ tower: t, ...egressCheck(t, s.egressPresets, s.liftPresets) })),
    cones: [{ tower: towers[0], checks: [], overall: 'clear', topZ: 285 }],
    nature: nature.rules,
    wind: towers.map((t) => ({ tower: t, rules: windProcedure(t).rules })),
    structure: towers.map((t) => ({ tower: t, rules: structureCheck(t, windProcedure(t)).rules })),
    lifeSafety: towers.map((t) => ({ tower: t, rules: lifeSafety(t, liftCheck(t, s.liftPresets, s.egressPresets), egressCheck(t, s.egressPresets, s.liftPresets), { transitLink: false, liftPresets: s.liftPresets }).rules })),
  }
  return digestResults(results as unknown as Record<string, unknown>).lines
}

describe('rule cards (P16-M02)', () => {
  it('summarise in the team’s words: no quotations, every card unreviewed, with a clause and a pattern', () => {
    for (const c of RULE_CARDS) {
      expect(c.summary.length, c.id).toBeGreaterThan(30)
      expect(c.summary, c.id).not.toMatch(/[“”"]/)
      expect('quote' in c, c.id).toBe(false)
      expect(c.source.label.length).toBeGreaterThan(5)
      expect(c.results.length, c.id).toBeGreaterThan(0)
      for (const p of c.results) expect(p, c.id).toMatch(/^[A-Za-z]+:[a-z0-9-]+$/)
    }
    expect(new Set(RULE_CARDS.map((c) => c.id)).size).toBe(RULE_CARDS.length)
    expect(RULE_CARDS.length).toBeGreaterThanOrEqual(18)
  })
  it('match by results group and rule id, so a rule id shared across groups does not cross over', () => {
    expect(cardsFor('rules:height-t1').map((c) => c.id)).toEqual(['vtc.height-band'])
    expect(cardsFor('wind:t1:height-60').map((c) => c.id)).toEqual(['nbc.wind-procedure'])
    expect(cardsFor('lifts:t1:ntg-t1').map((c) => c.id)).toEqual(['lifts.net-to-gross'])
    expect(cardsFor('egress:t1:travel-podium-t1').map((c) => c.id)).toEqual(['egress.travel'])
    expect(cardsFor('egress:t1:podium-exits-t1')).toEqual([])
    expect(cardMatches(RULE_CARDS.find((c) => c.id === 'pvg.3.1.1')!, 'cones:t1:overall')).toBe(true)
  })
  it('every card backs at least one live result, and names built nodes that exist', () => {
    const lines = liveLines()
    for (const c of RULE_CARDS) {
      expect(lines.some((l) => cardMatches(c, l.id)), `${c.id} matches no live result`).toBe(true)
      for (const n of c.usedBy) expect(nodeById(n), `${c.id} → ${n}`).toBeDefined()
    }
    for (const n of Object.keys(NODE_GROUPS)) expect(nodeById(n), n).toBeDefined()
  })
})

describe('sources in use', () => {
  it('carries each result’s source into the digest and groups lines by document and clause', () => {
    const lines = liveLines()
    expect(lines.find((l) => l.id === 'lifts:t1:ntg-t1')!.source!.label).toMatch(/Stopes/)
    const idx = sourceIndex(lines)
    const exits = idx.filter((e) => e.label.includes('3.4 Exits'))
    expect(exits.map((e) => e.page)).toEqual(expect.arrayContaining(['3.4.2.1', '3.4.2.3', '3.4.2.5']))
    expect(idx.find((e) => e.page === '3.4.2.1')!.cards).toEqual(['egress.exits'])
    expect(idx.some((e) => e.cards.length === 0)).toBe(true) // e.g. team presets: cited, not carded
    expect(new Set(idx.map((e) => e.key)).size).toBe(idx.length)
  })
  it('lists the rules behind a node: its cards with live states, then its other sources', () => {
    const lines = liveLines()
    const r = rulesBehind('built.core-lifts', lines)
    expect(r.cards.map((c) => c.card.id)).toEqual(['lifts.floors-per-rise', 'lifts.net-to-gross', 'lifts.firefighter', 'lifts.stretcher'])
    expect(r.cards.every((c) => c.lines.length > 0)).toBe(true)
    expect(r.lines.every((l) => groupKey(l.id) === 'lifts')).toBe(true)
    expect(r.other.some((e) => e.label.startsWith('Team presets'))).toBe(true)
    const s = rulesBehind('built.structure', lines)
    expect(s.cards.map((c) => c.card.id)).toEqual(['nbc.wall-continuity'])
    expect(s.cards[0].lines[0].state).toBe('pass')
    expect(rulesBehind('built.sun', lines).cards).toEqual([])
  })
  it('ranks states and flags worst first', () => {
    expect(worstOf([{ state: 'pass' }, { state: 'unknown' }, { state: 'warn' }])).toBe('warn')
    expect(worstOf([])).toBeNull()
    expect(weakestOf(['verified', 'team_assumption', 'unverified'])).toBe('unverified')
  })
})
