// Controls of the Sun & Wind Studio tools: the façade zones (the Studio's Façade tab, now part of each tower) and the
// study settings (the Studio's left panel). Registered as design tools that never show in a step's row; each check
// opens with its own through lib/workflow/phaseTools.ts NODE_CONTROLS.
import { Blinds, CalendarClock, Fan, Leaf, SunDim, Thermometer, SolarPanel, Droplets } from '../icons'
import { DEFAULT_ZONES, FACE_NAME, ORI, STRATS, zonesOf, type FacadeZone, type StratId } from '../../engine/sw/plate'
import { SUN_DATES, SUN_PERIODS, type SunDate, type SunPeriod } from '../../engine/sw/sun'
import { SEASONS, type Season } from '../../engine/sw/wind'
import { THERM_SYS, type ThermSys } from '../../engine/sw/thermal'
import { useSwStudy, type VentMode } from '../../lib/swStudy'
import { useStore, useTowers } from '../../store'
import type { DesignTool } from '../tools/registry'

const label = 'grid gap-1 text-meta text-muted'
const input = 'h-8 rounded-md border border-line bg-white px-2 text-control text-ink'
const row = 'grid grid-cols-2 gap-2'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Num({ name, value, min, max, step = 1, onChange, unit }: { name: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className={label}>{name}
      <span className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" aria-label={name} />
        <b className="w-12 text-right tabular-nums text-ink">{value}{unit}</b>
      </span>
    </label>
  )
}

