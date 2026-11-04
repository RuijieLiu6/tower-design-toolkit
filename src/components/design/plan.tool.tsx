// "Plan" in the Schematic design-tool panel (components/tools/registry.ts collects every *.tool.tsx): the card opens the
// full-size Plan editor over the 3D view. Icon: lucide Grid2x2 (a plan grid), always shown with its word.
import { Grid2x2 } from 'lucide-react'
import { lazy } from 'react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'plan',
  label: 'Plan',
  icon: Grid2x2,
  stages: ['advanced'],
  order: 20,
  hint: 'Edit a floor plate: facades, turn, core',
  component: lazy(() => import('./DesignCards').then((m) => ({ default: m.PlanCard }))),
} satisfies DesignTool
