// Results of the natural-ventilation node (a port of Sinnie Choi's Sun & Wind Studio ventilation engine,
// engine/ventilationSW.ts): the run's status, her ASHRAE 62.1 readings and the share of hours the windows can do the work,
// month by month, floor by floor, and her week-by-hour carpet; the evidence lines with sources and flags; the presets.
// Indicative, one zone per floor, as her own note says.
import { RotateCcw, Wind } from './icons'
import type { RuleResult } from '../engine/types'
import { DEFAULT_VENT_PRESETS, type VentilationPresets } from '../engine/ventilationSWInput'
import { SRC } from '../engine/ventilationSWInput'
import { useVentilationSW, useVentilationSWStore } from '../hooks/useVentilationSW'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'
import { PERIODS } from './WindComfortResults'

const pc = (v: number) => `${Math.round(v * 100)}%`
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
const periodId = (p: VentilationPresets['period']) => PERIODS.find((x) => x.from === p.from && x.to === p.to)?.id ?? 'year'
/** Her ventilation teal (study.js ventCarpet). */
const TEAL = (a: number) => `rgba(46,140,150,${a.toFixed(2)})`
const MONTH = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}</a> : <span className="text-meta text-muted">{r.source.label}</span>}
      </div>
    </div>
  )
}

/** Bars 0–100%: a pale bar behind (e.g. comfortable hours) and the main bar in her teal. */
function Bars({ main, back, labels, label }: { main: number[]; back?: number[]; labels: string[]; label: string }) {
  const W = 380, H = 84, L = 28, R = 6, T = 6, B = 14, n = main.length, bw = (W - L - R) / Math.max(1, n), ph = H - T - B
  const y = (v: number) => T + ph * (1 - Math.max(0, Math.min(1, v)))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-line" /><text x={L - 3} y={y(v) + 3} textAnchor="end" fontSize={8.5} className="fill-current text-muted">{v * 100}%</text></g>)}
      {main.map((v, i) => (
        <g key={i}>
          {back && <rect x={L + i * bw} y={y(back[i])} width={Math.max(0.5, bw - 0.8)} height={T + ph - y(back[i])} fill={TEAL(0.18)} />}
          <rect x={L + i * bw} y={y(v)} width={Math.max(0.5, bw - 0.8)} height={Math.max(0.5, T + ph - y(v))} fill={TEAL(0.9)}><title>{`${labels[i]}: ${pc(v)}${back ? ` (comfortable ${pc(back[i])})` : ''}`}</title></rect>
        </g>
      ))}
      {n <= 12 ? labels.map((l, i) => <text key={i} x={L + i * bw + bw / 2} y={H - 3} textAnchor="middle" fontSize={8.5} className="fill-current text-muted">{l}</text>)
        : <><text x={L} y={H - 3} fontSize={8.5} className="fill-current text-muted">{labels[0]}</text><text x={W - R} y={H - 3} textAnchor="end" fontSize={8.5} className="fill-current text-muted">{labels[n - 1]}</text></>}
    </svg>
  )
}

/** Her carpet (study.js ventCarpet): share of operable floors open by week and hour of the day. */
function Carpet({ grid }: { grid: Float32Array }) {
  const W = 380, H = 130, L = 26, R = 6, T = 6, B = 14, nw = 52, cw = (W - L - R) / nw, chh = (H - T - B) / 24
  const cells = []
  for (let w = 0; w < nw; w++) for (let h = 0; h < 24; h++) {
    let sm = 0, c = 0
    for (let d = 0; d < 7; d++) { const k = (w * 7 + d) * 24 + h; if (k >= 8760 || grid[k] < 0) continue; sm += grid[k]; c++ }
    if (!c) continue
    const v = sm / c
    cells.push(<rect key={w * 24 + h} x={L + w * cw} y={T + h * chh} width={cw + 0.05} height={chh + 0.05} fill={v < 0.02 ? 'rgb(226 232 240)' : TEAL(0.18 + 0.82 * v)} />)
  }
  return (
    <svg data-testid="ventilation-sw-carpet" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hours with windows open by week and hour of day" className="w-full">
      {cells}
      {[0, 6, 12, 18, 24].map((h) => <text key={h} x={L - 3} y={T + h * chh + 3} textAnchor="end" fontSize={8.5} className="fill-current text-muted">{h}h</text>)}
      {MONTH.map((m, i) => <text key={i} x={L + ((i * 365) / 12 / 7) * cw} y={H - 3} fontSize={8.5} className="fill-current text-muted">{m}</text>)}
    </svg>
  )
}

