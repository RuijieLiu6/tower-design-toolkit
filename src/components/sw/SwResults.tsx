// Results of the Sun & Wind Studio tools: the key readings first, as a visual row each (the Studio's Key results panel:
// a bar against the passing range, the detail in the hover text), then the tool's main drawings, then the secondary
// figures in folded sections. Sinnie finds the Studio text-heavy, so captions stay to one line.
import { useMemo, useRef, type ReactNode } from 'react'
import { aseFloor, daylightFloor, type AseTower, type DaylightFloor, type DaylightTower } from '../../engine/sw/daylight'
import { temporalMaps } from '../../engine/sw/detail'
import { floorSig, zonesOf } from '../../engine/sw/plate'
import type { RuleResult } from '../../engine/types'
import { svgImage } from '../../lib/sheetAdd'
import { useSwInputs, type SwInputs } from '../../lib/swInputs'
import { isSw, planFloor, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import { useStore, useTowers } from '../../store'
import { KeyList, ruleKey } from '../ResultViz'
import SheetButton from '../SheetButton'
import FloorPlan, { RAMPS, RampKey } from './FloorPlan'
import { Chips, FloorStack, Fold, Gauge, GRID, HeatMap, INK, MonthStack, OK_C, RAMP, StackRows, SUN_C, Tx } from './SwCharts'
import { ExteriorDrawings } from './SwExterior'
import { InteriorDrawings, InteriorMore } from './SwInteriorResults'

/** The plain rows the tools had before the visual ones (kept for callers that only have rule lines). */
export function KeyRows({ rules }: { rules: RuleResult[] }) {
  return <div data-testid="sw-key"><KeyList keys={rules.map(ruleKey)} /></div>
}

/** A figure: a short title, the drawing, a caption of one line at most; `tip` is the longer explanation, on hover. */
export function SwFig({ title, caption, tip, children, sheet = true }: { title: string; caption?: string; tip?: string; children: ReactNode; sheet?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <figure ref={ref} className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-fig={title}>
      <figcaption className="flex items-center justify-between gap-2 text-meta font-semibold text-ink"><span className="min-w-0 truncate" title={tip ?? title}>{title}</span>
        {sheet && <SheetButton compact label={title} make={async () => {
          const svgs = Array.from(ref.current?.querySelectorAll('svg') ?? []).filter((s) => s.viewBox.baseVal?.width && !s.closest('button') && !s.closest('[data-testid=plan-key]')) as SVGSVGElement[]
          return svgs.length ? svgImage(svgs, title, tip ?? caption ?? '') : null
        }} />}
      </figcaption>
      {children}
      {caption && <p className="truncate text-meta leading-snug text-muted" title={tip ?? caption}>{caption}</p>}
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
export function FloorBars({ rows, max = 1, mark, color, fmt, label }: { rows: { level: number; v: number; color?: string; tip?: string }[]; max?: number; mark?: number; color: string; fmt: (v: number) => string; label: string }) {
  const W = 300, H = 90, L = 26, B = 14, n = Math.max(1, rows.length), bw = (W - L - 4) / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={L} x2={W - 4} y1={4 + (H - 4 - B) * (1 - t)} y2={4 + (H - 4 - B) * (1 - t)} stroke="#eef0f3" /><text x={L - 3} y={7 + (H - 4 - B) * (1 - t)} fontSize={8} textAnchor="end" fill="#6b7280">{fmt(max * t)}</text></g>)}
      {rows.map((r, i) => { const h = (H - 4 - B) * Math.max(0, Math.min(1, r.v / max)); return <rect key={i} x={L + i * bw} y={H - B - h} width={Math.max(0.6, bw - 0.6)} height={h} fill={r.color ?? color}><title>{r.tip ?? `L${r.level}: ${fmt(r.v)}`}</title></rect> })}
      {mark != null && <line x1={L} x2={W - 4} y1={4 + (H - 4 - B) * (1 - mark / max)} y2={4 + (H - 4 - B) * (1 - mark / max)} stroke="#c27c0e" strokeDasharray="3 2" />}
      <text x={L} y={H - 3} fontSize={8} fill="#6b7280">L{rows[0]?.level ?? 1}</text><text x={W - 4} y={H - 3} fontSize={8} textAnchor="end" fill="#6b7280">L{rows[rows.length - 1]?.level ?? 1}</text>
    </svg>
  )
}

