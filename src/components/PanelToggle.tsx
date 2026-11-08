// Hide and show the side panels (lib/panels.ts): the button in each panel's header, and the thin rail a hidden panel
// leaves behind with the button that brings it back. Keys: [ for the left panel, ] for the right.
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from './icons'
import { PANEL_NAME, setPanelWidth, togglePanel, usePanelWidths, WIDTH_MAX, WIDTH_MIN, type Side } from '../lib/panels'

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
      <span aria-hidden className="select-none text-meta text-muted [writing-mode:vertical-rl]">{label}</span>
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

/**
 * The edge between a side panel and the model: drag it to resize the panel, or focus it and use the arrow keys (16 px a
 * step, Home / End for the ends); a double-click (or Enter) goes back to the default width. lib/panels.ts keeps it.
 */
export function PanelResizer({ side }: { side: Side }) {
  const w = usePanelWidths((s) => s[side])
  const current = () => w ?? (document.querySelector<HTMLElement>(side === 'left' ? '[data-testid="phase-panel"]' : '[data-panel="right"]')?.getBoundingClientRect().width ?? 288)
  const sign = side === 'left' ? 1 : -1
  return (
    <div role="separator" aria-orientation="vertical" aria-label={`Resize the ${PANEL_NAME[side]} panel`} aria-valuemin={WIDTH_MIN} aria-valuemax={WIDTH_MAX} aria-valuenow={Math.round(w ?? current())}
      tabIndex={0} data-resizer={side} title="Drag to resize; double-click for the default width"
      onDoubleClick={() => setPanelWidth(side, null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPanelWidth(side, current() + (e.key === 'ArrowRight' ? step : -step) * sign) }
        if (e.key === 'Home') { e.preventDefault(); setPanelWidth(side, WIDTH_MIN) }
        if (e.key === 'End') { e.preventDefault(); setPanelWidth(side, WIDTH_MAX) }
        if (e.key === 'Enter') { e.preventDefault(); setPanelWidth(side, null) }
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        const x0 = e.clientX, w0 = current()
        const move = (ev: PointerEvent) => setPanelWidth(side, w0 + (ev.clientX - x0) * sign)
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
      }}
      className="group relative -mx-2 w-2 shrink-0 cursor-col-resize touch-none outline-none">
      <span aria-hidden className="absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-boundary group-focus-visible:bg-accent group-active:bg-accent" />
    </div>
  )
}
