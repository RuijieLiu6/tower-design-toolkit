import { CircleX, Eye, ExternalLink, PowerOff } from './icons'
import { useStep } from '../lib/step'
import { addNode, useProjectWorkflow } from '../lib/workflow/projectWorkflow'
import { designForStep } from '../lib/workflow/designNodes'
import { useState } from 'react'
import { useInfo } from './workflow/WorkflowOverview'
import { AddConfirm } from './workflow/AddConfirm'
import { CATEGORIES, JURY_LABEL, canonicalNode, nodeById } from '../data/registry'
import { sunPosition, vancouverTime } from '../engine/sun'
import { PLACEMENT_LABEL, STAIR_MIN_MM, type EgressResult, type StairSpot } from '../engine/egress'
import { CLASS_LABEL, type LiftResult } from '../engine/lifts'
import { coreSide, towerFloors } from '../engine/massing'
import { USES, type Tower, type UseId } from '../engine/types'
import { CONES, CONE_ATTRIBUTION, CONE_PARAMS, STATE_LABEL, bisector, type ConeCheck } from '../engine/viewCones'
import { TIER_LABEL } from '../engine/vtcRules'
import { useResults } from '../hooks/useResults'
import { CITY_ORIGIN, useStore } from '../store'
import CommunityInspector from './CommunityInspector'
import NatureLedger from './NatureLedger'
import { WindProcedurePanel, WindStudyPanel } from './WindStructurePanel'
import StructurePanel from './StructurePanel'
import LifeSafetyPanel from './LifeSafetyPanel'
import { PlatePanel, SeparationPanel } from './SiteLimitsPanel'
import SilhouettePanel from './SilhouettePanel'
import F2fUsePanel from './F2fUsePanel'
import SiteHeights from './site/SiteHeights'
import RelaxAviationPanel from './RelaxAviationPanel'
import EnergyCarbonResults from './EnergyCarbonResults'
import RulesBehind from './RulesBehind'
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
import WindComfortResults from './WindComfortResults'
import DaylightSWResults from './DaylightSWResults'
import VentilationSWResults from './VentilationSWResults'
import EnergySWResults from './EnergySWResults'
import TripsResults from './TripsResults'
import PublicRealmResults from './PublicRealmResults'
import SolarResults from './SolarResults'
import DaylightResults from './DaylightResults'
import { CONE_STYLE, ConeChip, FlagChip, Section, StateChip } from './ui'
import { Donut, Evidence, FlagDot, Fold, HBars, Legend, MethodFold, PairBars, RuleRows, Stack, Stat, Stats } from './ResultViz'
import { U } from './Units'
import { useShallow } from 'zustand/react/shallow'
import Help from './Help'
import ResultChecklist, { DetailsFold } from './ResultChecklist'
import { NeedsInput, ResultBoundary, ResultError } from './ResultState'
import { inputGap } from '../lib/missingInput'
import { useProjectSiteArea } from '../lib/siteArea'
import { KIND_CLASS } from '../lib/status'

/** Where the sun is in the sky at the chosen moment: north up, the horizon is the ring, the centre is overhead. */
function SunDial({ azimuth, altitude }: { azimuth: number; altitude: number }) {
  const R = 44, up = altitude > 0
  const r = R * (1 - Math.max(0, Math.min(90, altitude)) / 90), a = (azimuth * Math.PI) / 180
  const x = r * Math.sin(a), y = -r * Math.cos(a)
  return (
    <svg viewBox="-60 -60 120 120" className="mx-auto h-36 w-36" role="img" aria-label={`Sun at azimuth ${azimuth.toFixed(1)}° and altitude ${altitude.toFixed(1)}°${up ? '' : ', below the horizon'}`}>
      <circle r={R} fill="#f4f7fa" stroke="#8d96a3" strokeWidth="1" />
      {[30, 60].map((alt) => <circle key={alt} r={R * (1 - alt / 90)} fill="none" stroke="#d9dee7" strokeWidth="0.6"><title>{`${alt}° altitude`}</title></circle>)}
      <line x1={-R} x2={R} y1="0" y2="0" stroke="#d9dee7" strokeWidth="0.6" /><line y1={-R} y2={R} x1="0" x2="0" stroke="#d9dee7" strokeWidth="0.6" />
      {['N', 'E', 'S', 'W'].map((n, i) => <text key={n} x={53 * Math.sin((i * Math.PI) / 2)} y={-53 * Math.cos((i * Math.PI) / 2) + 3} fontSize="8" fontWeight="600" textAnchor="middle" fill="#43474d">{n}</text>)}
      <line x1="0" y1="0" x2={R * Math.sin(a)} y2={-R * Math.cos(a)} stroke="#e08a00" strokeWidth="1" strokeDasharray="3 2" />
      <circle cx={x} cy={y} r="5.5" fill={up ? '#f5a300' : '#8d96a3'} stroke="#fff" strokeWidth="1.2"><title>{`Azimuth ${azimuth.toFixed(1)}°, altitude ${altitude.toFixed(1)}°`}</title></circle>
    </svg>
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
      <Legend items={[{ label: 'cars (number on top)', color: '#1f2328', tip: 'The number above a column is its cars' }, { label: 'lobby', color: '#1f2328', tip: "Black: the group's lobby, at grade or a sky lobby" }, { label: 'express', hatch: true, color: '#7d8794', tip: 'Hatched: floors passed express' }, { label: 'plant', color: '#e3e1dc', tip: 'Grey: plant floor, not served' }, ...(r.skyLobbies.length ? [{ label: 'S = shuttle', color: SHUTTLE_COLOR, tip: 'S columns are shuttles to a sky lobby' }] : [])]} />
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
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-meta text-muted">
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
        <text x={x(r.modelledCore) + (x(r.modelledCore) > W - 44 ? -3 : 3)} y={T + 8} fontSize="8" fill="#1f2328" textAnchor={x(r.modelledCore) > W - 44 ? 'end' : 'start'}>modelled</text>
      </svg>
      <Legend items={[{ label: 'core needed, m²', color: '#1d5fa8', line: true }, ...(r.direct ? [{ label: 'no sky lobby', color: '#9aa3ad', line: true, dashed: true, tip: 'The same tower with no sky lobby' }] : []), { label: 'modelled core', color: '#1f2328', line: true, tip: 'The modelled core, one size top to bottom' }]} />
    </figure>
  )
}

