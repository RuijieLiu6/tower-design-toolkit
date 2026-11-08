// Results of the pedestrian wind screen (research P03-M03 with a reduced M01 wind climate and the M02 triggers): the
// study verdict, the airport wind rose, per-tower risk by strong-wind sector, the rules with their sources, and presets.
import { RotateCcw, Wind } from './icons'
import { ENGINE_NOTE, SCREEN_LABEL, DEFAULT_WIND_SCREEN, YVR_ROSE, type Level, type SectorStat, type WindScreenPresets } from '../engine/windScreen'
import type { RuleResult } from '../engine/types'
import { ANALOG_LABEL } from '../engine/windStructure'
import { useWindScreen } from '../hooks/useWindScreen'
import { useWindScreenStore } from '../lib/windScreenStore'
import { FlagChip, NumberField, Section, StateChip } from './ui'
import { U } from './Units'

export const LEVEL_COLOR: Record<Level, string> = { low: '#3b82f6', medium: '#e08a00', high: '#d0453a' }
const LEVEL_LABEL: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' }

function Card({ r }: { r: RuleResult }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{r.label}</span><StateChip state={r.state} /></div>
      <div className="mt-0.5 text-meta"><b><U>{r.value}</U></b> <span className="text-muted">· <U>{r.threshold}</U></span></div>
      {r.note && <div className="mt-0.5 text-meta text-slate-600"><U>{r.note}</U></div>}
      <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={r.flag} />
        {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="text-meta text-muted hover:text-accent">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</a>
          : <span className="text-meta text-muted">{r.source.label}{r.source.page ? `, ${r.source.page}` : ''}</span>}
      </div>
    </div>
  )
}

/** Wind rose: petal length = share of comfort-window hours from that sector; the dark part = strong-wind hours (scaled up). */
function Rose({ stats, strong }: { stats: SectorStat[]; strong: Set<string> }) {
  const R = 70, maxAll = Math.max(...stats.map((s) => s.all)), maxStrong = Math.max(...stats.map((s) => s.strong)) || 1
  const petal = (k: number, r: number) => {
    const a0 = ((k * 22.5 - 9) * Math.PI) / 180, a1 = ((k * 22.5 + 9) * Math.PI) / 180
    return `M0,0 L${r * Math.sin(a0)},${-r * Math.cos(a0)} A${r},${r} 0 0 1 ${r * Math.sin(a1)},${-r * Math.cos(a1)} Z`
  }
  return (
    <svg viewBox="-92 -92 184 184" className="mx-auto h-44 w-44" role="img" aria-label="Wind rose at Vancouver International Airport">
      {[0.33, 0.66, 1].map((f) => <circle key={f} r={R * f} fill="none" stroke="#d9dce1" strokeWidth={0.6} />)}
      {stats.map((s) => <path key={`a${s.k}`} d={petal(s.k, (R * s.all) / maxAll)} fill={strong.has(s.name) ? '#c7d7ee' : '#e6e8ec'} stroke="#fff" strokeWidth={0.5} />)}
      {stats.map((s) => s.strong > 0 && <path key={`s${s.k}`} d={petal(s.k, (R * 0.6 * s.strong) / maxStrong)} fill={strong.has(s.name) ? '#1f4e8c' : '#8a8f98'} />)}
      {['N', 'E', 'S', 'W'].map((n, i) => <text key={n} x={84 * Math.sin((i * Math.PI) / 2)} y={-84 * Math.cos((i * Math.PI) / 2) + 3} fontSize={9} textAnchor="middle" fill="#43474d" fontWeight={600}>{n}</text>)}
    </svg>
  )
}

