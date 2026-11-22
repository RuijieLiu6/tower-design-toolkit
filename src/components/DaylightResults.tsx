// Inspector for the Daylight screen node (backlog item 36, research P02-M06): for each occupied use, its typical plan
// with the daylit / marginal / deep bands, a one-line verdict, and every rule with its source and evidence flag.
import SheetFrame from './SheetFrame'
import { useMemo } from 'react'
import { daylightScreen, verdict, type UseScreen } from '../engine/daylightDepth'
import { towerFloors } from '../engine/massing'
import { useStore, useTowers } from '../store'
import { BAND_STYLE, BandLayer } from './DaylightBands'
import { Section, StateChip } from './ui'
import { Fold, Legend, MethodFold, RuleRows, Stack } from './ResultViz'


/** The typical plate at a fixed size, with the bands. */
function MiniPlanDrawing({ u }: { u: UseScreen }) {
  const { W, D } = u.plate
  const box = 120, pad = 4, k = Math.min((box - 2 * pad) / W, (box * 0.8 - 2 * pad) / D)
  const h = D * k + 2 * pad
  const m = { X: (x: number) => box / 2 + x * k, Y: (y: number) => h / 2 - y * k, mm: (v: number) => v * k }
  return (
    <svg viewBox={`0 0 ${box} ${h}`} className="w-full max-w-[220px]" role="img"
      aria-label={`${u.use} typical plan: daylit ${Math.round(u.shares.daylit * 100)}%, marginal ${Math.round(u.shares.marginal * 100)}%, deep ${Math.round(u.shares.deep * 100)}%`}>
      <BandLayer u={u} m={m} labels={false} />
      <rect x={m.X(-W / 2)} y={m.Y(D / 2)} width={W * k} height={D * k} fill="none" stroke="#1f2328" strokeWidth="0.8" />
    </svg>
  )
}

const BAND_COL = { daylit: '#f2c94c', marginal: '#e08e2b', deep: '#7b8797' }
const USE_LABEL: Record<UseScreen['use'], string> = { office: 'Office', residential: 'Homes', hotel: 'Hotel rooms' }

export default function DaylightResults() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? daylightScreen(t, towerFloors(t)) : null), [t])
  if (!t || !r) return null
  return (
    <Section title={`Daylight screen · ${t.name}`} help="Distance from the glass on each use's typical floor, against three sourced daylight depths: 6 m, 1.5 × the clear height (overcast) and 2.5 × (window head − 0.76 m).">
      <Legend items={[...(Object.keys(BAND_STYLE) as (keyof typeof BAND_STYLE)[]).map((b) => ({ label: b === 'marginal' ? 'marginal (within the most generous sourced depth)' : b === 'deep' ? 'deep (beyond every sourced depth)' : `${BAND_STYLE[b].label.toLowerCase()} (within the strictest)`, color: BAND_COL[b] })), { label: 'core, corridor', color: '#ffffff', dashed: true, tip: 'Core or corridor: not counted' }]} />
      <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {r.uses.map((u) => (
          <div key={u.use} className="min-w-0 rounded-md border border-line p-2" data-daylight-use={u.use} title={verdict(u)}>
            <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-semibold">{USE_LABEL[u.use]} · level {u.level}</span><StateChip state={u.state} /></div>
            <div className="mt-1 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5">
              <MiniPlan u={u} />
              <div className="grid min-w-0 gap-1">
                <div className="text-meta"><b className="text-control tabular-nums">{Math.round(u.withinReach * 100)}%</b> <span className="text-muted">within daylight reach</span></div>
                <Stack label={`${USE_LABEL[u.use]}: share of the occupied floor by daylight band`} fmt={(v) => `${Math.round(v * 100)}%`} parts={(['daylit', 'marginal', 'deep'] as const).map((b) => ({ label: b, v: u.shares[b], color: BAND_COL[b], tip: `${b === 'daylit' ? `Daylit (≤ ${u.d1.toFixed(1)} m)` : b === 'marginal' ? `Marginal (≤ ${u.d2.toFixed(1)} m)` : `Deep (> ${u.d2.toFixed(1)} m)`}: ${Math.round(u.shares[b] * 100)}%` }))} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3"><Fold title={`${r.rules.length} rule lines behind the plans`}><RuleRows rules={r.rules} /></Fold></div>
      <MethodFold>
        <p>A geometric proxy: glazing, neighbours, blinds and climate are left out, so run a daylight simulation before relying on it.</p>
        {r.uses.map((u) => <p key={u.use}>{verdict(u)}</p>)}
        <p>The bands also show on the typical plan in Present when this node is on.</p>
      </MethodFold>
    </Section>
  )
}

/** Daylight: floor plate, with its Sheet button (components/SheetFrame). */
function MiniPlan(p: Parameters<typeof MiniPlanDrawing>[0]) { return <SheetFrame title="Daylight: floor plate"><MiniPlanDrawing {...p} /></SheetFrame> }
