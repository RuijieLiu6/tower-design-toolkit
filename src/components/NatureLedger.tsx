// City in Nature evidence ledger (research P05-M01): indicators with value, threshold, force, flag and source, values
// entered here until the modules that compute them are built. No composite score, by design.
import { OctagonX } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { DIRECTIONS, FORCE_LABEL, cityInNature, fourthStoreyTop, isBinding, type Direction, type Force, type NatureInput, type NatureRow, type SiteType } from '../engine/cityInNature'
import { towerFloors } from '../engine/massing'
import { useFacade } from '../hooks/useFacade'
import { SITE } from '../engine/vtcRules'
import { useStore, useTowers } from '../store'
import { CardChip } from './RuleCardView'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

/** The ledger for the current design; cones come from the view-cone results in Real Vancouver. */
export function useNature(cones: { overall: string }[] | null) {
  const input = useStore((s) => s.cityInNature)
  const project = useStore((s) => s.project)
  const towers = useTowers()
  const facade = useFacade()
  return useMemo(() => cityInNature(input, project === 'vtc' ? SITE.area : null, project === 'city' && cones ? cones.map((c) => c.overall) : null,
    { fourthStoreyTop: fourthStoreyTop(towers.map(towerFloors)), faces: facade.faces }), [input, project, cones, towers, facade])
}

/** Solid = binding, dotted = target / guideline / aspiration, dashed = comparator or team assumption. */
const RING: Record<Force, string> = {
  bylaw_requirement: 'border-solid border-ink', rezoning_policy_requirement: 'border-solid border-ink',
  rezoning_target: 'border-dotted border-slate-500', voluntary_guideline: 'border-dotted border-slate-500', city_aspiration: 'border-dotted border-slate-500',
  comparator_other_jurisdiction: 'border-dashed border-slate-400', team_assumption: 'border-dashed border-slate-400',
}

