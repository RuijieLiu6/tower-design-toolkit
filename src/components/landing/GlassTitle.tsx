// The name on the cover, seen through reeded glass (Ruijie, 7 Nov, after a type reference: "create this effect that the
// text looks like it is covered with glass, and once you click on it it looks more clear"). The three words in ink sit
// behind a sheet of fluted glass: every reed shifts and softens its own slice of the letters, with a warm and a cool
// fringe where the glass splits the light, and the sheet's reeds catch a little white. Pointing at it clears the glass a
// little; a click clears it, the name comes up sharp, and the cover flies into the site (Intro.tsx). The name is a
// button (Enter goes in). Drawn as one SVG filter whose strength is turned down frame by frame. Reduced motion: still
// glass, an instant switch, and the hint in words.
import { useEffect, useRef, useState } from 'react'

const LINES = ['TOWER', 'DESIGN', 'TOOLKIT']
const REED = 24 // reed width, user units (1000 across)
const STRENGTH = 34 // displacement at rest, user units
// A sawtooth across each reed in the red channel (green held at the midpoint): the displacement map of fluted glass.
const REEDS = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='600'><defs><linearGradient id='g'><stop offset='0' stop-color='rgb(0,128,128)'/><stop offset='1' stop-color='rgb(255,128,128)'/></linearGradient><pattern id='p' width='${REED}' height='600' patternUnits='userSpaceOnUse'><rect width='${REED}' height='600' fill='url(#g)'/></pattern></defs><rect width='1000' height='600' fill='url(#p)'/></svg>`)}`

export default function GlassTitle({ onEnter, still }: { onEnter: (heart: { x: number; y: number }) => void; still: boolean }) {
  const btn = useRef<HTMLButtonElement>(null)
  const ink = useRef<SVGFEDisplacementMapElement>(null)
  const warm = useRef<SVGFEDisplacementMapElement>(null)
  const cool = useRef<SVGFEDisplacementMapElement>(null)
  const soft = useRef<SVGFEGaussianBlurElement>(null)
  const sheet = useRef<SVGGElement>(null)
  const [going, setGoing] = useState(false)
  // How clear the glass is: 0 = reeded, 1 = gone. Eased toward its goal (pointer near: a little clearer; clicked: clear).
  const clarity = useRef({ now: 0, goal: 0, raf: 0, last: 0 })

  const paint = (c: number) => {
    const s = STRENGTH * (1 - c)
    ink.current?.setAttribute('scale', s.toFixed(2))
    warm.current?.setAttribute('scale', (s * 1.3).toFixed(2))
    cool.current?.setAttribute('scale', (s * 0.7).toFixed(2))
    soft.current?.setAttribute('stdDeviation', `${(3.4 * (1 - c)).toFixed(2)} ${(0.8 * (1 - c)).toFixed(2)}`)
    if (sheet.current) sheet.current.style.opacity = String(1 - c)
  }
  const ease = (goal: number) => {
    const k = clarity.current
    k.goal = goal
    if (still) { k.now = goal; paint(goal); return }
    if (k.raf) return
    k.last = performance.now()
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - k.last) / 1000); k.last = t
      k.now += (k.goal - k.now) * Math.min(1, dt * (k.goal === 1 ? 9 : 5))
      if (Math.abs(k.goal - k.now) < 0.003) k.now = k.goal
      paint(k.now)
      k.raf = k.now === k.goal ? 0 : requestAnimationFrame(step)
    }
    k.raf = requestAnimationFrame(step)
  }
  useEffect(() => { paint(0); const k = clarity.current; return () => cancelAnimationFrame(k.raf) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    if (going) return
    setGoing(true)
    ease(1)
    const r = btn.current!.getBoundingClientRect(), host = btn.current!.offsetParent?.getBoundingClientRect()
    const heart = { x: r.left + r.width / 2 - (host?.left ?? 0), y: r.top + r.height / 2 - (host?.top ?? 0) }
    // The glass clears first, then the view flies in.
    setTimeout(() => onEnter(heart), still ? 0 : 420)
  }

  const size = 200, lead = 176, base = 300 - lead + size * 0.36
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <h1 id="intro-title" className="sr-only">Tower Design Toolkit</h1>
      <button ref={btn} type="button" onClick={go} data-testid="intro-enter" aria-label="Enter the Tower Design Toolkit"
        onPointerEnter={() => { if (!going) ease(0.3) }} onPointerLeave={() => { if (!going) ease(0) }}
        onFocus={() => { if (!going) ease(0.3) }} onBlur={() => { if (!going) ease(0) }}
        className="pointer-events-auto cursor-pointer select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        <svg viewBox="0 0 1000 600" aria-hidden className="block h-auto w-[min(88vw,1080px)] overflow-visible font-sans">
          <defs>
            <filter id="gt-reeded" filterUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600" colorInterpolationFilters="sRGB">
              <feImage href={REEDS} x="0" y="0" width="1000" height="600" preserveAspectRatio="none" result="reeds" />
              <feGaussianBlur ref={soft} in="SourceGraphic" stdDeviation="3.4 0.8" result="soft" />
              {/* each colour bent a little differently: the fringes */}
              <feDisplacementMap ref={warm} in="soft" in2="reeds" scale={STRENGTH * 1.3} xChannelSelector="R" yChannelSelector="G" result="dWarm" />
              <feFlood floodColor="hsl(28 95% 56%)" floodOpacity="0.95" />
              <feComposite in2="dWarm" operator="in" result="warmEdge" />
              <feDisplacementMap ref={cool} in="soft" in2="reeds" scale={STRENGTH * 0.7} xChannelSelector="R" yChannelSelector="G" result="dCool" />
              <feFlood floodColor="hsl(212 90% 56%)" floodOpacity="0.95" />
              <feComposite in2="dCool" operator="in" result="coolEdge" />
              <feDisplacementMap ref={ink} in="soft" in2="reeds" scale={STRENGTH} xChannelSelector="R" yChannelSelector="G" result="seen" />
              <feMerge>
                <feMergeNode in="warmEdge" />
                <feMergeNode in="coolEdge" />
                <feMergeNode in="seen" />
              </feMerge>
            </filter>
            {/* the sheet's reeds catching the light */}
            <linearGradient id="gt-reed-light">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <pattern id="gt-reed-sheet" width={REED} height="600" patternUnits="userSpaceOnUse">
              <rect width={REED} height="600" fill="url(#gt-reed-light)" />
            </pattern>
          </defs>
          <text textAnchor="middle" fontSize={size} fontWeight={600} letterSpacing={-0.045 * size} fill="#1f2328" filter="url(#gt-reeded)">
            {LINES.map((l, i) => <tspan key={l} x={500} y={base + i * lead}>{l}</tspan>)}
          </text>
          <g ref={sheet} style={{ opacity: 1 }}>
            <rect x="40" y="18" width="920" height="564" rx="12" fill="url(#gt-reed-sheet)" />
            <rect x="40" y="18" width="920" height="564" rx="12" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" />
          </g>
        </svg>
      </button>
      {still && <p className="pointer-events-none mt-6 text-[14px] text-muted">Click the name to enter</p>}
    </div>
  )
}
