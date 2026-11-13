// A floor plan with a result drawn on it, as Sun & Wind Studio's plan panel (study.js planSVG): the plate in its own
// axes, one cell per sensor coloured by the value, the core, each façade edge in its face colour (solid where the
// windows open, dashed where fixed) and a north arrow. Used in the results and in the analysis view.
import type { ReactNode } from 'react'
import { zoneFor, type FacadeZone, type Face, type SwFloor } from '../../engine/sw/plate'

export const FACE_COL: Record<Face, string> = { N: '#3b6fb6', E: '#d08b2c', S: '#c2412d', W: '#7a5ab8' }

export interface PlanGrid { x0: number; y0: number; h: number; nx: number; ny: number }
export interface Ramp { color: (v: number) => string; stops: { v: number; label: string }[]; unit: string }

const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t))
const rgb = (c: number[]) => `rgb(${c.join(',')})`
const multi = (stops: [number, number[]][]) => (v: number) => {
  if (!(v > stops[0][0])) return rgb(stops[0][1])
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) return rgb(lerp(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])))
  return rgb(stops[stops.length - 1][1])
}

/** The Studio's colour ramps (study.js rampDA, rampDF, rampASE, rampLux), with their key stops. */
export const RAMPS = {
  da: { color: multi([[0, [44, 62, 96]], [0.5, [150, 170, 190]], [1, [240, 196, 92]]]), stops: [{ v: 0, label: '0%' }, { v: 0.5, label: '50%' }, { v: 1, label: '100%' }], unit: 'of occupied hours over target' },
  df: { color: multi([[0, [52, 76, 110]], [0.02, [222, 228, 236]], [0.05, [217, 144, 31]]]), stops: [{ v: 0, label: '0' }, { v: 0.02, label: '2%' }, { v: 0.05, label: '5%+' }], unit: 'daylight factor' },
  ase: { color: multi([[0, [240, 224, 190]], [500, [184, 54, 43]]]), stops: [{ v: 0, label: '0 h' }, { v: 250, label: '250' }, { v: 500, label: '500 h+' }], unit: 'hours of direct sun over 1,000 lux' },
  lux: { color: multi([[0, [30, 38, 60]], [100, [70, 90, 130]], [300, [150, 170, 190]], [1000, [236, 218, 160]], [3000, [245, 190, 70]], [10000, [230, 120, 40]]]), stops: [{ v: 0, label: '0' }, { v: 300, label: '300' }, { v: 3000, label: '3,000' }, { v: 10000, label: '10k lux' }], unit: 'lux on the work plane' },
  reach: { color: (v: number) => (v <= 0 ? '#e6d4d1' : v <= 8 ? '#5aa3aa' : v <= 30 ? '#b5d6d9' : '#e6d4d1'), stops: [{ v: 1, label: '≤ 8 m' }, { v: 20, label: 'within the depth rule' }, { v: 99, label: 'beyond' }], unit: 'to an openable window' },
  temp: { color: multi([[14, [58, 98, 168]], [20, [170, 200, 220]], [24, [236, 226, 196]], [28, [230, 140, 70]], [32, [180, 50, 40]]]), stops: [{ v: 14, label: '14°' }, { v: 22, label: '22°' }, { v: 32, label: '32 °C' }], unit: 'indoor temperature' },
  speed: { color: multi([[0, [236, 240, 244]], [0.3, [150, 200, 210]], [1, [40, 120, 150]]]), stops: [{ v: 0, label: 'still' }, { v: 0.5, label: '0.5' }, { v: 1, label: '1 m/s+' }], unit: 'air speed' },
} satisfies Record<string, Ramp>

