// Illustrated icons for the design nodes (Ruijie, 7 Nov: "custom illustrated icons for the design nodes … distinctive,
// architectural, and carefully made, with simple filled forms, coordinated colors, and subtle depth … one family. Keep
// the viewing angle, lighting, visual weight, detail level, and internal spacing consistent. Each icon should represent
// the architectural task it performs").
//
// One family: the same isometric view (30°) on a 48-unit grid, the same small ground plate under every subject, light
// from the upper left (top face lightest, left face middle, right face darkest), neutral warm-grey massing, and the
// node's task in its phase colour in three tones (lib/design/tokens.ts PHASE_COLOR, the design system's phase palette,
// 7 Nov). Our own drawings; one per built node. The primitives are exported: the icon generator for user-created nodes
// (lib/nodeIcons/generate.tsx) draws with them, so its icons sit in the same family. Style pack 1 drew the accent from a
// hue (hsl tones); it is kept for icons saved under it (a drawing context without `a` uses it).
import type { ReactNode } from 'react'
import { phaseOfNode, PHASE_HUE } from '../../lib/phases'
import { PHASE_COLOR } from '../../lib/design/tokens'
import { designNode } from '../../lib/workflow/designNodes'
import { DESIGN_ART } from './designArt'

// ---------- the isometric frame: plan units 0..16 on the plate, z up ----------
export type P3 = [number, number, number]
export const iso = (x: number, y: number, z = 0): [number, number] => [24 + (x - y) * 1.38, 19.5 + (x + y) * 0.8 - z * 1.62]
export const pts = (...ps: P3[]) => ps.map((q) => iso(...q).map((v) => v.toFixed(2)).join(',')).join(' ')

export type Tone = 'n' | 'a' | 'g' | 'w' | 'k' | 'p'
/** Three tones per material: top, left face, right face. `a` is the node's phase colour: the given tones (style pack 2),
 *  else style pack 1's tones from the hue. */
export function tones(t: Tone, h: number, a?: [string, string, string]): [string, string, string] {
  switch (t) {
    case 'n': return ['#fbfbfa', '#e2e5ea', '#c3c9d2'] // massing
    case 'p': return ['#eef1f3', '#d9dee4', '#c7cdd5'] // ground plate
    case 'g': return ['#b7dd8f', '#86c06a', '#5f9a4f'] // planting
    case 'w': return ['#bfe1f6', '#8cc4e8', '#5d9fcf'] // water and sky glass
    case 'k': return ['#6c7686', '#4f5868', '#3a4250'] // dark detail
    case 'a': return a ?? [`hsl(${h} 82% 76%)`, `hsl(${h} 68% 61%)`, `hsl(${h} 58% 47%)`]
  }
}

/** A drawing context: the phase hue, and (style pack 2) the accent's three tones. */
export interface Ctx { h: number; a?: [string, string, string] }
/** A box: top, the face toward the lower left and the face toward the lower right. */
export const box = (c: Ctx, x: number, y: number, z: number, w: number, d: number, hh: number, t: Tone = 'n', o = 1): ReactNode => {
  const [top, left, right] = tones(t, c.h, c.a)
  return (
    <g opacity={o}>
      <polygon points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x, y + d, z + hh])} fill={left} />
      <polygon points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x + w, y, z + hh])} fill={right} />
      <polygon points={pts([x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh])} fill={top} />
    </g>
  )
}
/** Something lying on the ground (or on a roof at height z). */
export const flat = (fill: string, z: number, ...ps: [number, number][]): ReactNode => <polygon points={pts(...ps.map(([x, y]) => [x, y, z] as P3))} fill={fill} />
export const plate = (c: Ctx) => box(c, 0.6, 0.6, 0, 14.8, 14.8, 0.9, 'p')
const tower = (c: Ctx, hh: number, x = 5.5, y = 5.5, w = 5, d = 5) => box(c, x, y, 0.9, w, d, hh)
const A = (c: Ctx, k: 0 | 1 | 2) => tones('a', c.h, c.a)[k]
export const line = (a: [number, number], b: [number, number], stroke: string, w = 1.1, dash?: string) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} />
export const INK = '#3a4250'

