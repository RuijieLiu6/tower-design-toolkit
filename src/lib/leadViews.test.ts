import { beforeEach, describe, expect, it } from 'vitest'
import { MERGES } from '../data/registry'
import { STRUCTURE_TABS, structureCheck, structureTabOf } from '../engine/structure'
import type { Tower } from '../engine/types'
import { windProcedure } from '../engine/windStructure'
import { useStore } from '../store'
import { evidenceGroups } from './evidence/engines'
import { buildHub } from './evidence/hub'
import { inView, LEAD_VIEWS, lineRuleId, useLeadView, viewOf } from './leadViews'
import { digestResults } from './trace/digest'

const s = useStore.getInitialState()
const vtc = (patch: Partial<Tower> = {}): Tower => ({ ...s.towers.vtc[0], ...patch })
const city = (patch: Partial<Tower> = {}): Tower => ({ ...s.towers.city[0], ...patch })
const lines = (t: Tower) => structureCheck(t, windProcedure(t)).rules
// Towers that between them give every structure line: outriggers, a column ring, core steps, both projects.
const towers = () => [vtc(), city(), vtc({ outriggerFloors: [40, 50], columnRing: true }), vtc({ coreSteps: [{ fromLevel: 40, side: 14 }] }), city({ coreAuto: false, coreShare: 0.12 })]
const views = LEAD_VIEWS['built.structure']

describe('Structure sub-tabs (node placement, 21 Nov)', () => {
  beforeEach(() => useLeadView.setState({ view: {} }))

  it('splits Structure into System & seismic, Lateral & sway and Floors & spans, before its part Wind procedure', () => {
    expect(views.map((v) => v.tab)).toEqual(['System & seismic', 'Lateral & sway', 'Floors & spans'])
    expect(MERGES['built.structure'].parts.map((p) => p.tab)).toEqual(['Wind procedure'])
    expect(viewOf('built.structure')!.id).toBe('seismic') // the first until one is picked
    useLeadView.getState().setView('built.structure', 'floors')
    expect(viewOf('built.structure')!.tab).toBe('Floors & spans')
    expect(viewOf('built.wind-procedure')).toBeNull() // no views: every line, as before
  })

  it('puts the P1 lines in their tabs: core alone and P-Δ in Lateral & sway, floor reach and dead load in Floors & spans', () => {
    expect(['seismic-category', 'period', 'dynamic', 'continuity', 'weight', 'geometric'].map(structureTabOf)).toEqual(Array(6).fill('seismic'))
    expect(['core-alone', 'p-delta', 'gravity-offset', 'gravity-net', 'outriggers'].map(structureTabOf)).toEqual(Array(5).fill('lateral'))
    expect(['floor-reach', 'floor-dead-load'].map(structureTabOf)).toEqual(['floors', 'floors'])
    expect(structureTabOf('a-line-added-later')).toBe('seismic') // never dropped
  })

  it('shows every structure line in exactly one tab, ids unchanged, on both projects', () => {
    const seen = new Set<string>()
    for (const t of towers()) {
      const rules = lines(t)
      const shown = views.flatMap((v) => inView(rules, v))
      expect(shown.map((r) => r.id).sort()).toEqual(rules.map((r) => r.id).sort())
      for (const r of rules) { expect(views.filter((v) => v.has(r.id))).toHaveLength(1); seen.add(r.id) }
    }
    // The tab lists name only lines the engine gives (no stale ids), and the engine gives every listed line.
    expect([...seen].sort()).toEqual(STRUCTURE_TABS.flatMap((g) => g.lines).sort())
  })

  it('keeps the results checklist and the evidence hub listing every line once', () => {
    for (const project of ['vtc', 'city'] as const) {
      const groups = evidenceGroups({ project, towers: s.towers[project], fsrTier: s.fsrTier, transitLink: s.transitLink, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: s.windPresets, systemsPresets: s.systemsPresets })
      const rules = (groups['built.structure'] as { id: string }[][])[0]
      // Evidence hub: each structure line once, by its own id (the tabs are display only).
      const hub = buildHub({ 'built.structure': groups['built.structure'] })
      const ids = hub.items.filter((i) => i.node === 'built.structure' && i.origin === 'result').map((i) => i.resultId)
      expect(new Set(ids).size).toBe(ids.length)
      expect([...ids].sort()).toEqual(rules.map((r) => r.id).sort())
      // Results checklist (decision-trace lines): across the three tabs, each line once.
      const digest = digestResults({ structure: s.towers[project].map((t, k) => ({ tower: t, rules: (groups['built.structure'] as { id: string }[][])[k] })) })
      const perTab = views.map((v) => inView(digest.lines, v, (l) => lineRuleId(l.id)).map((l) => l.id))
      expect(perTab.flat().sort()).toEqual(digest.lines.map((l) => l.id).sort())
      expect(new Set(perTab.flat()).size).toBe(digest.lines.length)
      expect(perTab.every((ids) => ids.length > 0)).toBe(true)
    }
  })

  it('reads a trace line’s rule id with or without a tower', () => {
    expect(lineRuleId('structure:t1:core-alone')).toBe('core-alone')
    expect(lineRuleId('structure:floor-reach')).toBe('floor-reach')
  })
})
