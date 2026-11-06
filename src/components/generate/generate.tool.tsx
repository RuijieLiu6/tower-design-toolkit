// "Generate" on the Volume step: Sinnie Choi's massing generator from her Downtown Massing Tool (github.com/xubynii/dtmass),
// ported with her permission (6 Nov 2026). It works without a tower, so an empty site offers it next to "Place your tower".
import { lazy } from 'react'
import { Wand2 } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'generate', label: 'Generate a massing', short: 'Generate', icon: Wand2, stages: ['basic'], steps: ['volume'], order: 22, defaultOpen: false,
  worksWithoutTower: true,
  hint: "Typology and brief to massing, with Sinnie Choi's generator from her Downtown Massing Tool",
  component: lazy(() => import('./GenerateTool')),
} satisfies DesignTool
