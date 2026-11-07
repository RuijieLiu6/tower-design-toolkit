// "Brief & plan" (workflow study §7.1, tool 1 for VTC students): key dates and the brief's suggested deliverables, with
// where the tool makes each one. Competition site only; on the Program step (the Site step keeps only the site and the
// Rhino import, Ruijie 6 Nov). Icon: lucide
// ClipboardList (a brief's checklist), always with its word.
import { lazy } from 'react'
import { TOOL_ICONS } from '../../data/icons'
import { ClipboardList } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'brief', label: 'Brief & plan', short: 'Brief', icon: TOOL_ICONS['brief'], stages: ['basic'], steps: ['program'], order: 1,
  hint: 'Key dates and the brief’s deliverables', when: (s) => s.project === 'vtc',
  component: lazy(() => import('./BriefPlan')),
} satisfies DesignTool
