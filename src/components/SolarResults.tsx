// Inspector section of the solar-access node (research P02-M01–M03): map settings, each public space under the
// Downtown Peninsula guideline with its clause and page, the Detailed-study take-offs, and what the guideline leaves open.
import { ExternalLink, Loader2 } from 'lucide-react'
import { MAP_DATES, type MapDate } from '../engine/solarDates'
import { GUIDELINE, type Reading } from '../engine/solarRules'
import type { RuleResult } from '../engine/types'
import { useSolar, useSolarAccess } from '../hooks/useSolarAccess'
import { HOURS_RAMP, LOSS_MAX_H, LOSS_RAMP } from './solarRamps'
import { SolarEnvelopePanel } from './SolarEnvelope'
import { FlagChip, Section, StateChip, Toggle } from './ui'

const m2 = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m²`

function Line({ r }: { r: RuleResult }) {
  return (
    <div className={`rounded-md border p-2 ${r.flag === 'false_assumption' ? 'border-flag-false/50' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b>{r.value}</b> <span className="text-muted">· {r.threshold}</span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600">{r.note}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

const READINGS: { id: Reading; label: string }[] = [
  { id: 'unresolved', label: 'Unresolved (not in Table 1)' },
  { id: 'park', label: 'Read as a park: no new shadow (3.1.1)' },
  { id: 'minimise', label: 'Read as a plaza: minimise (3.2.1)' },
]

export default function SolarResults() {
  const { out, status, error, mapDate, view, showMap, readings } = useSolarAccess()
  const set = useSolar((s) => s.set)
  const ramp = view === 'hours' ? HOURS_RAMP : LOSS_RAMP
  const possible = out?.map?.possible ?? 6

  return (
    <>
      <Section title="Sun-hours map" right={status === 'running' ? <span className="flex items-center gap-1 text-[10px] text-muted"><Loader2 size={11} className="animate-spin" aria-hidden />Computing</span> : out ? <span className="text-[10px] text-muted">{out.ms} ms</span> : null}>
        <div className="grid gap-2 text-[11px]">
          <label className="flex items-center justify-between gap-2"><span>Show on the ground</span><Toggle checked={showMap} onChange={() => set({ showMap: !showMap })} label="Show the sun-hours map" /></label>
          <label className="flex items-center justify-between gap-2">Date
            <select value={mapDate} onChange={(e) => set({ mapDate: e.target.value as MapDate })} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]" aria-label="Map date">
              {MAP_DATES.map((d) => <option key={d.id} value={d.id}>{d.label} ({d.note})</option>)}
            </select>
          </label>
          <div role="radiogroup" aria-label="Map shows" className="flex rounded-md bg-black/5 p-0.5">
            {(['hours', 'loss'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => set({ view: v })}
                className={`flex-1 rounded px-2 py-0.5 text-[11px] font-medium ${view === v ? 'bg-white shadow-sm' : 'opacity-70 hover:opacity-100'}`}>{v === 'hours' ? 'Sun hours' : 'Hours lost to the design'}</button>
            ))}
          </div>
          <div>
            <div className="h-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${ramp.join(', ')})` }} />
            <div className="mt-0.5 flex justify-between text-[10px] text-muted">
              <span>{view === 'hours' ? '0 h' : 'under 1 h'}</span><span>{view === 'hours' ? `${possible.toFixed(possible % 1 ? 1 : 0)} h, the whole window` : `${LOSS_MAX_H} h or more`}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted">
            Direct sun on open ground, 5 m cells, sampled every 15 minutes{mapDate === 'equinox' ? '' : ' with the sun above 10°'}. Flat ground; no trees, as the guideline asks (s.5). Grey buildings are not counted.
          </p>
        </div>
        {status === 'error' && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800">The solar run failed: {error}</p>}
      </Section>

      {out && out.spaces.length > 0 && (
        <Section title="Public spaces · 22 Sep, 10–16 PT">
          <div className="grid gap-2">
            {out.spaces.map((s) => {
              const line = out.lines.find((l) => l.id === `solar-space-${s.id}`)
              return (
              <div key={s.id} className="rounded-md border border-line p-2 text-[11px]">
                <div className="flex items-start justify-between gap-2"><span className="font-semibold">{s.name}</span><StateChip state={s.state} /></div>
                <div className="mt-0.5"><b className="tabular-nums">{m2(s.swept)}</b> new shadow{s.firstNew ? `, ${s.firstNew}–${s.lastNew}` : ''} · {m2(s.area)} space · coverage +{s.coverage.added.toFixed(1)}% (existing {s.coverage.existing.toFixed(1)}%)</div>
                {line && (
                  <>
                    <div className="mt-0.5 text-muted">{line.threshold}</div>
                    {line.note && <div className="mt-0.5 text-slate-600">{line.note}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={line.flag} />
                      <a href={line.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{line.source.page}</a>
                    </div>
                  </>
                )}
                {!s.inTable1 && (
                  <label className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted">Reading
                    <select value={readings[s.id] ?? 'unresolved'} onChange={(e) => set({ readings: { ...readings, [s.id]: e.target.value as Reading } })}
                      className="min-w-0 flex-1 rounded border border-line bg-panel px-1 py-0.5 text-[10.5px] text-ink" aria-label={`Reading of ${s.name}`}>
                      {READINGS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </label>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10.5px] text-accent">Detailed study take-offs (5.2.1, 25 instants)</summary>
                  <table className="mt-1 w-full text-[10px] tabular-nums">
                    <thead><tr className="text-muted"><th className="text-left font-normal">PT</th><th className="text-right font-normal">existing</th><th className="text-right font-normal">added</th><th className="text-right font-normal">cumulative</th></tr></thead>
                    <tbody>
                      {s.detailed.map((i) => <tr key={i.label} className={i.added > 0 ? 'text-red-800' : ''}><td>{i.label}</td><td className="text-right">{Math.round(i.existing)}</td><td className="text-right">{Math.round(i.added)}</td><td className="text-right">{Math.round(i.cumulative)}</td></tr>)}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[10px] text-muted">m². Coverage % = sum of interval areas ÷ (space area × 25). The pass/fail sweep samples every minute.</p>
                </details>
              </div>
              )
            })}
          </div>
        </Section>
      )}

      {out && (
        <Section title="Evidence">
          <div className="grid gap-2">{out.lines.filter((l) => !l.id.startsWith('solar-space-')).map((l) => <Line key={l.id} r={l} />)}</div>
          <div className="mt-2 text-[10.5px] text-muted">
            <a href={GUIDELINE.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Downtown Peninsula Solar Access Guidelines (PDF)<ExternalLink size={10} aria-hidden /></a>
            {' '}· July 2026 text, read 22 Oct 2026; clause transcription in <code>04 Tool Plan/research/sources/city-of-vancouver/</code>. A team member should check it before results are quoted as compliance.
          </div>
        </Section>
      )}
      <SolarEnvelopePanel />
      {!out && status !== 'error' && <Section title="Results"><p className="flex items-center gap-1.5 text-[11px] text-muted"><Loader2 size={12} className="animate-spin" aria-hidden />Computing shadows…</p></Section>}
    </>
  )
}
