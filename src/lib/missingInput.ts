// Missing data never looks like success or zero (Ruijie, 7 Nov, design system). A project opens with no tower (6 Nov),
// and most checks read the building model: with nothing to read, the engines return empty lists ("all pass"), zero
// areas ("0 m²", "FSR 0.00") or rules met by a 0 m tower ("below the study trigger"). This is the one guard every result
// view goes through before it shows anything: the results panel (components/Inspector.tsx), the decision trace's live
// digest that feeds the checklists, the trace and the options (components/TracePanel.tsx TraceRecorder) and the
// Customize canvas (lib/workflowLive.ts guardOutput). A check that cannot run says what it waits for and what to do.
import type { RuleState } from '../engine/types'
import type { StepId } from './step'
import type { Digest, ResultLine } from './trace/digest'
import { nodeOfLine } from './options'

/** Built nodes whose results read the building model: with no tower they show "Needs model", nothing else. */
export const NEEDS_MODEL: ReadonlySet<string> = new Set([
  'built.vtc-rules', 'built.fsr', 'built.viewcones', 'built.core-lifts', 'built.egress', 'built.sky-room',
  'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground',
  'built.wind-procedure', 'built.structure', 'built.wind-study', 'built.life-safety', 'built.relax-aviation',
  'built.mobility', 'built.facade', 'built.economics', 'built.interior', 'built.daylight-depth',
  'built.energy-carbon', 'built.wind-screen', 'built.trips', 'built.solar-access', 'built.heights', 'built.vista',
])

/**
 * Built nodes that run without a tower, and why: their results read the site, a viewpoint or records people keep.
 * (Tested: every built node is in one of the two lists.)
 */
export const RUNS_WITHOUT_MODEL: Readonly<Record<string, string>> = {
  'built.sun': 'the sun position for a date and hour',
  'built.view-from': 'a viewpoint picked on a roof or street; towers only block the view',
  'built.city-in-nature': 'the site ledger (canopy, rainwater, birds); its lines that read the tower wait for one',
  'built.culture-claims': 'the claims and records people enter',
  'built.provenance': 'the provenance log of board elements',
  'built.model': 'the uploaded model, which has its own empty state',
}

/** Result lines inside a node that runs without a tower, which do read the tower (rule ids without the tower suffix). */
const MODEL_LINES: Readonly<Record<string, RegExp>> = {
  'built.city-in-nature': /^bird-zone$/,
}

export interface InputGap {
  status: 'needs-model' | 'waiting-input'
  /** The short word: "Needs model" or "Waiting for input". */
  word: string
  /** Why the check has nothing to show, in one sentence. */
  reason: string
  /** What to do next, as an instruction. */
  next: string
  /** Where that is done. */
  step: StepId
}

export interface GapContext {
  project: 'vtc' | 'city'
  /** Towers in the open project. */
  towers: number
  /** The open project's site area (lib/siteArea.ts), null when Real Vancouver has no study site yet. */
  siteArea?: number | null
}

export const NEEDS_MODEL_WORD = 'Needs model'
export const NEXT_MODEL = 'Place a tower in the Form step, or import a model in the Site step.'

/** What a check waits for before it can show a result, or null when it can run. */
export function inputGap(nodeId: string, ctx: GapContext): InputGap | null {
  if (ctx.towers === 0 && NEEDS_MODEL.has(nodeId)) {
    return { status: 'needs-model', word: NEEDS_MODEL_WORD, reason: 'There is no building model in this project yet, so this check has nothing to read.', next: NEXT_MODEL, step: 'volume' }
  }
  // Real Vancouver FSR divides by the study site; without one it would divide by the competition block.
  if (nodeId === 'built.fsr' && ctx.project === 'city' && ctx.siteArea == null) {
    return { status: 'waiting-input', word: 'Waiting for input', reason: 'FSR divides floor area by the site area, and this project has no study site yet.', next: 'Choose a study site in the Site step.', step: 'site' }
  }
  return null
}

/** A line of a node that runs without a tower, but which itself reads the tower. */
export const readsModel = (nodeId: string, ruleKey: string) => !!MODEL_LINES[nodeId]?.test(ruleKey)

/** A line as shown while its input is missing: open, with what it needs instead of a value. */
export const missingLine = <L extends { state: RuleState; value: string }>(l: L): L => ({ ...l, state: 'unknown', value: `${NEEDS_MODEL_WORD}: ${NEXT_MODEL.replace(/\.$/, '')}` })

/** The rule id of a digest line ("nature:bird-zone", "lifts:t1:rise-1-t1" → "rise-1"). */
function lineRule(id: string): string {
  const parts = id.split(':')
  if (parts.length > 2) { const tower = parts[1], rule = parts.slice(2).join(':'); return rule.endsWith(`-${tower}`) ? rule.slice(0, -(tower.length + 1)) : rule }
  return parts.slice(1).join(':')
}

/**
 * The live digest as the result views may show it: no line of a check that cannot run (its view shows the gap
 * instead), the tower-reading lines of the other checks open with "Needs model", and no FSR metric without a model
 * or a site to divide by.
 */
export function gateDigest(d: Digest, ctx: GapContext): Digest {
  const lines: ResultLine[] = []
  for (const l of d.lines) {
    const node = nodeOfLine(l.id)
    if (node && inputGap(node, ctx)) continue
    lines.push(node && ctx.towers === 0 && readsModel(node, lineRule(l.id)) ? missingLine(l) : l)
  }
  const metrics = inputGap('built.fsr', ctx) ? Object.fromEntries(Object.entries(d.metrics).filter(([k]) => !k.startsWith('fsr.'))) : d.metrics
  return lines.length === d.lines.length && metrics === d.metrics && lines.every((l, i) => l === d.lines[i]) ? d : { lines, metrics }
}
