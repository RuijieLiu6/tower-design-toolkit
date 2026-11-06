// "Brief & plan" (workflow study §7.1, tool 1 for VTC students): key dates and the brief's suggested deliverables, with
// where the tool makes each one. Competition site only; first on the Site step. Icon: lucide
// ClipboardList (a brief's checklist), always with its word.
import { lazy } from 'react'
import { ClipboardList } from '../icons'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'brief', label: 'Brief & plan', icon: ClipboardList, stages: ['basic'], steps: ['site'], order: 1,
  hint: 'Key dates and the brief’s deliverables', when: (s) => s.project === 'vtc',
  component: lazy(() => import('./BriefPlan')),
} satisfies DesignTool
