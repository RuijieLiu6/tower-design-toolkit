// The daylight viewer of the analysis view, after Sun & Wind Studio's plan view: one big architectural plan of the
// level studied with one result layer at a time under it (light at this hour, daylight autonomy, daylight factor,
// annual sun exposure, or none), a plan card (level with its elevation, the layers, a continuous key, grids and
// dimensions, the line types) and, for the hour layer, a time bar (play a day, play a year, month, hour).
// Nothing sits on the drawing: where the view is wide the card floats in a column the plan keeps clear; where it is
// narrow the same controls are rows above and below the plan. Wheel zooms, drag pans, double-click fits.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { towerFloors } from '../../engine/massing'
import type { SwId } from '../../lib/swRun'
import { studyLevel, useSwStudy } from '../../lib/swStudy'
import { STUDIO_RAMPS, type LayerId, type RampSpec } from './planRaster'
import StudioPlan, { type PlanView } from './StudioPlan'
import { hourRaster, useAnnualLayer, useHourLight, usePlanFloor, useSize } from './useDaylight'

type Layer = LayerId | 'off'
const LAYERS: [Layer, string][] = [['lux', 'Light at this hour'], ['da', 'Daylight autonomy'], ['df', 'Daylight factor'], ['ase', 'Annual sun exposure'], ['off', 'Off']]
const DEFAULT_LAYER: Partial<Record<SwId, Layer>> = { 'built.sw-light-hour': 'lux', 'built.sw-daylight': 'da' }
export const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const btn = 'flex h-8 items-center justify-center rounded-md border border-line bg-panel px-2.5 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

/** A continuous colour key with its values under it. */
export function ContinuousKey({ ramp, compact }: { ramp: RampSpec; compact?: boolean }) {
  // where the key is narrow the unit moves to the first value, so the last two do not meet
  const ticks: [number, string][] = compact && ramp.id === 'lux' ? ramp.ticks.filter(([v]) => v !== 100).map(([v, l], i) => [v, i === 0 ? `${l} lux` : l.replace(' lux', '')]) : ramp.ticks, n = ticks.length
  return (
    <div className="grid gap-1" data-testid="plan-key" title={`${ramp.name}: ${ramp.unit}`}>
      <div className="h-2.5 w-full rounded-sm ring-1 ring-black/10" style={{ background: ramp.css }} role="img" aria-label={`${ramp.name}, ${ticks[0][1]} to ${ticks[n - 1][1]}`} />
      <div className={`relative h-4 tabular-nums text-muted ${compact ? 'text-[11px]' : 'text-meta'}`}>
        {ticks.map(([v, l], i) => <span key={i} className="absolute top-0 whitespace-nowrap" style={{ left: `${ramp.pos(v) * 100}%`, transform: i === 0 ? undefined : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{l}</span>)}
      </div>
    </div>
  )
}

/** The line types of the plan (cut, glazing, below, above). */
export function LineLegend() {
  const item = (word: string, mark: ReactNode) => <span className="flex items-center gap-1.5 whitespace-nowrap"><svg width={22} height={10} aria-hidden>{mark}</svg>{word}</span>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-muted">
      {item('Cut', <rect x={0} y={2.5} width={22} height={5} fill="#1F2227" />)}
      {item('Glazing', <><line x1={0} y1={2.5} x2={22} y2={2.5} stroke="#1F2227" /><line x1={0} y1={5} x2={22} y2={5} stroke="#2F5F8A" /><line x1={0} y1={7.5} x2={22} y2={7.5} stroke="#1F2227" /></>)}
      {item('Fixed glass', <line x1={0} y1={5} x2={22} y2={5} stroke="#2F5F8A" strokeDasharray="4 2.5" />)}
      {item('Below', <line x1={0} y1={5} x2={22} y2={5} stroke="#5F646B" strokeWidth={0.8} />)}
      {item('Above', <line x1={0} y1={5} x2={22} y2={5} stroke="#4B5057" strokeDasharray="5 3" />)}
    </div>
  )
}

/** Where the sun is at the hour shown: a small compass and the bearing and height in words. */
export function SunChip({ sun }: { sun: { az: number; alt: number; up: boolean } | null }) {
  if (!sun) return null
  const a = (sun.az * Math.PI) / 180, x = 9 + 6.5 * Math.sin(a), y = 9 - 6.5 * Math.cos(a)
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-control tabular-nums text-ink" data-testid="sun-chip" title="Where the sun is at the hour shown: compass bearing and height above the horizon">
      <svg viewBox="0 0 18 18" width={18} height={18} aria-hidden><circle cx={9} cy={9} r={6.5} fill="none" stroke="currentColor" strokeOpacity={0.35} /><line x1={9} y1={1} x2={9} y2={4} stroke="currentColor" />
        {sun.up && <><line x1={9} y1={9} x2={x} y2={y} stroke="#D98A1E" strokeWidth={1.2} /><circle cx={x} cy={y} r={2.6} fill="#F5B83D" stroke="#D98A1E" /></>}</svg>
      {sun.up ? `Sun ${Math.round(sun.az)}° · ${Math.round(sun.alt)}° high` : 'Sun down'}
    </span>
  )
}

