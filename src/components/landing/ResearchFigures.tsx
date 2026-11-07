// Figures from the research site (https://ruijieliu6.github.io/vancouver-tower-toolbench/#research, same authors):
// the design loop, why one platform, and two designers' node graphs. Their own script and styles are served from
// public/research/ and load only when this section comes into view, so the first screen stays light.
import { useEffect, useRef, useState } from 'react'

const FIGS = [
  { id: 'tdtLoop', title: 'The design loop', caption: 'Five stages around one shared model. Enter at any stage, move either way, and step out to the drawing set when the scheme is ready.' },
  { id: 'tdtWhy', title: 'Why one platform', caption: 'The research still happens, but inside the massing loop while the form is cheap to change, not after a hand-off.' },
  { id: 'tdtC', title: 'Two designers, two graphs', caption: 'A form-first and a brief-first designer wire the same node library in different orders.' },
] as const
const RESEARCH = 'https://ruijieliu6.github.io/vancouver-tower-toolbench/#research'

declare global { interface Window { buildTdtDiagrams?: () => void; TDT_PICTO_BASE?: string } }

let loading: Promise<void> | null = null
function loadFigures(): Promise<void> {
  if (loading) return loading
  const base = `${import.meta.env.BASE_URL}research/`
  window.TDT_PICTO_BASE = `${base}picto/`
  loading = new Promise<void>((resolve, reject) => {
    for (const css of ['diagrams-base.css', 'diagrams-tdt.css']) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + css; document.head.append(l)
    }
    const s = document.createElement('script'); s.src = base + 'diagrams-tdt.js'; s.async = true
    s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('research figures did not load')) }
    document.head.append(s)
  })
  return loading
}

export default function ResearchFigures() {
  const host = useRef<HTMLElement>(null)
  const [shown, setShown] = useState<(typeof FIGS)[number]['id']>('tdtLoop')
  const [state, setState] = useState<'waiting' | 'ready' | 'failed'>('waiting')
  useEffect(() => {
    const el = host.current
    if (!el) return
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return
      io.disconnect()
      loadFigures().then(() => {
        window.buildTdtDiagrams?.()
        // The figures have parts to tap, so they are groups, not pictures (axe: nested-interactive).
        el.querySelectorAll('.tdthost svg[role="img"]').forEach((svg) => svg.setAttribute('role', 'group'))
        setState('ready')
      }).catch(() => setState('failed'))
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={host} aria-labelledby="research-title" className="tdt-research grid gap-3" data-testid="landing-research">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="research-title" className="text-[15px] font-semibold text-ink">How the toolkit runs</h2>
        <a href={RESEARCH} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline-offset-2 hover:underline">Read the full research</a>
      </div>
      <div role="tablist" aria-label="Figures" className="flex flex-wrap gap-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
          const i = FIGS.findIndex((f) => f.id === shown), next = FIGS[(i + (e.key === 'ArrowRight' ? 1 : FIGS.length - 1)) % FIGS.length]
          setShown(next.id); document.getElementById(`tab-${next.id}`)?.focus()
        }}>
        {FIGS.map((f) => (
          <button key={f.id} id={`tab-${f.id}`} type="button" role="tab" tabIndex={shown === f.id ? 0 : -1} aria-selected={shown === f.id} aria-controls={`fig-${f.id}`} onClick={() => setShown(f.id)}
            className={`rounded-full border px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent ${shown === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-panel text-muted hover:text-ink'}`}>{f.title}</button>
        ))}
      </div>
      {FIGS.map((f) => (
        <figure key={f.id} id={`fig-${f.id}`} role="tabpanel" aria-labelledby={`tab-${f.id}`} hidden={shown !== f.id} className="m-0 rounded-xl border border-line bg-panel p-3">
          {/* The research site's builder fills these two by id (diagram and its tap-for-details panel). */}
          <div id={f.id} className="v2host tdthost">{state === 'failed' && <p className="text-[13px] text-muted">The figure could not be drawn here. It is on the research site.</p>}</div>
          <div id={`${f.id}info`} className="mt-2 text-[13px] text-muted"><span>Tap a part of the figure to see what it does.</span></div>
          <figcaption className="mt-2 text-[12.5px] text-muted">{f.caption}</figcaption>
        </figure>
      ))}
      <p className="text-[11.5px] text-muted">Figures from the Tower Design Toolkit research site, with its pictograms. Drawn by the same team.</p>
    </section>
  )
}
