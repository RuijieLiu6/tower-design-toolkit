// The shared icon generator (Ruijie, 7 Nov: "Prefer one shared icon-generation service for toolkit-style icons. Our
// assistant and external agents should send the same structured icon brief to this service"). It draws a brief in the
// style pack it names, from the same primitives as the built nodes' illustrations (components/icons/nodeArt.tsx): the
// isometric frame, the ground plate, the three-tone materials and the phase accent. One main object, at most one cue.
// Deterministic: the same brief and variant always give the same drawing; `variant` gives the alternatives Regenerate
// steps through. Versioned: a future style pack adds a drawer and leaves version 1 as it is, so no saved icon changes.
import type { ReactNode } from 'react'
import { box, flat, iso, line, plate, pts, tones, INK, type Ctx } from '../../components/icons/nodeArt'
import { PHASE_HUE } from '../phases'
import { CATEGORY_PHASE, type IconBrief, type IconCue, type IconObject } from './brief'

const A = (c: Ctx, k: 0 | 1 | 2) => tones('a', c.h)[k]
/** Small, repeatable differences between variants (heights, positions). */
const jitter = (v: number, k: number) => { const s = Math.sin((v + 1) * 91.7 + k * 13.1) * 43758.5; return s - Math.floor(s) }

const OBJECT_ART: Record<IconObject, (c: Ctx, v: number) => ReactNode> = {
  tower: (c, v) => { const h = 10 + jitter(v, 1) * 4; return <>{plate(c)}{box(c, 5.5, 5.5, 0.9, 5, 5, h - 3)}{box(c, 5.5, 5.5, h - 2.1, 5, 5, 3, 'a')}</> },
  podium: (c, v) => <>{plate(c)}{box(c, 2, 3, 0.9, 12, 9.5, 3.4, 'a')}{box(c, 5 + jitter(v, 2) * 2, 4, 4.3, 5, 5, 9 + jitter(v, 1) * 3)}</>,
  floor: (c) => <>{plate(c)}{box(c, 2, 2, 0.9, 12, 12, 0.8)}{box(c, 2, 2, 1.7, 0.6, 12, 3.4)}{box(c, 2.6, 2, 1.7, 11.4, 0.6, 3.4)}{box(c, 8, 2.6, 1.7, 0.5, 6, 2.6, 'a')}{box(c, 2.6, 8.4, 1.7, 5.4, 0.5, 2.6, 'a')}</>,
  core: (c) => <>{plate(c)}{[0, 1, 2].map((i) => <g key={i}>{box(c, 3.5, 3.5, 1 + i * 4.6, 9, 9, 0.8)}</g>)}{box(c, 6.6, 6.6, 0.9, 2.8, 2.8, 15, 'a')}</>,
  stairs: (c) => <>{plate(c)}{[0, 1, 2, 3, 4].map((i) => <g key={i}>{box(c, 2.5 + i * 2.2, 5, 0.9, 2.2, 6, 1.6 * (i + 1), 'a')}</g>)}</>,
  facade: (c, v) => <>{plate(c)}{box(c, 5, 5, 0.9, 6, 6, 12 + jitter(v, 1) * 2, 'w')}{[1, 2, 3].map((i) => <g key={i}>{line(iso(5 + i * 1.5, 11, 0.9), iso(5 + i * 1.5, 11, 13), '#fff', 0.7)}</g>)}{box(c, 5, 5, 0.9, 6, 6, 0.6, 'a')}</>,
  park: (c) => <>{plate(c)}{flat(tones('g', c.h)[0], 0.95, [1.5, 4], [12, 4], [12, 14.5], [1.5, 14.5])}{box(c, 6, 8, 0.95, 1, 1, 3, 'k')}
    <circle cx={iso(6.5, 8.5, 5.2)[0]} cy={iso(6.5, 8.5, 5.2)[1]} r={4} fill={tones('g', c.h)[1]} />{box(c, 11.5, 2, 0.9, 3.5, 3.5, 4, 'a')}</>,
  street: (c) => <>{plate(c)}{flat(A(c, 0), 0.95, [0.6, 12], [15.4, 12], [15.4, 15.4], [0.6, 15.4])}{box(c, 2, 3, 0.9, 12, 8, 5)}
    {[0, 1, 2].map((i) => <g key={i}>{box(c, 2.4 + i * 4, 11, 4.2, 3.8, 1.6, 0.5, 'a')}</g>)}</>,
  water: (c) => <>{plate(c)}{flat(tones('w', c.h)[1], 0.95, [2, 5], [13, 5], [13, 14], [2, 14])}{flat(tones('w', c.h)[0], 0.97, [4, 7], [9, 7], [9, 9], [4, 9])}{box(c, 10.5, 1.5, 0.9, 4, 3.5, 6, 'a')}</>,
  train: (c) => <>{plate(c)}{box(c, 1.5, 7.5, 0.9, 13, 3.5, 3.6, 'a')}{[0, 1, 2, 3].map((i) => <polygon key={i} points={pts([2.5 + i * 3, 11, 2.6], [4.5 + i * 3, 11, 2.6], [4.5 + i * 3, 11, 3.8], [2.5 + i * 3, 11, 3.8])} fill="#fff" opacity={0.9} />)}</>,
  car: (c) => <>{plate(c)}{flat(A(c, 0), 0.95, [2, 3], [14, 3], [14, 13], [2, 13])}{box(c, 4, 6, 0.95, 8, 4, 2.2)}{box(c, 5.5, 6.4, 3.15, 4, 3.2, 1.6, 'w')}
    {[[5.5, 10.2], [10.3, 10.2]].map(([x, y], i) => <ellipse key={i} cx={iso(x, y, 1)[0]} cy={iso(x, y, 1)[1]} rx={1.6} ry={1.1} fill={INK} />)}</>,
  document: (c) => <>{plate(c)}{box(c, 3, 7, 0.9, 10, 0.8, 13)}{[0, 1, 2, 3].map((i) => <g key={i}>{line(iso(4.5, 7.8, 11 - i * 2.4), iso(10.5, 7.8, 11 - i * 2.4), tones('n', c.h)[2], 1)}</g>)}
    {box(c, 3, 7, 0.9, 10, 0.8, 1.2, 'a')}</>,
  chart: (c, v) => <>{plate(c)}{[0, 1, 2].map((i) => <g key={i}>{box(c, 3 + i * 3.8, 5 + i * 1.5, 0.9, 2.8, 2.8, 4 + i * 3 + jitter(v, i) * 2, i === 2 ? 'a' : 'n')}</g>)}</>,
  coins: (c) => <>{plate(c)}{box(c, 7, 4, 0.9, 5, 5, 11)}{[0, 1, 2].map((i) => <g key={i}><ellipse cx={14} cy={36 - i * 2.4} rx={6} ry={2.6} fill={A(c, 2)} /><ellipse cx={14} cy={35 - i * 2.4} rx={6} ry={2.6} fill={A(c, 0)} /></g>)}</>,
  sun: (c) => <>{plate(c)}{flat('rgb(58 66 80 / 0.28)', 0.95, [5.5, 10.5], [10.5, 10.5], [13, 16], [8, 16])}{box(c, 5.5, 5.5, 0.9, 5, 5, 10)}<circle cx={38} cy={9.5} r={4.6} fill={A(c, 1)} /></>,
  wind: (c) => <>{plate(c)}{box(c, 6.8, 6.8, 0.9, 3, 3, 15)}{[0, 1].map((i) => <path key={i} d={`M4 ${17 + i * 8} q7 -4 13 -1 M31 ${18 + i * 8} q6 -3 13 0`} fill="none" stroke={A(c, 1)} strokeWidth={1.5} strokeLinecap="round" />)}</>,
  mountain: (c) => <>{plate(c)}<path d="M2 20 l7-9 5 5 6-8 9 12z" fill={tones('k', c.h)[0]} opacity={0.55} />{box(c, 8, 7, 0.9, 6, 6, 7)}<circle cx={iso(10, 9, 8.6)[0]} cy={iso(10, 9, 8.6)[1]} r={1.9} fill={A(c, 2)} /></>,
  // three figures, the middle one in the accent; big enough to read as people at 30 px
  people: (c) => <>{plate(c)}{[[2.6, 7.6], [6.6, 2.8], [10, 8.6]].map(([x, y], i) => <g key={i}>{box(c, x, y, 0.9, 3, 3, 6.6, i === 1 ? 'a' : 'n')}<circle cx={iso(x + 1.5, y + 1.5, 10)[0]} cy={iso(x + 1.5, y + 1.5, 10)[1]} r={3} fill={i === 1 ? A(c, 1) : tones('n', c.h)[2]} /></g>)}</>,
  solar: (c) => <>{plate(c)}{box(c, 4, 5, 0.9, 8, 7, 7)}{[0, 1].map((i) => <polygon key={i} points={pts([4.8 + i * 3.6, 6, 8], [7.8 + i * 3.6, 6, 8], [7.8 + i * 3.6, 11, 9.6], [4.8 + i * 3.6, 11, 9.6])} fill={tones('w', c.h)[2]} stroke="#fff" strokeWidth={0.5} />)}</>,
  sound: (c) => <>{plate(c)}{box(c, 4, 6, 0.9, 5, 5, 11)}{[0, 1, 2].map((i) => <path key={i} d={`M${31 + i * 3} ${17 - i * 3} a${6 + i * 3} ${6 + i * 3} 0 0 1 0 ${12 + i * 6}`} fill="none" stroke={A(c, 1)} strokeWidth={1.5} strokeLinecap="round" />)}</>,
  heat: (c) => <>{plate(c)}{box(c, 4, 6, 0.9, 5, 5, 11)}<rect x={36} y={8} width={4} height={14} rx={2} fill="#fff" stroke={A(c, 2)} strokeWidth={1.2} /><circle cx={38} cy={23} r={3.4} fill={A(c, 1)} /><rect x={37.1} y={13} width={1.8} height={9} fill={A(c, 1)} /></>,
}

