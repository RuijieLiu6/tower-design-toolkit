// The parts the three research figures are drawn with (ResearchFigures.tsx; Ruijie, 7 Nov: "redesign all these diagrams
// so that it matches the rest style of your site"). Same language as the landing page's Orbit: the stages, tools and
// nodes are the toolkit's frosted icon tiles (GlassIcon, one icon per meaning from data/icons.ts), the links are thin
// wires on one SVG layer behind them, white or in the hue of what they connect, and words stay small. Each figure is
// laid out in real pixels for the width it gets (no scaled-down text on a phone). Every tile is a button: hover, focus
// or tap shows what it does in the figure's one info line and lights what it connects, the rest fades back.
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import GlassIcon, { type GlassLevel } from '../../GlassIcon'
import { MousePointerClick, type LucideIcon } from '../../icons'

/** Who does a step (the research site's legend). A small dot on each tile, explained under the figures. */
export type Role = 'you' | 'ai' | 'code' | 'tool'
export const ROLES: Record<Role, { word: string; color: string }> = {
  you: { word: 'you decide', color: 'hsl(206 82% 48%)' },
  ai: { word: 'AI helps', color: 'hsl(268 72% 60%)' },
  code: { word: 'code checks', color: 'hsl(30 92% 50%)' },
  tool: { word: 'tools compute', color: 'hsl(160 62% 38%)' },
}

export type Pt = { x: number; y: number }
/** A tile's hue as a wire colour (the bright tone GlassIcon draws its glyph in). */
export const hueWire = (h: number, a = 0.85) => `hsl(${h} 80% 55% / ${a})`
/** Plain links: white, as in Orbit. Directed links (arrows): a quiet slate. The accent for the loops the story is about. */
export const WHITE = 'rgb(255 255 255 / 0.95)'
export const SLATE = 'hsl(206 22% 36% / 0.5)'
export const ACCENT = '#1f5f8b'
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const f = (n: number) => Math.round(n * 10) / 10

