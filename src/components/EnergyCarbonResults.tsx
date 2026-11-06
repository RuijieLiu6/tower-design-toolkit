// Inspector for the Energy & carbon node (research P04-M01/M02/M05/M07, P11-M04): charts against the by-law and
// policy limits, rule cards with their sources and flags, and the inputs (every preset says what it is).
import { RotateCcw } from './icons'
import type { ReactNode } from 'react'
import {
  ENERGY_FALSE_ASSUMPTIONS, ENVELOPE_LABEL, HEATING_LABEL, IEA_YIELD, SYSTEMS, type EnergyCarbonResult, type Envelope, type Heating, type Metric, type SystemId,
} from '../engine/energyCarbon'
import type { RuleResult, RuleState } from '../engine/types'
import { useEnergyCarbon } from '../hooks/useEnergyCarbon'
import { useEnergyStore } from '../lib/energyStore'
import { POA_RANGE, RAMP } from './energyRamp'
import { FlagChip, NumberField, Section, StateChip, Toggle } from './ui'
import { U } from './Units'

const STATE_COLOR: Record<RuleState, string> = { pass: '#2e8b57', warn: '#d98b1c', fail: '#d0453a', unknown: '#8a8f98' }
const MAGENTA = '#d4148c'

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-[11px]"><b><U>{r.value}</U></b> <span className="text-muted">· needs <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-[11px] text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-[10px] text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

function Tile({ label, value, unit, state }: { label: string; value: string; unit: string; state: RuleState }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1"><span className="text-lg font-semibold tabular-nums" style={{ color: STATE_COLOR[state] }}>{value}</span><span className="text-[10px] text-muted">{unit}</span></div>
    </div>
  )
}

