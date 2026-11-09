// Viewport dock (Ruijie, 28 Oct: "snapping the layers to one side ... if they have to flow on top of the view make them
// transparent or hideable"). Every control that used to float over the 3D view sits in one translucent panel snapped to
// the right edge, in collapsible sections. The dock folds to a slim "Layers" tab, fades while the camera is dragged, and
// H hides every overlay for a clean view. Captures read the WebGL canvas only, so they never include the dock.
// Open/closed state, open sections and dismissed hints are remembered per viewer (localStorage, guarded).
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers, PanelRightClose, X } from './icons'
import { useEffect, type ReactNode } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'

export interface DockPrefs { open: boolean; sections: Record<string, boolean>; hints: Record<string, boolean> }
const KEY = 'ts.viewportDock.v1'
// Closed by default, as in Vista: the view comes first; Layers opens it (UI review round 2, 4 Nov; run-through F2).
const DEFAULT_PREFS: DockPrefs = { open: false, sections: {}, hints: {} }

/** Saved dock preferences, or the defaults when storage is missing, blocked or holds something else. */
export function readDockPrefs(storage: Pick<Storage, 'getItem'> | null): DockPrefs {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? 'null')
    if (!v || typeof v !== 'object') return DEFAULT_PREFS
    const rec = (o: unknown) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([, b]) => typeof b === 'boolean')) : {})
    return { open: typeof v.open === 'boolean' ? v.open : false, sections: rec(v.sections), hints: rec(v.hints) }
  } catch { return DEFAULT_PREFS }
}

export function writeDockPrefs(storage: Pick<Storage, 'setItem'> | null, p: DockPrefs) {
  try { storage?.setItem(KEY, JSON.stringify(p)) } catch { /* private window or blocked storage: the dock still works */ }
}

const storage = () => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

interface DockState extends DockPrefs {
  /** Every viewport overlay hidden (H): a clean view. Not remembered across reloads. */
  hidden: boolean
  /** The camera is being dragged: the dock fades so the city shows through. */
  orbiting: boolean
  /** Real Vancouver's Vista layout: the dock opened from the "Layers" button (closed at first, as in Vista; not remembered). */
  menu: boolean
}
export const useDock = create<DockState>(() => ({ ...readDockPrefs(storage()), hidden: false, orbiting: false, menu: false }))
useDock.subscribe((s, prev) => {
  if (s.open !== prev.open || s.sections !== prev.sections || s.hints !== prev.hints) writeDockPrefs(storage(), { open: s.open, sections: s.sections, hints: s.hints })
})

export const toggleOverlays = () => useDock.setState((s) => ({ hidden: !s.hidden }))

/** H toggles every viewport overlay (not while typing, and not with a modifier, so it never clashes with 1/2/3/P/Esc). */
export function useOverlayShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'h' || e.key === 'H') toggleOverlays()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Classes for anything floating over the view: translucent, light blur, faded while the camera moves. */
export function useOverlayLook() {
  const orbiting = useDock((s) => s.orbiting)
  const reduced = useStore((s) => s.reducedMotion)
  return `bg-white/80 backdrop-blur-md ${reduced ? '' : 'transition-opacity duration-200'} ${orbiting ? 'opacity-35' : 'opacity-100'}`
}

