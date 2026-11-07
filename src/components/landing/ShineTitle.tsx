// The name on the first screen, drawn after spacetypegenerator.com/shine (Ruijie, 7 Nov: "you want to enter the site
// through clicking the Tower Design Toolkit in the center … make the text expand when the mouse interacts with it, and
// only when you click on the center of the expansion you will enter"; then: "create the spatial feeling of entering the
// site … remove the button of enter arrow but bring them in through the expansion of the text"). At rest the three words
// sit still in the middle. The name itself is the way in: a click on it flies the view forward through its light
// (Intro.tsx zooms in on the burst's heart), and the site arrives.
// As the pointer comes near, thin rays in the site's bright hues stream out of every letter's edge, away from one
// point at the heart of the name (leaning a little toward the pointer); the closer the pointer, the further the name
// spreads. A glass button at that point is the way in, and the only one. Drawn on one canvas, only while something changes; the name is
// also a real heading for screen readers, and the button is reachable by keyboard (focusing it opens the burst).
import { useEffect, useRef } from 'react'

const WORDS = ['TOWER', 'DESIGN', 'TOOLKIT']
/** The rays' hues (HSL), in bands round the centre: sky, coral, yellow, green, violet, pink, cyan. */
const RAY_HUES = [206, 14, 48, 140, 268, 330, 188]
const MAX_POINTS = 2200
/** Tight tracking on a canvas where the browser has it (Chromium, Firefox, Safari 17+), else none. */
const setTrack = (c: CanvasRenderingContext2D, v: string) => { if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = v }

interface Layout { font: string; size: number; track: string; lines: { text: string; x: number; y: number }[]; cx: number; cy: number; rx: number; ry: number }