/** Sky lobby vs direct service (P11-M02 comparator, single-deck only). */
function SkyLobbyCompare({ r }: { r: LiftResult }) {
  if (!r.direct) return null
  const d = r.direct
  const above = r.skyLobbies[0]?.level
  const ntg = (x: { requiredMax: number; plate: number }) => Math.round((1 - x.requiredMax / x.plate) * 100)
  const saved = d.requiredMax - r.requiredMax
  return (
    <div className="mt-3 min-w-0 rounded-md border border-line p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-xs font-semibold">Sky lobby vs direct</span>
        {/* A comparison of two schemes, not a pass or fail (see the note below): neutral, with its number and unit. */}
        <span className="rounded bg-subtle px-1.5 py-0.5 text-meta font-semibold tabular-nums text-ink">{saved > 0 ? `saves ${Math.round(saved)} m² of core` : `adds ${Math.round(-saved)} m² of core`}</span>
      </div>
      <PairBars label="Sky lobby against direct service" a="Direct" b="Sky lobby" rows={[
        { label: 'Passenger cars', a: d.totalCars, b: r.totalCars, aText: `${d.totalCars}`, bText: `${r.totalCars}` },
        { label: 'Shafts at grade (incl. 2 service)', a: d.shaftsAtGrade, b: r.shaftsAtGrade, aText: `${d.shaftsAtGrade}`, bText: `${r.shaftsAtGrade}` },
        { label: 'Core needed, worst level', a: d.requiredMax, b: r.requiredMax, aText: `${Math.round(d.requiredMax)} m²`, bText: `${Math.round(r.requiredMax)} m²` },
        { label: 'Net-to-gross with that core', a: ntg(d), b: ntg(r), aText: `${ntg(d)}%`, bText: `${ntg(r)}%` },
        { label: 'Lift changes per trip', a: 0, b: 1, aText: '0', bText: `1 above L${above}` },
      ]} />
      <MethodFold title="Why this is not a pass or fail"><div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><span>One transfer is a design choice, not a pass/fail: London tenants asked for direct travel (Stopes), while a public sky room can make the sky lobby a destination. Double-deck and destination control are roadmap.</span></div></MethodFold>
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
      <Legend items={[{ label: 'need of each storey, mm', color: '#c9ced4' }, { label: 'public sky room', color: '#8e5ba8' }, { label: 'stair width there', color: '#c0504d', line: true, tip: 'The stair keeps the widest need of the storeys above' }, { label: '1100 mm minimum', color: '#1f2328', line: true, dashed: true }]} />
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
      <figcaption className="grid min-w-0 gap-1 text-meta text-muted">
        <span className="flex flex-wrap items-center gap-1" title={`Solid line: the distance between the stairs; needs ${e.separationNeeded.toFixed(1)} m`}><StateChip state={sepOk ? 'pass' : 'fail'} /><b className={`tabular-nums ${sepOk ? KIND_CLASS.success.fg : KIND_CLASS.error.fg}`}><U>{`${e.separation.toFixed(1)} m`}</U></b> apart · needs <U>{`${e.separationNeeded.toFixed(1)} m`}</U></span>
        <span className="flex flex-wrap items-center gap-1" title="Dashed line: from the farthest corner to a stair; limit 45 m"><StateChip state={travelOk ? 'pass' : 'fail'} /><b className={`tabular-nums ${travelOk ? 'text-accent' : KIND_CLASS.error.fg}`}><U>{`${e.travel.toFixed(1)} m`}</U></b> travel · limit <U>45 m</U></span>
        <Legend items={[{ label: 'exit stairs', color: '#c0504d', tip: `Exit stairs (${PLACEMENT_LABEL[e.placement]})` }, { label: 'core', color: '#b9c1cb' }, { label: 'apart', color: sepOk ? '#1f6b42' : '#c0392b', line: true }, { label: 'travel', color: travelOk ? '#1d5fa8' : '#c0392b', line: true, dashed: true }]} />
        <span className="truncate" title={`Typical tower floor, ${t.width} × ${t.depth} m; stairs ${PLACEMENT_LABEL[e.placement]}`}>{t.width} × {t.depth} m · {PLACEMENT_LABEL[e.placement]}</span>
      </figcaption>
    </figure>
  )
}

