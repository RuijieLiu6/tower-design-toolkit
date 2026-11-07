// The site as a small plan (Ruijie, 6 Nov: information as graphics): its outline, the towers' footprints on it, and a north
// arrow. Fitted to the box, north as the project has it (Real Vancouver: up; the competition grid: 45° from up). Used by
// Your site (site/SiteInfo.tsx).
import { towerFootprint } from '../../engine/massing'
import type { Tower } from '../../engine/types'

type Pt = [number, number]

/** A street on the plan: its band to its right-of-way width beyond the site's sides, the property line in `color`. */
export interface PlanStreet { edges: { a: Pt; b: Pt; out: Pt; length: number }[]; row: number; color: string; label?: string; dashed?: boolean }

/**
 * `marks`: extra outlines on the plan (a check's result, e.g. Open space & links' POPS rectangle), in the project frame.
 * `streets` (7 Nov): the streets along the site, as bands of their right-of-way, each property line coloured by its type
 * or by a check's state.
 */
export default function SitePlan({ ring, towers, northDeg = 0, selected, size = 96, label, marks = [], streets = [] }: { ring: Pt[]; towers: Tower[]; northDeg?: number; selected?: string; size?: number; label: string; marks?: { ring: Pt[]; fill: string; stroke: string }[]; streets?: PlanStreet[] }) {
  const fps = towers.map((t) => ({ id: t.id, ring: towerFootprint(t, true) as Pt[] }))
  const far = (p: Pt, o: Pt, d: number): Pt => [p[0] + o[0] * d, p[1] + o[1] * d]
  const bands = streets.flatMap((st) => st.edges.map((e) => [e.a, e.b, far(e.b, e.out, st.row), far(e.a, e.out, st.row)] as Pt[]))
  const pts = [...ring, ...fps.flatMap((f) => f.ring), ...bands.flat()]
  if (pts.length < 3) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const pad = 8, k = (size - 2 * pad) / Math.max(1, x1 - x0, y1 - y0)
  const ox = pad + ((size - 2 * pad) - (x1 - x0) * k) / 2, oy = pad + ((size - 2 * pad) - (y1 - y0) * k) / 2
  // Project frame (y north-ish) to the picture (y down).
  const P = (p: Pt) => `${(ox + (p[0] - x0) * k).toFixed(1)},${(size - oy - (p[1] - y0) * k).toFixed(1)}`
  const path = (r: Pt[]) => `M${r.map(P).join('L')}Z`
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} data-testid="site-plan" className="shrink-0 rounded-md border border-line bg-[#f7f5f0]">
      {bands.map((b, i) => <path key={`b${i}`} d={path(b)} fill="#e6e8eb" />)}
      <path d={path(ring)} className="fill-accent/10 stroke-accent" strokeWidth={1.2} strokeDasharray="4 2" />
      {streets.flatMap((st, i) => st.edges.map((e, j) => {
        const [ax, ay] = P(far(e.a, e.out, 1.2 / k)).split(',').map(Number), [bx, by] = P(far(e.b, e.out, 1.2 / k)).split(',').map(Number)
        return <line key={`s${i}-${j}`} x1={ax} y1={ay} x2={bx} y2={by} stroke={st.color} strokeWidth={2.4} strokeDasharray={st.dashed ? '3 2' : undefined} strokeLinecap="round" />
      }))}
      {streets.map((st, i) => {
        if (!st.label || !st.edges.length) return null
        const e = st.edges.reduce((m, x) => (x.length > m.length ? x : m))
        const mid: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
        const [x, y] = P(far(mid, e.out, st.row / 2)).split(',').map(Number)
        let deg = (-Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180) / Math.PI
        if (deg > 90) deg -= 180
        if (deg < -90) deg += 180
        return <text key={`l${i}`} x={x} y={y} transform={`rotate(${deg.toFixed(1)} ${x} ${y})`} dominantBaseline="middle" textAnchor="middle" className="fill-slate-600" style={{ fontSize: Math.max(5.5, Math.min(8, st.row * k * 0.45)) }}>{st.label}</text>
      })}
      {marks.map((m, i) => <path key={`m${i}`} d={path(m.ring)} fill={m.fill} stroke={m.stroke} strokeWidth={0.8} />)}
      {fps.map((f) => <path key={f.id} d={path(f.ring)} className={f.id === selected ? 'fill-accent stroke-accent' : 'fill-slate-400 stroke-slate-600'} strokeWidth={0.6} />)}
      <g transform={`translate(${size - 11} 12) rotate(${northDeg})`} aria-hidden>
        <path d="M0 -8 L3.5 3 L0 1 L-3.5 3 Z" className="fill-ink" />
        <text y={-9.5} textAnchor="middle" className="fill-ink text-[7px] font-semibold">N</text>
      </g>
    </svg>
  )
}

/** A tower as a tiny elevation: its height to scale against the tallest on the site, the podium as a wider base. */
export function TowerGlyph({ t, max }: { t: Tower; max: number }) {
  const H = 26, h = Math.max(3, (t.height / Math.max(1, max)) * H), pod = t.podiumHeight > 0 ? Math.max(2, (t.podiumHeight / Math.max(1, max)) * H) : 0
  return (
    <svg viewBox={`0 0 18 ${H + 2}`} width={18} height={H + 2} aria-hidden className="shrink-0">
      <line x1={0} x2={18} y1={H + 1} y2={H + 1} className="stroke-slate-400" strokeWidth={1} />
      {pod > 0 && <rect x={2} y={H + 1 - pod} width={14} height={pod} className="fill-slate-300" />}
      <rect x={5.5} y={H + 1 - h} width={7} height={h - pod} className="fill-accent/70" />
    </svg>
  )
}
