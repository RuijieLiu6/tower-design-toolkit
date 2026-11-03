// Results of the trips & station-entrance node (research P09-M01, M03 tier 0): AM peak-hour trips by use and mode, the
// station-entrance load and link width (comfort only), what feeds parking and the lifts, and the presets.
import { RotateCcw, TrainFront } from 'lucide-react'
import type { RuleResult } from '../engine/types'
import { DEFAULT_TRIPS, STATIONS, type TripPresets } from '../engine/trips'
import { useTrips } from '../hooks/useTrips'
import { useTripStore } from '../lib/tripStore'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

const n = (x: number) => Math.round(x).toLocaleString('en-CA')

export default function TripsResults() {
  const r = useTrips()
  const { presets, set, reset } = useTripStore()
  if (!r) return null
  const edited = (Object.keys(DEFAULT_TRIPS) as (keyof TripPresets)[]).filter((k) => JSON.stringify(presets[k]) !== JSON.stringify(DEFAULT_TRIPS[k]))
  const s = r.station
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  return (
    <>
      <Section title="Results">
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-950">Trip rates and peak-hour shares are unsourced presets; the mode split for trips into the tower is the 2008 Trip Diary row for trips ending downtown (context, not a target); residents’ split is an <b>unsourced scenario</b>. The station check is comfort only, not egress.</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-[11px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="py-0.5 font-medium">AM peak hour</th><th className="text-right font-medium">People</th><th className="text-right font-medium">Transit</th><th className="text-right font-medium">Car drivers</th><th className="text-right font-medium">Other</th></tr></thead>
            <tbody>
              {r.uses.map((u) => (
                <tr key={u.use} className="border-t border-line/60">
                  <td className="py-0.5">{u.use} <span className={`rounded px-1 text-[9px] ${u.basis === 'unsourced scenario' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{u.basis}</span></td>
                  <td className="text-right tabular-nums">{n(u.persons)}</td><td className="text-right tabular-nums">{n(u.transit)}</td><td className="text-right tabular-nums">{n(u.autoDriver)}</td><td className="text-right tabular-nums">{n(u.other)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold"><td className="py-0.5">Into the tower</td><td className="text-right tabular-nums">{n(r.am.in)}</td><td className="text-right tabular-nums">{n(r.am.transitIn)}</td><td className="text-right tabular-nums">{n(r.am.autoDriverIn)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Station entrance (tier 0)">
        <div className="flex items-start gap-2 text-[11px]">
          <TrainFront size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <div>
            <div><b>{n(s.linkIn + s.stationIn)}</b> people in the AM peak hour use the below-grade link: {n(s.linkIn)} from the tower, {n(s.stationIn)} station riders at the proxy station ({s.name}).</div>
            <div className="mt-0.5">One train every {presets.headwayMin} min brings {n(s.perTrain)}; passing in {presets.dispersalS} s they need <b>{s.required.toFixed(1)} m</b> of clear width at {presets.bandM2} m² per person ({presets.clearWidth.toFixed(1)} m given{s.ratio > 1 ? ', too narrow for comfort' : ''}).</div>
            <div className="mt-1 text-[10px] text-muted">No width is ever shown green: the walkway boundaries are unverified (TCQSM ch. 10 unread) and egress (NFPA 130) may govern.</div>
          </div>
        </div>
      </Section>

      <Section title="Feeds">
        <ul className="grid gap-1 text-[11px]">
          <li><b>Parking, loading & bikes:</b> {n(r.parking.arrivals)} car drivers arrive in the AM peak hour{r.parking.maxStalls !== null ? ` against a downtown maximum of ${n(r.parking.maxStalls)} stalls (unverified)` : ''}.</li>
          <li><b>Core & lifts:</b> {n(r.transitLevel.persons)} of the arrivals ({Math.round(r.transitLevel.share * 100)}%) come up from the station link, so the lifts should also serve that level.</li>
        </ul>
      </Section>

      <Section title="Rules">
        <div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>

      <Section title="Presets (team assumptions and your inputs)" right={edited.length ? <button type="button" onClick={reset} className="flex items-center gap-1 text-[10px] text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1 text-xs"><span className="text-muted">Proxy station (2025 weekday 8–9 AM alightings)</span>
            <select className={sel} value={presets.station} onChange={(e) => set({ station: e.target.value })}>{STATIONS.map((x) => <option key={x.name} value={x.name}>{x.name} · {n(x.alightAm)}</option>)}</select></label>
          <NumberField label="Office arriving in the peak hour" value={presets.officePeakShare * 100} unit="%" step={5} onChange={(v) => set({ officePeakShare: Math.min(1, Math.max(0, v / 100)) })} />
          <NumberField label="Station riders using the entrance" value={presets.entranceShare * 100} unit="%" step={5} onChange={(v) => set({ entranceShare: Math.min(1, Math.max(0, v / 100)) })} />
          <NumberField label="Tower riders using the link" value={presets.linkShare * 100} unit="%" step={5} onChange={(v) => set({ linkShare: Math.min(1, Math.max(0, v / 100)) })} />
          <NumberField label="Headway" value={presets.headwayMin} unit="min" step={0.5} onChange={(v) => set({ headwayMin: Math.max(0.5, v) })} />
          <NumberField label="Link clear width" value={presets.clearWidth} unit="m" step={0.5} onChange={(v) => set({ clearWidth: Math.max(0.5, v) })} />
          <NumberField label="Through walkers" value={presets.throughPerHour} unit="/h" step={100} onChange={(v) => set({ throughPerHour: Math.max(0, v) })} />
          <NumberField label="Residents by transit" value={presets.residentShares.transit * 100} unit="%" step={5} onChange={(v) => { const t = Math.min(1, Math.max(0, v / 100)); const a = Math.min(presets.residentShares.autoDriver, 1 - t); set({ residentShares: { transit: t, autoDriver: a, other: 1 - t - a } }) }} />
          <NumberField label="Residents driving" value={presets.residentShares.autoDriver * 100} unit="%" step={5} onChange={(v) => { const a = Math.min(1 - presets.residentShares.transit, Math.max(0, v / 100)); set({ residentShares: { ...presets.residentShares, autoDriver: a, other: 1 - presets.residentShares.transit - a } }) }} />
          <NumberField label="Line capacity (optional)" value={presets.lineCapacity} unit="/h/dir" step={1000} onChange={(v) => set({ lineCapacity: Math.max(0, v) })} />
        </div>
        {edited.length > 0 && <p className="mt-1 text-[10px] text-amber-800">Edited: {edited.join(', ')} (your own assumption; station flows you enter stay team assumptions).</p>}
      </Section>
    </>
  )
}
