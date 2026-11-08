// Adding a tool to the workflow asks first (Ruijie, 8 Nov: "I know it's going to be a little chaotic, so make sure to add
// on a confirmation if the user wanted to add a node to their current workflow"). One card everywhere a tool is added
// (the bottom strip's tray, by click or drag, and a phase panel's Add tool): the tool, where it goes (changeable before
// confirming), which phase panel it will show in, what adding does (its check switches on), Add to workflow / Cancel.
// The card takes the keyboard focus on its main button; Esc cancels. Nothing changes until Add to workflow.
import { useEffect, useRef, type ReactNode } from 'react'
import { Plus, X } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import { isDesignNode } from '../../lib/workflow/designNodes'
import type { Info } from './WorkflowOverview'

export function AddConfirm({ info, placement, onConfirm, onCancel, className = '' }: {
  info: Info; placement: ReactNode; onConfirm: () => void; onCancel: () => void; className?: string
}) {
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => { ok.current?.focus({ preventScroll: true }) }, [info.id])
  return (
    <div role="group" aria-label={`Add ${info.name} to your workflow?`} data-testid="add-confirm" data-add-id={info.id}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-accent/40 bg-selected px-2.5 py-2 text-meta ${className}`}>
      <NodeTile id={info.id} size={26} art={<NodeArtwork id={info.id} size={23} category={info.category} />} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">Add {info.name} to your workflow?</span>
        <span className="block text-ink">{placement}</span>
        <span className="block text-muted">{isDesignNode(info.id) ? 'A design tool: nothing is switched on or off.' : 'Its check switches on; Undo takes it back.'}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button ref={ok} type="button" onClick={onConfirm} data-testid="add-confirm-yes"
          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Plus size={13} aria-hidden />Add to workflow</button>
        <button type="button" onClick={onCancel} data-testid="add-confirm-no"
          className="flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={13} aria-hidden />Cancel</button>
      </span>
    </div>
  )
}
