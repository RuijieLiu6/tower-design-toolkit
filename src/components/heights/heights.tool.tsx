// Left-panel design tool: Vista's height suggestion for the selected tower (Real Vancouver only). Body: HeightTool.tsx.
import { lazy } from 'react'
import { ArrowDownToLine } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'height-suggestion', label: 'Height suggestion', short: 'Height', icon: ArrowDownToLine, stages: ['basic', 'advanced'], order: { basic: 12, advanced: 125 }, defaultOpen: true,
  hint: 'Zoning and view cones over the tower; Adjust scales the blocks below them',
  when: (s) => s.project === 'city',
  component: lazy(() => import('./HeightTool')),
} satisfies DesignTool
