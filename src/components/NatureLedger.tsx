// City in Nature evidence ledger (research P05-M01): indicators with value, threshold, force, flag and source, values
// entered here until the modules that compute them are built. No composite score, by design.
import { useMemo, type ReactNode } from 'react'
import { DIRECTIONS, FORCE_LABEL, cityInNature, fourthStoreyTop, isBinding, type Direction, type Force, type NatureInput, type NatureRow, type SiteType } from '../engine/cityInNature'
import { towerFloors } from '../engine/massing'
import { useFacade } from '../hooks/useFacade'
import { siteAreaNote, useProjectSiteArea } from '../lib/siteArea'
import { useFacadeStore } from '../lib/facadeStore'
import { useStore, useTowers } from '../store'
import { FlagChip, Section } from './ui'
import { Evidence, FalseList, KeyBar, Legend, MethodFold, StateStack, ruleKey } from './ResultViz'
import { keepUnits, useUnitText } from './Units'

/** The ledger for the current design; cones come from the view-cone results in Real Vancouver. */
type ConeResult = { overall: string; checks?: { cone: { id: string }; state: string }[] }
/** Whether the towers rise into a Queen Elizabeth Park cone (3.2.x): true above, false clear or below, null when uncertain. */
export function qeFromCones(cones: ConeResult[] | null): boolean | null | undefined {
  if (!cones || !cones.some((c) => c.checks)) return undefined
  const qe = cones.flatMap((c) => (c.checks ?? []).filter((k) => k.cone.id.startsWith('3.2.')))
  if (qe.some((k) => k.state === 'above')) return true
  if (qe.some((k) => k.state === 'within_uncertainty')) return null
  return false
}

export function useNature(cones: ConeResult[] | null) {
  const input = useStore((s) => s.cityInNature)
  const project = useStore((s) => s.project)
  const towers = useTowers()
  const facade = useFacade()
  const site = useProjectSiteArea()
  const facadeTreated = useFacadeStore((s) => s.treated)
  return useMemo(() => cityInNature(input, site.area, project === 'city' && cones ? cones.map((c) => c.overall) : null,
    { fourthStoreyTop: fourthStoreyTop(towers.map(towerFloors)), faces: facade.faces, facadeTreated, qeFromCones: project === 'city' ? qeFromCones(cones) : undefined }), [input, project, cones, towers, facade, site.area, facadeTreated])
}

/** Solid = binding, dotted = target / guideline / aspiration, dashed = comparator or team assumption. */
const RING: Record<Force, string> = {
  bylaw_requirement: 'border-solid border-ink', rezoning_policy_requirement: 'border-solid border-ink',
  rezoning_target: 'border-dotted border-slate-500', voluntary_guideline: 'border-dotted border-slate-500', city_aspiration: 'border-dotted border-slate-500',
  comparator_other_jurisdiction: 'border-dashed border-slate-400', team_assumption: 'border-dashed border-slate-400',
}

