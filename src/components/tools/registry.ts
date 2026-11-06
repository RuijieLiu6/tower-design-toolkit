// Design tools: the left panel of the guided app. Each tool is one design move (towers, massing, program, core …);
// the evaluation nodes are switched in the bottom bar and read in the right panel.
//
// ADDING A TOOL: create a file whose name ends in `.tool.tsx` anywhere under src/ and default-export a DesignTool
// (or an array of them). This registry finds it at build time (import.meta.glob); nothing else needs editing.
//
//   // src/components/design/plan.tool.tsx
//   import { lazy } from 'react'
//   import { Grid2x2 } from '../icons'
//   import type { DesignTool } from '../tools/registry'
//   export default { id: 'plan', label: 'Plan', icon: Grid2x2, stages: ['advanced'], order: 30,
//     hint: 'Edit a floor plate', component: lazy(() => import('./PlanTool')) } satisfies DesignTool
//
// Keep the tool file itself light: it is loaded with the guided app, so put three.js, WASM or other heavy code
// behind React.lazy (the panel renders every tool inside Suspense).
import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from '../icons'
import type { Phase, useStore } from '../../store'
import type { StepId } from '../../lib/step'

type StoreState = ReturnType<typeof useStore.getState>

export interface DesignTool {
  /** Unique, stable id. Also the key for the panel's open/closed memory. */
  id: string
  /** Short name shown next to the icon (icon + word, never the icon alone). */
  label: string
  icon: LucideIcon
  /** Stages that show the tool: 'basic' = Massing, 'advanced' = Schematic, 'present' = Present. */
  stages: Phase[]
  /** Sort key in the panel, lower first. A per-stage record sets a different place in each stage. */
  order: number | Partial<Record<Phase, number>>
  /** What the tool does, behind the "?" beside its name; a function when it depends on the open project. */
  hint?: string | ((s: StoreState) => string)
  /** The tool's body: no props, reads the store itself. */
  component: ComponentType | LazyExoticComponent<ComponentType>
  /** Open the first time the panel shows the tool; afterwards the panel remembers what the user opened. */
  defaultOpen?: boolean
  /** Extra condition, e.g. (s) => s.project === 'vtc'. */
  when?: (s: StoreState) => boolean
  /** Massing steps the tool leads (lib/step.ts); without it, lib/step.ts TOOL_STEPS or "More tools". Never hides a tool. */
  steps?: StepId[]
}

type ToolModule = { default: DesignTool | DesignTool[] }

/** Collects, validates and sorts tool definitions (pure, so the tests can feed it modules directly). */
export function collectTools(modules: Record<string, ToolModule>): DesignTool[] {
  const out: DesignTool[] = []
  const seen = new Map<string, string>()
  for (const [file, mod] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    for (const t of ([] as DesignTool[]).concat(mod.default ?? [])) {
      if (!t || !t.id || !t.label || !t.icon || !t.component || !t.stages?.length) { console.warn(`[tools] ${file}: incomplete DesignTool skipped`); continue }
      if (seen.has(t.id)) { console.warn(`[tools] ${file}: tool id "${t.id}" already defined in ${seen.get(t.id)}; skipped`); continue }
      seen.set(t.id, file)
      out.push(t)
    }
  }
  return out
}

export const orderIn = (t: DesignTool, phase: Phase) => (typeof t.order === 'number' ? t.order : t.order[phase] ?? 1000)

/** The tools shown in a stage, in panel order (ties keep file order). */
export function toolsFor(tools: DesignTool[], phase: Phase, state?: StoreState): DesignTool[] {
  return tools
    .filter((t) => t.stages.includes(phase) && (!t.when || !state || t.when(state)))
    .map((t, i) => [t, i] as const)
    .sort(([a, i], [b, j]) => orderIn(a, phase) - orderIn(b, phase) || i - j)
    .map(([t]) => t)
}

export const DESIGN_TOOLS: DesignTool[] = collectTools(import.meta.glob<ToolModule>('/src/**/*.tool.tsx', { eager: true }))
