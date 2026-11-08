import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { economics } from '../engine/economics'
import { egressCheck } from '../engine/egress'
import { DEFAULT_FACADE, facadeCheck } from '../engine/facade'
import { liftCheck } from '../engine/lifts'
import { DEFAULT_MOBILITY, mobilityCheck } from '../engine/mobility'
import { skyRoomCheck } from '../engine/skyRoom'
import type { RuleResult, Tower } from '../engine/types'
import { fsrSummary, SITE, vtcRules } from '../engine/vtcRules'
import { windStudyRules } from '../engine/windStructure'
import { defaultTower, useStore } from '../store'
import { evidenceGroups } from './evidence/engines'
import { extraOutput, type ExtraInputs } from './extraLive'
import { fixFor } from './fixes'
import { gateDigest, inputGap, NEEDS_MODEL, RUNS_WITHOUT_MODEL, type GapContext } from './missingInput'
import { nodeOfLine } from './options'
import { resultWord } from './status'
import { digestResults, type ResultLine } from './trace/digest'
import { builtOutput, guardOutput, type Results } from './workflowLive'
import { evaluateGraph, portsFor, type GraphEdge, type GraphNode, type NodeOutput } from './workflowLogic'

// Missing data never looks like success or zero (design system, 7 Nov). A project opens with no tower (6 Nov): every
// built node's results, as the result views show them (the results panel, the checklists and trace fed by the live
// digest, the Customize canvas), are run here on both projects with no tower. Nothing that reads the building model may
// pass, and no number it shows may be a zero standing in for the missing model. Lines that pass or show a zero without
// a tower are allowed only when they read no model at all: the same line comes out with a tower placed.

type Project = 'vtc' | 'city'
const s = useStore.getState()
const tower = (p: Project): Tower => (p === 'vtc' ? defaultTower('vtc') : { ...defaultTower('city', [254, 486]), height: 285 })
/** A standalone zero: "0 m²", "0%", "0.00", "0 of 0 faces", "0–0 spaces", "Up to 0 stalls". */
const ZERO = /(?<![\d.,])0(?:\.0+)?(?![\d.,])/
const lineKey = (l: { state: string; value?: string }) => `${l.state}|${l.value ?? ''}`

/** The engines' result lines per built node, without React (as evidence/engines.ts and hooks/useResults.ts run them). */
function engineLines(project: Project, towers: Tower[], studyArea: number | null): Record<string, RuleResult[]> {
  const g = evidenceGroups({ project, towers, fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null }, studyArea })
  const out: Record<string, RuleResult[]> = {}
  for (const [node, v] of Object.entries(g)) out[node] = ((Array.isArray(v) ? v.flat(3) : (v as { rules?: RuleResult[] })?.rules ?? []) as RuleResult[]).filter((r) => r && typeof r === 'object' && 'state' in r)
  // hooks/useResults.ts runs the competition rules whatever the tower count (evidence/engines.ts skips them).
  if (project === 'vtc') out['built.vtc-rules'] = vtcRules(towers, { fsrTier: 2, transitLink: false })
  return out
}

/** What hooks/useResults.ts returns (the parts the canvas and the digest read). */
function results(project: Project, towers: Tower[], studyArea: number | null): Results {
  const lifts = towers.map((t) => ({ tower: t, ...liftCheck(t, s.liftPresets, s.egressPresets) }))
  const egress = towers.map((t) => ({ tower: t, ...egressCheck(t, s.egressPresets, s.liftPresets) }))
  return {
    fsr: studyArea && project === 'city' ? fsrSummary(towers, studyArea) : fsrSummary(towers),
    rules: project === 'vtc' ? vtcRules(towers, { fsrTier: 2, transitLink: false }) : [], cones: [],
    lifts, egress, skyRooms: towers.map((t, i) => ({ tower: t, ...skyRoomCheck(t, lifts[i], egress[i], s.egressPresets, s.liftPresets) })),
  } as Results
}

/** The live digest as components/TracePanel.tsx TraceRecorder builds it, then the guard. */
function digest(project: Project, towers: Tower[], studyArea: number | null) {
  const e = engineLines(project, towers, studyArea)
  const r = results(project, towers, studyArea)
  const g = evidenceGroups({ project, towers, fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null }, studyArea })
  const all = {
    ...r,
    streetwall: { rules: e['built.pr-streetwall'] }, frontage: { rules: e['built.pr-frontage'] }, groundPlane: { rules: e['built.pr-ground'] },
    nature: e['built.city-in-nature'],
    wind: towers.map((t, i) => ({ tower: t, rules: (g['built.wind-procedure'] as RuleResult[][])[i] })),
    structure: towers.map((t, i) => ({ tower: t, rules: (g['built.structure'] as RuleResult[][])[i] })),
    // As TraceRecorder computes it: the tallest tower's height, 0 with none.
    windStudy: windStudyRules(Math.max(0, ...towers.map((t) => t.height))),
    lifeSafety: towers.map((t, i) => ({ tower: t, rules: (g['built.life-safety'] as RuleResult[][])[i] })),
    relaxAviation: towers.map((t, i) => ({ tower: t, rules: (g['built.relax-aviation'] as RuleResult[][])[i] })),
  }
  return digestResults(all as unknown as Record<string, unknown>)
}

