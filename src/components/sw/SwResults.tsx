// Results of the Sun & Wind Studio tools: the key readings first, as a row each (the Studio's Key results panel: short,
// visual, the detail in the hover text), then the tool's own drawing. Sinnie finds the Studio text-heavy, so captions
// stay to one line.
import { useMemo, useRef, type ReactNode } from 'react'
import { aseFloor, daylightFloor } from '../../engine/sw/daylight'
import { zonesOf } from '../../engine/sw/plate'
import type { RuleResult } from '../../engine/types'
import { svgImage } from '../../lib/sheetAdd'
import { useSwInputs } from '../../lib/swInputs'
import { isSw, planFloor, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import { useStore, useTowers } from '../../store'
import SheetButton from '../SheetButton'
import { StateChip } from '../ui'
import FloorPlan, { RAMPS, RampKey } from './FloorPlan'
import { InteriorDrawings } from './SwInteriorResults'

export function KeyRows({ rules }: { rules: RuleResult[] }) {
  return (
    <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-testid="sw-key">
      {rules.map((r) => (
        <li key={r.id} className="flex min-w-0 items-center gap-2 rounded-md border border-line px-2 py-1.5" title={[r.threshold && `Needs ${r.threshold}`, r.note].filter(Boolean).join('. ')}>
          <span className="min-w-0 flex-1 truncate text-meta text-ink">{r.label}</span>
          <b className="shrink-0 text-meta tabular-nums text-ink">{r.value}</b>
          <StateChip state={r.state} value={r.value} />
        </li>
      ))}
    </ul>
  )
}

export function SwFig({ title, caption, children, sheet = true }: { title: string; caption?: string; children: ReactNode; sheet?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <figure ref={ref} className="m-0 grid gap-1">
      <figcaption className="flex items-center justify-between gap-2 text-meta font-semibold text-ink">{title}
        {sheet && <SheetButton compact label={title} make={async () => {
          const svgs = Array.from(ref.current?.querySelectorAll('svg') ?? []).filter((s) => s.viewBox.baseVal?.width && !s.closest('button') && !s.closest('[data-testid=plan-key]')) as SVGSVGElement[]
          return svgs.length ? svgImage(svgs, title, caption ?? '') : null
        }} />}
      </figcaption>
      {children}
      {caption && <p className="text-meta leading-snug text-muted">{caption}</p>}
    </figure>
  )
}

/** Level stepper for the interior studies (the Studio's plan level). */
export function LevelPick({ levels }: { levels: number }) {
  const level = useSwStudy((s) => s.level)
  const set = useSwStudy((s) => s.set)
  const L = Math.max(1, Math.min(levels, level ?? Math.round(levels * 0.55)))
  return (
    <label className="flex items-center gap-2 text-meta text-muted">Level
      <input type="range" min={1} max={levels} value={L} onChange={(e) => set({ level: Number(e.target.value) })} className="flex-1" data-testid="sw-level" aria-label="Floor level" />
      <b className="w-8 text-right tabular-nums text-ink">{L}</b>
    </label>
  )
}

/** Bars by floor (the Studio's floorBars): one bar per level, a dashed line at the target. */
export function FloorBars({ rows, max = 1, mark, color, fmt, label }: { rows: { level: number; v: number }[]; max?: number; mark?: number; color: string; fmt: (v: number) => string; label: string }) {
  const W = 300, H = 90, L = 26, B = 14, n = Math.max(1, rows.length), bw = (W - L - 4) / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={L} x2={W - 4} y1={4 + (H - 4 - B) * (1 - t)} y2={4 + (H - 4 - B) * (1 - t)} stroke="#eef0f3" /><text x={L - 3} y={7 + (H - 4 - B) * (1 - t)} fontSize={8} textAnchor="end" fill="#6b7280">{fmt(max * t)}</text></g>)}
      {rows.map((r, i) => { const h = (H - 4 - B) * Math.max(0, Math.min(1, r.v / max)); return <rect key={i} x={L + i * bw} y={H - B - h} width={Math.max(0.6, bw - 0.6)} height={h} fill={color}><title>{`L${r.level}: ${fmt(r.v)}`}</title></rect> })}
      {mark != null && <line x1={L} x2={W - 4} y1={4 + (H - 4 - B) * (1 - mark / max)} y2={4 + (H - 4 - B) * (1 - mark / max)} stroke="#c27c0e" strokeDasharray="3 2" />}
      <text x={L} y={H - 3} fontSize={8} fill="#6b7280">L{rows[0]?.level ?? 1}</text><text x={W - 4} y={H - 3} fontSize={8} textAnchor="end" fill="#6b7280">L{rows[rows.length - 1]?.level ?? 1}</text>
    </svg>
  )
}

