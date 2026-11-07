// The first screen of the tool (Ruijie, 7 Nov: "before the users get to the current page of the role selection, I want
// the actual landing page be only the name of the tool Tower Design Toolkit in the middle … make sure that the colour
// matches with the rest of the site, and … create different giant version of the icon that is flowing and you can drag
// them around", after spacetypegenerator.com/clutter). The name, giant, on the site's own backdrop; the toolkit's own
// icons (GlassIcon, the drawn tool icons first) drift around it, nudge each other, bounce off the edges, and can be
// picked up and thrown. One frame loop moves them by transform only, and stops while the intro is off screen. Under
// reduced motion they stay still (and can still be dragged). The name itself is the way in (GlassTitle.tsx).
// Quieter since (Ruijie, 7 Nov: "too much things going on in the cover page … the users could also get to explore the
// moveable nodes by accident"): fewer, smaller, lighter tiles that wander slowly round the edges, kept clear of the name,
// there to be bumped into and found out.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LucideIcon } from '../icons'
import GlassTitle from './GlassTitle'
import { BelowGrade, Cone, CorePlan, Sprout, TowerHeight, TowerOnSite, TowerSun } from '../icons'
import GlassIcon, { HUES } from '../GlassIcon'

const FLOAT: { icon: LucideIcon; hue: number; size: number }[] = [
  { icon: TowerOnSite, hue: HUES.sky, size: 112 }, { icon: TowerSun, hue: HUES.yellow, size: 92 }, { icon: TowerHeight, hue: HUES.coral, size: 84 },
  { icon: BelowGrade, hue: HUES.violet, size: 80 }, { icon: CorePlan, hue: HUES.indigo, size: 76 }, { icon: Cone, hue: HUES.cyan, size: 88 },
  { icon: Sprout, hue: HUES.green, size: 84 },
]

interface Body { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; held: boolean; px: number; py: number; pt: number; ox: number; oy: number }

/** A repeatable scatter (no Math.random at render, so the first frame is the same every visit). */
const rand = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s) }