/** Month and hour, with a day and a year to play (the Studio's time bar). */
export function TimeBar({ stacked }: { stacked: boolean }) {
  const month = useSwStudy((s) => s.month), day = useSwStudy((s) => s.day), hour = useSwStudy((s) => s.hour), set = useSwStudy((s) => s.set)
  const [play, setPlay] = useState<'day' | 'year' | null>(null)
  useEffect(() => {
    if (!play) return
    const st = useSwStudy.getState()
    if (play === 'day') st.set({ hour: 5 }); else st.set({ month: 0 })
    const id = window.setInterval(() => {
      const s = useSwStudy.getState()
      if (play === 'day') { if (s.hour >= 21) setPlay(null); else s.set({ hour: s.hour + 1 }) } else if (s.month >= 11) setPlay(null); else s.set({ month: s.month + 1 })
    }, play === 'day' ? 380 : 650)
    return () => clearInterval(id)
  }, [play])
  const playBtn = (k: 'day' | 'year', word: string) => (
    <button type="button" className={`${btn} gap-1.5 ${play === k ? 'border-accent text-accent' : ''}`} aria-pressed={play === k} onClick={() => setPlay(play === k ? null : k)} data-testid={`time-play-${k}`} title={k === 'day' ? 'Play the hours of this day' : 'Play the months of the year at this hour'}>
      <span aria-hidden className="text-[10px]">{play === k ? '■' : '▶'}</span>{word}
    </button>
  )
  const slider = (word: string, v: number, min: number, max: number, on: (n: number) => void, id: string, text: string) => (
    <label className="flex min-w-[9rem] flex-1 items-center gap-2 text-control text-muted">{word}
      <input type="range" min={min} max={max} step={1} value={v} onChange={(e) => { setPlay(null); on(Number(e.target.value)) }} className="h-1.5 min-w-0 flex-1 accent-[#1F6F8B]" data-testid={id} aria-valuetext={text} />
    </label>
  )
  return (
    <div className={`flex items-center gap-x-3 gap-y-2 border-t border-line bg-panel px-3 py-2 ${stacked ? 'flex-wrap' : ''}`} data-testid="time-bar" role="group" aria-label="Time of the light shown">
      <div className="flex items-center gap-2">{playBtn('day', 'Day')}{playBtn('year', 'Year')}</div>
      {slider('Month', month, 0, 11, (n) => set({ month: n }), 'time-month', MON3[month])}
      {slider('Hour', hour, 0, 23, (n) => set({ hour: n }), 'time-hour', `${hour}:00`)}
      <b className="whitespace-nowrap text-control font-semibold tabular-nums text-ink" data-testid="time-readout">{day} {MON3[month]} · {String(hour).padStart(2, '0')}:00</b>
    </div>
  )
}

