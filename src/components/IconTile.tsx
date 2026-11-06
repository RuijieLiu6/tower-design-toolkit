// An icon with one or two key words under it; its full name and what it does show on hover or keyboard focus (Ruijie,
// 6 Nov: "only leave the icon shown and one or two key words … once the user hover their mouse over the icon, then
// reveal the functions in whole"). Used for the design tools (tools/ToolPanel.tsx) and the actions inside a tool (the
// Site tool's Replace, Combine, Upload, Next). The words under the icon should appear in `label`, so the visible text
// is part of the accessible name (WCAG 2.5.3, for voice control).
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from './icons'

const TIP_W = 248

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: LucideIcon
  /** One or two key words under the icon. */
  word: string
  /** Full name: the accessible name and the title of the hover panel. */
  label: string
  /** What it does, under the name in the hover panel (and the button's description for screen readers). */
  hint?: ReactNode
  /** Lit: the open tool, or a mode that is on. */
  active?: boolean
  /** The way on: filled even when not lit. */
  primary?: boolean
  /** 'md' for the design tools, 'sm' for the actions inside a tool. */
  size?: 'md' | 'sm'
  [data: `data-${string}`]: string | undefined
}

export default function IconTile({ icon: Icon, word, label, hint, active = false, primary = false, size = 'md', className = '', onClick, onKeyDown, ...rest }: Props) {
  const tipId = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // A click acts and puts the panel away until the pointer leaves; keyboard focus shows it at once.
  const quiet = useRef(false)
  const show = (delay: number) => { if (quiet.current) return; clearTimeout(timer.current); timer.current = setTimeout(() => setTip(true), delay) }
  const hide = () => { clearTimeout(timer.current); setTip(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!tip) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', hide, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('scroll', hide, true) }
  }, [tip])
  // Below the icon (above it near the bottom of the window), kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !btn.current) { setAt(null); return }
    const r = btn.current.getBoundingClientRect(), h = panel.current?.offsetHeight ?? 72
    const left = Math.min(Math.max(8, r.left + r.width / 2 - TIP_W / 2), window.innerWidth - TIP_W - 8)
    setAt({ left, top: r.bottom + 6 + h > window.innerHeight - 8 ? r.top - 6 - h : r.bottom + 6 })
  }, [tip])
  const lit = active || primary
  const box = size === 'md' ? 'h-9 w-9' : 'h-8 w-8'
  return (
    <>
      <button ref={btn} type="button" {...rest} aria-label={label} aria-describedby={hint ? tipId : undefined}
        onClick={(e) => { quiet.current = true; hide(); onClick?.(e) }} onKeyDown={onKeyDown}
        onMouseEnter={() => show(250)} onMouseLeave={() => { quiet.current = false; hide() }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) show(0) }} onBlur={hide}
        className={`group flex ${size === 'md' ? 'w-[4.25rem]' : 'w-[3.75rem]'} flex-col items-center gap-1 rounded-md px-1 pb-1 pt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${active ? 'bg-accent/[0.07]' : 'hover:bg-black/[0.04]'} ${className}`}>
        <span className={`flex ${box} items-center justify-center rounded-md ${lit ? 'bg-accent text-white' : 'bg-accent/10 text-accent group-hover:bg-accent/15'}`}><Icon size={size === 'md' ? 18 : 16} /></span>
        <span aria-hidden className={`w-full truncate text-center text-[11px] leading-tight ${active || primary ? 'font-semibold text-ink' : 'text-muted group-hover:text-ink'}`}>{word}</span>
      </button>
      {hint && <span id={tipId} hidden>{hint}</span>}
      {tip && createPortal(
        <div ref={panel} role="tooltip" style={{ position: 'fixed', left: at?.left ?? -9999, top: at?.top ?? -9999, width: TIP_W, zIndex: 1000 }}
          className="pointer-events-none rounded-lg border border-line bg-white px-3 py-2 text-left text-[11.5px] leading-snug text-ink shadow-lg">
          <div className="font-semibold">{label}</div>
          {hint && <div className="mt-0.5 text-muted">{hint}</div>}
        </div>, document.body)}
    </>
  )
}
