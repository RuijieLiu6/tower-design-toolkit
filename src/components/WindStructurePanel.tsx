// Results for the wind procedure & structure node (P10-M02, P10-M01) and the pedestrian wind-study node (P03-M02).
// Classification and shortlists only; the wind engineer and the tunnel test set the final procedure.
import { OctagonX } from './icons'
import { useMemo } from 'react'
import { ANALOG_LABEL, NO_ENGINE_NOTE, WIND_FALSE_ASSUMPTIONS, windProcedure, windStudyTriggers } from '../engine/windStructure'
import type { RuleResult, Source } from '../engine/types'
import { useStore, useTowers } from '../store'
import { CardChip } from './RuleCardView'
import { FlagChip, Section, StateChip } from './ui'
import { U } from './Units'

export function useWindProcedures() {
  const towers = useTowers()
  const presets = useStore((s) => s.windPresets)
  return useMemo(() => towers.map((t) => windProcedure(t, presets)), [towers, presets])
}

export function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b className="tabular-nums"><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
        <CardChip ruleId={r.id} />
      </div>
    </div>
  )
}

export function WindProcedurePanel() {
  const results = useWindProcedures()
  const presets = useStore((s) => s.windPresets)
  const setPresets = (patch: Partial<typeof presets>) => useStore.setState((s) => ({ windPresets: { ...s.windPresets, ...patch } }))
  return (
    <>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className={`mb-2 rounded-md border p-2 text-xs ${r.procedure === 'tunnel' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
            <b>{r.procedure === 'tunnel' ? 'Wind Tunnel Procedure' : 'Dynamic Procedure (or tunnel)'}</b>: governed by {r.trigger}.
          </div>
          <div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
          <p className="mt-2 text-[10px] text-muted">Lateral systems, seismic route and outrigger floors: see the node Structure: system &amp; seismic.</p>
        </Section>
      ))}
      <Section title="Presets">
        <div className="grid gap-2 text-[11px]">
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
        </div>
      </Section>
      <FalseAssumptions />
      <Section title="Read with care">
        <p className="text-[11px] text-slate-700">Classification only: no loads, drifts or accelerations. Research packet P10 had two critique rounds and no final gate, so code readings it corrected are shown as unverified. CFD cannot give specified wind loads (4.1.7.1(6)); the tunnel test does.</p>
      </Section>
    </>
  )
}

type FalseAssumption = { claim: string; correction: string; source: Source }

export function FalseAssumptions({ items = WIND_FALSE_ASSUMPTIONS }: { items?: FalseAssumption[] }) {
  return (
    <Section title="False assumptions kept visible">
      {items.map((f, i) => (
        <div key={i} className="rounded-md border border-flag-false/40 bg-flag-false/[0.04] p-2 text-[11px]">
          <div className="flex items-start gap-1.5 font-medium text-flag-false"><OctagonX size={13} className="mt-px shrink-0" /><span className="line-through decoration-1">{f.claim}</span></div>
          <div className="mt-1 text-slate-800">{f.correction}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag="false_assumption" />
            {f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</a>
              : <span className="text-[10px] text-muted">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</span>}
          </div>
        </div>
      ))}
    </Section>
  )
}

export function WindStudyPanel() {
  const towers = useTowers()
  const H = Math.max(0, ...towers.map((t) => t.height))
  const triggers = windStudyTriggers(H)
  return (
    <>
      <Section title="Results">
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900"><b>{ANALOG_LABEL}</b></div>
        <div className="mb-2 text-xs">Tallest tower {H.toFixed(0)} m. What each analog city would ask for:</div>
        <div className="grid gap-2">
          {triggers.map((x) => (
            <div key={x.id} className="rounded-md border border-line p-2 text-[11px]">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{x.jurisdiction}</span><StateChip state={x.state} /></div>
              <div className="text-slate-800">{x.level}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={x.flag} />
                {x.source.url ? <a href={x.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{x.source.label}{x.source.page ? `, ${x.source.page}` : ''}</a> : <span className="text-[10px] text-muted">{x.source.label}</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Why there is no comfort map">
        <p className="text-[11px] leading-relaxed text-slate-700">{NO_ENGINE_NOTE}</p>
      </Section>
      <Section title="Massing cues to discuss with a wind engineer">
        <ul className="grid gap-1.5 text-[11px] text-slate-700">
          <li className="flex items-start gap-1.5"><FlagChip flag="verified" /><span>Chamfered, rounded, stepped or re-entrant windward corners rather than sharp corners on a tall windward volume (Toronto ToR).</span></li>
          <li className="flex items-start gap-1.5"><FlagChip flag="team_assumption" /><span>A narrower face toward the strongest-wind sectors, and no through-passage aligned with them; the wind climate (P03-M01) isn't loaded yet, so the sectors are unknown here.</span></li>
          <li className="flex items-start gap-1.5"><FlagChip flag="unverified" /><span>A podium step-back or canopy to catch downwash at entrances; no sourced depth (calibrate with CFD).</span></li>
        </ul>
        <p className="mt-2 text-[10px] text-muted">Cues rank risk for discussion; they don't predict speeds or comfort classes, and supertall scale breaks simple rules.</p>
      </Section>
    </>
  )
}
