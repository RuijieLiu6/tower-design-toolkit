// Results of the daylight sDA / ASE node (a port of Sinnie Choi's Sun & Wind Studio daylight engine, engine/daylightSW.ts):
// the run's status, sDA and ASE per floor as her bars draw them, the evidence lines with their sources and flags, a plan of
// one floor (daylight autonomy, daylight factor or hours of direct sun per 2 m cell, her colour ramps) and the presets.
// Indicative early-design proxies, as her own note says: a LEED submission needs an hourly Radiance run.
import type { ReactElement } from 'react'
import { RotateCcw, Sun } from './icons'
import type { DlFloor, DlRow } from '../engine/daylightSW'
import { DEFAULT_DAYLIGHT_PRESETS, SRC, type DaylightPresets } from '../engine/daylightSWInput'
import type { RuleResult } from '../engine/types'
import { useDaylightSW, useDaylightSWStore } from '../hooks/useDaylightSW'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'
import { PERIODS } from './WindComfortResults'

const pc = (v: number) => `${Math.round(v * 100)}%`
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
const periodId = (p: DaylightPresets['period']) => PERIODS.find((x) => x.from === p.from && x.to === p.to)?.id ?? 'year'

// Her plan colour ramps (study.js rampDA / rampDF / rampASE).
const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(',')})`
export const rampDA = (v: number) => { const t = Math.max(0, Math.min(1, v)); const a = [44, 62, 96], b = [150, 170, 190], c = [240, 196, 92]; return rgb(t < 0.5 ? lerp(a, b, t / 0.5) : lerp(b, c, (t - 0.5) / 0.5)) }
export const rampDF = (v: number) => rampDA(Math.max(0, Math.min(1, v / 0.05)))
export const rampASE = (v: number) => rgb(lerp([240, 224, 190], [184, 54, 43], Math.max(0, Math.min(1, v / 500))))
/** Her bar colours: sDA in her daylight amber, ASE in her uncomfortable red. */
const SDA_COL = '#D9A441', ASE_COL = '#B8362B'

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

/** Her per-floor bar chart (study.js floorBars): one bar per analysed floor, a dashed line at the threshold. */
function FloorBars({ values, levels, color, label, threshold, max = 1, onPick, picked }: { values: number[]; levels: number[]; color: string; label: string; threshold: number; max?: number; onPick: (i: number) => void; picked: number }) {
  const W = 380, H = 90, L = 30, R = 8, T = 8, B = 16, n = values.length, bw = (W - L - R) / Math.max(1, n), ph = H - T - B
  const y = (v: number) => T + ph * (1 - Math.max(0, Math.min(1, v / max)))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v * max)} y2={y(v * max)} stroke="currentColor" className="text-line" /><text x={L - 3} y={y(v * max) + 3} textAnchor="end" fontSize={8.5} className="fill-current text-muted">{Math.round(v * max * 100)}%</text></g>)}
      <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} stroke="#B45309" strokeDasharray="3 2" />
      {values.map((v, i) => {
        const h = ph * Math.max(0, Math.min(1, v / max))
        return <rect key={i} x={L + i * bw} y={T + ph - h} width={Math.max(0.5, bw - 0.6)} height={Math.max(h, 0.5)} fill={color} opacity={i === picked ? 1 : 0.8} stroke={i === picked ? '#111827' : 'none'} strokeWidth={0.8}
          onClick={() => onPick(i)} style={{ cursor: 'pointer' }}><title>{`L${levels[i]}: ${pc(v)}`}</title></rect>
      })}
      <text x={L} y={H - 4} fontSize={8.5} className="fill-current text-muted">L{levels[0]}</text>
      <text x={W - R} y={H - 4} textAnchor="end" fontSize={8.5} className="fill-current text-muted">L{levels[n - 1]}</text>
    </svg>
  )
}

/** One floor's cells in the plate's own frame (her planSVG), with the core and a north arrow; true or model north as run. */
function PlanView({ plate, row, field, step, layer, posX, posY, trueNorth, level }: { plate: DlFloor; row: DlRow; field: Float32Array; step: number; layer: 'da' | 'df' | 'ase'; posX: number; posY: number; trueNorth: boolean; level: number }) {
  const m = plate.mask, pad = 7
  const cells: ReactElement[] = []
  const ramp = layer === 'da' ? rampDA : layer === 'df' ? rampDF : rampASE
  for (let iy = 0; iy < m.ny; iy += step) for (let ix = 0; ix < m.nx; ix += step) {
    const k = iy * m.nx + ix
    if (!m.cells[k] || m.x0 + ix + 0.5 > plate.w / 2 || m.y0 + iy + 0.5 > plate.d / 2) continue
    const v = field[k]
    const lx = m.x0 + ix, ly = m.y0 + iy
    cells.push(<rect key={k} x={lx} y={-(ly + step)} width={step} height={step} fill={v || layer === 'ase' ? ramp(v) : '#9ca3af'} />)
  }
  const c = Math.cos(plate.rot), s = Math.sin(plate.rot), dx = posX - plate.cx, dy = posY - plate.cy
  const cc = { x: dx * c + dy * s, y: -dx * s + dy * c }, ch = plate.core / 2
  const nx = Math.sin(plate.rot), ny = Math.cos(plate.rot) // her +y (north) in the plate's frame
  const W = plate.w + 2 * pad, H = plate.d + 2 * pad, ax = plate.w / 2 + pad - 3.5, ay = -plate.d / 2 - pad + 4
  return (
    <svg data-testid="daylight-sw-plan" viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`} role="img" aria-label={`Level plan, ${layer === 'da' ? 'daylight autonomy' : layer === 'df' ? 'daylight factor' : 'hours of direct sun'} per ${step} m cell`} className="w-full max-h-64">
      {cells}
      <rect x={cc.x - ch} y={-(cc.y + ch)} width={2 * ch} height={2 * ch} fill="#e5e7eb" stroke="#6b7280" strokeWidth={0.2}><title>Core (left out of the study)</title></rect>
      <g transform={`translate(${ax} ${ay})`}><line x1={-nx * 2.2} y1={ny * 2.2} x2={nx * 2.2} y2={-ny * 2.2} stroke="#111827" strokeWidth={0.35} /><circle cx={nx * 2.2} cy={-ny * 2.2} r={0.5} fill="#111827" /><text x={nx * 3.6} y={-ny * 3.6 + 0.6} fontSize={1.8} textAnchor="middle" className="fill-current">{trueNorth ? 'N' : 'N (grid)'}</text></g>
      <title>{`L${level}: sDA ${pc(row.pctLit)}, mean DF ${(row.mean * 100).toFixed(1)}%`}</title>
    </svg>
  )
}