/** Objects with their own mark in the top right (the sun, sound waves, a thermometer): their cue goes top left. */
const CUE_LEFT: ReadonlySet<IconObject> = new Set(['sun', 'sound', 'heat'])

/** Objects whose drawing changes with `variant` (Regenerate); the others have one drawing. */
export const HAS_VARIANTS: ReadonlySet<IconObject> = new Set(['tower', 'podium', 'facade', 'chart'])

/** The supporting cue: a small badge at the top right, in the accent. */
const CUE_ART: Record<Exclude<IconCue, 'none'>, (c: Ctx) => ReactNode> = {
  check: (c) => <><circle cx={39} cy={9.5} r={5} fill={A(c, 2)} /><path d="M36.5 9.5 l1.8 1.9 3.4-3.6" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></>,
  sun: (c) => <circle cx={39} cy={9.5} r={4.4} fill={A(c, 1)} />,
  drop: () => <path d="M39 4.5 c2.5 3.4 4 5.6 4 7.3 a4 4 0 0 1-8 0 c0-1.7 1.5-3.9 4-7.3z" fill="#8cc4e8" />,
  wind: (c) => <path d="M33 8 h7 a2.5 2.5 0 1 0 -2.5 -2.5 M33 12 h10 a2.5 2.5 0 1 1 -2.5 2.5" fill="none" stroke={A(c, 1)} strokeWidth={1.5} strokeLinecap="round" />,
  bolt: (c) => <path d="M40 3.5 l-5 8 h3.6 l-1.8 7 5.8-9 h-3.8z" fill={A(c, 1)} />,
  pin: (c) => <><path d="M39 3.5 a4.5 4.5 0 0 1 4.5 4.5 c0 3.6-4.5 8-4.5 8 s-4.5-4.4-4.5-8 a4.5 4.5 0 0 1 4.5-4.5z" fill={A(c, 1)} /><circle cx={39} cy={8} r={1.7} fill="#fff" /></>,
  clock: (c) => <><circle cx={39} cy={9.5} r={5} fill="#fff" stroke={A(c, 2)} strokeWidth={1.3} /><path d="M39 6.8 v2.9 l2 1.4" fill="none" stroke={A(c, 2)} strokeWidth={1.3} strokeLinecap="round" /></>,
  warning: () => <><path d="M39 4 l5.5 9.6 h-11z" fill="#f2b84b" /><path d="M39 7.6 v3 M39 12 v0.2" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" /></>,
  leaf: () => <path d="M34.5 14 c0-6 4-9.5 9.5-9.5 c0 6-3.6 9.5-9.5 9.5z M35 13.5 l5-5" fill="#86c06a" stroke="#5f9a4f" strokeWidth={0.9} strokeLinecap="round" />,
  person: (c) => <><circle cx={39} cy={6.2} r={2.2} fill={A(c, 1)} /><path d="M35.2 14.5 a3.8 4.4 0 0 1 7.6 0z" fill={A(c, 1)} /></>,
  sound: (c) => <path d="M35 7 a4 4 0 0 1 0 6 M38 5 a7 7 0 0 1 0 10" fill="none" stroke={A(c, 1)} strokeWidth={1.5} strokeLinecap="round" />,
  eye: (c) => <><path d="M33.5 9.5 q5.5-5 11 0 q-5.5 5-11 0z" fill="#fff" stroke={A(c, 2)} strokeWidth={1.1} /><circle cx={39} cy={9.5} r={1.7} fill={A(c, 2)} /></>,
  plus: (c) => <><path d="M39 3.8 l5.2 1.9 v4 c0 3.3-2.3 5.4-5.2 6.6 c-2.9-1.2-5.2-3.3-5.2-6.6 v-4z" fill={A(c, 1)} /><path d="M39 7.4 v5 M36.5 9.9 h5" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" /></>,
}

