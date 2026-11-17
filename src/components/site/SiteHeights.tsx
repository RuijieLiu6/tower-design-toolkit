// Site limits (17 Nov 2026, Sinnie): what zoning and the building code set for a tower on this site, no mass needed.
// Second pass the same day ("site limit should be an expandable tab from the site information. organize the information
// to be more visual"): a fold at the foot of the Your site card (embedded), opened to three pictures instead of lists —
// a height ladder (the lot's zoning height, the lowest view cone over it, the lower of the two, against the downtown
// heights), a plan of the tower-form rules (setbacks, plate, width, separation), and the building code as icon tiles.
// Every figure keeps its source behind "?"; the policy / views / built facts stay under More. The Site limits tool
// (Inspector, built.viewcones) shows the same body open.
import { useMemo, useState, type ReactNode } from 'react'
import { readRule } from '../../engine/heightPolicy'
import { surfacesOver } from '../../engine/heightModel'
import { HEIGHT_BAND_M } from '../../engine/vtcRules'
import { PLATE_MAX_M2, SEPARATION_M, TOWER_ABOVE_M, WIDTH_MAX_M } from '../../engine/siteLimits'
import type { Pt } from '../../engine/vista'
import { DOWNTOWN_HEIGHTS, LAYER_NAME, type HeightFact } from '../../data/downtownHeights'
import { SITE_CODE } from '../../data/siteCode'
import { useSiteStore } from '../../lib/siteStore'
import { CITY_ORIGIN, useStore } from '../../store'
import { useCityHeights } from '../useHeights'
import { Building2, ChevronRight, DoorOpen, ExternalLink, Flame, Footprints, HardHat, Ruler, SquareParking, Zap, Columns3 } from '../icons'
import Help from '../Help'
import { FlagChip } from '../ui'

const FACTS = [...DOWNTOWN_HEIGHTS, ...SITE_CODE]
const byId = (id: string) => FACTS.find((f) => f.id === id)!
const fmt = (v: number) => Math.round(v).toLocaleString('en-CA')
const cap = 'text-[10px] font-semibold uppercase tracking-[0.06em] text-muted'

function FactHelp({ f }: { f: HeightFact }) {
  return (
    <Help label={`About: ${f.label}`}><span className="block">{f.note}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={f.flag} /><a href={f.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">{f.source.label}<ExternalLink size={10} aria-hidden /></a></span>
      <span className="mt-0.5 block text-muted">How it was read: {f.source.read}.</span></Help>
  )
}

type Reading = { zoning: number | null; zoneLabel: string; zoneDetail: string; cone: number | null; coneLabel: string; limit: number | null; by: 'zoning' | 'cone' | null }

/** The site's own readings: zoning basic height, lowest cone ceiling above the ground, and the lower of the two. */
function useReading(): { r: Reading | null; error: string | null } {
  const site = useSiteStore((s) => s.site)
  const base = useStore((s) => s.groundElevation)
  const { policy, surfaces, groundAt, error } = useCityHeights(true)
  const r = useMemo<Reading | null>(() => {
    if (!site || site.ring.length < 3 || !policy || !surfaces) return null
    const ring = site.ring as Pt[]
    const zoning = policy.zoning([ring])
    const rule = readRule(policy, zoning.controlling, zoning.zones.find((z) => z.ruleId === zoning.controlling)?.zone)
    const abs = ring.map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt)
    const low = surfacesOver(abs, surfaces)[0]
    const g = low ? groundAt?.(low.at) ?? base : base
    const cone = low ? low.z - g : null
    const z = zoning.status === 'ready' ? zoning.heightM : null
    const limit = z != null && cone != null ? Math.min(z, cone) : z ?? cone
    const by = limit == null ? null : z != null && (cone == null || z <= cone) ? 'zoning' : 'cone'
    return { zoning: rule.heightM ?? null, zoneLabel: rule.heightM != null ? rule.label.replace(/^.*?\(/, '').replace(/\)$/, '') : rule.label, zoneDetail: rule.detail,
      cone, coneLabel: low ? `${low.surface.cone.id}: ${low.surface.cone.name}` : 'no protected view over the site', limit, by }
  }, [site, policy, surfaces, groundAt, base])
  return { r, error: error ?? null }
}

