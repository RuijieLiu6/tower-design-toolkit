// Present panel entry to the generated drawings (plans per use zone, section, elevations).
import { PenTool } from '../icons'
import { lazy, Suspense, useState } from 'react'
import { FlagChip, Section } from '../ui'
import Fold from '../Fold'

const DrawingsViewer = lazy(() => import('./DrawingsViewer'))

export default function DrawingsSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Drawings">
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs hover:border-accent"><PenTool size={14} />Plans, section and elevations</button>
      <Fold className="mt-1.5" summary="Plans per use zone, a section and two elevations, on A2">Typical plan per use zone, section A–A through the core and two elevations, at a standard scale with level labels, program fills, north arrow and scale bar. Export as SVG or PNG, or add to a board.</Fold>
      <div className="mt-1.5 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">LOD 100: a schematic space reservation from the massing.</span></div>
      {open && <Suspense fallback={null}><DrawingsViewer onClose={() => setOpen(false)} /></Suspense>}
    </Section>
  )
}