function extra(project: Project, towers: Tower[], studyArea: number | null): ExtraInputs {
  return {
    econ: economics(towers, { permitYear: 2027, landPrice: null, siteArea: project === 'vtc' ? SITE.area : studyArea, includeRegional: true, homeM2: 75, hotelM2PerKey: 40 }),
    mobility: mobilityCheck(towers, DEFAULT_MOBILITY, { project, transitLink: false, homeM2: 75, hotelM2PerKey: 40 }),
    facade: facadeCheck(towers, DEFAULT_FACADE, project === 'vtc' ? 45 : 0),
    culture: { findings: [], gate: [{ id: 'a', label: 'Claims checked', ok: true }, { id: 'b', label: 'Credits', ok: false }] },
    provenance: { prov: [], issues: [] },
    model: { model: null, towers },
  }
}

function canvas(project: Project, towers: Tower[], studyArea: number | null, id: string, guarded: boolean): NodeOutput | null {
  const def = BUILT_NODES.find((n) => n.id === id)!
  const ctx: GapContext = { project, towers: towers.length, siteArea: project === 'vtc' ? SITE.area : studyArea }
  const run = () => builtOutput(def, results(project, towers, studyArea), project, null) ?? extraOutput(id, extra(project, towers, studyArea))
  return guarded ? guardOutput(id, ctx, run) : run()
}

const CASES: { project: Project; studyArea: number | null; label: string }[] = [
  { project: 'vtc', studyArea: null, label: 'competition site' },
  { project: 'city', studyArea: null, label: 'Real Vancouver, no study site' },
  { project: 'city', studyArea: 5000, label: 'Real Vancouver with a study site' },
]

