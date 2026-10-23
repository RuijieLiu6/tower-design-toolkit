import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../../data/registry'
import { useStore } from '../../store'
import { evidenceGroups, mergeGroups } from './engines'
import { FLAGS, RESEARCH_FALSE, bibliography, buildHub, metaFor, metaForSource, normUrl, walkEvidence, type EvidenceItem, type FalseItem } from './hub'

const s = useStore.getInitialState()
const hubFor = (project: 'vtc' | 'city') => {
  const groups = evidenceGroups({ project, towers: s.towers[project], fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets, systemsPresets: s.systemsPresets })
  return { groups, hub: buildHub(groups) }
}

describe('sources & assumptions hub (P16-M01)', () => {
  it('shows sources for every built node, on both projects', () => {
    const both = buildHub(mergeGroups(hubFor('vtc').groups, hubFor('city').groups))
    for (const n of BUILT_NODES) expect(both.sources.some((x) => x.nodes.includes(n.id)), `${n.id} has no source`).toBe(true)
    for (const project of ['vtc', 'city'] as const) {
      const { groups, hub } = hubFor(project)
      for (const n of BUILT_NODES.filter((x) => !x.projects || x.projects.includes(project))) expect(hub.sources.some((x) => x.nodes.includes(n.id)), `${project}: ${n.id} has no source`).toBe(true)
      // Nodes that produced results show the sources of those results, not only declared ones.
      for (const [node, v] of Object.entries(groups)) {
        const produced: EvidenceItem[] = []
        walkEvidence(node, v, produced, [])
        if (produced.length) expect(hub.items.some((i) => i.node === node && i.origin === 'result'), node).toBe(true)
      }
      expect(hub.items.filter((i) => i.origin === 'result').length).toBeGreaterThan(100)
    }
  })
  it('never shows a false assumption without its correction', () => {
    const { hub } = hubFor('vtc')
    expect(hub.falseAssumptions.length).toBeGreaterThan(RESEARCH_FALSE.length)
    for (const f of hub.falseAssumptions) expect(f.correction.trim().length, f.claim).toBeGreaterThan(10)
    expect(hub.falseAssumptions.filter((f) => f.origin === 'node').map((f) => f.node)).toEqual(expect.arrayContaining(['built.life-safety', 'built.structure', 'built.wind-procedure', 'built.city-in-nature', 'built.energy-carbon']))
    expect(RESEARCH_FALSE.every((r) => r.correction.trim().length > 0)).toBe(true)
  })
  it('turns a result flagged false into a correction from its value and note, linked to its node', () => {
    const hub = buildHub({ 'built.energy-carbon': [{ id: 'ec-240', label: '"240 is the 2030 target"', value: 'false: the proposal is baseline −40%', threshold: '—', state: 'warn', flag: 'false_assumption', source: { label: 'Staff report 2024' }, note: 'Kept visible.' }] })
    const f = hub.falseAssumptions.find((x) => x.origin === 'result') as FalseItem
    expect(f).toMatchObject({ node: 'built.energy-carbon', claim: '"240 is the 2030 target"' })
    expect(f.correction).toMatch(/baseline −40%/)
    expect(hub.counts.false_assumption).toBe(1)
  })
  it('adds research metadata where a packet lists the source, and merges towers that repeat a rule', () => {
    const { hub } = hubFor('vtc')
    const vbbl = hub.sources.find((x) => x.url && normUrl(x.url).endsWith('/vbbl2019/59509560'))!
    expect(vbbl.meta?.ids.length).toBeGreaterThan(0)
    expect(vbbl.pages.length).toBeGreaterThan(3)
    expect(vbbl.nodes).toEqual(expect.arrayContaining(['built.core-lifts', 'built.life-safety']))
    expect(metaFor('https://example.com/nowhere')).toBeUndefined()
    const two = buildHub({ n: [[{ id: 'a', label: 'A', flag: 'verified', source: { label: 'Doc', page: 'p.1' } }], [{ id: 'a', label: 'A', flag: 'verified', source: { label: 'Doc', page: 'p.1' } }]] })
    expect(two.items.filter((i) => i.origin === 'result')).toHaveLength(1)
  })
  it('reads charge-schedule lines (item, rate, basis), and a false one keeps its correction', () => {
    const hub = buildHub({ 'built.economics': [{ id: 'legacy-cac', item: 'Legacy per-ft² CAC targets', basis: 'removed for applications after 30 Sep 2026; negotiated CACs stay for large rezonings', rate: 'not applied', status: 'false assumption', flag: 'false_assumption', source: 'Council report R4 p.22' }] })
    const f = hub.falseAssumptions.find((x) => x.origin === 'result')!
    expect(f.claim).toBe('Legacy per-ft² CAC targets')
    expect(f.correction).toMatch(/removed for applications after 30 Sep 2026/)
  })
  it('finds research metadata by a research id named in a label, when there is no web address', () => {
    expect(metaForSource({ label: 'City ACC page (research P08-S57)' })?.title).toMatch(/Amenity Cost Charges/i)
    expect(metaForSource({ label: 'A source with no id or link' })).toBeUndefined()
  })
  it('counts results by flag', () => {
    const { hub } = hubFor('vtc')
    const results = hub.items.filter((i) => i.origin === 'result')
    expect(FLAGS.reduce((a, f) => a + hub.counts[f], 0)).toBe(results.length)
    expect(hub.counts.verified).toBeGreaterThan(0)
    expect(hub.counts.team_assumption).toBeGreaterThan(0)
  })
  it('exports a bibliography as Markdown and as a numbered board block', () => {
    const { hub } = hubFor('vtc')
    const md = bibliography(hub, 'markdown')
    expect(md).toMatch(/^# Sources and assumptions/)
    for (const x of hub.sources.slice(0, 5)) expect(md).toContain(x.meta?.title || x.label)
    expect(md).toMatch(/## False assumptions kept visible/)
    const board = bibliography(hub, 'board')
    expect(board.split('\n')[1]).toMatch(/^1\. /)
    expect(board.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(hub.sources.length)
  })
})
