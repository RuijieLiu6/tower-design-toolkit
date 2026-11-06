import { Eye, ExternalLink } from './icons'
import { CATEGORIES, JURY_LABEL, nodeById } from '../data/registry'
import { sunPosition, vancouverTime } from '../engine/sun'
import { PLACEMENT_LABEL, STAIR_MIN_MM, type EgressResult, type StairSpot } from '../engine/egress'
import { CLASS_LABEL, type LiftResult } from '../engine/lifts'
import { coreSide, towerFloors } from '../engine/massing'
import { USES, type RuleResult, type Tower, type UseId } from '../engine/types'
import { CONES, CONE_ATTRIBUTION, CONE_PARAMS, STATE_LABEL, bisector, type ConeCheck } from '../engine/viewCones'
import { TIER_LABEL } from '../engine/vtcRules'
import { useResults } from '../hooks/useResults'
import { CITY_ORIGIN, useStore } from '../store'
import CommunityInspector from './CommunityInspector'
import NatureLedger from './NatureLedger'
import { WindProcedurePanel, WindStudyPanel } from './WindStructurePanel'
import StructurePanel from './StructurePanel'
import LifeSafetyPanel from './LifeSafetyPanel'
import RelaxAviationPanel from './RelaxAviationPanel'
import EnergyCarbonResults from './EnergyCarbonResults'
import RulesBehind from './RulesBehind'
import { CardChip } from './RuleCardView'
import EconomicsResults from './EconomicsResults'
import MobilityResults from './MobilityResults'
import FacadeResults from './FacadeResults'
import InteriorResults from './InteriorResults'
import ViewFromPanel from './ViewFromPanel'
import VistaPanel from './VistaPanel'
import HeightsPanel from './HeightsPanel'
import CultureResults from './CultureResults'
import ProvenanceResults from './ProvenanceResults'
import ModelPanel from './import/ModelPanel'
import LiftStrategy from './LiftStrategy'
import WindScreenResults from './WindScreenResults'
import TripsResults from './TripsResults'
import PublicRealmResults from './PublicRealmResults'
import SolarResults from './SolarResults'
import DaylightResults from './DaylightResults'
import { CONE_STYLE, FlagChip, Section, StateChip } from './ui'
import { U } from './Units'
import { useShallow } from 'zustand/react/shallow'
import Help from './Help'