export default function Intro({ onEnter, reduced = false }: { onEnter: () => void; reduced?: boolean }) {
  const [still] = useState(() => reduced || (typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  // Entering: the view flies forward into the heart of the name's light, then the site arrives (Landing.tsx).
  const [leaving, setLeaving] = useState<{ x: number; y: number } | null>(null)
  const enter = (heart: { x: number; y: number }) => {
    if (leaving) return
    if (still) { onEnter(); return }
    setLeaving(heart)
    setTimeout(onEnter, 820)
  }
  const box = useRef<HTMLElement>(null)
  const els = useRef<(HTMLDivElement | null)[]>([])
  const bodies = useRef<Body[]>([])
  // Giant on a wide screen, smaller on a phone so the name still reads between them.
  const [sizes] = useState(() => { const k = Math.max(0.45, Math.min(1, (typeof window === 'undefined' ? 1200 : window.innerWidth) / 1200)); return FLOAT.map((f) => Math.round(f.size * k)) })

  useEffect(() => {
    const el = box.current
    if (!el) return
    let W = el.clientWidth, H = el.clientHeight
    // Start scattered round the edges, clear of the name in the middle.
    bodies.current = FLOAT.map((f, i) => {
      const r = sizes[i] / 2, ang = (i / FLOAT.length) * Math.PI * 2 + rand(i, 1) * 0.6
      const rx = W * (0.42 + rand(i, 2) * 0.08), ry = H * (0.4 + rand(i, 3) * 0.08)
      return {
        x: Math.min(W - r, Math.max(r, W / 2 + Math.cos(ang) * rx)), y: Math.min(H - r, Math.max(r, H / 2 + Math.sin(ang) * ry)),
        vx: (rand(i, 4) - 0.5) * 20, vy: (rand(i, 5) - 0.5) * 20, r, a: (rand(i, 6) - 0.5) * 24, va: (rand(i, 7) - 0.5) * 4,
        held: false, px: 0, py: 0, pt: 0, ox: 0, oy: 0,
      }
    })
    const draw = () => bodies.current.forEach((b, i) => {
      const d = els.current[i]
      if (d) d.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0) rotate(${b.a.toFixed(1)}deg)`
    })
    draw()
    let raf = 0, last = performance.now(), on = true
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      const bs = bodies.current
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]
        if (b.held) continue
        // A slow drift that wanders, and throws that ease back down to it.
        b.vx += Math.sin(t * 0.00041 + i * 1.7) * 5 * dt
        b.vy += Math.cos(t * 0.00037 + i * 2.3) * 5 * dt
        // Kept clear of the name: inside its ellipse, a soft push outward.
        const fs = Math.max(52, Math.min(184, W * 0.13)), ex = (b.x - W / 2) / (fs * 2.2 + b.r), ey = (b.y - H / 2) / (fs * 1.45 + b.r), q = Math.hypot(ex, ey)
        if (q < 1) { b.vx += (ex / (q || 1)) * 60 * dt; b.vy += (ey / (q || 1)) * 60 * dt }
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > 18) { const k = Math.max(0, 1 - 1.4 * dt); b.vx *= k; b.vy *= k }
        b.va *= sp > 18 ? Math.max(0, 1 - 1.2 * dt) : 1
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.85 } else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.85 }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.85 } else if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.85 }
      }
      // Soft nudges where two tiles overlap (a held one pushes the others aside).
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 0.86
        if (d >= min) continue
        const push = (min - d) * 0.5, nx = dx / d, ny = dy / d
        if (!a.held) { a.x -= nx * push; a.y -= ny * push; a.vx -= nx * push * 2; a.vy -= ny * push * 2 }
        if (!b.held) { b.x += nx * push; b.y += ny * push; b.vx += nx * push * 2; b.vy += ny * push * 2 }
      }
      draw()
      if (on) raf = requestAnimationFrame(step)
    }
    const start = () => { if (still || raf) return; on = true; last = performance.now(); raf = requestAnimationFrame(step) }
    const stop = () => { on = false; cancelAnimationFrame(raf); raf = 0 }
    // Only while the intro is on screen.
    const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.05 })
    seen.observe(el)
    const resize = new ResizeObserver(() => { W = el.clientWidth; H = el.clientHeight })
    resize.observe(el)
    return () => { stop(); seen.disconnect(); resize.disconnect() }
  }, [sizes])

  // Pick up, drag, throw.
  const down = (i: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodies.current[i], r = box.current!.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    b.held = true; b.ox = e.clientX - r.left - b.x; b.oy = e.clientY - r.top - b.y
    b.px = e.clientX; b.py = e.clientY; b.pt = performance.now(); b.vx = 0; b.vy = 0
  }
  const move = (i: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const b = bodies.current[i]
    if (!b?.held) return
    const r = box.current!.getBoundingClientRect(), now = performance.now(), dt = Math.max(0.008, (now - b.pt) / 1000)
    b.vx = (e.clientX - b.px) / dt; b.vy = (e.clientY - b.py) / dt
    b.px = e.clientX; b.py = e.clientY; b.pt = now
    b.x = e.clientX - r.left - b.ox; b.y = e.clientY - r.top - b.oy
    const d = els.current[i]
    if (d) d.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px, ${(b.y - b.r).toFixed(1)}px, 0) rotate(${b.a.toFixed(1)}deg)`
  }
  const up = (i: number) => () => {
    const b = bodies.current[i]
    if (!b) return
    b.held = false
    const sp = Math.hypot(b.vx, b.vy), max = 1600
    if (sp > max) { b.vx *= max / sp; b.vy *= max / sp }
    b.va = b.vx * 0.03
  }

  return (
    <section ref={box} aria-labelledby="intro-title" data-testid="landing-intro" className="relative h-full min-h-[34rem] select-none overflow-hidden"
      style={leaving ? { transformOrigin: `${leaving.x}px ${leaving.y}px`, transform: 'scale(9)', opacity: 0, transition: 'transform 850ms cubic-bezier(0.7, 0, 0.84, 0), opacity 420ms ease-in 380ms', pointerEvents: 'none' } : undefined}>
      {FLOAT.map((f, i) => (
        <div key={i} ref={(d) => { els.current[i] = d }} aria-hidden onPointerDown={down(i)} onPointerMove={move(i)} onPointerUp={up(i)} onPointerCancel={up(i)}
          className="absolute left-0 top-0 cursor-grab touch-none will-change-transform active:cursor-grabbing" style={{ width: sizes[i], height: sizes[i], transform: 'translate3d(-999px,-999px,0)' }}>
          <GlassIcon icon={f.icon} hue={f.hue} size={sizes[i]} level="soft" />
        </div>
      ))}
      <GlassTitle onEnter={enter} still={still} />
    </section>
  )
}
