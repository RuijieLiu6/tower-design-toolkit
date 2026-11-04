// Body of the "Rhino import" design tool: the upload button, and once a model is in, what it brought and its live link.
import { FileUp, Link2, Spline } from 'lucide-react'
import { useImportStore } from '../../lib/import/store'
import { useLiveLink } from '../../lib/interchange/live'
import { useStore, useTowers } from '../../store'

export default function RhinoImportPanel() {
  const present = useStore((s) => s.phase === 'present')
  const model = useStore((s) => s.models[s.project])
  const towers = useTowers()
  const live = useLiveLink()
  const open = () => useImportStore.getState().openDialog()
  const ours = model ? towers.filter((t) => t.imported?.source?.modelId === model.id).length : 0
  const site = model?.elements.some((e) => e.role === 'site'), context = model?.elements.filter((e) => e.role === 'context').length ?? 0
  const details = () => { const s = useStore.getState(); s.set({ selectedNode: 'built.model', enabled: { ...s.enabled, 'built.model': true } }) }
  return (
    <div className="grid gap-2 px-4 pb-3 pt-1 text-xs">
      <button type="button" onClick={open} disabled={present} data-tool="tool.rhino-import" title={present ? 'The model is locked in Present' : 'Rhino .3dm, OBJ, glTF or IFC'}
        className="flex items-center justify-center gap-2 rounded-md border border-accent bg-panel px-3 py-1.5 font-semibold text-accent outline-none hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
        <Spline size={15} aria-hidden />{model ? 'Upload a new version' : 'Upload a Rhino model'}
      </button>
      <p className="text-[11px] leading-snug text-muted">.3dm, OBJ, glTF or IFC. Map its layers to tower, podium, program, core, site and context, check units, north and datum, and place it on the map. Read in this browser; nothing is uploaded.</p>
      {model && (
        <div className="rounded-md border border-line bg-black/[0.02] px-2 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5"><FileUp size={12} className="shrink-0 text-accent" aria-hidden /><b className="truncate">{model.source.fileName}</b></div>
          <div className="mt-0.5 text-muted">{ours} tower{ours === 1 ? '' : 's'}{site ? ' · lot line' : ''}{context ? ` · ${context} context` : ''}</div>
          {live.status !== 'off' && <div className="mt-0.5 flex items-center gap-1 text-accent"><Link2 size={11} aria-hidden />{live.status === 'error' ? 'Link problem: see the details' : 'Linked: updates on each save'}</div>}
          <button type="button" onClick={details} className="mt-1 text-[11px] text-accent hover:underline">Details and provenance</button>
        </div>
      )}
    </div>
  )
}
