// "Generate" on the Form step: Sinnie Choi's massing generator from her Downtown Massing Tool (github.com/xubynii/dtmass),
// ported with her permission (6 Nov 2026). An empty site offers it next to "Place your tower"; once there is a tower it
// lives inside Massing (components/MassingEditPanel.tsx GenerateFold), so the Form row stays Place, Height, Sun, Massing.
import { lazy } from 'react'
import { TOOL_ICONS } from '../../data/icons'
import { Wand2 } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'generate', label: 'Generate a massing', short: 'Generate', icon: TOOL_ICONS['generate'], stages: ['basic'], steps: ['volume'], order: 22, defaultOpen: false,
  worksWithoutTower: true, emptyOnly: true, opensIn: 'massing',
  hint: "Typology and brief to massing, with Sinnie Choi's generator from her Downtown Massing Tool",
  component: lazy(() => import('./GenerateTool')),
} satisfies DesignTool