// One full-resolution daylight run of the floor shown, shared by the plan and the maps of the year.
let dlMemo: { key: string; C: unknown; val: DaylightFloor } | null = null
function planDaylight(pf: NonNullable<ReturnType<typeof planFloor>>, inp: SwInputs, target: number, blinds: boolean): DaylightFloor {
  const zones = zonesOf(pf.t), key = floorSig(pf.f, zones, `${pf.f.level}|${target}|${blinds}|${inp.ctxBlocks.length}`)
  if (dlMemo && dlMemo.key === key && dlMemo.C === inp.C) return dlMemo.val
  const val = daylightFloor(pf.f, zones, inp.C, { step: 1, hs: 2, target, blinds, ctx: inp.ctxBlocks })
  dlMemo = { key, C: inp.C, val }
  return val
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
    const d = planDaylight(pf, inp, s.dlTarget, s.blinds)
    return layer === 'da' ? { grid: d.grid, values: d.da, read: `sDA ${Math.round(d.pctLit * 100)}%` } : { grid: d.grid, values: d.df, read: `mean DF ${(d.mean * 100).toFixed(1)}%` }
  }, [pf, inp, s.dlTarget, s.blinds, layer])
  if (!pf || !res) return null
  const ramp = RAMPS[layer]
  const zones = zonesOf(pf.t)
  return (
    <SwFig title={`L${pf.f.level} · ${layer === 'da' ? 'daylight autonomy' : layer === 'df' ? 'daylight factor' : 'sun exposure'}`} caption={`${res.read}. Solid edge: operable.`} tip="Edge colour: the face it looks to. Solid edge: operable windows; dashed: fixed.">
      <LevelPick levels={pf.levels} />
      <FloorPlan f={pf.f} zones={zones} grid={res.grid} values={res.values} ramp={ramp} label={`Level ${pf.f.level} plan`} />
      <RampKey ramp={ramp} />
    </SwFig>
  )
}

