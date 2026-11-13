// Results for "Code & life safety" (research P11-M05, M07, M03, with the P11-M09 occupancy it needs): the high-building
// checklist, barrier-free vertical access, and plant floors, risers and emergency power. Items the Egress and Core & lift
// nodes check are linked to them, not re-checked. The plant and riser estimate can feed the core and the plant floors,
// but only when the designer presses the button.
import { ArrowRight, ChevronDown, ChevronRight } from './icons'
import { useMemo, useState } from 'react'
import { DEFAULT_SYSTEMS_PRESETS, LIFE_SAFETY_FALSE_ASSUMPTIONS, MECH_FLOOR_SOURCE, NOT_CERTIFICATION, lifeSafety, type ChecklistItem, type LifeSafetyResult, type SystemsPresets } from '../engine/lifeSafety'
import type { RuleResult } from '../engine/types'
import { nodeById } from '../data/registry'
import { useResults } from '../hooks/useResults'
import { useStore } from '../store'
import { CardChip } from './RuleCardView'
import { FalseAssumptions } from './WindStructurePanel'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { Caveat, FlagDot, HBars, MethodFold, Stat, StateStack, Stats } from './ResultViz'
import { U } from './Units'

export function useLifeSafety(): LifeSafetyResult[] {
  const { lifts, egress } = useResults()
  const transitLink = useStore((s) => s.transitLink)
  const liftPresets = useStore((s) => s.liftPresets)
  const presets = useStore((s) => s.systemsPresets) ?? DEFAULT_SYSTEMS_PRESETS
  // The competition site's frontage input counts the entrances on each street (Program step › Ground & public realm).
  const entrances = useStore((s) => (s.project === 'vtc' ? Object.values(s.publicRealm.frontage).reduce((n, f) => n + f.entrances, 0) : null))
  return useMemo(() => lifts.map((l, i) => lifeSafety(l.tower, l, egress[i], { transitLink, liftPresets, presets, entrances })), [lifts, egress, transitLink, liftPresets, presets, entrances])
}

