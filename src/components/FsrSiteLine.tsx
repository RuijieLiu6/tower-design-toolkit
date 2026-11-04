// The "Total FSR" line of the Design tab: the competition block on the VTC site; in Real Vancouver the study site
// (its joined City parcels or its boundary, with source and flag), or a plain note that there is no study site yet.
import { SITE } from '../engine/vtcRules'
import { useSiteStore } from '../lib/siteStore'
import { useStore } from '../store'
import { FlagChip } from './ui'

export default function FsrSiteLine({ totalFsr, siteArea }: { totalFsr: number; siteArea: number }) {
  const project = useStore((s) => s.project)
  const study = useSiteStore((s) => s.fsrArea)
  const value = <span className="font-semibold tabular-nums">{totalFsr.toFixed(2)}</span>
  if (project !== 'city') return <div className="mt-1 flex justify-between text-[11px]"><span className="text-muted">Total FSR (site {SITE.area.toFixed(0)} m²)</span>{value}</div>
  if (!study) return <div className="mt-1 flex justify-between text-[11px]"><span className="text-muted">Total FSR: no study site yet (shown over the competition block, {SITE.area.toFixed(0)} m²; set a site in the Vista view studies panel)</span>{value}</div>
  return (
    <div className="mt-1 text-[11px]">
      <div className="flex justify-between"><span className="text-muted">Total FSR (study site {Math.round(siteArea).toLocaleString('en-CA')} m², {study.basis === 'parcels' ? 'joined City parcels' : 'site boundary'})</span>{value}</div>
      <div className="mt-0.5 flex items-start gap-1.5"><FlagChip flag={study.flag} /><span className="text-[10px] text-muted">{study.source}</span></div>
    </div>
  )
}