export default function VentilationSWResults() {
  const { presets, status, error, out, runRev, outRev, set, reset, on } = useVentilationSW()
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  const edited = JSON.stringify(presets) !== JSON.stringify(DEFAULT_VENT_PRESETS)
  const stale = !!out && outRev !== runRev
  const rerun = () => { useVentilationSWStore.setState({ key: '' }); useVentilationSWStore.getState().set({}) }
  const statusWord = status === 'running' ? (stale ? 'Model changed, rerunning…' : 'Running the year hour by hour…')
    : status === 'ready' ? (stale ? 'Model changed, rerunning' : 'Evaluated for the current model')
    : status === 'error' ? `Could not run: ${error}` : on ? 'Waiting for the model' : 'Off'
  const statusState = status === 'error' ? 'fail' : status === 'ready' && !stale ? 'pass' : 'unknown'
  const V = out?.vent, Q = out?.quick, rd = out?.readings
  const shareOf = (i: number) => V?.floors.find((f) => f.i === i)?.share ?? 0
  return (
    <div data-testid="ventilation-sw-card">
      <Section title="Results">
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-meta text-amber-950"><Wind size={14} className="mt-0.5 shrink-0" /><span><b>Indicative, one zone per floor.</b> Hour by hour over the typical year, as Sun &amp; Wind Studio computes it; an AirflowNetwork model with the real interior settles the design.</span></div>
        <div data-testid="ventilation-sw-status" className="flex items-center justify-between gap-2 rounded-md border border-line p-2">
          <div className="min-w-0">
            <div className="text-meta text-muted">Run</div>
            <div className="truncate text-xs font-semibold" title={statusWord}>{statusWord}</div>
            {out && V && <div className="text-meta text-muted">{out.towerName} · {V.nF} floors, {V.operable} with operable windows · {out.north ? 'true north' : 'model grid as north'}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StateChip state={statusState} value={status === 'running' ? 'Running' : status === 'idle' ? 'Idle' : undefined} />
            <button type="button" data-testid="ventilation-sw-run" onClick={rerun} disabled={status === 'running'} title="Run the ventilation study again for the current model and presets"
              className={`h-7 rounded-lg bg-panel px-2 text-control text-ink disabled:opacity-50 ${focusRing}`}>Run again</button>
          </div>
        </div>
        {out && V && Q && rd && (
          <>
            <div data-testid="ventilation-sw-key" className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">Openable area</div><div className="text-sm font-semibold tabular-nums">{rd.operableFloors ? `${rd.freePct.toFixed(1)}%` : 'none'}</div><div className="text-meta text-muted">≥ 4% (62.1)</div></div>
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">Within 8 m</div><div className="text-sm font-semibold tabular-nums">{rd.operableFloors ? pc(rd.within8) : '—'}</div><div className="text-meta text-muted">every point</div></div>
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">Windows do the work</div><div className="text-sm font-semibold tabular-nums">{pc(rd.openShare)}</div><div className="text-meta text-muted">of hours</div></div>
            </div>
            <figure data-testid="ventilation-sw-bars" className="m-0 mt-2 grid gap-1">
              <figcaption className="text-meta"><b className="font-semibold text-ink">By month</b> <span className="text-muted">· share of hours with windows open (teal) against hours whose outdoor air is comfortable (pale)</span></figcaption>
              <Bars main={V.rows.map((r) => (r.hours ? r.vent / r.hours : 0))} back={V.rows.map((r) => r.fT)} labels={MONTH} label="Hours with windows open by month" />
              {V.floors.length > 0 && <>
                <figcaption className="text-meta"><b className="font-semibold text-ink">By floor</b> <span className="text-muted">· share of the period's hours each operable floor can open; highest open floor L{out.levels[V.limit - 1] ?? V.limit}</span></figcaption>
                <Bars main={V.floors.map((f) => shareOf(f.i))} labels={V.floors.map((f) => `L${f.i + 1}`)} label="Hours with windows open per floor" />
                <figcaption className="text-meta"><b className="font-semibold text-ink">Week by hour</b> <span className="text-muted">· share of operable floors open (her carpet)</span></figcaption>
                <Carpet grid={V.grid} />
              </>}
            </figure>
          </>
        )}
      </Section>

      {out && (
        <Section title="Rules">
          <div className="grid gap-2">{out.rules.map((x) => <Card key={x.id} r={x} />)}</div>
        </Section>
      )}

      <Section title="Presets (team assumptions)" right={edited ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="mb-2 flex flex-wrap items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">Plates and floor heights come from the model; which faces open and her ventilation settings are chosen here.</span></div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs" role="group" aria-label="Operable faces">
          <span className="text-muted">Operable faces</span>
          {(['N', 'E', 'S', 'W'] as const).map((f) => (
            <label key={f} className="flex items-center gap-1"><input type="checkbox" checked={presets.operable[f]} onChange={(e) => set({ operable: { ...presets.operable, [f]: e.target.checked } })} className="accent-accent" />{f}</label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Airflow</span>
            <select data-testid="ventilation-sw-mode" className={sel} value={presets.mode} onChange={(e) => set({ mode: e.target.value as VentilationPresets['mode'] })}>
              <option value="cross">Cross ventilation</option><option value="single">Single-sided</option><option value="stack">Stack (shaft)</option>
            </select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Comfort band</span>
            <select className={sel} value={presets.band} onChange={(e) => set({ band: e.target.value as VentilationPresets['band'] })}>
              <option value="fixed">Fixed band</option><option value="adaptive">ASHRAE 55 adaptive</option>
            </select></label>
          {presets.band === 'fixed' && <>
            <NumberField label="Band from" value={presets.tmin} unit="°C" step={1} min={5} max={30} onChange={(v) => set({ tmin: v })} />
            <NumberField label="Band to" value={presets.tmax} unit="°C" step={1} min={10} max={35} onChange={(v) => set({ tmax: Math.max(presets.tmin + 1, v) })} />
          </>}
          <NumberField label="Gust limit" value={presets.umax} unit="m/s" step={0.5} min={2} max={20} onChange={(v) => set({ umax: Math.max(1, v) })} hint="Windows close when the gust (1.8 × the wind at the floor) is over this." />
          <NumberField label="Glass that opens" value={Math.round(presets.open * 100)} unit="%" step={1} min={1} max={50} onChange={(v) => set({ open: Math.max(0.01, Math.min(0.5, v / 100)) })} hint="Free opening area as a share of the operable glass." />
          <NumberField label="Indoor rise ΔT" value={presets.dT} unit="K" step={0.5} min={0} max={8} onChange={(v) => set({ dT: Math.max(0, v) })} hint="How much warmer the room runs than outside." />
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Period</span>
            <select className={sel} value={periodId(presets.period)} onChange={(e) => { const p = PERIODS.find((x) => x.id === e.target.value) ?? PERIODS[0]; set({ period: { from: p.from, to: p.to } }) }}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Glazing</span>
            <select className={sel} value={presets.glazing} onChange={(e) => set({ glazing: e.target.value as VentilationPresets['glazing'] })}>
              <option value="auto">Facade node when on, else her defaults</option><option value="studio">Her default facade zones</option>
            </select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">North</span>
            <select className={sel} value={presets.north} onChange={(e) => set({ north: e.target.value as VentilationPresets['north'] })}>
              <option value="true">True north</option><option value="model">Model grid as north (as her app)</option>
            </select></label>
        </div>
        {edited && <p className="mt-1 text-meta text-amber-800">Edited presets (your own team assumption).</p>}
        <p className="mt-2 text-meta text-muted">Engine: <a href={SRC.engine.url} target="_blank" rel="noreferrer" className="hover:text-accent">Sun &amp; Wind Studio, Sinnie Choi</a> · weather: CWEC2020 Vancouver Intl AP, hourly, as her app loads it.</p>
      </Section>
    </div>
  )
}
