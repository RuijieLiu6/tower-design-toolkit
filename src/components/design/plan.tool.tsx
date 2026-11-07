// "Plan" in the Schematic design-tool panel (components/tools/registry.ts collects every *.tool.tsx): the card opens the
// full-size Plan editor over the 3D view. Icon: lucide Grid2x2 (a plan grid), always shown with its word.
import { Grid2x2 } from '../icons'
import { TOOL_ICONS } from '../../data/icons'
import { lazy } from 'react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'plan',
  label: 'Plan',
  icon: TOOL_ICONS['plan'],
  stages: ['advanced'],
  order: 20,
  hint: 'Edit a floor plate: facades, turn, core',
  component: lazy(() => import('./DesignCards').then((m) => ({ default: m.PlanCard }))),
} satisfies DesignTool