/** The floor shown through the year (study.js temporalSVG): one map each for daylight, direct sun and blinds. */
function DaylightYear() {
  const inp = useSwInputs()
  const s = useSwStudy()
  const pf = useMemo(() => planFloor(inp, s), [inp, s.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const M = useMemo(() => {
    if (!pf || !inp.C) return null
    const d = planDaylight(pf, inp, s.dlTarget, s.blinds)
    return d.temporal ? temporalMaps(d.temporal, inp.C) : null
  }, [pf, inp, s.dlTarget, s.blinds])
  if (!pf || !M) return null
  const rt: [number, string][] = [[0, '8h'], [5, '13h'], [9, '17h']], pct = (v: number) => `${Math.round(v * 100)}%`, lv = `L${pf.f.level}`
  return (
    <>
      <LevelPick levels={pf.levels} />
      <SwFig title={`${lv} · floor at ${s.dlTarget} lux`} caption="Column: day. Row: occupied hour." tip="Each column a day, each row an occupied hour.">
        <HeatMap cols={M.nd} rows={M.nh} values={M.sda} color={RAMP.da} label={`Share of level ${pf.f.level} at the daylight target through the year`} rowTicks={rt} legend={[[0, '0'], [0.5, '50'], [1, '100%']]} read={pct} />
      </SwFig>
      <SwFig title={`${lv} · floor in direct sun`} caption="Over 1,000 lux: when blinds are wanted." tip="Where the low sun reaches in: the hours blinds are wanted.">
        <HeatMap cols={M.nd} rows={M.nh} values={M.sun} color={RAMP.sun} label={`Share of level ${pf.f.level} in direct sun through the year`} rowTicks={rt} legend={[[0, '0'], [0.15, '15'], [0.3, '30%+']]} read={pct} />
      </SwFig>
      {M.blind && <SwFig title={`${lv} · blinds down`} caption="Share of glazing with blinds down (LM-83)." tip="Blinds come down when over 2% of the floor gets direct sun (LM-83).">
        <HeatMap cols={M.nd} rows={M.nh} values={M.blind} color={RAMP.grey} label={`Share of the glazing of level ${pf.f.level} with blinds down through the year`} rowTicks={rt} legend={[[0, '0'], [0.5, '50'], [1, '100%']]} read={pct} />
      </SwFig>}
    </>
  )
}

const EN_COL = ['#cfd4da', '#f2cd78', SUN_C, '#7a2e8e'], EN_NAME = ['not met', 'minimum', 'medium', 'high']
type DlPer = { dl: DaylightTower; ase?: AseTower }[]

/** EN 17037 level of each floor, and the share of floor area at each level. */
function EnLevels({ dl }: { dl: DaylightTower }) {
  const A = dl.rows.reduce((a, r) => a + r.area, 0) || 1
  const parts = [0, 1, 2, 3].map((l) => dl.rows.reduce((a, r) => a + ((r.en ?? 0) === l ? r.area : 0), 0) / A)
  return (
    <SwFig title="EN 17037 level by floor" caption="Level of each floor; share of floor area." tip="Bar height: the level each floor reaches; below, the share of floor area.">
      <FloorBars label="EN 17037 daylight provision level by floor" max={3} color={SUN_C} fmt={(v) => (v >= 3 ? 'high' : v > 0 ? 'med' : '–')} rows={dl.rows.map((r) => ({ level: r.level, v: Math.max(0.12, r.en ?? 0), color: EN_COL[r.en ?? 0], tip: `L${r.level}: ${EN_NAME[r.en ?? 0]}` }))} />
      <StackRows label="Share of floor area at each EN 17037 level" labelW={52} rows={[{ label: 'Floor area', parts }]} colors={EN_COL} names={EN_NAME} />
      <Chips items={EN_NAME.map((n, i) => ({ name: n, color: EN_COL[i] }))} />
    </SwFig>
  )
}
function Udi({ dl }: { dl: DaylightTower }) {
  const cols = [GRID, SUN_C, '#B8362B'], names = ['under 100 lux', 'useful 100–3,000', 'over 3,000 lux']
  return (
    <SwFig title="Useful daylight by floor" caption="Share of occupied hours in each range." tip="Share of occupied hours: too dark, useful, or so bright blinds come down.">
      <FloorStack label="Useful daylight illuminance by floor" rows={dl.rows.map((r) => ({ level: r.level, parts: [r.udiS, r.udiU, r.udiE] }))} colors={cols} names={names} />
      <Chips items={names.map((n, i) => ({ name: n, color: i ? cols[i] : '#cfd4da' }))} />
    </SwFig>
  )
}
/** LEED points as three pips over the sDA gauge. */
function LeedPoints({ sda, ase, pts, target }: { sda: number; ase: number; pts: number; target: number }) {
  return (
    <SwFig title="LEED EQ Daylight" caption="Points at 40, 55, 75% sDA; ASE up to 10%." tip={`sDA${target}/50% earns 1, 2 or 3 points at 40, 55 and 75% of the floor; ASE1000/250h at most 10%, or show glare control.`}>
      <svg viewBox="0 0 300 30" width="100%" role="img" aria-label={`${pts} of 3 LEED daylight points; sunlight exposure ${ase <= 0.1 ? 'within' : 'over'} the 10% limit`}>
        {[1, 2, 3].map((p) => <g key={p}><circle cx={20 + (p - 1) * 30} cy={15} r={11} fill={p <= pts ? OK_C : '#fff'} stroke={p <= pts ? OK_C : '#cfd4da'} strokeWidth={1.5}><title>{`Point ${p}: sDA of ${[40, 55, 75][p - 1]}% or more`}</title></circle><text x={20 + (p - 1) * 30} y={19} textAnchor="middle" fontSize={11} fontWeight={600} fill={p <= pts ? '#fff' : '#9aa1aa'} pointerEvents="none">{p}</text></g>)}
        <Tx x={108} y={19} k size={10}>{pts} of 3 points</Tx>
        <circle cx={222} cy={15} r={11} fill={ase <= 0.1 ? OK_C : '#c27c0e'}><title>{`ASE ${Math.round(ase * 100)}%: ${ase <= 0.1 ? 'within the 10% limit' : 'over 10%, show glare control'}`}</title></circle>
        <text x={222} y={19} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff" pointerEvents="none">{ase <= 0.1 ? '✓' : '!'}</text>
        <Tx x={238} y={19} k size={10}>ASE {Math.round(ase * 100)}%</Tx>
      </svg>
      <Gauge v={sda} good="high" label="Spatial daylight autonomy against the LEED bands" read={`sDA ${Math.round(sda * 100)}%`} marks={[{ v: 0.4, label: '1 pt · 40%' }, { v: 0.55, label: '2 · 55%' }, { v: 0.75, label: '3 pts · 75%' }]} />
    </SwFig>
  )
}

function DaylightBody({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  const s = useSwStudy()
  const per = (out?.data.per as DlPer | undefined) ?? []
  const first = per[0]
  if (!first) return null
  const dl = first.dl, A = dl.rows.reduce((a, r) => a + r.area, 0) || 1
  const dsf = Array.from({ length: 12 }, (_, m) => dl.rows.reduce((a, r) => a + (r.dsf?.[m] ?? 0) * r.area, 0) / A)
  const hasEn = dl.rows.some((r) => r.en != null)
  if (id === 'built.sw-daylight') return (
    <>
      <LeedPoints sda={out!.data.sda as number} ase={out!.data.ase as number} pts={(out!.data.pts as number) ?? 0} target={s.dlTarget} />
      <SwFig title="Daylight autonomy by floor" caption="Share of each floor. Dashed: LEED 55%." tip="Share of each floor over the target half the occupied hours; dashed: LEED 55%.">
        <FloorBars label="sDA by floor" rows={dl.rows.map((r) => ({ level: r.level, v: r.pctLit }))} mark={0.55} color="#d9a400" fmt={(v) => `${Math.round(v * 100)}%`} />
      </SwFig>
      <DaylightPlanFig layer="da" />
      <Fold title="Through the year"><DaylightYear /></Fold>
      <Fold title="Useful daylight">
        <Udi dl={dl} />
        <SwFig title="Daylight share by month" caption="Lighting need covered by daylight." tip="Share of the lighting need daylight covers, mean over the floors.">
          <MonthStack label="Monthly daylight share" unit="%" series={[{ name: 'daylight share', color: SUN_C, values: dsf.map((v) => v * 100) }]} />
        </SwFig>
      </Fold>
      {first.ase && <Fold title="Sunlight exposure">
        <SwFig title="Sunlight exposure · ASE" caption="Floor over 250 h of direct sun. Limit 10%." tip="Floor with over 250 h of direct sun a year; LEED asks 10% or less.">
          <Gauge v={first.ase.pct / 0.3} good="low" label="Annual sunlight exposure against the 10% limit" read={`ASE ${Math.round(first.ase.pct * 100)}%`} marks={[{ v: 1 / 3, label: 'limit 10%' }]} />
          <FloorBars label="ASE by floor" rows={first.ase.rows.map((r) => ({ level: r.level, v: r.pct }))} max={Math.max(0.3, ...first.ase.rows.map((r) => r.pct))} mark={0.1} color="#B8362B" fmt={(v) => `${Math.round(v * 100)}%`} />
        </SwFig>
        <DaylightPlanFig layer="ase" />
      </Fold>}
      {hasEn && <Fold title="EN 17037 levels"><EnLevels dl={dl} /></Fold>}
    </>
  )
  return (
    <>
      <SwFig title="Daylight factor by floor" caption="Mean of each floor. Dashed: 2%." tip="Mean daylight factor of each floor; dashed: 2%.">
        <FloorBars label="Daylight factor by floor" rows={dl.rows.map((r) => ({ level: r.level, v: r.mean }))} max={Math.max(0.05, ...dl.rows.map((r) => r.mean))} mark={0.02} color="#6f8fb5" fmt={(v) => `${(v * 100).toFixed(1)}%`} />
      </SwFig>
      <DaylightPlanFig layer="df" />
      {hasEn && <Fold title="EN 17037 levels"><EnLevels dl={dl} /></Fold>}
      <Fold title="Useful daylight"><Udi dl={dl} /></Fold>
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
    <SwFig title={`L${d.pf.f.level} · light at ${s.hour}:00, ${s.day}/${s.month + 1}`} caption={d.L.sunUp ? `Sun ${Math.round(d.L.alt)}° high, ${Math.round(d.L.az)}° from north.` : 'The sun is down.'}>
      <LevelPick levels={d.pf.levels} />
      <FloorPlan f={d.pf.f} zones={zonesOf(d.pf.t)} grid={d.L.grid} values={d.L.lux} ramp={RAMPS.lux} label="Lux plan" />
      <RampKey ramp={RAMPS.lux} />
    </SwFig>
  )
}
/** The same floor through the day: share over 300 lux at each clock hour, the hour shown outlined. */
function LightDay() {
  const out = useSwOut((s) => s.out['built.sw-light-hour'])
  const hour = useSwStudy((s) => s.hour)
  const day = (out?.data.day as { h: number; over300: number; over3000: number; sun: number }[] | undefined) ?? []
  if (!day.length) return null
  const W = 300, H = 84, L = 26, B = 12, T = 4, ph = H - T - B, bw = (W - L - 4) / day.length
  return (
    <SwFig title="Floor over 300 lux by hour" caption="Red: over 3,000 lux. Outlined: hour shown." tip="Amber: over 300 lux; red cap: over 3,000 lux. Outlined: the hour shown.">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Share of the floor over 300 lux at each hour of the day">
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={L} x2={W - 4} y1={T + ph * (1 - t)} y2={T + ph * (1 - t)} stroke={GRID} /><Tx x={L - 3} y={T + ph * (1 - t) + 3} anchor="end" size={8.5}>{Math.round(t * 100)}%</Tx></g>)}
        {day.map((r, i) => (
          <g key={r.h}>
            <title>{`${r.h}:00 · ${Math.round(r.over300 * 100)}% over 300 lux, ${Math.round(r.over3000 * 100)}% over 3,000, ${Math.round(r.sun * 100)}% in direct sun`}</title>
            <rect x={L + i * bw + 1.5} y={T + ph * (1 - r.over300)} width={bw - 3} height={ph * r.over300} fill={SUN_C} stroke={r.h === hour ? INK : 'none'} strokeWidth={1.2} />
            <rect x={L + i * bw + 1.5} y={T + ph * (1 - r.over300)} width={bw - 3} height={ph * Math.min(r.over300, r.over3000)} fill="#B8362B" />
            {r.h % 2 === 0 && <Tx x={L + i * bw + bw / 2} y={H - 2} anchor="middle" size={8.5}>{r.h}h</Tx>}
          </g>
        ))}
      </svg>
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
  const keys = out ? out.keys ?? out.rules.map(ruleKey) : []
  return (
    <section aria-label="Key results" data-testid="sw-results" data-node={node} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-b border-line px-4 py-3">
      <h3 className="flex items-center justify-between text-control font-semibold text-ink">Key results {busy && <span className="text-meta font-normal text-muted" role="status">Running…</span>}</h3>
      {!towers ? <p className="text-meta text-muted">Place or draw a tower first.</p>
        : err ? <p className="text-meta text-red-700">This study stopped: {err}</p>
          : out ? (keys.length ? <div data-testid="sw-key"><KeyList keys={keys.map((k) => ({ ...k, reading: true }))} /></div> : <p className="text-meta text-muted">Nothing to read yet.</p>)
            : <p className="text-meta text-muted" role="status">Working…</p>}
      {out && !err && towers > 0 && <>
        {(node === 'built.sw-daylight' || node === 'built.sw-daylight-factor') && <DaylightBody id={node} />}
        {node === 'built.sw-light-hour' && <><LightHourBody /><Fold title="Through the day"><LightDay /></Fold></>}
        <ExteriorDrawings id={node} />
        <InteriorDrawings id={node} />
        <InteriorMore id={node} />
      </>}
    </section>
  )
}
