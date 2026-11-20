// The interactive tour's card (lib/tour.ts): a ring around the element the step is about, and a card at the bottom
// with one thing to do. The app stays live under it; the card watches the app's state and moves on by itself when
// the thing is done ("Show me" does it instead). Keyboard: → or Enter next, ← back, Esc ends the tour. No animation
// under reduced motion.
import { ArrowLeft, ArrowRight, Check, Wand2, X } from './icons'
import { useEffect, useRef, useState } from 'react'
import { useTour } from '../lib/tour'
import { snapshot, TOUR, type Snap } from '../lib/tourSteps'
import { useStore } from '../store'

const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
/** The page settles after a step moves the app (project, phase, route) before the step's starting state is taken. */
const SETTLE_MS = 600
/** A done step moves on by itself after this long, so the person sees the tick. */
const ADVANCE_MS = 900

export default function TourOverlay() {
  const { active, step, go, stop } = useTour()
  const reducedSetting = useStore((s) => s.reducedMotion)
  const reduced = reducedSetting || prefersReduced()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [done, setDone] = useState(false)
  const snap = useRef<Snap | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const s = TOUR[step]
  const last = step === TOUR.length - 1

  // The target can appear late (lazy pages, the 3D view): measure until it is there, and keep it in view. The same
  // clock takes the step's starting state once the page has settled, then watches for the thing to be done.
  useEffect(() => {
    if (!active) return
    setRect(null); setDone(false); snap.current = null
    const opened = performance.now()
    let advance = 0
    const tick = () => {
      const el = s.target ? document.querySelector(s.target) : null
      const r = el?.getBoundingClientRect()
      setRect(r && r.width > 0 && r.height > 0 ? r : null)
      if (!s.done) return
      if (!snap.current) { if (performance.now() - opened >= SETTLE_MS) snap.current = snapshot(); return }
      if (!advance && s.done(snap.current)) {
        setDone(true)
        advance = window.setTimeout(() => (last ? undefined : go(step + 1)), ADVANCE_MS)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    window.addEventListener('resize', tick)
    return () => { window.clearInterval(id); window.clearTimeout(advance); window.removeEventListener('resize', tick) }
  }, [active, step, s, go, last])

  useEffect(() => { if (active) next.current?.focus() }, [active, step])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(step + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(step - 1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, step, go, stop])

  if (!active) return null
  const pad = 6
  const motion = reduced ? 'none' : 'top 250ms ease, left 250ms ease, width 250ms ease, height 250ms ease'

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-testid="tour" data-tour-step={s.id} data-tour-done={done || undefined}>
      {rect && (
        <div className={`absolute rounded-lg ring-2 ring-offset-2 ${done ? 'ring-emerald-500' : 'ring-accent'}`} aria-hidden
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.18)', transition: motion }} />
      )}
      <div role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="glass pointer-events-auto absolute bottom-6 left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line bg-panel p-4 text-ink shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-meta font-semibold text-accent">Tour · {step + 1} of {TOUR.length}</p>
            <h2 id="tour-title" className="mt-0.5 text-sm font-semibold">{s.title}</h2>
          </div>
          <button onClick={stop} aria-label="End the tour" className="rounded p-1 text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={16} /></button>
        </div>
        <p className={`mt-2 flex items-start gap-1.5 text-[13px] font-medium leading-snug ${done ? 'text-emerald-700' : 'text-ink'}`} data-testid="tour-ask" aria-live="polite">
          {done ? <Check size={15} className="mt-0.5 shrink-0" aria-hidden /> : <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />}
          <span>{done ? 'Done.' : s.ask}</span>
        </p>
        <p id="tour-body" className="mt-1 text-[12px] leading-relaxed text-muted">{s.body}</p>
        <div className="mt-3 flex items-center gap-2 whitespace-nowrap">
          <div className="flex gap-1" aria-hidden>
            {TOUR.map((t, k) => <span key={t.id} className={`h-1.5 rounded-full ${k === step ? 'w-4 bg-accent' : k < step ? 'w-1.5 bg-accent/40' : 'w-1.5 bg-slate-300'}`} />)}
          </div>
          <button onClick={stop} className="ml-auto rounded-md px-2 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">Skip tour</button>
          {s.doIt && !done && (
            <button onClick={() => s.doIt?.()} data-testid="tour-show-me"
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"><Wand2 size={13} aria-hidden />Show me</button>
          )}
          <button onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step"
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs outline-none hover:border-accent disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={13} aria-hidden />Back</button>
          <button ref={next} onClick={() => (last ? stop() : go(step + 1))} data-testid="tour-next"
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {last ? 'Start designing' : s.done && !done ? 'Skip step' : 'Next'}{!last && <ArrowRight size={13} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}