describe('with no tower, nothing that reads the model passes or shows a zero', () => {
  it('sorts every built node: it needs the model, or it says what else it reads', () => {
    for (const n of BUILT_NODES) expect(NEEDS_MODEL.has(n.id) !== (n.id in RUNS_WITHOUT_MODEL), n.id).toBe(true)
  })

  for (const { project, studyArea, label } of CASES) {
    const ctx: GapContext = { project, towers: 0, siteArea: project === 'vtc' ? SITE.area : studyArea }

    it(`results panel: a check that needs the model says "Needs model" (${label})`, () => {
      const none = engineLines(project, [], studyArea), withTower = engineLines(project, [tower(project)], studyArea)
      const audit: string[] = []
      for (const n of BUILT_NODES) {
        if (n.projects && !n.projects.includes(project)) continue
        const gap = inputGap(n.id, ctx)
        if (gap) {
          expect(['Needs model', 'Waiting for input'], n.id).toContain(gap.word)
          expect(gap.next.length, n.id).toBeGreaterThan(10)
          continue
        }
        // Shown as computed: each line must read no model, or be open and free of zeros.
        const before = new Map((withTower[n.id] ?? []).map((r) => [r.id, lineKey(r)]))
        for (const r of none[n.id] ?? []) {
          if (before.get(r.id) === lineKey(r)) continue // reads no model: the same with a tower
          if (r.state === 'pass' || ZERO.test(r.value)) audit.push(`${n.id} ${r.id}: ${r.state} "${r.value}"`)
        }
      }
      expect(audit).toEqual([])
    })

    it(`checklists, trace and options: the live digest (${label})`, () => {
      const raw = digest(project, [], studyArea), gated = gateDigest(raw, ctx)
      const placed = digest(project, [tower(project)], studyArea)
      const before = new Map(placed.lines.map((l) => [l.id, lineKey(l)]))
      const bad: string[] = []
      for (const l of gated.lines as ResultLine[]) {
        const node = nodeOfLine(l.id) ?? ''
        if (NEEDS_MODEL.has(node)) bad.push(`${l.id}: a check that needs the model left a line`)
        if (before.get(l.id) === lineKey(l)) continue
        if (l.state === 'pass' || (ZERO.test(l.value) && !/^Needs model/.test(l.value))) bad.push(`${l.id}: ${l.state} "${l.value}"`)
        // A line that waits for the model says so, and says what to do.
        if (/^Needs model/.test(l.value)) { expect(resultWord(l.state, l.value)).toBe('Needs model'); expect(fixFor(l.id, l.state, l.value)).toMatch(/Place a tower/) }
      }
      expect(bad).toEqual([])
      expect(Object.keys(gated.metrics).filter((k) => k.startsWith('fsr.'))).toEqual([])
      // The guard is what keeps them out: without it the digest shows passes for a 0 m tower (wind study triggers).
      expect(raw.lines.some((l) => l.state === 'pass' && NEEDS_MODEL.has(nodeOfLine(l.id) ?? ''))).toBe(true)
    })

    it(`Customize canvas (${label})`, () => {
      const bad: string[] = []
      for (const n of BUILT_NODES) {
        const out = canvas(project, [], studyArea, n.id, true)
        if (!out) continue
        if (inputGap(n.id, ctx)) { expect(out.need, n.id).toBeTruthy(); expect(out.state).toBe('idle'); expect(out.headline).toMatch(/^(Needs model|Waiting for input): /); continue }
        const same = JSON.stringify(canvas(project, [tower(project)], studyArea, n.id, true)) === JSON.stringify(out)
        if (same) continue // reads no model
        if (out.state === 'pass' || ZERO.test(out.headline)) bad.push(`${n.id}: ${out.state} "${out.headline}"`)
        for (const i of out.items) if (i.state === 'pass' || ZERO.test(i.value ?? '')) bad.push(`${n.id} ${i.id}: ${i.state} "${i.value}"`)
      }
      expect(bad).toEqual([])
    })
  }

  it('Customize canvas: logic after a check that waits for the model waits too (no score or "all pass" on missing data)', () => {
    const nodes: GraphNode[] = [
      { id: 'site', kind: 'source', ref: 'src.site', label: 'Site' },
      { id: 'massing', kind: 'source', ref: 'src.massing', label: 'Massing' },
      { id: 'program', kind: 'source', ref: 'src.program', label: 'Program' },
      { id: 'lifts', kind: 'eval', ref: 'built.core-lifts', label: 'Core & lifts', category: 'SYST' },
      { id: 'sun', kind: 'eval', ref: 'built.sun', label: 'Sun', category: 'CLIM' },
      { id: 'all', kind: 'logic', ref: 'logic.all-pass', label: 'All pass' },
      { id: 'score', kind: 'logic', ref: 'logic.score', label: 'Score' },
    ]
    // Every input port of each check wired from its source (site, massing, program).
    const edges: GraphEdge[] = [
      ...nodes.filter((n) => n.kind === 'eval').flatMap((n) => portsFor('eval', n.ref, n.category).inputs.map((p) => ({ source: p.id, sourceHandle: 'out', target: n.id, targetHandle: p.id }))),
      ...['all', 'score'].flatMap((t) => ['lifts', 'sun'].map((f) => ({ source: f, sourceHandle: 'out', target: t, targetHandle: 'in' }))),
    ]
    const ok: NodeOutput = { state: 'pass', headline: 'passes', items: [{ id: 'x', label: 'x', state: 'pass', flag: 'verified' }] }
    const r = evaluateGraph(nodes, edges, { evalNode: (n) => guardOutput(n.ref, { project: 'vtc', towers: 0, siteArea: SITE.area }, () => ok)!, towers: [] })
    expect(r.lifts.need).toBe('needs-model')
    expect(r.sun.state).toBe('pass') // runs without a model (here a stand-in result)
    for (const id of ['all', 'score']) { expect(r[id].state, id).toBe('idle'); expect(r[id].need, id).toBe('waiting-input'); expect(r[id].headline).toMatch(/building model/) }
  })

  it('the audit: without the guard these nodes showed a pass or a zero with no tower', () => {
    const shown = new Set<string>()
    for (const { project, studyArea } of CASES) {
      for (const n of BUILT_NODES) {
        const out = canvas(project, [], studyArea, n.id, false)
        if (JSON.stringify(out) === JSON.stringify(canvas(project, [tower(project)], studyArea, n.id, false))) continue // reads no model
        if (out && (out.state === 'pass' || ZERO.test(out.headline) || out.items.some((i) => i.state === 'pass' || ZERO.test(i.value ?? '')))) shown.add(n.id)
      }
      const lines = engineLines(project, [], studyArea)
      for (const [node, rs] of Object.entries(lines)) if (NEEDS_MODEL.has(node) && rs.some((r) => r.state === 'pass' || ZERO.test(r.value))) shown.add(node)
    }
    // Every one of them is now behind "Needs model".
    for (const id of shown) expect(NEEDS_MODEL.has(id), id).toBe(true)
    expect(shown.size).toBeGreaterThan(3)
  })
})
