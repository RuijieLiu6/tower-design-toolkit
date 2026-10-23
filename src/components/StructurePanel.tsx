// Results for "Structure: system & seismic" (research P10-M01, M03, M05): seismic route, core continuity and regularity,
// outrigger floors you place, and a lateral-system shortlist. Screening only; the engineer of record decides.
import { useMemo, useState } from 'react'
import { SEISMIC_FALSE_ASSUMPTIONS, structureCheck, suggestOutriggers } from '../engine/structure'
import { CONTINUITY_RULE, windProcedure, type Fit } from '../engine/windStructure'
import { towerFloors } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useStore, useTowers } from '../store'
import { Card, FalseAssumptions } from './WindStructurePanel'
import { FlagChip, Section } from './ui'

export function useStructures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  return useMemo(() => towers.map((t) => structureCheck(t, windProcedure(t, presets))), [towers, presets])
}

const FIT: Record<Fit, { label: string; cls: string }> = {
  shortlist: { label: 'Shortlist', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  check: { label: 'Check', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  out: { label: 'Out', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}

/** Pick outrigger levels: type them, or take the suggestion at about 1/2 and 2/3 of the height. */
function OutriggerPicker({ t, placed }: { t: Tower; placed: number[] }) {
  const updateTower = useStore((s) => s.updateTower)
  const levels = useMemo(() => towerFloors(t).filter((f) => !f.podium).map((f) => f.level), [t])
  const [text, setText] = useState('')
  const suggestion = suggestOutriggers(t)
  const set = (l: number[]) => updateTower(t.id, { outriggerFloors: [...new Set(l)].filter((x) => levels.includes(x)).sort((a, b) => a - b) })
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-[11px]">
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
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><FlagChip flag="team_assumption" />Suggestion at about 1/2 and 2/3 of the height is precedent practice, not a rule. Shown in Schematic as red truss bands; the floor keeps its use.</div>
    </div>
  )
}

export default function StructurePanel() {
  const results = useStructures()
  return (
    <>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <b>Seismic Category {r.seismicCategory}</b>: dynamic analysis required; core walls continuous to the foundation; Ta ≈ {r.Ta.toFixed(2)} s (seismic only).
          </div>
          <div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
          <OutriggerPicker t={r.tower} placed={r.outriggers} />
          <h4 className="mb-1 mt-3 text-[11px] font-semibold text-slate-700">Lateral systems at SC4 (a shortlist, never a single best)</h4>
          <div className="grid gap-1.5">
            {r.systems.map((s) => (
              <div key={s.id} className="rounded-md border border-line p-2 text-[11px]">
                <div className="flex items-start justify-between gap-2"><span className="font-semibold">{s.name}</span><span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${FIT[s.fit].cls}`}>{FIT[s.fit].label}</span></div>
                <div className="text-slate-700">{s.reason}</div>
                <div className="mt-0.5 text-[10px] text-muted">Code route: {s.route}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={s.flag} /><span className="text-[10px] text-muted">{s.source.label}{s.source.page ? `, ${s.source.page}` : ''}</span></div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded bg-black/[0.03] p-2 text-[10px] text-slate-600">{CONTINUITY_RULE}</div>
        </Section>
      ))}
      <FalseAssumptions items={SEISMIC_FALSE_ASSUMPTIONS} />
      <Section title="Read with care">
        <p className="text-[11px] text-slate-700">Screening only: no member sizing, forces or drifts as design values. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. Slenderness and the wind procedure are in the node Wind procedure (slenderness).</p>
      </Section>
    </>
  )
}
