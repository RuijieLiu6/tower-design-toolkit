// The interior Sun & Wind Studio tools (ventilation, air flow, indoor temperature, form, glazing, PV), registered with
// the runner (lib/swRun.ts addRuns). Each reads the façade zones of its tower.
import { formStudy, RATE_L, WARP_OVERLAP, WARP_STEP_MAX } from '../engine/sw/form'
import { glazingStudy, towerWWR } from '../engine/sw/glazing'
import { zonesOf } from '../engine/sw/plate'
import { photovoltaics } from '../engine/sw/pv'
import { thermalFloor, THERM_SYS, type ThermSys } from '../engine/sw/thermal'
import { airFlow, periodWind, ventHours, ventTower } from '../engine/sw/vent'
import { FULL_YEAR } from '../engine/sw/climate'
import { addRuns, allFloors, key, LOSS_COL, planFloor, rule, T_COL, T_NAME, useSwOut } from './swRun'

const pc = (v: number) => `${Math.round(v * 100)}%`
const fmt = (v: number) => Math.round(v).toLocaleString()

addRuns({
  'built.sw-form': (inp) => {
    const per = allFloors(inp).map(({ t, floors }) => ({ t, F: formStudy(floors, t.height) }))
    const F = per.sort((a, b) => b.F.gfa - a.F.gfa)[0]?.F
    if (!F) return { data: {}, rules: [] }
    return {
      data: { per, F },
      keys: [
        key('sw-form-rate', 'Form rating', 'A to E', RATE_L[F.overall], F.overall <= 1 ? 'pass' : F.overall <= 2 ? 'warn' : 'fail', 'A is a compact shaft; D and E lose heat to voids, steps and terraces.', { rating: F.overall }),
        key('sw-form-ff', 'Form factor', 'skin / floor', F.ff.toFixed(2), F.ff <= 0.3 ? 'pass' : F.ff <= 0.4 ? 'warn' : 'fail', 'm² of envelope per m² of floor; 0.30 or less is compact.', { bar: { max: 0.6, v: Math.min(0.6, F.ff), zone: [0, 0.3], ticks: [[0.3, '0.30']] } }),
        key('sw-form-heat', 'Heat loss', 'vs square shaft', `${Math.round(F.relHeat * 100)}%`, F.relHeat <= 1.1 ? 'pass' : F.relHeat <= 1.3 ? 'warn' : 'fail', `Against a ${F.side.toFixed(0)} m square shaft of the same height and volume (100%).`, { bar: { max: 1.6, v: Math.min(1.6, F.relHeat), zone: [0, 1.1], ticks: [[1, '100%']] } }),
      ],
      rules: [
        rule('sw-form-rate', 'Form rating', RATE_L[F.overall], 'A or B is efficient', F.overall <= 1 ? 'pass' : F.overall <= 2 ? 'warn' : 'fail', 'A is a compact shaft; D and E lose heat to voids, steps and terraces.'),
        rule('sw-form-ff', 'Envelope per floor area', F.ff.toFixed(2), '0.30 or less is compact', F.ff <= 0.3 ? 'pass' : F.ff <= 0.4 ? 'warn' : 'fail', F.warpSteps ? `${F.warpSteps} storey step${F.warpSteps > 1 ? 's' : ''} read as a twisting or leaning skin: counted as warped wall (+${fmt(F.warped)} m²), not as terraces and soffits (same plate area, upper plate on at least ${Math.round(WARP_OVERLAP * 100)}% of the lower, no step over ${WARP_STEP_MAX} m; team values).` : undefined),
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
      keys: [
        key('sw-wwr', 'Window-to-wall', 'ASHRAE 90.1', pc(wwr), wwr <= 0.4 ? 'pass' : 'warn', 'Glazing as a share of the gross wall. Above 40% the ASHRAE 90.1 prescriptive path no longer applies and the energy performance path is needed.', { bar: { max: 1, v: wwr, zone: [0, 0.4], ticks: [[0.4, '40% max']] } }),
        ...(G ? [key('sw-blocked', 'Sun blocked', 'by devices', pc(G.blocked), 'unknown', `${fmt(G.shTot)} kWh of beam through the glass a year after the shading devices, ${fmt(G.unTot)} without.`, { bar: { max: 1, v: G.blocked } })] : []),
        ...(glare ? [key('sw-glare', 'Low-sun glare', 'worst zone', fmt(glare.glare), glare.glare <= 200 ? 'pass' : glare.glare <= 400 ? 'warn' : 'fail', `${glare.label}: hours a year the sun is under 25° in front of the zone and more than half the beam gets past its device.`, { unit: 'h', bar: { max: Math.max(600, glare.glare * 1.1), v: glare.glare, zone: [0, 200], ticks: [[200, '200 h']] } })] : []),
      ],
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
    const roofK = per.reduce((a, p) => a + p.P.roofKwh, 0), facK = per.reduce((a, p) => a + p.P.facadeKwh, 0)
    return {
      data: { per, tot, kwp, share },
      keys: [
        key('sw-pv-yield', 'PV electricity', `${kwp.toFixed(0)} kWp`, fmt(tot / 1000), 'unknown', `Roof ${pc(s.pv.roof)} covered plus PV spandrels, ${pc(s.pv.eff)} modules, performance ratio ${s.pv.pr}. The bar splits roof and façade.`, { unit: 'MWh/yr', ...(tot > 0 ? { stack: { parts: [roofK / tot, facK / tot], colors: ['#1F3A5F', '#4C7FB8'], names: ['roof', 'façade'] } } : {}) }),
        ...(share != null ? [key('sw-pv-share', 'Of the electricity', '', pc(share), 'unknown', "Against the Energy use tool's electricity for the year.", { bar: { max: 1, v: Math.min(1, share) } })] : []),
      ],
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
    const reqMax = H ? Math.max(H.achMed, H.reqACH) * 1.3 || 1 : 1
    return {
      data: { per },
      keys: V.operable ? [
        key('sw-vent-free', 'Openable area', 'ASHRAE 62.1', `${V.freePct.toFixed(1)}%`, V.freePct >= 4 ? 'pass' : 'fail', `Free opening area as a share of the floor it serves, on floors with operable windows. ASHRAE 62.1 asks at least 4%; ${V.meet4} of ${V.operable} floors meet it.`, { bar: { max: Math.max(8, V.freePct * 1.2), v: V.freePct, zone: [4, Math.max(8, V.freePct * 1.2)], ticks: [[4, '4% min']] } }),
        key('sw-vent-8m', 'Within 8 m', 'ASHRAE 62.1', pc(V.within8), V.within8 >= 0.95 ? 'pass' : 'warn', 'Share of the operable floor area within 8 m of an operable opening. ASHRAE 62.1 asks every point of a naturally ventilated space to be.', { bar: { max: 1, v: V.within8, zone: [0.95, 1], ticks: [[0.95, 'all']] } }),
        ...(H ? [
          key('sw-vent-hours', 'Window hours', 'ASHRAE 55', pc(H.share), 'unknown', `Share of the year's hours when opening the windows keeps the floor in the comfort band (${H.adaptive ? 'ASHRAE 55 adaptive' : 'fixed band'}); mechanical cooling covers the rest. Usable to ${H.all ? 'the top' : `level ${H.limit}`}.`, { bar: { max: 1, v: H.share } }),
          key('sw-vent-ach', 'Air changes', 'when open', H.achMed.toFixed(1), H.achMed >= H.reqACH ? 'pass' : 'warn', `Median air changes an hour from wind and stack while the windows are open; the outdoor-air rate needs ${H.reqACH.toFixed(1)}.`, { unit: '/h', bar: { max: reqMax, v: Math.min(reqMax, H.achMed), zone: [H.reqACH, reqMax], ticks: [[H.reqACH, 'fresh air']] } }),
          key('sw-vent-fresh', 'Fresh air met', 'open hours', pc(H.fresh), H.fresh >= 0.9 ? 'pass' : 'warn', 'Share of the open hours that also reach the outdoor-air rate.', { bar: { max: 1, v: H.fresh, zone: [0.9, 1], ticks: [[0.9, '90%']] } }),
        ] : []),
      ] : [key('sw-vent-none', 'Openable area', 'ASHRAE 62.1', 'none', 'fail', 'No façade zone has operable windows: set one in Façade zones.')],
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
      keys: !A.on ? [key('sw-air-closed', `Windows on level ${pf.f.level}`, 'air flow', 'closed', 'warn', A.why || 'The windows stay shut at this height.')] : [
        key('sw-air-still', 'Still air', `level ${pf.f.level}`, pc(A.still), A.still <= 0.25 ? 'pass' : A.still <= 0.5 ? 'warn' : 'fail', `Share of the floor under 0.05 m/s. Wind from ${Math.round(wind.dir)}°, ${wind.speed.toFixed(1)} m/s at 10 m.`, { bar: { max: 1, v: A.still, zone: [0, 0.25], ticks: [[0.25, '25%']] } }),
        key('sw-air-ach', 'Air changes', A.breath ? 'one side' : 'cross', A.ach.toFixed(1), 'unknown', `${(A.Q * 1000).toFixed(0)} L/s through the openings (orifice flow, discharge coefficient 0.6).`, { unit: '/h', bar: { max: Math.max(10, A.ach * 1.2), v: A.ach } }),
        key('sw-air-mean', 'Mean air speed', '', A.mean.toFixed(2), A.mean <= 0.8 ? 'pass' : 'warn', 'Over 0.8 m/s papers lift; under 0.1 m/s the air feels still.', { unit: 'm/s', bar: { max: 1.2, v: Math.min(1.2, A.mean), zone: [0.1, 0.8], ticks: [[0.1, ''], [0.8, '0.8']] } }),
      ],
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
    // The same floor with each option (study.js thermalSectionHTML sysRows): comfort bins by area, heating and cooling.
    const sysRows = (Object.keys(THERM_SYS) as ThermSys[]).map((sy) => {
      const X = sy === s.system ? T : thermalFloor(pf.f, floors, zonesOf(pf.t), inp.C!, { sys: sy })
      const A = X.zones.reduce((a, z) => a + z.area, 0) || 1
      return { sys: sy, label: THERM_SYS[sy].name, parts: [0, 1, 2, 3, 4].map((i) => X.zones.reduce((a, z) => a + (z.occN ? z.bins[i] / z.occN : 0) * z.area, 0) / A), heat: X.zones.reduce((a, z) => a + z.heat, 0) / A, cool: X.zones.reduce((a, z) => a + z.cool, 0) / A }
    })
    const now = sysRows.find((r) => r.sys === s.system)!
    const L = T.loss, lt = L.total || 1
    return {
      data: { T, pf, k, sysRows },
      keys: [
        key('sw-temp-over', 'Over 26 °C', `${hot.name.toLowerCase()} zone`, fmt(hot.over26), hot.overShare <= 0.05 ? 'pass' : hot.overShare <= 0.1 ? 'warn' : 'fail', `Occupied hours over 26 °C in the warmest zone of level ${pf.f.level}; under 5% of occupied hours is the aim.`, { unit: 'h', bar: { max: 0.2, v: Math.min(0.2, hot.overShare), zone: [0, 0.05], ticks: [[0.05, '5%']] } }),
        key('sw-temp-comfort', 'Comfortable', '20–26 °C', pc(now.parts[2]), now.parts[2] >= 0.8 ? 'pass' : now.parts[2] >= 0.6 ? 'warn' : 'fail', `Occupied hours of level ${pf.f.level} by operative temperature, weighted by zone area, with ${THERM_SYS[s.system].name.toLowerCase()}.`, { stack: { parts: now.parts, colors: T_COL, names: T_NAME } }),
        key('sw-temp-loss', 'Heat loss', 'by path', T.loss.perM2.toFixed(0), 'unknown', 'Glass, walls, roofs and soffits, ventilation, leaks: summed over the hours the inside is warmer than the outside.', { unit: 'kWh/m²', stack: { parts: [L.glass / lt, L.wall / lt, L.roof / lt, L.vent / lt, L.infil / lt], colors: [LOSS_COL.glass, LOSS_COL.wall, LOSS_COL.roof, LOSS_COL.vent, LOSS_COL.infil], names: ['glass', 'walls', 'roofs', 'ventilation', 'leaks'] } }),
      ],
      rules: [
        rule('sw-temp-over', `Overheating, level ${pf.f.level} (${hot.name})`, `${fmt(hot.over26)} h over 26 °C`, 'under 5% of occupied hours', hot.overShare <= 0.05 ? 'pass' : hot.overShare <= 0.1 ? 'warn' : 'fail', undefined, { label: 'ISO 13790 5R1C per zone; ASHRAE 55' }),
        rule('sw-temp-loss', 'Heat loss of the floor', `${T.loss.perM2.toFixed(0)} kWh/m²`, 'reading', 'unknown', `Glass ${pc(T.loss.glass / T.loss.total)}, walls ${pc(T.loss.wall / T.loss.total)}, ventilation and leaks ${pc((T.loss.vent + T.loss.infil) / T.loss.total)}.`),
      ],
    }
  },
})

function doyOfHour(m: number, d: number) { const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let n = 0; for (let i = 0; i < m; i++) n += days[i]; return n + d }
