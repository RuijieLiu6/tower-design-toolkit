// Results of the pedestrian wind comfort node (a port of Sinnie Choi's Sun & Wind Studio wind engine, engine/windComfort.ts):
// the run's status, her Lawson comfort bands with and without the tower, the evidence lines with their sources, the
// downwash allowance, the eight sectors of a seasonal run, the overlay's field, and the node's presets (team assumptions:
// the podium comes from the model, canopy, corners and plaza shelter are chosen here). Indicative, not CFD.
import { RotateCcw, Wind } from './icons'
import type { RuleResult } from '../engine/types'
import { BAND_LIMITS } from '../engine/windComfort'
import { BAND_COLOURS, BAND_NAMES, DEFAULT_WIND_PRESETS, SRC, type WindPresets } from '../engine/windComfortInput'
import { useWindComfort, useWindComfortStore } from '../hooks/useWindComfort'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

export const PERIODS: { id: string; label: string; from: string; to: string }[] = [
  { id: 'year', label: 'Whole year', from: '01-01', to: '12-31' },
  { id: 'winter', label: 'Winter (Dec–Feb)', from: '12-01', to: '02-28' },
  { id: 'spring', label: 'Spring (Mar–May)', from: '03-01', to: '05-31' },
  { id: 'summer', label: 'Summer (Jun–Aug)', from: '06-01', to: '08-31' },
  { id: 'fall', label: 'Fall (Sep–Nov)', from: '09-01', to: '11-30' },
]
const periodId = (p: WindPresets['period']) => PERIODS.find((x) => x.from === p.from && x.to === p.to)?.id ?? 'year'

/** The band's upper limit in words, for hover text and the legend. */
export const bandLimit = (i: number) => (i < BAND_LIMITS.length ? `≤ ${BAND_LIMITS[i]} m/s` : `> ${BAND_LIMITS[BAND_LIMITS.length - 1]} m/s`)

const pc = (v: number) => `${Math.round(v * 100)}%`
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

/** One stacked bar: the share of open ground in each Lawson band, in her colours; the numbers on hover. */
function BandBar({ label, cats, other, otherLabel }: { label: string; cats: number[]; other: number[]; otherLabel: string }) {
  const total = cats.reduce((a, b) => a + b, 0) || 1, totalOther = other.reduce((a, b) => a + b, 0) || 1
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-meta">
      <span className="text-muted">{label}</span>
      <div role="img" aria-label={`${label}: ${cats.map((c, i) => `${BAND_NAMES[i]} ${pc(c / total)}`).join(', ')}`} className="flex h-3.5 w-full overflow-hidden rounded-[3px] border border-black/10 bg-subtle">
        {cats.map((c, i) => (
          <span key={BAND_NAMES[i]} title={`${BAND_NAMES[i]} (${bandLimit(i)}): ${pc(c / total)} ${label.toLowerCase()}, ${pc(other[i] / totalOther)} ${otherLabel}`}
            className="h-full" style={{ width: `${(c / total) * 100}%`, background: BAND_COLOURS[i] }} />
        ))}
      </div>
    </div>
  )
}