/** A height ladder: the downtown zoning heights as references, the site's zoning and cone marks, the limit as a tower. */
function HeightLadder({ r }: { r: Reading }) {
  const refs = [{ m: 91.4, l: 'Downtown South' }, { m: 137.2, l: 'CBD' }, { m: 152.4, l: 'under view corridors' }]
  const top = Math.max(160, (r.zoning ?? 0) + 10, (r.cone ?? 0) + 10, 200.9 + 6)
  // References on the left, the site's tower in the middle, the site's own marks labelled on the right (no overlaps).
  const W = 260, H = 168, x0 = 26, gy = H - 16, s = (gy - 10) / top, Y = (m: number) => gy - m * s, bx = 150, bw = 34, lx = bx + bw + 6
  const zy = r.zoning != null ? Y(r.zoning) : null, cy = r.cone != null ? Y(r.cone) : null
  const clash = zy != null && cy != null && Math.abs(zy - cy) < 11
  const mark = (m: number, colour: string, label: string, dy: number, dash?: string) => (
    <g><line x1={x0} x2={lx - 2} y1={Y(m)} y2={Y(m)} stroke={colour} strokeWidth={1.4} strokeDasharray={dash} /><text x={lx} y={Y(m) + 3 + dy} fontSize={9.5} fontWeight={600} fill={colour}>{label} {fmt(m)} m</text></g>
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" data-testid="site-height-readings"
      aria-label={`Height on this site: zoning ${r.zoning != null ? `${fmt(r.zoning)} m` : 'no number'}, view cone ${r.cone != null ? `${fmt(r.cone)} m` : 'none'}, limit ${r.limit != null ? `${fmt(r.limit)} m` : 'none'}`}>
      {[0, 50, 100, 150, 200].filter((m) => m <= top).map((m) => <g key={m}><line x1={x0 - 3} x2={x0} y1={Y(m)} y2={Y(m)} stroke="#9aa0a6" /><text x={x0 - 5} y={Y(m) + 3} textAnchor="end" fontSize={8} fill="#6b7280">{m}</text></g>)}
      <line x1={x0} x2={x0} y1={Y(top)} y2={gy} stroke="#9aa0a6" />
      {[...refs, { m: 200.9, l: 'tallest built' }].map((f) => <g key={f.m}><line x1={x0} x2={bx - 4} y1={Y(f.m)} y2={Y(f.m)} stroke="#d1d5db" strokeDasharray="2 2" /><text x={x0 + 3} y={Y(f.m) + 8} fontSize={8} fill="#9ca3af">{f.l} {f.m}</text></g>)}
      {/* the site's limit as a tower block */}
      {r.limit != null && <rect data-reading="limit" x={bx} y={Y(r.limit)} width={bw} height={gy - Y(r.limit)} fill="#1f5f8b" fillOpacity={0.16} stroke="#1f5f8b" strokeWidth={1.2} />}
      {r.zoning != null && <g data-reading="zoning">{mark(r.zoning, '#1f5f8b', 'Zoning', clash && zy! < cy! ? -5 : clash ? 5 : 0)}</g>}
      {r.cone != null && <g data-reading="cone">{mark(r.cone, '#c2410c', 'Cone', clash && cy! < zy! ? -5 : clash ? 5 : 0, '4 2')}</g>}
      {r.zoning == null && <text x={lx} y={gy - 16} fontSize={8.5} fill="#6b7280">Zoning: no</text>}
      {r.zoning == null && <text x={lx} y={gy - 6} fontSize={8.5} fill="#6b7280">number here</text>}
      {r.cone == null && <text x={lx} y={gy - 30} fontSize={8.5} fill="#6b7280">No cone over</text>}
      <line x1={x0 - 3} x2={W - 4} y1={gy} y2={gy} stroke="#374151" strokeWidth={1.4} />
      <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#111827">{r.limit != null ? `${fmt(r.limit)} m · ${r.by === 'zoning' ? 'zoning controls' : 'the view cone controls'}` : 'no height number yet'}</text>
    </svg>
  )
}