/** All 24 cones at a glance: which have a height estimate, and which stop at "no estimate" until the City answers. */
function ConeCoverage() {
  const known = CONES.filter((c) => CONE_PARAMS[c.id]), unknown = CONES.filter((c) => !CONE_PARAMS[c.id])
  const chip = 'rounded border px-1 py-px text-meta tabular-nums'
  return (
    <Section title="Cone coverage" right={<span className="text-meta text-muted">{known.length} of {CONES.length} with an estimate</span>}>
      <Stack label="View cones with a height estimate" share={false} parts={[{ label: 'with an estimate', v: known.length, color: '#4f7fae' }, { label: 'no estimate', v: unknown.length, color: '#b8c0cc' }]} />
      <div className="mt-2 flex flex-wrap gap-1" aria-label="Cones with an estimate">
        {known.map((c) => <span key={c.id} title={`${c.name}: ${CONE_PARAMS[c.id].source}`} className={`${chip} border-[#4f7fae] text-[#2f5578]`}>{c.id}</span>)}
        {unknown.map((c) => <span key={c.id} title={`${c.name}: no slope in any opened City source`} className={`${chip} border-dashed border-slate-400 text-slate-700`}>{c.id}</span>)}
      </div>
      <MethodFold title="Why some cones have no estimate">
        <p><b>{unknown.length} of {CONES.length} cones have no height estimate.</b> No opened City sheet or Council report gives their slope, so the tool says
          "no estimate" instead of guessing. They wait on City Request 0 (draft in <code>docs/city-requests/</code>). In 3D they are the dashed grey outlines; cones with an estimate are the blue sheets.</p>
        <div className="flex items-start gap-1"><FlagChip flag="unresolved" /><span>Limit unknown for these cones; the City View Cone Assessment governs.</span></div>
      </MethodFold>
    </Section>
  )
}

/** A cone's estimated limit as a scale: the bar is the tower top, the tick the limit, the band its uncertainty. */
function ConeScale({ c, topZ }: { c: ConeCheck; topZ: number }) {
  if (c.limit === null) return null
  const u = c.param?.u95 ?? 0, max = Math.max(topZ, c.limit + u) * 1.12 || 1
  const x = (v: number) => Math.max(0, Math.min(100, (v / max) * 100))
  const over = (c.exceed ?? 0) > 0
  return (
    <div className="mt-1 grid gap-0.5">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" role="img" aria-label={`Tower top ${topZ.toFixed(1)} m against the estimated limit ${c.limit.toFixed(1)} m, plus or minus ${u} m`}>
        <rect y="2" width="100" height="6" rx="1" fill="#eef0f3" />
        <rect x={x(c.limit - u)} width={Math.max(0.5, x(c.limit + u) - x(c.limit - u))} height="10" fill="#d98b1c" opacity="0.28"><title>{`Uncertainty ±${u} m`}</title></rect>
        <rect y="2" width={x(topZ)} height="6" rx="1" fill={CONE_STYLE[c.state].color}><title>{`Top of tower ${topZ.toFixed(1)} m geodetic`}</title></rect>
        <rect x={x(c.limit) - 0.5} width="1" height="10" fill="#1f2328"><title>{`Estimated limit ${c.limit.toFixed(1)} m geodetic`}</title></rect>
      </svg>
      <div className="flex justify-between gap-2 text-[11px] leading-4 text-muted">
        <span className={`tabular-nums font-semibold ${over ? KIND_CLASS.error.fg : KIND_CLASS.success.fg}`}><U>{`${Math.abs(c.exceed!).toFixed(1)} m`}</U> {over ? 'above' : 'below'}</span>
        <span className="tabular-nums">limit <U>{`${c.limit.toFixed(1)} m`}</U> ±<U>{`${u} m`}</U></span>
      </div>
    </div>
  )
}