export default function DaylightStudio({ id }: { id: SwId }) {
  const { pf, inp } = usePlanFloor()
  const set = useSwStudy((s) => s.set), chosen = useSwStudy((s) => s.level)
  const [layer, setLayer] = useState<Layer>(DEFAULT_LAYER[id] ?? 'lux')
  useEffect(() => { setLayer(DEFAULT_LAYER[id] ?? 'lux') }, [id])
  const [grids, setGrids] = useState(true)
  const [view, setView] = useState<PlanView | null>(null)
  const [ref, size] = useSize<HTMLDivElement>()
  const wide = size.w >= 780
  const { L } = useHourLight(pf, inp, layer === 'lux')
  const { A, busy } = useAnnualLayer(pf, inp, layer === 'lux' || layer === 'off' ? null : layer)
  const raster = layer === 'lux' ? hourRaster(L) : layer === 'off' ? null : A?.raster ?? null
  const floors = useMemo(() => (pf ? towerFloors(pf.t).filter((f) => f.z1 > 0) : []), [pf?.t]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setView(null) }, [pf?.key])

  // wheel zooms about the pointer; drag pans; double-click fits
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2
      setView((v) => { const z0 = v?.z ?? 1, z = Math.max(0.6, Math.min(14, z0 * Math.exp(-e.deltaY * 0.0015))), dx = v?.dx ?? 0, dy = v?.dy ?? 0; return { z, dx: mx - ((mx - dx) / z0) * z, dy: my - ((my - dy) / z0) * z } })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])

  if (!pf) return <p className="p-4 text-meta text-muted" role="status" data-testid="sw-plan-view">Place or draw a tower first.</p>
  const f = pf.f, Lv = studyLevel(pf.levels, chosen)
  const step = (d: number) => set({ level: Math.max(1, Math.min(pf.levels, Lv + d)) })
  const ramp = layer === 'off' ? null : STUDIO_RAMPS[layer]
  const sun = layer === 'lux' && L ? { az: L.az, alt: L.alt, up: L.sunUp } : null
  const status = layer === 'off' ? 'Plan only' : layer === 'lux'
    ? (L ? `${Math.round(L.over300 * 100)}% of the floor over 300 lux · ${Math.round(L.sunShare * 100)}% in the sun${L.blindsDown.length ? ` · blinds down ${L.blindsDown.join(', ')}` : ''}` : 'Tracing the light…')
    : busy ? 'Working through the year…' : A?.read ?? ''

  const stepper = (
    <div className="flex items-center gap-1.5">
      <button type="button" className={`${btn} w-8 px-0`} onClick={() => step(-1)} disabled={Lv <= 1} aria-label="Level below" title="Level below" data-testid="level-down">▼</button>
      <select value={Lv} onChange={(e) => set({ level: Number(e.target.value) })} aria-label="Level and its floor elevation" data-testid="level-select" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-control tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {floors.map((fl, i) => <option key={i} value={i + 1}>L{fl.level} · +{fl.z0.toFixed(2)}</option>)}
      </select>
      <button type="button" className={`${btn} w-8 px-0`} onClick={() => step(1)} disabled={Lv >= pf.levels} aria-label="Level above" title="Level above" data-testid="level-up">▲</button>
    </div>
  )
  const chips = (
    <div role="radiogroup" aria-label="Result drawn on the plan" className="flex flex-wrap gap-1.5">
      {LAYERS.map(([k, word]) => (
        <button key={k} type="button" role="radio" aria-checked={layer === k} onClick={() => setLayer(k)} data-testid={`layer-${k}`}
          className={`h-7 whitespace-nowrap rounded-full border px-2.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${layer === k ? 'border-[#C9A227] bg-[#FFF6D8] font-semibold text-[#6B5200]' : 'border-line bg-panel text-ink hover:bg-subtle'}`}>{word}</button>
      ))}
    </div>
  )
  const options = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex items-center gap-2 text-control text-ink"><input type="checkbox" checked={grids} onChange={(e) => setGrids(e.target.checked)} className="h-4 w-4 accent-[#1F6F8B]" data-testid="plan-grids" />Grids and dimensions</label>
      {view && <button type="button" className="text-meta text-accent underline-offset-2 hover:underline" onClick={() => setView(null)} data-testid="plan-fit">Fit the plan</button>}
    </div>
  )
  const head = <div className="flex items-baseline justify-between gap-2"><b className="text-control font-semibold text-ink">L{f.level} plan</b><span className="whitespace-nowrap text-meta tabular-nums text-muted">FFL +{f.z.toFixed(2)} · cut at +1.20</span></div>
  const statusLine = <p className="min-h-4 text-meta text-muted" role="status" data-testid="plan-status">{status}</p>
  const pad: [number, number, number, number] = wide ? [0, 0, 0, 268] : [0, 0, 0, 0]

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F3F3F0]" data-testid="sw-plan-view" data-layer={layer}>
      {!wide && <div className="grid gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-2" title={`Level ${f.level}: floor at +${f.z.toFixed(2)} m, plan cut 1.20 m above it`}><div className="w-[13rem] max-w-full">{stepper}</div><span className="ml-auto"><SunChip sun={sun} /></span></div>
        {chips}
      </div>}
      <div ref={ref} className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing" data-testid="plan-stage"
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest('[data-card]')) return; drag.current = { x: e.clientX, y: e.clientY, dx: view?.dx ?? 0, dy: view?.dy ?? 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; setView((v) => ({ z: v?.z ?? 1, dx: d.dx + e.clientX - d.x, dy: d.dy + e.clientY - d.y })) }}
        onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('[data-card]')) setView(null) }}>
        {size.w > 60 && size.h > 60 && <StudioPlan f={f} t={pf.t} zones={pf.zones} w={size.w} h={size.h} raster={raster} grids={grids} view={view} pad={pad}
          sun={sun && sun.up ? sun : null} closed={layer === 'lux' ? L?.closed : null} label={`Level ${f.level} floor plan${ramp ? `, ${ramp.name.toLowerCase()}` : ''}`} />}
        {wide && <>
          <div className="absolute left-3 top-3" data-card><SunChip sun={sun} /></div>
          <aside data-card aria-label="Plan" className="absolute bottom-3 left-3 grid w-[248px] cursor-default gap-2.5 rounded-xl border border-line bg-panel p-3 shadow-sm" data-testid="plan-card">
            {head}{stepper}{chips}
            {ramp && <ContinuousKey ramp={ramp} compact />}
            {statusLine}
            {options}
            <div className="border-t border-line pt-2"><LineLegend /></div>
          </aside>
        </>}
      </div>
      {!wide && <div className="grid gap-1.5 border-t border-line bg-panel px-3 py-2" data-testid="plan-card">
        {ramp && <ContinuousKey ramp={ramp} compact={size.w < 420} />}
        {statusLine}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">{options}<LineLegend /></div>
      </div>}
      {layer === 'lux' && <TimeBar stacked={!wide} />}
    </div>
  )
}
