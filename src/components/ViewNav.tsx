// The viewport's navigation area (Milestone 1, 9 Nov: "a compact, consistent navigation area … the resting interface should
// remain visually quiet. Essential actions should be recognizable without opening a large panel"). One View button that
// says what the view shows (City, Neighbourhood, Site, Tower, Plan, Viewpoint) and opens the view commands, each with its
// key and, when it cannot run, the reason under it; + / − zoom; and, when the site is out of view, a small pointer on the
// view's edge that frames it. Keys work while the focus is on the page or the model, never while typing or in a dialog.
// Camera only: how the model is drawn (View: Geometry / Building use / Analysis / Materials) and which layers show
// (Viewcone, Names, Layers) stay separate controls.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useStore } from '../store'
import { useVistaLook } from '../lib/vistaLook'
import { SCALE_LABEL, availability, clearHome, describe, hasSavedHome, runNav, setHome, useNav, zoomBy, type NavCommand } from '../lib/viewNav'
import { Building2, Crosshair, Expand, Home, Locate, Map as MapIcon, Maximize, Mountain, Navigation } from './icons'

const ITEMS: { id: NavCommand; label: (vtc: boolean) => string; key: string; keyLabel: string; icon: typeof Home }[] = [
  { id: 'site', label: () => 'Frame site', key: 's', keyLabel: 'S', icon: Crosshair },
  { id: 'selection', label: () => 'Frame selection', key: '.', keyLabel: '.', icon: Maximize },
  { id: 'tower', label: () => 'Frame tower', key: 't', keyLabel: 'T', icon: Building2 },
  { id: 'neighbourhood', label: () => 'Neighbourhood', key: 'n', keyLabel: 'N', icon: Locate },
  { id: 'city', label: (vtc) => (vtc ? 'Context overview' : 'City overview'), key: 'c', keyLabel: 'C', icon: Mountain },
  { id: 'plan', label: () => 'Plan view', key: '7', keyLabel: '7', icon: MapIcon },
  { id: 'home', label: () => 'Home', key: 'Home', keyLabel: 'Home', icon: Home },
]
const inPlan = () => (useStore.getState().project === 'city' ? useVistaLook.getState().mode === 'plan' : useNav.getState().plan)

