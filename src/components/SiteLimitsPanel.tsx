// Site limits: tower separation and floor plate (engine/siteLimits.ts), the two tabs Sinnie added to the height limits
// (17 Nov 2026). Separation draws the towers above 21.4 m with the 24.4 m clearance around them, the buildings over
// 21.4 m nearby, and the shortest distance; floor plate shows each tower's plate and width against the limits.
import { useMemo } from 'react'
import { offsetPoly } from '../engine/drawn'
import { PLATE_MAX_M2, plateCheck, SEPARATION_M, separationCheck, TOWER_ABOVE_M, upperRings, WIDTH_MAX_M } from '../engine/siteLimits'
import { useSwInputs } from '../lib/swInputs'
import { useTowers } from '../store'
import { RuleRows } from './ResultViz'
import SheetFrame from './SheetFrame'
import { Section } from './ui'

type Pt = [number, number]

export function useSiteLimits() {
  const towers = useTowers()
  const { context } = useSwInputs()
  return useMemo(() => ({ separation: separationCheck(towers, context), plate: plateCheck(towers) }), [towers, context])
}

const COL = { pass: '#15803d', warn: '#b45309', fail: '#b91c1c', unknown: '#6b7280' } as const

/** Plan: the towers above 21.4 m (dark), their 24.4 m clearance (dashed), buildings over 21.4 m within reach, the gap. */
function SeparationPlan() {
  const towers = useTowers()
  const { context } = useSwInputs()
  const { separation } = useSiteLimits()
  const mine = towers.flatMap(upperRings)
  if (!mine.length) return null
  const pts = mine.flat()
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const R = Math.max(60, ...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) + SEPARATION_M * 1.6
  const near = context.filter((c) => c.z1 > TOWER_ABOVE_M && (c.ring as Pt[]).some((p) => Math.hypot(p[0] - cx, p[1] - cy) < R))
  const S = 260, k = S / (2 * R), X = (x: number) => S / 2 + (x - cx) * k, Y = (y: number) => S / 2 - (y - cy) * k
  const d = (r: Pt[]) => `M${r.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z`
  // Only the gaps that matter: any under the 24.4 m, and each tower's nearest (so a clear site still shows its margin).
  const hits = separation.flatMap((s) => s.hits.filter((h, i) => h.d < SEPARATION_M || i === 0))
  return (
    <SheetFrame title="Tower separation, plan">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full rounded-md border border-line bg-[#f7f8fa]" role="img" aria-label={`Plan: the towers above ${TOWER_ABOVE_M} m with a ${SEPARATION_M} m clearance and the buildings over ${TOWER_ABOVE_M} m around them`}>
        {near.map((c, i) => <path key={i} d={d(c.ring as Pt[])} fill="#cfd4da"><title>{`Existing building, ${Math.round(c.z1)} m tall`}</title></path>)}
        {mine.map((r, i) => <path key={`o${i}`} d={d(offsetPoly(r, SEPARATION_M))} fill="rgba(31,95,139,0.06)" stroke="#1f5f8b" strokeDasharray="4 3" strokeWidth={1} />)}
        {mine.map((r, i) => <path key={`t${i}`} d={d(r)} fill="#1f5f8b" />)}
        {hits.map((h, i) => { const c = h.d < SEPARATION_M ? (h.d < SEPARATION_M * 0.75 ? COL.fail : COL.warn) : COL.pass
          return <g key={`h${i}`}><line x1={X(h.p[0])} y1={Y(h.p[1])} x2={X(h.q[0])} y2={Y(h.q[1])} stroke={c} strokeWidth={2} /><text x={(X(h.p[0]) + X(h.q[0])) / 2 + 4} y={(Y(h.p[1]) + Y(h.q[1])) / 2 - 3} fontSize={10} fontWeight={600} fill={c}>{h.d.toFixed(1)} m</text></g> })}
        <line x1={10} x2={10 + 20 * k} y1={S - 10} y2={S - 10} stroke="#1f2328" strokeWidth={1.5} /><text x={14 + 20 * k} y={S - 7} fontSize={9} fill="#5b6672">20 m</text>
      </svg>
      <p className="mt-1 text-meta text-muted">Dark: the towers above {TOWER_ABOVE_M} m. Dashed: {SEPARATION_M} m around them. Grey: buildings over {TOWER_ABOVE_M} m. Line: the nearest gap, and any under {SEPARATION_M} m.</p>
    </SheetFrame>
  )
}

export function SeparationPanel() {
  const { separation } = useSiteLimits()
  if (!separation.length) return <Section title="Tower separation"><p className="text-meta text-muted">At least {SEPARATION_M} m (80 ft) between the parts of towers above {TOWER_ABOVE_M} m. Place a tower to measure its gaps.</p></Section>
  return (
    <Section title="Tower separation">
      <div className="grid gap-2">
        <SeparationPlan />
        {separation.map((s) => <div key={s.tower.id}><p className="text-meta font-semibold text-ink">{s.tower.name}</p><RuleRows rules={s.rules} /></div>)}
      </div>
    </Section>
  )
}

/** Each tower's plate and width as bars against the limits. */
function PlateBars() {
  const { plate } = useSiteLimits()
  const W = 280, L = 70, pw = W - L - 70
  const rows = plate.filter((p) => p.use !== 'none')
  if (!rows.length) return null
  const maxA = Math.max(PLATE_MAX_M2 * 1.3, ...rows.map((r) => r.plate)), maxW = Math.max(WIDTH_MAX_M * 1.3, ...rows.map((r) => r.width))
  const bar = (y: number, v: number, max: number, lim: number, capped: boolean, txt: string, label: string) => {
    const c = !capped ? '#6b7280' : v > lim * 1.15 ? COL.fail : v > lim ? COL.warn : COL.pass
    return (
      <g transform={`translate(0 ${y})`}>
        <text x={L - 4} y={10} fontSize={9} textAnchor="end" fill="#5b6672">{label}</text>
        <rect x={L} y={2} width={pw} height={10} rx={1.5} fill="#eef0f3" /><rect x={L} y={2} width={pw * Math.min(1, v / max)} height={10} rx={1.5} fill={c} />
        <line x1={L + pw * (lim / max)} x2={L + pw * (lim / max)} y1={0} y2={14} stroke="#1f2328" strokeWidth={1.2} />
        <text x={W - 2} y={10} fontSize={9} textAnchor="end" fill="#1f2328">{txt}</text>
      </g>
    )
  }
  return (
    <SheetFrame title="Tower floor plate and width">
      <svg viewBox={`0 0 ${W} ${rows.length * 40 + 4}`} className="w-full" role="img" aria-label="Floor plate and tower width against the limits">
        {rows.map((r, i) => <g key={r.tower.id} transform={`translate(0 ${i * 40})`}>
          {bar(0, r.plate, maxA, PLATE_MAX_M2, r.use !== 'office', `${Math.round(r.plate)} m²`, rows.length > 1 ? `${r.tower.name.slice(0, 10)} plate` : 'Floor plate')}
          {bar(18, r.width, maxW, WIDTH_MAX_M, r.use !== 'office', `${r.width.toFixed(1)} m`, 'Width')}
        </g>)}
      </svg>
      <p className="mt-1 text-meta text-muted">Ticks: {PLATE_MAX_M2} m² (6,500 sq ft) and {WIDTH_MAX_M} m (90 ft), for residential towers above {TOWER_ABOVE_M} m. Grey: office, reported only.</p>
    </SheetFrame>
  )
}

export function PlatePanel() {
  const { plate } = useSiteLimits()
  if (!plate.length) return <Section title="Tower floor plate"><p className="text-meta text-muted">Residential plates above {TOWER_ABOVE_M} m: at most {PLATE_MAX_M2} m² (6,500 sq ft), {WIDTH_MAX_M} m (90 ft) wide or deep. Place a tower to measure it.</p></Section>
  return (
    <Section title="Tower floor plate">
      <div className="grid gap-2">
        <PlateBars />
        {plate.map((p) => <div key={p.tower.id}><p className="text-meta font-semibold text-ink">{p.tower.name}</p><RuleRows rules={p.rules} /></div>)}
      </div>
    </Section>
  )
}
