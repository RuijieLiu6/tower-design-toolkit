// Results for the three public realm nodes (research P06): a site plan coloured by the check, then rule cards.
import type { ReactNode } from 'react'
import { STATION_CORNER, VTC_EDGES, VTC_SITE, type CityFrontage, type CityWall, type EdgeId } from '../engine/publicRealm'
import { towerFootprint } from '../engine/massing'
import type { RuleResult, RuleState } from '../engine/types'
import { useResults } from '../hooks/useResults'
import { useStore, useTowers } from '../store'
import { FlagChip, Section, StateChip } from './ui'
import StudyPlan, { type PlanStreet } from './site/SitePlan'
import { planStreets } from './site/SiteStreets'
import { useSiteStreets } from '../lib/siteStreets'
import { U } from './Units'

const STATE_COLOR: Record<RuleState, string> = { pass: '#2e8b57', warn: '#d98b1c', fail: '#d0453a', unknown: '#8a8f98' }

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· needs <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
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
  const citySite = useStore((s) => s.citySite)
  const towers = useTowers()
  // Real Vancouver (7 Nov): the study site with its streets drawn to their measured width. Streetwall and frontage colour
  // each street by its check; Open space shows the POPS candidate, the link and the transit plaza.
  if (project !== 'vtc' && (id === 'built.pr-streetwall' || id === 'built.pr-frontage' || id === 'built.pr-ground')) {
    return <CityResults id={id} towers={towers} ring={citySite?.ring as [number, number][] | undefined} streetwall={streetwall} frontage={frontage} groundPlane={groundPlane} settings={citySite?.streets ?? {}} />
  }
  if (project !== 'vtc') return <Section title="Results"><p className="text-meta text-muted">Runs on the competition site, whose streets are known. Switch to "Competition site".</p></Section>

  if (id === 'built.pr-streetwall' && streetwall) {
    const edgeState = Object.fromEntries(streetwall.edges.map((w) => [w.edge.id, w.state])) as Partial<Record<EdgeId, RuleState>>
    return (
      <Section title="Results">
        <SitePlan edgeState={edgeState} />
        <p className="mb-2 mt-1 text-meta text-muted">Street edges coloured by streetwall height against Table 2.2b for that street's width.</p>
        <div className="grid gap-2">{streetwall.rules.map((r) => <Card key={r.id} r={r} />)}</div>
      </Section>
    )
  }
  if (id === 'built.pr-frontage' && frontage) {
    const edgeState = Object.fromEntries(frontage.edges.map((x) => [x.edge.id, x.state])) as Partial<Record<EdgeId, RuleState>>
    return (
      <Section title="Results">
        <SitePlan edgeState={edgeState} />
        <table className="mb-2 mt-1 w-full text-meta">
          <thead><tr className="text-left text-meta text-muted"><th className="py-0.5 font-medium">Street</th><th className="text-right font-medium">Frontage</th><th className="text-right font-medium">Active</th><th className="text-right font-medium">Entrance every</th></tr></thead>
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
  if (id === 'built.pr-ground' && groundPlane && groundPlane.open) {
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
        <p className="mb-2 mt-1 text-meta text-muted">Green: the largest clear rectangle of open ground (the POPS candidate). Blue dashed: the mid-block link. Teal square: room for a 6.1 m transit plaza by the station corner.</p>
        <div className="grid gap-2">{groundPlane.rules.map((r) => <Card key={r.id} r={r} />)}</div>
      </Section>
    )
  }
  return null
}

type Results = ReturnType<typeof useResults>
/** The three public realm nodes on Real Vancouver: a plan of the site and its streets, then the rule cards. */
function CityResults({ id, towers, ring, streetwall, frontage, groundPlane, settings }: { id: string; towers: ReturnType<typeof useTowers>; ring: [number, number][] | undefined
  streetwall: Results['streetwall']; frontage: Results['frontage']; groundPlane: Results['groundPlane']; settings: Record<string, { type: 'retail' | 'arterial' | 'local' | null } | undefined> }) {
  const { result, status } = useSiteStreets()
  const streets = result?.streets ?? []
  const byType = planStreets(streets, settings)
  let plan: PlanStreet[] = byType
  let caption = 'Streets drawn to their measured right-of-way, coloured by the type you picked (grey dashed: not picked yet).'
  let rules = [] as RuleResult[]
  const marks: { ring: [number, number][]; fill: string; stroke: string }[] = []
  if (id === 'built.pr-streetwall' && streetwall) {
    rules = streetwall.rules
    const walls: CityWall[] = 'walls' in streetwall ? (streetwall.walls as CityWall[]) : []
    if (walls.length) {
      plan = byType.map((p, i) => { const w = walls.find((x) => x.street.key === streets[i]?.key); return w ? { ...p, color: STATE_COLOR[w.state], dashed: false } : p })
      caption = 'Streets drawn to their measured right-of-way; each property line coloured by its streetwall height against Table 2.2b for that width.'
    }
  } else if (id === 'built.pr-frontage' && frontage) {
    rules = frontage.rules
    const rows: CityFrontage[] = 'streets' in frontage ? (frontage.streets as CityFrontage[]) : []
    if (rows.length) {
      plan = byType.map((p, i) => { const x = rows.find((r) => r.street.key === streets[i]?.key); return x ? { ...p, color: STATE_COLOR[x.state], dashed: x.state === 'unknown' } : p })
      caption = 'Each street coloured by its active frontage against the target for its type (grey dashed: type not picked).'
    }
  } else if (id === 'built.pr-ground' && groundPlane) {
    rules = groundPlane.rules
    if ('pops' in groundPlane && groundPlane.pops) marks.push({ ring: groundPlane.pops, fill: 'rgb(60 141 90 / 0.3)', stroke: '#3c8d5a' })
    if ('linkRing' in groundPlane && groundPlane.linkRing) marks.push({ ring: groundPlane.linkRing, fill: groundPlane.linkThrough === 'tower' ? 'rgb(208 69 58 / 0.25)' : groundPlane.linkThrough === 'podium' ? 'rgb(217 139 28 / 0.25)' : 'rgb(29 95 168 / 0.2)', stroke: '#1d5fa8' })
    if ('plaza' in groundPlane && groundPlane.plaza) marks.push({ ring: groundPlane.plaza, fill: 'rgb(42 143 134 / 0.6)', stroke: '#2a8f86' })
    caption = 'Green: the largest clear rectangle of open ground (the POPS candidate). Blue: the mid-block link. Teal: room for a 6.1 m transit plaza by the station street. Sun and wind come from their nodes.'
  }
  return (
    <Section title="Results">
      {ring && <div className="mb-1 flex justify-center"><StudyPlan ring={ring} towers={towers} size={240} streets={plan} marks={marks} label={`Plan of the study site with its streets and towers: ${caption}`} /></div>}
      <p className="mb-2 text-meta text-muted">{status === 'loading' ? 'Finding the streets along the site…' : caption} Types are picked in Your site or Ground & public realm.</p>
      <div className="grid gap-2">{rules.map((r) => <Card key={r.id} r={r} />)}</div>
    </Section>
  )
}
