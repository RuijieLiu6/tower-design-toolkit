// The interior Sun & Wind Studio tools (ventilation, air flow, indoor temperature, form, glazing, PV), registered with
// the runner (lib/swRun.ts addRuns). Each reads the façade zones of its tower.
import { formStudy, RATE_L } from '../engine/sw/form'
import { glazingStudy, towerWWR } from '../engine/sw/glazing'
import { zonesOf } from '../engine/sw/plate'
import { photovoltaics } from '../engine/sw/pv'
import { thermalFloor } from '../engine/sw/thermal'
import { airFlow, periodWind, ventHours, ventTower } from '../engine/sw/vent'
import { FULL_YEAR } from '../engine/sw/climate'
import { addRuns, allFloors, planFloor, rule, useSwOut } from './swRun'

const pc = (v: number) => `${Math.round(v * 100)}%`
const fmt = (v: number) => Math.round(v).toLocaleString()

addRuns({
  'built.sw-form': (inp) => {
    const per = allFloors(inp).map(({ t, floors }) => ({ t, F: formStudy(floors, t.height) }))
    const F = per.sort((a, b) => b.F.gfa - a.F.gfa)[0]?.F
    if (!F) return { data: {}, rules: [] }
    return {
      data: { per, F },
      rules: [
        rule('sw-form-rate', 'Form rating', RATE_L[F.overall], 'A or B is efficient', F.overall <= 1 ? 'pass' : F.overall <= 2 ? 'warn' : 'fail', 'A is a compact shaft; D and E lose heat to voids, steps and terraces.'),
        rule('sw-form-ff', 'Envelope per floor area', F.ff.toFixed(2), '0.30 or less is compact', F.ff <= 0.3 ? 'pass' : F.ff <= 0.4 ? 'warn' : 'fail'),
        rule('sw-form-heat', 'Heat lost by the form', `${Math.round(F.relHeat * 100)}%`, 'of a square shaft of the same height and volume', F.relHeat <= 1.1 ? 'pass' : F.relHeat <= 1.3 ? 'warn' : 'fail'),
      ],
    }
  },
  'built.sw-glazing': (inp) => {
    const per = allFloors(inp).map(({ t, floors }) => ({ t, G: glazingStudy(floors, zonesOf(t), inp.C!, FULL_YEAR), W: towerWWR(floors, zonesOf(t)) }))
    const glass = per.reduce((a, p) => a + p.W.glass, 0), wall = per.reduce((a, p) => a + p.W.wall, 0)
    const wwr = wall ? glass / wall : 0
    const G = per[0]?.G
    const glare = G ? G.zones.reduce((a, z) => (z.glare > a.glare ? z : a), G.zones[0]) : null
    return {
      data: { per, wwr },
      rules: [
        rule('sw-wwr', 'Window-to-wall ratio', pc(wwr), 'ASHRAE 90.1 prescriptive: at most 40%', wwr <= 0.4 ? 'pass' : 'warn', 'Over 40% needs the performance path.', { label: 'ASHRAE 90.1 prescriptive envelope' }),
        ...(G ? [rule('sw-blocked', 'Solar heat the devices block', pc(G.blocked), 'reading', 'unknown', `${fmt(G.shTot)} kWh of beam through the glass a year after devices, ${fmt(G.unTot)} without.`)] : []),
        ...(glare ? [rule('sw-glare', 'Most low-sun glare (one zone)', `${fmt(glare.glare)} h a year`, 'under 200 h', glare.glare <= 200 ? 'pass' : glare.glare <= 400 ? 'warn' : 'fail', glare.label)] : []),
      ],
    }
  },
  'built.sw-pv': (inp, s) => {
    const energy = useSwOut.getState().out['built.sw-energy']?.data.r as { elec?: number } | undefined
    const per = allFloors(inp).map(({ t, floors }) => ({ t, P: photovoltaics(floors, zonesOf(t), inp.C!, s.pv, FULL_YEAR) }))
    const tot = per.reduce((a, p) => a + p.P.pvTot, 0), kwp = per.reduce((a, p) => a + p.P.kwpTot, 0)
    const share = energy?.elec ? tot / energy.elec : null
    return {
      data: { per, tot, kwp, share },
      rules: [
        rule('sw-pv-yield', 'PV electricity a year', `${fmt(tot / 1000)} MWh`, 'reading', 'unknown', `${kwp.toFixed(0)} kWp: roof ${pc(s.pv.roof)} covered plus PV spandrels.`),
        ...(share != null ? [rule('sw-pv-share', 'Share of the building\'s electricity', pc(share), 'reading', 'unknown', 'Against the Energy use tool\'s electricity.')] : []),
      ],
    }
  },
  'built.sw-natvent': (inp, s) => {
    const per = allFloors(inp).map(({ t, floors }) => ({ t, V: ventTower(floors, zonesOf(t), s.vent), H: inp.C ? ventHours(floors, zonesOf(t), inp.C, s.vent, FULL_YEAR) : null }))
    const p = per[0]
    if (!p) return { data: {}, rules: [] }
    const V = p.V, H = p.H
    return {
      data: { per },
      rules: V.operable ? [
        rule('sw-vent-free', 'Openable area (ASHRAE 62.1)', `${V.freePct.toFixed(1)}%`, 'at least 4% of the floor', V.freePct >= 4 ? 'pass' : 'fail', undefined, { label: 'ASHRAE 62.1 natural ventilation' }),
        rule('sw-vent-8m', 'Floor within 8 m of a window', pc(V.within8), 'all of it', V.within8 >= 0.95 ? 'pass' : 'warn', undefined, { label: 'ASHRAE 62.1 natural ventilation' }),
        ...(H ? [rule('sw-vent-hours', 'Hours windows keep it comfortable', pc(H.share), 'reading', 'unknown', `${H.adaptive ? 'ASHRAE 55 adaptive' : 'fixed'} band; mechanical cooling covers the rest.`)] : []),
      ] : [rule('sw-vent-none', 'Openable area (ASHRAE 62.1)', 'none', 'at least 4% of the floor', 'fail', 'No façade zone has operable windows: set one in Façade zones.')],
    }
  },
  'built.sw-airflow': (inp, s) => {
    const pf = planFloor(inp, s)
    if (!pf) return { data: {}, rules: [] }
    const wind = inp.C ? periodWind(inp.C, FULL_YEAR) : { dir: 90, speed: 4 }
    const A = airFlow(pf.f, zonesOf(pf.t), wind, s.vent)
    return {
      data: { A, pf, wind },
      rules: !A.on ? [rule('sw-air-closed', `Windows on level ${pf.f.level}`, 'closed', 'open for natural air flow', 'warn', A.why || 'The windows stay shut at this height.')] : [rule('sw-air-still', `Still air on level ${pf.f.level}`, pc(A.still), 'less than a quarter of the floor', A.still <= 0.25 ? 'pass' : A.still <= 0.5 ? 'warn' : 'fail', A.why || `Wind from ${Math.round(wind.dir)}°, ${wind.speed.toFixed(1)} m/s at 10 m; ${A.ach.toFixed(1)} air changes an hour.`)],
    }
  },
  'built.sw-indoor-temp': (inp, s) => {
    const pf = planFloor(inp, s)
    if (!pf) return { data: {}, rules: [] }
    const floors = allFloors(inp).find((x) => x.t.id === pf.t.id)!.floors
    const k = (doyOfHour(s.month, s.day) - 1) * 24 + Math.max(0, Math.min(23, s.hour - 1))
    const T = thermalFloor(pf.f, floors, zonesOf(pf.t), inp.C!, { sys: s.system, hour: k })
    const hot = T.zones.reduce((a, z) => (z.overShare > a.overShare ? z : a), T.zones[0])
    return {
      data: { T, pf, k },
      rules: [
        rule('sw-temp-over', `Overheating, level ${pf.f.level} (${hot.name})`, `${fmt(hot.over26)} h over 26 °C`, 'under 5% of occupied hours', hot.overShare <= 0.05 ? 'pass' : hot.overShare <= 0.1 ? 'warn' : 'fail', undefined, { label: 'ISO 13790 5R1C per zone; ASHRAE 55' }),
        rule('sw-temp-loss', 'Heat loss of the floor', `${T.loss.perM2.toFixed(0)} kWh/m²`, 'reading', 'unknown', `Glass ${pc(T.loss.glass / T.loss.total)}, walls ${pc(T.loss.wall / T.loss.total)}, ventilation and leaks ${pc((T.loss.vent + T.loss.infil) / T.loss.total)}.`),
      ],
    }
  },
})

function doyOfHour(m: number, d: number) { const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let n = 0; for (let i = 0; i < m; i++) n += days[i]; return n + d }
