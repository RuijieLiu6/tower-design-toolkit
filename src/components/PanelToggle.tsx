// Hide and show the side panels (lib/panels.ts): the button in each panel's header, and the thin rail a hidden panel
// leaves behind with the button that brings it back. Keys: [ for the left panel, ] for the right.
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from './icons'
import { PANEL_NAME, togglePanel, type Side } from '../lib/panels'

const keyOf = (side: Side) => (side === 'left' ? '[' : ']')

/** A hidden side panel: a thin rail with the button that brings it back. */
export function PanelRail({ side, label }: { side: Side; label: string }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <div className="glass-edge flex w-9 shrink-0 flex-col items-center gap-2 rounded-2xl bg-glass-2 py-2">
      <button type="button" onClick={() => togglePanel(side)} aria-label={`Show ${label} (${keyOf(side)})`} title={`Show ${label} (${keyOf(side)})`}
        className="flex h-7 w-7 items-center justify-center rounded text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
        <Icon size={15} aria-hidden />
      </button>
      <span aria-hidden className="select-none text-[11px] text-muted [writing-mode:vertical-rl]">{label}</span>
    </div>
  )
}

/** The button in a panel's header that hides it. */
export function HidePanelButton({ side }: { side: Side }) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose
  return (
    <button type="button" onClick={() => togglePanel(side)} aria-label={`Hide the ${PANEL_NAME[side]} panel (${keyOf(side)})`} title={`Hide this panel (${keyOf(side)}): more room for the map`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
      <Icon size={14} aria-hidden />
    </button>
  )
}
