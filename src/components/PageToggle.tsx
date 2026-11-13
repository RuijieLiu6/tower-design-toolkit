// The page switch of the Tower Workspace (Sinnie, 13 Nov: "add also this page toggle, just model and present right
// now, no nodes"): Model = the workspace, Presentation = the drawing sheets (the board composer). Shown in the top bar
// and in the presentation's own header, so either page leads to the other.
import { useBoardStore } from '../lib/boardStore'

export default function PageToggle({ dark = false }: { dark?: boolean }) {
  const open = useBoardStore((s) => s.open)
  const setOpen = useBoardStore((s) => s.setOpen)
  const tab = (on: boolean) => `h-7 whitespace-nowrap rounded-md px-3 text-control font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${on
    ? (dark ? 'bg-white/90 text-slate-900' : 'bg-panel text-ink shadow-sm') : (dark ? 'text-slate-300 hover:text-white' : 'text-muted hover:text-ink')}`
  return (
    <div role="tablist" aria-label="Page" data-testid="page-toggle" className={`flex shrink-0 rounded-lg p-0.5 ${dark ? 'bg-white/10' : 'bg-subtle'}`}>
      <button type="button" role="tab" aria-selected={!open} onClick={() => setOpen(false)} data-testid="page-model" className={tab(!open)}>Model</button>
      <button type="button" role="tab" aria-selected={open} onClick={() => setOpen(true)} data-testid="page-present" className={tab(open)}>Presentation</button>
    </div>
  )
}