function NumberInput({ label, value, unit, onChange }: { label: string; value: number | null; unit: string; onChange: (v: number | null) => void }) {
  return (
    <label className="flex min-w-0 flex-wrap items-center gap-1.5 text-meta text-muted">
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
    <div className="flex flex-wrap items-center gap-1 text-meta text-muted" role="radiogroup" aria-label={label}>
      {label}
      {opts.map(([v, t]) => (
        <button key={t} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded border px-1.5 py-0.5 ${value === v ? 'border-accent bg-accent/10 text-ink' : 'border-line hover:border-accent'}`}>{t}</button>
      ))}
    </div>
  )
}

function Row({ r, children }: { r: NatureRow; children?: ReactNode }) {
  const u = useUnitText()
  const k = ruleKey({ id: r.id, label: r.name, value: keepUnits(u(r.value)), threshold: u(r.threshold), state: r.state, flag: r.flag, source: r.source, note: r.note ? u(r.note) : undefined })
  return (
    <KeyBar k={{ ...k, tip: `${k.tip}\n${FORCE_LABEL[r.force]} · ODP ${r.direction}` }} frame={`border-2 ${RING[r.force]}`}>
      {children && <div className="min-w-0">{children}</div>}
    </KeyBar>
  )
}

/** The force, flag, ODP direction, threshold, note and source behind a group of ledger rows. */
function RowEvidence({ rows }: { rows: NatureRow[] }) {
  return <div className="mt-1.5"><Evidence items={rows.map((r) => ({ id: r.id, label: r.name, flag: r.flag, source: r.source, threshold: r.threshold, note: r.note, value: r.value.length > 14 ? r.value : undefined,
    extra: <><span className="rounded bg-slate-100 px-1.5 py-0.5 text-meta font-medium text-slate-700" title={isBinding(r.force) ? 'Binding: can pass or fail' : 'Reference line: shown, never scored as compliance'}>{FORCE_LABEL[r.force]}</span><span className="text-meta text-muted">ODP {r.direction}</span></> }))} /></div>
}

export default function NatureLedger({ cones }: { cones: ConeResult[] | null }) {
  const n = useNature(cones)
  const input = useStore((s) => s.cityInNature)
  const project = useStore((s) => s.project)
  const site = useProjectSiteArea()
  const set = (patch: Partial<NatureInput>) => useStore.setState((s) => ({ cityInNature: { ...s.cityInNature, ...patch } }))
  const row = (id: string) => n.rows.find((r) => r.id === id)!

  return (
    <>
      <Section title="Results">
        <div className="mb-2 grid min-w-0 gap-2">
          <div className="flex items-baseline justify-between gap-2 text-meta"><span className="font-semibold">Binding requirements</span><span className="tabular-nums text-muted">{n.binding.passed} of {n.binding.total} met</span></div>
          <StateStack label="Binding requirements" counts={{ pass: n.binding.passed, fail: n.binding.failed, unknown: n.binding.open }} names={{ pass: 'met', fail: 'not met', unknown: 'not answered' }} />
          <div className="flex flex-wrap gap-1" aria-label="ODP Ecology directions covered">
            {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
              <span key={d} className={`rounded px-1.5 py-0.5 text-meta ${n.coverage[d] ? 'bg-success-surface text-success' : 'bg-pending-surface text-pending'}`} title={`${d} ${DIRECTIONS[d]}: ${n.coverage[d] ? 'has evidence or a written note' : 'no evidence or note yet'}`}>
                {d} {n.coverage[d] ? '✓' : '◌'}
              </span>
            ))}
          </div>
          <Legend items={[{ label: 'binding', color: '#202630', line: true, tip: 'Solid frame: a by-law or rezoning requirement, can pass or fail' }, { label: 'target, guideline', color: '#64748b', line: true, dashed: true, tip: 'Dotted frame: a target, guideline or aspiration, never scored as compliance' }, { label: 'comparator, assumption', color: '#94a3b8', line: true, dashed: true, tip: 'Dashed frame: a comparator from another city or a team assumption' }]} />
        </div>
        <label className="mb-2 flex items-center gap-1.5 text-meta text-muted">R019 site type
          <select value={input.siteType} onChange={(e) => set({ siteType: e.target.value as SiteType })} className="rounded border border-line bg-panel px-1 py-0.5 text-ink">
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
          <FlagChip flag="team_assumption" />
        </label>

        <h4 className="mb-1 mt-3 text-meta font-semibold text-slate-700">(a) Space for nature</h4>
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
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
        </ul>
        <RowEvidence rows={n.rows.filter((r) => r.half === 'space')} />

        <h4 className="mb-1 mt-3 text-meta font-semibold text-slate-700">(b) Views and connections</h4>
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <Row r={row('views')} />
          <Row r={row('qe-view')}><YesNo label="Enters view 3?" value={input.entersQEView} onChange={(v) => set({ entersQEView: v })} /></Row>
          <Row r={row('eds-eligible')} />
          <Row r={row('eds-criteria')}>
            <div className="grid gap-0.5 text-meta">
              {([['lions', '3.4.3 Lions views kept'], ['openSpaceCanopy', '3.4.6 Open space and canopy strategy'], ['undrip', '3.4.8 UNDRIP strategy']] as const).map(([k, t]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={input.pvg34[k]} onChange={(e) => set({ pvg34: { ...input.pvg34, [k]: e.target.checked } })} />{t} <span className="text-muted">(answered in writing)</span></label>
              ))}
            </div>
          </Row>
        </ul>
        <RowEvidence rows={n.rows.filter((r) => r.half === 'views')} />
        <MethodFold>
          <p><b>Binding requirements:</b> {n.binding.passed} of {n.binding.total} met{n.binding.failed ? `, ${n.binding.failed} not met` : ''}{n.binding.open ? `, ${n.binding.open} not answered` : ''}.</p>
          <p>Targets, guidelines and comparators are shown for reference and never scored as compliance. There is no overall score: City in Nature is a judgment.</p>
          <p data-testid="nature-site-area">{siteAreaNote(site)}</p>
        </MethodFold>
      </Section>

      <Section title="False assumptions kept visible"><FalseList items={n.falseAssumptions} /></Section>

      <Section folded title="Your judgment, by ODP Ecology direction" help="Where the ledger has no evidence, write what the design does and why. These notes are yours; the tool never fills them in.">
        <div className="grid gap-2">
          {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
            <label key={d} className="grid gap-0.5 text-meta text-muted">{d} {DIRECTIONS[d]}
              <textarea value={input.notes[d] ?? ''} maxLength={1000} onChange={(e) => set({ notes: { ...input.notes, [d]: e.target.value } })}
                className="h-12 resize-y rounded border border-line bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
            </label>
          ))}
        </div>
      </Section>
    </>
  )
}
