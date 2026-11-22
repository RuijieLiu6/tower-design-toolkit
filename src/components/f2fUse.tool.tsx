// Storey height by use's own settings in the left panel (node placement, 21 Nov 2026): Use typical and the storey
// height per use (F2fUsePanel.tsx F2fUseSettings). Opened by the node (lib/workflow/phaseTools.ts NODE_CONTROLS).
// Loaded lazily, as the other tool cards, so the registry never waits on the panel's imports.
import { lazy } from 'react'
import { Ruler } from './icons'
import type { DesignTool } from './tools/registry'

export default {
  id: 'f2f-use-set',
  label: 'Storey height by use',
  short: 'Storey',
  icon: Ruler,
  stages: ['basic', 'advanced'],
  order: 200,
  hint: 'Use typical, or set each use’s storey height',
  component: lazy(() => import('./F2fUsePanel').then((m) => ({ default: m.F2fUseSettings }))),
  when: () => false,
} satisfies DesignTool
