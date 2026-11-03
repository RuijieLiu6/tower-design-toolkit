// Results for the three public realm nodes (research P06): a site plan coloured by the check, then rule cards.
import type { ReactNode } from 'react'
import { STATION_CORNER, VTC_EDGES, VTC_SITE, type EdgeId } from '../engine/publicRealm'
import { towerFootprint } from '../engine/massing'
import type { RuleResult, RuleState } from '../engine/types'
import { useResults } from '../hooks/useResults'
import { useStore, useTowers } from '../store'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

const STATE_COLOR: Record<RuleState, string> = { pass: '#2e8b57', warn: '#d98b1c', fail: '#d0453a', unknown: '#8a8f98' }

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· needs <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

/** Plan of the block with its four streets (drawn to right-of-way width), the massing and the selected check. */
function SitePlan({ edgeState, children }: { edgeState: Partial<Record<EdgeId, RuleState>>; children?: ReactNode }) {
  const towers = useTowers()
  const pad = 34, W = VTC_SITE.xMax - VTC_SITE.xMin, D = VTC_SITE.yMax - VTC_SITE.yMin
  const k = 260 / (W + 2 * pad)
  const X = (x: number) => (x - VTC_SITE.xMin + pad) * k, Y = (y: number) => (VTC_SITE.yMax - y + pad) * k
  const width = (W + 2 * pad) * k, height = (D + 2 * pad) * k
  const row = (id: EdgeId) => VTC_EDGES.find((e) => e.id === id)!.row
  const pts = (poly: [number, number][]) => poly.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Site plan with the public realm check">
      {/* streets as bands of their right-of-way width */}
      <rect x={X(VTC_SITE.xMin - row('west'))} y={Y(VTC_SITE.yMax + row('north'))} width={(W + row('west') + row('east')) * k} height={(D + row('north') + row('south')) * k} fill="#eef0f2" />
      <rect x={X(VTC_SITE.xMin)} y={Y(VTC_SITE.yMax)} width={W * k} height={D * k} fill="#ffffff" stroke="#1f5f8b" strokeWidth="1" />
      {VTC_EDGES.map((e) => {
        const s = edgeState[e.id]
        const [x1, y1, x2, y2] = e.id === 'south' ? [VTC_SITE.xMin, VTC_SITE.yMin, VTC_SITE.xMax, VTC_SITE.yMin] : e.id === 'north' ? [VTC_SITE.xMin, VTC_SITE.yMax, VTC_SITE.xMax, VTC_SITE.yMax]
          : e.id === 'west' ? [VTC_SITE.xMin, VTC_SITE.yMin, VTC_SITE.xMin, VTC_SITE.yMax] : [VTC_SITE.xMax, VTC_SITE.yMin, VTC_SITE.xMax, VTC_SITE.yMax]
        const off = 3 / k, [ox, oy] = e.out
        const lx = (x1 + x2) / 2 + ox * (e.row / 2), ly = (y1 + y2) / 2 + oy * (e.row / 2)
        return (
          <g key={e.id}>
            {s && <line x1={X(x1 + ox * off)} y1={Y(y1 + oy * off)} x2={X(x2 + ox * off)} y2={Y(y2 + oy * off)} stroke={STATE_COLOR[s]} strokeWidth="4" />}
            <text x={X(lx)} y={Y(ly) + 3} fontSize="7" textAnchor="middle" fill="#3d434b" transform={e.id === 'west' || e.id === 'east' ? `rotate(-90 ${X(lx)} ${Y(ly)})` : undefined}>{e.street.replace(' (local)', '')} · {e.row.toFixed(1)} m</text>
          </g>
        )
      })}
      {children}
      {towers.map((t) => (
        <g key={t.id}>
          {t.podiumHeight > 0 && <polygon points={pts(towerFootprint(t, true))} fill="#e3a07a" fillOpacity="0.45" stroke="#b5651d" strokeWidth="0.6" />}
          <polygon points={pts(towerFootprint(t))} fill="#6b8fb5" fillOpacity="0.75" stroke="#1f2328" strokeWidth="0.6" />
        </g>
      ))}
      <circle cx={X(STATION_CORNER[0])} cy={Y(STATION_CORNER[1])} r="3" fill="#2a8f86" />
      <text x={X(STATION_CORNER[0]) - 4} y={Y(STATION_CORNER[1]) + 10} fontSize="6.5" textAnchor="end" fill="#2a8f86">to station</text>
    </svg>
  )
}