/** Daylight plans of one floor at full resolution (sDA, DF or ASE), computed for the level shown. */
export function DaylightPlanFig({ layer }: { layer: 'da' | 'df' | 'ase' }) {
  const inp = useSwInputs()
  const s = useSwStudy()
  const pf = useMemo(() => planFloor(inp, s), [inp, s.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => {
    if (!pf) return null
    const zones = zonesOf(pf.t)
    if (layer === 'ase') { const a = aseFloor(pf.f, zones, inp.C, undefined, { ctx: inp.ctxBlocks }); return { grid: a.grid, values: a.hrs, read: `${Math.round(a.pctOver * 100)}% over 250 h` } }
    const d = daylightFloor(pf.f, zones, inp.C, { step: 1, hs: 2, target: s.dlTarget, blinds: s.blinds, ctx: inp.ctxBlocks })
    return layer === 'da' ? { grid: d.grid, values: d.da, read: `sDA ${Math.round(d.pctLit * 100)}%` } : { grid: d.grid, values: d.df, read: `mean DF ${(d.mean * 100).toFixed(1)}%` }
  }, [pf, inp.C, inp.ctxBlocks, s.dlTarget, s.blinds, layer])
  if (!pf || !res) return null
  const ramp = RAMPS[layer]
  const zones = zonesOf(pf.t)
  return (
    <SwFig title={`Level ${pf.f.level} · ${layer === 'da' ? 'daylight autonomy' : layer === 'df' ? 'daylight factor' : 'annual sun exposure'}`} caption={`${res.read}. Edge colour: face; solid: operable.`}>
      <LevelPick levels={pf.levels} />
      <FloorPlan f={pf.f} zones={zones} grid={res.grid} values={res.values} ramp={ramp} label={`Level ${pf.f.level} plan`} />
      <RampKey ramp={ramp} />
    </SwFig>
  )
}

function DaylightBody({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  type Per = { dl: { rows: { level: number; pctLit: number; mean: number }[] }; ase?: { rows: { level: number; pct: number }[] } }[]
  const per = (out?.data.per as Per | undefined) ?? []
  const first = per[0]
  if (id === 'built.sw-daylight') return (
    <>
      {first && <SwFig title="Daylight autonomy by floor" caption="Share of each floor over the target half the occupied hours; dashed: LEED 55%.">
        <FloorBars label="sDA by floor" rows={first.dl.rows.map((r) => ({ level: r.level, v: r.pctLit }))} mark={0.55} color="#d9a400" fmt={(v) => `${Math.round(v * 100)}%`} />
      </SwFig>}
      <DaylightPlanFig layer="da" />
      <DaylightPlanFig layer="ase" />
    </>
  )
  return (
    <>
      {first && <SwFig title="Daylight factor by floor" caption="Mean daylight factor of each floor; dashed: 2%.">
        <FloorBars label="Daylight factor by floor" rows={first.dl.rows.map((r) => ({ level: r.level, v: r.mean }))} max={Math.max(0.05, ...first.dl.rows.map((r) => r.mean))} mark={0.02} color="#6f8fb5" fmt={(v) => `${(v * 100).toFixed(1)}%`} />
      </SwFig>}
      <DaylightPlanFig layer="df" />
    </>
  )
}

export function LightHourBody() {
  const out = useSwOut((s) => s.out['built.sw-light-hour'])
  const s = useSwStudy()
  type L = { lux: Float32Array; grid: { x0: number; y0: number; h: number; nx: number; ny: number }; alt: number; az: number; sunUp: boolean; over300: number; over3000: number }
  const d = out?.data as { L?: L; pf?: { t: Parameters<typeof zonesOf>[0]; f: Parameters<typeof FloorPlan>[0]['f']; levels: number } } | undefined
  if (!d?.L || !d.pf) return null
  return (
    <SwFig title={`Level ${d.pf.f.level} · light at ${s.hour}:00, ${s.day}/${s.month + 1}`} caption={d.L.sunUp ? `Sun ${Math.round(d.L.alt)}° high, ${Math.round(d.L.az)}° az. ${Math.round(d.L.over3000 * 100)}% of the floor over 3,000 lux.` : 'The sun is down.'}>
      <LevelPick levels={d.pf.levels} />
      <FloorPlan f={d.pf.f} zones={zonesOf(d.pf.t)} grid={d.L.grid} values={d.L.lux} ramp={RAMPS.lux} label="Lux plan" />
      <RampKey ramp={RAMPS.lux} />
    </SwFig>
  )
}

function WindHeightBody() {
  const out = useSwOut((s) => s.out['built.sw-wind-height'])
  const rows = (out?.data.rows as { tower: string; z: number; u: number; band: number }[] | undefined) ?? []
  const COL = ['#3f8f6b', '#86b86a', '#e3c35a', '#e08a3c', '#c53030'], NAME = ['sitting', 'standing', 'strolling', 'walking', 'uncomfortable']
  if (!rows.length) return null
  return (
    <SwFig title="Mean wind on each roof and terrace" caption="Season mean at each level by the power law; colour: Lawson band.">
      <FloorBars label="Wind by deck" rows={rows.map((r) => ({ level: Math.round(r.z), v: r.u }))} max={Math.max(8, ...rows.map((r) => r.u))} mark={6} color="#1e9e8e" fmt={(v) => `${v.toFixed(0)} m/s`} />
      <div className="flex flex-wrap gap-2 text-meta text-muted">{rows.slice(-5).map((r, i) => <span key={i}><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COL[r.band] }} />{Math.round(r.z)} m · {r.u.toFixed(1)} m/s · {NAME[r.band]}</span>)}</div>
    </SwFig>
  )
}

