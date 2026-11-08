// Guided-tour overlay (lib/tour.ts): a card at the bottom of the screen and a ring around the element the step is
// about. Keyboard: → or Enter next, ← back, Esc ends the tour. No animation under reduced motion.
import { ArrowLeft, ArrowRight, X } from './icons'
import { useEffect, useRef, useState } from 'react'
import { TOUR, useTour } from '../lib/tour'
import { useStore } from '../store'

const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export default function TourOverlay() {
  const { active, step, go, stop } = useTour()
  const reducedSetting = useStore((s) => s.reducedMotion)
  const reduced = reducedSetting || prefersReduced()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const s = TOUR[step]

  // The target can appear late (lazy pages, the 3D view): measure until it is there, and keep it in view.
  useEffect(() => {
    if (!active) return
    setRect(null)
    const measure = () => {
      const el = s.target ? document.querySelector(s.target) : null
      const r = el?.getBoundingClientRect()
      setRect(r && r.width > 0 && r.height > 0 ? r : null)
    }
    measure()
    const id = window.setInterval(measure, 300)
    window.addEventListener('resize', measure)
    return () => { window.clearInterval(id); window.removeEventListener('resize', measure) }
  }, [active, step, s.target])

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
  const last = step === TOUR.length - 1
  const pad = 6
  const motion = reduced ? 'none' : 'top 250ms ease, left 250ms ease, width 250ms ease, height 250ms ease'

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {rect ? (
        <div className="absolute rounded-lg ring-2 ring-accent ring-offset-2" aria-hidden
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.32)', transition: motion }} />
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,23,42,0.22)]" aria-hidden />
      )}
      <div role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="glass pointer-events-auto absolute bottom-6 left-1/2 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line bg-panel p-4 text-ink shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-meta font-semibold text-accent">Tour · {step + 1} of {TOUR.length}</p>
            <h2 id="tour-title" className="mt-0.5 text-sm font-semibold">{s.title}</h2>
          </div>
          <button onClick={stop} aria-label="End the tour" className="rounded p-1 text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={16} /></button>
        </div>
        <p id="tour-body" className="mt-1.5 text-[12.5px] leading-relaxed text-ink/85">{s.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {TOUR.map((t, k) => <span key={t.id} className={`h-1.5 rounded-full ${k === step ? 'w-4 bg-accent' : 'w-1.5 bg-slate-300'}`} />)}
          </div>
          <button onClick={stop} className="ml-auto rounded-md px-2 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">Skip tour</button>
          <button onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step"
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs outline-none hover:border-accent disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft size={13} aria-hidden />Back</button>
          <button ref={next} onClick={() => (last ? stop() : go(step + 1))}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            {last ? 'Finish' : 'Next'}{!last && <ArrowRight size={13} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  )
}
