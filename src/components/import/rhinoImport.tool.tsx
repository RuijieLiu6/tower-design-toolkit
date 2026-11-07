// "Import" in the design-tool panel (tools/registry.ts collects every *.tool.tsx): pick the software, then upload or link
// live. Icon: a file going in, always shown with its word; the software inside carry drawn monograms, never the makers'
// logos. The body loads lazily, so this file stays light. The id stays 'rhino-import' (saved panels and tests use it).
import { FileUp } from '../icons'
import { TOOL_ICONS } from '../../data/icons'
import { lazy } from 'react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'rhino-import',
  // One Import for every platform (Ruijie, 6 Nov: merge import and upload): Rhino, Revit, Archicad, AutoCAD, SketchUp,
  // or any model file, each with its upload and its live link (components/import/RhinoImportPanel.tsx).
  label: 'Import a model',
  short: 'Import',
  icon: TOOL_ICONS['rhino-import'],
  // Site step only: a Rhino model starts the design; past Site the panel keeps to the step's own tools (Ruijie, 6 Nov).
  stages: ['basic'],
  order: 15,
  hint: 'From Rhino, Revit, Archicad, AutoCAD, SketchUp or a model file: upload it or link it live',
  defaultOpen: true,
  component: lazy(() => import('./RhinoImportPanel')),
} satisfies DesignTool
