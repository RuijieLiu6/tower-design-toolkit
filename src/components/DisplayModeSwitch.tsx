// The View switch (design system §9, lib/displayMode.ts): Geometry · Building use · Analysis · Materials, with the
// shown one marked. Its own small module, so the Present panel (which loads with the app) can carry it without the 3D
// view's keys and overlays (components/DisplayMode.tsx).
import { useEffect, useState } from 'react'
import { DISPLAY_MODES, modeSupport, useDisplayMode, type DisplayMode } from '../lib/displayMode'
import { useShownMode } from '../lib/displayModeHooks'
import type { ProjectKind } from '../store'
import { BrickWall, Cuboid, Gauge, Pin, Rows3, type LucideIcon } from './icons'

const ICON: Record<DisplayMode, LucideIcon> = { massing: Cuboid, program: Rows3, analysis: Gauge, materials: BrickWall }
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

export function DisplayModeSwitch({ project }: { project: ProjectKind }) {
  const chosen = useDisplayMode((s) => s.mode)
  const setMode = useDisplayMode((s) => s.setMode)
  const shown = useShownMode()
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => { setWhy(null) }, [project])
  // The stored choice this project cannot show (Materials on the competition site) is explained, not hidden.
  const unshown = modeSupport(chosen, project)
  const reason = why ?? (unshown.ok ? null : unshown.why)
  return (
    <div className="flex flex-col items-start gap-1">
      <div role="radiogroup" aria-label="View" data-testid="display-mode" className="flex max-w-full flex-wrap items-center gap-0.5 rounded-[8px] border border-line bg-subtle p-0.5">
        <span aria-hidden className="px-1.5 text-control font-medium text-muted">View</span>
        {DISPLAY_MODES.map((m) => {
          const Icon = ICON[m.id]
          const ok = modeSupport(m.id, project)
          const on = shown === m.id
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} aria-disabled={!ok.ok} data-mode={m.id}
              title={ok.ok ? m.hint : ok.why}
              onClick={() => { if (ok.ok) { setMode(m.id); setWhy(null) } else setWhy(why ? null : ok.why) }}
              className={`flex h-7 items-center gap-1 rounded-[6px] px-2 text-control font-medium ${focusRing} ${on ? 'bg-panel text-ink shadow-[0_0_0_1px_var(--color-line)]' : ok.ok ? 'text-muted hover:bg-panel/70 hover:text-ink' : 'cursor-not-allowed text-muted/60'}`}>
              <Icon size={14} aria-hidden className={on ? 'text-accent' : ''} />{m.word}
            </button>
          )
        })}
      </div>
      {/* Keep this View when another tool opens (otherwise each tool opens in its own working view). */}
      <PinView />
      {/* A mode the model cannot show says so where it was asked for (touch has no hover). */}
      {reason && <p role="status" className="max-w-[24rem] text-meta text-muted">{reason}</p>}
    </div>
  )
}

/** Pin the View: it stays as it is when another tool opens; anything it shows that isn't that tool's is marked pinned. */
function PinView() {
  const pinned = useDisplayMode((s) => s.pinned)
  const setPinned = useDisplayMode((s) => s.setPinned)
  return (
    <button type="button" aria-pressed={pinned} onClick={() => setPinned(!pinned)} data-testid="pin-view"
      title={pinned ? 'The View stays as it is when you open another tool. Click to let each tool open in its own working view.' : 'Each tool opens in its own working view. Pin to keep this View while you switch tools.'}
      className={`flex h-7 items-center gap-1 rounded-[6px] border px-2 text-control font-medium ${focusRing} ${pinned ? 'border-accent bg-selected text-accent-hover' : 'border-line bg-panel text-muted hover:text-ink'}`}>
      <Pin size={13} aria-hidden />{pinned ? 'View pinned' : 'Pin view'}
    </button>
  )
}
