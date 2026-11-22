// Results for "Structure: system & seismic" (research P10-M01, M03, M05): seismic route, core continuity and regularity,
// outrigger floors you place, and a lateral-system shortlist. Screening only; the engineer of record decides.
import { useMemo, useState } from 'react'
import { SEISMIC_FALSE_ASSUMPTIONS, structureCheck, structureTabOf, suggestOutriggers, type StructureTab } from '../engine/structure'
import { useLeadView, viewOf } from '../lib/leadViews'
import { CONTINUITY_RULE, windProcedure, type Fit } from '../engine/windStructure'
import { storeyCore, type CoreCentre } from '../engine/storeyWeight'
import { coreSide, coreStepsOf, towerFloors } from '../engine/massing'
import type { CoreStep, Tower } from '../engine/types'
import { VTC_NORTH_DEG } from '../context'
import { useStore, useTowers } from '../store'
import { FalseAssumptions } from './WindStructurePanel'
import { FlagChip, Section } from './ui'
import { Evidence, FlagDot, MethodFold, RuleRows, Stat, Stats } from './ResultViz'

export function useStructures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  const north = useStore((s) => (s.project === 'vtc' ? VTC_NORTH_DEG : 0))
  return useMemo(() => towers.map((t) => structureCheck(t, windProcedure(t, presets), undefined, north)), [towers, presets, north])
}

const FIT: Record<Fit, { label: string; cls: string }> = {
  shortlist: { label: '✓ Shortlist', cls: 'border-success/30 bg-success-surface text-success' },
  check: { label: '! Check', cls: 'border-warning/30 bg-warning-surface text-warning' },
  out: { label: '✕ Out', cls: 'border-line bg-pending-surface text-pending' },
}

/** Pick outrigger levels: type them, or take the suggestion at about 1/2 and 2/3 of the height. */
function OutriggerPicker({ t, placed }: { t: Tower; placed: number[] }) {
  const updateTower = useStore((s) => s.updateTower)
  const levels = useMemo(() => towerFloors(t).filter((f) => !f.podium).map((f) => f.level), [t])
  const [text, setText] = useState('')
  const suggestion = suggestOutriggers(t)
  const set = (l: number[]) => updateTower(t.id, { outriggerFloors: [...new Set(l)].filter((x) => levels.includes(x)).sort((a, b) => a - b) })
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="font-semibold">Outrigger floors</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {placed.length === 0 && <span className="text-muted">None placed.</span>}
        {placed.map((l) => (
          <button key={l} onClick={() => set(placed.filter((x) => x !== l))} title="Remove" className="rounded border border-line px-1.5 py-0.5 hover:border-red-300 hover:text-red-800">L{l} ×</button>
        ))}
      </div>
      <form className="mt-1.5 flex flex-wrap items-center gap-1" onSubmit={(e) => { e.preventDefault(); set([...placed, ...text.split(/[^0-9]+/).filter(Boolean).map(Number)]); setText('') }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`level ${levels[0] ?? ''}–${levels[levels.length - 1] ?? ''}`} aria-label="Outrigger levels"
          className="w-24 rounded border border-line bg-panel px-1.5 py-0.5 outline-none focus:border-accent" />
        <button type="submit" className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add</button>
        {suggestion.length > 0 && !suggestion.every((l) => placed.includes(l)) && (
          <button type="button" onClick={() => set([...placed, ...suggestion])} className="rounded border border-dashed border-line px-2 py-0.5 text-muted hover:border-accent hover:text-accent">
            Suggest {suggestion.map((l) => `L${l}`).join(', ')}
          </button>
        )}
      </form>
      <MethodFold title="About the suggestion"><div className="flex items-start gap-1"><FlagChip flag="team_assumption" /><span>Suggestion at about 1/2 and 2/3 of the height is precedent practice, not a rule. Shown in Schematic as red truss bands; the floor keeps its use.</span></div></MethodFold>
    </div>
  )
}