/** The keys, on the page (not in a field, a menu or a dialog). */
function useNavKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const onPage = !t || t === document.body || t.tagName === 'CANVAS' || !!t.closest?.('[data-viewport]')
      if (!onPage || t?.closest?.('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]')) return
      if (document.querySelector('[aria-modal="true"]')) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const item = ITEMS.find((i) => i.key === k)
      if (!item) return
      e.preventDefault()
      runNav(item.id === 'plan' && inPlan() ? '3d' : item.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The View button and its menu. `box` styles it like the controls around it (Vista's boxes in Real Vancouver). */
export function ViewMenu({ box, className = '' }: { box?: CSSProperties; className?: string }) {
  const vtc = useStore((s) => s.project === 'vtc')
  const scale = useNav((s) => s.scale), width = useNav((s) => s.widthM), status = useNav((s) => s.status)
  const vistaPlan = useVistaLook((s) => s.mode === 'plan'), navPlan = useNav((s) => s.plan)
  const plan = vtc ? navPlan : vistaPlan
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useNavKeys()
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', away, true)
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const av = open ? availability() : null
  const label = scale === 'city' && vtc ? 'Context' : SCALE_LABEL[scale]
  const say = describe(scale, width, vtc)
  const run = (id: NavCommand) => { setOpen(false); runNav(id === 'plan' && plan ? '3d' : id) }
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); wrap.current?.querySelector<HTMLElement>('[data-testid="nav-menu"]')?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
  }
  const home = hasSavedHome()
  return (
    <div ref={wrap} className={`relative ${className}`} onKeyDown={open ? onMenuKey : undefined}>
      <button type="button" data-testid="nav-menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={`View: ${say}. Open the view commands`} title={`${say}. Frame the site, a selection or the tower; neighbourhood, overview, plan, Home`}
        className="flex h-[33px] items-center gap-1.5 rounded-lg px-2.5 text-control font-medium outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent" style={box}>
        <Navigation size={14} aria-hidden />
        <span data-testid="nav-scale" data-scale={scale}>{label}</span>
        <span aria-hidden className="text-meta opacity-70">▾</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{status}</span>
      {open && av && (
        <div role="menu" aria-label="View commands" className="absolute right-0 top-full z-30 mt-1.5 w-[17.5rem] rounded-xl border border-line bg-panel p-1.5 text-ink shadow-float">
          <p className="px-2 pb-1.5 pt-0.5 text-meta text-muted">{say}</p>
          {ITEMS.map((it) => {
            const a = av[it.id], id = it.id === 'plan' && plan ? '3d' : it.id
            const text = it.id === 'plan' && plan ? '3D view' : it.label(vtc)
            const Icon = it.id === 'plan' && plan ? Expand : it.icon
            return (
              <button key={it.id} type="button" role="menuitem" data-nav={id} disabled={!a.ok} onClick={() => run(it.id)} aria-keyshortcuts={it.keyLabel}
                aria-label={`${text}${a.ok ? '' : `: ${a.reason}`}`}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:hover:bg-transparent">
                <Icon size={15} aria-hidden className={`mt-0.5 shrink-0 ${a.ok ? '' : 'opacity-40'}`} />
                <span className="min-w-0 flex-1">
                  <span className={a.ok ? '' : 'text-muted'}>{text}</span>
                  {!a.ok && <span className="block text-meta text-muted">{a.reason}</span>}
                </span>
                <kbd className="shrink-0 rounded border border-line px-1 font-sans text-meta text-muted">{it.keyLabel}</kbd>
              </button>
            )
          })}
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" data-nav="set-home" onClick={() => { setOpen(false); setHome() }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
            <Home size={15} aria-hidden className="shrink-0 opacity-70" /><span className="flex-1">Set this view as Home</span>
          </button>
          {home && <button type="button" role="menuitem" data-nav="clear-home" onClick={() => { setOpen(false); clearHome() }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-meta text-muted outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
            <span className="w-[15px]" /><span className="flex-1">Reset Home to the site from the south</span>
          </button>}
          <p className="px-2 pb-0.5 pt-1 text-meta text-muted">Drag to orbit, right-drag to pan, scroll to zoom. On the model: arrows pan, Shift + arrows orbit, + / − zoom.</p>
        </div>
      )}
    </div>
  )
}

/** + / − zoom (about the orbit target; stops any move in progress). */
export function ZoomButtons({ box, words = true }: { box?: CSSProperties; words?: boolean }) {
  const btn = 'flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-control outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent'
  return (
    <>
      <button type="button" onClick={() => zoomBy(-0.35)} aria-label="Zoom in" title="Zoom in (+ on the model)" className={btn} style={box}><span aria-hidden className="w-3 text-center text-[15px] leading-none">+</span>{words && 'Zoom in'}</button>
      <button type="button" onClick={() => zoomBy(0.35)} aria-label="Zoom out" title="Zoom out (− on the model)" className={btn} style={box}><span aria-hidden className="w-3 text-center text-[15px] leading-none">−</span>{words && 'Zoom out'}</button>
    </>
  )
}

/** When the site is out of view: a pointer on the edge of the view, towards it; a click frames it. */
export function SitePointer() {
  const off = useNav((s) => s.offscreen)
  if (!off) return null
  return (
    <button type="button" data-testid="site-pointer" onClick={() => runNav('site')} title="Your site is out of view: frame it (S)"
      className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-white bg-[#0084a7] py-0.5 pl-1 pr-2 text-meta font-semibold text-white shadow-float outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ left: off.x, top: off.y }}>
      <span aria-hidden className="inline-block" style={{ transform: `rotate(${off.angle}deg)` }}>➜</span>Site
    </button>
  )
}
