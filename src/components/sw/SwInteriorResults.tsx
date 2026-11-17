// Drawings of the interior Sun & Wind Studio tools (ventilation, air flow, indoor temperature, form, glazing, PV).
// InteriorDrawings are each tool's main figures (also shown beside the analysis view); InteriorMore are the secondary
// ones, folded, for the results panel.
import { useMemo, useState } from 'react'
import { RATE_COL, RATE_L, type FormStudy } from '../../engine/sw/form'
import type { GlazingStudy } from '../../engine/sw/glazing'
import { ORI, zonesOf, type Face, type SwFloor } from '../../engine/sw/plate'
import type { PvStudy } from '../../engine/sw/pv'
import { THERM_SYS, type ThermalFloor, type ThermSys } from '../../engine/sw/thermal'
import { ventFloor, type AirFlow, type VentHours, type VentTower } from '../../engine/sw/vent'
import type { Tower } from '../../engine/types'
import { useSwInputs } from '../../lib/swInputs'
import { LOSS_COL, planFloor, T_COL, T_NAME, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import FloorPlan, { RAMPS, RampKey } from './FloorPlan'
import { BarRows, Chips, FACE_C, fmtI, Fold, Gauge, HeatMap, MONTH_L, MONTH_N, MonthRange, MonthStack, PV_C, Radar, RAMP, StackRows, SUN_C, WIND_C, YearMap } from './SwCharts'
import { FloorBars, LevelPick, SwFig } from './SwResults'
import { ImpactHead, Tile } from './SwExterior'

const FACE_W: Record<Face, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }
const SHORT: Record<string, string> = { 'Compactness vs square prism': 'Compactness', 'Exposed roofs and soffits': 'Roofs, soffits', 'Solar-facing façade': 'Solar-facing', 'North-facing façade': 'North-facing', 'Daylit floor area': 'Daylit area', 'Surface-to-volume': 'Surface / volume' }
const short = (k: string) => SHORT[k] ?? k

/** Massing efficiency, as the Studio reads it (energy.js formHTML): the rating, heat loss against a square shaft and
 *  the envelope; the headline; the form profile beside the façade by orientation; the eight measures. */
