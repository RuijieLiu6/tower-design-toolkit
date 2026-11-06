// "Rhino import" in the design-tool panel (tools/registry.ts collects every *.tool.tsx): one click on its button opens
// the upload flow. Icon: lucide Spline, a NURBS curve with control points (Rhino's own kind of geometry), never a brand
// logo, always shown with its words. The body loads lazily, so this file stays light.
import { Spline } from '../icons'
import { lazy } from 'react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'rhino-import',
  label: 'Rhino import',
  icon: Spline,
  stages: ['basic', 'advanced'],
  order: { basic: 15, advanced: 90 },
  hint: 'Upload a .3dm and map its layers',
  defaultOpen: true,
  component: lazy(() => import('./RhinoImportPanel')),
} satisfies DesignTool