export function RampKey({ ramp }: { ramp: Ramp }) {
  const lo = ramp.stops[0].v, hi = ramp.stops[ramp.stops.length - 1].v
  const n = 24
  return (
    <div className="flex items-center gap-2 text-meta text-muted" data-testid="plan-key">
      <svg viewBox={`0 0 ${n * 6} 10`} width={n * 6} height={10} aria-hidden>{Array.from({ length: n }, (_, i) => <rect key={i} x={i * 6} width={6.2} height={10} fill={ramp.color(lo + ((hi - lo) * i) / (n - 1))} />)}</svg>
      <span>{ramp.stops.map((s) => s.label).join(' · ')}</span>
    </div>
  )
}

export default function FloorPlan({ f, zones, grid, values, ramp, children, size = 300, label }: {
  f: SwFloor; zones: FacadeZone[]; grid?: PlanGrid; values?: ArrayLike<number> | null; ramp?: Ramp; children?: ReactNode; size?: number; label: string
}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of f.rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const pad = Math.max(4, (x1 - x0) * 0.08)
  const W = x1 - x0 + 2 * pad, H = y1 - y0 + 2 * pad
  const vb = `${x0 - pad} ${-(y1 + pad)} ${W} ${H}`
  const cells: ReactNode[] = []
  if (grid && values && ramp) {
    for (let iy = 0; iy < grid.ny; iy++) for (let ix = 0; ix < grid.nx; ix++) {
      const v = values[iy * grid.nx + ix]
      if (!(v >= 0) && !(v < 0)) continue
      const x = grid.x0 + ix * grid.h, y = grid.y0 + iy * grid.h
      if (!inPlate(f, x + grid.h / 2, y + grid.h / 2)) continue
      cells.push(<rect key={iy * grid.nx + ix} x={x} y={-(y + grid.h)} width={grid.h + 0.02} height={grid.h + 0.02} fill={ramp.color(v)} />)
    }
  }
  // north in the floor's axes: the north frame's +y turned back by the floor's rotation
  const na = -f.rot, nx = -Math.sin(na), ny = Math.cos(na)
  const ax = x1 + pad * 0.55, ay = y1 + pad * 0.1, L = pad * 0.45
  const c = f.core
  return (
    <svg viewBox={vb} width="100%" style={{ maxWidth: size }} role="img" aria-label={label} className="mx-auto block" data-testid="floor-plan">
      {f.rings.map((r, i) => <path key={i} d={`M${r.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L')}Z`} fill="#f3f4f6" />)}
      {cells}
      <rect x={c.x - c.half} y={-(c.y + c.half)} width={2 * c.half} height={2 * c.half} fill="#9aa1aa" opacity={0.75} />
      {f.edges.map((e, i) => {
        const z = zoneFor(zones, e.o, f.level)
        const ax0 = e.mx - (e.ux * e.L) / 2, ay0 = e.my - (e.uy * e.L) / 2, bx = e.mx + (e.ux * e.L) / 2, by = e.my + (e.uy * e.L) / 2
        return <line key={i} x1={ax0} y1={-ay0} x2={bx} y2={-by} stroke={FACE_COL[e.o]} strokeWidth={z.operable ? 0.9 : 0.55} strokeDasharray={z.operable ? undefined : '1.2 0.8'}><title>{`${e.o} face · ${z.strat}${z.operable ? ' · operable' : ''}`}</title></line>
      })}
      {children}
      <g stroke="#1f2328" fill="#1f2328" strokeWidth={0.35}>
        <line x1={ax - nx * L} y1={-(ay - ny * L)} x2={ax + nx * L} y2={-(ay + ny * L)} />
        <circle cx={ax + nx * L} cy={-(ay + ny * L)} r={L * 0.22} />
        <text x={ax + nx * L * 1.7} y={-(ay + ny * L * 1.7)} fontSize={L * 0.75} textAnchor="middle" dominantBaseline="middle" stroke="none">N</text>
      </g>
    </svg>
  )
}

const insideRing = (x: number, y: number, r: [number, number][]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o } return o }
export const inPlate = (f: SwFloor, x: number, y: number) => f.rings.some((r) => insideRing(x, y, r as [number, number][])) && !(Math.abs(x - f.core.x) <= f.core.half && Math.abs(y - f.core.y) <= f.core.half)