function RuleCard({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· needs <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[11px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
        <CardChip ruleId={r.id} />
      </div>
    </div>
  )
}

const CLASS_COLOR = { office: USES.office.color, residential: USES.residential.color, hotel: USES.hotel.color, public: '#8e5ba8' }
const SHUTTLE_COLOR = '#2a8f86'

/**
 * Rise diagram (P11-M01, P11-M02): storeys vertical, one column per lift group. Solid = served, hatched = passed express,
 * black = the group's lobby (grade or a sky lobby), grey = plant floor not served. Sky lobbies are outlined across the stack.
 */
function RiseDiagram({ t, r }: { t: Tower; r: LiftResult }) {
  const floors = towerFloors(t)
  const H = 210, top = 14, rowH = H / Math.max(1, floors.length), col = 20, gap = 6, x0 = 34
  const y = (i: number) => top + H - (i + 1) * rowH
  const width = x0 + (r.rises.length + 1) * (col + gap) + 4
  const idx = (level: number) => floors.findIndex((f) => f.level === level)
  return (
    <figure>
      <svg viewBox={`0 0 ${Math.max(width, 250)} ${top + H + 16}`} className="max-h-72 w-full" role="img" aria-label="Lift rise diagram">
        <defs>
          <pattern id="express" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#7d8794" strokeWidth="1.4" /></pattern>
        </defs>
        {floors.map((f, i) => <rect key={i} x={x0} y={y(i)} width={col} height={rowH} fill={USES[f.use].color} opacity={f.podium ? 0.55 : 0.9} />)}
        {r.skyLobbies.map((f) => (
          <g key={f.level}>
            <rect x={x0 - 2} y={y(idx(f.level)) - 0.5} width={width - x0} height={rowH + 1} fill="none" stroke={SHUTTLE_COLOR} strokeWidth="1" />
            <text x={x0 - 4} y={y(idx(f.level)) + rowH} textAnchor="end" fontSize="8" fontWeight="600" fill={SHUTTLE_COLOR}>L{f.level}</text>
          </g>
        ))}
        <text x={x0 + col / 2} y={top + H + 11} textAnchor="middle" fontSize="8" fill="#6b6f76">Stack</text>
        <text x={x0 - 4} y={top + H} textAnchor="end" fontSize="8" fill="#6b6f76">L1</text>
        <text x={x0 - 4} y={top + 7} textAnchor="end" fontSize="8" fill="#6b6f76">L{floors[floors.length - 1]?.level}</text>
        {r.rises.map((rise, k) => {
          const x = x0 + (k + 1) * (col + gap)
          const served = new Set(rise.floors.map((f) => f.level))
          const lastLevel = rise.floors[rise.floors.length - 1].level
          const fill = rise.cls === 'public' ? CLASS_COLOR.public : rise.kind === 'shuttle' ? SHUTTLE_COLOR : CLASS_COLOR[rise.cls]
          return (
            <g key={rise.id}>
              {floors.map((f, i) => {
                if (f.level > lastLevel || f.z0 < rise.baseZ - 0.01) return null
                if (served.has(f.level)) return <rect key={i} x={x} y={y(i)} width={col} height={rowH} fill={fill} />
                if (f.level === rise.baseLevel) return <rect key={i} x={x} y={y(i)} width={col} height={Math.max(rowH, 2)} fill="#1f2328" />
                if (f.z0 < rise.firstZ) return <rect key={i} x={x} y={y(i)} width={col} height={rowH} fill="url(#express)" />
                return <rect key={i} x={x} y={y(i)} width={col} height={rowH} fill="#e3e1dc" />
              })}
              <text x={x + col / 2} y={y(idx(lastLevel)) - 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="#1f2328">{rise.cars}</text>
              <text x={x + col / 2} y={top + H + 11} textAnchor="middle" fontSize="8" fill={rise.cls === 'public' ? CLASS_COLOR.public : rise.kind === 'shuttle' ? SHUTTLE_COLOR : '#6b6f76'}>{rise.id}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="text-[11px] text-muted">Number above a column = cars. Black = the group's lobby (grade or sky lobby); hatched = passed express; grey = plant floor not served.{r.skyLobbies.length ? ' S columns are shuttles to a sky lobby.' : ''}</figcaption>
    </figure>
  )
}

/** Core needed at its worst level, by part, against the modelled core. */
function CoreBar({ r }: { r: LiftResult }) {
  const parts = [
    { label: 'Passenger shafts', v: r.breakdownMax.passenger, c: '#4a6a8c' },
    { label: 'Lift lobby', v: r.breakdownMax.lobby, c: '#8fa8c2' },
    { label: 'Service and firefighter lifts', v: r.breakdownMax.service, c: '#7f8c8d' },
    { label: 'Exit stairs', v: r.breakdownMax.stairs, c: '#c0504d' },
    { label: 'Risers and services', v: r.breakdownMax.services, c: '#c3c9cf' },
    { label: 'Walls (allowance)', v: r.breakdownMax.walls, c: '#e0e3e6' },
  ]
  const max = Math.max(r.requiredMax, r.modelledCore) * 1.05 || 1
  return (
    <div className="mt-2">
      <div className="relative h-4 w-full rounded bg-black/[0.04]">
        <div className="flex h-4 overflow-hidden rounded">{parts.map((p) => <div key={p.label} title={`${p.label}: ${Math.round(p.v)} m²`} style={{ width: `${(p.v / max) * 100}%`, background: p.c }} />)}</div>
        <div className="absolute -top-1 h-6 w-0.5 bg-ink" style={{ left: `${(r.modelledCore / max) * 100}%` }} title="Modelled core" />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted">
        {parts.map((p) => <span key={p.label} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: p.c }} />{p.label} {Math.round(p.v)}</span>)}
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-0.5 bg-ink" />Modelled core {Math.round(r.modelledCore)} m²</span>
      </div>
    </div>
  )
}

/** Core needed level by level (a step chart), against the modelled core; the direct scheme dashed for comparison. */
function CoreProfile({ r }: { r: LiftResult }) {
  const W = 300, H = 150, L = 34, B = 16, T = 6
  const levels = r.profile
  if (!levels.length) return null
  const xMax = Math.max(r.modelledCore, r.requiredMax, r.direct?.requiredMax ?? 0) * 1.08
  const x = (v: number) => L + (v / xMax) * (W - L - 6)
  const y = (i: number) => T + (H - T - B) * (1 - i / levels.length)
  const path = (pts: { total: number }[]) => pts.map((c, i) => `${i ? 'L' : 'M'}${x(c.total).toFixed(1)},${y(i).toFixed(1)} L${x(c.total).toFixed(1)},${y(i + 1).toFixed(1)}`).join(' ')
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Core needed by level">
        <line x1={L} y1={H - B} x2={W - 4} y2={H - B} stroke="#c6ccd2" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#c6ccd2" />
        <text x={L - 4} y={H - B} textAnchor="end" fontSize="8" fill="#6b6f76">L{levels[0].level}</text>
        <text x={L - 4} y={T + 7} textAnchor="end" fontSize="8" fill="#6b6f76">L{levels[levels.length - 1].level}</text>
        {[0, 0.5, 1].map((f) => <text key={f} x={x(xMax * f * 0.92)} y={H - 4} textAnchor="middle" fontSize="8" fill="#6b6f76">{Math.round(xMax * f * 0.92)}</text>)}
        {r.direct && <path d={path(r.direct.profile)} fill="none" stroke="#9aa3ad" strokeWidth="1.2" strokeDasharray="3 2" />}
        <path d={path(levels)} fill="none" stroke="#1d5fa8" strokeWidth="1.8" />
        <line x1={x(r.modelledCore)} y1={T} x2={x(r.modelledCore)} y2={H - B} stroke="#1f2328" strokeWidth="1.2" />
        <text x={x(r.modelledCore) + 3} y={T + 8} fontSize="8" fill="#1f2328">modelled</text>
      </svg>
      <figcaption className="text-[11px] text-muted">Core needed by level, m² (blue){r.direct ? '; dashed = the same tower with no sky lobby' : ''}. Black line = the modelled core, one size top to bottom.</figcaption>
    </figure>
  )
}

/** Sky lobby vs direct service (P11-M02 comparator, single-deck only). */
function SkyLobbyCompare({ r }: { r: LiftResult }) {
  if (!r.direct) return null
  const d = r.direct
  const above = r.skyLobbies[0]?.level
  const rows: [string, string, string][] = [
    ['Passenger cars', `${d.totalCars}`, `${r.totalCars}`],
    ['Shafts at grade (incl. 2 service)', `${d.shaftsAtGrade}`, `${r.shaftsAtGrade}`],
    ['Core needed, worst level', `${Math.round(d.requiredMax)} m²`, `${Math.round(r.requiredMax)} m²`],
    ['Net-to-gross with that core', `${Math.round((1 - d.requiredMax / d.plate) * 100)}%`, `${Math.round((1 - r.requiredMax / r.plate) * 100)}%`],
    ['Lift changes per trip', '0', `1 above L${above}`],
  ]
  const saved = d.requiredMax - r.requiredMax
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Sky lobby vs direct</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${saved > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{saved > 0 ? `saves ${Math.round(saved)} m² of core` : `adds ${Math.round(-saved)} m² of core`}</span>
      </div>
      <table className="mt-1 w-full text-[11px]">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-0.5 font-medium" /><th className="text-right font-medium">Direct</th><th className="text-right font-medium">Sky lobby</th></tr></thead>
        <tbody>{rows.map(([k, a, b]) => <tr key={k} className="border-t border-line/60"><td className="py-0.5">{k}</td><td className="text-right tabular-nums text-muted">{a}</td><td className="text-right font-medium tabular-nums">{b}</td></tr>)}</tbody>
      </table>
      <div className="mt-1 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[11px] text-muted">One transfer is a design choice, not a pass/fail: London tenants asked for direct travel (Stopes), while a public sky room can make the sky lobby a destination. Double-deck and destination control are roadmap.</span></div>
    </div>
  )
}

/** Stair width storey by storey (P11-M06): what each storey needs alone (grey) and what the stair must be there (red step). */
function StairChart({ e }: { e: EgressResult }) {
  const W = 300, H = 150, L = 34, B = 16, T = 6
  const st = e.storeys.filter((s) => s.z > 0.5)
  if (!st.length) return null
  const xMax = Math.max(...st.map((s) => s.stairMm), STAIR_MIN_MM) * 1.12
  const x = (v: number) => L + (v / xMax) * (W - L - 6)
  const y = (i: number) => T + (H - T - B) * (1 - i / st.length)
  const step = st.map((s, i) => `${i ? 'L' : 'M'}${x(s.stairMm).toFixed(1)},${y(i).toFixed(1)} L${x(s.stairMm).toFixed(1)},${y(i + 1).toFixed(1)}`).join(' ')
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Exit stair width by storey">
        <line x1={L} y1={H - B} x2={W - 4} y2={H - B} stroke="#c6ccd2" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#c6ccd2" />
        {st.map((s, i) => <rect key={s.level} x={L} y={y(i + 1)} width={Math.max(0, x(s.needMm) - L)} height={Math.max(0.6, y(i) - y(i + 1) - 0.3)} fill={s.publicRoom ? '#8e5ba8' : '#c9ced4'} />)}
        <path d={step} fill="none" stroke="#c0504d" strokeWidth="1.8" />
        <line x1={x(STAIR_MIN_MM)} y1={T} x2={x(STAIR_MIN_MM)} y2={H - B} stroke="#1f2328" strokeDasharray="3 2" />
        <text x={x(STAIR_MIN_MM) + 3} y={T + 8} fontSize="8" fill="#1f2328">1100 mm minimum</text>
        <text x={L - 4} y={H - B} textAnchor="end" fontSize="8" fill="#6b6f76">L{st[0].level}</text>
        <text x={L - 4} y={T + 7} textAnchor="end" fontSize="8" fill="#6b6f76">L{st[st.length - 1].level}</text>
        {[0, 0.5, 1].map((f) => <text key={f} x={x(xMax * f * 0.9)} y={H - 4} textAnchor="middle" fontSize="8" fill="#6b6f76">{Math.round(xMax * f * 0.9)}</text>)}
      </svg>
      <figcaption className="text-[11px] text-muted">Width each storey needs alone, mm (bars; purple = public sky room); red = the stair width there, which keeps the widest need of the storeys above.</figcaption>
    </figure>
  )
}

/** Typical tower floor in plan: plate, core, exit stairs, the separation between the farthest pair, and the longest travel. */
function StairPlan({ t, e }: { t: Tower; e: EgressResult }) {
  const S = 170, pad = 14
  const k = (S - 2 * pad) / Math.max(t.width, t.depth)
  const X = (x: number) => S / 2 + x * k, Y = (y: number) => S / 2 - y * k
  const c = coreSide(t)
  let pair: [StairSpot, StairSpot] | null = null, best = -1
  for (let i = 0; i < e.spots.length; i++) for (let j = i + 1; j < e.spots.length; j++) {
    const d = Math.hypot(e.spots[i].x - e.spots[j].x, e.spots[i].y - e.spots[j].y)
    if (d > best) { best = d; pair = [e.spots[i], e.spots[j]] }
  }
  const sepOk = e.separation >= e.separationNeeded - 0.05, travelOk = e.travel <= 45
  const near = e.spots.reduce((m, s) => (Math.hypot(s.x - e.farCorner[0], s.y - e.farCorner[1]) < Math.hypot(m.x - e.farCorner[0], m.y - e.farCorner[1]) ? s : m), e.spots[0])
  return (
    <figure className="mt-2 flex items-start gap-3">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-44 shrink-0" role="img" aria-label="Typical floor plan with exit stairs">
        <rect x={X(-t.width / 2)} y={Y(t.depth / 2)} width={t.width * k} height={t.depth * k} fill="#f4f7fa" stroke="#4a6a8c" strokeWidth="1.2" />
        <rect x={X(-c / 2)} y={Y(c / 2)} width={c * k} height={c * k} fill="#2b3f55" opacity="0.18" stroke="#2b3f55" strokeWidth="0.8" />
        {e.spots.map((s, i) => <rect key={i} x={X(s.x - e.enclosure.a / 2)} y={Y(s.y + e.enclosure.b / 2)} width={e.enclosure.a * k} height={e.enclosure.b * k} fill="#c0504d" opacity="0.9" />)}
        {pair && <line x1={X(pair[0].x)} y1={Y(pair[0].y)} x2={X(pair[1].x)} y2={Y(pair[1].y)} stroke={sepOk ? '#1f6b42' : '#c0392b'} strokeWidth="1.6" />}
        {near && <line x1={X(e.farCorner[0])} y1={Y(e.farCorner[1])} x2={X(near.x)} y2={Y(near.y)} stroke={travelOk ? '#1d5fa8' : '#c0392b'} strokeWidth="1.2" strokeDasharray="3 2" />}
        <circle cx={X(e.farCorner[0])} cy={Y(e.farCorner[1])} r="2.5" fill={travelOk ? '#1d5fa8' : '#c0392b'} />
      </svg>
      <figcaption className="grid gap-1 text-[11px] text-muted">
        <span><b className={sepOk ? 'text-emerald-800' : 'text-red-700'}>Solid line: <U>{`${e.separation.toFixed(1)} m`}</U></b> between the stairs; needs <U>{`${e.separationNeeded.toFixed(1)} m`}</U>.</span>
        <span><b className={travelOk ? 'text-accent' : 'text-red-700'}>Dashed: <U>{`${e.travel.toFixed(1)} m`}</U></b> from the farthest corner to a stair; limit <U>45 m</U>.</span>
        <span>Red = exit stairs ({PLACEMENT_LABEL[e.placement]}); dark = core. Typical tower floor, {t.width} × {t.depth} m.</span>
      </figcaption>
    </figure>
  )
}

/** All 24 cones at a glance: which have a height estimate, and which stop at "no estimate" until the City answers. */
function ConeCoverage() {
  const known = CONES.filter((c) => CONE_PARAMS[c.id]), unknown = CONES.filter((c) => !CONE_PARAMS[c.id])
  const chip = 'rounded border px-1 py-px text-[11px] tabular-nums'
  return (
    <Section title="Cone coverage" right={<span className="text-[11px] text-muted">{known.length} of {CONES.length} with an estimate</span>}>
      <div className="mb-2 flex h-2 overflow-hidden rounded-sm border border-line" aria-hidden>
        <div style={{ width: `${(known.length / CONES.length) * 100}%`, background: '#4f7fae' }} />
        <div className="hatch flex-1" />
      </div>
      <p className="text-[11px]">
        <b>{unknown.length} of {CONES.length} cones have no height estimate.</b> No opened City sheet or Council report gives their slope, so the tool says
        "no estimate" instead of guessing. They wait on City Request 0 (draft in <code>docs/city-requests/</code>). In 3D they are the dashed grey outlines.
      </p>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">With an estimate (blue sheets)</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {known.map((c) => <span key={c.id} title={`${c.name}: ${CONE_PARAMS[c.id].source}`} className={`${chip} border-[#4f7fae] text-[#2f5578]`}>{c.id}</span>)}
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">No estimate (dashed)</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {unknown.map((c) => <span key={c.id} title={`${c.name}: no slope in any opened City source`} className={`${chip} border-dashed border-slate-400 text-slate-700`}>{c.id}</span>)}
      </div>
      <div className="mt-2 flex items-center gap-1"><FlagChip flag="unresolved" /><span className="text-[11px] text-muted">Limit unknown for these cones; the City View Cone Assessment governs.</span></div>
    </Section>
  )
}

function ConeRow({ c }: { c: ConeCheck }) {
  const set = useStore((s) => s.set)
  const viewFrom = () => {
    const O = c.cone.ring[0], u = bisector(c.cone)
    const angs = c.cone.ring.slice(1, -1).map(([x, y]) => Math.atan2(y - O[1], x - O[0]))
    const spread = ((Math.max(...angs) - Math.min(...angs)) * 180) / Math.PI
    set({ cameraRequest: { position: [O[0] - CITY_ORIGIN[0], O[1] - CITY_ORIGIN[1], c.cone.Lv], target: [O[0] - CITY_ORIGIN[0] + u[0] * 2000, O[1] - CITY_ORIGIN[1] + u[1] * 2000, c.cone.Lv + 40], fov: Math.min(70, Math.max(20, spread * 1.4)) } })
  }
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{c.cone.id} · {c.cone.name}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${CONE_STYLE[c.state].chip}`}>{STATE_LABEL[c.state]}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted">View to {c.cone.subject} · origin elevation <U>{`${c.cone.Lv} m`}</U></div>
      {c.limit !== null ? (
        <div className="mt-1 text-[11px]">
          Estimated limit <b className="tabular-nums"><U>{`${c.limit.toFixed(1)} m`}</U></b> geodetic ·
          {c.exceed! > 0 ? <span className="text-red-700"> <U>{`${c.exceed!.toFixed(1)} m`}</U> above</span> : <span className="text-emerald-700"> <U>{`${(-c.exceed!).toFixed(1)} m`}</U> below</span>}
          <span className="text-muted"> (±<U>{`${c.param!.u95} m`}</U>)</span>
          <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={c.param!.flag} /><span className="text-[11px] text-muted">{c.param!.tier} · {c.param!.source}</span></div>
        </div>
      ) : c.state === 'limit_unknown' ? (
        <div className="mt-1 text-[11px] text-slate-700">No published slope for this cone yet, so the tool stops rather than guessing. Ask the City for a View Cone Assessment (draft in <code>04 Tool Plan/city-requests/</code>).</div>
      ) : null}
      <div className="mt-1.5 flex gap-3">
        <button onClick={viewFrom} className="flex items-center gap-1 text-[11px] text-accent hover:underline"><Eye size={12} />View from this viewpoint</button>
        <a href={c.cone.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-muted hover:text-accent"><ExternalLink size={12} />City page</a>
      </div>
    </div>
  )
}

export default function Inspector() {
  const { selectedNode, project, fsrTier, sun, enabled, groundMode } = useStore(useShallow((s) => ({ selectedNode: s.selectedNode, project: s.project, fsrTier: s.fsrTier, sun: s.sun, enabled: s.enabled, groundMode: s.groundMode })))
  const n = nodeById(selectedNode)
  const { rules, fsr, cones, lifts, egress, skyRooms } = useResults()
  if (selectedNode?.startsWith('community.')) return <CommunityInspector id={selectedNode} />
  if (!n) return <div className="p-4 text-xs text-muted">Switch a check on in the bar at the bottom, or pick one above, to see its results and evidence.</div>
  const cat = CATEGORIES[n.category]
  const wrongProject = n.projects && !n.projects.includes(project)

  return (
    <div>
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} />{cat.label} · {n.phase} · {n.priority}
        </div>
        {/* The results lead (UI review, 3 Nov); what the check does sits behind a "?" beside its name (Ruijie, 5 Nov). */}
        <h2 className="mt-1 flex items-center gap-1.5 text-sm font-semibold">{n.name}<Help label={`About ${n.name}`}>{n.question}</Help></h2>
        <div className="mt-1.5 flex flex-wrap gap-1">{n.jury.map((j) => <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{JURY_LABEL[j] ?? j}</span>)}</div>
        {n.status !== 'researched' && !enabled[n.id] && <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">Switched off in your workflow. Turn it on in the bar at the bottom to see live results.</div>}
        {wrongProject && <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">Runs in the {n.projects!.includes('city') ? '"Real Vancouver"' : '"Competition site"'} project.</div>}
      </div>

      {n.id === 'built.vtc-rules' && project === 'vtc' && enabled[n.id] && (
        <Section title="Results">
          <div className="grid gap-2">
            {rules.map((r) => <RuleCard key={r.id} r={r} />)}
          </div>
        </Section>
      )}

      {n.id === 'built.fsr' && enabled[n.id] && (
        <Section title="Results">
          <table className="w-full text-[11px]">
            <tbody>
              {Object.entries(fsr.gfa).filter(([, v]) => v > 0).map(([u, v]) => (
                <tr key={u} className="border-b border-line/60"><td className="py-1"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: USES[u as UseId].color }} />{USES[u as UseId].label}</td><td className="text-right tabular-nums">{Math.round(v).toLocaleString()} m²</td></tr>
              ))}
              <tr><td className="pt-1.5 font-semibold">Total gross</td><td className="pt-1.5 text-right font-semibold tabular-nums">{Math.round(fsr.total).toLocaleString()} m²</td></tr>
            </tbody>
          </table>
          <div className="mt-2 grid gap-1 text-[11px]">
            {([1, 2, 3] as const).map((k) => (
              <div key={k} className={`flex justify-between ${k === fsrTier ? 'font-semibold' : 'text-muted'}`}><span>{TIER_LABEL[k]}</span><span className="tabular-nums">{fsr[`tier${k}` as 'tier1'].toFixed(2)}</span></div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[11px] text-muted">Gross area, no exclusions; Vancouver's FSR exclusions come with the policy register (P01-M07).</span></div>
        </Section>
      )}

      {n.id === 'built.viewcones' && project === 'city' && enabled[n.id] && cones.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className={`mb-2 rounded-md border p-2 text-xs ${CONE_STYLE[r.overall].chip}`}>
            <b>{STATE_LABEL[r.overall]}</b>: top of tower at <U>{`${r.topZ.toFixed(1)} m`}</U> geodetic (<U>{`${r.tower.height} m`}</U> above a base of <U>{`${(r.topZ - r.tower.height).toFixed(1)} m`}</U>, {groundMode === 'terrain' ? 'from the terrain, unverified' : 'set by hand'}).
          </div>
          <div className="grid gap-2">
            {r.checks.filter((c) => c.state !== 'outside').map((c) => <ConeRow key={c.cone.id} c={c} />)}
            {r.checks.every((c) => c.state === 'outside') && <div className="text-[11px] text-muted">Outside every protected view cone. Click "Place on map" and try a site near Robson & Cambie.</div>}
          </div>
          <div className="mt-2 rounded bg-slate-50 p-2 text-[11px] text-slate-600">
            Estimate only: Z = Lv + k·D along the cone axis. Public Views Guidelines (Feb 2026) cl. 3.1.1: no part of a building should encroach into the relevant view cones. Relaxations (Higher Buildings, Exceptional Downtown Sites 3.4) are your call. The City View Cone Assessment governs. {CONE_ATTRIBUTION}
          </div>
        </Section>
      ))}
      {n.id === 'built.viewcones' && project === 'city' && enabled[n.id] && <ConeCoverage />}

      {n.id === 'built.core-lifts' && enabled[n.id] && lifts.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className="mb-2 text-xs"><b>{r.totalCars} passenger cars</b> in {r.rises.length} group{r.rises.length === 1 ? '' : 's'}{r.skyLobbies.length ? <>, with {r.skyLobbies.length === 1 ? 'a sky lobby' : `${r.skyLobbies.length} sky lobbies`} at {r.skyLobbies.map((f) => `L${f.level}`).join(', ')}</> : null}, plus service and firefighter lifts.</div>
          <RiseDiagram t={r.tower} r={r} />
          <table className="mt-2 w-full text-[11px]">
            <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-1 font-medium">Rise</th><th className="font-medium">Levels</th><th className="text-right font-medium">Speed</th><th className="text-right font-medium">Cars</th><th className="text-right font-medium">HC5</th><th className="text-right font-medium">Interval</th></tr></thead>
            <tbody>
              {r.rises.map((x) => (
                <tr key={x.id} className="border-b border-line/60">
                  <td className="py-1"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: x.cls === 'public' ? CLASS_COLOR.public : x.kind === 'shuttle' ? SHUTTLE_COLOR : CLASS_COLOR[x.cls] }} />{x.id} {x.cls === 'public' ? 'Public' : x.kind === 'shuttle' ? 'Shuttle' : CLASS_LABEL[x.cls]}</td>
                  <td className="tabular-nums">{x.kind === 'shuttle' ? `${x.baseLevel} → ${x.floors[0].level}` : `${x.floors[0].level}–${x.floors[x.floors.length - 1].level}`}</td>
                  <td className="text-right tabular-nums">{x.speed} m/s</td>
                  <td className="text-right tabular-nums">{x.cars}</td>
                  <td className="text-right tabular-nums">{x.hc5.toFixed(1)}%</td>
                  <td className={`text-right tabular-nums ${x.state === 'pass' ? '' : 'font-semibold text-red-700'}`}>{x.interval.toFixed(0)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[11px] font-semibold">Core at its worst level (L{r.maxLevel ?? '—'}): {Math.round(r.requiredMax)} m² needed, {Math.round(r.modelledCore)} m² modelled{r.tower.coreAuto ? ' (sized to the lifts)' : ''}</div>
          <CoreBar r={r} />
          <CoreProfile r={r} />
          <SkyLobbyCompare r={r} />
          <LiftStrategy t={r.tower} />
          <div className="mt-3 grid gap-2">{r.rules.filter((x) => !x.id.startsWith('rise-') || x.id.startsWith('rise-floors')).map((x) => <RuleCard key={x.id} r={x} />)}</div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">Each rise, with its evidence</summary>
            <div className="mt-2 grid gap-2">{r.rules.filter((x) => x.id.startsWith('rise-') && !x.id.startsWith('rise-floors')).map((x) => <RuleCard key={x.id} r={x} />)}</div>
          </details>
          <div className="mt-2 rounded bg-black/[0.03] p-2 text-[11px] text-slate-600">
            Up-peak estimate: round trip by the classic formula with an express run and kinematic stop losses (team derivation; the Peters 2000 general analysis is unread). Handling capacity at 80% car load; interval at the design demand. Waiting and destination times need simulation (roadmap). Presets are editable in Design, Schematic.
          </div>
        </Section>
      ))}

      {n.id === 'built.egress' && enabled[n.id] && egress.map((e) => (
        <Section key={e.tower.id} title={`Results: ${e.tower.name}`}>
          <div className="mb-1 text-xs"><b>{e.stairs} exit stairs × {Math.round(e.widthMm).toLocaleString()} mm</b>{e.governing ? <>, set by level {e.governing.level} ({Math.round(e.governing.load).toLocaleString()} people)</> : null}. One stair enclosure is about {e.enclosure.a.toFixed(1)} × {e.enclosure.b.toFixed(1)} m ({Math.round(e.enclosure.area)} m²).</div>
          <StairPlan t={e.tower} e={e} />
          <StairChart e={e} />
          <div className="mt-3 grid gap-2">{e.rules.map((x) => <RuleCard key={x.id} r={x} />)}</div>
          <div className="mt-2 rounded bg-black/[0.03] p-2 text-[11px] text-slate-600">
            Sized storey by storey from VBBL 2019 Part 3 (equal to VBBL 2007). The stair area feeds the core &amp; lift check, so a wider stair grows the core. Evacuation time, smoke control and stair pressurisation are not modelled (P11-M08).
          </div>
        </Section>
      ))}

      {n.id === 'built.sky-room' && enabled[n.id] && skyRooms.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          {r.room ? (
            <div className="mb-2 rounded-md border border-[#8e5ba8]/40 bg-[#8e5ba8]/[0.05] p-2 text-[11px]">
              <div className="text-xs font-semibold text-[#6d3f8a]">Public sky room, level {r.room.level} (+{Math.round(r.room.z0)} m)</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span className="text-muted">Open to visitors</span><span className="tabular-nums">{Math.round(r.visitorArea).toLocaleString()} m²</span>
                <span className="text-muted">{r.capacity < r.tableLoad - 0.5 ? 'Posted limit' : 'Capacity (table load)'}</span><span className="tabular-nums">{Math.round(r.capacity).toLocaleString()} people{r.capacity < r.tableLoad - 0.5 ? ` (table ${Math.round(r.tableLoad).toLocaleString()})` : ''}</span>
                {r.suggestedLimit && <><span className="text-muted">Stops widening the stairs</span><span className="tabular-nums">at {r.suggestedLimit.limit.toLocaleString()} visitors or fewer</span></>}
                <span className="text-muted">Visitors per hour</span><span className="tabular-nums">about {Math.round(r.visitorsPerHour).toLocaleString()}</span>
                <span className="text-muted">Peak 5 minutes</span><span className="tabular-nums">about {Math.round(r.peak5).toLocaleString()}</span>
                <span className="text-muted">Lifts from the street</span><span>{r.group ? `${r.group.id}, ${r.group.cars} cars` : 'none'}</span>
              </div>
            </div>
          ) : <p className="mb-2 text-[11px] text-muted">No public sky room yet. In Design, Schematic, add a sky lobby and switch it to Public.</p>}
          <div className="grid gap-2">{r.rules.map((x) => <RuleCard key={x.id} r={x} />)}</div>
        </Section>
      ))}

      {n.id.startsWith('built.pr-') && enabled[n.id] && <PublicRealmResults id={n.id} />}
      {n.id === 'built.economics' && enabled[n.id] && <EconomicsResults />}
      {n.id === 'built.mobility' && enabled[n.id] && <MobilityResults />}
      {n.id === 'built.facade' && enabled[n.id] && <FacadeResults />}
      {n.id === 'built.interior' && enabled[n.id] && <InteriorResults />}
      {n.id === 'built.daylight-depth' && enabled[n.id] && <DaylightResults />}
      {n.id === 'built.view-from' && enabled[n.id] && <ViewFromPanel />}
      {n.id === 'built.vista' && enabled[n.id] && <VistaPanel />}
      {n.id === 'built.heights' && enabled[n.id] && <HeightsPanel />}
      {n.id === 'built.culture-claims' && enabled[n.id] && <CultureResults />}
      {n.id === 'built.provenance' && enabled[n.id] && <ProvenanceResults />}
      {n.id === 'built.model' && enabled[n.id] && <ModelPanel />}
      {n.id === 'built.solar-access' && enabled[n.id] && <SolarResults />}

      {n.id === 'built.sun' && enabled[n.id] && (() => {
        const p = sunPosition(vancouverTime(sun.month, sun.day, sun.hour))
        return (
          <Section title="Results">
            <div className="text-xs">Sun at {sun.month}/{sun.day}, {Math.floor(sun.hour)}:{String(Math.round((sun.hour % 1) * 60)).padStart(2, '0')}: azimuth <b>{p.azimuth.toFixed(1)}°</b>, altitude <b>{p.altitude.toFixed(1)}°</b>.</div>
            <div className="mt-2 flex items-center gap-1"><FlagChip flag="verified" /><span className="text-[11px] text-muted">NOAA solar equations, matching the research reference within 0.2°; BC clock UTC-7 all year since 8 Mar 2026. Visual preview of one moment only.</span></div>
            <div className="mt-1 text-[11px] text-slate-700">The City test (Downtown Peninsula Solar Access Guidelines, 22 Sep, 10:00–16:00 PT, no new shadow on listed parks) runs in the "Solar access & sun hours" node.</div>
          </Section>
        )
      })()}

      {n.id === 'built.city-in-nature' && enabled[n.id] && <NatureLedger cones={project === 'city' ? cones : null} />}
      {n.id === 'built.wind-procedure' && enabled[n.id] && <WindProcedurePanel />}
      {n.id === 'built.structure' && enabled[n.id] && <StructurePanel />}
      {n.id === 'built.life-safety' && enabled[n.id] && <LifeSafetyPanel />}
      {n.id === 'built.relax-aviation' && enabled[n.id] && <RelaxAviationPanel />}
      {n.id === 'built.energy-carbon' && enabled[n.id] && <EnergyCarbonResults />}
      {n.id === 'built.wind-study' && enabled[n.id] && <WindStudyPanel />}
      {n.id === 'built.wind-screen' && enabled[n.id] && <WindScreenResults />}
      {n.id === 'built.trips' && enabled[n.id] && <TripsResults />}
      {enabled[n.id] && <RulesBehind nodeId={n.id} />}

      {n.human &&<Section title="What stays with people"><p className="text-xs text-slate-700">{n.human}</p></Section>}

      {n.status === 'researched' && (
        <>
          <Section title="Status"><p className="text-xs text-slate-700">Researched, not built yet. Planned for <b>{n.priority === 'core' ? 'the working core (13 Nov)' : n.priority === 'v1' ? 'v1 (10 Dec)' : 'the roadmap'}</b>.</p></Section>
          {n.method && <Section title="Method (from research)"><p className="text-xs leading-relaxed text-slate-700">{n.method}</p></Section>}
          {!!n.metrics?.length && (
            <Section title="Metrics and thresholds">
              <div className="grid gap-1.5">
                {n.metrics.map((m, i) => (
                  <div key={i} className="rounded border border-line p-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{m.name}</span><FlagChip flag={m.status} /></div>
                    <div className="mt-0.5 text-emerald-800">Good: {m.good}</div>
                    <div className="text-red-800">Bad: {m.bad}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {n.limits && <Section title="Limits"><p className="text-xs text-slate-700">{n.limits}</p></Section>}
        </>
      )}

      {n.research && (
        <Section title="Research record">
          <div className="text-[11px] text-slate-700">Packet <b>{n.packet}</b> · {n.research.rounds.length} expert critique rounds · final gate {n.research.gate_pass ? <b className="text-emerald-700">passed</b> : <b className="text-amber-700">open conditions</b>} · {n.research.false_assumptions_in_packet} false assumptions flagged</div>
          <div className="mt-1 font-mono text-[11px] text-muted">{n.research.log}</div>
          {!!n.libs?.length && <div className="mt-1 text-[11px] text-muted">Libraries: {n.libs.join(', ')}</div>}
        </Section>
      )}
    </div>
  )
}
