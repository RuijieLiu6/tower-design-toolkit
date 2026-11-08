// FSR in the Program tool, as a figure and a gauge (Ruijie, 6 Nov: information as graphics, not sentences). The competition
// site: the non-residential FSR on the chosen tier against the brief's 9.0 minimum, the three tiers as ticks. Real
// Vancouver: the total FSR over the study site (its joined City parcels or its boundary, with source and flag), or a "!"
// row when there is no study site yet. The long texts sit behind "?".
import { LandPlot } from './icons'
import { MIN_NONRES_FSR, SITE, TIER_LABEL, type FsrTier } from '../engine/vtcRules'
import { useSiteStore } from '../lib/siteStore'
import { useStore } from '../store'
import Help from './Help'
import StatusRow from './StatusRow'
import { FlagChip } from './ui'

export default function FsrSiteLine({ totalFsr, siteArea, tiers }: { totalFsr: number; siteArea: number; tiers?: [number, number, number] }) {
  const project = useStore((s) => s.project)
  const tier = useStore((s) => s.fsrTier)
  const study = useSiteStore((s) => s.fsrArea)
  if (project !== 'city') {
    const v = tiers ? tiers[tier - 1] : totalFsr
    return (
      <div className="mt-1.5 grid gap-1 text-meta" data-testid="fsr-gauge">
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted">FSR total</span><b className="tabular-nums text-ink">{totalFsr.toFixed(2)}</b>
          <span className="flex items-center gap-1 rounded border border-line px-1 text-muted" title="Over the competition block"><LandPlot size={11} className="text-accent" aria-hidden />{Math.round(SITE.area).toLocaleString('en-CA')} m²</span>
        </div>
        {tiers && <FsrGauge value={v} min={MIN_NONRES_FSR} tiers={tiers} tier={tier} />}
      </div>
    )
  }
  if (!study) {
    return (
      <ul className="mt-1.5 text-meta">
        <StatusRow size="sm" state="warn" title="FSR" value={`${totalFsr.toFixed(2)} · no study site yet`}
          detail={`Shown over the competition block (${SITE.area.toFixed(0)} m²) until you choose a study site in the Site step.`} />
      </ul>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-meta">
      <span className="text-muted">FSR total</span><b className="tabular-nums text-ink">{totalFsr.toFixed(2)}</b>
      <span className="flex items-center gap-1 rounded border border-line px-1 text-muted" title={study.basis === 'parcels' ? 'Over the joined City parcels' : 'Over the site boundary'}>
        <LandPlot size={11} className="text-accent" aria-hidden />{Math.round(siteArea).toLocaleString('en-CA')} m² · {study.basis === 'parcels' ? 'lots' : 'boundary'}</span>
      <FlagChip flag={study.flag} />
      <Help label="Source of the site area">{study.source}</Help>
    </div>
  )
}

/** The non-residential FSR against the 9.0 minimum: a bar, the minimum as a line, the three tiers as ticks. */
function FsrGauge({ value, min, tiers, tier }: { value: number; min: number; tiers: [number, number, number]; tier: FsrTier }) {
  const top = Math.max(min * 1.4, ...tiers) * 1.05
  const pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`
  const ok = value >= min
  return (
    <figure className="m-0 grid gap-0.5" aria-label={`Non-residential FSR ${value.toFixed(2)} on ${TIER_LABEL[tier]}, minimum ${min.toFixed(1)}: ${ok ? 'meets it' : 'below it'}`}>
      <div className="relative h-3 rounded bg-slate-100">
        <div className={`h-3 rounded ${ok ? 'bg-emerald-600' : 'bg-red-600'}`} style={{ width: pct(value) }} />
        <div className="absolute -top-1 bottom-[-4px] w-px bg-ink" style={{ left: pct(min) }} aria-hidden />
        {tiers.map((t, i) => <div key={i} title={`Tier ${i + 1}: ${t.toFixed(2)}`} className={`absolute top-0 h-3 w-[2px] ${i + 1 === tier ? 'bg-white' : 'bg-white/60'}`} style={{ left: pct(t) }} aria-hidden />)}
      </div>
      <figcaption className="flex justify-between text-meta text-muted">
        <span><b className={ok ? 'text-emerald-800' : 'text-red-700'}>{value.toFixed(2)}</b> non-residential · tier {tier}</span>
        <span>min <b className="text-ink">{min.toFixed(1)}</b></span>
      </figcaption>
    </figure>
  )
}