/** The hue a brief's accent takes: its phase's, else its category's phase. */
export const briefHue = (b: Pick<IconBrief, 'phase' | 'category'>) => PHASE_HUE[b.phase ?? CATEGORY_PHASE[b.category] ?? 'site']

/** Style pack 1: the drawing for a brief (an SVG body in the 48-unit frame). */
function drawV1(b: IconBrief, variant: number): ReactNode {
  const c: Ctx = { h: briefHue(b) }
  const cue = b.metaphor.cue && b.metaphor.cue !== 'none' ? CUE_ART[b.metaphor.cue] : null
  // Objects that draw in the top right themselves take their cue in the top left instead, so the two never collide.
  return <>{OBJECT_ART[b.metaphor.object](c, variant)}{cue && (CUE_LEFT.has(b.metaphor.object) ? <g transform="translate(-30 0)">{cue(c)}</g> : cue(c))}</>
}
const DRAWERS: Record<string, (b: IconBrief, variant: number) => ReactNode> = { '1': drawV1 }

/** The generated icon, in the style pack the brief names (unknown packs fall back to the approved fallback drawing). */
export function GeneratedIcon({ brief, variant = 0, size = 48 }: { brief: IconBrief; variant?: number; size?: number }) {
  const draw = DRAWERS[brief.styleVersion]
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden data-generated-icon={`${brief.styleVersion}:${brief.metaphor.object}:${brief.metaphor.cue ?? 'none'}:${variant}`}>
      {draw ? draw(brief, variant) : <FallbackBody h={briefHue(brief)} />}
    </svg>
  )
}

/** The approved fallback illustration: a node module on the plate, in the category's colour (no claim about the task). */
function FallbackBody({ h }: { h: number }) {
  const c: Ctx = { h }
  return <>{plate(c)}{box(c, 4.5, 4.5, 0.9, 7, 7, 5)}{box(c, 4.5, 4.5, 5.9, 7, 7, 1.4, 'a')}{box(c, 6.6, 6.6, 7.3, 2.8, 2.8, 1.2, 'n')}</>
}
export function FallbackIcon({ h, size = 48 }: { h: number; size?: number }) {
  return <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden data-fallback-icon><FallbackBody h={h} /></svg>
}