/** Estimate bars against the HBP and VBBL limits for each metric (each row on its own scale). */
function LimitsChart({ r }: { r: EnergyCarbonResult }) {
  const rows: { m: Metric; label: string; est: number; unit: string }[] = [
    { m: 'teui', label: 'TEUI', est: r.net.teui, unit: 'kWh/m²' },
    { m: 'tedi', label: 'TEDI', est: r.estimate.tedi, unit: 'kWh/m²' },
    { m: 'ghgi', label: 'GHGI', est: r.net.ghgi, unit: 'kgCO₂e/m²' },
  ]
  const W = 260, L = 44, H = 26
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * H + 14}`} className="w-full" role="img" aria-label="Estimate against the HBP and VBBL limits">
      {rows.map((row, i) => {
        const hbp = r.limits.hbp[row.m], vb = r.limits.vbbl[row.m], eff = r.limits.effective[row.m]
        const max = Math.max(row.est, hbp, vb) * 1.15 || 1
        const x = (v: number) => L + (v / max) * (W - L - 8)
        const y = i * H + 6
        const ok = row.est <= eff
        return (
          <g key={row.m}>
            <text x={0} y={y + 10} fontSize="8" fill="#3d434b" fontWeight="600">{row.label}</text>
            <rect x={L} y={y + 3} width={W - L - 8} height={9} fill="#eef0f2" rx="1.5" />
            <rect x={L} y={y + 3} width={Math.max(1, x(row.est) - L)} height={9} fill={ok ? '#2e8b57' : '#d0453a'} rx="1.5" />
            <line x1={x(hbp)} x2={x(hbp)} y1={y} y2={y + 15} stroke="#1f2328" strokeWidth="1.2" />
            <line x1={x(vb)} x2={x(vb)} y1={y} y2={y + 15} stroke="#1f2328" strokeWidth="1.2" strokeDasharray="2 1.5" />
            <text x={x(hbp)} y={y + 21} fontSize="6" textAnchor="middle" fill="#3d434b">HBP {hbp.toFixed(row.m === 'ghgi' ? 1 : 0)}</text>
            <text x={x(vb)} y={y - 1} fontSize="6" textAnchor="middle" fill="#6b7280">VBBL {vb.toFixed(row.m === 'ghgi' ? 1 : 0)}</text>
            <text x={Math.min(W - 2, x(row.est) + 2)} y={y + 10.5} fontSize="6.5" fill="#1f2328" textAnchor={x(row.est) > W - 40 ? 'end' : 'start'}>{row.est.toFixed(row.m === 'ghgi' ? 2 : 0)}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Embodied carbon range on a 0–900 kgCO₂e/m² scale with the limit, proposals and the archetype band. */
function EmbodiedChart({ r }: { r: EnergyCarbonResult }) {
  const W = 260, max = 900, x = (v: number) => 6 + (v / max) * (W - 12)
  const [lo, mid, hi] = r.embodied.band
  const tick = (v: number, label: string, color: string, dash?: string, up = false) => (
    <g key={label}>
      <line x1={x(v)} x2={x(v)} y1={14} y2={40} stroke={color} strokeWidth="1.2" strokeDasharray={dash} />
      <text x={x(v)} y={up ? 10 : 49} fontSize="6" textAnchor="middle" fill={color}>{label}</text>
    </g>
  )
  return (
    <svg viewBox={`0 0 ${W} 56`} className="w-full" role="img" aria-label="Embodied carbon range against the limit">
      <rect x={x(179)} y={18} width={x(260) - x(179)} height={18} fill="#cbd5e1" opacity="0.6" />
      <rect x={6} y={24} width={W - 12} height={6} fill="#eef0f2" rx="1" />
      <rect x={x(lo)} y={22} width={Math.max(1, x(hi) - x(lo))} height={10} fill={hi <= r.embodied.limit ? '#2e8b57' : '#d0453a'} opacity="0.75" rx="1.5" />
      <circle cx={x(mid)} cy={27} r={3} fill="#1f2328" />
      {tick(r.embodied.limit, `limit ${Math.round(r.embodied.limit)}`, '#1f2328')}
      {tick(360, 'proposed 360', '#6b7280', '3 2', true)}
      {tick(311, 'archetype 311', '#64748b', '1 1.5')}
      {tick(240, '240 (not a City target)', MAGENTA, '2 2', true)}
      <text x={6} y={10} fontSize="6" fill="#6b7280">kgCO₂e/m² GFA</text>
    </svg>
  )
}

/** Yield by surface group against the IEA rooftop and facade averages for Canada. */
function PvChart({ r }: { r: EnergyCarbonResult }) {
  const groups = new Map<string, { area: number; kwh: number; kwp: number; poa: number; n: number; shaded: number }>()
  for (const s of r.pv.surfaces) {
    const key = s.kind === 'facade' ? `${s.label.split(': ')[1].split(' face')[0]} face` : s.kind === 'roof' ? 'Roof' : 'Podium roof'
    const g = groups.get(key) ?? { area: 0, kwh: 0, kwp: 0, poa: 0, n: 0, shaded: 0 }
    g.area += s.area; g.kwh += s.kwh; g.kwp += s.kwp; g.poa += s.poa; g.shaded += s.shaded; g.n += 1
    groups.set(key, g)
  }
  const rows = [...groups.entries()].map(([k, g]) => ({ k, poa: g.poa / g.n, shaded: g.shaded / g.n, kwh: g.kwh, on: g.kwp > 0 }))
  const yieldOf = (poa: number) => (r.pv.refPoa ? (IEA_YIELD.roof * poa) / r.pv.refPoa : 0)
  const W = 260, L = 78, H = 13, max = 1400
  const x = (v: number) => L + (v / max) * (W - L - 6)
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * H + 18}`} className="w-full" role="img" aria-label="PV yield by surface">
      {rows.map((row, i) => {
        const y = i * H + 4, yld = yieldOf(row.poa)
        const t = (row.poa - POA_RANGE[0]) / (POA_RANGE[1] - POA_RANGE[0]), ci = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))))
        return (
          <g key={row.k}>
            <text x={0} y={y + 7.5} fontSize="6.5" fill={row.on ? '#1f2328' : '#9aa1aa'}>{row.k}{row.on ? '' : ' (off)'}</text>
            <rect x={L} y={y + 1} width={Math.max(1, x(yld) - L)} height={8} fill={RAMP[ci]} stroke="#94a3b8" strokeWidth="0.3" />
            <text x={x(yld) + 2} y={y + 7.5} fontSize="6" fill="#3d434b">{Math.round(yld)}{row.shaded > 0.05 ? ` · ${Math.round(row.shaded * 100)}% shaded` : ''}</text>
          </g>
        )
      })}
      {[[IEA_YIELD.roof, 'Canada roof 1,173'], [IEA_YIELD.facade, 'facade 821']].map(([v, l]) => (
        <g key={l as string}>
          <line x1={x(v as number)} x2={x(v as number)} y1={2} y2={rows.length * H + 6} stroke="#6b7280" strokeWidth="0.6" strokeDasharray="2 1.5" />
          <text x={x(v as number)} y={rows.length * H + 14} fontSize="5.5" textAnchor="middle" fill="#6b7280">{l}</text>
        </g>
      ))}
    </svg>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs"><span className="text-muted">{label}</span>{children}</label>
}
const select = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'

