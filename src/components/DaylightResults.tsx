// Inspector for the Daylight screen node (backlog item 36, research P02-M06): for each occupied use, its typical plan
// with the daylit / marginal / deep bands, a one-line verdict, and every rule with its source and evidence flag.
import { useMemo } from 'react'
import { daylightScreen, verdict, type UseScreen } from '../engine/daylightDepth'
import { towerFloors } from '../engine/massing'
import type { RuleResult } from '../engine/types'
import { useStore, useTowers } from '../store'
import { BAND_STYLE, BandLayer } from './DaylightBands'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}</a> : <span className="text-meta text-muted">{r.source.label}</span>}
      </div>
    </div>
  )
}

/** The typical plate at a fixed size, with the bands. */
function MiniPlan({ u }: { u: UseScreen }) {
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

const USE_LABEL: Record<UseScreen['use'], string> = { office: 'Office', residential: 'Homes', hotel: 'Hotel rooms' }

export default function DaylightResults() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const r = useMemo(() => (t ? daylightScreen(t, towerFloors(t)) : null), [t])
  if (!t || !r) return null
  return (
    <Section title={`Daylight screen · ${t.name}`} help="Distance from the glass on each use's typical floor, against the window head height (floor-to-floor minus the head drop).">
      <p className="text-meta text-slate-600">A geometric proxy: glazing, neighbours, blinds and climate are left out, so run a daylight simulation before relying on it.</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[10.5px]" aria-label="Band key">
        {(Object.keys(BAND_STYLE) as (keyof typeof BAND_STYLE)[]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-sm border border-line" style={{ background: BAND_STYLE[b].fill, opacity: 0.4 + BAND_STYLE[b].opacity }} />{b === 'marginal' ? `Marginal (≤ ${r.k} × head)` : b === 'deep' ? `Deep (beyond ${r.k} × head)` : BAND_STYLE[b].label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-sm border border-dashed border-slate-500 bg-white" />Core or corridor (not counted)</span>
      </div>
      {r.uses.map((u) => (
        <div key={u.use} className="mt-3 rounded-md border border-line p-2" data-daylight-use={u.use}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{USE_LABEL[u.use]} · level {u.level}</span><StateChip state={u.state} /></div>
          <div className="mt-1 space-y-1.5">
            <MiniPlan u={u} />
            <div className="text-meta">
              <p>{verdict(u)}</p>
              <table className="mt-1 w-full text-[10.5px]">
                <tbody>
                  {(['daylit', 'marginal', 'deep'] as const).map((b) => <tr key={b}><td className="pr-2 text-muted">{b === 'daylit' ? `Daylit (≤ ${u.d1.toFixed(1)} m)` : b === 'marginal' ? `Marginal (≤ ${u.d2.toFixed(1)} m)` : `Deep (> ${u.d2.toFixed(1)} m)`}</td><td className="tabular-nums">{Math.round(u.shares[b] * 100)}%</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      <div className="mt-3 space-y-1.5">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
      <p className="mt-2 text-[10.5px] text-muted">The bands also show on the typical plan in Present when this node is on.</p>
    </Section>
  )
}