function FormBody({ F }: { F: FormStudy }) {
  return (
    <>
      <ImpactHead what="Massing efficiency" color="#B0568F" note="live from the massing" />
      <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[26rem]:grid-cols-3" data-testid="form-tiles">
        <div className="min-w-0 rounded-lg border border-line bg-white p-2.5" data-tile="Overall">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted">Overall</p>
          <p className="mt-1"><span className="inline-block rounded-md px-2.5 py-0.5 font-mono text-lg font-bold text-white" style={{ background: RATE_COL[F.overall] }}>{RATE_L[F.overall]}</span></p>
          <p className="mt-0.5 text-meta leading-snug text-muted">form-only rating, A best</p>
        </div>
        <Tile name="Heat loss vs compact prism" value={`${Math.round(F.relHeat * 100)}%`} sub={`${F.relHeat > 1 ? '+' : ''}${Math.round((F.relHeat - 1) * 100)}% against a ${F.side.toFixed(0)} m square shaft`} over={F.relHeat > 1.15} />
        <Tile name="Envelope" value={fmtI(F.env)} unit="m²" sub={`${fmtI(F.facTot)} façade · ${fmtI(F.roof + F.soffit)} roofs and soffits`} />
      </div></div>
      <p className="border-l-[3px] border-[#B0568F] bg-white py-1.5 pl-2.5 pr-2 text-xs leading-snug text-ink" data-testid="form-headline">
        Overall form rating <b>{RATE_L[F.overall]}</b>: the massing would lose {Math.round(F.relHeat * 100)}% of the heat a {F.side.toFixed(0)} m square shaft of the same height and volume would, at the same construction.
      </p>
      <div className="@container"><div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
        <SwFig explain title={`Form profile · rating ${F.letter}`} caption="Eight measures, A to E; the rim is an A." tip="Eight form metrics rated A to E for supertall towers; the fuller the shape, the more efficient the form.">
          <Radar label="Form profile: eight measures rated A to E" color={RATE_COL[F.overall]} items={F.metrics.map((m) => ({ label: short(m.k), t: (4 - m.r) / 4, color: RATE_COL[m.r], text: `${m.fmt} · ${RATE_L[m.r]}` }))} />
        </SwFig>
        <SwFig explain title="Façade by orientation" caption={`Solar-facing ${Math.round(F.south * 100)}%, north ${Math.round(F.north * 100)}%.`} tip="Façade area facing each way. Solar-facing is south plus half of east and west: 40–55% is balanced; north at most 25%.">
          <BarRows label="Façade area by orientation" labelW={44} textW={84} rows={ORI.map((o) => ({ label: FACE_W[o], v: F.fac[o], color: FACE_C[o], text: `${fmtI(F.fac[o])} m² · ${Math.round((F.fac[o] / Math.max(1, F.facTot)) * 100)}%` }))} />
        </SwFig>
      </div></div>
      <SwFig explain title="Form metrics" caption="Bar: rating, A longest. Hover: benchmark." tip="Benchmarks: form factor ≤ 0.30 compact; surface-to-volume ≤ 0.09 for towers; heat-loss index ≤ 0.25 W/m²K; daylit area ≥ 75% within 6 m of a façade; solar-facing 40–55%; north ≤ 25%; roofs and soffits ≤ 3% of floor area.">
        <BarRows label="Form measures rated A to E" labelW={84} textW={96} max={4.3} rows={F.metrics.map((m) => ({ label: short(m.k), v: 4.3 - m.r, color: RATE_COL[m.r], text: `${m.fmt.split(' · ')[0]} · ${RATE_L[m.r]}`, tip: `${m.k}: ${m.fmt} (${RATE_L[m.r]}); benchmark ${m.bench}` }))} />
      </SwFig>
    </>
  )
}
function FormMore({ F }: { F: FormStudy }) {
  return (
    <>
      <Fold title="Against a square shaft">
        <SwFig title="Against a square shaft" caption={`Tick: a ${F.side.toFixed(0)} m square shaft, same volume.`}>
          <BarRows label="Envelope and heat loss against a square prism" labelW={70} max={Math.max(1.6, F.relEnv, F.relHeat) * 1.05} rows={[
            { label: 'Envelope', v: F.relEnv, mark: 1, color: F.relEnv <= 1.1 ? RATE_COL[0] : F.relEnv <= 1.3 ? RATE_COL[2] : RATE_COL[4], text: `${Math.round(F.relEnv * 100)}% · ${fmtI(F.env)} m²` },
            { label: 'Heat loss', v: F.relHeat, mark: 1, color: F.relHeat <= 1.1 ? RATE_COL[0] : F.relHeat <= 1.3 ? RATE_COL[2] : RATE_COL[4], text: `${Math.round(F.relHeat * 100)}%` },
          ]} />
        </SwFig>
      </Fold>
      <Fold title="Envelope by kind">
        <SwFig title="Envelope by kind · m²" caption="Area of each kind of envelope." tip="Walls, roofs and terraces, soffits, the ground slab.">
          <BarRows label="Envelope area by kind" labelW={84} rows={[{ label: 'Walls', v: F.facTot, color: '#A0857A', text: fmtI(F.facTot) }, { label: 'Roofs, terraces', v: F.roof, color: '#7C6A8E', text: fmtI(F.roof) }, { label: 'Soffits', v: F.soffit, color: '#B7C3CE', text: fmtI(F.soffit) }, { label: 'Ground slab', v: F.slab, color: '#cfd4da', text: fmtI(F.slab) }]} />
        </SwFig>
      </Fold>
    </>
  )
}

