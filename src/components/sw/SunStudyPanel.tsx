// Sun and shadow's and Pedestrian wind's settings in the left panel, as Sun & Wind Studio's Sun and Wind tabs lay them
// out (16 Nov, Sinnie: "add these parameters to the left panel under sun and shadow tool", then "import the massing
// wind to pedestrian wind"). Both share the time period (preset chips, From / To and a one-line note), as in the
// Studio. Sun: the scope, the date, the hour of the sun in the viewport, the study hours. Wind: the four wind cases of
// Vancouver, one case or the period's hours, the direction and speed, and what the ground layer shows. Studies still
// re-run by themselves when a setting changes; Run study runs them now. (The Studio's PDF buttons are left out, 16 Nov.)
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SUN_DATES, type SunDate } from '../../engine/sw/sun'
import { compass16, windRose } from '../../engine/sw/wind'
import { useSwInputs } from '../../lib/swInputs'
import { runSw, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import { PERIOD_PRESETS, periodInfo, periodLabel, presetOf } from '../../lib/sunPeriod'
import { useStore } from '../../store'

const YEAR = 2026
const label = 'text-xs text-muted'
const field = 'h-9 w-full rounded-md border border-line bg-white px-2 text-control text-ink outline-none focus:border-accent'
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink hover:border-accent/60'}`
const fmtHour = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`

function Slider({ name, value, min, max, step, fmt, onChange, testid }: { name: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; testid: string }) {
  return (
    <label className="grid gap-1">
      <span className="flex items-baseline justify-between"><span className={label}>{name}</span><b className="font-mono text-xs font-medium tabular-nums text-ink">{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={name} data-testid={testid} className="w-full accent-accent" />
    </label>
  )
}

/** The time period both studies read (the Studio's period-presets, From / To and period-note). */
function PeriodPicker() {
  const s = useSwStudy()
  const C = useSwInputs().C
  const info = useMemo(() => periodInfo(s.periodFrom, s.periodTo, C), [s.periodFrom, s.periodTo, C])
  const active = presetOf(s.periodFrom, s.periodTo)
  const md = (v: string) => v.slice(5) // 'YYYY-MM-DD' → 'MM-DD'
  return (
    <>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Time period</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time period presets">
        {PERIOD_PRESETS.map((p) => <button key={p.name} type="button" aria-pressed={active?.name === p.name} data-period={p.name} onClick={() => s.set({ periodFrom: p.from, periodTo: p.to })} className={chip(active?.name === p.name)}>{p.name}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className={label}>From</span>
          <input type="date" className={field} data-testid="period-from" value={`${YEAR}-${s.periodFrom}`} min={`${YEAR}-01-01`} max={`${YEAR}-12-31`} onChange={(e) => e.target.value && s.set({ periodFrom: md(e.target.value) })} /></label>
        <label className="grid gap-1"><span className={label}>To</span>
          <input type="date" className={field} data-testid="period-to" value={`${YEAR}-${s.periodTo}`} min={`${YEAR}-01-01`} max={`${YEAR}-12-31`} onChange={(e) => e.target.value && s.set({ periodTo: md(e.target.value) })} /></label>
      </div>
      <p className="text-xs leading-snug text-muted" data-testid="period-note">
        {periodLabel(s.periodFrom, s.periodTo)} · {info.days} day{info.days > 1 ? 's' : ''}
        {C ? <> · about {info.sunHours.toLocaleString('en-CA')} sunshine hours, wind mostly from {info.wind.map((w) => `${w.name} ${Math.round(w.share * 100)}%`).join(', ')}</> : null}.
      </p>
    </>
  )
}

/** Run study: runs the given studies now (they also re-run by themselves when a setting changes). */
function RunButton({ ids, testid }: { ids: SwId[]; testid: string }) {
  const inp = useSwInputs()
  const busy = useSwOut((x) => ids.some((id) => !!x.busy[id]))
  const hasMass = inp.towers.length > 0
  const run = () => {
    useSwOut.setState((x) => ({ out: { ...x.out, ...Object.fromEntries(ids.map((id) => [id, x.out[id] ? { ...x.out[id]!, key: '' } : undefined])) } }))
    for (const id of ids) runSw(id, inp, useSwStudy.getState())
  }
  return (
    <div className="pt-1">
      <button type="button" onClick={run} disabled={!hasMass || busy} data-testid={testid} title={hasMass ? undefined : 'Place a mass first'}
        className="h-10 w-full rounded-md bg-accent text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{busy ? 'Running…' : 'Run study'}</button>
    </div>
  )
}

export default function SunStudyPanel() {
  const s = useSwStudy()
  const { sun, set } = useStore(useShallow((x) => ({ sun: x.sun, set: x.set })))
  const setDate = (k: SunDate) => { s.set({ sunDate: k }); set({ sun: { ...sun, month: SUN_DATES[k].m + 1, day: 21 } }) }
  return (
    <div className="grid gap-3 px-3 pb-3" data-testid="sun-study-panel">
      <PeriodPicker />
      <label className="grid gap-1"><span className={label}>Scope</span>
        <select className={field} value={s.sunScope} data-testid="sun-scope" onChange={(e) => s.set({ sunScope: e.target.value as 'date' | 'period' })}>
          <option value="date">the one date shown</option>
          <option value="period">the selected time period, sunshine-weighted</option>
        </select></label>
      <label className="grid gap-1"><span className={label}>Date</span>
        <select className={field} value={s.sunDate} data-testid="sun-date" onChange={(e) => setDate(e.target.value as SunDate)}>
          {(Object.keys(SUN_DATES) as SunDate[]).map((k) => <option key={k} value={k}>{SUN_DATES[k].label}</option>)}
        </select></label>
      <Slider name="Sun in the viewport at" testid="sun-hour" value={Math.min(20, Math.max(6, Math.round(sun.hour * 2) / 2))} min={6} max={20} step={0.5} fmt={fmtHour} onChange={(v) => set({ sun: { ...sun, hour: v } })} />
      <Slider name="Study from" testid="study-from" value={Math.min(12, s.h0)} min={5} max={12} step={1} fmt={(v) => `${v}:00`} onChange={(v) => s.set({ h0: v })} />
      <Slider name="Study to" testid="study-to" value={Math.max(13, s.h1)} min={13} max={21} step={1} fmt={(v) => `${v}:00`} onChange={(v) => s.set({ h1: v })} />
      <RunButton ids={['built.sw-shadow']} testid="sun-run" />
    </div>
  )
}

/** Vancouver's four wind cases (the Studio's climate.js winds); the first follows the year's most frequent sector. */
function useWindCases() {
  const C = useSwInputs().C
  return useMemo(() => {
    const top = C ? [...windRose(C, 'year').sectors].sort((a, b) => b.f - a.f)[0] : null
    const name: Record<string, string> = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' }
    return [
      { id: 'W', label: `Annual prevailing · ${top ? name[top.name] ?? top.name : 'west'}`, dir: top?.dir ?? 270, speed: top ? Math.round(top.s * 2) / 2 : 3.5 },
      { id: 'E', label: 'Winter outflow · east along the inlet', dir: 90, speed: 5 },
      { id: 'NW', label: 'Summer sea breeze · north-west', dir: 315, speed: 4 },
      { id: 'SE', label: 'Frontal storm · south-east', dir: 135, speed: 9 },
    ]
  }, [C])
}

export function WindStudyPanel() {
  const s = useSwStudy()
  const cases = useWindCases()
  const one = s.windCase === 'one'
  return (
    <div className="grid gap-3 px-3 pb-3" data-testid="wind-study-panel">
      <PeriodPicker />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wind cases">
        {cases.map((c) => { const on = one && s.windDir === c.dir && s.windSpeed === c.speed; return <button key={c.id} type="button" aria-pressed={on} data-wind-case={c.id} onClick={() => s.set({ windCase: 'one', windDir: c.dir, windSpeed: c.speed })} className={chip(on)}>{c.label}</button> })}
      </div>
      <label className="grid gap-1"><span className={label}>Case</span>
        <select className={field} value={s.windCase} data-testid="wind-case" onChange={(e) => s.set({ windCase: e.target.value as 'one' | 'period' })}>
          <option value="one">one wind case</option>
          <option value="period">the selected time period · wind rose, 8 sectors</option>
        </select></label>
      {one && <>
        <Slider name="Wind from" testid="wind-dir" value={s.windDir} min={0} max={355} step={5} fmt={(v) => `${v}° · ${compass16(v)}`} onChange={(v) => s.set({ windDir: v })} />
        <Slider name="Site wind speed at 10 m" testid="wind-speed" value={s.windSpeed} min={1} max={15} step={0.5} fmt={(v) => `${v.toFixed(1)} m/s`} onChange={(v) => s.set({ windSpeed: v })} />
      </>}
      <label className="grid gap-1"><span className={label}>Overlay shows</span>
        <select className={field} value={s.windView} data-testid="wind-view" onChange={(e) => s.set({ windView: e.target.value as 'comfort' | 'delta' })}>
          <option value="comfort">pedestrian comfort with the tower</option>
          <option value="delta">change caused by the tower</option>
        </select></label>
      <RunButton ids={['built.sw-wind-comfort', 'built.sw-wind-height']} testid="wind-run" />
    </div>
  )
}
