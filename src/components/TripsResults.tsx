// Results of the trips & station-entrance node (research P09-M01, M03 tier 0): AM peak-hour trips by use and mode, the
// station-entrance load and link width (comfort only), what feeds parking and the lifts, and the presets.
import { RotateCcw } from './icons'
import { DEFAULT_TRIPS, STATIONS, type TripPresets } from '../engine/trips'
import { useTrips } from '../hooks/useTrips'
import { useTripStore } from '../lib/tripStore'
import { NumberField, Section } from './ui'
import { Caveat, Fold, HBars, Legend, MethodFold, RuleRows, Stack } from './ResultViz'


const n = (x: number) => Math.round(x).toLocaleString('en-CA')
const MODE = { transit: '#2a8f86', car: '#8a6fb0', other: '#c3c9cf' }

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
        <div className="mb-2"><Caveat lead="Unsourced presets: comfort only, not egress">Trip rates and peak-hour shares are unsourced presets; the mode split for trips into the tower is the 2008 Trip Diary row for trips ending downtown (context, not a target); residents’ split is an <b>unsourced scenario</b>. The station check is comfort only, not egress.</Caveat></div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-meta"><span className="font-semibold">AM peak hour, people by mode</span><span className="tabular-nums text-muted">{n(r.am.in)} into the tower</span></div>
        <div className="grid min-w-0 gap-2">
          {r.uses.map((u) => (
            <div key={u.use} className="grid min-w-0 gap-0.5" title={`${u.use} (${u.basis}): ${n(u.persons)} people, ${n(u.transit)} by transit, ${n(u.autoDriver)} car drivers, ${n(u.other)} other`}>
              <div className="flex min-w-0 items-center gap-1.5 text-meta"><span className="min-w-0 flex-1 truncate">{u.use}</span>{u.basis === 'unsourced scenario' && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-900">scenario</span>}<b className="shrink-0 tabular-nums">{n(u.persons)}</b></div>
              <Stack label={`${u.use}, AM peak hour by mode`} unit="people" legend={false} height={9} parts={[{ label: 'Transit', v: u.transit, color: MODE.transit }, { label: 'Car drivers', v: u.autoDriver, color: MODE.car }, { label: 'Other', v: u.other, color: MODE.other }]} />
            </div>
          ))}
          <Legend items={[{ label: 'transit', color: MODE.transit }, { label: 'car drivers', color: MODE.car }, { label: 'other', color: MODE.other }]} />
        </div>
        <div className="mt-2"><Fold title="Table: people by use and mode"><div className="overflow-x-auto">
          {/* Node audit (7 Nov): the upper-case, letter-spaced headers crowded into each other ("PEOPLETRANSIT") and pushed
              "Other" out of the 22rem panel; sentence-case headers with a gutter fit, "Car" says "car drivers" on hover. */}
          <table className="w-full text-meta [&_td+td]:pl-2 [&_th+th]:pl-2">
            <thead><tr className="text-left text-meta text-muted"><th className="py-0.5 font-medium">AM peak hour</th><th className="text-right font-medium">People</th><th className="text-right font-medium">Transit</th><th className="text-right font-medium"><abbr title="Car drivers" className="no-underline">Car</abbr></th><th className="text-right font-medium">Other</th></tr></thead>
            <tbody>
              {r.uses.map((u) => (
                <tr key={u.use} className="border-t border-line/60">
                  <td className="py-0.5">{u.use} <span className={`rounded px-1 text-meta ${u.basis === 'unsourced scenario' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{u.basis}</span></td>
                  <td className="text-right tabular-nums">{n(u.persons)}</td><td className="text-right tabular-nums">{n(u.transit)}</td><td className="text-right tabular-nums">{n(u.autoDriver)}</td><td className="text-right tabular-nums">{n(u.other)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold"><td className="py-0.5">Into the tower</td><td className="text-right tabular-nums">{n(r.am.in)}</td><td className="text-right tabular-nums">{n(r.am.transitIn)}</td><td className="text-right tabular-nums">{n(r.am.autoDriverIn)}</td><td /></tr>
            </tbody>
          </table>
        </div></Fold></div>
      </Section>

      <Section title="Station entrance (tier 0)">
        <div className="mb-1 text-meta font-semibold">People on the below-grade link, AM peak hour</div>
        <Stack label={`People using the below-grade link at ${s.name}`} unit="people" share={false} parts={[{ label: 'from the tower', v: s.linkIn, color: '#2563eb' }, { label: 'station riders', v: s.stationIn, color: '#2a8f86', tip: `${n(s.stationIn)} station riders at the proxy station (${s.name})` }]} />
        <div className="mb-1 mt-3 text-meta font-semibold">Clear width of the link</div>
        <HBars label="Link clear width against the width needed" fmt={(v) => `${v.toFixed(1)} m`} labelWidth="4.5rem" rows={[
          { label: 'Needed', v: s.required, color: '#8d96a3', tip: `One train every ${presets.headwayMin} min brings ${n(s.perTrain)} people; passing in ${presets.dispersalS} s they need ${s.required.toFixed(1)} m at ${presets.bandM2} m² per person` },
          { label: 'Given', v: presets.clearWidth, color: s.ratio > 1 ? '#c27c0e' : '#64748b', bold: true, tip: `${presets.clearWidth.toFixed(1)} m given${s.ratio > 1 ? ', too narrow for comfort' : ''}. No width is ever shown green.` },
        ]} />
        <MethodFold>
          <p><b>{n(s.linkIn + s.stationIn)}</b> people in the AM peak hour use the below-grade link: {n(s.linkIn)} from the tower, {n(s.stationIn)} station riders at the proxy station ({s.name}).</p>
          <p>One train every {presets.headwayMin} min brings {n(s.perTrain)}; passing in {presets.dispersalS} s they need <b>{s.required.toFixed(1)} m</b> of clear width at {presets.bandM2} m² per person ({presets.clearWidth.toFixed(1)} m given{s.ratio > 1 ? ', too narrow for comfort' : ''}).</p>
          <p>No width is ever shown green: the walkway boundaries are unverified (TCQSM ch. 10 unread) and egress (NFPA 130) may govern.</p>
        </MethodFold>
      </Section>

      <Section title="Feeds">
        <HBars label="What the trips feed into parking and the lifts" unit="people" labelWidth="6.5rem" rows={[
          { label: 'Car drivers in', v: r.parking.arrivals, mark: r.parking.maxStalls ?? undefined, markTip: r.parking.maxStalls !== null ? `Downtown maximum of ${n(r.parking.maxStalls)} stalls (unverified)` : undefined, color: MODE.car, tip: `Parking, loading & bikes: ${n(r.parking.arrivals)} car drivers arrive in the AM peak hour${r.parking.maxStalls !== null ? ` against a downtown maximum of ${n(r.parking.maxStalls)} stalls (unverified)` : ''}` },
          { label: 'From the station', v: r.transitLevel.persons, color: MODE.transit, text: `${n(r.transitLevel.persons)} · ${Math.round(r.transitLevel.share * 100)}%`, tip: `Core & lifts: ${n(r.transitLevel.persons)} of the arrivals (${Math.round(r.transitLevel.share * 100)}%) come up from the station link, so the lifts should also serve that level` },
          { label: 'All arrivals', v: r.am.in, color: '#b8c0cc', muted: true },
        ]} />
      </Section>

      <Section title="Rules">
        <RuleRows rules={r.rules} />
      </Section>

      <Section folded title="Presets (team assumptions and your inputs)" right={edited.length ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs"><span className="text-muted">Proxy station (2025 weekday 8–9 AM alightings)</span>
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
        {edited.length > 0 && <p className="mt-1 text-meta text-amber-800">Edited: {edited.join(', ')} (your own assumption; station flows you enter stay team assumptions).</p>}
      </Section>
    </>
  )
}
