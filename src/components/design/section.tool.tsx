// "Section" in the Schematic design-tool panel (components/tools/registry.ts collects every *.tool.tsx): the card opens
// the full-size Section editor over the 3D view. Icon: lucide Rows3 (stacked floors), always shown with its word.
import { Rows3 } from 'lucide-react'
import { lazy } from 'react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'section',
  label: 'Section',
  icon: Rows3,
  stages: ['advanced'],
  order: 25,
  hint: 'Edit the stack: block tops, setbacks, floor heights',
  component: lazy(() => import('./DesignCards').then((m) => ({ default: m.SectionCard }))),
} satisfies DesignTool