// ---------- one drawing per built node ----------
const ART: Record<string, (c: Ctx) => ReactNode> = {
  // Hard rules: the tower's top reaches into the competition's height band; a check.
  'built.vtc-rules': (c) => <>{plate(c)}{box(c, 5.5, 5.5, 0.9, 5, 5, 8.5)}{box(c, 5.5, 5.5, 9.4, 5, 5, 4.5, 'a')}
    <circle cx={38.5} cy={10} r={5} fill={A(c, 2)} /><path d="M36 10 l1.8 1.9 3.4-3.6" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></>,
  // Program & FSR: floors stacked by use.
  'built.fsr': (c) => <>{plate(c)}{[0, 1, 2, 3].map((i) => <g key={i}>{box(c, 4, 4, 0.9 + i * 3, 8, 8, 2.3, i % 2 ? 'n' : 'a')}</g>)}</>,
  // View-cone height check: a sloping view plane passes over the tower.
  'built.viewcones': (c) => <>{plate(c)}{tower(c, 12, 5.5, 5.5, 4, 4)}
    <polygon points={pts([14.5, 14.5, 2], [1, 6, 11.5], [6, 1, 11.5])} fill={A(c, 0)} opacity={0.72} />
    <polyline points={pts([1, 6, 11.5], [14.5, 14.5, 2], [6, 1, 11.5])} fill="none" stroke={A(c, 2)} strokeWidth={1.1} strokeLinejoin="round" />
    {box(c, 5.5, 5.5, 9.6, 4, 4, 3.3, 'n', 0.9)}
    <circle cx={iso(14.5, 14.5, 2)[0]} cy={iso(14.5, 14.5, 2)[1]} r={2} fill={A(c, 2)} /></>,
  // Relaxations & aviation: a tower under a flight path.
  'built.relax-aviation': (c) => <>{plate(c)}{tower(c, 11, 6, 6, 4, 4)}
    <path d="M30 9.5 l11-4.2 1.4 1.4-6.6 4.1 1.2 5.4-1.6.8-2.8-4.9-4.5 1.5-1-1.1z" fill={A(c, 2)} />{line([28, 14], [34, 11.6], A(c, 1), 1, '1.5 1.8')}</>,
  // Sun & shadow preview: the sun, and the tower's shadow on the ground.
  'built.sun': (c) => <>{plate(c)}{flat('rgb(58 66 80 / 0.28)', 0.95, [5.5, 10.5], [10.5, 10.5], [13, 16], [8, 16])}{tower(c, 10)}
    <circle cx={38} cy={9.5} r={4.6} fill={A(c, 1)} /><circle cx={38} cy={9.5} r={2.6} fill={A(c, 0)} /></>,
  // Solar access: a protected park, a tree, and the edge of new shadow.
  'built.solar-access': (c) => <>{plate(c)}{flat(tones('g', c.h)[0], 0.95, [1.5, 8], [10, 8], [10, 15], [1.5, 15])}
    {flat('rgb(58 66 80 / 0.28)', 0.97, [6.5, 8], [10, 8], [10, 15], [8.5, 15])}
    {box(c, 3.5, 10.5, 0.95, 1, 1, 3, 'k')}<circle cx={iso(4, 11, 5)[0]} cy={iso(4, 11, 5)[1]} r={3.6} fill={tones('g', c.h)[1]} />
    {box(c, 11, 3, 0.9, 4, 4, 9)}<circle cx={40} cy={8.5} r={3.8} fill={A(c, 1)} /></>,
  // Core & lifts: floors around a core that rises through them, the lift shafts in it.
  'built.core-lifts': (c) => <>{plate(c)}{[0, 1, 2].map((i) => <g key={i}>{box(c, 3.5, 3.5, 1 + i * 4.6, 9, 9, 0.8, 'n')}</g>)}{box(c, 6.6, 6.6, 0.9, 2.8, 2.8, 15, 'a')}
    {line(iso(7.5, 9.4, 2), iso(7.5, 9.4, 15), A(c, 2), 0.8)}{line(iso(8.6, 9.4, 2), iso(8.6, 9.4, 15), A(c, 2), 0.8)}</>,
  // Egress & stairs: a flight of steps.
  'built.egress': (c) => <>{plate(c)}{[0, 1, 2, 3, 4].map((i) => <g key={i}>{box(c, 2.5 + i * 2.2, 5, 0.9, 2.2, 6, 1.6 * (i + 1), 'a')}</g>)}</>,
  // Code & life safety: the tower and a safety shield.
  'built.life-safety': (c) => <>{plate(c)}{tower(c, 12, 4, 6, 5, 5)}
    <path d="M37.5 5.5 l6 2.2 v4.6 c0 3.8-2.6 6.2-6 7.6 c-3.4-1.4-6-3.8-6-7.6 v-4.6z" fill={A(c, 1)} /><path d="M37.5 9.6 v6 M34.5 12.6 h6" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" /></>,
  // Public sky room: a glazed public floor near the top of the tower.
  'built.sky-room': (c) => <>{plate(c)}{box(c, 5.5, 5.5, 0.9, 5, 5, 9.5)}{box(c, 4.5, 4.5, 10.4, 7, 7, 2.2, 'w')}{box(c, 5.5, 5.5, 12.6, 5, 5, 2.5)}
    {box(c, 4.5, 4.5, 10.4, 7, 7, 0.4, 'a')}</>,
  // Program value & land residual: the tower and a stack of coins.
  'built.economics': (c) => <>{plate(c)}{tower(c, 11, 7, 4, 5, 5)}
    {[0, 1, 2].map((i) => <g key={i}><ellipse cx={14} cy={36 - i * 2.4} rx={6} ry={2.6} fill={A(c, 2)} /><ellipse cx={14} cy={35 - i * 2.4} rx={6} ry={2.6} fill={A(c, 0)} /></g>)}</>,
  // Engagement & claims guard: two voices, one confirmed.
  'built.culture-claims': (c) => <>{plate(c)}
    <path d="M8 8 h17 a3 3 0 0 1 3 3 v8 a3 3 0 0 1-3 3 h-10 l-4 4 v-4 h-3 a3 3 0 0 1-3-3 v-8 a3 3 0 0 1 3-3z" fill={tones('n', c.h)[1]} />
    <path d="M22 15 h17 a3 3 0 0 1 3 3 v8 a3 3 0 0 1-3 3 h-3 v4 l-4-4 h-10 a3 3 0 0 1-3-3 v-8 a3 3 0 0 1 3-3z" fill={A(c, 1)} />
    <path d="M27 22 l2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></>,
  // Your model: upload & provenance: a model block coming in.
  'built.model': (c) => <>{plate(c)}{box(c, 3.5, 5, 0.9, 7, 7, 7)}
    <path d="M37 21 v-12 M32.5 13.5 l4.5-4.5 4.5 4.5" fill="none" stroke={A(c, 2)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></>,
  // AI-use log: a record sheet with its entries and a stamp (a log, not a robot).
  'built.provenance': (c) => <>{plate(c)}{box(c, 3, 7, 0.9, 10, 0.8, 13)}
    {[0, 1, 2, 3].map((i) => <g key={i}>{line(iso(4.5, 7.8, 11 - i * 2.4), iso(10.5, 7.8, 11 - i * 2.4), tones('n', c.h)[2], 1)}</g>)}
    <circle cx={iso(11.5, 7.8, 3.5)[0]} cy={iso(11.5, 7.8, 3.5)[1]} r={4.2} fill={A(c, 1)} /><circle cx={iso(11.5, 7.8, 3.5)[0]} cy={iso(11.5, 7.8, 3.5)[1]} r={2.3} fill="none" stroke="#fff" strokeWidth={1.2} /></>,
  // Parking, loading & bikes: a car on its bay.
  'built.mobility': (c) => <>{plate(c)}{flat(A(c, 0), 0.95, [2, 3], [14, 3], [14, 13], [2, 13])}{box(c, 4, 6, 0.95, 8, 4, 2.2, 'n')}{box(c, 5.5, 6.4, 3.15, 4, 3.2, 1.6, 'w')}
    {[[5.5, 10.2], [10.3, 10.2]].map(([x, y], i) => <ellipse key={i} cx={iso(x, y, 1)[0]} cy={iso(x, y, 1)[1]} rx={1.6} ry={1.1} fill={INK} />)}</>,
  // Facade: glazing & bird safety: a glazed face with its mullions, and a bird.
  'built.facade': (c) => <>{plate(c)}{box(c, 5, 5, 0.9, 6, 6, 13, 'w')}
    {[1, 2, 3].map((i) => <g key={i}>{line(iso(5 + i * 1.5, 11, 0.9), iso(5 + i * 1.5, 11, 13.9), '#fff', 0.7)}</g>)}
    {[1, 2, 3, 4].map((i) => <g key={`h${i}`}>{line(iso(5, 11, 0.9 + i * 2.6), iso(11, 11, 0.9 + i * 2.6), '#fff', 0.7)}</g>)}
    <path d="M33 31 q2.5-2.6 5 0 q2.5-2.6 5 0" fill="none" stroke={A(c, 2)} strokeWidth={1.7} strokeLinecap="round" /></>,
  // Interior & activity programme: a home cut open: a bed with its pillow and blanket, a sofa, a table and a plant.
  'built.interior': (c) => <>{plate(c)}{box(c, 2, 2, 0.9, 12, 12, 0.8)}
    {box(c, 2, 2, 1.7, 0.6, 12, 3.6)}{box(c, 2.6, 2, 1.7, 11.4, 0.6, 3.6)}
    {box(c, 3.2, 2.6, 1.7, 4.4, 0.5, 3.2, 'a')}{box(c, 3.2, 3.1, 1.7, 4.4, 6, 1, 'a')}{box(c, 3.2, 3.1, 2.7, 4.4, 6, 0.35)}
    {box(c, 3.6, 3.4, 3.05, 3.6, 1.6, 0.5)}{box(c, 3.2, 5.6, 3.05, 4.4, 3.5, 0.45, 'a')}
    {box(c, 9.6, 2.6, 1.7, 4, 1, 2.6, 'k')}{box(c, 9.6, 3.6, 1.7, 4, 2.2, 1.1, 'k')}{box(c, 10.2, 7.4, 1.7, 2.6, 2.6, 0.9)}
    {box(c, 12.4, 11.6, 1.7, 1, 1, 1, 'k')}<circle cx={iso(12.9, 12.1, 4.3)[0]} cy={iso(12.9, 12.1, 4.3)[1]} r={2.4} fill={tones('g', c.h)[1]} /></>,
  // Daylight screen: a window wall, warm light on the floor beside it, the deep middle in grey, the reach dashed.
  'built.daylight-depth': (c) => <>{plate(c)}{box(c, 2, 2, 0.9, 12, 12, 0.8)}
    {flat('#fff0b3', 1.72, [2, 2.6], [14, 2.6], [14, 6.4], [2, 6.4])}{flat('#fbf4da', 1.72, [2, 6.4], [14, 6.4], [14, 10], [2, 10])}{flat('#cdd2da', 1.72, [2, 10], [14, 10], [14, 14], [2, 14])}
    {box(c, 2, 2, 1.7, 12, 0.6, 8)}
    <polygon points={pts([3.4, 2.6, 2.6], [12.6, 2.6, 2.6], [12.6, 2.6, 8.8], [3.4, 2.6, 8.8])} fill={tones('w', c.h)[0]} />
    {[6.5, 9.5].map((x, i) => <g key={i}>{line(iso(x, 2.6, 2.6), iso(x, 2.6, 8.8), '#fff', 0.9)}</g>)}
    <polyline points={pts([3.4, 2.6, 2.6], [3.4, 2.6, 8.8], [12.6, 2.6, 8.8], [12.6, 2.6, 2.6], [3.4, 2.6, 2.6])} fill="none" stroke={A(c, 2)} strokeWidth={0.9} strokeLinejoin="round" />
    <polygon points={pts([3.4, 2.6, 2.6], [12.6, 2.6, 2.6], [12.6, 7, 1.74], [3.4, 7, 1.74])} fill="rgb(255 214 102 / 0.34)" />
    {line(iso(2, 10, 1.74), iso(14, 10, 1.74), A(c, 2), 1.2, '1.8 1.5')}
    <circle cx={40.5} cy={7.5} r={3.6} fill="#f2c14e" /></>,
  // View from here: a roof, an eye, the mountains across the water.
  'built.view-from': (c) => <>{plate(c)}<path d="M2 20 l7-9 5 5 6-8 9 12z" fill={tones('k', c.h)[0]} opacity={0.55} /><path d="M17 12 l3-4 3 4z" fill="#fff" opacity={0.8} />
    {box(c, 8, 7, 0.9, 6, 6, 7)}<circle cx={iso(10, 9, 8.6)[0]} cy={iso(10, 9, 8.6)[1]} r={1.9} fill={A(c, 2)} />
    {line(iso(10, 9, 8.6), [11, 13], A(c, 1), 1.1, '1.6 1.6')}</>,
  // Vista view studies: the site marked on the map, and a view across it.
  'built.vista': (c) => <>{plate(c)}<polygon points={pts([3, 6, 1], [11, 4, 1], [13, 11, 1], [5, 13, 1])} fill={A(c, 0)} opacity={0.55} stroke={A(c, 2)} strokeWidth={1} strokeDasharray="1.8 1.4" />
    <path d="M24 7 a5 5 0 0 1 5 5 c0 4-5 9-5 9 s-5-5-5-9 a5 5 0 0 1 5-5z" fill={A(c, 1)} /><circle cx={24} cy={12} r={1.9} fill="#fff" /></>,
  // Height references: a tower measured against a height line.
  'built.heights': (c) => <>{plate(c)}{tower(c, 12, 7, 5, 4, 4)}
    {line([12, 9.5], [12, 34.5], A(c, 2), 1.3)}{line([9.5, 9.5], [14.5, 9.5], A(c, 2), 1.3)}{line([9.5, 34.5], [14.5, 34.5], A(c, 2), 1.3)}
    {line([10.5, 18], [13.5, 18], A(c, 2), 1)}{line([10.5, 26], [13.5, 26], A(c, 2), 1)}</>,
  // Streetwall & tower form: a podium at the street, the tower stepped back from it.
  'built.pr-streetwall': (c) => <>{plate(c)}{flat(A(c, 0), 0.95, [0.5, 13], [15.5, 13], [15.5, 15.5], [0.5, 15.5])}{box(c, 2, 3, 0.9, 12, 9.5, 3.4)}{box(c, 5, 4, 4.3, 5, 5, 10)}</>,
  // Active frontage: shopfronts with canopies along the street.
  'built.pr-frontage': (c) => <>{plate(c)}{box(c, 2, 3, 0.9, 12, 8, 5.5)}
    {[0, 1, 2].map((i) => <g key={i}><polygon points={pts([2.8 + i * 4, 11, 1], [5.8 + i * 4, 11, 1], [5.8 + i * 4, 11, 4], [2.8 + i * 4, 11, 4])} fill={tones('w', c.h)[1]} />{box(c, 2.4 + i * 4, 11, 4.2, 3.8, 1.8, 0.5, 'a')}</g>)}</>,
  // Open space & links: a plaza with a tree and a path through the block.
  'built.pr-ground': (c) => <>{plate(c)}{flat(A(c, 0), 0.95, [1, 1], [15, 1], [15, 15], [1, 15])}{flat('#fff', 0.97, [6.6, 1], [9.4, 1], [9.4, 15], [6.6, 15])}
    {box(c, 11, 2, 0.95, 4, 5, 6)}{box(c, 3.2, 10.5, 0.95, 0.8, 0.8, 2.6, 'k')}<circle cx={iso(3.6, 10.9, 4.6)[0]} cy={iso(3.6, 10.9, 4.6)[1]} r={3.3} fill={tones('g', c.h)[1]} /></>,
  // City in Nature: a planted roof, a tree and rain.
  'built.city-in-nature': (c) => <>{plate(c)}{box(c, 5, 5, 0.9, 8, 7, 6)}{flat(tones('g', c.h)[0], 6.95, [5, 5], [13, 5], [13, 12], [5, 12])}
    {box(c, 2, 12, 0.9, 0.8, 0.8, 3, 'k')}<circle cx={iso(2.4, 12.4, 5)[0]} cy={iso(2.4, 12.4, 5)[1]} r={3.4} fill={tones('g', c.h)[1]} />
    <path d="M39 6 c2.5 3.4 4 5.6 4 7.3 a4 4 0 0 1-8 0 c0-1.7 1.5-3.9 4-7.3z" fill={tones('w', c.h)[1]} /></>,
  // Wind procedure: a slender tower with the wind running past it.
  'built.wind-procedure': (c) => <>{plate(c)}{box(c, 6.8, 6.8, 0.9, 3, 3, 16)}
    {[0, 1].map((i) => <path key={i} d={`M4 ${11 + i * 9} q7 -4 13 -1 M31 ${10 + i * 9} q6 -3 13 0`} fill="none" stroke={A(c, 1)} strokeWidth={1.5} strokeLinecap="round" />)}</>,
  // Structure: the frame of the tower with its braces.
  'built.structure': (c) => <>{plate(c)}{box(c, 5, 5, 0.9, 6, 6, 14, 'n', 0.5)}{box(c, 7.2, 7.2, 0.9, 1.6, 1.6, 14, 'a')}
    {line(iso(5, 11, 0.9), iso(11, 11, 14.9), A(c, 2), 1.3)}{line(iso(11, 11, 0.9), iso(5, 11, 14.9), A(c, 2), 1.3)}
    {line(iso(11, 5, 0.9), iso(11, 11, 14.9), A(c, 2), 1.3)}{line(iso(11, 11, 0.9), iso(11, 5, 14.9), A(c, 2), 1.3)}
    {[5, 11].map((x, i) => <g key={i}>{line(iso(x, 11, 0.9), iso(x, 11, 14.9), A(c, 2), 1.1)}</g>)}{line(iso(11, 5, 0.9), iso(11, 5, 14.9), A(c, 2), 1.1)}</>,
  // Pedestrian wind study trigger: a tower model on the wind-tunnel turntable.
  'built.wind-study': (c) => <>{plate(c)}<ellipse cx={iso(8, 8, 1)[0]} cy={iso(8, 8, 1)[1]} rx={13} ry={7.4} fill={A(c, 0)} /><ellipse cx={iso(8, 8, 1)[0]} cy={iso(8, 8, 1)[1]} rx={13} ry={7.4} fill="none" stroke={A(c, 2)} strokeWidth={1} />
    {tower(c, 10, 6.5, 6.5, 3, 3)}{[0, 1].map((i) => <g key={i}>{line([4, 12 + i * 6], [15, 12 + i * 6], A(c, 2), 1.2, '2 1.6')}</g>)}</>,
  // Pedestrian wind screen: wind brought down the face to the street, and the risk zone it makes there.
  'built.wind-screen': (c) => <>{plate(c)}<ellipse cx={iso(5, 13, 1)[0]} cy={iso(5, 13, 1)[1]} rx={8} ry={4} fill={A(c, 0)} opacity={0.85} />{tower(c, 13, 6, 4, 5, 5)}
    <path d="M6 7 h7 q3 0 3 3 v18 q0 3-3 3 h-2" fill="none" stroke={A(c, 2)} strokeWidth={1.7} strokeLinecap="round" /><path d="M13 28.5 l-3 2.6 3 2.4" fill="none" stroke={A(c, 2)} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></>,
  // Trips & station entrance: a train at the station.
  'built.trips': (c) => <>{plate(c)}{box(c, 1.5, 7.5, 0.9, 13, 3.5, 3.6, 'a')}{[0, 1, 2, 3].map((i) => <g key={i}><polygon points={pts([2.5 + i * 3, 11, 2.6], [4.5 + i * 3, 11, 2.6], [4.5 + i * 3, 11, 3.8], [2.5 + i * 3, 11, 3.8])} fill="#fff" opacity={0.9} /></g>)}
    {box(c, 10, 2, 0.9, 4, 3, 3.2)}{box(c, 9.6, 1.6, 4.1, 4.8, 3.8, 0.5, 'n')}</>,
  // Energy & carbon: solar panels on the roof, and the energy they make.
  'built.energy-carbon': (c) => <>{plate(c)}{box(c, 4, 5, 0.9, 8, 7, 7)}
    {[0, 1].map((i) => <polygon key={i} points={pts([4.8 + i * 3.6, 6, 8], [7.8 + i * 3.6, 6, 8], [7.8 + i * 3.6, 11, 9.6], [4.8 + i * 3.6, 11, 9.6])} fill={tones('w', c.h)[2]} stroke="#fff" strokeWidth={0.5} />)}
    <path d="M39 4 l-5.5 9 h4 l-2 8 6.5-10 h-4.2z" fill={A(c, 1)} /></>,
}

export const hasNodeArt = (id: string) => id in ART || id in DESIGN_ART
/** The current drawing context for a phase (style pack 2 tones). */
export const phaseCtx = (phase: keyof typeof PHASE_COLOR): Ctx => ({ h: PHASE_HUE[phase], a: PHASE_COLOR[phase].tones })

/** A built node's illustration (48-unit isometric drawing), in its phase colour. */
export function NodeArt({ id, size = 48, className = '', muted = false }: { id: string; size?: number; className?: string; muted?: boolean }) {
  const draw = ART[id] ?? DESIGN_ART[id]
  if (!draw) return null
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className={className} style={muted ? { filter: 'saturate(0.45)', opacity: 0.9 } : undefined} data-node-art={id}>
      {draw(phaseCtx(designNode(id)?.phase ?? phaseOfNode(id)?.id ?? 'site'))}
    </svg>
  )
}
