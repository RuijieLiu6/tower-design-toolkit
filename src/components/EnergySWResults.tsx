// Results of the energy node (a port of Sinnie Choi's Sun & Wind Studio hourly 5R1C model, engine/energySW.ts): the run's
// status, TEUI / TEDI / GHGI against her program-weighted targets, the end uses month by month, each program's intensity,
// where the heat goes, the evidence lines with their sources and flags, and the presets (her envelope and systems).
// An early-design proxy, as her own note says: compliance needs an energy model to the City's guidelines.
import { RotateCcw, Zap } from './icons'
import type { RuleResult } from '../engine/types'
import { USES, type UseKey } from '../engine/energySW'
import { DEFAULT_ENERGY_PRESETS, SRC, type EnergyPresets } from '../engine/energySWInput'
import { useEnergySW, useEnergySWStore } from '../hooks/useEnergySW'
import { useStore } from '../store'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'

const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'
/** End-use colours (her --s1..--s6 order: heating, cooling, lighting, plug, hot water, fans). */
const USE_COL: Record<UseKey, string> = { heat: '#C8553D', cool: '#3E7CB1', light: '#E3B341', equip: '#7A6F9B', dhw: '#D98E73', aux: '#8A9A5B' }
const LOSS_COL = { glass: '#5B8FC9', wall: '#A0857A', roof: '#7C6A8E', vent: '#3FA7A0', infil: '#B7C3CE' }
const MONTH = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const PROG: Record<string, string> = { office: 'Office', studio: 'Studio', retail: 'Retail', hotel: 'Hotel', resi: 'Homes', public: 'Public & amenity', amenity: 'Open amenity', observation: 'Observation', boh: 'Back of house', mep: 'Plant (unconditioned)' }

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

