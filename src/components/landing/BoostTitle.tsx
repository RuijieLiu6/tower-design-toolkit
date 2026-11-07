// The name on the cover, after spacetypegenerator.com/boost (Ruijie, 7 Nov: "too much going on in the cover page …
// use this one and make the text expand quickly two times that hint the users to double click on it to enter"). At rest
// the three words sit still in the middle. Now and then the name gives two quick boosts, coloured echoes leaping out
// behind it in the site's hues, the rhythm of a double click; a single click gives one boost back; a double click
// boosts all the way and the cover flies into the site (Intro.tsx). Keyboard: the name is a button, Enter goes in.
// Reduced motion: no boosts, and the hint is said in words instead.
import { useEffect, useRef } from 'react'

const WORDS = ['Tower', 'Design', 'Toolkit']
/** The echoes, back to front, blending violet → sky → green → coral: enough layers to read as one extrusion. */
const STOPS: [number, number, number][] = [[268, 75, 62], [206, 85, 55], [140, 60, 46], [14, 88, 60]]
const ECHOES = Array.from({ length: 12 }, (_, i) => {
  const t = (i / 11) * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(t)), u = t - k
  const [h0, s0, l0] = STOPS[k], [h1, s1, l1] = STOPS[k + 1]
  return `hsl(${(h0 + (h1 - h0) * u).toFixed(0)} ${(s0 + (s1 - s0) * u).toFixed(0)}% ${(l0 + (l1 - l0) * u).toFixed(0)}%)`
})
const HINT_EVERY = 6500

export default function BoostTitle({ onEnter, still }: { onEnter: (heart: { x: number; y: number }) => void; still: boolean }) {
  const btn = useRef<HTMLButtonElement>(null)
  const echoes = useRef<(HTMLSpanElement | null)[]>([])
  const front = useRef<HTMLSpanElement>(null)
  const boost = useRef<(peaks: number[], hold?: boolean) => void>(() => {})
  const entering = useRef(false)

  useEffect(() => {
    if (still) return
    let raf = 0, start = 0, peaks: number[] = [], hold = false, alive = true
    // b(t): a quick rise and fall for each peak (0.32 s each), one after another; held at the end when entering.
    const DUR = 320
    const level = (t: number) => {
      const i = Math.floor(t / DUR)
      if (i >= peaks.length) return hold ? peaks[peaks.length - 1] : 0
      const u = (t - i * DUR) / DUR, p = peaks[i]
      return hold && i === peaks.length - 1 ? p * Math.min(1, u * 2.2) : p * Math.sin(Math.PI * u) ** 0.8
    }
    const paint = (b: number) => {
      echoes.current.forEach((el, k) => {
        if (!el) return
        const depth = ECHOES.length - k // the back echo leaps furthest
        el.style.transform = `scale(${(1 + b * depth * 0.02).toFixed(4)})`
        el.style.opacity = b > 0.004 ? '1' : '0'
      })
      if (front.current) front.current.style.transform = `scale(${(1 + b * 0.035).toFixed(4)})`
    }
    const tick = (t: number) => {
      if (!alive) return
      const dt = t - start
      paint(level(dt))
      raf = dt < peaks.length * DUR || hold ? requestAnimationFrame(tick) : 0
      if (!raf) paint(0)
    }
    boost.current = (p, h = false) => { cancelAnimationFrame(raf); peaks = p; hold = h; start = performance.now(); raf = requestAnimationFrame(tick) }
    // The hint: two quick boosts after a moment, then now and then, until the visitor goes in.
    const hint = () => { if (!entering.current && document.visibilityState === 'visible') boost.current([0.7, 0.7]) }
    const first = setTimeout(hint, 1100)
    const again = setInterval(hint, HINT_EVERY)
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(first); clearInterval(again) }
  }, [still])

  const go = () => {
    if (entering.current) return
    entering.current = true
    boost.current([0.6, 1.4], true)
    const r = btn.current!.getBoundingClientRect(), host = btn.current!.offsetParent?.getBoundingClientRect()
    const heart = { x: r.left + r.width / 2 - (host?.left ?? 0), y: r.top + r.height / 2 - (host?.top ?? 0) }
    setTimeout(() => onEnter(heart), still ? 0 : 380)
  }

  const words = (k: string) => WORDS.map((w) => <span key={`${k}${w}`} className="block">{w}</span>)
  const type = 'text-center text-[clamp(3.25rem,13vw,11.5rem)] font-semibold uppercase leading-[0.88] tracking-[-0.045em]'
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <h1 id="intro-title" className="sr-only">Tower Design Toolkit</h1>
      <button ref={btn} type="button" data-testid="intro-enter" aria-label="Enter the Tower Design Toolkit (double-click, or press Enter)"
        onClick={(e) => { if (e.detail === 0) go(); else if (e.detail === 1) boost.current([0.55]) }}
        onDoubleClick={go}
        className="pointer-events-auto relative cursor-pointer select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        {ECHOES.map((c, k) => (
          <span key={k} ref={(el) => { echoes.current[k] = el }} aria-hidden className={`${type} pointer-events-none absolute inset-0 origin-center opacity-0 will-change-transform`} style={{ color: c }}>{words(`e${k}`)}</span>
        ))}
        <span ref={front} aria-hidden className={`${type} relative block origin-center text-ink will-change-transform`}>{words('f')}</span>
      </button>
      {still && <p className="pointer-events-none mt-6 text-[14px] text-muted">Double-click the name to enter</p>}
    </div>
  )
}
