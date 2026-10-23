// Results of the economics node (research P08-M01/M03/M04/M05a; Program Value Visualizer method): verdict, the
// value-to-land waterfall, which floors pay for the tower, and the editable assumption ledger with flags and sources.
import { useMemo, useState } from 'react'
import { ACC_TREATMENT_LABEL, COST_LEDGER, CORIOLIS_TDC, RISK_REGISTER, type AccTreatment, type ChargeLine } from '../engine/costCharges'
import { money, VERDICT_LABEL, type EconPresets, type EconResult, type Row, type Verdict } from '../engine/economics'
import { USES, type RuleState, type UseId } from '../engine/types'
import { useEconomics } from '../hooks/useEconomics'
import { useEconStore, type OverrideKey } from '../lib/econStore'
import { useStore, useTowers } from '../store'
import { FlagChip, Section, StateChip } from './ui'

const STATE: Record<Verdict, RuleState> = { works: 'pass', marginal: 'warn', fails: 'fail', 'land-needed': 'unknown', incomplete: 'unknown' }

export default function EconomicsResults() {
  const { result: r, presets, siteArea } = useEconomics()
  const { permitYear, landPrice, includeRegional, set } = useEconStore()
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const [tower, setTower] = useState<string | null>(null)
  const showTower = tower ?? selected
  const floors = useMemo(() => r.floors.filter((f) => f.tower === showTower), [r.floors, showTower])

  return (
    <>
      <Section title="Results">
        <div className={`rounded-md border p-2.5 ${r.verdict === 'works' ? 'border-emerald-200 bg-emerald-50/60' : r.verdict === 'marginal' ? 'border-amber-200 bg-amber-50/60' : r.verdict === 'fails' ? 'border-red-200 bg-red-50/60' : 'border-line bg-black/[0.02]'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{VERDICT_LABEL[r.verdict]}</span>
            <StateChip state={STATE[r.verdict]} />
          </div>
          <div className="mt-1 text-[11px]">
            Left for land after costs, {Math.round(presets.profitOnCost.value * 100)}% profit and the CAC: <b className="tabular-nums">{money(r.rlvAfter)}</b>
            {r.land != null && <> against a land price of <b className="tabular-nums">{money(r.land)}</b>{landPrice == null && ' (estimated)'}</>}.
          </div>
          <div className="mt-0.5 text-[10px] text-muted">{money(r.rlvPerM2)} per m² of gross floor area · {Math.round(r.gfa).toLocaleString()} m² gross</div>
          <div className="mt-1.5 flex items-center gap-1"><FlagChip flag="unverified" /><span className="text-[10px] text-muted">Indicative early-design estimate (Program Value Visualizer method), not a feasibility study, appraisal or compliance check. Most market values are grade C.</span></div>
        </div>
        <Waterfall r={r} />
      </Section>

      <Section title="Which floors pay for the tower" right={towers.length > 1 ? (
        <select value={showTower} onChange={(e) => setTower(e.target.value)} className="rounded border border-line bg-panel px-1 py-0.5 text-[11px]" aria-label="Tower">
          {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>) : undefined}>
        <FloorChart floors={floors} />
        <ByUse r={r} />
      </Section>

      <CostSection r={r} />
      <ChargesSection r={r} />

      <Section title="Inputs">
        <div className="grid gap-2 text-xs">
          <label className="flex items-center justify-between gap-2"><span className="text-muted">Building permit after</span>
            <select value={permitYear} onChange={(e) => set({ permitYear: Number(e.target.value) })} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]">
              {[2026, 2027, 2028, 2029].map((y) => <option key={y} value={y}>30 Sep {y}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2"><span className="text-muted">Land price (blank = estimate)</span>
            <span className="flex items-center gap-1">C$<input type="number" step={1e6} value={landPrice ?? ''} placeholder={r.landCurrent != null ? String(Math.round(r.landCurrent / 1e6)) + ' M' : 'needed'}
              onChange={(e) => set({ landPrice: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} className="w-28 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Land price" /></span>
          </label>
          {landPrice == null && (r.landCurrent != null
            ? <p className="text-[10px] text-muted">Estimate: current-zoning FSR {presets.currentZoningFsr.value} × {money(presets.landRate.value)}/buildable m² × site {Math.round(siteArea ?? 0).toLocaleString()} m² = {money(r.landCurrent)} (PVV pack, grades B and C).</p>
            : <p className="text-[10px] text-muted">No site area in this project, so no land estimate: enter a land price to get a verdict.</p>)}
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeRegional} onChange={() => set({ includeRegional: !includeRegional })} />Include Metro Vancouver and TransLink charges (not in the PVV pack)</label>
        </div>
      </Section>

      <Ledger presets={presets} />
    </>
  )
}

function Waterfall({ r }: { r: ReturnType<typeof useEconomics>['result'] }) {
  const rows: [string, number, string][] = [
    ['Value of the floors (GDV)', r.value, '#2e8b57'],
    [r.construction.basis === 'research' ? 'Hard cost (incl. tall-building premium)' : 'Hard cost', -r.hard, '#8a9096'],
    ...(r.construction.contingency ? [['Contingency', -r.construction.contingency, '#9aa0a6'] as [string, number, string]] : []),
    ['Soft cost', -r.soft, '#a3a9af'],
    ['City charges (DCL, utilities DCL, ACC)', -r.cityCharges, '#b48ac4'],
    ...(r.regionalCharges ? [['Metro + TransLink charges', -r.regionalCharges, '#c9a3d6'] as [string, number, string]] : []),
    ['Finance', -r.finance, '#c0a060'],
    ['Profit allowance', -r.profit, '#d9b44a'],
    ['Left for land before CAC', r.rlvBefore, r.rlvBefore >= 0 ? '#1f5f8b' : '#d0453a'],
    ...(r.cac ? [['Negotiated CAC (share of the lift)', -r.cac, '#6cc0b8'] as [string, number, string]] : []),
    ['Left for land after CAC', r.rlvAfter, r.rlvAfter >= 0 ? '#1f5f8b' : '#d0453a'],
  ]
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)))
  return (
    <div className="mt-2 grid gap-1 text-[11px]">
      {rows.map(([label, v, c]) => (
        <div key={label} className="grid grid-cols-[1fr_88px] items-center gap-2">
          <div>
            <div className="flex justify-between"><span className={label.startsWith('Left') ? 'font-semibold' : 'text-muted'}>{label}</span></div>
            <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded" style={{ width: `${(Math.abs(v) / max) * 100}%`, background: c }} /></div>
          </div>
          <span className={`text-right tabular-nums ${label.startsWith('Left') ? 'font-semibold' : ''}`}>{money(v)}</span>
        </div>
      ))}
      {r.employmentOnly && <p className="text-[10px] text-muted">No CAC: a 100% employment rezoning is excluded from CAC negotiation (City, 14 Jul 2026).</p>}
      {r.averaged > 0 && <p className="text-[10px] text-muted">{r.averaged} floor{r.averaged === 1 ? '' : 's'} have no sourced cost line and use the project average (flagged; see Construction cost).</p>}
    </div>
  )
}

function FloorChart({ floors }: { floors: ReturnType<typeof useEconomics>['result']['floors'] }) {
  if (!floors.length) return <p className="text-[11px] text-muted">No floors.</p>
  const max = Math.max(1, ...floors.map((f) => Math.abs(f.residual)))
  const W = 300, rowH = Math.max(1.2, Math.min(5, 260 / floors.length)), H = floors.length * rowH + 4, mid = W / 2 + 20
  const pos = floors.filter((f) => f.residual > 0).reduce((s, f) => s + f.residual, 0), neg = floors.filter((f) => f.residual < 0).reduce((s, f) => s + f.residual, 0)
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W + 40} ${H}`} role="img" aria-label="Residual per floor: right earns more than it costs, left costs more than it earns">
        <line x1={mid} x2={mid} y1={0} y2={H} stroke="#c9ccd1" />
        {floors.map((f, i) => {
          const y = H - 2 - (i + 1) * rowH, w = (Math.abs(f.residual) / max) * (W / 2 - 4)
          return (
            <g key={`${f.level}-${i}`}>
              <rect x={0} y={y} width={14} height={Math.max(0.8, rowH - 0.3)} fill={USES[f.use].color} />
              <rect x={f.residual >= 0 ? mid : mid - w} y={y} width={Math.max(0.5, w)} height={Math.max(0.8, rowH - 0.3)} fill={f.residual >= 0 ? '#2e8b57' : '#d0453a'} opacity={0.85}>
                <title>{`L${f.level} ${USES[f.use].label}: value ${money(f.value)}, cost with profit ${money(f.cost)}, residual ${money(f.residual)}`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted"><span>costs more than it earns: {money(neg)}</span><span>earns more: {money(pos)}</span></div>
      <p className="mt-0.5 text-[10px] text-muted">Each floor's value against its hard and soft cost, charges, finance and profit (PVV floor chart). Hover a bar for numbers.</p>
    </div>
  )
}

function ByUse({ r }: { r: ReturnType<typeof useEconomics>['result'] }) {
  return (
    <table className="mt-2 w-full text-[11px]">
      <thead className="text-muted"><tr><th className="text-left font-medium">Use</th><th className="text-right font-medium">Gross m²</th><th className="text-right font-medium">Value</th><th className="text-right font-medium">Cost</th></tr></thead>
      <tbody>
        {(Object.entries(r.byUse) as [UseId, { gfa: number; value: number; cost: number }][]).filter(([, v]) => v.gfa > 0).map(([u, v]) => (
          <tr key={u} className="border-t border-line/60">
            <td className="py-0.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: USES[u].color }} />{USES[u].label}</td>
            <td className="text-right tabular-nums">{Math.round(v.gfa).toLocaleString()}</td>
            <td className="text-right tabular-nums">{money(v.value)}</td>
            <td className="text-right tabular-nums">{money(v.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const LEDGER: [OverrideKey | `value.${UseId}` | `hard.${UseId}`, string][] = [
  ['value.office', 'Office value'], ['value.residential', 'Strata residential value'], ['value.hotel', 'Hotel value'], ['value.retail', 'Retail value (street level)'],
  ['hard.office', 'Office hard cost'], ['hard.residential', 'Residential hard cost'], ['hard.hotel', 'Hotel hard cost'], ['hard.retail', 'Retail hard cost'], ['hard.civic', 'Civic hard cost'],
  ['premiumResidential', 'Residential height premium'], ['premiumOffice', 'Office height premium'], ['officeLeasing', 'Office leasing costs'], ['sellingCost', 'Strata selling costs'],
  ['tenantAllowance', 'Office tenant allowance'], ['ffePerKey', 'Hotel FF&E per key'], ['tallPremium', 'Supertall premium (> 250 m)'], ['softShare', 'Soft cost'],
  ['financeRate', 'Finance rate'], ['buildYears', 'Build time'], ['drawFactor', 'Average loan drawn'], ['profitOnCost', 'Profit on cost'],
  ['dcl', 'City-wide DCL'], ['udclResidential', 'Utilities DCL, residential'], ['udclCommercial', 'Utilities DCL, commercial'], ['accResidential1', 'ACC residential, 2026'], ['accResidential2', 'ACC residential, from 2027'], ['accCommercial', 'ACC commercial'], ['chargeEscalation', 'Charge escalation'],
  ['metroNonRes', 'Metro DCC, non-residential'], ['metroPerHome', 'Metro DCC per home'], ['translinkOffice', 'TransLink DCC, office'], ['translinkRetail', 'TransLink DCC, retail'], ['translinkPerHome', 'TransLink DCC per home'],
  ['cacShare', 'CAC share of land lift'], ['currentZoningFsr', 'Current-zoning FSR'], ['landRate', 'Land rate per buildable m²'], ['purchasePremium', 'Land purchase premium'],
]

function rowOf(p: EconPresets, k: string): Row | null {
  if (k.startsWith('value.')) return p.valuePerGfa[k.slice(6) as UseId]
  if (k.startsWith('hard.')) return p.hardCost[k.slice(5) as UseId]
  return (p as unknown as Record<string, Row>)[k] ?? null
}

function Ledger({ presets }: { presets: EconPresets }) {
  const { overrides, setRow, reset } = useEconStore()
  const n = Object.keys(overrides).length
  return (
    <Section title="Assumption ledger" right={n ? <button onClick={reset} className="text-[11px] text-accent hover:underline">Reset {n} edit{n === 1 ? '' : 's'}</button> : undefined}>
      <details className="rounded-md border border-line">
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted hover:text-ink">{LEDGER.length} numbers, each with its flag and source (research P08-M00)</summary>
        <ul className="grid gap-1.5 border-t border-line p-2">
          {LEDGER.map(([k, label]) => {
            const r = rowOf(presets, k)
            if (!r) return null
            const pct = !r.unit.includes('C$') && r.unit !== 'FSR' && r.unit !== 'years'
            const shown = pct ? Math.round(r.value * 10000) / 100 : Math.round(r.value * 100) / 100
            return (
              <li key={k} className="text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <input type="number" value={shown} step={pct ? 0.1 : 1} onChange={(e) => setRow(k as OverrideKey, e.target.value === '' ? null : Number(e.target.value) / (pct ? 100 : 1))}
                    className="w-20 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label={label} />
                  <span className="w-24 shrink-0 truncate text-[10px] text-muted" title={r.unit}>{pct ? `% ${r.unit}` : r.unit}</span>
                </div>
                <div className="mt-0.5 flex items-start gap-1"><FlagChip flag={r.flag} /><span className="text-[10px] text-muted">{r.source}{r.low != null && r.high != null ? ` · range ${pct ? `${r.low * 100}-${r.high * 100}%` : `${r.low.toLocaleString()}-${r.high.toLocaleString()}`}` : ''}{r.note ? ` · ${r.note}` : ''}</span></div>
              </li>
            )
          })}
        </ul>
      </details>
    </Section>
  )
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`

/** P08-M03: base cost per use at the 39-storey anchor, the building-level height premium and the AACE range. */
function CostSection({ r }: { r: EconResult }) {
  const { costBasis, residentialBase, contingency, set } = useEconStore()
  const k = r.construction
  const research = k.basis === 'research'
  const unsourced = (Object.keys(r.byUse) as UseId[]).filter((u) => r.byUse[u].gfa > 0 && !(research ? (u === 'residential' ? true : COST_LEDGER.base[u]) : true))
  return (
    <Section title="Construction cost (P08-M03)">
      <div className="grid gap-2 text-xs">
        <label className="flex items-center justify-between gap-2"><span className="text-muted">Hard-cost basis</span>
          <select value={costBasis} onChange={(e) => set({ costBasis: e.target.value as 'research' | 'pvv' })} className="max-w-[190px] rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]" aria-label="Hard-cost basis">
            <option value="research">Research: 39-storey anchor + height elasticity</option>
            <option value="pvv">PVV pack: Altus 2026 lines + 15% placeholder</option>
          </select>
        </label>
        {research && <label className="flex items-center justify-between gap-2"><span className="text-muted">Residential base (team choice)</span>
          <select value={residentialBase} onChange={(e) => set({ residentialBase: e.target.value as 'coriolis' | 'altus' })} className="max-w-[190px] rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]" aria-label="Residential base">
            <option value="coriolis">Coriolis 2026, $580-630/ft²</option>
            <option value="altus">Altus 2025 band top, $455/ft²</option>
          </select>
        </label>}
        <label className="flex items-center justify-between gap-2"><span className="text-muted">Contingency (no default: the range shows once it is set)</span>
          <span className="flex items-center gap-1"><input type="number" min={0} max={50} step={1} value={Math.round(contingency * 100)} onChange={(e) => set({ contingency: Math.max(0, Math.min(0.5, Number(e.target.value) / 100 || 0)) })}
            className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" aria-label="Contingency percent" />%</span>
        </label>
      </div>

      {research && (
        <table className="mt-2 w-full text-[11px]">
          <thead className="text-muted"><tr><th className="text-left font-medium">Tower</th><th className="text-right font-medium">Storeys</th><th className="text-right font-medium">Above 39</th><th className="text-right font-medium">ε blend</th><th className="text-right font-medium">Premium</th></tr></thead>
          <tbody>
            {k.towers.map((t) => (
              <tr key={t.id} className="border-t border-line/60">
                <td className="py-0.5">{t.name}</td>
                <td className="text-right tabular-nums">{t.premium.storeys}</td>
                <td className={`text-right tabular-nums ${t.premium.above ? 'font-semibold text-amber-800' : ''}`}>{t.premium.above ? `${t.premium.above} extrapolated` : '0'}</td>
                <td className="text-right tabular-nums">{t.premium.eps.toFixed(2)}</td>
                <td className="text-right tabular-nums">×{t.premium.factor.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {research && k.towers.some((t) => t.premium.above) && (() => {
        const t = k.towers.reduce((a, b) => (b.premium.storeys > a.premium.storeys ? b : a))
        return <p className="mt-1 text-[10px] text-muted">Comparison lines for {t.name} (all lower bounds at this height, none rated good): ε 0.26 ×{t.premium.lines.commercial.toFixed(2)} · ε 0.56 ×{t.premium.lines.residential.toFixed(2)} · 2%/floor linear ×{t.premium.lines.linear.toFixed(2)} · compound ×{t.premium.lines.compound.toFixed(2)}. The premium is applied once to the building, anchored at 39 storeys so the sourced Altus band stays intact.</p>
      })()}

      <div className="mt-2 grid gap-1 text-[11px]">
        <div className="flex items-center justify-between gap-2"><span>Share of GFA with a sourced base cost</span><b className={`tabular-nums ${k.sourcedShare < 0.5 ? 'text-red-700' : ''}`}>{pct(k.sourcedShare)}</b></div>
        {unsourced.length > 0 && <div className="flex items-start gap-1"><FlagChip flag="unresolved" /><span className="text-[10px] text-muted">No sourced base for {unsourced.map((u) => USES[u].label.toLowerCase()).join(', ')}: priced at the average of the sourced uses (research P08-M03 limits).</span></div>}
        <div className="flex items-center justify-between gap-2"><span>Hard cost + contingency (P50)</span><b className="tabular-nums">{money(k.estimate)}</b></div>
        {k.range
          ? <div className="flex items-center justify-between gap-2"><span>AACE Class 5 range (P10-P90){k.range.multiplier > 1 ? `, high side ×${k.range.multiplier} above the band` : ''}</span><b className="tabular-nums">{money(k.range.p10)} – {money(k.range.p90)}</b></div>
          : <p className="text-[10px] text-muted">No range yet: AACE ranges sit around an estimate that already includes contingency, so set a contingency above 0 first (RP 56R-08).</p>}
        <div className="flex items-center justify-between gap-2"><span>Total cost excl. land and profit, per gross ft²</span><b className="tabular-nums">${Math.round(k.tdcPerSf)}</b></div>
        <p className="text-[10px] text-muted">Beside Coriolis 2026 cases (mid and high-rise, not supertall): office ${CORIOLIS_TDC.office.join('-')}, downtown strata ${CORIOLIS_TDC.strata.join('-')} per ft². Shown for scale, not as a test.</p>
        <div className="flex items-start gap-1"><FlagChip flag={COST_LEDGER.escalation.flag} /><span className="text-[10px] text-muted">Escalation from the cost vintage (late 2024 to early 2026) to the valuation date: 0 until the Statistics Canada index is read.</span></div>
      </div>
      <details className="mt-2 rounded-md border border-line">
        <summary className="cursor-pointer px-2 py-1 text-[11px] text-muted hover:text-ink">Supertall risk register: {RISK_REGISTER.length} blank lines outside the elasticity</summary>
        <ul className="grid gap-0.5 border-t border-line p-2 text-[10.5px]">
          {RISK_REGISTER.map((x) => <li key={x} className="flex items-center gap-1.5"><FlagChip flag="unresolved" />{x}: no sourced allowance; widens the high side once a person fills it</li>)}
        </ul>
      </details>
      <ul className="mt-2 grid gap-1">
        {[COST_LEDGER.base.residential!, COST_LEDGER.base.office!, ...(residentialBase === 'altus' ? [COST_LEDGER.altusResidential] : []), COST_LEDGER.epsCommercial, COST_LEDGER.epsResidential, COST_LEDGER.anchorStoreys, COST_LEDGER.aaceHigh, COST_LEDGER.highSide].map((row) => (
          <li key={row.label} className="flex items-start gap-1 text-[10px] text-muted"><FlagChip flag={row.flag} /><span><span className="text-ink">{row.label}</span>: {row.source}</span></li>
        ))}
      </ul>
    </Section>
  )
}

const STATUS_CLASS: Record<ChargeLine['status'], string> = {
  'in force': 'bg-emerald-100 text-emerald-900', approved: 'bg-sky-100 text-sky-900', blank: 'bg-amber-100 text-amber-900', none: 'bg-slate-100 text-slate-700', 'false assumption': 'bg-[#fde7f3] text-[#a3106c]',
}

/** P08-M04: the dated charges schedule, with a status per line and the lines no rate covers yet. */
function ChargesSection({ r }: { r: EconResult }) {
  const { civicReduced, accTreatment, set } = useEconStore()
  const c = r.charges
  return (
    <Section title="Statutory charges (P08-M04)">
      <div className="grid gap-2 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" checked={civicReduced} onChange={() => set({ civicReduced: !civicReduced })} />Civic and public-amenity floors qualify as Cultural Facility or similar ($10 per permit; a person decides)</label>
        <label className="flex items-center justify-between gap-2"><span className="text-muted">ACC on a rezoning with a negotiated CAC</span>
          <select value={accTreatment} onChange={(e) => set({ accTreatment: e.target.value as AccTreatment })} className="max-w-[190px] rounded border border-line bg-panel px-1.5 py-0.5 text-[11px]" aria-label="ACC treatment">
            {(Object.keys(ACC_TREATMENT_LABEL) as AccTreatment[]).map((x) => <option key={x} value={x}>{ACC_TREATMENT_LABEL[x]}</option>)}
          </select>
        </label>
      </div>
      <ul className="mt-2 grid gap-1.5">
        {c.lines.map((l) => (
          <li key={l.id} className="rounded-md border border-line/70 px-2 py-1 text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <span className={l.status === 'false assumption' ? 'text-[#a3106c] line-through' : 'font-medium'}>{l.item}</span>
              <b className="shrink-0 tabular-nums">{l.total == null ? 'blank' : money(l.total)}</b>
            </div>
            <div className="text-[10px] text-muted">{l.rate} · {l.basis} · effective {l.effective}</div>
            <div className="mt-0.5 flex items-start gap-1"><FlagChip flag={l.flag} /><span className={`rounded px-1 text-[9.5px] font-medium ${STATUS_CLASS[l.status]}`}>{l.status}</span><span className="text-[10px] text-muted">{l.source}</span></div>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-0.5 text-[11px]">
        <div className="flex justify-between"><span>Total charges{c.complete ? '' : ' (incomplete: blank lines above)'}</span><b className="tabular-nums">{money(c.total)}</b></div>
        <div className="flex justify-between text-muted"><span>Per m² of gross floor area</span><span className="tabular-nums">C${Math.round(c.perM2)} (${(c.perM2 / 10.7639).toFixed(2)}/ft²)</span></div>
        {c.deferral && <p className="text-[10px] text-muted">Deferral (DCLs of $500,000 or more): {money(c.deferral.atPermit)} at building permit, {money(c.deferral.deferred)} secured and due before occupancy or within four years, plus a ${c.deferral.fee.toLocaleString()} fee. The residual doesn't model this timing yet.</p>}
      </div>
    </Section>
  )
}