function NumberInput({ label, value, unit, onChange }: { label: string; value: number | null; unit: string; onChange: (v: number | null) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted">
      {label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" min={0} value={value ?? ''} placeholder="—" aria-label={label}
          onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
          className="w-20 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
        <span className="pr-1.5">{unit}</span>
      </span>
    </label>
  )
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const opts: [boolean | null, string][] = [[null, 'Not answered'], [true, 'Yes'], [false, 'No']]
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted" role="radiogroup" aria-label={label}>
      {label}
      {opts.map(([v, t]) => (
        <button key={t} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded border px-1.5 py-0.5 ${value === v ? 'border-accent bg-accent/10 text-ink' : 'border-line hover:border-accent'}`}>{t}</button>
      ))}
    </div>
  )
}

function Row({ r, children }: { r: NatureRow; children?: ReactNode }) {
  return (
    <div className={`rounded-md border-2 p-2 ${RING[r.force]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold">{r.name}</span>
        {r.entered === null && r.state === 'unknown' ? <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-muted">Not entered</span> : <StateChip state={r.state} />}
      </div>
      <div className="mt-0.5 text-[11px]"><b className="tabular-nums"><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {children && <div className="mt-1.5">{children}</div>}
      {r.note && <div className="mt-1 text-[10px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700" title={isBinding(r.force) ? 'Binding: can pass or fail' : 'Reference line: shown, never scored as compliance'}>{FORCE_LABEL[r.force]}</span>
        <FlagChip flag={r.flag} />
        <span className="text-[10px] text-muted">ODP {r.direction}</span>
        <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
        <CardChip ruleId={r.id} />
      </div>
    </div>
  )
}

export default function NatureLedger({ cones }: { cones: { overall: string }[] | null }) {
  const n = useNature(cones)
  const input = useStore((s) => s.cityInNature)
  const project = useStore((s) => s.project)
  const set = (patch: Partial<NatureInput>) => useStore.setState((s) => ({ cityInNature: { ...s.cityInNature, ...patch } }))
  const row = (id: string) => n.rows.find((r) => r.id === id)!

  return (
    <>
      <Section title="Results">
        <div className="mb-2 rounded-md bg-black/[0.03] p-2 text-[11px] text-slate-700">
          <div><b>Binding requirements:</b> {n.binding.passed} of {n.binding.total} met{n.binding.failed ? `, ${n.binding.failed} not met` : ''}{n.binding.open ? `, ${n.binding.open} not answered` : ''}.</div>
          <div className="mt-0.5">Targets, guidelines and comparators are shown for reference and never scored as compliance. There is no overall score: City in Nature is a judgment.</div>
          <div className="mt-1.5 flex flex-wrap gap-1" aria-label="ODP Ecology directions covered">
            {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
              <span key={d} className={`rounded px-1.5 py-0.5 text-[10px] ${n.coverage[d] ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`} title={n.coverage[d] ? 'Has evidence or a written note' : 'No evidence or note yet'}>
                {d} {DIRECTIONS[d]} {n.coverage[d] ? '✓' : '· gap'}
              </span>
            ))}
          </div>
        </div>
        <label className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">R019 site type
          <select value={input.siteType} onChange={(e) => set({ siteType: e.target.value as SiteType })} className="rounded border border-line bg-panel px-1 py-0.5 text-ink">
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
          <FlagChip flag="team_assumption" />
        </label>

        <h4 className="mb-1 mt-3 text-[11px] font-semibold text-slate-700">(a) Space for nature</h4>
        <div className="grid gap-2">
          <Row r={row('canopy')}><NumberInput label="Mature canopy" value={input.canopyM2} unit="m²" onChange={(v) => set({ canopyM2: v })} /></Row>
          <Row r={row('cover')}><NumberInput label="Vegetated area" value={input.vegetatedM2} unit="m²" onChange={(v) => set({ vegetatedM2: v })} /></Row>
          <Row r={row('habitat')}><YesNo label="Planned?" value={input.habitatAssessment} onChange={(v) => set({ habitatAssessment: v })} /></Row>
          <Row r={row('rain-pathway')}><YesNo label="Planned?" value={input.engineeredRainwater} onChange={(v) => set({ engineeredRainwater: v })} /></Row>
          <Row r={row('retention')}><NumberInput label="Retained per day" value={input.retainedM3} unit="m³" onChange={(v) => set({ retainedM3: v })} /></Row>
          <Row r={row('rain-detention')} />
          <Row r={row('rain-first-stage')} />
          <Row r={row('rain-outdoor-water')} />
          <Row r={row('rain-indoor-water')} />
          <Row r={row('bird')}><NumberInput label="Treated glazing" value={input.birdTreatedPct} unit="%" onChange={(v) => set({ birdTreatedPct: v === null ? null : Math.min(100, v) })} /></Row>
          <Row r={row('bird-zone')} />
          <Row r={row('bird-markers')} />
          <Row r={row('bird-lighting')} />
        </div>

        <h4 className="mb-1 mt-3 text-[11px] font-semibold text-slate-700">(b) Views and connections</h4>
        <div className="grid gap-2">
          <Row r={row('views')} />
          <Row r={row('qe-view')}><YesNo label="Enters view 3?" value={input.entersQEView} onChange={(v) => set({ entersQEView: v })} /></Row>
          <Row r={row('eds-eligible')} />
          <Row r={row('eds-criteria')}>
            <div className="grid gap-0.5 text-[11px]">
              {([['lions', '3.4.3 Lions views kept'], ['openSpaceCanopy', '3.4.6 Open space and canopy strategy'], ['undrip', '3.4.8 UNDRIP strategy']] as const).map(([k, t]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={input.pvg34[k]} onChange={(e) => set({ pvg34: { ...input.pvg34, [k]: e.target.checked } })} />{t} <span className="text-muted">(answered in writing)</span></label>
              ))}
            </div>
          </Row>
        </div>
        {project === 'vtc' && <p className="mt-2 text-[10px] text-muted">Site area: the competition block, {Math.round(SITE.area).toLocaleString('en-CA')} m² (brief p.15).</p>}
      </Section>

      <Section title="False assumptions kept visible">
        {n.falseAssumptions.map((f, i) => (
          <div key={i} className="rounded-md border border-flag-false/40 bg-flag-false/[0.04] p-2 text-[11px]">
            <div className="flex items-start gap-1.5 font-medium text-flag-false"><OctagonX size={13} className="mt-px shrink-0" /><span className="line-through decoration-1">{f.claim}</span></div>
            <div className="mt-1 text-slate-800">{f.correction}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag="false_assumption" /><a href={f.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{f.source.label}, {f.source.page}</a></div>
          </div>
        ))}
      </Section>

      <Section title="Your judgment, by ODP Ecology direction" help="Where the ledger has no evidence, write what the design does and why. These notes are yours; the tool never fills them in.">
        <div className="grid gap-2">
          {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
            <label key={d} className="grid gap-0.5 text-[11px] text-muted">{d} {DIRECTIONS[d]}
              <textarea value={input.notes[d] ?? ''} maxLength={1000} onChange={(e) => set({ notes: { ...input.notes, [d]: e.target.value } })}
                className="h-12 resize-y rounded border border-line bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
            </label>
          ))}
        </div>
      </Section>
    </>
  )
}
