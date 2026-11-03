// Results for "Code & life safety" (research P11-M05, M07, M03, with the P11-M09 occupancy it needs): the high-building
// checklist, barrier-free vertical access, and plant floors, risers and emergency power. Items the Egress and Core & lift
// nodes check are linked to them, not re-checked. The plant and riser estimate can feed the core and the plant floors,
// but only when the designer presses the button.
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DEFAULT_SYSTEMS_PRESETS, LIFE_SAFETY_FALSE_ASSUMPTIONS, MECH_FLOOR_SOURCE, NOT_CERTIFICATION, lifeSafety, type ChecklistItem, type LifeSafetyResult, type SystemsPresets } from '../engine/lifeSafety'
import type { RuleResult } from '../engine/types'
import { nodeById } from '../data/registry'
import { useResults } from '../hooks/useResults'
import { useStore } from '../store'
import { CardChip } from './RuleCardView'
import { FalseAssumptions } from './WindStructurePanel'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'

export function useLifeSafety(): LifeSafetyResult[] {
  const { lifts, egress } = useResults()
  const transitLink = useStore((s) => s.transitLink)
  const liftPresets = useStore((s) => s.liftPresets)
  const presets = useStore((s) => s.systemsPresets) ?? DEFAULT_SYSTEMS_PRESETS
  return useMemo(() => lifts.map((l, i) => lifeSafety(l.tower, l, egress[i], { transitLink, liftPresets, presets })), [lifts, egress, transitLink, liftPresets, presets])
}