function ConeRow({ c, topZ }: { c: ConeCheck; topZ: number }) {
  const set = useStore((s) => s.set)
  const viewFrom = () => {
    const O = c.cone.ring[0], u = bisector(c.cone)
    const angs = c.cone.ring.slice(1, -1).map(([x, y]) => Math.atan2(y - O[1], x - O[0]))
    const spread = ((Math.max(...angs) - Math.min(...angs)) * 180) / Math.PI
    set({ cameraRequest: { position: [O[0] - CITY_ORIGIN[0], O[1] - CITY_ORIGIN[1], c.cone.Lv], target: [O[0] - CITY_ORIGIN[0] + u[0] * 2000, O[1] - CITY_ORIGIN[1] + u[1] * 2000, c.cone.Lv + 40], fov: Math.min(70, Math.max(20, spread * 1.4)) } })
  }
  return (
    <div className="min-w-0 rounded-md border border-line p-2" title={`View to ${c.cone.subject} · origin elevation ${c.cone.Lv} m${c.param ? ` · ${c.param.tier} · ${c.param.source}` : ''}`}>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{c.cone.id} · {c.cone.name}</span>
        {c.param && <FlagDot flag={c.param.flag} />}
        <ConeChip state={c.state} label={STATE_LABEL[c.state]} />
      </div>
      <ConeScale c={c} topZ={topZ} />
      {c.limit === null && c.state === 'limit_unknown' && <div className="mt-1 truncate text-meta text-pending" title="No published slope for this cone yet, so the tool stops rather than guessing. Ask the City for a View Cone Assessment (draft in 04 Tool Plan/city-requests/).">No published slope: ask the City</div>}
      <div className="mt-1.5 flex gap-3">
        <button onClick={viewFrom} className="flex items-center gap-1 text-meta text-accent hover:underline" title="View from this viewpoint"><Eye size={12} />View from here</button>
        <a href={c.cone.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-meta text-muted hover:text-accent"><ExternalLink size={12} />City page</a>
      </div>
    </div>
  )
}

export default function Inspector() {
  const { selectedNode, project, fsrTier, sun, enabled, groundMode } = useStore(useShallow((s) => ({ selectedNode: s.selectedNode, project: s.project, fsrTier: s.fsrTier, sun: s.sun, enabled: s.enabled, groundMode: s.groundMode })))
  const n = nodeById(selectedNode)
  const { rules, fsr, cones, lifts, egress, skyRooms, errors } = useResults()
  const towerCount = useStore((s) => s.towers[s.project].length)
  const siteArea = useProjectSiteArea().area
  if (selectedNode?.startsWith('community.')) return <CommunityInspector id={selectedNode} />
  if (!n) return <div className="p-4 text-xs text-muted">Add a check with Add tool in the Workflow list (left panel) or More › Check library, or pick one above, to see its results and evidence.</div>
  const cat = CATEGORIES[n.category]
  const wrongProject = n.projects && !n.projects.includes(project)
  // The results panel's states (design system, 7 Nov): waiting for an input (lib/missingInput.ts: no model, no site),
  // an engine error with its reason, or the results; a panel that throws while it renders shows the error state too.
  const live = !!enabled[n.id] && !wrongProject
  const gap = live ? inputGap(n.id, { project, towers: towerCount, siteArea }) : null
  const failed = live && !gap ? errors?.[n.id] ?? null : null

  return (
    <div>
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-meta text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} />{cat.label} · {n.phase} · {n.priority}
        </div>
        {/* The results lead (UI review, 3 Nov); what the check does sits behind a "?" beside its name (Ruijie, 5 Nov). */}
        <h2 className="mt-1 flex items-center gap-1.5 text-sm font-semibold">{n.name}<Help label={`About ${n.name}`}>{n.question}</Help></h2>
        <AddToWorkflow id={n.id} name={n.name} />
        <div className="mt-1.5 flex flex-wrap gap-1">{n.jury.map((j) => <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-meta text-slate-600">{JURY_LABEL[j] ?? j}</span>)}</div>
        {n.status !== 'researched' && !enabled[n.id] && <div className="mt-2 flex items-start gap-1.5 rounded bg-pending-surface px-2 py-1 text-meta text-pending"><PowerOff size={12} className="mt-0.5 shrink-0" aria-hidden /><span><b>Off</b>: switched off in your workflow, so it does not run. Add it to the workflow (the button below), or switch it on in More › Check library, to see live results.</span></div>}
        {wrongProject && <div className="mt-2 rounded bg-pending-surface px-2 py-1 text-meta text-pending">Runs in the {n.projects!.includes('city') ? '"Real Vancouver"' : '"Competition site"'} project.</div>}
      </div>

      {/* Results at a glance (Ruijie, 6 Nov): pass or fail with what to fix; the full cards fold under Details. */}
      {/* Site limits read the site, not a mass (17 Nov): the summary leads the tool, with or without a tower. */}
      {n.id === 'built.viewcones' && live && <SiteHeights />}
      {gap && <NeedsInput gap={gap} name={n.name} />}
      {gap && <RulesBehind nodeId={n.id} />}
      {failed && <ResultError reason={failed} name={n.name} />}
      {!gap && !failed && <ResultBoundary key={n.id} name={n.name}>
      {live && <ResultChecklist nodeId={n.id} />}
      <DetailsFold nodeId={live ? n.id : ''}>
      {n.id === 'built.vtc-rules' && project === 'vtc' && enabled[n.id] && (
        <Section title="Results"><RuleRows rules={rules} /></Section>
      )}

      {n.id === 'built.fsr' && enabled[n.id] && (
        <Section title="Results">
          <Donut label="Gross floor area by use" unit="m²" center={Math.round(fsr.total).toLocaleString()} sub="m² total gross"
            parts={Object.entries(fsr.gfa).filter(([, v]) => v > 0).map(([u, v]) => ({ label: USES[u as UseId].label, v, color: USES[u as UseId].color }))} />
          <div className="mt-3">
            <HBars label="FSR by tier" stacked fmt={(v) => v.toFixed(2)}
              rows={([1, 2, 3] as const).map((k) => ({ label: TIER_LABEL[k], v: fsr[`tier${k}` as 'tier1'], bold: k === fsrTier, muted: k !== fsrTier, color: k === fsrTier ? '#2563eb' : '#b8c0cc', tip: `${TIER_LABEL[k]}: FSR ${fsr[`tier${k}` as 'tier1'].toFixed(2)}${k === fsrTier ? ' (the tier in use)' : ''}` }))} />
          </div>
          <MethodFold><div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><span>Gross area, no exclusions; Vancouver's FSR exclusions come with the policy register (P01-M07).</span></div></MethodFold>
        </Section>
      )}

      {n.id === 'built.viewcones' && project === 'city' && enabled[n.id] && cones.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className={`mb-2 flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border p-2 text-xs ${CONE_STYLE[r.overall].chip}`} title={`Top of tower: ${r.tower.height} m above a base of ${(r.topZ - r.tower.height).toFixed(1)} m, ${groundMode === 'terrain' ? 'from the terrain, unverified' : 'set by hand'}`}>
            <ConeChip state={r.overall} label={STATE_LABEL[r.overall]} /><span>Top <b className="tabular-nums"><U>{`${r.topZ.toFixed(1)} m`}</U></b> geodetic</span>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
            {r.checks.filter((c) => c.state !== 'outside').map((c) => <ConeRow key={c.cone.id} c={c} topZ={r.topZ} />)}
            {r.checks.every((c) => c.state === 'outside') && <div className="text-meta text-muted" title='Click "Place on map" and try a site near Robson & Cambie.'>Outside every protected view cone.</div>}
          </div>
          <div className="mt-2"><Evidence items={r.checks.filter((c) => c.param).map((c) => ({ id: `cone-${c.cone.id}`, label: `${c.cone.id} · ${c.cone.name}`, flag: c.param!.flag, note: `View to ${c.cone.subject} · origin elevation ${c.cone.Lv} m · ${c.param!.tier}`, source: { label: c.param!.source, url: c.cone.url }, card: false }))} /></div>
          <MethodFold>
            <p>Estimate only: Z = Lv + k·D along the cone axis. Public Views Guidelines (Feb 2026) cl. 3.1.1: no part of a building should encroach into the relevant view cones. Relaxations (Higher Buildings, Exceptional Downtown Sites 3.4) are your call. The City View Cone Assessment governs. {CONE_ATTRIBUTION}</p>
            <p>Top of tower at {r.topZ.toFixed(1)} m geodetic: {r.tower.height} m above a base of {(r.topZ - r.tower.height).toFixed(1)} m, {groundMode === 'terrain' ? 'from the terrain, unverified' : 'set by hand'}.</p>
          </MethodFold>
        </Section>
      ))}
      {n.id === 'built.viewcones' && project === 'city' && enabled[n.id] && <ConeCoverage />}

      {n.id === 'built.core-lifts' && enabled[n.id] && lifts.map((r) => {
        const riseColor = (x: (typeof r.rises)[number]) => (x.cls === 'public' ? CLASS_COLOR.public : x.kind === 'shuttle' ? SHUTTLE_COLOR : CLASS_COLOR[x.cls])
        const riseName = (x: (typeof r.rises)[number]) => `${x.id} ${x.cls === 'public' ? 'Public' : x.kind === 'shuttle' ? 'Shuttle' : CLASS_LABEL[x.cls]}`
        const riseTip = (x: (typeof r.rises)[number]) => `${riseName(x)}: levels ${x.kind === 'shuttle' ? `${x.baseLevel} → ${x.floors[0].level}` : `${x.floors[0].level}–${x.floors[x.floors.length - 1].level}`}, ${x.speed} m/s, ${x.cars} cars, HC5 ${x.hc5.toFixed(1)}%, interval ${x.interval.toFixed(0)} s`
        return (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <Stats>
            <Stat label="Passenger cars" value={`${r.totalCars}`} tip="Plus service and firefighter lifts" />
            <Stat label="Lift groups" value={`${r.rises.length}`} />
            <Stat label="Sky lobbies" value={r.skyLobbies.length ? r.skyLobbies.map((f) => `L${f.level}`).join(', ') : '0'} />
          </Stats>
          <div className="mt-2"><RiseDiagram t={r.tower} r={r} /></div>
          <div className="mt-3 text-meta font-semibold">Interval by rise</div>
          <div className="mt-1"><HBars label="Up-peak interval by rise" unit="s" rows={r.rises.map((x) => ({ label: riseName(x), swatch: riseColor(x), v: x.interval, color: x.state === 'pass' ? riseColor(x) : '#c53030', tip: riseTip(x), chip: x.state !== 'pass' ? <CircleX size={11} className={KIND_CLASS.error.fg} aria-label="Fail" /> : undefined }))} /></div>
          <div className="mt-2 text-meta font-semibold">Handling capacity in 5 minutes</div>
          <div className="mt-1"><HBars label="Handling capacity in five minutes by rise" fmt={(v) => `${v.toFixed(1)}%`} rows={r.rises.map((x) => ({ label: riseName(x), swatch: riseColor(x), v: x.hc5, color: riseColor(x), tip: riseTip(x) }))} /></div>
          <div className="mt-2"><Fold title="Rise table: levels, speed, cars">
            <table className="w-full text-meta">
              <thead><tr className="border-b border-line text-left text-meta text-muted"><th className="py-1 font-medium">Rise</th><th className="font-medium">Levels</th><th className="text-right font-medium">m/s</th><th className="text-right font-medium">Cars</th><th className="text-right font-medium">HC5</th><th className="text-right font-medium">Int.</th></tr></thead>
              <tbody>
                {r.rises.map((x) => (
                  <tr key={x.id} className="border-b border-line/60" title={riseTip(x)}>
                    <td className="py-1"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: riseColor(x) }} />{x.id}</td>
                    <td className="tabular-nums">{x.kind === 'shuttle' ? `${x.baseLevel} → ${x.floors[0].level}` : `${x.floors[0].level}–${x.floors[x.floors.length - 1].level}`}</td>
                    <td className="text-right tabular-nums">{x.speed}</td>
                    <td className="text-right tabular-nums">{x.cars}</td>
                    <td className="text-right tabular-nums">{x.hc5.toFixed(1)}%</td>
                    <td className={`text-right tabular-nums ${x.state === 'pass' ? '' : `font-semibold ${KIND_CLASS.error.fg}`}`}>{x.interval.toFixed(0)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Fold></div>
          <div className="mt-3 text-meta font-semibold tabular-nums" title={`Core at its worst level (L${r.maxLevel ?? '—'}): ${Math.round(r.requiredMax)} m² needed, ${Math.round(r.modelledCore)} m² modelled${r.tower.coreAuto ? ' (sized to the lifts)' : ''}`}>Core at L{r.maxLevel ?? '—'}: {Math.round(r.requiredMax)} m² needed · {Math.round(r.modelledCore)} m² modelled</div>
          <CoreBar r={r} />
          <CoreProfile r={r} />
          <SkyLobbyCompare r={r} />
          <LiftStrategy t={r.tower} />
          <div className="mt-3"><RuleRows rules={r.rules.filter((x) => !x.id.startsWith('rise-') || x.id.startsWith('rise-floors'))} /></div>
          <div className="mt-2"><Fold title="Each rise, with its evidence"><RuleRows rules={r.rules.filter((x) => x.id.startsWith('rise-') && !x.id.startsWith('rise-floors'))} /></Fold></div>
          <MethodFold>
            <p>Up-peak estimate: round trip by the classic formula with an express run and kinematic stop losses (team derivation; the Peters 2000 general analysis is unread). Handling capacity at 80% car load; interval at the design demand. Waiting and destination times need simulation (roadmap). Presets are editable in Design, Schematic.</p>
            <p>{r.totalCars} passenger cars in {r.rises.length} group{r.rises.length === 1 ? '' : 's'}{r.skyLobbies.length ? `, with ${r.skyLobbies.length === 1 ? 'a sky lobby' : `${r.skyLobbies.length} sky lobbies`} at ${r.skyLobbies.map((f) => `L${f.level}`).join(', ')}` : ''}, plus service and firefighter lifts.</p>
          </MethodFold>
        </Section>
      )})}

      {n.id === 'built.egress' && enabled[n.id] && egress.map((e) => (
        <Section key={e.tower.id} title={`Results: ${e.tower.name}`}>
          <Stats>
            <Stat label="Exit stairs" value={`${e.stairs}`} />
            <Stat label="Stair width" value={Math.round(e.widthMm).toLocaleString()} unit="mm" tip={e.governing ? `Set by level ${e.governing.level} (${Math.round(e.governing.load).toLocaleString()} people)` : undefined} />
            <Stat label="One enclosure" value={`${Math.round(e.enclosure.area)}`} unit="m²" tip={`About ${e.enclosure.a.toFixed(1)} × ${e.enclosure.b.toFixed(1)} m`} />
          </Stats>
          <StairPlan t={e.tower} e={e} />
          <StairChart e={e} />
          <div className="mt-3"><RuleRows rules={e.rules} /></div>
          <MethodFold>
            <p>Sized storey by storey from VBBL 2019 Part 3 (equal to VBBL 2007). The stair area feeds the core &amp; lift check, so a wider stair grows the core. Evacuation time, smoke control and stair pressurisation are not modelled (P11-M08).</p>
            <p>{e.stairs} exit stairs × {Math.round(e.widthMm).toLocaleString()} mm{e.governing ? `, set by level ${e.governing.level} (${Math.round(e.governing.load).toLocaleString()} people)` : ''}. One stair enclosure is about {e.enclosure.a.toFixed(1)} × {e.enclosure.b.toFixed(1)} m ({Math.round(e.enclosure.area)} m²).</p>
          </MethodFold>
        </Section>
      ))}

      {n.id === 'built.sky-room' && enabled[n.id] && skyRooms.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          {r.room ? (
            <div className="mb-2 min-w-0 rounded-md border border-[#8e5ba8]/40 bg-[#8e5ba8]/[0.05] p-2 text-meta">
              <div className="mb-1.5 text-xs font-semibold text-[#6d3f8a]">Public sky room, level {r.room.level} (+{Math.round(r.room.z0)} m)</div>
              <Stats cols={2}>
                <Stat label="Open to visitors" value={Math.round(r.visitorArea).toLocaleString()} unit="m²" />
                <Stat label="Lifts from the street" value={r.group ? `${r.group.id} · ${r.group.cars} cars` : 'none'} />
              </Stats>
              <div className="mt-2"><HBars label="People in the sky room" color="#8e5ba8" labelWidth="7rem" rows={[
                { label: r.capacity < r.tableLoad - 0.5 ? 'Posted limit' : 'Capacity', v: r.capacity, mark: r.tableLoad, markTip: `Table load ${Math.round(r.tableLoad).toLocaleString()} people`, bold: true, tip: `${r.capacity < r.tableLoad - 0.5 ? 'Posted limit' : 'Capacity (table load)'}: ${Math.round(r.capacity).toLocaleString()} people${r.capacity < r.tableLoad - 0.5 ? ` (table ${Math.round(r.tableLoad).toLocaleString()})` : ''}` },
                ...(r.suggestedLimit ? [{ label: 'Stair-neutral', v: r.suggestedLimit.limit, color: '#b79ac8', tip: `Stops widening the stairs at ${r.suggestedLimit.limit.toLocaleString()} visitors or fewer` }] : []),
                { label: 'Visitors per hour', v: r.visitorsPerHour, color: '#b79ac8', tip: `About ${Math.round(r.visitorsPerHour).toLocaleString()} visitors per hour` },
                { label: 'Peak 5 minutes', v: r.peak5, color: '#b79ac8', tip: `About ${Math.round(r.peak5).toLocaleString()} in the peak 5 minutes` },
              ]} /></div>
            </div>
          ) : <p className="mb-2 truncate text-meta text-muted" title="In Design, Schematic, add a sky lobby and switch it to Public.">No public sky room yet.</p>}
          <RuleRows rules={r.rules} />
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
            <SunDial azimuth={p.azimuth} altitude={p.altitude} />
            <div className="mt-2"><Stats>
              <Stat label="Moment" value={`${sun.month}/${sun.day}`} unit={`${Math.floor(sun.hour)}:${String(Math.round((sun.hour % 1) * 60)).padStart(2, '0')}`} />
              <Stat label="Azimuth" value={`${p.azimuth.toFixed(1)}°`} />
              <Stat label="Altitude" value={`${p.altitude.toFixed(1)}°`} />
            </Stats></div>
            <MethodFold>
              <div className="flex items-start gap-1"><FlagChip flag="verified" /><span>NOAA solar equations, matching the research reference within 0.2°; BC clock UTC-7 all year since 8 Mar 2026. Visual preview of one moment only.</span></div>
              <p>The City test (Downtown Peninsula Solar Access Guidelines, 22 Sep, 10:00–16:00 PT, no new shadow on listed parks) runs in the "Solar access & sun hours" node.</p>
            </MethodFold>
          </Section>
        )
      })()}

      {n.id === 'built.city-in-nature' && enabled[n.id] && <NatureLedger cones={project === 'city' ? cones : null} />}
      {n.id === 'built.wind-procedure' && enabled[n.id] && <WindProcedurePanel />}
      {n.id === 'built.structure' && enabled[n.id] && <StructurePanel />}
      {n.id === 'built.life-safety' && enabled[n.id] && <LifeSafetyPanel />}
      {n.id === 'built.relax-aviation' && enabled[n.id] && <RelaxAviationPanel />}
      {n.id === 'built.separation' && enabled[n.id] && <SeparationPanel />}
      {n.id === 'built.floorplate' && enabled[n.id] && <PlatePanel />}
      {n.id === 'built.silhouette' && enabled[n.id] && <SilhouettePanel />}
      {n.id === 'built.f2f-use' && enabled[n.id] && <F2fUsePanel />}
      {n.id === 'built.viewcones' && project === 'vtc' && <p className="px-4 py-3 text-meta text-muted">The view cones are checked in the Real Vancouver project; on the competition site the brief's height band applies (VTC hard rules). Tower separation and floor plate run here.</p>}
      {n.id === 'built.energy-carbon' && enabled[n.id] && <EnergyCarbonResults />}
      {n.id === 'built.wind-study' && enabled[n.id] && <WindStudyPanel />}
      {n.id === 'built.wind-screen' && enabled[n.id] && <WindScreenResults />}
      {n.id === 'built.wind-comfort' && enabled[n.id] && <WindComfortResults />}
      {n.id === 'built.daylight-sw' && enabled[n.id] && <DaylightSWResults />}
      {n.id === 'built.ventilation-sw' && enabled[n.id] && <VentilationSWResults />}
      {n.id === 'built.energy-sw' && enabled[n.id] && <EnergySWResults />}
      {n.id === 'built.trips' && enabled[n.id] && <TripsResults />}
      {enabled[n.id] && <RulesBehind nodeId={n.id} />}
      </DetailsFold>
      </ResultBoundary>}

      {n.human &&<Section title="What stays with people"><p className="text-xs text-slate-700">{n.human}</p></Section>}

      {n.status === 'researched' && (
        <>
          <Section title="Status"><p className="text-xs text-slate-700">Researched, not built yet. Planned for <b>{n.priority === 'core' ? 'the working core (13 Nov)' : n.priority === 'v1' ? 'v1 (10 Dec)' : 'the roadmap'}</b>.</p></Section>
          {n.method && <Section title="Method (from research)"><p className="text-xs leading-relaxed text-slate-700">{n.method}</p></Section>}
          {!!n.metrics?.length && (
            <Section title="Metrics and thresholds">
              <div className="grid gap-1.5">
                {n.metrics.map((m, i) => (
                  <div key={i} className="rounded border border-line p-1.5 text-meta">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{m.name}</span><FlagChip flag={m.status} /></div>
                    {/* Thresholds from research, not results: neutral, so they do not read as a pass or a fail. */}
                    <div className="mt-0.5 text-ink"><span className="text-muted">Good:</span> {m.good}</div>
                    <div className="text-ink"><span className="text-muted">Bad:</span> {m.bad}</div>
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
          <div className="text-meta text-slate-700">Packet <b>{n.packet}</b> · {n.research.rounds.length} expert critique rounds · final gate {n.research.gate_pass ? <b className={KIND_CLASS.success.fg}>passed</b> : <b className={KIND_CLASS.warning.fg}>open conditions</b>} · {n.research.false_assumptions_in_packet} false assumptions flagged</div>
          <div className="mt-1 font-mono text-meta text-muted">{n.research.log}</div>
          {!!n.libs?.length && <div className="mt-1 text-meta text-muted">Libraries: {n.libs.join(', ')}</div>}
        </Section>
      )}
    </div>
  )
}

/** A check you are looking at that isn't in your workflow: add it after the current step (Ruijie, 7 Nov). */
function AddToWorkflow({ id: shown, name: shownName }: { id: string; name: string }) {
  // A merged tool's part is added (and counted as in the workflow) through its lead (data/registry.ts MERGES).
  const id = canonicalNode(shown), name = id === shown ? shownName : nodeById(id)?.name ?? shownName
  const inWorkflow = useProjectWorkflow((s) => s.wf.nodes.includes(id))
  const step = useStep((s) => s.step)
  const info = useInfo()
  const [ask, setAsk] = useState(false)
  if (inWorkflow) return null
  const after = designForStep(step)?.id
  const at = after && useProjectWorkflow.getState().wf.nodes.includes(after) ? after : null
  const add = () => {
    const w = useProjectWorkflow.getState()
    w.commit(addNode(w.wf, id, at), `${name} added to the workflow`)
    setAsk(false)
  }
  // the same confirmation card as Add tool in the phase panel: nothing changes until Add to workflow
  if (ask) return <AddConfirm info={info(id)} className="mt-1.5" onConfirm={add} onCancel={() => setAsk(false)}
    placement={at ? <>Goes after {info(at).name}</> : <>Goes where it fits in the workflow</>} />
  return <button type="button" onClick={() => setAsk(true)} data-testid="add-to-workflow" className="mt-1.5 flex items-center gap-1 rounded-lg bg-panel px-2.5 py-1 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">+ Add to workflow</button>
}