export default function WindComfortResults() {
  const { presets, view, status, progress, error, out, runRev, outRev, set, setView, reset, on } = useWindComfort()
  const project = useStore((s) => s.project)
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  const edited = JSON.stringify(presets) !== JSON.stringify(DEFAULT_WIND_PRESETS)
  const stale = !!out && outRev !== runRev
  const rerun = () => { useWindComfortStore.setState({ key: '' }); useWindComfortStore.getState().set({}) }
  const statusWord = status === 'running' ? (stale ? `Model changed, rerunning · ${progress || 'solving…'}` : progress || 'Solving…')
    : status === 'ready' ? (stale ? 'Model changed, rerunning' : 'Evaluated for the current model')
    : status === 'error' ? `Could not run: ${error}` : on ? 'Waiting for the model' : 'Off'
  const statusState = status === 'error' ? 'fail' : status === 'ready' && !stale ? 'pass' : 'unknown'
  const r = out?.result
  const z = r?.a.zone ?? null
  const calmRule = out?.rules.find((x) => x.id === 'calm-ground')
  return (
    <div data-testid="wind-comfort-card">
      <Section title="Results">
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-meta text-amber-950"><Wind size={14} className="mt-0.5 shrink-0" /><span><b>Indicative, not CFD.</b> A two-dimensional pedestrian-level flow on 4 m cells: it shows where the massing accelerates or shelters the wind, not absolute values.</span></div>
        <div data-testid="wind-comfort-status" className="flex items-center justify-between gap-2 rounded-md border border-line p-2">
          <div className="min-w-0">
            <div className="text-meta text-muted">Run</div>
            <div className="truncate text-xs font-semibold" title={statusWord}>{statusWord}</div>
            {out && <div className="text-meta text-muted">{out.towerName} · {out.north ? 'true north' : 'grid north'} · {out.obstacles.loaded ? <span data-testid="wind-comfort-buildings">{out.obstacles.buildings} context buildings</span> : 'no context loaded'}{out.obstacles.unknownHeights ? ` · ${out.obstacles.unknownHeights} without height left out` : ''}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StateChip state={statusState} value={status === 'running' ? 'Running' : status === 'idle' ? 'Idle' : undefined} />
            <button type="button" data-testid="wind-comfort-run" onClick={rerun} disabled={status === 'running'} title="Solve the flow again for the current model and presets"
              className={`h-7 rounded-lg bg-panel px-2 text-control text-ink disabled:opacity-50 ${focusRing}`}>Run again</button>
          </div>
        </div>
        {r && (
          <figure data-testid="wind-comfort-bands" className="m-0 mt-2 grid gap-1">
            <figcaption className="text-meta"><b className="font-semibold text-ink">Lawson comfort bands</b> <span className="text-muted">· share of open ground, {r.annual ? `${r.period?.label ?? 'period'} mean` : `wind from ${compassName(out!.presets.dir)} at ${out!.presets.speed} m/s`}</span></figcaption>
            <BandBar label="With tower" cats={r.cats} other={r.catsB} otherLabel="without" />
            <BandBar label="Without" cats={r.catsB} other={r.cats} otherLabel="with the tower" />
            <div role="list" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta">
              {BAND_NAMES.map((n, i) => <span key={n} role="listitem" title={bandLimit(i)} className="flex items-center gap-1.5 whitespace-nowrap"><i aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: BAND_COLOURS[i] }} />{n}</span>)}
            </div>
          </figure>
        )}
        {z && <p className="mt-2 text-meta text-slate-700">Downwash: the tower's windward face carries a <b>{z.amp.toFixed(2)}×</b> allowance within <b>{z.depth.toFixed(0)} m</b> of it (neighbours' mean roof {z.hn.toFixed(0)} m within 120 m){z.note.length ? `, down from ${z.amp0.toFixed(2)}× before the ${z.note.join(' and ')}` : ''}.</p>}
        {r && r.annual && r.sectors.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[300px] text-meta">
              <thead><tr className="text-left text-meta text-muted"><th className="py-0.5 font-medium">From</th><th className="text-right font-medium">Hours</th><th className="text-right font-medium">Mean m/s</th><th className="text-right font-medium">Plaza m/s</th><th className="text-right font-medium">Calm</th></tr></thead>
              <tbody>
                {r.sectors.map((s) => {
                  const t = s.cats.reduce((a, b) => a + b, 0) || 1
                  return (
                    <tr key={s.name} className="border-t border-line/60">
                      <td className="py-0.5 font-medium">{s.name}</td>
                      <td className="text-right tabular-nums">{pc(s.f)}</td>
                      <td className="text-right tabular-nums">{s.s.toFixed(1)}</td>
                      <td className="text-right tabular-nums">{out!.readings.hasPlaza ? s.plazaMean.toFixed(1) : '—'}</td>
                      <td className="text-right tabular-nums">{pc((s.cats[0] + s.cats[1]) / t)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-0.5 text-meta text-muted">Hours: share of the period's hours from that sector; mean: its frequency-weighted speed at 10 m; calm: sitting and standing bands with the tower.</p>
          </div>
        )}
        {out && (
          <div role="radiogroup" aria-label="Field on the ground" className="mt-2 flex flex-wrap items-center gap-1 text-meta">
            <span className="text-muted">Show</span>
            {([['with', 'With tower'], ['without', 'Without'], ['change', 'Change']] as const).map(([id, word]) => (
              <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}
                title={id === 'change' ? 'Cells whose band changes: calmer in the sitting colour, windier in the uncomfortable colour' : `Lawson bands ${id === 'with' ? 'with' : 'without'} the tower`}
                className={`rounded-[6px] border px-2 py-0.5 text-control font-medium ${focusRing} ${view === id ? 'border-accent bg-selected text-ink' : 'border-line bg-panel text-muted hover:text-ink'}`}>{word}</button>
            ))}
            <span className="text-muted">· in the Analysis view, Wind comfort</span>
          </div>
        )}
      </Section>

      {out && (
        <Section title="Rules">
          <div className="grid gap-2">{out.rules.map((x) => <Card key={x.id} r={x} />)}</div>
          {calmRule && !out.obstacles.loaded && <p className="mt-2 text-meta text-amber-800">No context loaded: the tower stands on open ground, so every reading is optimistic.</p>}
        </Section>
      )}

      <Section title="Presets (team assumptions)" right={edited ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="mb-2 flex flex-wrap items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">The podium comes from the model (its reach beyond the tower, at its height); the rest is chosen here.</span></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Case</span>
            <select data-testid="wind-comfort-annual" className={sel} value={presets.annual ? 'annual' : 'one'} onChange={(e) => set({ annual: e.target.value === 'annual' })}>
              <option value="one">One wind case</option><option value="annual">Seasonal rose (8 sectors, slower)</option>
            </select></label>
          {presets.annual ? (
            <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Period</span>
              <select className={sel} value={periodId(presets.period)} onChange={(e) => { const p = PERIODS.find((x) => x.id === e.target.value) ?? PERIODS[0]; set({ period: { from: p.from, to: p.to } }) }}>
                {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select></label>
          ) : (
            <>
              <NumberField label={`Wind from (${compassName(presets.dir)})`} value={presets.dir} unit="°" step={5} min={0} max={355} onChange={(v) => set({ dir: Math.max(0, Math.min(355, Math.round(v / 5) * 5)) })} hint={`Bearing the wind comes from, degrees clockwise from ${presets.north === 'true' ? 'true north' : 'the model grid’s north (her frame)'}.`} />
              <NumberField label="Speed at 10 m" value={presets.speed} unit="m/s" step={0.5} min={1} max={15} onChange={(v) => set({ speed: Math.max(0.5, v) })} hint="Free wind at 10 m above open ground; the ratios of the flow are scaled by it." />
            </>
          )}
          <NumberField label="Canopy depth" value={presets.canopy} unit="m" step={0.5} min={0} max={12} onChange={(v) => set({ canopy: Math.max(0, v) })} hint="A canopy around the tower's base, as her strategy; 0 for none." />
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Corners</span>
            <select className={sel} value={presets.corners} onChange={(e) => set({ corners: e.target.value as WindPresets['corners'] })}>{(['sharp', 'rounded', 'chamfered'] as const).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <NumberField label="Plaza shelter" value={Math.round(presets.shelter * 100)} unit="%" step={5} min={0} max={100} onChange={(v) => set({ shelter: Math.max(0, Math.min(1, v / 100)) })} hint="Planting and screens on the plazas, as a share of their shelter; competition context only." />
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">North</span>
            <select data-testid="wind-comfort-north" className={sel} value={presets.north} onChange={(e) => set({ north: e.target.value as WindPresets['north'] })}>
              <option value="true">True north{project === 'vtc' ? ' (45° from the grid)' : ''}</option><option value="model">Model grid as north (her frame)</option>
            </select></label>
          {project === 'vtc' && (
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={presets.future} onChange={(e) => set({ future: e.target.checked })} className="accent-accent" /><span>Count the three future towers</span></label>
          )}
        </div>
        {edited && <p className="mt-1 text-meta text-amber-800">Edited presets (your own team assumption).</p>}
        <p className="mt-2 text-meta text-muted">Engine: <a href={SRC.engine.url} target="_blank" rel="noreferrer" className="hover:text-accent">Sun &amp; Wind Studio, Sinnie Choi</a> · rose: CWEC2020 Vancouver Intl AP, as she distilled it.</p>
      </Section>
    </div>
  )
}
