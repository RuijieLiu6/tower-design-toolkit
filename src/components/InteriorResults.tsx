// Inspector for the Interior & activity programme node (research P12-M04, M03): unit mix, hotel keys, office lease
// depth and the activities on public floors, drawn on the typical plan, with what the layout changes in the lift
// check, egress and economics compared with the area proxies.
import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { economics, money } from '../engine/economics'
import { egressCheck } from '../engine/egress'
import { DEFAULT_INTERIOR, UNIT_LABEL, UNIT_TYPES, interiorCheck, type Activity, type InteriorInput } from '../engine/interior'
import { liftCheck } from '../engine/lifts'
import { towerFloors } from '../engine/massing'
import type { RuleResult, Tower } from '../engine/types'
import { useEconomics } from '../hooks/useEconomics'
import { useEconStore } from '../lib/econStore'
import { useStore, useTowers } from '../store'
import PlanDrawing from './PlanDrawing'
import { FlagChip, NumberField, Section, StateChip, Toggle } from './ui'
import { U } from './Units'
import { useShallow } from 'zustand/react/shallow'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· needs <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}</a> : <span className="text-[10px] text-muted">{r.source.label}</span>}
      </div>
    </div>
  )
}

function ActivityRows({ list, onChange }: { list: Activity[]; onChange: (l: Activity[]) => void }) {
  const set = (i: number, patch: Partial<Activity>) => onChange(list.map((a, j) => (j === i ? { ...a, ...patch } : a)))
  return (
    <table className="w-full text-[11px]">
      <thead><tr className="text-left text-[10px] text-muted"><th className="font-medium">Activity</th><th className="w-12 font-medium">Share %</th><th className="w-12 font-medium" title="Comfortable density (design)">m²/pers.</th><th className="w-12 font-medium" title="Egress density (Table 3.1.17.1 factor or team value)">Egress</th><th className="font-medium">Hours</th></tr></thead>
      <tbody>{list.map((a, i) => (
        <tr key={a.id} className="border-t border-line/60">
          <td className="py-0.5 pr-1"><input value={a.name} onChange={(e) => set(i, { name: e.target.value })} className="w-full rounded border border-line bg-panel px-1" aria-label="Activity name" /></td>
          <td><input type="number" min={0} max={100} value={Math.round(a.share * 100)} onChange={(e) => set(i, { share: Math.max(0, Number(e.target.value)) / 100 })} className="w-12 rounded border border-line bg-panel px-1" aria-label={`${a.name} share`} /></td>
          <td><input type="number" min={0.4} step={0.1} value={a.designM2} onChange={(e) => set(i, { designM2: Math.max(0.4, Number(e.target.value)) })} className="w-12 rounded border border-line bg-panel px-1" aria-label={`${a.name} design density`} /></td>
          <td><input type="number" min={0.3} step={0.1} value={a.egressM2} onChange={(e) => set(i, { egressM2: Math.max(0.3, Number(e.target.value)) })} className="w-12 rounded border border-line bg-panel px-1" aria-label={`${a.name} egress density`} /></td>
          <td><input value={a.hours} onChange={(e) => set(i, { hours: e.target.value })} className="w-full rounded border border-line bg-panel px-1" aria-label={`${a.name} hours`} /></td>
        </tr>
      ))}</tbody>
    </table>
  )
}