export default function WindScreenResults() {
  const r = useWindScreen()
  const { presets, set, reset } = useWindScreenStore()
  if (!r) return null
  const edited = (Object.keys(DEFAULT_WIND_SCREEN) as (keyof WindScreenPresets)[]).filter((k) => presets[k] !== DEFAULT_WIND_SCREEN[k])
  const strong = new Set(r.sectors.map((s) => s.name))
  const verdict = r.rules.find((x) => x.id === 'wind-study')!
  const sel = 'rounded border border-line bg-panel px-1.5 py-1 text-xs'
  return (
    <>
      <Section title="Results">
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-meta text-amber-950"><Wind size={14} className="mt-0.5 shrink-0" /><span><b>{SCREEN_LABEL}</b> {ANALOG_LABEL}</span></div>
        <div className={`rounded-md border p-2 ${r.study.required ? 'border-red-200 bg-red-50' : 'border-line'}`}>
          <div className="text-meta text-muted">Pedestrian wind study</div>
          <div className="text-sm font-semibold">{r.study.required ? 'Required: plan a wind-tunnel study' : 'Not triggered by every analog rule'}</div>
          <div className="text-meta text-slate-700">{verdict.value}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1"><FlagChip flag={verdict.flag} /><span className="text-meta text-muted">Toronto ToR Table 1 · Hamilton rules 1–3 · City of London height bands · Vancouver unresolved</span></div>
        </div>
        {!r.contextLoaded && <p className="mt-2 rounded border border-line bg-slate-50 p-1.5 text-meta text-slate-700">Context buildings not loaded here: upwind exposure counts only this project’s towers, otherwise open ground (worst case).</p>}
      </Section>

      <Section title="Wind climate (airport, regional pattern)">
        <Rose stats={r.stats} strong={strong} />
        <p className="text-meta text-slate-700">Strong winds (≥ {presets.strongKmh} km/h, {YVR_ROSE.comfortWindow}) come mostly from <b>{r.sectors.map((s) => `${s.name} (${Math.round(s.share * 100)}%)`).join(', ') || '—'}</b>; light petals are all hours by direction, dark petals strong-wind hours (scaled).</p>
        <p className="mt-1 text-meta text-muted">ECCC Vancouver Intl A, {YVR_ROSE.years[0]}–{YVR_ROSE.years[1]}, 10 m airport anemometer; calms kept in the totals. No exposure transfer to the site (research P03-M01 roadmap) and fewer than the 30 years the analog guides ask for: directions only, no site speeds.</p>
      </Section>

      <Section title="Risk by strong-wind direction">
        {r.towers.map((t) => (
          <div key={t.tower} className="mb-2 overflow-x-auto">
            <div className="text-meta font-semibold">{t.name} · {t.height.toFixed(0)} m</div>
            <table className="mt-0.5 w-full min-w-[330px] text-meta">
              <thead><tr className="text-left text-meta text-muted"><th className="py-0.5 font-medium">From</th><th className="text-right font-medium">Share</th><th className="text-right font-medium">Face</th><th className="text-right font-medium">H ÷ upwind</th><th className="px-1 font-medium">Downwash</th><th className="px-1 font-medium">At grade</th><th className="px-1 font-medium">Corners</th></tr></thead>
              <tbody>
                {t.sectors.map((s) => (
                  <tr key={s.sector} className="border-t border-line/60">
                    <td className="py-0.5 font-medium">{s.sector}</td>
                    <td className="text-right tabular-nums">{Math.round(s.share * 100)}%</td>
                    <td className="text-right tabular-nums">{s.width.toFixed(0)} m</td>
                    <td className="text-right tabular-nums">{s.ratio === null ? 'open' : s.ratio === Infinity ? '—' : `${s.ratio.toFixed(1)}×`}</td>
                    {[s.downwash, s.base, s.corner].map((l, i) => <td key={i} className="px-1"><span className="inline-block rounded px-1 text-meta font-semibold text-white" style={{ background: LEVEL_COLOR[l] }}>{LEVEL_LABEL[l]}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="text-meta text-muted">“At grade” is downwash after the podium step: a podium projecting at least {presets.podiumStepMin} m toward the wind takes it one level lower at the street (direction sourced, size unverified). In 3D, select this node to see the zones: bands in front of windward faces, wedges off windward corners and aligned gaps, in blue, amber and red; their sizes are indicative drawing rules, not predicted extents.</p>
      </Section>

      <Section title="Rules">
        <div className="grid gap-2">{r.rules.map((x) => <Card key={x.id} r={x} />)}</div>
      </Section>

      <Section title="Presets (team assumptions)" right={edited.length ? <button type="button" onClick={reset} className="flex items-center gap-1 text-meta text-muted hover:text-ink"><RotateCcw size={11} />Reset</button> : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Strong wind from</span>
            <select className={sel} value={presets.strongKmh} onChange={(e) => set({ strongKmh: Number(e.target.value) as WindScreenPresets['strongKmh'] })}>{[20, 30, 40].map((v) => <option key={v} value={v}>{v} km/h (airport)</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Season</span>
            <select className={sel} value={presets.season} onChange={(e) => set({ season: e.target.value as WindScreenPresets['season'] })}><option value="year">All year</option><option value="winter">Winter (Nov–Apr)</option><option value="summer">Summer (May–Oct)</option></select></label>
          <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Tower corners</span>
            <select className={sel} value={presets.corner} onChange={(e) => set({ corner: e.target.value as WindScreenPresets['corner'] })}>{['sharp', 'chamfered', 'rounded', 'stepped'].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
          <NumberField label="Podium step that shelters" value={presets.podiumStepMin} unit="m" step={0.5} onChange={(v) => set({ podiumStepMin: Math.max(0, v) })} />
          <NumberField label="High at H ÷ upwind ≥" value={presets.exposureHigh} step={0.25} onChange={(v) => set({ exposureHigh: Math.max(1, v) })} />
          <NumberField label="Medium at H ÷ upwind ≥" value={presets.exposureMedium} step={0.05} onChange={(v) => set({ exposureMedium: Math.max(1, Math.min(v, presets.exposureHigh)) })} />
        </div>
        {edited.length > 0 && <p className="mt-1 text-meta text-amber-800">Edited: {edited.join(', ')} (your own team assumption).</p>}
      </Section>

      <Section title="Why there is no comfort map">
        <p className="text-meta leading-relaxed text-slate-700">{ENGINE_NOTE} Comfort classes need speed factors at probes from a tunnel or CFD (research P03-M04); this node only names the class each zone needs.</p>
      </Section>
    </>
  )
}