const zl = (s: string) => s.replace('North', 'N').replace('East', 'E').replace('South', 'S').replace('West', 'W')
function GlazingBody({ G }: { G: GlazingStudy }) {
  return (
    <>
      <SwFig title="Heat through glass · MWh" caption="Solid: with shading. Dashed: without." tip="Solid: with the zone's shading; dashed: the same glass unshaded.">
        <BarRows label="Beam solar gain by façade zone, with and without devices" labelW={92} textW={64} rows={G.zones.map((z) => ({ label: zl(z.label), v: z.sh / 1000, v2: z.un / 1000, color: SUN_C, text: `${Math.round(z.sh / 1000)} / ${Math.round(z.un / 1000)}`, tip: `${z.label} · ${z.stratName}: ${fmtI(z.sh)} kWh with the device, ${fmtI(z.un)} without (${Math.round((1 - z.sh / Math.max(1, z.un)) * 100)}% blocked)` }))} />
      </SwFig>
      <SwFig title="Low-sun glare hours" caption="Sun under 25° past the device. Tick: 200 h." tip="Hours a year the sun is under 25° in front of the face and gets past the device.">
        <BarRows label="Low-sun glare hours by façade zone" labelW={92} textW={44} rows={G.zones.map((z) => ({ label: zl(z.label), v: z.glare, mark: 200, color: z.glare > 400 ? '#c53030' : z.glare > 200 ? '#e08a3c' : '#86b86a', text: `${Math.round(z.glare)} h` }))} />
      </SwFig>
    </>
  )
}
function GlazingMore({ G }: { G: GlazingStudy }) {
  const n = G.zones.length
  const vals = useMemo(() => { const v = new Float32Array(12 * n); G.zones.forEach((z, i) => z.monSh.forEach((x, m) => { v[i * 12 + m] = z.areaGl > 0 ? x / z.areaGl : 0 })); return v }, [G, n])
  const mx = Math.max(1, ...Array.from(vals))
  return (
    <>
      <Fold title="Heat by month">
        <SwFig title="Heat through glass by month" caption="kWh per m² of glass. Row: façade zone." tip="kWh per m² of glass after the devices; each row a façade zone.">
          <HeatMap cols={12} rows={n} values={vals} color={(v) => RAMP.kwh(v / mx)} label="Solar heat through the glass by zone and month" months={false} left={74} height={Math.max(24, n * 13)}
            rowTicks={G.zones.map((z, i) => [i, zl(z.label)] as [number, string])} colTicks={MONTH_L.map((m, i) => [i, m] as [number, string])} cell={(c, r) => `${zl(G.zones[r].label)} · ${MONTH_N[c]}`} legend={[[0, '0'], [mx, `${Math.round(mx)}`]]} read={(v) => `${v.toFixed(1)} kWh/m²`} />
        </SwFig>
      </Fold>
      <Fold title="By face">
        <SwFig title="Glazing by face" caption="Window-to-wall ratio. Tick: 40%." tip="Window-to-wall ratio; tick: the ASHRAE 90.1 prescriptive 40%.">
          <BarRows label="Window-to-wall ratio by face" labelW={44} max={1} rows={ORI.map((o) => ({ label: FACE_W[o], v: G.wwrByFace[o], mark: 0.4, color: '#78A6CC', text: `${Math.round(G.wwrByFace[o] * 100)}%` }))} />
        </SwFig>
        <SwFig title="Heat by face · MWh" caption="Solid: with devices. Dashed: without." tip="Solid: with devices; dashed: without.">
          <BarRows label="Beam solar gain by face" labelW={44} rows={ORI.map((o) => ({ label: FACE_W[o], v: G.byFace[o].sh / 1000, v2: G.byFace[o].un / 1000, color: FACE_C[o], text: `${Math.round(G.byFace[o].sh / 1000)} / ${Math.round(G.byFace[o].un / 1000)}` }))} />
        </SwFig>
      </Fold>
    </>
  )
}

function PvBody({ P }: { P: PvStudy }) {
  return (
    <SwFig title="PV yield · MWh a year" caption={`${P.kwpTot.toFixed(0)} kWp; roof sun ${Math.round(P.roofIrr)} kWh/m².`}>
      <BarRows label="PV yield by surface" labelW={92} textW={84} rows={P.rows.map((r) => ({ label: zl(r.name), v: r.kwh / 1000, color: r.zone === 'roof' ? PV_C : '#4C7FB8', text: `${Math.round(r.kwh / 1000)} · ${Math.round(r.perM2)} kWh/m²`, tip: `${r.name}: ${fmtI(r.kwh)} kWh a year from ${fmtI(r.area)} m² of panel (${r.kwp.toFixed(0)} kWp)` }))} />
    </SwFig>
  )
}
function PvMore({ P }: { P: PvStudy }) {
  return (
    <Fold title="Roof and faces">
      <SwFig title="PV by roof and face · MWh" caption="Roof panels and spandrels by face." tip="Spandrel panels by the face they sit on.">
        <BarRows label="PV yield by roof and face" labelW={44} rows={[{ label: 'Roof', v: P.roofKwh / 1000, color: PV_C, text: `${Math.round(P.roofKwh / 1000)} MWh` }, ...ORI.map((o) => ({ label: FACE_W[o], v: P.byFace[o] / 1000, color: FACE_C[o], text: `${Math.round(P.byFace[o] / 1000)} MWh` }))]} />
      </SwFig>
    </Fold>
  )
}

