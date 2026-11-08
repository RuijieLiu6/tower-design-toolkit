// The display-mode switch (design system §9, lib/displayMode.ts): Massing · Program · Analysis · Materials, with the
// shown one marked. Its own small module, so the Present panel (which loads with the app) can carry it without the 3D
// view's keys and overlays (components/DisplayMode.tsx).
import { useEffect, useState } from 'react'
import { DISPLAY_MODES, modeSupport, useDisplayMode, type DisplayMode } from '../lib/displayMode'
import { useShownMode } from '../lib/displayModeHooks'
import type { ProjectKind } from '../store'
import { BrickWall, Cuboid, Gauge, Rows3, type LucideIcon } from './icons'

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
      <div role="radiogroup" aria-label="Display mode" data-testid="display-mode" className="flex max-w-full flex-wrap gap-0.5 rounded-[8px] border border-line bg-subtle p-0.5">
        {DISPLAY_MODES.map((m) => {
          const Icon = ICON[m.id]
          const ok = modeSupport(m.id, project)
          const on = shown === m.id
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} aria-disabled={!ok.ok} data-mode={m.id}
              title={ok.ok ? m.hint : ok.why}
              onClick={() => { if (ok.ok) { setMode(m.id); setWhy(null) } else setWhy(why ? null : ok.why) }}
              className={`flex h-7 items-center gap-1 rounded-[6px] px-2 text-meta font-medium ${focusRing} ${on ? 'bg-panel text-ink shadow-[0_0_0_1px_var(--color-line)]' : ok.ok ? 'text-muted hover:bg-panel/70 hover:text-ink' : 'cursor-not-allowed text-muted/60'}`}>
              <Icon size={14} aria-hidden className={on ? 'text-accent' : ''} />{m.word}
            </button>
          )
        })}
      </div>
      {/* A mode the model cannot show says so where it was asked for (touch has no hover). */}
      {reason && <p role="status" className="max-w-[24rem] text-meta text-muted">{reason}</p>}
    </div>
  )
}