export default function InteriorResults() {
  const towers = useTowers()
  const { selectedTower, updateTower, liftPresets, egressPresets } = useStore(useShallow((s) => ({ selectedTower: s.selectedTower, updateTower: s.updateTower, liftPresets: s.liftPresets, egressPresets: s.egressPresets })))
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]
  const econ = useEconomics()
  const { permitYear, landPrice, includeRegional } = useEconStore()
  const [view, setView] = useState<'residential' | 'hotel' | 'office' | 'amenity'>('residential')
  const floors = useMemo(() => (t ? towerFloors(t) : []), [t])
  const r = useMemo(() => (t ? interiorCheck(t, floors) : null), [t, floors])
  // The same tower with and without the layout, to show what the counts change.
  const effect = useMemo(() => {
    if (!t) return null
    const off: Tower = { ...t, interior: undefined }, on: Tower = { ...t, interior: t.interior ?? DEFAULT_INTERIOR }
    const li = { homeM2: liftPresets.homeM2, hotelM2PerKey: liftPresets.hotelM2PerKey }
    const lift = (x: Tower) => liftCheck(x, liftPresets, egressPresets, { skipDirect: true })
    const eg = (x: Tower) => egressCheck(x, egressPresets, li)
    const inp = { permitYear, landPrice, siteArea: econ.siteArea, includeRegional, homeM2: liftPresets.homeM2, hotelM2PerKey: liftPresets.hotelM2PerKey }
    const ec = (x: Tower) => economics(towers.map((y) => (y.id === t.id ? x : y)), inp, econ.presets)
    const [la, lb] = [lift(off), lift(on)], [ea, eb] = [eg(off), eg(on)], [ca, cb] = [ec(off), ec(on)]
    return { la, lb, ea, eb, ca, cb }
  }, [t, towers, liftPresets, egressPresets, permitYear, landPrice, includeRegional, econ.siteArea, econ.presets])
  if (!t || !r || !effect) return null
  const input = t.interior ?? DEFAULT_INTERIOR
  const setI = (patch: Partial<InteriorInput>) => updateTower(t.id, { interior: { ...input, ...patch } })
  const levelFor = (use: typeof view) => {
    const of = floors.filter((f) => !f.podium && (use === 'amenity' ? f.use === 'amenity' || f.skyLobby : f.use === use && !f.skyLobby))
    return of[Math.floor(of.length / 2)]?.level ?? null
  }
  const level = levelFor(view)
  const views = (['residential', 'hotel', 'office', 'amenity'] as const).filter((v) => levelFor(v) !== null)
  const share = (u: (typeof UNIT_TYPES)[number]) => Math.round((input.mix[u] / Math.max(1e-9, UNIT_TYPES.reduce((s, x) => s + input.mix[x], 0))) * 100)
  const row = (k: string, a: string, b: string) => <tr className="border-t border-line/60"><td className="py-0.5 text-muted">{k}</td><td className="text-right tabular-nums">{a}</td><td className="text-right font-medium tabular-nums">{b}</td></tr>
  const maxStair = (e: typeof effect.ea) => e.widthMm
  return (
    <>
      <Section title="Layout">
        <label className="flex items-center gap-2 text-xs"><Toggle checked={!!t.interior} onChange={() => updateTower(t.id, { interior: t.interior ? undefined : DEFAULT_INTERIOR })} label="Use this layout for lifts, egress and economics" />Use this layout for lifts, egress and economics</label>
        <p className="mt-1 text-[10px] text-muted">{t.interior ? 'Homes, bedrooms and hotel keys now come from the layout below; amenity floors from their activities.' : 'Off: the lift check, egress and economics use area proxies (75 m² a home, 40 m² a key, 1.5 bedrooms a home).'}</p>
        {views.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Floor to show">
            {views.map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`rounded border px-2 py-0.5 text-[11px] ${view === v ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>{v === 'amenity' ? 'Public floor' : v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
        )}
        {level !== null && <div className="mt-2 aspect-[594/420] w-full overflow-hidden rounded border border-line bg-white"><PlanDrawing level={level} standalone /></div>}
        {!t.interior && <p className="mt-1 text-[10px] text-amber-700">The plan shows the layout only once it is switched on.</p>}
      </Section>
      <Section title="What the layout changes">
        <table className="w-full text-[11px]">
          <thead><tr className="text-[10px] text-muted"><th className="text-left font-medium">&nbsp;</th><th className="text-right font-medium">Area proxy</th><th className="text-right font-medium">Layout</th></tr></thead>
          <tbody>
            {r.home && row('Homes in the tower', `about ${Math.round(r.homeFloors * (r.home.net / liftPresets.homeM2)).toLocaleString('en-CA')}`, r.totals.homes.toLocaleString('en-CA'))}
            {r.hotel && row('Hotel keys', `about ${Math.round(r.hotelFloors * (r.hotel.net / liftPresets.hotelM2PerKey)).toLocaleString('en-CA')}`, r.totals.keys.toLocaleString('en-CA'))}
            {row('Lift cars', String(effect.la.totalCars), String(effect.lb.totalCars))}
            {row('Core needed (worst level)', `${Math.round(effect.la.requiredMax)} m²`, `${Math.round(effect.lb.requiredMax)} m²`)}
            {row('Exit stair width', `${Math.round(maxStair(effect.ea))} mm`, `${Math.round(maxStair(effect.eb))} mm`)}
            {row('Hard cost incl. hotel furniture', money(effect.ca.hard), money(effect.cb.hard))}
            {row('Land residual after charges', money(effect.ca.rlvAfter), money(effect.cb.rlvAfter))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-muted">Both columns use the same massing and presets; only the counts differ. {t.interior ? 'The layout column is what the lift, egress and economics nodes show now.' : 'Switch the layout on to make the right column live.'}</p>
      </Section>
      <Section title="Checks">
        <div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>
      <Section title="Unit mix and sizes" right={<button type="button" onClick={() => updateTower(t.id, { interior: t.interior ? DEFAULT_INTERIOR : undefined })} className="flex items-center gap-1 text-[10px] text-muted hover:text-accent"><RotateCcw size={11} />Defaults</button>}>
        <div className="grid gap-2">
          {UNIT_TYPES.map((u) => (
            <div key={u} className="grid grid-cols-[1fr_auto] items-end gap-2">
              <NumberField label={`${UNIT_LABEL[u]}: share of homes (${share(u)}%)`} value={input.mix[u] * 100} onChange={(v) => setI({ mix: { ...input.mix, [u]: Math.max(0, v) / 100 } })} min={0} max={100} step={5} unit="%" />
              <NumberField label="Size" value={input.sizes[u]} onChange={(v) => setI({ sizes: { ...input.sizes, [u]: Math.max(20, Math.min(250, v)) } })} step={5} unit="m²" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Corridor width" value={input.corridor} onChange={(v) => setI({ corridor: Math.max(1.2, Math.min(4, v)) })} step={0.1} unit="m" />
            <NumberField label="Hotel room width" value={input.keyWidth} onChange={(v) => setI({ keyWidth: Math.max(3, Math.min(8, v)) })} step={0.1} unit="m" />
          </div>
          <div className="flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Mix, sizes, corridor and room width are team presets; edit them to your scheme.</span></div>
        </div>
      </Section>
      <Section title="Activity programme (public floors)">
        <div className="text-[11px] font-medium">Amenity floors and sky lobbies</div>
        <ActivityRows list={input.amenity} onChange={(amenity) => setI({ amenity })} />
        {t.skyRoom && <>
          <div className="mt-2 text-[11px] font-medium">Public sky room (level {t.skyRoom.level})</div>
          <ActivityRows list={input.skyRoom} onChange={(skyRoom) => setI({ skyRoom })} />
          <p className="mt-1 text-[10px] text-muted">The sky room's egress load and visitor numbers stay with the sky room check (posted limit, visitor share); these activities set what the room holds and its capacity at a comfortable density.</p>
        </>}
        <p className="mt-1 text-[10px] text-muted">m²/person: comfort density (team). Egress: the factor egress uses (Table 3.1.17.1 where one fits: dining 1.2, standing 0.4, office 9.3; lounge and fitness 4.6, team). A denser activity, say a lounge that serves food at 1.2, can double the stair width.</p>
      </Section>
    </>
  )
}
