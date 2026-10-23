// Lift strategy comparator in the Core & lift results (research P11-M02): direct vs sky lobby side by side from the
// lift check, double-deck and destination control with their checks and a "not computed" badge.
import { useMemo } from 'react'
import { liftStrategies } from '../engine/liftStrategy'
import type { Tower } from '../engine/types'
import { useTrips } from '../hooks/useTrips'
import { useStore } from '../store'
import { FlagChip, StateChip } from './ui'

export default function LiftStrategy({ t }: { t: Tower }) {
  const { liftPresets, egressPresets } = useStore()
  const s = useMemo(() => liftStrategies(t, liftPresets, egressPresets), [t, liftPresets, egressPresets])
  const trips = useTrips()
  const cell = 'px-1 text-right tabular-nums'
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="text-xs font-semibold">Lift strategies compared</div>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[380px] text-[11px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="py-0.5 font-medium">Strategy</th><th className={cell}>Cars</th><th className={cell}>Shafts at grade</th><th className={cell}>Core</th><th className={cell}>Net-to-gross</th><th className="px-1 font-medium">Transfers</th><th className="px-1 font-medium">Lift rules</th></tr></thead>
          <tbody>
            {s.options.map((o) => (
              <tr key={o.id} className={`border-t border-line/60 ${s.best === o.id ? 'bg-emerald-50/60' : ''}`}>
                <td className="py-1 pr-1 font-medium">{o.name}{s.best === o.id && <span className="ml-1 rounded bg-emerald-600 px-1 text-[9px] font-semibold text-white">smallest core</span>}</td>
                {o.result ? (
                  <>
                    <td className={cell}>{o.result.totalCars}</td>
                    <td className={cell}>{o.result.shaftsAtGrade}</td>
                    <td className={cell}>{Math.round(o.result.requiredMax)} m²</td>
                    <td className={cell}>{Math.round((1 - o.result.requiredMax / o.result.plate) * 100)}%</td>
                  </>
                ) : <td colSpan={4} className="px-1 text-center"><span className="rounded bg-slate-100 px-1 text-[9.5px] text-slate-600">not computed</span></td>}
                <td className="px-1">{o.transfers}</td>
                <td className="px-1">{o.computed ? (o.fails ? <span className="text-red-700">{o.fails} fail</span> : o.warns ? <span className="text-amber-700">{o.warns} to check</span> : <span className="text-emerald-700">pass</span>) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 grid gap-1.5">
        {s.options.filter((o) => o.checks.length).map((o) => (
          <div key={o.id} className="rounded border border-line/70 p-1.5">
            <div className="text-[11px] font-semibold">{o.name} <span className="font-normal text-muted">· {o.note}</span></div>
            {o.checks.map((c) => (
              <div key={c.id} className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"><StateChip state={c.state} /><span>{c.label}: <b>{c.value}</b> <span className="text-muted">· {c.threshold}</span></span><FlagChip flag={c.flag} /></div>
            ))}
          </div>
        ))}
      </div>
      {trips && trips.transitLevel.persons > 0 && <p className="mt-2 rounded border border-line bg-slate-50 p-1.5 text-[11px] text-slate-700"><b>Transit level:</b> {Math.round(trips.transitLevel.persons).toLocaleString('en-CA')} of the {Math.round(trips.am.in).toLocaleString('en-CA')} AM peak-hour arrivals ({Math.round(trips.transitLevel.share * 100)}%) come up from the station link (Trips & station entrance node, team shares). The up-peak check boards everyone at grade, so the lifts serving arrivals should also stop at the link level.</p>}
      <p className="mt-1.5 text-[10px] text-muted">Direct and sky lobby come from the same up-peak check, ranked by core area among layouts with no failing lift rule. Double-deck and destination control are never given numbers: their round-trip method was not retrieved and dispatch gains need a traffic simulation (research P11-M02).</p>
    </div>
  )
}
