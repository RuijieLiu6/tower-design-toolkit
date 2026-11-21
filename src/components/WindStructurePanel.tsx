// Results for the wind procedure & structure node (P10-M02, P10-M01) and the pedestrian wind-study node (P03-M02).
// Classification and shortlists only; the wind engineer and the tunnel test set the final procedure.
import { useMemo } from 'react'
import { ANALOG_LABEL, NO_ENGINE_NOTE, WIND_FALSE_ASSUMPTIONS, windProcedure, windStudyTriggers } from '../engine/windStructure'
import { DEFAULT_DAMPING } from '../engine/acrossWind'
import type { Source } from '../engine/types'
import { useStore, useTowers } from '../store'
import { FlagChip, Section } from './ui'
import { Evidence, FalseList, KeyList, MethodFold, RuleRows, Stat, Stats } from './ResultViz'

export function useWindProcedures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  return useMemo(() => towers.map((t) => windProcedure(t, presets)), [towers, presets])
}


export function WindProcedurePanel() {
  const results = useWindProcedures()
  const presets = useStore((s) => s.windPresets)
  const setPresets = (patch: Partial<typeof presets>) => useStore.setState((s) => ({ windPresets: { ...s.windPresets, ...patch } }))
  return (
    <>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className={`mb-2 min-w-0 rounded-md border p-2 text-xs ${r.procedure === 'tunnel' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`} title={`Governed by ${r.trigger}`}>
            <b>{r.procedure === 'tunnel' ? 'Wind Tunnel Procedure' : 'Dynamic Procedure (or tunnel)'}</b>
            <div className="line-clamp-2 text-meta">Governed by {r.trigger}</div>
          </div>
          <RuleRows rules={r.rules} />
          <MethodFold title="Where the rest is"><p>Lateral systems, seismic route and outrigger floors: see the node Structure: system &amp; seismic.</p></MethodFold>
        </Section>
      ))}
      <Section title="Presets">
        <div className="grid gap-2 text-meta">
          <label className="flex items-center justify-between gap-2 text-muted">Model frequency f1 from the engineer
            <span className="flex items-center rounded border border-line bg-panel">
              <input type="number" step={0.01} min={0} value={presets.f1 ?? ''} placeholder="none" aria-label="Model frequency f1"
                onChange={(e) => setPresets({ f1: e.target.value === '' ? null : Math.max(0.01, Number(e.target.value)) })} className="w-16 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
              <span className="pr-1.5">Hz</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-muted">Tunnel by default from (no model f1)
            <span className="flex items-center gap-1"><FlagChip flag="team_assumption" />
              <span className="flex items-center rounded border border-line bg-panel">
                <input type="number" step={5} min={0} value={presets.tunnelDefaultHeight} aria-label="Tunnel default height"
                  onChange={(e) => setPresets({ tunnelDefaultHeight: Math.max(0, Number(e.target.value)) })} className="w-16 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
                <span className="pr-1.5">m</span>
              </span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-muted" title="Across-wind acceleration screen: the Commentary sample uses 0.015; concrete 0.02, steel 0.01 (NBC Commentary I para 57)">Damping ratio (across-wind screen)
            <span className="flex items-center gap-1"><FlagChip flag="team_assumption" />
              <span className="flex items-center rounded border border-line bg-panel">
                <input type="number" step={0.001} min={0.005} max={0.05} value={presets.damping ?? DEFAULT_DAMPING} aria-label="Damping ratio"
                  onChange={(e) => setPresets({ damping: Math.min(0.05, Math.max(0.005, Number(e.target.value) || DEFAULT_DAMPING)) })} className="w-16 bg-transparent px-1.5 py-0.5 text-right tabular-nums text-ink outline-none" />
              </span>
            </span>
          </label>
        </div>
      </Section>
      <FalseAssumptions />
      <Section title="Read with care" folded>
        <p className="text-meta text-slate-700">Classification and screens only: no loads or drifts. The natural frequency, across-wind acceleration and vortex lines use the empirical f1 = 46/H (±50%) until the engineer’s model frequency is entered, and a damping ratio that is a team assumption. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. CFD cannot give specified wind loads (4.1.7.1(6)); the tunnel test does.</p>
      </Section>
    </>
  )
}

type FalseAssumption = { claim: string; correction: string; source: Source }

export function FalseAssumptions({ items = WIND_FALSE_ASSUMPTIONS }: { items?: FalseAssumption[] }) {
  return (
    <Section title="False assumptions kept visible"><FalseList items={items} /></Section>
  )
}

export function WindStudyPanel() {
  const towers = useTowers()
  const H = Math.max(0, ...towers.map((t) => t.height))
  const triggers = windStudyTriggers(H)
  return (
    <>
      <Section title="Results">
        <Stats cols={2}>
          <Stat label="Tallest tower" value={H.toFixed(0)} unit="m" />
          <Stat label="Analog cities asking for a study" value={`${triggers.filter((x) => x.state === 'warn').length} of ${triggers.length}`} tip={ANALOG_LABEL} />
        </Stats>
        <div className="mt-2 grid min-w-0 gap-1.5">
          <KeyList keys={triggers.map((x) => ({ id: x.id, label: x.jurisdiction, value: x.level, state: x.state, flag: x.flag, tip: `${x.jurisdiction}: ${x.level}\nSource: ${x.source.label}${x.source.page ? `, ${x.source.page}` : ''}` }))} />
          <Evidence items={triggers.map((x) => ({ id: x.id, label: x.jurisdiction, value: x.level, flag: x.flag, source: x.source, card: false }))} />
        </div>
        <MethodFold title="Criteria used"><p><b>{ANALOG_LABEL}</b></p><p>What each analog city would ask for at the tallest tower's height ({H.toFixed(0)} m).</p></MethodFold>
      </Section>
      <Section title="Why there is no comfort map" folded>
        <p className="text-meta leading-relaxed text-slate-700">{NO_ENGINE_NOTE}</p>
      </Section>
      <Section title="Massing cues to discuss with a wind engineer" folded>
        <ul className="grid gap-1.5 text-meta text-slate-700">
          <li className="flex items-start gap-1.5"><FlagChip flag="verified" /><span>Chamfered, rounded, stepped or re-entrant windward corners rather than sharp corners on a tall windward volume (Toronto ToR).</span></li>
          <li className="flex items-start gap-1.5"><FlagChip flag="team_assumption" /><span>A narrower face toward the strongest-wind sectors, and no through-passage aligned with them; the wind climate (P03-M01) isn't loaded yet, so the sectors are unknown here.</span></li>
          <li className="flex items-start gap-1.5"><FlagChip flag="unverified" /><span>A podium step-back or canopy to catch downwash at entrances; no sourced depth (calibrate with CFD).</span></li>
        </ul>
        <p className="mt-2 text-meta text-muted">Cues rank risk for discussion; they don't predict speeds or comfort classes, and supertall scale breaks simple rules.</p>
      </Section>
    </>
  )
}