export default function ShineTitle({ onEnter }: { onEnter: (heart: { x: number; y: number }) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const enter = useRef<HTMLButtonElement>(null)
  const focused = useRef(false)
  const heart = useRef({ x: 0, y: 0 })
  const opened = useRef<() => void>(() => {})

  useEffect(() => {
    const host = wrap.current, cv = canvas.current, btn = enter.current
    if (!host || !cv || !btn) return
    const ctx = cv.getContext('2d')!
    const ink = getComputedStyle(host).color || '#1f2328'
    const family = getComputedStyle(host).fontFamily || 'Inter, system-ui, sans-serif'
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || host.closest('[data-reduced="true"]') !== null
    let W = 0, H = 0, dpr = 1, L: Layout | null = null
    let pts: Float32Array = new Float32Array(0) // x, y, hue band
    let e = 0, target = 0, px = -1, py = -1, raf = 0, last = 0, alive = true, opening = false

    const layout = () => {
      W = host.clientWidth; H = host.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      const size = Math.max(52, Math.min(184, W * 0.13)), lh = size * 0.88
      const font = `600 ${size}px ${family}`
      const track = `${(-0.045 * size).toFixed(1)}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = font; setTrack(ctx, track)
      const top = H / 2 - (lh * WORDS.length) / 2 + lh * 0.5
      const lines = WORDS.map((text, i) => ({ text, x: W / 2, y: top + i * lh }))
      const width = Math.max(...WORDS.map((w) => ctx.measureText(w).width))
      L = { font, size, track, lines, cx: W / 2, cy: H / 2, rx: width / 2, ry: (lh * WORDS.length) / 2 }
      // Sample the letters' edges from an offscreen copy (CSS pixels).
      const off = document.createElement('canvas'); off.width = Math.max(1, Math.round(W)); off.height = Math.max(1, Math.round(H))
      const o = off.getContext('2d', { willReadFrequently: true })!
      o.font = font; setTrack(o, track); o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#000'
      for (const l of lines) o.fillText(l.text, l.x, l.y)
      const x0 = Math.max(0, Math.floor(L.cx - L.rx - 4)), y0 = Math.max(0, Math.floor(L.cy - L.ry - 4))
      const w = Math.min(off.width - x0, Math.ceil(L.rx * 2 + 8)), h = Math.min(off.height - y0, Math.ceil(L.ry * 2 + 8))
      if (w <= 0 || h <= 0) { pts = new Float32Array(0); return }
      const data = o.getImageData(x0, y0, w, h).data
      const edge: number[] = []
      const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3])
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (a(x, y) < 128) continue
        if (a(x - 2, y) < 128 || a(x + 2, y) < 128 || a(x, y - 2) < 128 || a(x, y + 2) < 128) edge.push(x0 + x, y0 + y)
      }
      const n = edge.length / 2, step = Math.max(1, n / MAX_POINTS)
      const out: number[] = []
      for (let k = 0; k < n; k += step) { const i = Math.floor(k) * 2; out.push(edge[i], edge[i + 1], 0) }
      pts = new Float32Array(out)
    }

    const draw = () => {
      if (!L) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      // The burst's heart: the name's centre, leaning a little toward the pointer.
      const vx = L.cx + (px >= 0 ? (px - L.cx) * 0.12 : 0), vy = L.cy + (py >= 0 ? (py - L.cy) * 0.12 : 0)
      if (e > 0.01 && pts.length) {
        // Outward (Ruijie, 7 Nov: "the reverse … span them out"): each ray leaves its letter away from the heart of the
        // name, longer the further the letter sits from it, so the whole name spreads out into light.
        const reach = e * 1.5
        ctx.lineWidth = 1.3; ctx.globalAlpha = 0.62; ctx.lineCap = 'round'
        for (let band = 0; band < RAY_HUES.length; band++) {
          ctx.beginPath()
          for (let i = 0; i < pts.length; i += 3) {
            const x = pts[i], y = pts[i + 1]
            const ang = Math.atan2(y - vy, x - vx)
            if (Math.floor(((ang + Math.PI) / (2 * Math.PI)) * RAY_HUES.length * 2) % RAY_HUES.length !== band) continue
            ctx.moveTo(x, y); ctx.lineTo(x + (x - vx) * reach, y + (y - vy) * reach)
          }
          ctx.strokeStyle = `hsl(${RAY_HUES[band]} 85% 58%)`
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1 // the letters stay solid over their light, so the name always reads
      ctx.fillStyle = ink; ctx.font = L.font; setTrack(ctx, L.track); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const l of L.lines) ctx.fillText(l.text, l.x, l.y)
      ctx.globalAlpha = 1
      // The way in sits at the heart of the burst, and shows as it opens.
      heart.current = { x: vx, y: vy }
      // The way in is the name itself: the button lies over it, unseen.
      btn.style.left = `${(L.cx - L.rx).toFixed(1)}px`; btn.style.top = `${(L.cy - L.ry).toFixed(1)}px`
      btn.style.width = `${(L.rx * 2).toFixed(1)}px`; btn.style.height = `${(L.ry * 2).toFixed(1)}px`
    }

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      const goal = focused.current || opening ? 1 : target
      e = still ? goal : e + (goal - e) * Math.min(1, dt * 5)
      draw()
      raf = alive && Math.abs(goal - e) > 0.002 ? requestAnimationFrame(tick) : 0
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick) } }

    // Closer to the name → further the rays reach (full inside the name, none past half its size again).
    const onMove = (ev: PointerEvent) => {
      if (!L) return
      const r = host.getBoundingClientRect()
      px = ev.clientX - r.left; py = ev.clientY - r.top
      const dx = (px - L.cx) / (L.rx * 1.5), dy = (py - L.cy) / (L.ry * 1.5)
      target = Math.max(0, Math.min(1, 1.35 - Math.hypot(dx, dy)))
      kick()
    }
    const onLeave = () => { target = 0; px = py = -1; kick() }
    const section = host.parentElement ?? host
    section.addEventListener('pointermove', onMove)
    section.addEventListener('pointerdown', onMove)
    section.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(() => { layout(); draw() })
    void document.fonts?.ready.then(() => { if (alive) { layout(); draw() } })
    layout(); draw()
    ro.observe(host)
    const kickFocus = () => kick()
    opened.current = () => { opening = true; kick() }
    btn.addEventListener('focus', kickFocus); btn.addEventListener('blur', kickFocus)
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect()
      section.removeEventListener('pointermove', onMove); section.removeEventListener('pointerdown', onMove); section.removeEventListener('pointerleave', onLeave)
      btn.removeEventListener('focus', kickFocus); btn.removeEventListener('blur', kickFocus)
    }
  }, [])

  return (
    <div ref={wrap} className="pointer-events-none absolute inset-0 text-ink">
      <h1 id="intro-title" className="sr-only">Tower Design Toolkit</h1>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <button ref={enter} type="button" onClick={() => { opened.current(); onEnter(heart.current) }} data-testid="intro-enter" aria-label="Enter the Tower Design Toolkit" title="Enter"
        onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false }}
        className="pointer-events-auto absolute left-0 top-0 cursor-pointer rounded-xl bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-accent/60" />
    </div>
  )
}