/** The tower-form rules on one small plan: street setback, interior setback, max width, plate, separation. */
function FormPlan() {
  const W = 260, H = 132
  const dim = (x1: number, y1: number, x2: number, y2: number, t: string, side: 'above' | 'below' | 'left' = 'above') => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    return (<g stroke="#374151" strokeWidth={0.8}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - 2.5} y1={y1 + 2.5} x2={x1 + 2.5} y2={y1 - 2.5} /><line x1={x2 - 2.5} y1={y2 + 2.5} x2={x2 + 2.5} y2={y2 - 2.5} />
      <text x={side === 'left' ? mx - 3 : mx} y={side === 'below' ? my + 10 : side === 'left' ? my + 3 : my - 3} textAnchor={side === 'left' ? 'end' : 'middle'} fontSize={8.5} fill="#111827" stroke="none" fontWeight={600}>{t}</text>
    </g>)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" data-testid="site-form-plan"
      aria-label={`Tower form: street setback 3.7 m, interior setback 12.2 m above 21.3 m, tower width up to ${WIDTH_MAX_M} m, residential plate up to ${PLATE_MAX_M2} m², towers ${SEPARATION_M} m apart above ${TOWER_ABOVE_M} m`}>
      {/* street */}
      <rect x={0} y={H - 18} width={W} height={18} fill="#eef0f2" /><text x={6} y={H - 6} fontSize={8.5} fill="#6b7280">STREET</text>
      {/* lot and setback zone */}
      <rect x={10} y={8} width={150} height={H - 30} fill="#fff" stroke="#374151" strokeDasharray="6 2 1.5 2" />
      <rect x={10} y={H - 22 - 8} width={150} height={8} fill="#1f5f8b" fillOpacity={0.12} />
      <g stroke="#374151" strokeWidth={0.8}><line x1={166} y1={H - 30} x2={166} y2={H - 22} /><line x1={163} y1={H - 30} x2={169} y2={H - 30} /><line x1={163} y1={H - 22} x2={169} y2={H - 22} /></g>
      <text x={172} y={H - 23} fontSize={8.5} fontWeight={600} fill="#111827">3.7 m street</text>
      {/* tower plate */}
      <rect x={58} y={24} width={70} height={64} fill="#1f5f8b" fillOpacity={0.18} stroke="#1f5f8b" strokeWidth={1.4} />
      <text x={93} y={58} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#1f5f8b">≤ {fmt(PLATE_MAX_M2)} m²</text>
      {dim(58, 18, 128, 18, `≤ ${WIDTH_MAX_M} m`)}
      {/* interior setback */}
      {dim(10, 96, 58, 96, '12.2 m')}
      {/* neighbour tower and separation */}
      <rect x={210} y={24} width={44} height={64} fill="#e5e7eb" stroke="#9ca3af" strokeDasharray="3 2" /><text x={232} y={58} textAnchor="middle" fontSize={8} fill="#6b7280">tower</text>
      {dim(128, 40, 210, 40, `${SEPARATION_M} m apart`)}
    </svg>
  )
}

const CODE_TILES: { id: string; Icon: typeof Ruler; short: string }[] = [
  { id: 'high', Icon: Building2, short: 'High building' },
  { id: 'construction', Icon: HardHat, short: 'Construction' },
  { id: 'exits', Icon: DoorOpen, short: 'Exits per storey' },
  { id: 'travel', Icon: Footprints, short: 'Travel to exit' },
  { id: 'widths', Icon: Columns3, short: 'Corridor · stair · dead end' },
  { id: 'firesep', Icon: Flame, short: 'Fire separations' },
  { id: 'garage', Icon: SquareParking, short: 'Parking levels' },
  { id: 'energy', Icon: Zap, short: 'Energy' },
]

function CodeTiles() {
  return (
    <div className="@container"><ul className="grid grid-cols-1 gap-1 @[22rem]:grid-cols-2" data-testid="site-code-tiles">
      {CODE_TILES.map(({ id, Icon, short }) => {
        const f = byId(id)
        return (
          <li key={id} data-fact={id} className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-1.5 rounded-md border border-line bg-white px-1.5 py-1">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded bg-accent/10 text-accent"><Icon size={14} aria-hidden /></span>
            <span className="min-w-0"><span className="block text-[11px] leading-tight text-muted">{short}</span><span className="block text-xs font-semibold leading-snug text-ink">{f.value}</span></span>
            <FactHelp f={f} />
          </li>
        )
      })}
    </ul></div>
  )
}