function Inputs({ r }: { r: EnergyCarbonResult }) {
  const { input, set, setPv, reset } = useEnergyStore()
  const man = input.manual
  const setMan = (k: 'teui' | 'tedi' | 'ghgi', v: number) => set({ manual: { teui: man?.teui ?? null, tedi: man?.tedi ?? null, ghgi: man?.ghgi ?? null, [k]: v } })
  return (
    <div className="grid gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Operational</div>
      <Field label="Regime">
        <select className={select} value={input.regime} onChange={(e) => set({ regime: e.target.value as typeof input.regime })}>
          <option value="both">Rezoning and permit: stricter of HBP and VBBL (default)</option>
          <option value="rezoning">Rezoning only: Higher Buildings Policy s2.2</option>
          <option value="permit">Permit only: VBBL Table 10.2.2.5.A</option>
        </select>
      </Field>
      <Field label="Energy route (HBP s2.2)">
        <select className={select} value={input.route} onChange={(e) => set({ route: e.target.value as typeof input.route })}>
          <option value="targets">TEUI/TEDI/GHGI targets plus a Low Carbon Energy System</option>
          <option value="passive-house">Passive House certification</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-xs"><Toggle checked={input.lces} onChange={() => set({ lces: !input.lces })} label="Low Carbon Energy System connection planned" />Low Carbon Energy System connection planned</label>
      <Field label="Heating and hot water">
        <select className={select} value={input.heating} onChange={(e) => set({ heating: e.target.value as Heating })}>
          {(Object.keys(HEATING_LABEL) as Heating[]).map((h) => <option key={h} value={h}>{HEATING_LABEL[h]}</option>)}
        </select>
      </Field>
      {input.heating !== 'gas' && <NumberField label="Gas boiler share of heating and hot water" value={input.gasShare * 100} onChange={(v) => set({ gasShare: Math.max(0, Math.min(100, v)) / 100 })} min={0} max={100} step={5} unit="%" />}
      {input.heating === 'district' && (
        <Field label="District emission factor (from the utility, kgCO₂e/kWh)">
          <input type="number" step={0.005} min={0} value={input.districtFactor ?? ''} placeholder="not known" onChange={(e) => set({ districtFactor: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} className={`${select} w-28`} />
        </Field>
      )}
      <Field label="Envelope (sets TEDI)">
        <select className={select} value={input.envelope} onChange={(e) => set({ envelope: e.target.value as Envelope })}>
          {(Object.keys(ENVELOPE_LABEL) as Envelope[]).map((v) => <option key={v} value={v}>{ENVELOPE_LABEL[v]}</option>)}
        </select>
      </Field>
      <NumberField label="Window-to-wall ratio" value={input.wwr * 100} onChange={(v) => set({ wwr: Math.max(5, Math.min(95, v)) / 100 })} min={10} max={90} step={5} unit="%" />
      <label className="flex items-center gap-2 text-xs"><Toggle checked={!!man} onChange={() => set({ manual: man ? null : { teui: Math.round(r.estimate.teui), tedi: Math.round(r.estimate.tedi), ghgi: Math.round(r.estimate.ghgi * 100) / 100 } })} label="Use my own modelled values" />Use my own modelled values (from an energy model)</label>
      {man && (
        <div className="grid grid-cols-3 gap-2">
          {(['teui', 'tedi', 'ghgi'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}><input type="number" step={k === 'ghgi' ? 0.1 : 1} value={man[k] ?? ''} onChange={(e) => setMan(k, Number(e.target.value))} className={select} /></Field>
          ))}
        </div>
      )}
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Embodied carbon</div>
      <Field label="Structure system">
        <select className={select} value={input.system ?? ''} onChange={(e) => set({ system: (e.target.value || null) as SystemId | null })}>
          <option value="">From the structure shortlist ({SYSTEMS[r.embodied.system].label.toLowerCase()})</option>
          {(Object.keys(SYSTEMS) as SystemId[]).map((s) => <option key={s} value={s}>{SYSTEMS[s].label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cement replacement (SCM)">
          <select className={select} value={input.scm} onChange={(e) => set({ scm: Number(e.target.value) as 20 | 30 | 40 })}>
            <option value={20}>20% (archetype)</option><option value={30}>30%</option><option value={40}>40%</option>
          </select>
        </Field>
        <Field label="Facade">
          <select className={select} value={input.facade} onChange={(e) => set({ facade: e.target.value as typeof input.facade })}>
            <option value="window-wall">Window wall</option><option value="curtain-wall">Curtain wall</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={input.triple} onChange={() => set({ triple: !input.triple })} />Triple glazing</label>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Parkade levels" value={input.parkadeLevels} onChange={(v) => set({ parkadeLevels: Math.max(0, Math.min(10, Math.round(v))) })} step={1} />
        <NumberField label="Leadership credits" value={input.ilc * 100} onChange={(v) => set({ ilc: Math.max(0, Math.min(5, v)) / 100 })} step={1} unit="%" hint="Industry Leadership Credits, at most 5% (City Addendum Appendix I)" />
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Solar PV</div>
      <div className="flex flex-wrap gap-3 text-xs">
        {([['roof', 'Tower roof'], ['podium', 'Podium roof'], ['facade', 'Facades']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={input.pv[k]} onChange={() => setPv({ [k]: !input.pv[k] })} />{l}</label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Roof usable" value={input.pv.roofUsable * 100} onChange={(v) => setPv({ roofUsable: Math.max(0, Math.min(100, v)) / 100 })} step={5} unit="%" />
        <NumberField label="Podium usable" value={input.pv.podiumUsable * 100} onChange={(v) => setPv({ podiumUsable: Math.max(0, Math.min(100, v)) / 100 })} step={5} unit="%" />
        <NumberField label="Facade usable" value={input.pv.facadeUsable * 100} onChange={(v) => setPv({ facadeUsable: Math.max(0, Math.min(100, v)) / 100 })} step={5} unit="%" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Module carbon" value={input.pv.ecPerKwp} onChange={(v) => setPv({ ecPerKwp: Math.max(0, v) })} step={50} unit="kg/kWp" hint="Embodied carbon per kWp: enter the EPD value when you have one" />
        <NumberField label="Module life" value={input.pv.life} onChange={(v) => setPv({ life: Math.max(5, Math.min(60, v)) })} step={1} unit="yr" />
      </div>
      <div className="flex items-center gap-2"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Every preset here is a team assumption until an energy model, an LCA tool or an EPD replaces it.</span></div>
      <button type="button" onClick={reset} className="flex w-fit items-center gap-1.5 rounded border border-line px-2 py-1 text-xs hover:border-accent"><RotateCcw size={12} />Reset energy inputs</button>
    </div>
  )
}

export default function EnergyCarbonResults() {
  const r = useEnergyCarbon()
  if (!r) return null
  const st = (id: string, list: RuleResult[]) => list.find((x) => x.id === id)?.state ?? 'unknown'
  return (
    <>
      <Section title="Results">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="TEUI net" value={r.net.teui.toFixed(0)} unit={`/ ${r.limits.effective.teui.toFixed(0)}`} state={st('en-teui', r.operational)} />
          <Tile label="GHGI net" value={r.net.ghgi.toFixed(2)} unit={`/ ${r.limits.effective.ghgi.toFixed(2)}`} state={st('en-ghgi', r.operational)} />
          <Tile label="Embodied" value={String(Math.round(r.embodied.band[1]))} unit={`/ ${Math.round(r.embodied.limit)}`} state={st('ec-limit', r.carbon)} />
        </div>
        <p className="mt-2 text-[10px] text-muted">Screening only. Energy and GHG need an Energy Modelling Guidelines v3.0 model; embodied carbon needs a City-listed LCA tool. Units: kWh/m²·yr, kgCO₂e/m²·yr and kgCO₂e/m² on {Math.round(r.areas.mfa).toLocaleString('en-CA')} m² modelled floor area.</p>
      </Section>
      <Section title="Operational energy and carbon">
        <LimitsChart r={r} />
        <p className="mb-2 text-[10px] text-muted">Bars: this design (net of PV). Solid tick: Higher Buildings Policy s2.2; dashed: VBBL Table 10.2.2.5.A. The stricter governs by default.</p>
        <div className="grid gap-2">{r.operational.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>
      <Section title="Embodied carbon">
        <EmbodiedChart r={r} />
        <p className="mb-2 text-[10px] text-muted">Bar: likely range for this structure, dot: middle. Grey band: the 30-storey archetype's 25th–50th percentile (179–260). Magenta: a corrected false assumption.</p>
        <div className="grid gap-2">{r.carbon.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>
      <Section title="Solar PV potential">
        <PvChart r={r} />
        <p className="mb-2 text-[10px] text-muted">Yield (kWh/kWp·yr) by surface after shading, coloured as in the 3D view. Dashed: Canadian averages (IEA PVPS), not Vancouver values.</p>
        <div className="grid gap-2">{r.solar.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>
      <Section title="False assumptions, kept visible">
        <div className="grid gap-2">
          {ENERGY_FALSE_ASSUMPTIONS.map((f) => (
            <div key={f.claim} className="rounded-md border p-2 text-[11px]" style={{ borderColor: MAGENTA }}>
              <div className="font-semibold" style={{ color: MAGENTA }}>■ FALSE ASSUMPTION: {f.claim}</div>
              <div className="mt-0.5 text-slate-700">{f.correction}</div>
              <div className="mt-0.5 text-[10px] text-muted">{f.source.label}{f.source.page ? `, ${f.source.page}` : ''}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Inputs and presets"><Inputs r={r} /></Section>
    </>
  )
}