function Row({ r }: { r: ChecklistItem | RuleResult }) {
  const [open, setOpen] = useState(false)
  const selectNode = useStore((s) => s.selectNode)
  const c = r as ChecklistItem
  return (
    <div className="rounded-md border border-line px-2 py-1.5 text-[11px]">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="flex items-start gap-1">
          {open ? <ChevronDown size={12} className="mt-0.5 shrink-0" /> : <ChevronRight size={12} className="mt-0.5 shrink-0" />}
          <span><span className="font-semibold">{r.label}</span>{c.clause && c.clause !== 'team' && c.clause !== '—' && <span className="text-muted"> · {c.clause}</span>}</span>
        </span>
        <StateChip state={r.state} />
      </button>
      <div className="ml-4 mt-0.5 text-slate-700"><U>{r.value}</U></div>
      {open && (
        <div className="ml-4 mt-1 grid gap-1">
          <div className="text-[10px] text-muted">Needs: <U>{r.threshold}</U></div>
          {r.note && <div className="text-[10px] text-slate-600"><U>{r.note}</U></div>}
          <div className="flex flex-wrap items-center gap-1">
            <FlagChip flag={r.flag} />
            {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
              : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
            <CardChip ruleId={r.id} />
          </div>
        </div>
      )}
      {c.basis === 'linked' && c.linked && (
        <button onClick={() => selectNode(c.linked!)} className="ml-4 mt-0.5 flex items-center gap-0.5 text-[10px] text-accent hover:underline">From {nodeById(c.linked)?.name ?? c.linked}<ArrowRight size={10} /></button>
      )}
      {c.basis === 'manual' && <div className="ml-4 mt-0.5 text-[10px] text-muted">Not assessed by the tool</div>}
    </div>
  )
}

const COUNT_ORDER = ['fail', 'warn', 'unknown', 'pass'] as const
const COUNT_LABEL = { fail: 'fail', warn: 'to show or confirm', unknown: 'not assessed', pass: 'pass' }
function Counts({ items }: { items: RuleResult[] }) {
  const n = (s: string) => items.filter((x) => x.state === s).length
  return <div className="mb-1.5 text-[10px] text-muted">{COUNT_ORDER.filter((s) => n(s) > 0).map((s) => `${n(s)} ${COUNT_LABEL[s]}`).join(' · ')}</div>
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
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {!imported && pl.suggestEvery && pl.modelled < pl.min && (
            <button onClick={() => updateTower(r.tower.id, { plantEvery: pl.suggestEvery! })} className="rounded border border-line px-2 py-1 hover:border-accent hover:text-accent">Put a plant floor every {pl.suggestEvery} floors</button>
          )}
          {Math.abs(sys.servicesNeeded - servicesM2) > 0.5 && (
            <button onClick={() => setLiftPresets({ servicesM2: Math.round(sys.servicesNeeded) })} className="rounded border border-line px-2 py-1 hover:border-accent hover:text-accent">Size the core with {Math.round(sys.servicesNeeded)} m² of risers and services (now {servicesM2})</button>
          )}
        </div>
      )}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-slate-700">Pressure zones, risers and emergency loads</summary>
        <div className="mt-1.5 grid gap-2">
          <table className="w-full text-[10px]">
            <caption className="text-left font-semibold text-slate-700">Domestic water zones (PRV station at the top of each)</caption>
            <thead><tr className="text-muted"><th className="text-left font-normal">Zone</th><th className="text-left font-normal">Levels</th><th className="text-right font-normal">Top (m)</th><th className="text-right font-normal">Static head (kPa)</th></tr></thead>
            <tbody>{sys.water.map((z) => <tr key={z.zone}><td>{z.zone}</td><td>L{z.fromLevel}–L{z.toLevel}</td><td className="text-right tabular-nums">{z.topZ}</td><td className="text-right tabular-nums">{z.headKpa}</td></tr>)}</tbody>
          </table>
          <table className="w-full text-[10px]">
            <caption className="text-left font-semibold text-slate-700">Heating and chilled water zones</caption>
            <tbody>{sys.hydronic.map((z) => <tr key={z.zone}><td>{z.zone}</td><td>L{z.fromLevel}–L{z.toLevel}</td><td className="text-right tabular-nums">{z.headKpa} kPa</td></tr>)}</tbody>
          </table>
          <table className="w-full text-[10px]">
            <caption className="text-left font-semibold text-slate-700">Risers per floor (m²)</caption>
            <tbody>
              {sys.risers.map((x) => <tr key={x.id}><td>{x.label}</td><td className="text-right tabular-nums">{x.m2}</td></tr>)}
              <tr className="font-semibold"><td>Risers in total</td><td className="text-right tabular-nums">{Math.round(sys.riserTotal * 10) / 10}</td></tr>
            </tbody>
          </table>
          <table className="w-full text-[10px]">
            <caption className="text-left font-semibold text-slate-700">Emergency generator loads (3.2.7.9)</caption>
            <tbody>
              {sys.emergency.map((x) => <tr key={x.id}><td>{x.label}</td><td className="text-right tabular-nums">{x.kw} kW</td></tr>)}
              <tr className="font-semibold"><td>Generator, {Math.round(sys.generatorM2)} m² room</td><td className="text-right tabular-nums">{sys.generatorKw} kW</td></tr>
            </tbody>
          </table>
          <p className="text-[10px] text-muted">Plant floors elsewhere take about 7–26% of floors ({MECH_FLOOR_SOURCE.label}): information only, no pass or fail.</p>
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
    <Section title="Presets (team assumptions)">
      <div className="grid gap-1.5">
        {PRESET_FIELDS.map((f) => <NumberField key={f.key} label={f.label} unit={f.unit} step={f.step} min={0} value={presets[f.key] as number} onChange={(v) => set({ [f.key]: Math.max(0, v) } as Partial<SystemsPresets>)} />)}
        <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={presets.firePump} onChange={(e) => set({ firePump: e.target.checked })} />Firefighting water depends on a fire pump</label>
        <p className="text-[10px] text-muted">None of these has a sourced value except the 2 h runtime (3.2.7.9.(1)); the MEP and electrical engineers size the real plant.</p>
      </div>
    </Section>
  )
}

export default function LifeSafetyPanel() {
  const results = useLifeSafety()
  return (
    <>
      <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">{NOT_CERTIFICATION}</div>
      {results.map((r) => (
        <div key={r.tower.id}>
          <Section title={`Life-safety checklist: ${r.tower.name}`}>
            <div className="mb-2 text-[11px] text-slate-700">
              {r.highBuilding ? <b>High building</b> : 'Not a high building'}: top storey floor {r.topStorey} m above grade. Sprinklers required throughout (locked).
              <div className="mt-1 flex flex-wrap gap-1">{r.occupancy.map((o) => <span key={o.label} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700" title={o.label}>{o.group === 'service' ? 'Service' : o.group} · {o.storeys} storey{o.storeys === 1 ? '' : 's'}</span>)}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><FlagChip flag="team_assumption" />Occupancy groups mapped from the program bands (research P11-M09); the code consultant classifies.</div>
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
