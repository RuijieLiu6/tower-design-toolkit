// The design steps inside the stages (Ruijie, 3 Nov: "anyone open the website would start with pick the site"):
// Site, Volume and Program are separate steps of Massing; Plates, core, plant is Schematic; Frame and capture is
// Present. The step decides which design tools lead the left panel and which step the process rail lights. A stage
// change (keys 1–3, the top bar) moves to that stage's step; Massing returns to the last Massing step used.
//
// Kept for the browser session (sessionStorage), not in the project file: a step is where you are, not part of the
// design. A first open of the guided app starts on Site; with no saved project it also opens Real Vancouver, where an
// address, a neighbourhood or a click on the map can set the site (the competition block is one click away).
import { create } from 'zustand'
import { PROCESS } from '../data/stages'
import { useStore, type Phase } from '../store'

export type StepId = 'site' | 'volume' | 'program' | 'plates' | 'frame'
export const STEP_IDS: StepId[] = ['site', 'volume', 'program', 'plates', 'frame']
export const isStep = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as string[]).includes(v)
export const stageOf = (s: StepId): Phase => (PROCESS.find((p) => p.id === s)?.stage ?? 'basic') as Phase

/**
 * Which step each design tool belongs to (tools/registry.ts ids). A tool can also say it itself (`DesignTool.steps`).
 * Each Massing step shows only its own topic (Ruijie, 6 Nov): Site = choosing the site and bringing in a Rhino model;
 * Volume = placing and shaping the towers; Program = uses, the brief's areas and the ground floor. Once past Site, the
 * site and the import leave the panel. A tool with no step (an add-on) shows in Volume, the modelling step.
 */
export const TOOL_STEPS: Record<string, StepId[]> = {
  site: ['site'],
  // A Rhino model brings the lot line, the context buildings and the towers in one go: it starts the design, on Site.
  'rhino-import': ['site'],
  towers: ['volume'],
  massing: ['volume'],
  'height-suggestion': ['volume'],
  sun: ['volume'],
  program: ['program'],
  ground: ['program'],
}
/** The step a tool with no step of its own joins. */
export const DEFAULT_TOOL_STEP: StepId = 'volume'

const KEY = 'ts.step'
function readSession(): { step: StepId; lastBasic: StepId } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { step?: unknown; lastBasic?: unknown } | null
    return v && isStep(v.step) ? { step: v.step, lastBasic: isStep(v.lastBasic) && stageOf(v.lastBasic) === 'basic' ? v.lastBasic : 'site' } : null
  } catch { return null }
}
function writeSession(step: StepId, lastBasic: StepId) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ step, lastBasic })) } catch { /* storage blocked: the step is still kept in memory */ }
}

interface StepState {
  step: StepId
  /** The Massing step to return to when Massing is chosen again (from the top bar or key 1). */
  lastBasic: StepId
  /** True when this page load started the session (no step kept yet): the guided app opens on Site. */
  firstOpen: boolean
}
const saved = typeof window !== 'undefined' ? readSession() : null
export const useStep = create<StepState>(() => ({ step: saved?.step ?? 'site', lastBasic: saved?.lastBasic ?? 'site', firstOpen: !saved }))

/** Go to a step: its stage too (Massing, Schematic or Present). */
export function goToStep(step: StepId) {
  const s = useStep.getState()
  const stage = stageOf(step)
  useStep.setState({ step, lastBasic: stage === 'basic' ? step : s.lastBasic })
  if (useStore.getState().phase !== stage) useStore.getState().setPhase(stage)
  writeSession(step, stage === 'basic' ? step : s.lastBasic)
  const label = PROCESS.find((p) => p.id === step)?.label ?? step
  useStore.getState().set({ announce: `${label} step` })
}

/** A stage chosen elsewhere (keys 1–3, the top bar, the tour) moves to its step; Massing goes back to its last step. */
export function followStage(phase: Phase) {
  const s = useStep.getState()
  if (stageOf(s.step) === phase) return
  const step: StepId = phase === 'basic' ? s.lastBasic : phase === 'advanced' ? 'plates' : 'frame'
  useStep.setState({ step })
  writeSession(step, s.lastBasic)
}

let following: (() => void) | null = null
/** Keep the step in line with the stage (idempotent; ProcessRail starts it). */
export function startStepFollow(): () => void {
  following ??= useStore.subscribe((st, prev) => { if (st.phase !== prev.phase) followStage(st.phase) })
  followStage(useStore.getState().phase)
  return () => { following?.(); following = null }
}

/**
 * First open of the guided app in this session: start on Site. With no saved project (no autosave restored), open Real
 * Vancouver, where the Site step has address search, neighbourhoods and the map; the competition block is a choice in
 * the Site panel. The switch happens at once, so a click on "Competition site" a moment later always wins; a saved
 * project restored afterwards (the autosave) brings its own project back. `restored` resolves when that restore is done.
 */
export function startOnSite(restored?: Promise<void>): 'city' | 'kept' | 'skipped' {
  if (!useStep.getState().firstOpen) return 'skipped'
  useStep.setState({ firstOpen: false })
  goToStep('site')
  // A design already opened (an autosave restored, the demo project, a file) keeps its project.
  if (!pristineDesign()) return 'kept'
  const st = useStore.getState()
  if (st.project !== 'city') st.setProject('city')
  // An autosave of the competition project restored after the switch: its own results node, as setProject would pick.
  void restored?.then(() => { const s = useStore.getState(); if (s.project === 'vtc' && s.selectedNode === 'built.viewcones') s.selectNode('built.vtc-rules') })
  return 'city'
}

/** Nothing opened or changed yet: the design inputs are still the ones the page started with. */
export function pristineDesign(): boolean {
  const s = useStore.getState(), i = useStore.getInitialState()
  return s.towers === i.towers && s.models === i.models && s.citySite === i.citySite && s.enabled === i.enabled
}

/** The tools of a Massing step, in panel order: only that step's own (no "More tools", Ruijie 6 Nov). */
export function toolsForStep<T extends { id: string; steps?: StepId[] }>(tools: T[], step: StepId): T[] {
  return tools.filter((t) => (t.steps ?? TOOL_STEPS[t.id] ?? [DEFAULT_TOOL_STEP]).includes(step))
}
