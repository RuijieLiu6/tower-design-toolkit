// Controls of the Sun & Wind Studio tools: the façade zones (the Studio's Façade tab, now part of each tower) and the
// study settings (the Studio's left panel). Registered as design tools that never show in a step's row; each check
// opens with its own through lib/workflow/phaseTools.ts NODE_CONTROLS.
import { Blinds, CalendarClock, Fan, Leaf, SunDim, Thermometer, SolarPanel, Droplets } from '../icons'
import { FOLLOW_ENERGY, THERM_SYS, type ThermSys } from '../../engine/sw/thermal'
import { useSwStudy, type VentMode } from '../../lib/swStudy'
import type { DesignTool } from '../tools/registry'
import FacadeZonesTool from './FacadeZonesTool'
import SunSet, { FormGuide, RainStudyPanel as RainSet, WindStudyPanel as WindSet } from './SunStudyPanel'

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

// ------------------------------------------------------------------ façade zones: components/sw/FacadeZonesTool.tsx

// ------------------------------------------------------------------ study settings
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
function TempSet() {
  const s = useSwStudy()
  return (
    <div className="grid gap-2 px-3 pb-3">
      <label className={label}>System<select className={input} value={s.system} onChange={(e) => s.set({ system: e.target.value as ThermSys | 'energy' })}><option value="energy" title={FOLLOW_ENERGY.blurb}>{FOLLOW_ENERGY.name}</option>{(Object.keys(THERM_SYS) as ThermSys[]).map((k) => <option key={k} value={k}>{THERM_SYS[k].name}</option>)}</select></label>
      <HourSet />
    </div>
  )
}

const never = () => false
const tool = (id: string, labelText: string, short: string, icon: DesignTool['icon'], component: DesignTool['component'], hint: string): DesignTool =>
  ({ id, label: labelText, short, icon, stages: ['basic', 'advanced'], order: 200, hint, component, when: never })

const tools: DesignTool[] = [
  tool('facade-zones', 'Façade zones', 'Façade', Blinds, FacadeZonesTool, 'Glazing, glass, shading device, PV and operable windows by face and level'),
  tool('sw-sun-set', 'Sun', 'Sun', SunDim, SunSet, 'Time period, scope, date, hours'),
  tool('sw-hour-set', 'Study hour', 'Hour', CalendarClock, HourSet, 'Month, day and hour, and the blinds'),
  tool('sw-wind-set', 'Wind', 'Wind', Fan, WindSet, 'Time period, wind case, direction and speed, overlay'),
  tool('sw-dl-set', 'Daylight target', 'Target', SunDim, DaylightSet, 'Lux target and blinds'),
  tool('sw-vent-set', 'Ventilation settings', 'Settings', Leaf, VentSet, 'How air moves, the comfort band, the openings'),
  tool('sw-pv-set', 'PV settings', 'Settings', SolarPanel, PvSet, 'Roof covered, efficiency, performance'),
  tool('sw-rain-set', 'Rain', 'Rain', Droplets, RainSet, 'Time period, design storm, rainfall and drainage'),
  tool('sw-form-set', 'Form efficiency', 'Form', Blinds, FormGuide, 'How to read the A to E ratings'),
  tool('sw-temp-set', 'Temperature settings', 'Settings', Thermometer, TempSet, 'System, hour and blinds'),
]

export default tools
