import { describe, expect, it } from 'vitest'
import { ALL_NODES, BUILT_NODES, nodeById } from '../data/registry'
import { NODE_ICONS } from '../data/icons'
import type { RuleResult, Tower } from '../engine/types'
import { evidenceGroups } from '../lib/evidence/engines'
import { GROUP_NODE } from '../lib/options'
import { PHASES } from '../lib/phases'
import { presetById } from '../lib/userTypes'
import { useStore } from '../store'
import { benefitLines } from './HbpPanel'

const s = useStore.getInitialState()
const groups = (project: 'vtc' | 'city') => evidenceGroups({ project, towers: s.towers[project].length ? s.towers[project] : s.towers.vtc, fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null } })
const ids = (g: unknown) => (g as RuleResult[][]).flat().map((r) => r.id)

describe('Higher Buildings Policy, a node of its own (node placement, 21 Nov)', () => {
  it('is a standalone built node in the Site phase, with its own icon', () => {
    const n = nodeById('built.hbp')!
    expect(n.name).toBe('Higher Buildings Policy')
    expect(BUILT_NODES.some((x) => x.id === 'built.hbp')).toBe(true) // not a part of a merged tool
    expect(PHASES.find((p) => p.nodes.includes('built.relax-aviation'))!.nodes).toContain('built.hbp')
    const icon = NODE_ICONS['built.hbp']
    expect(icon).toBeTruthy()
    expect(Object.entries(NODE_ICONS).filter(([, v]) => v === icon).map(([k]) => k)).toEqual(['built.hbp'])
    expect(ALL_NODES.find((x) => x.id === 'built.relax-aviation')!.question).not.toMatch(/inside a Higher Buildings area/)
    expect(GROUP_NODE.hbp).toBe('built.hbp')
  })

  it('carries the area, ceiling and street lines; Relaxations & aviation no longer does (no duplicate lines)', () => {
    for (const project of ['vtc', 'city'] as const) {
      const g = groups(project)
      expect(ids(g['built.hbp']).some((id) => id.startsWith('hbp-area'))).toBe(true)
      expect(ids(g['built.hbp']).some((id) => id.startsWith('hbp-ceiling'))).toBe(true)
      expect(ids(g['built.relax-aviation']).some((id) => id.startsWith('hbp-'))).toBe(false)
    }
    // The competition site reads as an assumed site.
    const vtcArea = (groups('vtc')['built.hbp'] as RuleResult[][])[0].find((r) => r.id.startsWith('hbp-area'))!
    expect(vtcArea.value).toMatch(/assumed site/)
  })

  it('shows the community benefit from the sky room line, never computed twice', () => {
    const t = { id: 't1', name: 'Tower 1' } as Tower
    const line = { id: 'skyroom-benefit-t1', label: 'Community benefit (HBP 2.1(g))', value: 'declared', threshold: '', state: 'warn', flag: 'unverified', source: { label: 'HBP' } } as RuleResult
    const other = { ...line, id: 'skyroom-load-t1' }
    expect(benefitLines([{ tower: t, rules: [other, line] }])).toEqual([{ tower: t, rule: line }])
  })

  it('joins the planner, developer and practitioner presets where the policy is the question', () => {
    for (const id of ['planner.views', 'planner.growth', 'developer.feasibility', 'developer.height', 'practitioner.rezoning']) expect(presetById(id)!.nodes).toContain('built.hbp')
    for (const id of ['practitioner.permit', 'engineer.structure', 'designer.form']) expect(presetById(id)!.nodes).not.toContain('built.hbp')
  })
})
