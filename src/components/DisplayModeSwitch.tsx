// The View switch (design system §9, lib/displayMode.ts): Geometry · Building use · Analysis · Materials, with the
// shown one marked. Its own small module, so the Present panel (which loads with the app) can carry it without the 3D
// view's keys and overlays (components/DisplayMode.tsx).
import { useEffect, useState } from 'react'
import { DISPLAY_MODES, modeSupport, useDisplayMode, type DisplayMode } from '../lib/displayMode'
import { useShownMode } from '../lib/displayModeHooks'
import type { ProjectKind } from '../store'
import { Blinds, BrickWall, Cuboid, Gauge, Pin, Rows3, type LucideIcon } from './icons'

const ICON: Record<DisplayMode, LucideIcon> = { massing: Cuboid, program: Rows3, analysis: Gauge, materials: BrickWall, facade: Blinds as unknown as LucideIcon }
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
        {DISPLAY_MODES.filter((m) => m.id !== 'analysis').map((m) => {
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

// ---------- the View menu (Sinnie, 12 Nov: "make this into a view mode and place it on the top where you can drop down
// to see which mode you want it to be") ----------
// One pill in the view's top row ("View: Geometry ▾"), next to Working view. It opens a menu with the four modes (each
// with what it shows, or why this project can't show it), Pin view, and below them whatever the site adds: its
// switches and the legend of the shown mode. The bar that sat at the bottom of the view is gone; an Analysis scale still
// shows at the bottom while Analysis is on, since the colours can't be read without it.
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { useRef, type ReactNode } from 'react'
import { Camera, ChevronDown } from './icons'
import { captureShot } from '../lib/capture'

/** Where the View menu goes: the row with Working view (ContextPins) registers its slot here. */
export const useViewMenuSlot = create<{ el: HTMLElement | null }>(() => ({ el: null }))
export function ViewMenuSlot() {
  return <span ref={(el) => { if (useViewMenuSlot.getState().el !== el) useViewMenuSlot.setState({ el }) }} data-testid="view-menu-slot" className="pointer-events-auto contents" />
}

/** The View menu, rendered into the slot when there is one. */
export function ViewModeMenu({ project, angles, onFrame, children }: { project: ProjectKind; angles?: ReactNode; onFrame?: () => void; children?: ReactNode }) {
  const slot = useViewMenuSlot((s) => s.el)
  if (!slot) return null
  return createPortal(<ViewMenu project={project} angles={angles} onFrame={onFrame}>{children}</ViewMenu>, slot)
}

const barBtn = 'flex h-8 items-center justify-center rounded-lg px-2 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent'

// The view bar (12 Nov, after the Tower Workspace's bottom bar: "for the mode i want it to look like this, view angles
// should also be part of this bar"): one pill along the bottom of the view with Capture, Frame, the view angles where
// the site has them (Real Vancouver: City, Observer, Inspect, Plan) and the View mode with its menu (modes, Pin view,
// the sun and the legend), which opens upward.
function ViewMenu({ project, angles, onFrame, children }: { project: ProjectKind; angles?: ReactNode; onFrame?: () => void; children?: ReactNode }) {
  const [shot, setShot] = useState(false)
  useEffect(() => { if (!shot) return; const t = setTimeout(() => setShot(false), 1600); return () => clearTimeout(t) }, [shot])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const shown = useShownMode()
  const setMode = useDisplayMode((s) => s.setMode)
  const pinned = useDisplayMode((s) => s.pinned)
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key) }
  }, [open])
  const cur = DISPLAY_MODES.find((m) => m.id === shown) ?? DISPLAY_MODES[0]
  const CurIcon = ICON[cur.id]
  return (
    <div ref={box} className="pointer-events-auto relative" data-testid="view-menu">
      <div role="toolbar" aria-label="View" data-testid="view-bar" className="flex items-center gap-0.5 rounded-2xl border border-line bg-panel p-1">
        <button type="button" onClick={() => { if (captureShot(false)) setShot(true) }} aria-label="Capture the view" title="Capture the view: it joins your shots (Present shows them)" data-testid="view-capture" className={barBtn}>
          <Camera size={18} aria-hidden />
        </button>
        {angles && <><span aria-hidden className="mx-0.5 h-5 w-px bg-line" /><div className="flex items-center gap-0.5" data-testid="view-angles">{angles}</div></>}
        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} data-testid="view-menu-button"
          title="View mode: how the model and its surroundings are drawn" className={`${barBtn} gap-1.5 font-medium`}>
          <CurIcon size={16} aria-hidden className="text-accent" />{cur.word}{pinned && <Pin size={12} aria-label="pinned" className="text-accent" />}
          <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {shot && <span role="status" className="px-1.5 text-meta text-muted">Captured</span>}
      </div>
      {open && (
        <div role="dialog" aria-label="View mode" data-testid="view-menu-panel"
          className="absolute left-0 top-full z-30 mt-2 grid max-h-[min(36rem,70vh)] w-[min(26rem,calc(100vw-2rem))] gap-2 overflow-y-auto rounded-xl border border-line bg-panel p-2 text-meta text-ink shadow-float">
          <div role="radiogroup" aria-label="View" data-testid="display-mode" className="grid gap-0.5">
            {DISPLAY_MODES.filter((m) => m.id !== 'analysis').map((m) => {
              const Icon = ICON[m.id]
              const ok = modeSupport(m.id, project)
              const on = shown === m.id
              return (
                <button key={m.id} type="button" role="radio" aria-checked={on} aria-disabled={!ok.ok} data-mode={m.id}
                  onClick={() => { if (ok.ok) { setMode(m.id); setWhy(null) } else setWhy(why === ok.why ? null : ok.why) }}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-left ${focusRing} ${on ? 'bg-selected' : ok.ok ? 'hover:bg-subtle' : 'cursor-not-allowed opacity-60'}`}>
                  <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${on ? 'text-accent' : 'text-muted'}`} />
                  <span className="min-w-0">
                    <span className={`block text-control font-medium ${on ? 'text-accent-hover' : 'text-ink'}`}>{m.word}</span>
                    <span className="block text-meta text-muted">{ok.ok ? m.hint : ok.why}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {why && <p role="status" className="px-2 text-meta text-muted">{why}</p>}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-1 pt-2"><PinView /></div>
          {children && <div className="grid gap-1.5 border-t border-line px-1 pt-2" data-testid="view-menu-legend">{children}</div>}
        </div>
      )}
    </div>
  )
}