/** A cubic link from a to b. */
export const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt) => `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`
export const line = (a: Pt, b: Pt) => `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`
/** An open arrowhead whose tip is at `tip`, pointing along `ang` (radians). */
export function chevron(tip: Pt, ang: number, s = 5.5) {
  const l = ang + Math.PI * 0.8, r = ang - Math.PI * 0.8
  return `M${f(tip.x + s * Math.cos(l))} ${f(tip.y + s * Math.sin(l))}L${f(tip.x)} ${f(tip.y)}L${f(tip.x + s * Math.cos(r))} ${f(tip.y + s * Math.sin(r))}`
}
export const dir = (from: Pt, to: Pt) => Math.atan2(to.y - from.y, to.x - from.x)
/** A point on a cubic at t. */
export function at(a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt {
  const u = 1 - t
  return { x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }
}

const fade = 'transition-opacity duration-200 motion-reduce:transition-none [[data-reduced=true]_&]:transition-none'

/** One link on the wire layer; `head` adds arrowheads (from chevron). Faded when something else is in focus. */
export function Wire({ d, head, color = WHITE, width = 1.2, dash, dim }: { d: string; head?: string; color?: string; width?: number; dash?: string; dim?: boolean }) {
  return (
    <g className={fade} style={{ opacity: dim ? 0.15 : 1 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      {head && <path d={head} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  )
}

/** The figure's width, so it can lay itself out in real pixels (the wire layer and the tiles share one box). */
export function useWidth<T extends HTMLElement>(fallback = 960) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => { if (el.clientWidth > 120) setW(Math.floor(el.clientWidth)) }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Which part is in focus: the one under the mouse or keyboard focus, else the one tapped (a tap pins it, a second tap
 * or Esc lets it go). Touch never leaves a hover behind.
 */
export function useParts() {
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const bind = (id: string) => ({
    'aria-pressed': pin === id,
    onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(id) },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(null) },
    onFocus: (e: FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) setHover(id) },
    onBlur: () => setHover(null),
    onClick: () => setPin((p) => (p === id ? null : id)),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') { setPin(null); setHover(null) } },
  })
  return { active: hover ?? pin, bind }
}
export type Bind = ReturnType<ReturnType<typeof useParts>['bind']>

export type WordAt = 'below' | 'above' | 'left' | 'right' | 'none'
const WORD_AT: Record<Exclude<WordAt, 'none'>, string> = {
  below: 'left-1/2 top-full mt-1 -translate-x-1/2',
  above: 'left-1/2 bottom-full mb-1 -translate-x-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
}
const halo = '[text-shadow:0_0_3px_#fff,0_0_8px_rgb(255_255_255/0.9)]'

/**
 * A stage, tool or node: a glass icon tile at (x, y) (its centre), with its word beside it and the dot of who does it.
 * The button's name is the full name; the word is the short one the tile shows.
 */
export function Tile({ x, y, size, icon, hue, level = 'on', word, num, wordAt = 'below', strong, label, role, dim, bind, testId }: {
  x: number; y: number; size: number; icon: LucideIcon; hue: number; level?: GlassLevel; word: string; num?: string; wordAt?: WordAt
  strong?: boolean; label: string; role?: Role; dim?: boolean; bind: Bind; testId?: string
}) {
  return (
    <button type="button" aria-label={label} {...bind} data-part={testId}
      className={`gicon-lift absolute flex -translate-x-1/2 -translate-y-1/2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${fade} ${dim ? 'opacity-25' : ''}`}
      style={{ left: x, top: y }}>
      <GlassIcon icon={icon} hue={hue} size={size} level={level} />
      {role && <span aria-hidden className="absolute -bottom-[3px] -right-[3px] h-[9px] w-[9px] rounded-full ring-[1.5px] ring-white" style={{ background: ROLES[role].color }} />}
      {wordAt !== 'none' && (
        <span aria-hidden className={`pointer-events-none absolute whitespace-nowrap leading-tight ${WORD_AT[wordAt]} ${halo} ${strong ? 'text-[12.5px] font-semibold text-ink' : 'text-meta text-muted'}`}>
          {num && <span className="mr-1 text-[10.5px] font-normal tabular-nums text-muted">{num}</span>}{word}
        </span>
      )}
    </button>
  )
}

/** A step that is missing from a graph: a dashed empty slot with the step's glyph, still a button for its note. */
export function Ghost({ x, y, size, icon: Icon, word, label, dim, bind }: { x: number; y: number; size: number; icon: LucideIcon; word: string; label: string; dim?: boolean; bind: Bind }) {
  return (
    <button type="button" aria-label={label} {...bind}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-dashed border-[hsl(206_20%_50%/0.5)] text-[hsl(206_12%_58%)] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${fade} ${dim ? 'opacity-25' : ''}`}
      style={{ left: x, top: y, width: size, height: size }}>
      <Icon size={Math.round(size * 0.46)} aria-hidden />
      <span aria-hidden className={`pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-meta italic leading-tight text-muted ${halo}`}>{word}</span>
    </button>
  )
}

/** A short note on a wire (2–4 words), in the wire's colour. */
export function WireNote({ x, y, children, color = ACCENT, anchor = 'middle', dim }: { x: number; y: number; children: ReactNode; color?: string; anchor?: 'start' | 'middle' | 'end'; dim?: boolean }) {
  const tx = anchor === 'middle' ? '-translate-x-1/2' : anchor === 'end' ? '-translate-x-full' : ''
  return <span aria-hidden className={`pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-meta font-medium ${tx} ${halo} ${fade} ${dim ? 'opacity-25' : ''}`} style={{ left: x, top: y, color }}>{children}</span>
}

export interface InfoPart { title: string; text?: string; role?: Role }

/** The figure's one quiet line: what the part in focus does, or the figure's point when nothing is. */
export function Info({ part, idle }: { part: InfoPart | null; idle: string }) {
  return (
    <div className="flex min-h-[2.6rem] flex-wrap items-start gap-x-3 gap-y-1 text-meta text-muted" data-testid="figure-info">
      {part ? <>
        <p className="min-w-0 flex-1 basis-64"><b className="font-semibold text-ink">{part.title}</b>{part.text ? <> · {part.text}</> : null}</p>
        {part.role && <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]"><RoleDot role={part.role} />{ROLES[part.role].word}</span>}
      </> : (
        <p className="flex min-w-0 flex-1 items-start gap-2"><MousePointerClick size={15} aria-hidden className="mt-0.5 shrink-0" /><span>{idle} <span className="text-meta opacity-80">Hover or tap a part.</span></span></p>
      )}
    </div>
  )
}

export const RoleDot = ({ role }: { role: Role }) => <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: ROLES[role].color }} />

/** The research site's legend, as the dots on the tiles. */
export function RoleLegend() {
  return (
    <ul aria-label="Who does what" className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {(Object.keys(ROLES) as Role[]).map((r) => <li key={r} className="flex items-center gap-1.5"><RoleDot role={r} />{ROLES[r].word}</li>)}
    </ul>
  )
}

/**
 * The shared model, drawn as in Orbit (the landing page's other drawing of the same idea): a glass tower on a frosted
 * podium, in axonometric. Centred on (x, y) at scale s; it spans about 84·s above and 60·s below.
 */
export function ModelTower({ x, y, s, id }: { x: number; y: number; s: number; id: string }) {
  return (
    <g transform={`translate(${f(x)} ${f(y + 34 * s)}) scale(${f(s * 100) / 100})`}>
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="hsl(206 90% 88%)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${id}-podium`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <ellipse cx={0} cy={6} rx={58} ry={18} fill="hsl(206 40% 40%)" opacity={0.12} />
      <path d="M-50 0 L0 26 L50 0 L0 -26 Z" fill={`url(#${id}-podium)`} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <path d="M-50 0 V-12 L0 -38 L50 -12 V0 L0 26 Z" fill={`url(#${id}-podium)`} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <path d="M-50 -12 L0 14 L50 -12 M0 14 V26" fill="none" stroke="hsl(206 30% 60%)" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d="M-19 -21 V-108 L0 -118 L19 -108 V-21 L0 -11 Z" fill={`url(#${id}-glass)`} stroke="hsl(206 80% 55%)" strokeOpacity={0.9} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      <path d="M-19 -108 L0 -98 L19 -108 M0 -98 V-11" fill="none" stroke="hsl(206 80% 55%)" strokeOpacity={0.9} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      {[0, 1, 2, 3, 4, 5, 6].map((k) => <path key={k} d={`M-19 ${-32 - k * 11} L0 ${-22 - k * 11} L19 ${-32 - k * 11}`} fill="none" stroke="hsl(206 80% 55%)" strokeOpacity={0.3} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
      <path d="M-12 -100 L-12 -30" stroke="#fff" strokeOpacity={0.9} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  )
}