function Tile({ label, v, t, unit, d = 0 }: { label: string; v: number; t: number; unit: string; d?: number }) {
  const ok = v <= t * 1.001
  return (
    <div className="rounded-md border border-line p-1.5">
      <div className="text-meta text-muted">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${ok ? 'text-ink' : 'text-red-700'}`}>{v.toFixed(d)}</div>
      <div className="text-meta text-muted">≤ {t.toFixed(d)} {unit}</div>
      <div aria-hidden className="mt-1 h-1.5 w-full overflow-hidden rounded bg-subtle"><div className={`h-full ${ok ? 'bg-emerald-600' : 'bg-red-600'}`} style={{ width: `${Math.min(100, (v / Math.max(1e-9, t * 1.5)) * 100)}%` }} /></div>
    </div>
  )
}

/** Her monthly chart: end uses stacked per month, kWh per m² of floor. */
function Monthly({ monthly, gfa }: { monthly: Record<UseKey, number[]>; gfa: number }) {
  const W = 380, H = 110, L = 28, R = 6, T = 6, B = 14, bw = (W - L - R) / 12, ph = H - T - B
  const tot = MONTH.map((_, m) => USES.reduce((s, [k]) => s + monthly[k][m], 0) / gfa)
  const ymax = Math.max(1, ...tot) * 1.1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Energy by end use and month, kWh per m²" className="w-full">
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={T + ph * (1 - v)} y2={T + ph * (1 - v)} stroke="currentColor" className="text-line" /><text x={L - 3} y={T + ph * (1 - v) + 3} textAnchor="end" fontSize={8.5} className="fill-current text-muted">{(ymax * v).toFixed(1)}</text></g>)}
      {MONTH.map((mn, m) => {
        let acc = 0
        return (
          <g key={m}>
            {USES.map(([k, w]) => { const v = monthly[k][m] / gfa; const h = (v / ymax) * ph; const y = T + ph - ((acc + v) / ymax) * ph; acc += v; return <rect key={k} x={L + m * bw + 2} y={y} width={bw - 4} height={Math.max(0, h)} fill={USE_COL[k]}><title>{`${w}, ${mn}: ${v.toFixed(2)} kWh/m²`}</title></rect> })}
            <text x={L + m * bw + bw / 2} y={H - 3} textAnchor="middle" fontSize={8.5} className="fill-current text-muted">{mn}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function EnergySWResults() {
  const { presets, status, progress, error, out, runRev, outRev, set, reset, on } = useEnergySW()
  const project = useStore((s) => s.project)
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  const edited = JSON.stringify(presets) !== JSON.stringify(DEFAULT_ENERGY_PRESETS)
  const stale = !!out && outRev !== runRev
  const rerun = () => { useEnergySWStore.setState({ key: '' }); useEnergySWStore.getState().set({}) }
  const statusWord = status === 'running' ? (stale ? `Model changed, rerunning · ${progress || 'working…'}` : progress || 'Working…')
    : status === 'ready' ? (stale ? 'Model changed, rerunning' : 'Evaluated for the current model')
    : status === 'error' ? `Could not run: ${error}` : on ? 'Waiting for the model' : 'Off'
  const statusState = status === 'error' ? 'fail' : status === 'ready' && !stale ? 'pass' : 'unknown'
  const r = out?.result
  const loss = r ? (() => { const g = r.gfa || 1; const rows = [
    ...(['N', 'E', 'S', 'W'] as const).map((o) => ({ label: `Windows ${o}`, v: r.loss.glass[o] / g, c: LOSS_COL.glass })),
    ...(['N', 'E', 'S', 'W'] as const).map((o) => ({ label: `Walls ${o}`, v: r.loss.wall[o] / g, c: LOSS_COL.wall })),
    { label: 'Roofs and soffits', v: r.loss.roof / g, c: LOSS_COL.roof }, { label: 'Outdoor air (after recovery)', v: r.loss.vent / g, c: LOSS_COL.vent }, { label: 'Infiltration', v: r.loss.infil / g, c: LOSS_COL.infil }]
    const mx = Math.max(1e-9, ...rows.map((x) => x.v)); return { rows, mx } })() : null
  const num = (label: string, k: keyof EnergyPresets, unit: string, step: number, min: number, max: number, hint?: string) => (
    <NumberField label={label} value={presets[k] as number} unit={unit} step={step} min={min} max={max} onChange={(v) => set({ [k]: Math.max(min, Math.min(max, v)) } as Partial<EnergyPresets>)} hint={hint} />
  )
  return (
    <div data-testid="energy-sw-card">
      <Section title="Results">
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-meta text-amber-950"><Zap size={14} className="mt-0.5 shrink-0" /><span><b>Indicative, early design.</b> An hourly 5R1C balance per program, as Sun &amp; Wind Studio computes it; the City's targets need an energy model to its guidelines.</span></div>
        <div data-testid="energy-sw-status" className="flex items-center justify-between gap-2 rounded-md border border-line p-2">
          <div className="min-w-0">
            <div className="text-meta text-muted">Run</div>
            <div className="truncate text-xs font-semibold" title={statusWord}>{statusWord}</div>
            {out && r && <div className="text-meta text-muted">{out.towerName} · {out.levels.length} floors, {Math.round(r.gfa).toLocaleString('en-CA')} m² · {out.dimmed ? 'daylight dimming' : 'no dimming'}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StateChip state={statusState} value={status === 'running' ? 'Running' : status === 'idle' ? 'Idle' : undefined} />
            <button type="button" data-testid="energy-sw-run" onClick={rerun} disabled={status === 'running'} className={`h-7 rounded-lg bg-panel px-2 text-control text-ink disabled:opacity-50 ${focusRing}`}>Run again</button>
          </div>
        </div>
        {r && (
          <>
            <div data-testid="energy-sw-key" className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Tile label="TEUI" v={r.teui} t={r.tgt.teui} unit="kWh/m²" />
              <Tile label="TEDI" v={r.tedi} t={r.tgt.tedi} unit="kWh/m²" d={1} />
              <Tile label="GHGI" v={r.ghgi} t={r.tgt.ghgi} unit="kg/m²" d={2} />
            </div>
            <figure data-testid="energy-sw-monthly" className="m-0 mt-2 grid gap-1">
              <figcaption className="text-meta"><b className="font-semibold text-ink">By month</b> <span className="text-muted">· energy at the meter, kWh per m² of floor</span></figcaption>
              <Monthly monthly={r.monthly} gfa={r.gfa} />
              <div role="list" className="flex flex-wrap gap-x-2.5 gap-y-1 text-meta">{USES.map(([k, w]) => <span key={k} role="listitem" className="flex items-center gap-1"><i aria-hidden className="inline-block h-3 w-3 rounded-[3px]" style={{ background: USE_COL[k] }} />{w} {Math.round((r.uses[k] / Math.max(1, r.total)) * 100)}%</span>)}</div>
            </figure>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[300px] text-meta">
                <thead><tr className="text-left text-muted"><th className="py-0.5 font-medium">Program</th><th className="text-right font-medium">Floors</th><th className="text-right font-medium">TEUI</th><th className="text-right font-medium">TEDI</th><th className="text-right font-medium">GHGI</th></tr></thead>
                <tbody>{r.rows.map((x) => <tr key={x.p} className="border-t border-line/60"><td className="py-0.5 font-medium">{PROG[x.p] ?? x.p}</td><td className="text-right tabular-nums">{x.floors}</td><td className="text-right tabular-nums">{x.teui.toFixed(0)}</td><td className="text-right tabular-nums">{x.tediI.toFixed(1)}</td><td className="text-right tabular-nums">{x.ghgi.toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
            {loss && (
              <figure data-testid="energy-sw-loss" className="m-0 mt-2 grid gap-0.5">
                <figcaption className="text-meta"><b className="font-semibold text-ink">Where the heat goes</b> <span className="text-muted">· kWh per m² of floor a year, every hour the inside is warmer</span></figcaption>
                {loss.rows.map((x) => (
                  <div key={x.label} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-1.5 text-meta">
                    <span className="truncate text-muted">{x.label}</span>
                    <span className="h-2.5 rounded-[2px]" style={{ width: `${(x.v / loss.mx) * 100}%`, background: x.c }} />
                    <span className="text-right tabular-nums">{x.v.toFixed(1)}</span>
                  </div>
                ))}
              </figure>
            )}
          </>
        )}
      </Section>

      {out && (
        <Section title="Rules">
          <div className="grid gap-2">{out.rules.map((x) => <Card key={x.id} r={x} />)}</div>
          <p className="mt-2 text-meta text-muted">The Energy &amp; carbon node holds the VBBL and Higher Buildings Policy limits, embodied carbon and PV; this node models the hourly energy itself.</p>
        </Section>
      )}

      <Section title="Presets (team assumptions)" right={edited ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="mb-2 flex flex-wrap items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-muted">Her envelope and systems as defaults; floors, plates and program come from the model.</span></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Heating and hot water</span>
            <select data-testid="energy-sw-heat" className={sel} value={presets.heat} onChange={(e) => set({ heat: e.target.value as EnergyPresets['heat'] })}>
              <option value="hp">Air-source heat pump</option><option value="gas">Gas boiler</option><option value="res">Electric resistance</option>
            </select></label>
          {num('Cooling COP', 'cop', '', 0.25, 2.5, 5)}
          {num('Glazing U', 'glazU', 'W/m²K', 0.1, 0.6, 3)}
          {num('Wall U', 'wallU', 'W/m²K', 0.02, 0.1, 0.6)}
          {num('Roof U', 'roofU', 'W/m²K', 0.02, 0.1, 0.4)}
          {num('Infiltration', 'infil', 'ach', 0.05, 0.05, 0.6)}
          {num('Outdoor air', 'vent', 'L/s·m²', 0.05, 0.15, 0.8)}
          {num('Heat recovery', 'hr', '', 0.05, 0, 0.9, 'Share of the outdoor-air heat recovered (0–0.9).')}
          {num('Heating set point', 'setH', '°C', 0.5, 18, 23)}
          {num('Cooling set point', 'setC', '°C', 0.5, 23, 27)}
          {num('Lighting', 'lpd', 'W/m²', 0.5, 3, 14)}
          {num('Plug loads', 'equip', 'W/m²', 0.5, 3, 20)}
          {num('Sun reaching the facade', 'shade', '', 0.05, 0.5, 1, 'Share of the solar gain left after the context shades the facade.')}
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Thermal mass</span>
            <select className={sel} value={presets.mass} onChange={(e) => set({ mass: e.target.value as EnergyPresets['mass'] })}><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option></select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Glazing</span>
            <select className={sel} value={presets.glazing} onChange={(e) => set({ glazing: e.target.value as EnergyPresets['glazing'] })}><option value="auto">Facade node when on, else her defaults</option><option value="studio">Her default facade zones</option></select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">North</span>
            <select className={sel} value={presets.north} onChange={(e) => set({ north: e.target.value as EnergyPresets['north'] })}><option value="true">True north</option><option value="model">Model grid as north (as her app)</option></select></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={presets.dimming} onChange={(e) => set({ dimming: e.target.checked })} className="accent-accent" /><span>Daylight dimming (runs the daylight port)</span></label>
          {project === 'vtc' && presets.dimming && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={presets.future} onChange={(e) => set({ future: e.target.checked })} className="accent-accent" /><span>Count the three future towers</span></label>}
        </div>
        {edited && <p className="mt-1 text-meta text-amber-800">Edited presets (your own team assumption).</p>}
        <p className="mt-2 text-meta text-muted">Engine: <a href={SRC.engine.url} target="_blank" rel="noreferrer" className="hover:text-accent">Sun &amp; Wind Studio, Sinnie Choi</a> · weather: CWEC2020 Vancouver Intl AP, hourly.</p>
      </Section>
    </div>
  )
}
