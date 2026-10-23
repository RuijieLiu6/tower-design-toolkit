// Present panel entry to the generated drawings (plans per use zone, section, elevations).
import { PenTool } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { FlagChip, Section } from '../ui'

const DrawingsViewer = lazy(() => import('./DrawingsViewer'))

export default function DrawingsSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Drawings">
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs hover:border-accent"><PenTool size={14} />Plans, section and elevations</button>
      <p className="mt-1.5 text-[10px] text-muted">Typical plan per use zone, section A–A through the core and two elevations, on A2 at a standard scale with level labels, program fills, north arrow and scale bar. Export as SVG or PNG, or add to a board.</p>
      <div className="mt-1.5 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">LOD 100: a schematic space reservation from the massing.</span></div>
      {open && <Suspense fallback={null}><DrawingsViewer onClose={() => setOpen(false)} /></Suspense>}
    </Section>
  )
}