function Row({ r }: { r: ChecklistItem | RuleResult }) {
  const [open, setOpen] = useState(false)
  const selectNode = useStore((s) => s.selectNode)
  const c = r as ChecklistItem
  return (
    <div className="rounded-md border border-line px-2 py-1.5 text-meta">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="flex items-start gap-1">
          {open ? <ChevronDown size={12} className="mt-0.5 shrink-0" /> : <ChevronRight size={12} className="mt-0.5 shrink-0" />}
          <span><span className="font-semibold">{r.label}</span>{c.clause && c.clause !== 'team' && c.clause !== '—' && <span className="text-muted"> · {c.clause}</span>}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1"><FlagDot flag={r.flag} /><StateChip state={r.state} /></span>
      </button>
      <div className={`ml-4 mt-0.5 break-words text-slate-700 ${open ? '' : 'line-clamp-1'}`} title={r.value}><U>{r.value}</U></div>
      {open && (
        <div className="ml-4 mt-1 grid gap-1">
          <div className="text-meta text-muted">Needs: <U>{r.threshold}</U></div>
          {r.note && <div className="text-meta text-slate-600"><U>{r.note}</U></div>}
          <div className="flex flex-wrap items-center gap-1">
            <FlagChip flag={r.flag} />
            {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
              : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
            <CardChip ruleId={r.id} />
          </div>
        </div>
      )}
      {c.basis === 'linked' && c.linked && (
        <button onClick={() => selectNode(c.linked!)} className="ml-4 mt-0.5 flex items-center gap-0.5 text-meta text-accent hover:underline">From {nodeById(c.linked)?.name ?? c.linked}<ArrowRight size={10} /></button>
      )}
      {c.basis === 'manual' && <div className="ml-4 mt-0.5 text-meta text-muted">Not assessed by the tool</div>}
    </div>
  )
}

const COUNT_ORDER = ['fail', 'warn', 'unknown', 'pass'] as const
const COUNT_LABEL = { fail: 'fail', warn: 'to show or confirm', unknown: 'not assessed', pass: 'pass' }
function Counts({ items }: { items: RuleResult[] }) {
  const n = (s: string) => items.filter((x) => x.state === s).length
  return <div className="mb-2"><StateStack label="Checklist items by result" counts={Object.fromEntries(COUNT_ORDER.map((s) => [s, n(s)]))} names={COUNT_LABEL} /></div>
}

function Systems({ r }: { r: LifeSafetyResult }) {
  const updateTower = useStore((s) => s.updateTower)
  const setLiftPresets = useStore((s) => s.setLiftPresets)
  const servicesM2 = useStore((s) => s.liftPresets.servicesM2)
  const present = useStore((s) => s.phase === 'present')
  const sys = r.systems, pl = sys.plant
  const imported = !!r.tower.imported
  return (
    <div className="grid gap-2">
      {r.systemRules.map((x) => <Row key={x.id} r={x} />)}
      {!present && (
        <div className="flex flex-wrap gap-1.5 text-meta">
          {!imported && pl.suggestEvery && pl.modelled < pl.min && (
            <button onClick={() => updateTower(r.tower.id, { plantEvery: pl.suggestEvery! })} className="rounded border border-line px-2 py-1 hover:border-accent hover:text-accent">Put a plant floor every {pl.suggestEvery} floors</button>
          )}
          {Math.abs(sys.servicesNeeded - servicesM2) > 0.5 && (
            <button onClick={() => setLiftPresets({ servicesM2: Math.round(sys.servicesNeeded) })} className="rounded border border-line px-2 py-1 hover:border-accent hover:text-accent">Size the core with {Math.round(sys.servicesNeeded)} m² of risers and services (now {servicesM2})</button>
          )}
        </div>
      )}
      <details className="text-meta">
        <summary className="cursor-pointer text-slate-700">Pressure zones, risers and emergency loads</summary>
        <div className="mt-1.5 grid gap-2">
          <div className="grid gap-1"><div className="font-semibold text-slate-700" title="A PRV station at the top of each zone">Domestic water zones, static head</div>
            <HBars label="Domestic water zones by static head" unit="kPa" labelWidth="6rem" color="#3b82c4" rows={sys.water.map((z) => ({ label: `${z.zone} · L${z.fromLevel}–${z.toLevel}`, v: z.headKpa, tip: `Zone ${z.zone}: L${z.fromLevel}–L${z.toLevel}, top ${z.topZ} m, static head ${z.headKpa} kPa` }))} /></div>
          <div className="grid gap-1"><div className="font-semibold text-slate-700">Heating and chilled water zones</div>
            <HBars label="Heating and chilled water zones by head" unit="kPa" labelWidth="6rem" color="#c0504d" rows={sys.hydronic.map((z) => ({ label: `${z.zone} · L${z.fromLevel}–${z.toLevel}`, v: z.headKpa }))} /></div>
          <div className="grid gap-1"><div className="flex justify-between font-semibold text-slate-700"><span>Risers per floor</span><span className="tabular-nums">{Math.round(sys.riserTotal * 10) / 10} m² in total</span></div>
            <HBars label="Risers per floor" unit="m²" fmt={(v) => String(Math.round(v * 10) / 10)} labelWidth="8rem" color="#7f8c8d" rows={sys.risers.map((x) => ({ label: x.label, v: x.m2 }))} /></div>
          <div className="grid gap-1"><div className="flex justify-between font-semibold text-slate-700"><span title="3.2.7.9">Emergency generator loads</span><span className="tabular-nums" title={`Generator room about ${Math.round(sys.generatorM2)} m²`}>{sys.generatorKw} kW · {Math.round(sys.generatorM2)} m² room</span></div>
            <HBars label="Emergency generator loads (3.2.7.9)" unit="kW" labelWidth="8rem" color="#d98b1c" rows={sys.emergency.map((x) => ({ label: x.label, v: x.kw }))} /></div>
          <p className="text-meta text-muted">Plant floors elsewhere take about 7–26% of floors ({MECH_FLOOR_SOURCE.label}): information only, no pass or fail.</p>
        </div>
      </details>
    </div>
  )
}

const PRESET_FIELDS: { key: keyof SystemsPresets; label: string; unit: string; step: number }[] = [
  { key: 'pMinKpa', label: 'Minimum pressure at the top fixture', unit: 'kPa', step: 5 },
  { key: 'hydronicRatingKpa', label: 'Hydronic equipment rating', unit: 'kPa', step: 50 },
  { key: 'airReachFloors', label: 'Floors one air-handling plant serves', unit: 'floors', step: 1 },
  { key: 'liftKw', label: 'Lift motor', unit: 'kW', step: 5 },
  { key: 'firePumpKw', label: 'Fire pump', unit: 'kW', step: 5 },
  { key: 'stairFanKw', label: 'Stair fan, each stair', unit: 'kW', step: 1 },
  { key: 'smokeFanKw', label: 'Smoke and venting fans', unit: 'kW', step: 5 },
  { key: 'runtimeH', label: 'Generator runtime', unit: 'h', step: 0.5 },
  { key: 'washroomsM2', label: 'Core washrooms per floor', unit: 'm²', step: 1 },
  { key: 'airShaftM2', label: 'Air and smoke shafts per floor', unit: 'm²', step: 0.5 },
]

function Presets() {
  const presets = useStore((s) => s.systemsPresets) ?? DEFAULT_SYSTEMS_PRESETS
  const set = (patch: Partial<SystemsPresets>) => useStore.setState((s) => ({ systemsPresets: { ...(s.systemsPresets ?? DEFAULT_SYSTEMS_PRESETS), ...patch } }))
  return (
    <Section title="Presets (team assumptions)" folded>
      <div className="grid gap-1.5">
        {PRESET_FIELDS.map((f) => <NumberField key={f.key} label={f.label} unit={f.unit} step={f.step} min={0} value={presets[f.key] as number} onChange={(v) => set({ [f.key]: Math.max(0, v) } as Partial<SystemsPresets>)} />)}
        <label className="flex items-center gap-1.5 text-meta"><input type="checkbox" checked={presets.firePump} onChange={(e) => set({ firePump: e.target.checked })} />Firefighting water depends on a fire pump</label>
        <p className="text-meta text-muted">None of these has a sourced value except the 2 h runtime (3.2.7.9.(1)); the MEP and electrical engineers size the real plant.</p>
      </div>
    </Section>
  )
}

export default function LifeSafetyPanel() {
  const results = useLifeSafety()
  return (
    <>
      <div className="mx-4 mt-3"><Caveat lead="Early checklist, not code certification">{NOT_CERTIFICATION}</Caveat></div>
      {results.map((r) => (
        <div key={r.tower.id}>
          <Section title={`Life-safety checklist: ${r.tower.name}`}>
            <div className="mb-2 grid min-w-0 gap-1.5 text-meta text-slate-700">
              <Stats cols={2}>
                <Stat label="High building" value={r.highBuilding ? 'Yes' : 'No'} tip="Sprinklers required throughout (locked)" />
                <Stat label="Top storey floor" value={`${r.topStorey}`} unit="m above grade" />
              </Stats>
              <div className="flex flex-wrap gap-1">{r.occupancy.map((o) => <span key={o.label} className="rounded bg-slate-100 px-1.5 py-0.5 text-meta text-slate-700" title={o.label}>{o.group === 'service' ? 'Service' : o.group} · {o.storeys} storey{o.storeys === 1 ? '' : 's'}</span>)}</div>
              <MethodFold title="About the occupancy groups"><div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><span>Occupancy groups mapped from the program bands (research P11-M09); the code consultant classifies. Sprinklers required throughout (locked).</span></div></MethodFold>
            </div>
            <Counts items={r.checklist} />
            <div className="grid gap-1.5">{r.checklist.map((x) => <Row key={x.id} r={x} />)}</div>
          </Section>
          <Section title={`Barrier-free vertical access: ${r.tower.name}`}>
            <Counts items={r.access} />
            <div className="grid gap-1.5">{r.access.map((x) => <Row key={x.id} r={x} />)}</div>
          </Section>
          <Section title={`Plant, risers and emergency power: ${r.tower.name}`}>
            <Systems r={r} />
          </Section>
        </div>
      ))}
      <Presets />
      <FalseAssumptions items={LIFE_SAFETY_FALSE_ASSUMPTIONS} />
    </>
  )
}
