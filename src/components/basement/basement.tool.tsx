// "Below grade" on the Form step (after Place, Height, Sun and Massing) and in Schematic: basement levels dug into a thick
// ground, their parking and ramp (engine/basement.ts). Icon: stacked levels, always with its word.
import { lazy } from 'react'
import { Layers2 } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'basement', label: 'Basement (below grade)', short: 'Basement', icon: Layers2, stages: ['basic', 'advanced'], steps: ['volume'], order: { basic: 24, advanced: 128 },
  hint: 'Basement levels dug into the ground: parking, the ramp and how deep it goes',
  component: lazy(() => import('./BasementTool')),
} satisfies DesignTool