export default function DaylightSWResults() {
  const { presets, layer, floor, status, progress, error, out, empty, runRev, outRev, set, setLayer, setFloor, reset, on } = useDaylightSW()
  const project = useStore((s) => s.project)
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  const edited = JSON.stringify(presets) !== JSON.stringify(DEFAULT_DAYLIGHT_PRESETS)
  const stale = !!out && outRev !== runRev
  const rerun = () => { useDaylightSWStore.setState({ key: '' }); useDaylightSWStore.getState().set({}) }
  const statusWord = status === 'running' ? (stale ? `Model changed, rerunning · ${progress || 'working…'}` : progress || 'Working…')
    : status === 'ready' ? (!out && empty ? 'No occupied floors to analyse' : stale ? 'Model changed, rerunning' : 'Evaluated for the current model')
    : status === 'error' ? `Could not run: ${error}` : on ? 'Waiting for the model' : 'Off'
  const statusState = status === 'error' ? 'fail' : status === 'ready' && !stale ? 'pass' : 'unknown'
  const T = out?.tower, A = out?.ase
  const weakestIdx = T ? T.rows.reduce((b, r, i) => (r.pctLit < T.rows[b].pctLit ? i : b), 0) : 0
  const pick = T ? Math.min(floor ?? weakestIdx, T.rows.length - 1) : 0
  const row = T?.rows[pick]
  const plate = out && row ? out.plates[pick] : null
  const field = !T || !A || !row ? null : layer === 'ase' ? A.plans[A.rows[pick].sig].hrs : layer === 'df' ? T.plans[row.sig].df : T.plans[row.sig].da
  return (
    <div data-testid="daylight-sw-card">
      <Section title="Results">
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-meta text-amber-950"><Sun size={14} className="mt-0.5 shrink-0" /><span><b>Indicative, early design.</b> Climate-based sDA and ASE from a sight-line daylight model and a sun sweep, as Sun &amp; Wind Studio computes them; a LEED submission needs an hourly Radiance run.</span></div>
        <div data-testid="daylight-sw-status" className="flex items-center justify-between gap-2 rounded-md border border-line p-2">
          <div className="min-w-0">
            <div className="text-meta text-muted">Run</div>
            <div className="truncate text-xs font-semibold" title={statusWord}>{statusWord}</div>
            {out && <div className="text-meta text-muted">{out.towerName} · {T?.rows.length ?? 0} floors · {out.contextLoaded ? 'context loaded' : 'no context loaded'} · {out.presets.north === 'true' ? 'true north' : 'model grid as north'}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StateChip state={statusState} value={status === 'running' ? 'Running' : status === 'idle' ? 'Idle' : undefined} />
            <button type="button" data-testid="daylight-sw-run" onClick={rerun} disabled={status === 'running'} title="Run the daylight study again for the current model and presets"
              className={`h-7 rounded-lg bg-panel px-2 text-control text-ink disabled:opacity-50 ${focusRing}`}>Run again</button>
          </div>
        </div>
        {out && T && A && (
          <>
            <div data-testid="daylight-sw-key" className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">sDA{T.target}/50%</div><div className="text-sm font-semibold tabular-nums">{pc(T.sda)}</div><div className="text-meta text-muted">{out.readings.points} LEED pt{out.readings.points === 1 ? '' : 's'}</div></div>
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">ASE1000/250h</div><div className="text-sm font-semibold tabular-nums">{pc(A.pct)}</div><div className="text-meta text-muted">≤ 10%</div></div>
              <div className="rounded-md border border-line p-1.5"><div className="text-meta text-muted">Mean DF</div><div className="text-sm font-semibold tabular-nums">{(T.mean * 100).toFixed(1)}%</div><div className="text-meta text-muted">2% good</div></div>
            </div>
            <figure data-testid="daylight-sw-bars" className="m-0 mt-2 grid gap-1">
              <figcaption className="text-meta"><b className="font-semibold text-ink">sDA per floor</b> <span className="text-muted">· share of the floor reaching {T.target} lux for half the occupied hours; line at 55% (2 points, her chart). Pick a bar for its plan.</span></figcaption>
              <FloorBars values={T.rows.map((r) => r.pctLit)} levels={out.levels} color={SDA_COL} label="Spatial daylight autonomy per floor" threshold={0.55} onPick={setFloor} picked={pick} />
              <figcaption className="text-meta"><b className="font-semibold text-ink">ASE per floor</b> <span className="text-muted">· floor with over 250 h of direct sun above 1,000 lux, {A.period}; line at 10%</span></figcaption>
              <FloorBars values={A.rows.map((r) => r.pct)} levels={out.levels} color={ASE_COL} label="Annual sunlight exposure per floor" threshold={0.1} max={Math.max(0.3, ...A.rows.map((r) => r.pct))} onPick={setFloor} picked={pick} />
            </figure>
            {plate && row && field && (
              <figure className="m-0 mt-2 grid gap-1">
                <figcaption className="flex flex-wrap items-center gap-1 text-meta">
                  <b className="font-semibold text-ink">Plan, L{out.levels[pick]}</b>
                  <span className="text-muted">· sDA {pc(row.pctLit)} · ASE {pc(A.rows[pick].pct)} · DF {(row.mean * 100).toFixed(1)}%</span>
                  <span role="radiogroup" aria-label="Field on the plan" className="ml-auto flex gap-1">
                    {([['da', 'Autonomy'], ['df', 'Daylight factor'], ['ase', 'Direct sun']] as const).map(([id, word]) => (
                      <button key={id} type="button" role="radio" aria-checked={layer === id} onClick={() => setLayer(id)}
                        className={`rounded-[6px] border px-1.5 py-0.5 text-control font-medium ${focusRing} ${layer === id ? 'border-accent bg-selected text-ink' : 'border-line bg-panel text-muted hover:text-ink'}`}>{word}</button>
                    ))}
                  </span>
                </figcaption>
                <PlanView plate={plate} row={row} field={field} step={layer === 'ase' ? A.plans[A.rows[pick].sig].step : T.plans[row.sig].step} layer={layer} posX={out.posX} posY={out.posY} trueNorth={out.presets.north === 'true'} level={out.levels[pick]} />
                <div className="flex items-center gap-1 text-meta text-muted">
                  <span>{layer === 'da' ? '0%' : layer === 'df' ? '0' : '0 h'}</span>
                  <span aria-hidden className="h-2.5 w-28 rounded-[2px]" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => (layer === 'da' ? rampDA(t) : layer === 'df' ? rampDF(t * 0.05) : rampASE(t * 500))).join(',')})` }} />
                  <span>{layer === 'da' ? '100% of occupied hours ≥ ' + T.target + ' lux' : layer === 'df' ? '5%+' : '500 h+ (250 h counts against ASE)'}</span>
                </div>
              </figure>
            )}
          </>
        )}
      </Section>

      {!out && empty && status === 'ready' && (
        <Section title="Rules"><div data-testid="daylight-sw-empty" className="grid gap-2">{empty.rules.map((x) => <Card key={x.id} r={x} />)}</div></Section>
      )}
      {out && (
        <Section title="Rules">
          <div className="grid gap-2">{out.rules.map((x) => <Card key={x.id} r={x} />)}</div>
          <p className="mt-2 text-meta text-muted">The Daylight screen (plate depth) node is the geometric check before this one: it reads only plate depth and window head. This node adds the glass, the neighbours and the Vancouver sky hour by hour.</p>
        </Section>
      )}

      <Section title="Presets (team assumptions)" right={edited ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="mb-2 flex flex-wrap items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">Plates, cores and floor heights come from the model; glazing from the facade node when it is on.</span></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Glazing</span>
            <select data-testid="daylight-sw-glazing" className={sel} value={presets.glazing} onChange={(e) => set({ glazing: e.target.value as DaylightPresets['glazing'] })}>
              <option value="auto">Facade node when on, else her defaults</option><option value="studio">Her default facade zones</option>
            </select></label>
          <NumberField label="Glass VT" value={presets.vt ?? out?.glazing.vt ?? 0.6} step={0.05} min={0.1} max={0.9} onChange={(v) => set({ vt: Math.max(0.1, Math.min(0.9, v)) })} hint="Visible transmittance of the glass; blank in the facade node means her 0.60." />
          <NumberField label="sDA target" value={presets.target} unit="lux" step={50} min={100} max={1000} onChange={(v) => set({ target: Math.max(100, Math.round(v / 10) * 10) })} hint="LEED v4.1 uses 300 lux for half the occupied hours." />
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">ASE period</span>
            <select className={sel} value={periodId(presets.period)} onChange={(e) => { const p = PERIODS.find((x) => x.id === e.target.value) ?? PERIODS[0]; set({ period: { from: p.from, to: p.to } }) }}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">North</span>
            <select className={sel} value={presets.north} onChange={(e) => set({ north: e.target.value as DaylightPresets['north'] })}>
              <option value="true">True north{project === 'vtc' ? ' (45° from the grid)' : ''}</option><option value="model">Model grid as north (as her app)</option>
            </select></label>
          {project === 'vtc' && (
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={presets.future} onChange={(e) => set({ future: e.target.checked })} className="accent-accent" /><span>Count the three future towers</span></label>
          )}
        </div>
        {edited && <p className="mt-1 text-meta text-amber-800">Edited presets (your own team assumption).</p>}
        <p className="mt-2 text-meta text-muted">Engine: <a href={SRC.engine.url} target="_blank" rel="noreferrer" className="hover:text-accent">Sun &amp; Wind Studio, Sinnie Choi</a> · weather: CWEC2020 Vancouver Intl AP, hourly, as her app loads it.</p>
      </Section>
    </div>
  )
}
