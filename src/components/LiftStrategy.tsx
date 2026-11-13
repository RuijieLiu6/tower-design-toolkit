// Lift strategy comparator in the Core & lift results (research P11-M02): direct vs sky lobby side by side from the
// lift check, double-deck and destination control with their checks and a "not computed" badge.
import { ResultBadge, ResultCounts } from './ResultState'
import { useMemo } from 'react'
import { liftStrategies } from '../engine/liftStrategy'
import type { Tower } from '../engine/types'
import { useTrips } from '../hooks/useTrips'
import { useStore } from '../store'
import { Fold, HBars, MethodFold, RuleRows } from './ResultViz'
import { useShallow } from 'zustand/react/shallow'

export default function LiftStrategy({ t }: { t: Tower }) {
  const { liftPresets, egressPresets } = useStore(useShallow((s) => ({ liftPresets: s.liftPresets, egressPresets: s.egressPresets })))
  const s = useMemo(() => liftStrategies(t, liftPresets, egressPresets), [t, liftPresets, egressPresets])
  const trips = useTrips()
  const cell = 'px-1 text-right tabular-nums'
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="text-xs font-semibold">Lift strategies compared</div>
      <div className="mt-1.5"><HBars label="Core needed by lift strategy" unit="m²" labelWidth="7.5rem"
        rows={s.options.map((o) => ({ label: o.name, bold: s.best === o.id, v: o.result ? o.result.requiredMax : 0, text: o.result ? `${Math.round(o.result.requiredMax)} m²` : 'not computed', color: s.best === o.id ? '#2563eb' : '#b8c0cc', muted: !o.result,
          tip: o.result ? `${o.name}: ${o.result.totalCars} cars, ${o.result.shaftsAtGrade} shafts at grade, core ${Math.round(o.result.requiredMax)} m², net-to-gross ${Math.round((1 - o.result.requiredMax / o.result.plate) * 100)}%, transfers ${o.transfers}${s.best === o.id ? ' (smallest core)' : ''}` : `${o.name}: not computed. ${o.note}` }))} /></div>
      <div className="mt-2"><Fold title="Table: cars, shafts, net-to-gross, transfers"><div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-meta">
          <thead><tr className="text-left text-meta text-muted"><th className="py-0.5 font-medium">Strategy</th><th className={cell}>Cars</th><th className={cell}>Shafts at grade</th><th className={cell}>Core</th><th className={cell}>Net-to-gross</th><th className="px-1 font-medium">Transfers</th><th className="px-1 font-medium">Lift rules</th></tr></thead>
          <tbody>
            {s.options.map((o) => (
              <tr key={o.id} className={`border-t border-line/60 ${s.best === o.id ? 'bg-subtle' : ''}`}>
                <td className="py-1 pr-1 font-medium">{o.name}{s.best === o.id && <span className="ml-1 rounded border border-line bg-panel px-1 text-meta font-semibold text-ink">smallest core</span>}</td>
                {o.result ? (
                  <>
                    <td className={cell}>{o.result.totalCars}</td>
                    <td className={cell}>{o.result.shaftsAtGrade}</td>
                    <td className={cell}>{Math.round(o.result.requiredMax)} m²</td>
                    <td className={cell}>{Math.round((1 - o.result.requiredMax / o.result.plate) * 100)}%</td>
                  </>
                ) : <td colSpan={4} className="px-1 text-center"><span className="rounded bg-pending-surface px-1 text-meta text-pending">not computed</span></td>}
                <td className="px-1">{o.transfers}</td>
                <td className="px-1">{o.computed ? (o.fails || o.warns ? <ResultCounts counts={{ fail: o.fails, warn: o.warns }} /> : <ResultBadge state="pass" />) : <span className="text-pending">not run</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></Fold></div>
      <div className="mt-2 grid min-w-0 gap-1.5">
        {s.options.filter((o) => o.checks.length).map((o) => (
          <div key={o.id} className="grid min-w-0 gap-1">
            <div className="truncate text-meta font-semibold" title={`${o.name}: ${o.note}`}>{o.name} <span className="font-normal text-muted">· {o.note}</span></div>
            <RuleRows rules={o.checks} />
          </div>
        ))}
      </div>
      <MethodFold>
      {trips && trips.transitLevel.persons > 0 && <p><b>Transit level:</b> {Math.round(trips.transitLevel.persons).toLocaleString('en-CA')} of the {Math.round(trips.am.in).toLocaleString('en-CA')} AM peak-hour arrivals ({Math.round(trips.transitLevel.share * 100)}%) come up from the station link (Trips & station entrance node, team shares). The up-peak check boards everyone at grade, so the lifts serving arrivals should also stop at the link level.</p>}
      <p>Direct and sky lobby come from the same up-peak check, ranked by core area among layouts with no failing lift rule. Double-deck and destination control are never given numbers: their round-trip method was not retrieved and dispatch gains need a traffic simulation (research P11-M02).</p>
      </MethodFold>
    </div>
  )
}