function NatVentBody({ V, H }: { V: VentTower; H: VentHours | null }) {
  const inp = useSwInputs()
  const s = useSwStudy()
  const pf = useMemo(() => planFloor(inp, s), [inp, s.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const vf = useMemo(() => (pf ? ventFloor(pf.f, zonesOf(pf.t), { dir: 90, speed: 4 }, s.vent) : null), [pf, s.vent])
  const reach = useMemo(() => (vf ? Float32Array.from(vf.near, (d) => (d < 0 ? 99 : d * vf.cell)) : null), [vf])
  return (
    <>
      {H && <SwFig title="Window hours by month" caption="Bars: windows open. Line: hours in month." tip="Bars: hours the windows keep the floor comfortable. Line: hours in the month.">
        <MonthStack label="Ventilation hours by month" unit="h" series={[{ name: 'windows open', color: WIND_C, values: H.rows.map((r) => r.vent ?? 0) }]} need={{ name: 'hours in the month', color: '#9aa1aa', values: H.rows.map((r) => r.hours) }} />
      </SwFig>}
      <SwFig title="Floor within 8 m of a window" caption="Share of each floor. Dashed: all of it." tip="Share of each floor within 8 m of an openable window; dashed: all of it.">
        <FloorBars label="Within 8 m by floor" rows={V.rows.map((r) => ({ level: r.level, v: r.within8 }))} mark={1} color="#2a9fc4" fmt={(v) => `${Math.round(v * 100)}%`} />
      </SwFig>
      {pf && vf && reach && <SwFig title={`L${pf.f.level} · reach of the openings`} caption={`${Math.round(vf.within8 * 100)}% within 8 m; ${vf.freePct.toFixed(1)}% openable.`}>
        <LevelPick levels={pf.levels} />
        <FloorPlan f={pf.f} zones={zonesOf(pf.t)} grid={{ x0: vf.x0, y0: vf.y0, h: vf.cell, nx: vf.nx, ny: vf.ny }} values={reach} ramp={RAMPS.reach} label="Reach plan" />
        <RampKey ramp={RAMPS.reach} />
      </SwFig>}
    </>
  )
}
function NatVentMore({ V, H }: { V: VentTower; H: VentHours | null }) {
  const amax = H ? Math.max(1, H.reqACH, ...H.floors.map((f) => f.achMed)) : 1
  return (
    <>
      {H && <Fold title="Through the year">
        <SwFig title="Windows open · day × hour" caption="Share of floors with windows open." tip="Share of operable floors with windows open: comfortable, not gusty, no heavy rain.">
          <YearMap hourly={H.grid} color={RAMP.open} label="Share of operable floors with windows open by day and hour" legend={[[0, 'none'], [1, 'all']]} read={(v) => `${Math.round(v * 100)}% of floors open`} />
        </SwFig>
      </Fold>}
      {H && H.floors.length > 0 && <Fold title="By floor">
        <SwFig title="Window hours by floor" caption="Share of the year, falling with height." tip="Falls with height as the wind strengthens.">
          <FloorBars label="Share of hours with windows open by floor" rows={H.floors.map((f) => ({ level: f.level, v: f.share }))} max={Math.max(0.1, ...H.floors.map((f) => f.share))} color={WIND_C} fmt={(v) => `${Math.round(v * 100)}%`} />
        </SwFig>
        <SwFig title="Air changes by floor" caption="Median per hour. Dashed: fresh-air rate." tip="Median air changes an hour; dashed: the outdoor-air rate.">
          <FloorBars label="Median air changes an hour by floor" rows={H.floors.map((f) => ({ level: f.level, v: f.achMed, tip: `L${f.level}: ${f.achMed.toFixed(1)} /h, fresh air met ${Math.round(f.fresh * 100)}% of open hours` }))} max={amax} mark={H.reqACH} color="#5FB7BE" fmt={(v) => v.toFixed(1)} />
        </SwFig>
      </Fold>}
      {V.operable > 0 && <Fold title="ASHRAE 62.1 openable area">
        <SwFig title="Openable area" caption={`${V.meet4} of ${V.operable} floors meet the 4% rule.`} tip="Free opening area as a share of the floor served, on a scale to 10%. ASHRAE 62.1 asks at least 4%.">
          <Gauge v={Math.min(1, V.freePct / 10)} good="high" label="Openable area against the 4% rule" read={`${V.freePct.toFixed(1)}% of the floor`} marks={[{ v: 0.4, label: 'rule · 4% of floor' }]} />
          <FloorBars label="Openable area by floor" rows={V.rows.map((r) => ({ level: r.level, v: r.freePct }))} max={Math.max(8, ...V.rows.map((r) => r.freePct))} mark={4} color="#2a9fc4" fmt={(v) => `${v.toFixed(0)}%`} />
        </SwFig>
      </Fold>}
    </>
  )
}

export function AirFlowPlan({ A, f, t }: { A: AirFlow; f: SwFloor; t: Tower }) {
  return (
    <FloorPlan f={f} zones={zonesOf(t)} grid={{ x0: A.x0, y0: A.y0, h: A.cell, nx: A.nx, ny: A.ny }} values={A.spd} ramp={RAMPS.speed} label="Air flow plan">
      {A.seeds.map((p, i) => { const L = 1.6, n = Math.hypot(p.ux, p.uy) || 1, ux = p.ux / n, uy = p.uy / n; const bx = p.x + ux * L, by = p.y + uy * L
        return <g key={i} stroke="#1f5f8b" strokeWidth={0.18} fill="#1f5f8b"><line x1={p.x} y1={-p.y} x2={bx} y2={-by} /><path d={`M${bx},${-by}L${bx - ux * 0.5 - uy * 0.3},${-(by - uy * 0.5 + ux * 0.3)}L${bx - ux * 0.5 + uy * 0.3},${-(by - uy * 0.5 - ux * 0.3)}Z`} stroke="none" /></g> })}
    </FloorPlan>
  )
}
function AirFlowMore({ A }: { A: AirFlow }) {
  const inQ = { N: 0, E: 0, S: 0, W: 0 }, outQ = { N: 0, E: 0, S: 0, W: 0 }
  for (const l of A.links) { if (l.kind !== 'win' || !l.o || !l.q) continue; if (l.q > 0) inQ[l.o] += l.q; else outQ[l.o] -= l.q }
  const tot = ORI.reduce((a, o) => a + inQ[o], 0) || 1
  if (!A.on || !ORI.some((o) => inQ[o] + outQ[o] > 0)) return null
  return (
    <Fold title="Air in and out">
      <SwFig title="Air in by face" caption="Share of the air coming in." tip="Share of the air that comes in through each face's windows.">
        <BarRows label="Air in by face" labelW={44} max={1} rows={ORI.map((o) => ({ label: FACE_W[o], v: inQ[o] / tot, color: '#1F7FA6', text: `${Math.round((inQ[o] / tot) * 100)}%` }))} />
      </SwFig>
      <SwFig title="Air out by face" caption="Share of the air going out." tip="Share of the air that leaves through each face's windows.">
        <BarRows label="Air out by face" labelW={44} max={1} rows={ORI.map((o) => ({ label: FACE_W[o], v: outQ[o] / tot, color: '#E07A2E', text: `${Math.round((outQ[o] / tot) * 100)}%` }))} />
      </SwFig>
    </Fold>
  )
}

export function TempPlan({ T, f, t }: { T: ThermalFloor; f: SwFloor; t: Tower }) {
  const values = useMemo(() => Float32Array.from(T.zid, (z) => (z < 0 ? NaN : T.zones.find((q) => q.idx === z)?.Tk ?? NaN)), [T])
  return <FloorPlan f={f} zones={zonesOf(t)} grid={{ x0: T.x0, y0: T.y0, h: T.cell, nx: T.nx, ny: T.ny }} values={values} ramp={RAMPS.temp} label="Indoor temperature plan" />
}
type SysRow = { sys: ThermSys; label: string; parts: number[]; heat: number; cool: number }
function TempMore({ T, level, sysRows }: { T: ThermalFloor; level: number; sysRows: SysRow[] }) {
  const hot = T.zones.reduce((a, z) => (z.overShare > a.overShare ? z : a), T.zones[0])
  const [pick, setPick] = useState<string | null>(null)
  const zone = T.zones.find((z) => z.key === pick) ?? hot
  const L = T.loss
  return (
    <>
      {sysRows?.length > 0 && <Fold title="Each heating and cooling option">
        <SwFig title={`L${level} · with each option`} caption="Occupied hours by temperature." tip="Occupied hours by temperature; heating and cooling in the hover text.">
          <StackRows label="Comfort with each heating and cooling option" labelW={104} colors={T_COL} names={T_NAME} rows={sysRows.map((r) => ({ label: r.label.replace('No heating or cooling', 'Nothing').replace('Heating and ', 'Heating + '), parts: r.parts, text: `heating ${r.heat.toFixed(0)}${r.cool > 0.5 ? `, cooling ${r.cool.toFixed(0)}` : ''} kWh/m²` }))} />
          <Chips items={T_NAME.map((n, i) => ({ name: n, color: T_COL[i] }))} />
        </SwFig>
        <SwFig title="Heating, cooling · kWh/m²" caption="Solid: heating. Dashed: cooling." tip="Solid: heating; dashed: cooling.">
          <BarRows label="Heating and cooling by option" labelW={104} textW={50} rows={sysRows.map((r) => ({ label: r.label.replace('No heating or cooling', 'Nothing').replace('Heating and ', 'Heating + '), v: r.heat, v2: r.cool, color: '#c2410c', text: `${r.heat.toFixed(0)} / ${r.cool.toFixed(0)}` }))} />
        </SwFig>
      </Fold>}
      <Fold title="By month">
        {T.zones.map((z) => <SwFig key={z.key} title={`${z.name} · indoor °C by month`} caption="Bar: low to high. Dot: mean. Green: 20–26°." tip="Bar: lowest to highest; dot: mean; green: 20–26 °C.">
          <MonthRange label={`${z.name} zone: monthly lowest, mean and highest indoor temperature`} unit="°C" min={z.mon.min} mean={z.mon.mean} max={z.mon.max} band={[20, 26]} color={z.key === 'C' ? '#64748b' : FACE_C[z.key as Face]} />
        </SwFig>)}
      </Fold>
      <Fold title="The year in one zone">
        <label className="flex items-center gap-2 text-meta text-muted">Zone
          <select value={zone.key} onChange={(e) => setPick(e.target.value)} className="h-7 flex-1 rounded border border-line bg-panel px-1 text-meta text-ink" aria-label="Zone shown" data-testid="sw-zone-pick">{T.zones.map((z) => <option key={z.key} value={z.key}>{z.name}{z.key === hot.key ? ' (warmest)' : ''}</option>)}</select>
        </label>
        <SwFig title={`${zone.name} · °C, day × hour`} caption="Each hour of the year in this zone." tip="Cold mornings low in winter, warm afternoons high in summer.">
          <YearMap hourly={zone.To} color={RAMP.temp} label={`Indoor temperature of the ${zone.name} zone by day and hour`} legend={[[14, '14°'], [22, '22°'], [30, '30°']]} read={(v) => `${v.toFixed(1)} °C`} />
        </SwFig>
      </Fold>
      <Fold title="Heat loss">
        <SwFig title={`L${level} · heat lost by path`} caption="kWh a year while warmer inside than out." tip="Summed over the hours the inside is warmer than the outside.">
          <BarRows label="Heat lost by path on this floor" labelW={84} rows={([['Glass', L.glass, LOSS_COL.glass], ['Walls', L.wall, LOSS_COL.wall], ['Roofs, soffits', L.roof, LOSS_COL.roof], ['Ventilation', L.vent, LOSS_COL.vent], ['Leaks', L.infil, LOSS_COL.infil]] as [string, number, string][]).filter((x) => x[1] > 0).map(([label, v, color]) => ({ label, v, color, text: `${fmtI(v)} · ${Math.round((v / (L.total || 1)) * 100)}%` }))} />
        </SwFig>
        <SwFig title="Heating by zone · kWh/m²" caption="Solid: heating. Dashed: cooling." tip="Solid: heating; dashed: cooling.">
          <BarRows label="Heating and cooling by zone" labelW={84} textW={50} rows={T.zones.map((z) => ({ label: z.name, v: z.heat / Math.max(1, z.area), v2: z.cool / Math.max(1, z.area), color: z.key === 'C' ? '#64748b' : FACE_C[z.key as Face], text: `${(z.heat / Math.max(1, z.area)).toFixed(0)} / ${(z.cool / Math.max(1, z.area)).toFixed(0)}` }))} />
        </SwFig>
      </Fold>
    </>
  )
}

export function InteriorDrawings({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  const s = useSwStudy()
  if (!out) return null
  const d = out.data as Record<string, unknown>
  if (id === 'built.sw-form' && d.F) return <FormBody F={d.F as FormStudy} />
  if (id === 'built.sw-glazing' && d.per) { const p = (d.per as { G: GlazingStudy }[])[0]; return p ? <GlazingBody G={p.G} /> : null }
  if (id === 'built.sw-pv' && d.per) { const p = (d.per as { P: PvStudy }[])[0]; return p ? <PvBody P={p.P} /> : null }
  if (id === 'built.sw-natvent' && d.per) { const p = (d.per as { V: VentTower; H: VentHours | null }[])[0]; return p ? <NatVentBody V={p.V} H={p.H} /> : null }
  if (id === 'built.sw-airflow' && d.A) {
    const pf = d.pf as { t: Tower; f: SwFloor; levels: number }, A = d.A as AirFlow
    return (
      <SwFig title={`L${pf.f.level} · air flow`} caption={A.on ? `Mean ${A.mean.toFixed(2)} m/s, ${Math.round(A.still * 100)}% still.` : 'Windows shut at this height.'} tip={A.on ? undefined : A.why}>
        <LevelPick levels={pf.levels} /><AirFlowPlan A={A} f={pf.f} t={pf.t} /><RampKey ramp={RAMPS.speed} />
      </SwFig>
    )
  }
  if (id === 'built.sw-indoor-temp' && d.T) {
    const pf = d.pf as { t: Tower; f: SwFloor; levels: number }, T = d.T as ThermalFloor
    return (
      <>
        <SwFig title={`L${pf.f.level} · °C at ${s.hour}:00, ${s.day}/${s.month + 1}`} caption="Each perimeter zone and the interior." tip="Operative temperature of each 5 m perimeter zone and the interior at that hour.">
          <LevelPick levels={pf.levels} /><TempPlan T={T} f={pf.f} t={pf.t} /><RampKey ramp={RAMPS.temp} />
        </SwFig>
        <SwFig title="Occupied hours by temperature" caption="Each zone, by operative temperature." tip="Each zone's occupied hours by operative temperature.">
          <StackRows label="Occupied hours by indoor temperature for each zone" labelW={64} colors={T_COL} names={T_NAME} rows={T.zones.map((z) => ({ label: z.name, parts: z.bins, text: `${Math.round(z.over26)} h over 26 °C, ${z.tMin.toFixed(0)}–${z.tMax.toFixed(0)} °C` }))} />
          <Chips items={T_NAME.map((n, i) => ({ name: n, color: T_COL[i] }))} />
        </SwFig>
      </>
    )
  }
  return null
}

/** The secondary figures of the interior tools, folded (results panel only). */
export function InteriorMore({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  if (!out) return null
  const d = out.data as Record<string, unknown>
  if (id === 'built.sw-form' && d.F) return <FormMore F={d.F as FormStudy} />
  if (id === 'built.sw-glazing' && d.per) { const p = (d.per as { G: GlazingStudy }[])[0]; return p ? <GlazingMore G={p.G} /> : null }
  if (id === 'built.sw-pv' && d.per) { const p = (d.per as { P: PvStudy }[])[0]; return p ? <PvMore P={p.P} /> : null }
  if (id === 'built.sw-natvent' && d.per) { const p = (d.per as { V: VentTower; H: VentHours | null }[])[0]; return p ? <NatVentMore V={p.V} H={p.H} /> : null }
  if (id === 'built.sw-airflow' && d.A) return <AirFlowMore A={d.A as AirFlow} />
  if (id === 'built.sw-indoor-temp' && d.T) return <TempMore T={d.T as ThermalFloor} level={(d.pf as { f: SwFloor }).f.level} sysRows={(d.sysRows as SysRow[]) ?? []} />
  return null
}
