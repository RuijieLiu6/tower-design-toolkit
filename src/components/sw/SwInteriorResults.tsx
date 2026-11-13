// Drawings of the interior Sun & Wind Studio tools (ventilation, air flow, indoor temperature, form, glazing, PV).
import { useMemo } from 'react'
import { RATE_COL, type FormStudy } from '../../engine/sw/form'
import type { GlazingStudy } from '../../engine/sw/glazing'
import { zonesOf, type SwFloor } from '../../engine/sw/plate'
import type { PvStudy } from '../../engine/sw/pv'
import type { ThermalFloor } from '../../engine/sw/thermal'
import { ventFloor, type AirFlow, type VentHours, type VentTower } from '../../engine/sw/vent'
import type { Tower } from '../../engine/types'
import { useSwInputs } from '../../lib/swInputs'
import { planFloor, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import FloorPlan, { RAMPS, RampKey } from './FloorPlan'
import { FloorBars, LevelPick, SwFig } from './SwResults'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function HBar({ rows, unit }: { rows: { label: string; v: number; v2?: number; color: string; text: string }[]; unit: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.v, r.v2 ?? 0)))
  const W = 300, rh = 16, L = 92
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * rh + 4}`} width="100%" role="img" aria-label={unit}>
      {rows.map((r, i) => (
        <g key={i} transform={`translate(0 ${i * rh + 2})`}>
          <text x={L - 4} y={10} fontSize={8.5} textAnchor="end" fill="#1f2328">{r.label}</text>
          {r.v2 != null && <rect x={L} y={2} width={((W - L - 52) * r.v2) / max} height={9} fill="none" stroke={r.color} strokeDasharray="2 1.5" />}
          <rect x={L} y={2} width={((W - L - 52) * r.v) / max} height={9} rx={1.5} fill={r.color}><title>{r.text}</title></rect>
          <text x={W - 2} y={10} fontSize={8.5} textAnchor="end" fill="#6b7280">{r.text}</text>
        </g>
      ))}
    </svg>
  )
}

function MonthBars({ a, b, label, colA, colB }: { a: number[]; b?: number[]; label: string; colA: string; colB?: string }) {
  const W = 300, H = 80, max = Math.max(1, ...a, ...(b ?? [])), bw = (W - 8) / 12
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} width="100%" role="img" aria-label={label}>
      {a.map((v, m) => <g key={m}>
        {b && <rect x={4 + m * bw + 2} y={H - (H * b[m]) / max} width={bw - 4} height={(H * b[m]) / max} fill={colB} />}
        <rect x={4 + m * bw + 2} y={H - (H * v) / max} width={bw - 4} height={(H * v) / max} fill={colA}><title>{`${MONTHS[m]}: ${Math.round(v)} h`}</title></rect>
        <text x={4 + m * bw + bw / 2} y={H + 10} fontSize={8} textAnchor="middle" fill="#6b7280">{MONTHS[m]}</text>
      </g>)}
    </svg>
  )
}

function FormBody({ F }: { F: FormStudy }) {
  return (
    <SwFig title={`Form rating ${F.letter}`} caption="Each measure against the supertall bands; colour A (green) to E (red).">
      <HBar unit="Form measures" rows={F.metrics.map((m) => ({ label: m.k, v: 5 - m.r, color: RATE_COL[m.r], text: `${m.fmt} · ${'ABCDE'[m.r]}` }))} />
    </SwFig>
  )
}

function GlazingBody({ G, wwr }: { G: GlazingStudy; wwr: number }) {
  return (
    <>
      <SwFig title="Heat through the glass by zone" caption={`Beam solar gain a year with the devices (solid) and without (dashed). Tower WWR ${Math.round(wwr * 100)}%.`}>
        <HBar unit="kWh a year" rows={G.zones.map((z) => ({ label: z.label, v: z.sh, v2: z.un, color: '#d08b2c', text: `${Math.round(z.sh / 1000)} MWh` }))} />
      </SwFig>
      <SwFig title="Low-sun glare hours by zone" caption="Hours a year the sun is under 25° in front of the face and gets past the device.">
        <HBar unit="hours" rows={G.zones.map((z) => ({ label: z.label, v: z.glare, color: z.glare > 400 ? '#c53030' : z.glare > 200 ? '#e08a3c' : '#86b86a', text: `${Math.round(z.glare)} h` }))} />
      </SwFig>
    </>
  )
}

function PvBody({ P, share }: { P: PvStudy; share: number | null }) {
  return (
    <SwFig title="PV yield by surface" caption={`${Math.round(P.pvTot / 1000)} MWh a year${share != null ? `, ${Math.round(share * 100)}% of the building's electricity` : ''}.`}>
      <HBar unit="kWh a year" rows={P.rows.map((r) => ({ label: r.name, v: r.kwh, color: '#2f855a', text: `${Math.round(r.kwh / 1000)} MWh · ${Math.round(r.perM2)} kWh/m²` }))} />
    </SwFig>
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
      <SwFig title="Openable area and reach by floor" caption="Share of each floor within 8 m of an openable window; dashed: all of it.">
        <FloorBars label="Within 8 m by floor" rows={V.rows.map((r) => ({ level: r.level, v: r.within8 }))} mark={1} color="#2a9fc4" fmt={(v) => `${Math.round(v * 100)}%`} />
      </SwFig>
      {H && <SwFig title="Natural ventilation by month" caption="Hours opening the windows keeps the floor comfortable (dark) out of the comfortable-outside hours (light).">
        <MonthBars label="Ventilation hours by month" a={H.rows.map((r) => r.vent ?? 0)} b={H.rows.map((r) => r.comfort ?? 0)} colA="#2a9fc4" colB="#cfe8f0" />
      </SwFig>}
      {pf && vf && reach && <SwFig title={`Level ${pf.f.level} · reach of the openings`} caption={`${Math.round(vf.within8 * 100)}% within 8 m; ${vf.freePct.toFixed(1)}% of the floor openable.`}>
        <LevelPick levels={pf.levels} />
        <FloorPlan f={pf.f} zones={zonesOf(pf.t)} grid={{ x0: vf.x0, y0: vf.y0, h: vf.cell, nx: vf.nx, ny: vf.ny }} values={reach} ramp={RAMPS.reach} label="Reach plan" />
        <RampKey ramp={RAMPS.reach} />
      </SwFig>}
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

export function TempPlan({ T, f, t }: { T: ThermalFloor; f: SwFloor; t: Tower }) {
  const values = useMemo(() => Float32Array.from(T.zid, (z) => (z < 0 ? NaN : T.zones.find((q) => q.idx === z)?.Tk ?? NaN)), [T])
  return <FloorPlan f={f} zones={zonesOf(t)} grid={{ x0: T.x0, y0: T.y0, h: T.cell, nx: T.nx, ny: T.ny }} values={values} ramp={RAMPS.temp} label="Indoor temperature plan" />
}

export function InteriorDrawings({ id }: { id: SwId }) {
  const out = useSwOut((s) => s.out[id])
  const s = useSwStudy()
  if (!out) return null
  const d = out.data as Record<string, unknown>
  if (id === 'built.sw-form' && d.F) return <FormBody F={d.F as FormStudy} />
  if (id === 'built.sw-glazing' && d.per) { const p = (d.per as { G: GlazingStudy }[])[0]; return p ? <GlazingBody G={p.G} wwr={d.wwr as number} /> : null }
  if (id === 'built.sw-pv' && d.per) { const p = (d.per as { P: PvStudy }[])[0]; return p ? <PvBody P={p.P} share={d.share as number | null} /> : null }
  if (id === 'built.sw-natvent' && d.per) { const p = (d.per as { V: VentTower; H: VentHours | null }[])[0]; return p ? <NatVentBody V={p.V} H={p.H} /> : null }
  if (id === 'built.sw-airflow' && d.A) {
    const pf = d.pf as { t: Tower; f: SwFloor; levels: number }, A = d.A as AirFlow
    return (
      <SwFig title={`Level ${pf.f.level} · air flow`} caption={A.on ? `Mean ${A.mean.toFixed(2)} m/s, ${Math.round(A.still * 100)}% still; ${A.ach.toFixed(1)} air changes an hour.` : A.why}>
        <LevelPick levels={pf.levels} /><AirFlowPlan A={A} f={pf.f} t={pf.t} /><RampKey ramp={RAMPS.speed} />
      </SwFig>
    )
  }
  if (id === 'built.sw-indoor-temp' && d.T) {
    const pf = d.pf as { t: Tower; f: SwFloor; levels: number }, T = d.T as ThermalFloor
    return (
      <>
        <SwFig title={`Level ${pf.f.level} · ${s.hour}:00, ${s.day}/${s.month + 1}`} caption="Operative temperature of each 5 m perimeter zone and the interior at that hour.">
          <LevelPick levels={pf.levels} /><TempPlan T={T} f={pf.f} t={pf.t} /><RampKey ramp={RAMPS.temp} />
        </SwFig>
        <SwFig title="Hours over 26 °C by zone" caption="Occupied hours a year each zone overheats.">
          <HBar unit="hours" rows={T.zones.map((z) => ({ label: z.name, v: z.over26, color: z.overShare > 0.1 ? '#c53030' : z.overShare > 0.05 ? '#e08a3c' : '#86b86a', text: `${Math.round(z.over26)} h · ${z.tMin.toFixed(0)}–${z.tMax.toFixed(0)} °C` }))} />
        </SwFig>
      </>
    )
  }
  return null
}
