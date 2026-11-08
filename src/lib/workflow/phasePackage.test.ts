// Phase packages: export the Form example and read it back; merging adds, replacing swaps only the phase.
import { describe, expect, it } from 'vitest'
import { buildPhasePackage, modelRevision, planImport, readPhasePackage } from './phasePackage'
import { phasePortion, homePhase } from './phaseTools'
import { connect } from './projectWorkflow'
import { linear, returnEdges, walk, type Board } from '../workflowGraph'

const form = ['design.massing', 'built.sun', 'built.wind-screen']
const board: Board = connect({ nodes: ['design.site', 'built.vtc-rules', ...form, 'built.fsr'], edges: linear(['design.site', 'built.vtc-rules', ...form, 'built.fsr']) }, 'built.wind-screen', 'design.massing')
const home = (id: string) => homePhase(id)

describe('the phase portion', () => {
  it('is Form’s three tools with the return path, and the wires that leave the phase as links', () => {
    const p = phasePortion(board, 'form', home)
    expect(p.nodes).toEqual(form)
    expect(p.internal.map((e) => `${e.a}>${e.b}`).sort()).toEqual(['built.sun>built.wind-screen', 'built.wind-screen>design.massing', 'design.massing>built.sun'])
    expect(p.crossing.map((c) => [c.other, c.out])).toEqual([['built.vtc-rules', false], ['built.fsr', true]])
  })
})

describe('phase packages', () => {
  const p = phasePortion(board, 'form', home)
  const towers = { vtc: [{ id: 't1', height: 120 }], city: [] }
  const pkg = buildPhasePackage({ phase: 'form', project: 'vtc', units: 'm', nodes: p.nodes, internal: p.internal, crossing: p.crossing,
    state: { towers, sun: { month: 9, day: 22, hour: 12 }, windPresets: { k: 1 } }, digest: { lines: [], metrics: {} }, versions: {}, appVersion: '0.9' })
  it('carries the workflow, the phase’s settings and geometry, the frame and the model revision', () => {
    expect(pkg.workflow.nodes).toEqual(form)
    expect(Object.keys(pkg.settings).sort()).toEqual(['sun', 'towers', 'windPresets'])
    expect(pkg.settings.towers).toEqual(towers.vtc)
    expect(pkg.results.modelRevision).toBe(modelRevision(towers.vtc))
    expect(pkg.frame.north).toMatch(/45°/)
    const back = readPhasePackage(JSON.stringify(pkg))
    expect(back.problems).toEqual([])
    expect(back.pkg!.phase).toBe('form')
    expect(readPhasePackage('{"format":"x"}').problems[0]).toMatch(/not a phase package/)
  })
  it('merges by adding what is missing and replaces only this phase', () => {
    const bare: Board = { nodes: ['design.site', 'design.massing', 'built.fsr'], edges: linear(['design.site', 'design.massing', 'built.fsr']) }
    const merged = planImport(bare, ['design.massing'], pkg, 'merge', () => true)
    expect(merged.added).toEqual(['built.sun', 'built.wind-screen'])
    expect(walk(merged.board.edges)).toEqual(['design.site', 'design.massing', 'built.sun', 'built.wind-screen', 'built.fsr'])
    expect(returnEdges(merged.board.edges).has('built.wind-screen>design.massing')).toBe(true)
    const extra: Board = { nodes: [...bare.nodes, 'built.solar-access'], edges: linear(['design.site', 'design.massing', 'built.solar-access', 'built.fsr']) }
    const replaced = planImport(extra, ['design.massing', 'built.solar-access'], pkg, 'replace', () => true)
    expect(replaced.removed).toEqual(['built.solar-access'])
    expect(replaced.board.nodes).toContain('design.site')
    expect(replaced.board.nodes).toContain('built.fsr')
    expect(replaced.board.nodes).not.toContain('built.solar-access')
    expect(planImport(bare, ['design.massing'], pkg, 'merge', (id) => id !== 'built.wind-screen').unknown).toEqual(['built.wind-screen'])
  })
})