export interface DockSection {
  id: string
  title: string
  /** One line shown in the section header, so a closed section still says its state. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

function Section({ s }: { s: DockSection }) {
  const open = useDock((d) => d.sections[s.id] ?? !!s.defaultOpen)
  const id = `vp-dock-${s.id}`
  return (
    <section className="border-t border-line/70 first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls={id}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-meta hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => useDock.setState((d) => ({ sections: { ...d.sections, [s.id]: !open } }))}>
        {open ? <ChevronDown size={13} aria-hidden className="shrink-0" /> : <ChevronRight size={13} aria-hidden className="shrink-0" />}
        <span className="font-semibold text-ink">{s.title}</span>
        {s.summary && <span className="ml-auto truncate pl-2 text-meta text-slate-600">{s.summary}</span>}
      </button>
      <div id={id} hidden={!open} className="px-2.5 pb-2.5">{s.children}</div>
    </section>
  )
}

/**
 * The dock itself: a header (title, hide overlays, collapse), an optional dismissible hint, then the sections.
 * Collapsed, it is a slim tab on the right edge (icon + word). `anchored`: Real Vancouver's Vista layout, where the
 * "Layers" button in the top-right column opens and closes it, so it opens under that column and has no tab of its own.
 */
export function ViewportDock({ sections, hint, label = 'Layers & context', anchored = false }: { sections: DockSection[]; hint?: { id: string; content: ReactNode }; label?: string; anchored?: boolean }) {
  const { open: docked, menu, hidden, hints } = useDock()
  const open = anchored ? menu : docked
  const look = useOverlayLook()
  if (hidden) return null
  if (!open && anchored) return null
  if (!open) {
    return (
      <button type="button" aria-expanded={false} aria-controls="vp-dock" onClick={() => useDock.setState({ open: true })}
        className={`glass absolute right-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-md border border-r-0 border-line px-1.5 py-2.5 text-control font-medium text-ink shadow-sm hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${look}`}
        title="Show the layers panel">
        <Layers size={15} aria-hidden />
        <span style={{ writingMode: 'vertical-rl' }}>Layers</span>
      </button>
    )
  }
  // Over the city the backdrop can be as dark as #e5e6e7: slate-500 and muted grey text (~3.8:1 there) read as slate-600 (>= 6:1).
  return (
    <aside id="vp-dock" aria-label={label} data-nav-occlude="right"
      className={`vp-dock absolute ${anchored ? 'right-2.5 top-[14rem] max-h-[calc(100%-14.75rem)]' : 'right-3 top-[5rem] max-h-[calc(100%-5.75rem)]'} z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-line/80 text-meta text-slate-600 shadow-sm [&_.text-muted]:text-slate-600 [&_.text-slate-500]:text-slate-600 ${look}`}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line/80 px-2.5 py-1.5">
        <Layers size={14} aria-hidden className="text-ink" />
        <b className="text-ink">{label}</b>
        <button type="button" onClick={toggleOverlays} title="Hide every overlay for a clean view (H)"
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-meta text-slate-700 hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <EyeOff size={12} aria-hidden />Hide overlays <kbd className="rounded border border-line px-1 font-sans">H</kbd>
        </button>
        <button type="button" aria-expanded={true} aria-controls="vp-dock" aria-label="Collapse the layers panel" title="Collapse"
          onClick={() => useDock.setState(anchored ? { menu: false } : { open: false })}
          className="rounded p-1 text-slate-700 hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <PanelRightClose size={14} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hint && !hints[hint.id] && (
          <div className="m-2 flex items-start gap-2 rounded border border-accent/30 bg-white/70 p-2" role="note">
            <div className="flex-1">{hint.content}</div>
            <button type="button" aria-label="Dismiss this note" title="Dismiss"
              onClick={() => useDock.setState((d) => ({ hints: { ...d.hints, [hint.id]: true } }))}
              className="rounded p-0.5 text-slate-700 hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <X size={12} aria-hidden />
            </button>
          </div>
        )}
        {sections.map((s) => <Section key={s.id} s={s} />)}
      </div>
    </aside>
  )
}

/** Shown only while overlays are hidden: the way back for mouse users (H for the keyboard). */
export function ShowOverlaysButton() {
  const hidden = useDock((s) => s.hidden)
  if (!hidden) return null
  return (
    <button type="button" onClick={toggleOverlays} title="Show the overlays again (H)"
      className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-line bg-white/70 px-2 py-1 text-meta text-slate-700 opacity-70 backdrop-blur-md hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <Eye size={12} aria-hidden />Show overlays <kbd className="rounded border border-line px-1 font-sans">H</kbd>
    </button>
  )
}