/** An imported model carries no core: where the structure checks place it (read from the model), or a centre you type. */
function CorePicker({ t, core }: { t: Tower; core: CoreCentre }) {
  const updateTower = useStore((s) => s.updateTower)
  const placed = !!t.coreCentre
  const set = (k: 0 | 1, v: number) => { if (!Number.isFinite(v)) return; const c: [number, number] = [core.x, core.y]; c[k] = v; updateTower(t.id, { coreCentre: c }) }
  const field = (k: 0 | 1, label: string) => (
    <label className="flex items-center gap-1 text-muted">{label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" step={0.5} value={Number((k ? core.y : core.x).toFixed(2))} aria-label={`Core centre ${label}`}
          onChange={(e) => set(k, Number(e.target.value))} className="w-16 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
        <span className="pr-1.5">m</span>
      </span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Core centre</span><FlagChip flag="team_assumption" /></div>
      <div className="mt-1 line-clamp-2 text-muted" title={core.how}>{placed ? 'Placed by hand' : 'Read from the model'}: {core.how}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {field(0, 'x')}{field(1, 'y')}
        {placed && <button type="button" onClick={() => updateTower(t.id, { coreCentre: undefined })} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Read from the model</button>}
      </div>
      <MethodFold title="About the core centre"><p>In the tower’s own frame (metres from the tower origin, before its rotation). The off-centre weight lines, the X-ray core, the drawings and the export use it. Read from the model: a garden storey that is the core alone, else the centre of the typical tower storey.</p></MethodFold>
    </div>
  )
}

/**
 * A core that steps with the tiers (gap G18): from a level up, a smaller square core (and its centre, optional). Each
 * storey's homes, net area, daylight depth, weight, off-centre line and lift fit then read its own core.
 */
function CoreSteps({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const steps = coreStepsOf(t)
  const tower = towerFloors(t).filter((f) => !f.podium)
  const at = storeyCore(t)
  const set = (next: CoreStep[]) => updateTower(t.id, { coreSteps: next.length ? next : undefined })
  const edit = (k: number, patch: Partial<CoreStep>) => set(steps.map((s, i) => (i === k ? { ...s, ...patch } : s)))
  const add = () => {
    const last = steps[steps.length - 1]
    const from = last ? Math.min(tower[tower.length - 1]?.level ?? last.fromLevel + 1, last.fromLevel + 10) : tower[Math.floor(tower.length / 2)]?.level ?? 1
    set([...steps, { fromLevel: from, side: Math.max(4, Math.round((last?.side ?? coreSide(t)) * 0.75 * 2) / 2) }])
  }
  const num = (label: string, value: number, on: (v: number) => void, step = 0.5, unit = 'm') => (
    <label className="flex items-center gap-1 text-muted">{label}
      <span className="flex items-center rounded border border-line bg-panel">
        <input type="number" step={step} value={Number(value.toFixed(2))} aria-label={`Core step ${label}`}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v) }} className="w-14 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
        {unit && <span className="pr-1.5">{unit}</span>}
      </span>
    </label>
  )
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-meta">
      <div className="flex items-center justify-between gap-2"><span className="font-semibold">Core steps</span><FlagChip flag="team_assumption" /></div>
      <div className="mt-1 text-muted">{steps.length ? `Below L${steps[0].fromLevel}: ${coreSide(t).toFixed(1)} m core` : `One ${coreSide(t).toFixed(1)} m core for the whole height`}</div>
      {steps.map((s, k) => (
        <div key={k} className="mt-1.5 flex flex-wrap items-center gap-2">
          {num('from L', s.fromLevel, (v) => edit(k, { fromLevel: Math.max(1, Math.round(v)) }), 1, '')}
          {num('side', s.side, (v) => edit(k, { side: Math.max(2, v) }))}
          {num('x', at(s.fromLevel).x, (v) => edit(k, { centre: [v, at(s.fromLevel).y] }))}
          {num('y', at(s.fromLevel).y, (v) => edit(k, { centre: [at(s.fromLevel).x, v] }))}
          <button type="button" onClick={() => set(steps.filter((_, i) => i !== k))} className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent" aria-label={`Remove the core step from L${s.fromLevel}`}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} className="mt-1.5 rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent">Add a step</button>
      <MethodFold title="About core steps"><p>From each step’s level up, the core is a square of that side, centred at x, y in the tower’s own frame (until you type a centre, the centre of the core below). Homes and hotel keys, net-to-gross, daylight depth, storey weights and the off-centre lines read each storey’s own core; “Core holds the lifts” checks each core against the lift rises that pass through it; continuity checks each upper core stands inside the one below, and Type 3 flags a step over 130%.</p></MethodFold>
    </div>
  )
}

/** P1 #13 floor reach: an interior column ring at about half the core-to-facade reach (Ching p.10), which halves the slab span. */
function ColumnRing({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  return (
    <label className="mt-2 flex items-center gap-2 rounded-md border border-line p-2 text-meta" title="A ring of columns at about half the reach from the core to the facade, on storeys past one flat plate (9.1 m, Ching p.8): the slab spans half the reach and thins.">
      <input type="checkbox" checked={!!t.columnRing} onChange={(e) => updateTower(t.id, { columnRing: e.target.checked || undefined })} aria-label="Interior column ring" />
      <span className="font-semibold">Interior column ring</span><FlagChip flag="unverified" />
    </label>
  )
}

/**
 * Structure in three tabs (node placement, 21 Nov 2026), picked in the results strip beside Wind procedure
 * (lib/leadViews.ts): System & seismic (category, route, irregularities, the shortlist), Lateral & sway (core alone,
 * P-Δ, off-centre weight and sustained sway, core steps, outriggers) and Floors & spans (floor reach, dead load from the
 * span, the column ring). The lines keep their ids; each shows under one tab (engine/structure.ts STRUCTURE_TABS).
 */
export default function StructurePanel() {
  const results = useStructures()
  const tab = useLeadView((s) => viewOf('built.structure', s.view)?.id ?? 'seismic') as StructureTab
  return (
    <div data-structure-tab={tab}>
      {results.map((r) => {
        const rules = r.rules.filter((x) => structureTabOf(x.id) === tab)
        return (
          <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
            {tab === 'seismic' && <>
              <div className="mb-2"><Stats cols={2}>
                <Stat label="Seismic Category" value={`${r.seismicCategory}`} color="#946200" tip="Dynamic analysis required; core walls continuous to the foundation" />
                <Stat label="Period Ta (seismic only)" value={`≈ ${r.Ta.toFixed(2)}`} unit="s" />
              </Stats></div>
              <RuleRows rules={rules} />
              <h4 className="mb-1 mt-3 text-meta font-semibold text-slate-700" title="A shortlist, never a single best">Lateral systems at SC4 (shortlist)</h4>
              <ul className="grid min-w-0 gap-1">
                {r.systems.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-meta" title={`${s.name}: ${s.reason}\nCode route: ${s.route}\nSource: ${s.source.label}${s.source.page ? `, ${s.source.page}` : ''}`}>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span><FlagDot flag={s.flag} />
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-meta font-semibold ${FIT[s.fit].cls}`}>{FIT[s.fit].label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5"><Evidence title="Why each system fits or not" items={r.systems.map((s) => ({ id: s.id, label: s.name, flag: s.flag, value: s.reason, note: `Code route: ${s.route}`, source: s.source, card: false }))} /></div>
              <MethodFold><p>{CONTINUITY_RULE}</p><p>Seismic Category {r.seismicCategory}: dynamic analysis required; core walls continuous to the foundation; Ta ≈ {r.Ta.toFixed(2)} s (seismic only).</p></MethodFold>
            </>}
            {tab === 'lateral' && <>
              <RuleRows rules={rules} />
              {(r.tower.imported || r.tower.coreCentre) && <CorePicker t={r.tower} core={r.weights.core} />}
              <CoreSteps t={r.tower} />
              <OutriggerPicker t={r.tower} placed={r.outriggers} />
            </>}
            {tab === 'floors' && <>
              <RuleRows rules={rules} />
              <ColumnRing t={r.tower} />
            </>}
          </Section>
        )
      })}
      {tab === 'seismic' && <FalseAssumptions items={SEISMIC_FALSE_ASSUMPTIONS} />}
      <Section title="Read with care" folded>
        <p className="text-meta text-slate-700">Screening only: no member sizing, forces or drifts as design values. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. Slenderness and the wind procedure are in the node Wind procedure (slenderness).</p>
      </Section>
    </div>
  )
}