// ------------------------------------------------------------------ façade zones
function FacadeZonesTool() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const update = useStore((s) => s.updateTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  if (!t) return <p className="px-3 pb-3 text-meta text-muted">Place or draw a tower first.</p>
  const zones = zonesOf(t)
  const set = (z: FacadeZone[]) => update(t.id, { facadeZones: z })
  const patch = (i: number, p: Partial<FacadeZone>) => set(zones.map((z, k) => (k === i ? { ...z, ...p } : z)))
  return (
    <div className="grid gap-2 px-3 pb-3" data-testid="facade-zones">
      <p className="text-meta text-muted">{t.name}: a strategy per face and range of levels. Later rows win where they overlap.</p>
      {zones.map((z, i) => (
        <fieldset key={i} className="grid gap-1.5 rounded-md border border-line p-2" data-zone={i}>
          <legend className="sr-only">Zone {i + 1}</legend>
          <div className="flex items-center gap-1.5">
            <select value={z.face} onChange={(e) => patch(i, { face: e.target.value as FacadeZone['face'] })} className={`${input} w-20`} aria-label="Face">
              <option value="all">All</option>{ORI.map((o) => <option key={o} value={o}>{FACE_NAME[o]}</option>)}
            </select>
            <select value={z.strat} onChange={(e) => { const st = e.target.value as StratId; patch(i, { strat: st, ...STRATS[st].d }) }} className={`${input} min-w-0 flex-1`} aria-label="Strategy" title={STRATS[z.strat].blurb}>
              {(Object.keys(STRATS) as StratId[]).map((k) => <option key={k} value={k}>{STRATS[k].name}</option>)}
            </select>
            <button type="button" onClick={() => set(zones.filter((_, k) => k !== i))} disabled={zones.length <= 1} className="h-8 rounded-md px-2 text-meta text-muted hover:bg-panel disabled:opacity-40" aria-label={`Remove zone ${i + 1}`}>×</button>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5 text-meta text-muted">
            Levels <input type="number" min={1} value={z.from} onChange={(e) => patch(i, { from: Math.max(1, Number(e.target.value) || 1) })} className={`${input} w-full`} aria-label="From level" />
            to <input type="number" min={1} value={z.to >= 999 ? '' : z.to} placeholder="top" onChange={(e) => patch(i, { to: e.target.value ? Math.max(1, Number(e.target.value)) : 999 })} className={`${input} w-full`} aria-label="To level" />
          </div>
          <Num name="Glazing (WWR)" value={Math.round(z.wwr * 100)} min={10} max={95} unit="%" onChange={(v) => patch(i, { wwr: v / 100 })} />
          <div className={row}>
            <Num name="SHGC" value={z.shgc} min={0.15} max={0.7} step={0.05} onChange={(v) => patch(i, { shgc: v })} />
            {STRATS[z.strat].depthLabel ? <Num name={STRATS[z.strat].depthLabel!} value={z.depth} min={0} max={3} step={0.1} unit=" m" onChange={(v) => patch(i, { depth: v })} /> : <span />}
          </div>
          {z.strat === 'pvspandrel' && <Num name="PV on the spandrel" value={Math.round(z.pv * 100)} min={0} max={100} unit="%" onChange={(v) => patch(i, { pv: v / 100 })} />}
          <label className="flex items-center gap-2 text-meta text-ink"><input type="checkbox" checked={z.operable} onChange={(e) => patch(i, { operable: e.target.checked })} />Windows open</label>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => set([...zones, { ...zones[zones.length - 1], face: 'all' }])} className="h-8 rounded-md border border-line px-2 text-control hover:border-accent" data-testid="zone-add">Add zone</button>
        <button type="button" onClick={() => update(t.id, { facadeZones: undefined })} className="h-8 rounded-md px-2 text-control text-muted hover:bg-panel" disabled={zones === DEFAULT_ZONES}>Studio defaults</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ study settings
function SunSet() {
  const s = useSwStudy()
  return (
    <div className="grid gap-2 px-3 pb-3">
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Study">
        {(['date', 'period'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={s.sunScope === k} onClick={() => s.set({ sunScope: k })} className={`h-8 rounded-md border text-control ${s.sunScope === k ? 'border-accent bg-accent/10 text-accent' : 'border-line'}`}>{k === 'date' ? 'One day' : 'A season'}</button>)}
      </div>
      {s.sunScope === 'date' ? <>
        <label className={label}>Day<select className={input} value={s.sunDate} onChange={(e) => s.set({ sunDate: e.target.value as SunDate })}>{(Object.keys(SUN_DATES) as SunDate[]).map((k) => <option key={k} value={k}>{SUN_DATES[k].label}</option>)}</select></label>
        <div className={row}><Num name="From" value={s.h0} min={5} max={s.h1 - 1} unit=":00" onChange={(v) => s.set({ h0: v })} /><Num name="To" value={s.h1} min={s.h0 + 1} max={21} unit=":00" onChange={(v) => s.set({ h1: v })} /></div>
      </> : <label className={label}>Season<select className={input} value={s.sunPeriod} onChange={(e) => s.set({ sunPeriod: e.target.value as SunPeriod })}>{(Object.keys(SUN_PERIODS) as SunPeriod[]).map((k) => <option key={k} value={k}>{SUN_PERIODS[k].label}</option>)}</select></label>}
    </div>
  )
}
function HourSet() {
  const s = useSwStudy()
  return (
    <div className="grid gap-2 px-3 pb-3">
      <div className={row}>
        <label className={label}>Month<select className={input} value={s.month} onChange={(e) => s.set({ month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label>
        <Num name="Day" value={s.day} min={1} max={28} onChange={(v) => s.set({ day: v })} />
      </div>
      <Num name="Hour" value={s.hour} min={0} max={23} unit=":00" onChange={(v) => s.set({ hour: v })} />
      <label className="flex items-center gap-2 text-meta text-ink"><input type="checkbox" checked={s.blinds} onChange={(e) => s.set({ blinds: e.target.checked })} />Blinds come down in direct sun (LM-83)</label>
    </div>
  )
}
function WindSet() {
  const s = useSwStudy()
  return <div className="grid gap-2 px-3 pb-3"><label className={label}>Season of the wind record<select className={input} value={s.season} onChange={(e) => s.set({ season: e.target.value as Season })}>{(Object.keys(SEASONS) as Season[]).map((k) => <option key={k} value={k}>{SEASONS[k].label}</option>)}</select></label></div>
}
function DaylightSet() {
  const s = useSwStudy()
  return (
    <div className="grid gap-2 px-3 pb-3">
      <label className={label}>Target<select className={input} value={s.dlTarget} onChange={(e) => s.set({ dlTarget: Number(e.target.value) })}>{[150, 300, 500].map((v) => <option key={v} value={v}>{v} lux</option>)}</select></label>
      <label className="flex items-center gap-2 text-meta text-ink"><input type="checkbox" checked={s.blinds} onChange={(e) => s.set({ blinds: e.target.checked })} />Blinds operated (LM-83)</label>
    </div>
  )
}
function VentSet() {
  const s = useSwStudy()
  const v = s.vent
  const put = (p: Partial<typeof v>) => s.set({ vent: { ...v, ...p } })
  return (
    <div className="grid gap-2 px-3 pb-3">
      <label className={label}>How air moves<select className={input} value={v.mode} onChange={(e) => put({ mode: e.target.value as VentMode })}><option value="cross">Cross ventilation</option><option value="single">Single-sided</option><option value="stack">Stack</option></select></label>
      <label className={label}>Comfort band<select className={input} value={v.band} onChange={(e) => put({ band: e.target.value as 'fixed' | 'adaptive' })}><option value="fixed">Fixed {v.tmin}–{v.tmax} °C</option><option value="adaptive">ASHRAE 55 adaptive</option></select></label>
      <Num name="Window opening" value={Math.round(v.open * 100)} min={5} max={50} unit="%" onChange={(x) => put({ open: x / 100 })} />
      <Num name="Close above wind" value={v.umax} min={4} max={15} unit=" m/s" onChange={(x) => put({ umax: x })} />
    </div>
  )
}
function PvSet() {
  const s = useSwStudy()
  const put = (p: Partial<typeof s.pv>) => s.set({ pv: { ...s.pv, ...p } })
  return (
    <div className="grid gap-2 px-3 pb-3">
      <Num name="Roof covered" value={Math.round(s.pv.roof * 100)} min={0} max={100} unit="%" onChange={(x) => put({ roof: x / 100 })} />
      <div className={row}><Num name="Module efficiency" value={Math.round(s.pv.eff * 100)} min={10} max={25} unit="%" onChange={(x) => put({ eff: x / 100 })} /><Num name="Performance ratio" value={Math.round(s.pv.pr * 100)} min={60} max={90} unit="%" onChange={(x) => put({ pr: x / 100 })} /></div>
      <p className="text-meta text-muted">PV on the façade: set a zone to PV spandrel in Façade zones.</p>
    </div>
  )
}
function RainSet() {
  const s = useSwStudy()
  return <div className="grid gap-2 px-3 pb-3"><Num name="Roof run-off kept" value={Math.round(s.rainEff * 100)} min={40} max={95} unit="%" onChange={(x) => s.set({ rainEff: x / 100 })} /></div>
}
function TempSet() {
  const s = useSwStudy()
  return (
    <div className="grid gap-2 px-3 pb-3">
      <label className={label}>System<select className={input} value={s.system} onChange={(e) => s.set({ system: e.target.value as ThermSys })}>{(Object.keys(THERM_SYS) as ThermSys[]).map((k) => <option key={k} value={k}>{THERM_SYS[k].name}</option>)}</select></label>
      <HourSet />
    </div>
  )
}

const never = () => false
const tool = (id: string, labelText: string, short: string, icon: DesignTool['icon'], component: DesignTool['component'], hint: string): DesignTool =>
  ({ id, label: labelText, short, icon, stages: ['basic', 'advanced'], order: 200, hint, component, when: never })

const tools: DesignTool[] = [
  tool('facade-zones', 'Façade zones', 'Façade', Blinds, FacadeZonesTool, 'Glazing, glass, shading device, PV and operable windows by face and level'),
  tool('sw-sun-set', 'Shadow study day', 'Day', SunDim, SunSet, 'One day and its hours, or a season'),
  tool('sw-hour-set', 'Study hour', 'Hour', CalendarClock, HourSet, 'Month, day and hour, and the blinds'),
  tool('sw-wind-set', 'Wind season', 'Season', Fan, WindSet, 'Which months of the wind record'),
  tool('sw-dl-set', 'Daylight target', 'Target', SunDim, DaylightSet, 'Lux target and blinds'),
  tool('sw-vent-set', 'Ventilation settings', 'Settings', Leaf, VentSet, 'How air moves, the comfort band, the openings'),
  tool('sw-pv-set', 'PV settings', 'Settings', SolarPanel, PvSet, 'Roof covered, efficiency, performance'),
  tool('sw-rain-set', 'Rainwater settings', 'Settings', Droplets, RainSet, 'How much roof run-off is kept'),
  tool('sw-temp-set', 'Temperature settings', 'Settings', Thermometer, TempSet, 'System, hour and blinds'),
]

export default tools
