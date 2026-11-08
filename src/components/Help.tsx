// A "?" that holds a tool's description (Ruijie, 5 Nov: "for any texts that is meant to be a description of a tool
// function, collapse them into a ? that has a pop up panel when you hover over it"). The panel opens on hover or keyboard
// focus, stays while the pointer is over it (links inside can be clicked), pins on click (touch), and closes on Esc. It
// is drawn in a portal at a fixed position, so scrolling panels never clip it. Screen readers get the same text as the
// button's description. Only descriptions go here: results, warnings, evidence flags, sources and consent notices stay
// on the page.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const WIDTH = 320
const GAP = 6

export default function Help({ children, label = 'What this does', className = '' }: { children: ReactNode; label?: string; className?: string }) {
  const id = `help-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 60) }
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (!pinned) setOpen(false) }, 160) }
  const close = () => { clearTimeout(timer.current); setOpen(false); setPinned(false) }

  // Below the "?" (above it when there is no room), kept inside the window.
  useLayoutEffect(() => {
    if (!open || !btn.current) { setAt(null); return }
    const r = btn.current.getBoundingClientRect(), h = panel.current?.offsetHeight ?? 120
    const left = Math.min(Math.max(8, r.left - 10), window.innerWidth - WIDTH - 8)
    const below = r.bottom + GAP, above = r.top - GAP - h
    setAt({ left, top: below + h > window.innerHeight - 8 && above > 8 ? above : below })
  }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const away = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) close() }
    const scroll = () => { if (!pinned) close() }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true); window.removeEventListener('scroll', scroll, true) }
  }, [open, pinned])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-describedby={id} aria-expanded={open} data-help=""
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.stopPropagation(); if (pinned) close(); else { setPinned(true); setOpen(true) } }}
        className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-meta font-semibold leading-none outline-none before:absolute before:-inset-1 before:content-[''] focus-visible:ring-2 focus-visible:ring-accent ${open ? 'border-accent bg-accent text-white' : 'border-line bg-white text-muted hover:border-accent hover:text-accent'} ${className}`}>?</button>
      <span id={id} hidden>{children}</span>
      {open && createPortal(
        <div ref={panel} role="tooltip" onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hide}
          style={{ position: 'fixed', left: at?.left ?? -9999, top: at?.top ?? -9999, width: WIDTH, zIndex: 1000 }}
          className="grid gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-left text-body font-normal normal-case tracking-normal text-ink shadow-lg">
          {children}
        </div>, document.body)}
    </>
  )
}