function Block({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return <div className="grid gap-1"><div className="flex items-center justify-between gap-1"><p className={cap}>{title}</p>{right}</div>{children}</div>
}

/** The body: height, tower form, building code; policy and the rest under More. */
function LimitsBody() {
  const project = useStore((s) => s.project)
  const { r, error } = useReading()
  const [more, setMore] = useState(false)
  const helps = (ids: string[]) => <span className="flex items-center gap-0.5">{ids.map((id) => <FactHelp key={id} f={byId(id)} />)}</span>
  return (
    <div className="grid gap-3">
      <Block title="Height" right={project === 'city' ? helps(['dodp-cbd']) : undefined}>
        {project !== 'city' ? (
          <div className="rounded-md border border-line bg-white px-2 py-1.5" data-testid="vtc-height-band">
            <p className="font-mono text-base font-semibold leading-tight text-ink">{HEIGHT_BAND_M[0]}–{HEIGHT_BAND_M[1]} m</p>
            <p className="text-muted">The brief: 800–1,000 ft, above every downtown policy height.</p>
          </div>
        ) : error ? <p className="text-muted">Height data could not load: {error}</p>
          : !r ? <p className="text-muted" role="status">Reading the zoning and the view cones…</p>
          : <div className="rounded-md border border-line bg-white px-1 pt-1" title={`${r.zoneLabel}${r.zoneDetail ? ` · ${r.zoneDetail}` : ''} · ${r.coneLabel}`}><HeightLadder r={r} /></div>}
      </Block>
      <Block title="Tower form" right={<Help label="About the tower form rules">{(['sep', 'plate', 'width', 'setbacks'] as const).map((id) => { const f = byId(id); return <span key={id} className="mb-1 block"><b>{f.label}: {f.value}.</b> {f.note}</span> })}
        <span className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag="unverified" /><a href={byId('sep').source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">{byId('sep').source.label}<ExternalLink size={10} aria-hidden /></a></span></Help>}>
        <div className="rounded-md border border-line bg-white p-1"><FormPlan /></div>
      </Block>
      <Block title="Building code · VBBL 2025" right={helps(['bylaw'])}>
        <CodeTiles />
      </Block>
      {more && (
        <ul className="divide-y divide-line" data-testid="downtown-heights">
          {(['policy', 'views', 'built'] as const).map((l) => (
            <li key={l} className="py-1">
              <p className={cap}>{LAYER_NAME[l]}</p>
              <ul>{FACTS.filter((f) => f.layer === l).map((f) => (
                <li key={f.id} data-fact={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-1.5 py-1">
                  <span className="min-w-0"><span className="block text-ink">{f.label.replace(/^[^·]+· /, '')}</span><span className="block font-mono text-xs font-semibold leading-snug text-ink">{f.value}</span></span>
                  <FactHelp f={f} />
                </li>))}</ul>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="justify-self-start text-meta text-accent hover:underline">{more ? 'Fewer' : 'Higher buildings, views, the tallest built'}</button>
    </div>
  )
}

/** Site limits. `embedded`: a fold at the foot of the Your site card; otherwise its own open card (the Site limits tool). */
export default function SiteHeights({ embedded = false }: { embedded?: boolean }) {
  const project = useStore((s) => s.project)
  const { r } = useReading()
  const head = project === 'city' ? (r?.limit != null ? `${fmt(r.limit)} m` : '') : `${HEIGHT_BAND_M[0]}–${HEIGHT_BAND_M[1]} m`
  const about = <Help label="About the site limits">What zoning and the building code set for a tower on this site, read from the site alone (no mass needed). Height: the Downtown Official Development Plan's zoning height for the lot and the protected view cones over it. Tower form: the Downtown South Guidelines' separation, floor plate and setbacks. Building code: the Vancouver Building By-law 2025 rules every downtown tower meets, from the Downtown Massing Tool's rule data. All flagged unverified: check against the by-laws before quoting. Place a tower and the Site limits tool measures it against them.</Help>
  if (embedded) return (
    <details className="group/limits mt-2 border-t border-accent/20 pt-1.5" data-testid="site-heights">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight size={13} aria-hidden className="transition-transform group-open/limits:rotate-90" /><Ruler size={14} aria-hidden />Site limits
        <span className="ml-auto font-mono text-xs text-ink">{head}</span>
      </summary>
      <div className="mt-2"><LimitsBody /></div>
    </details>
  )
  return (
    <section aria-labelledby="site-heights-title" data-testid="site-heights" className="m-3 rounded-lg border border-accent/35 bg-accent/[0.05] px-3 py-2.5 text-meta shadow-sm">
      <h3 id="site-heights-title" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent"><Ruler size={14} aria-hidden />Site limits{about}<span className="ml-auto font-mono text-xs text-ink">{head}</span></h3>
      <LimitsBody />
    </section>
  )
}
