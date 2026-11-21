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

// G15 (vtc-entry TOOL_DEFICITS): the claims guard and the AI-use log never ran in the design harness, because their
// records lived only in the browser's ledger. With a culture input, evidenceGroups gives their lines from data.
describe('G15: the engagement-and-claims guard and the AI-use log from data', () => {
  const run = (culture?: Parameters<typeof evidenceGroups>[0]['culture']) =>
    evidenceGroups({ project: 'vtc', towers: s.towers.vtc, fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets, systemsPresets: s.systemsPresets, culture })
  type Line = { id: string; label: string; value: string; threshold: string; state: string; flag: string; note?: string }
  const lines = (g: Record<string, unknown>, node: string) => g[node] as Line[]
  const line = (g: Record<string, unknown>, node: string, id: string) => lines(g, node).find((l) => l.id === id)!
  const noEngagement = { status: 0 as const, confirmed: true }

  it('passes the guard with the three host Nations at "no engagement" and the board saying so', () => {
    const g = run({ records: { Musqueam: noEngagement, Squamish: noEngagement, 'Tsleil-Waututh': noEngagement }, claimsText: 'No Nation engaged; every cultural item: not sought' })
    const lint = line(g, 'built.culture-claims', 'cc-lint')
    expect(lint).toMatchObject({ state: 'pass', flag: 'team_assumption' })
    expect(lint.value).toMatch(/^no wording above status/)
    expect(lines(g, 'built.culture-claims').filter((l) => l.id.startsWith('cc-claim-'))).toEqual([])
    for (const n of ['musqueam', 'squamish', 'tsleil-waututh']) {
      const r = line(g, 'built.culture-claims', `cc-record-${n}`)
      expect(r).toMatchObject({ value: 'N0 · No engagement, confirmed', state: 'pass' })
      expect(r.note).toMatch(/^Board statement: No .+ representative took part in this work/)
    }
    expect(lines(g, 'built.culture-claims').some((l) => l.state === 'fail' || l.state === 'warn')).toBe(false)
  })

  it('fails the guard on "co-designed with" a Nation when no engagement is recorded', () => {
    const g = run({ records: {}, claimsText: ['The welcome stair was co-designed with the Musqueam Nation.', 'Its pattern is our own.'] })
    const lint = line(g, 'built.culture-claims', 'cc-lint')
    expect(lint.state).toBe('fail')
    expect(lint.value).toBe('1 phrase above status: "co-designed"')
    const claim = line(g, 'built.culture-claims', 'cc-claim-0')
    expect(claim).toMatchObject({ label: '"co-designed" (Collaboration phrase)', value: 'The welcome stair was co-designed with the Musqueam Nation.', threshold: 'Musqueam at N4 or above with a reference', state: 'fail' })
    expect(claim.note).toMatch(/Musqueam is below N4/)
    // No record: N0, not confirmed, so open rather than passed.
    expect(line(g, 'built.culture-claims', 'cc-record-musqueam')).toMatchObject({ value: 'N0 · No engagement, not confirmed', state: 'unknown' })
    // A general reference to the Nations is checked against all three; the wording guard itself is unchanged.
    const general = run({ records: { Musqueam: { status: 4, counterpart: 'authorized', reference: 'L-1', use: 'the stair', date: '2026-10-01', evidence: 'letter', confirmed: true } }, claimsText: 'Co-designed with the host Nations.' })
    expect(line(general, 'built.culture-claims', 'cc-claim-0').note).toMatch(/^Squamish, Tsleil-Waututh are below N4/)
    expect(line(run({ records: {}, claimsText: '' }), 'built.culture-claims', 'cc-lint')).toMatchObject({ value: 'no board text to check', state: 'unknown' })
  })

  it('logs AI use per element with its IPTC term, and names no person', () => {
    expect(line(run({ records: {}, claimsText: '' }), 'built.provenance', 'prov-log')).toMatchObject({ value: 'nothing logged yet', state: 'unknown' })
    const g = run({ records: {}, claimsText: '', prov: [
      { element: 'Hero render', kind: 'image', involvement: 'generative-edit', tool: 'gpt-image-2', toolGenerative: true, humanContribution: 'massing and camera', licence: 'OpenAI terms', decidedBy: 'ai-proposed-person-accepted' },
      { element: 'Site plan', kind: 'drawing', involvement: 'generated', humanContribution: '', reviewer: 'A. Person' },
    ] })
    expect(line(g, 'built.provenance', 'prov-log')).toMatchObject({ value: '2 elements logged, 1 to fix', state: 'warn' })
    expect(line(g, 'built.provenance', 'prov-entry-0')).toMatchObject({ value: 'Edited with generative AI (IPTC compositeWithTrainedAlgorithmicMedia), tool: gpt-image-2', state: 'pass' })
    expect(line(g, 'built.provenance', 'prov-entry-1')).toMatchObject({ value: 'AI-generated (IPTC trainedAlgorithmicMedia)', state: 'warn' })
    expect(line(g, 'built.provenance', 'prov-entry-1').note).toMatch(/say what a person contributed/)
    expect(JSON.stringify(g['built.provenance'])).not.toMatch(/A\. Person/)
  })

  it('gives every warning and failure an instruction of its own, and leaves the groups as they were without a culture input', async () => {
    const { fixFor } = await import('../fixes')
    const g = run({ records: { Squamish: { status: 4 } }, claimsText: 'We consulted the Squamish Nation and co-designed the plaza with First Nations.', prov: [{ element: 'Plan', kind: 'result' }] })
    const bad = [...lines(g, 'built.culture-claims'), ...lines(g, 'built.provenance')].filter((l) => l.state === 'warn' || l.state === 'fail')
    expect(bad.map((l) => l.id)).toEqual(expect.arrayContaining(['cc-lint', 'cc-claim-0', 'cc-claim-1', 'cc-record-squamish', 'prov-log', 'prov-entry-0']))
    for (const l of bad) expect(fixFor(l.id, l.state as 'warn', l.value, l.threshold, l.flag), l.id).not.toMatch(/^Rule: |See Details for the rule/)
    const none = run()
    expect('built.culture-claims' in none || 'built.provenance' in none).toBe(false)
  })

  it('takes the browser ledger as it is, so the app passes the store', async () => {
    const { useCultureStore } = await import('../cultureStore')
    useCultureStore.getState().set({ claimsText: 'Engagement with the Tsleil-Waututh Nation shaped the plaza.' })
    const g = run(useCultureStore.getState())
    expect(line(g, 'built.culture-claims', 'cc-lint').state).toBe('fail')
    expect(line(g, 'built.culture-claims', 'cc-claim-0').label).toBe('"Engagement with" (Engagement wording)')
  })
})
