// Which design tool is open, per Massing step or stage, and which tools a step offers: one source for the left panel
// (ToolPanel.tsx) and the tool rail beside the model (components/ToolRail.tsx), so a click in either lands in the same
// place and the two never list different tools. The open tool is remembered in this browser (ts.tools.active).
import { useMemo } from 'react'
import { create } from 'zustand'
import { toolsForStep, useStep, type StepId } from '../../lib/step'
import { useStore, useTowers, type Phase } from '../../store'
import { DESIGN_TOOLS, toolsFor, type DesignTool } from './registry'
import { isVisible, registerUiItems, useUiItems, useUiVisibility } from '../../lib/ui/registry'

// Every design tool is a part of the interface (lib/ui/registry.ts): a tool added later registers here with no extra work.
registerUiItems('tools.design', DESIGN_TOOLS.map((t) => ({ id: `tools.${t.id}`, label: t.label, parent: 'tools', icon: t.icon, mode: t.stages.includes('present') && t.stages.length === 1 ? 'presentation' as const : 'model' as const, hint: typeof t.hint === 'string' ? t.hint : undefined })))

const KEY = 'ts.tools.active'
function readActive(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
function writeActive(v: Record<string, string>) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage blocked: the panel still works */ } }

/** The open tool per place (`where` below), as picked by the user. */
export const useToolPick = create<{ picked: Record<string, string> }>(() => ({ picked: typeof window !== 'undefined' ? readActive() : {} }))
export function pickTool(where: string, id: string) {
  useToolPick.setState((s) => { const picked = { ...s.picked, [where]: id }; writeActive(picked); return { picked } })
}

/** Steps whose tools work without a tower (choosing the site, importing a model). */
const NO_TOWER_STEPS = new Set<StepId>(['site'])

export type Empty = 'place' | 'none' | null
export interface ToolChoice {
  /** The tools of the step (or of the `only` set), before the no-tower rule. */
  stepTools: DesignTool[]
  /** The tools offered: the step's, less the ones that need a tower when there is none. */
  shown: DesignTool[]
  /** No tower yet: Volume offers to place one ('place'); Program and Schematic point there ('none'). */
  empty: Empty
  /** The key the open tool is remembered under: a Massing step, a stage, or a check's control set. */
  where: string
  /** The open tool, if any. */
  activeId: string | undefined
}

/**
 * Pure: the tools offered and the open one. `tools` are the stage's tools in panel order (registry.ts toolsFor); `all`
 * every tool, for a check's own control set (`only`, lib/workflow/phaseTools.ts NODE_CONTROLS).
 */
export function resolveTools(tools: DesignTool[], { all = tools, phase, step, only, noTower, picked }: {
  all?: DesignTool[]; phase: Phase; step: StepId; only?: string[]; noTower: boolean; picked: Record<string, string>
}): ToolChoice {
  // Massing has three steps (Site, Form, Program), each with only its own tools.
  const stepTools = only ? all.filter((t) => only.includes(t.id)) : phase === 'basic' ? toolsForStep(tools, step) : tools
  // No tower yet: Volume offers to place one; Program and Schematic point there (their tools shape a tower).
  const empty: Empty = !noTower || (phase === 'basic' && NO_TOWER_STEPS.has(step)) ? null : phase === 'basic' && step === 'volume' ? 'place' : 'none'
  // No tower on Volume: only the tools that make towers stay (Generate), and none opens until it is picked.
  // With a tower, a tool that only leads an empty site (Generate) moves inside another one (Massing).
  const shown = empty === 'place' ? stepTools.filter((t) => t.worksWithoutTower) : empty ? [] : stepTools.filter((t) => !t.emptyOnly)
  // The open tool, per step (Massing) or stage: the one picked here before, else the first that opens by default.
  const where = only ? `node:${only.join(',')}` : phase === 'basic' ? `basic:${step}` : phase
  const heldIn = stepTools.find((t) => t.id === picked[where])?.opensIn
  const activeId = shown.find((t) => t.id === picked[where] || t.id === heldIn)?.id ?? (empty ? undefined : (shown.find((t) => t.defaultOpen) ?? shown[0])?.id)
  return { stepTools, shown, empty, where, activeId }
}

/** The step's tools and the open one, live; `pick` opens a tool (and remembers it). */
export function useToolChoice(only?: string[]) {
  const phase = useStore((s) => s.phase)
  const project = useStore((s) => s.project)
  const step = useStep((s) => s.step)
  const noTower = useTowers().length === 0
  const picked = useToolPick((s) => s.picked)
  // `when` conditions read the store; the list follows the stage and the project.
  const tools = useMemo(() => toolsFor(DESIGN_TOOLS, phase, useStore.getState()), [phase, project])
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const choice = useMemo(() => {
    const c = resolveTools(tools, { all: DESIGN_TOOLS, phase, step, only, noTower, picked })
    // A tool hidden in the Interface drawer leaves the row and the rail (the panel and the rail read the same list).
    const shown = c.shown.filter((t) => isVisible(`tools.${t.id}`, hiddenUi, uiItems))
    const activeId = shown.some((t) => t.id === c.activeId) ? c.activeId : shown[0]?.id
    return { ...c, shown, activeId }
  }, [tools, phase, step, only, noTower, picked, hiddenUi, uiItems])
  return { ...choice, phase, step, pick: (id: string) => pickTool(choice.where, id) }
}