export default function PublicRealmResults({ id }: { id: string }) {
  const { streetwall, frontage, groundPlane } = useResults()
  const input = useStore((s) => s.publicRealm)
  const project = useStore((s) => s.project)
  if (project !== 'vtc') return <Section title="Results"><p className="text-[11px] text-muted">Runs on the competition site, whose streets are known. Switch to "Competition site".</p></Section>

  if (id === 'built.pr-streetwall' && streetwall) {
    const edgeState = Object.fromEntries(streetwall.edges.map((w) => [w.edge.id, w.state])) as Partial<Record<EdgeId, RuleState>>
    return (
      <Section title="Results">
        <SitePlan edgeState={edgeState} />
        <p className="mb-2 mt-1 text-[10px] text-muted">Street edges coloured by streetwall height against Table 2.2b for that street's width.</p>
        <div className="grid gap-2">{streetwall.rules.map((r) => <Card key={r.id} r={r} />)}</div>
      </Section>
    )
  }
  if (id === 'built.pr-frontage' && frontage) {
    const edgeState = Object.fromEntries(frontage.edges.map((x) => [x.edge.id, x.state])) as Partial<Record<EdgeId, RuleState>>
    return (
      <Section title="Results">
        <SitePlan edgeState={edgeState} />
        <table className="mb-2 mt-1 w-full text-[11px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="py-0.5 font-medium">Street</th><th className="text-right font-medium">Frontage</th><th className="text-right font-medium">Active</th><th className="text-right font-medium">Entrance every</th></tr></thead>
          <tbody>{frontage.edges.map((x) => (
            <tr key={x.edge.id} className="border-t border-line/60">
              <td className="py-0.5"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: STATE_COLOR[x.state] }} />{x.edge.street.replace(' (local)', '')}</td>
              <td className="text-right tabular-nums">{x.length.toFixed(0)} m</td>
              <td className="text-right tabular-nums">{Math.round(input.frontage[x.edge.id].active * 100)}%</td>
              <td className="text-right tabular-nums">{x.spacing === null ? '—' : `${x.spacing.toFixed(0)} m`}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="grid gap-2">{frontage.rules.map((r) => <Card key={r.id} r={r} />)}</div>
      </Section>
    )
  }
  if (id === 'built.pr-ground' && groundPlane) {
    const os = groundPlane.open, L = groundPlane.link
    const pad = 34, W = VTC_SITE.xMax - VTC_SITE.xMin
    const k = 260 / (W + 2 * pad)
    const X = (x: number) => (x - VTC_SITE.xMin + pad) * k, Y = (y: number) => (VTC_SITE.yMax - y + pad) * k
    return (
      <Section title="Results">
        <div className="relative">
          <SitePlan edgeState={{}}>
            {os.largest && <rect x={X(os.largest.x0)} y={Y(os.largest.y1)} width={(os.largest.x1 - os.largest.x0) * k} height={(os.largest.y1 - os.largest.y0) * k} fill="#3c8d5a" fillOpacity="0.3" stroke="#3c8d5a" strokeWidth="0.8" />}
            {L && <rect x={X(L.x0)} y={Y(L.y1)} width={(L.x1 - L.x0) * k} height={(L.y1 - L.y0) * k} fill={L.through === 'tower' ? '#d0453a' : L.through === 'podium' ? '#d98b1c' : '#1d5fa8'} fillOpacity="0.25" stroke="#1d5fa8" strokeWidth="0.8" strokeDasharray="3 2" />}
            <rect x={X(STATION_CORNER[0])} y={Y(STATION_CORNER[1] + 6.1)} width={6.1 * k} height={6.1 * k} fill={os.transitPlaza ? '#2a8f86' : '#d0453a'} fillOpacity="0.6" />
          </SitePlan>
        </div>
        <p className="mb-2 mt-1 text-[10px] text-muted">Green: the largest clear rectangle of open ground (the POPS candidate). Blue dashed: the mid-block link. Teal square: room for a 6.1 m transit plaza by the station corner.</p>
        <div className="grid gap-2">{groundPlane.rules.map((r) => <Card key={r.id} r={r} />)}</div>
      </Section>
    )
  }
  return null
}