/** The panel for the picked tool (none for other checks). */
export default function SwResults() {
  const node = useStore((s) => s.selectedNode)
  const out = useSwOut((s) => (isSw(node) ? s.out[node] : undefined))
  const busy = useSwOut((s) => (isSw(node) ? !!s.busy[node] : false))
  const err = useSwOut((s) => (isSw(node) ? s.errors[node] : undefined))
  const towers = useTowers().length
  if (!isSw(node)) return null
  return (
    <section aria-label="Key results" data-testid="sw-results" data-node={node} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-b border-line px-4 py-3">
      <h3 className="flex items-center justify-between text-control font-semibold text-ink">Key results {busy && <span className="text-meta font-normal text-muted" role="status">Running…</span>}</h3>
      {!towers ? <p className="text-meta text-muted">Place or draw a tower first.</p>
        : err ? <p className="text-meta text-red-700">This study stopped: {err}</p>
          : out ? (out.rules.length ? <KeyRows rules={out.rules} /> : <p className="text-meta text-muted">Nothing to read yet.</p>)
            : <p className="text-meta text-muted" role="status">Working…</p>}
      {out && (node === 'built.sw-daylight' || node === 'built.sw-daylight-factor') && <DaylightBody id={node} />}
      {out && node === 'built.sw-light-hour' && <LightHourBody />}
      {out && node === 'built.sw-wind-height' && <WindHeightBody />}
      {out && <InteriorDrawings id={node} />}
    </section>
  )
}
