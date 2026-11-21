// Results for "Structure: system & seismic" (research P10-M01, M03, M05): seismic route, core continuity and regularity,
// outrigger floors you place, and a lateral-system shortlist. Screening only; the engineer of record decides.
import { useMemo, useState } from 'react'
import { SEISMIC_FALSE_ASSUMPTIONS, structureCheck, suggestOutriggers } from '../engine/structure'
import { CONTINUITY_RULE, windProcedure, type Fit } from '../engine/windStructure'
import type { CoreCentre } from '../engine/storeyWeight'
import { towerFloors } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useStore, useTowers } from '../store'
import { FalseAssumptions } from './WindStructurePanel'
import { FlagChip, Section } from './ui'
import { Evidence, FlagDot, MethodFold, RuleRows, Stat, Stats } from './ResultViz'

export function useStructures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  return useMemo(() => towers.map((t) => structureCheck(t, windProcedure(t, presets))), [towers, presets])
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

export default function StructurePanel() {
  const results = useStructures()
  return (
    <>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className="mb-2"><Stats cols={2}>
            <Stat label="Seismic Category" value={`${r.seismicCategory}`} color="#946200" tip="Dynamic analysis required; core walls continuous to the foundation" />
            <Stat label="Period Ta (seismic only)" value={`≈ ${r.Ta.toFixed(2)}`} unit="s" />
          </Stats></div>
          <RuleRows rules={r.rules} />
          {(r.tower.imported || r.tower.coreCentre) && <CorePicker t={r.tower} core={r.weights.core} />}
          <OutriggerPicker t={r.tower} placed={r.outriggers} />
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
        </Section>
      ))}
      <FalseAssumptions items={SEISMIC_FALSE_ASSUMPTIONS} />
      <Section title="Read with care" folded>
        <p className="text-meta text-slate-700">Screening only: no member sizing, forces or drifts as design values. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. Slenderness and the wind procedure are in the node Wind procedure (slenderness).</p>
      </Section>
    </>
  )
}
