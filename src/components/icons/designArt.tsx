// The design nodes' illustrations (lib/workflow/designNodes.ts): the five design steps drawn in the same isometric family
// as the analysis nodes (components/icons/nodeArt.tsx primitives: the plate, three tones, light from the upper left, the
// task in its phase colour). A design node shows the work itself, not a check: no tick, no cue.
import type { ReactNode } from 'react'
import { box, flat, iso, line, plate, tones, type Ctx } from './nodeArt'

const A = (c: Ctx, k: 0 | 1 | 2) => tones('a', c.h, c.a)[k]

export const DESIGN_ART: Record<string, (c: Ctx) => ReactNode> = {
  // Site: the lot on the ground, its corners pinned, with the neighbours beside it
  'design.site': (c) => <>{plate(c)}
    {flat(A(c, 0), 0.95, [3.2, 3.2], [11.6, 3.2], [11.6, 11.6], [3.2, 11.6])}
    {[[3.2, 3.2], [11.6, 3.2], [11.6, 11.6], [3.2, 11.6]].map(([x, y], i) => <circle key={i} cx={iso(x, y, 0.95)[0]} cy={iso(x, y, 0.95)[1]} r={0.9} fill={A(c, 2)} />)}
    {box(c, 12.4, 4, 0.9, 2.4, 3, 4)}{box(c, 4, 12.4, 0.9, 3, 2.4, 3)}</>,
  // Massing: a podium and a tower rising from it, the tower in the task colour
  'design.massing': (c) => <>{plate(c)}{box(c, 2.6, 3.4, 0.9, 10.5, 9, 3)}{box(c, 5.2, 5.6, 3.9, 5, 5, 11.5, 'a')}</>,
  // Program: a tower in stacked bands of use
  'design.program': (c) => <>{plate(c)}{[0, 1, 2, 3].map((k) => <g key={k}>{box(c, 5, 5, 0.9 + k * 3.2, 6, 6, 3.2, k % 2 ? 'a' : 'n')}</g>)}</>,
  // Plates, core and plant: floor plates threaded on the core
  'design.plates': (c) => <>{plate(c)}{[0, 1, 2].map((k) => <g key={k}>{box(c, 3.2, 3.2, 1.6 + k * 4.4, 9.6, 9.6, 0.7)}</g>)}{box(c, 6.6, 6.6, 0.9, 2.8, 2.8, 13.6, 'a')}</>,
  // Frame and capture: the tower inside a view frame
  'design.frame': (c) => <>{plate(c)}{box(c, 6, 6, 0.9, 4, 4, 10)}
    {([[[8, 10], [8, 6], [12, 6]], [[36, 6], [40, 6], [40, 10]], [[8, 30], [8, 34], [12, 34]], [[36, 34], [40, 34], [40, 30]]] as [number, number][][]).map((p, i) => <g key={i}>{line(p[0], p[1], A(c, 2), 1.6)}{line(p[1], p[2], A(c, 2), 1.6)}</g>)}</>,
}
