// Sun and shadow's settings in the left panel, as Sun & Wind Studio's Sun tab lays them out (16 Nov, Sinnie: "add these
// parameters to the left panel under sun and shadow tool"): the time period (preset chips, From / To and a one-line
// note), the scope (the one date shown, or the period weighted by sunshine), the date, the hour of the sun in the
// viewport, the study hours, and Run study / PDF. Studies still re-run by themselves when a setting changes; Run study
// runs this one now.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SUN_DATES, type SunDate } from '../../engine/sw/sun'
import { useSwInputs } from '../../lib/swInputs'
import { runSw, useSwOut } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import { PERIOD_PRESETS, periodInfo, periodLabel, presetOf } from '../../lib/sunPeriod'
import { sunReport } from '../../lib/sunReport'
import { useStore } from '../../store'

const ID = 'built.sw-shadow' as const
const YEAR = 2026
const label = 'text-xs text-muted'
const field = 'h-9 w-full rounded-md border border-line bg-white px-2 text-control text-ink outline-none focus:border-accent'
const fmtHour = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`

function Slider({ name, value, min, max, step, fmt, onChange, testid }: { name: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; testid: string }) {
  return (
    <label className="grid gap-1">
      <span className="flex items-baseline justify-between"><span className={label}>{name}</span><b className="font-mono text-xs font-medium tabular-nums text-ink">{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={name} data-testid={testid} className="w-full accent-accent" />
    </label>
  )
}

export default function SunStudyPanel() {
  const s = useSwStudy()
  const inp = useSwInputs()
  const { sun, set } = useStore(useShallow((x) => ({ sun: x.sun, set: x.set })))
  const out = useSwOut((x) => x.out[ID])
  const busy = useSwOut((x) => !!x.busy[ID])
  const info = useMemo(() => periodInfo(s.periodFrom, s.periodTo, inp.C), [s.periodFrom, s.periodTo, inp.C])
  const active = presetOf(s.periodFrom, s.periodTo)
  const setDate = (k: SunDate) => { s.set({ sunDate: k }); set({ sun: { ...sun, month: SUN_DATES[k].m + 1, day: 21 } }) }
  const hasMass = inp.towers.length > 0
  const run = () => {
    useSwOut.setState((x) => ({ out: { ...x.out, [ID]: x.out[ID] ? { ...x.out[ID]!, key: '' } : undefined } }))
    runSw(ID, inp, useSwStudy.getState())
  }
  const pdf = () => {
    if (!out) return
    const when = s.sunScope === 'date' ? `${SUN_DATES[s.sunDate].label}, ${s.h0}:00–${s.h1}:00` : `${periodLabel(s.periodFrom, s.periodTo)}, sunshine-weighted`
    const title = [...inp.towers].sort((a, b) => b.height - a.height)[0]?.name ?? 'Tower'
    const blob = sunReport({ title, when, period: s.sunScope === 'period', out, site: inp.site, settings: [
      `Time period: ${periodLabel(s.periodFrom, s.periodTo)} (${info.days} day${info.days > 1 ? 's' : ''}, about ${info.sunHours.toLocaleString('en-CA')} sunshine hours).`,
      `Scope: ${s.sunScope === 'date' ? 'the one date shown' : 'the selected time period, sunshine-weighted'}.`,
      ...(s.sunScope === 'date' ? [`Date: ${SUN_DATES[s.sunDate].label}; study hours ${s.h0}:00–${s.h1}:00.`] : []),
      'Climate: CWEC 2020, Vancouver Intl Airport.',
    ] })
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = `${title.replace(/[^\w-]+/g, '-')}-sun-and-shadow.pdf`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const md = (v: string) => v.slice(5) // 'YYYY-MM-DD' → 'MM-DD'
  return (
    <div className="grid gap-3 px-3 pb-3" data-testid="sun-study-panel">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Time period</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time period presets">
        {PERIOD_PRESETS.map((p) => (
          <button key={p.name} type="button" aria-pressed={active?.name === p.name} data-period={p.name} onClick={() => s.set({ periodFrom: p.from, periodTo: p.to })}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${active?.name === p.name ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink hover:border-accent/60'}`}>{p.name}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className={label}>From</span>
          <input type="date" className={field} data-testid="period-from" value={`${YEAR}-${s.periodFrom}`} min={`${YEAR}-01-01`} max={`${YEAR}-12-31`} onChange={(e) => e.target.value && s.set({ periodFrom: md(e.target.value) })} /></label>
        <label className="grid gap-1"><span className={label}>To</span>
          <input type="date" className={field} data-testid="period-to" value={`${YEAR}-${s.periodTo}`} min={`${YEAR}-01-01`} max={`${YEAR}-12-31`} onChange={(e) => e.target.value && s.set({ periodTo: md(e.target.value) })} /></label>
      </div>
      <p className="text-xs leading-snug text-muted" data-testid="period-note">
        {periodLabel(s.periodFrom, s.periodTo)} · {info.days} day{info.days > 1 ? 's' : ''}
        {inp.C ? <> · about {info.sunHours.toLocaleString('en-CA')} sunshine hours, wind mostly from {info.wind.map((w) => `${w.name} ${Math.round(w.share * 100)}%`).join(', ')}</> : null}.
      </p>
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
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={run} disabled={!hasMass || busy} data-testid="sun-run" title={hasMass ? undefined : 'Place a mass first'}
          className="h-10 rounded-md bg-accent text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{busy ? 'Running…' : 'Run study'}</button>
        <button type="button" onClick={pdf} disabled={!out?.data || busy} data-testid="sun-pdf" title={out?.data ? 'This study as a one-page PDF' : 'Run the study first'}
          className="h-10 rounded-md border border-line bg-white text-sm font-semibold text-ink hover:border-accent disabled:opacity-50">PDF</button>
      </div>
    </div>
  )
}
