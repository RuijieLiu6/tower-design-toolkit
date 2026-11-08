// "Generate" on the Form step: Sinnie Choi's massing generator from her Downtown Massing Tool (engine/dtmassGen.ts,
// ported with her permission, 6 Nov 2026). Pick a typology, enter the brief (target area, mix, floorplate, height
// target), see the massing on the site with requested against generated area, conflicts and notes, then place it: the
// project's towers are replaced in one undo step (lib/generateStore.ts).
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Sparkles, TriangleAlert } from '../icons'
import { compass } from '../../engine/viewFrom'
import { GEN_LABEL, GEN_TYPES, GEN_USES, type GenBrief, type GenKey, type GenUse, type Side } from '../../engine/dtmassGen'
import { applyGenerated, runGenerator, startingBrief, useGenerate, useSiteRect } from '../../lib/generateStore'
import { sideBearing } from '../../lib/generateTowers'
import { goToStep } from '../../lib/step'
import { VTC_NORTH_DEG } from '../../context'
import { useStore } from '../../store'
import { FlagChip, NumberField } from '../ui'
import Help from '../Help'
import GenAxon from './GenAxon'

const KEYS = Object.keys(GEN_TYPES) as GenKey[]
const fmt = (v: number, d = 0) => v.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })
const btn = 'rounded-md border px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** The four typologies on a 60 × 40 m lot (her preset previews), drawn once. */
const PREVIEW_SITE = { w: 60, d: 40 }
function usePresetPreviews() {
  return useMemo(() => Object.fromEntries(KEYS.map((k) => {
    const r = runGenerator({ origin: [0, 0], angleDeg: 0, w: 60, d: 40, area: 2400, label: '' }, 'city', {
      key: k, params: { slender: {}, podium: {}, split: {}, court: {} } as never, frontage: { vtc: 'S', city: 'S' },
      brief: { city: { ...startingBrief('city'), gfa: 22000, plate: 600, mix: { residential: 60, hotel: 0, office: 20, retail: 10, restaurant: 0, amenity: 10 } }, vtc: startingBrief('vtc') },
    }, 0)
    return [k, r.blocks]
  })), [])
}

export default function GenerateTool() {
  const project = useStore((s) => s.project)
  const hasTowers = useStore((s) => s.towers[s.project].length > 0)
  const g = useGenerate()
  const f = useSiteRect()
  const previews = usePresetPreviews()
  const [variations, setVariations] = useState<number[] | null>(null)
  const brief = g.brief[project]
  const setBrief = (patch: Partial<GenBrief>) => g.set({ brief: { ...g.brief, [project]: { ...brief, ...patch } }, placed: null })
  const r = useMemo(() => (f ? runGenerator(f, project, g, g.seed) : null), [f, project, g])
  const total = GEN_USES.reduce((s, u) => s + (Number(brief.mix[u]) || 0), 0)
  const T = GEN_TYPES[g.key]
  const params = g.params[g.key]
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0

  const normalize = () => {
    if (!total) return
    const mix = Object.fromEntries(GEN_USES.map((u) => [u, Math.round(((Number(brief.mix[u]) || 0) / total) * 1000) / 10])) as Record<GenUse, number>
    const big = [...GEN_USES].sort((a, b) => mix[b] - mix[a])[0]
    mix[big] = Math.round((mix[big] + 100 - GEN_USES.reduce((s, u) => s + mix[u], 0)) * 10) / 10
    setBrief({ mix })
  }

  return (
    <div className="space-y-3 px-3 py-3 text-xs" data-testid="generate-tool">
      <p className="flex items-center gap-1.5 text-meta text-muted">
        <Sparkles size={13} className="shrink-0 text-accent" />
        <span>Sinnie Choi's massing generator, from her <a href="https://github.com/xubynii/dtmass" target="_blank" rel="noreferrer" className="text-accent underline">Downtown Massing Tool</a></span>
        <Help label="About Generate">
          Choose a typology and a brief: target floor area, program mix, preferred floorplate and an optional height target. The generator lays out whole storeys by use: shops and restaurant at grade, amenity and office in the podium, hotel and homes in the tower, and says where the result differs from the brief and why. Place it to replace this site's towers (Undo brings them back). Ported with her permission; her setback and by-law lookups stay in her tool, the Toolkit's own checks run on the result.
        </Help>
      </p>

      {!f ? (
        <div className="rounded-lg border border-line bg-black/[0.02] p-3">
          <p className="font-semibold text-ink">Choose a site first</p>
          <p className="mt-1 text-meta text-muted">The generator fills the site you pick on the Site step.</p>
          <button type="button" onClick={() => goToStep('site')} className={`${btn} mt-2 flex items-center gap-1.5 border-line hover:border-accent`}><ArrowLeft size={13} />Go to Site</button>
        </div>
      ) : (
        <>
          <p className="text-meta text-muted" data-testid="generate-site">On <b className="text-ink">{f.label}</b>{project === 'city' && <> · fills its {fmt(f.w, 1)} × {fmt(f.d, 1)} m rectangle</>}</p>

          {/* Typologies: her four presets as picture tiles. */}
          <div role="radiogroup" aria-label="Typology" className="grid grid-cols-2 gap-1.5">
            {KEYS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={g.key === k} onClick={() => { g.set({ key: k, seed: 0, placed: null }); setVariations(null) }} title={GEN_TYPES[k].blurb}
                className={`flex flex-col items-center gap-0.5 rounded-md border p-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${g.key === k ? 'border-accent bg-accent/[0.07]' : 'border-line hover:border-accent'}`}>
                <GenAxon blocks={previews[k]} site={PREVIEW_SITE} width={120} height={78} />
                <span className={`text-center text-meta leading-tight ${g.key === k ? 'font-semibold text-ink' : 'text-muted'}`}>{GEN_TYPES[k].name}</span>
              </button>
            ))}
          </div>

          <details open className="rounded-md border border-line">
            <summary className="cursor-pointer px-2 py-1.5 font-semibold text-ink">Brief · {fmt(brief.gfa)} m², {fmt(brief.plate)} m² plate{brief.heightTarget ? `, ${fmt(brief.heightTarget)} m target` : ''}</summary>
            <div className="grid gap-2 border-t border-line px-2 py-2">
              <div className="flex items-center gap-1.5 text-meta text-muted"><FlagChip flag="team_assumption" />Starting values; enter your brief.</div>
              <NumberField label="Target floor area above grade" value={brief.gfa} onChange={(v) => setBrief({ gfa: Math.max(500, v) })} step={500} unit="m²" />
              <NumberField label="Preferred tower floorplate" value={brief.plate} onChange={(v) => setBrief({ plate: Math.max(100, v) })} step={10} unit="m²" />
              <NumberField label="Height target (0 = none)" value={brief.heightTarget ?? 0} onChange={(v) => setBrief({ heightTarget: v > 0 ? v : null })} step={1} unit="m" />
              <fieldset className="grid gap-1">
                <legend className="mb-1 flex w-full items-center justify-between text-meta text-muted">
                  <span>Program mix, share of floor area</span>
                  <span className={Math.abs(total - 100) > 0.05 ? 'font-semibold text-amber-800' : ''}>{fmt(total, 1)}%</span>
                </legend>
                {GEN_USES.map((u) => (
                  <label key={u} className="flex items-center justify-between gap-2">
                    <span className="text-ink">{GEN_LABEL[u]}</span>
                    <span className="flex items-center gap-1"><input type="number" min={0} max={100} step={1} value={brief.mix[u]} aria-label={`${GEN_LABEL[u]} share`}
                      onChange={(e) => setBrief({ mix: { ...brief.mix, [u]: Math.max(0, Number(e.target.value) || 0) } })} className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" />%</span>
                  </label>
                ))}
                {Math.abs(total - 100) > 0.05 && <button type="button" onClick={normalize} className={`${btn} justify-self-start border-line hover:border-accent`}>Normalize to 100%</button>}
              </fieldset>
              <details>
                <summary className="cursor-pointer text-meta text-muted">Floor-to-floor by use</summary>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {GEN_USES.map((u) => (
                    <label key={u} className="flex items-center justify-between gap-1 text-meta"><span>{GEN_LABEL[u]}</span>
                      <input type="number" min={2.6} max={8} step={0.1} value={brief.f2f[u]} aria-label={`${GEN_LABEL[u]} floor-to-floor`}
                        onChange={(e) => setBrief({ f2f: { ...brief.f2f, [u]: Math.max(2.6, Number(e.target.value) || brief.f2f[u]) } })} className="w-14 rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums" /></label>
                  ))}
                </div>
              </details>
            </div>
          </details>

          <details open className="rounded-md border border-line">
            <summary className="cursor-pointer px-2 py-1.5 font-semibold text-ink">{T.name}</summary>
            <div className="grid gap-2 border-t border-line px-2 py-2">
              {T.params.map((q) => q.options ? (
                <label key={q.key} className="flex items-center justify-between gap-2"><span className="text-muted">{q.label}</span>
                  <select value={String(params[q.key])} onChange={(e) => { g.set({ params: { ...g.params, [g.key]: { ...params, [q.key]: e.target.value } }, placed: null }) }} className="rounded border border-line bg-panel px-1.5 py-1">
                    {q.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></label>
              ) : (
                <label key={q.key} className="grid gap-0.5">
                  <span className="flex justify-between text-muted"><span>{q.label}</span><output className="tabular-nums text-ink">{q.fmt(Number(params[q.key]))}</output></span>
                  <input type="range" min={q.min} max={q.max} step={q.step} value={Number(params[q.key])} aria-label={q.label}
                    onChange={(e) => g.set({ params: { ...g.params, [g.key]: { ...params, [q.key]: Number(e.target.value) } }, placed: null })} />
                </label>
              ))}
              <label className="flex items-center justify-between gap-2"><span className="text-muted">Street side of the site</span>
                <select value={g.frontage[project]} onChange={(e) => g.set({ frontage: { ...g.frontage, [project]: e.target.value as Side }, placed: null })} className="rounded border border-line bg-panel px-1.5 py-1">
                  {(['S', 'N', 'E', 'W'] as Side[]).map((sd) => <option key={sd} value={sd}>{project === 'vtc' && sd === 'S' ? 'Retail High Street' : `Faces ${compass(sideBearing(f, sd, north))}`}</option>)}
                </select></label>
            </div>
          </details>

          {r && (
            <section aria-label="Generated massing" className="grid gap-2 rounded-md border border-line p-2" data-testid="generate-result">
              <div className="flex justify-center"><GenAxon blocks={r.blocks} site={{ w: f.w, d: f.d }} width={280} height={190} label={`${r.label} on the site`} /></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                <span><b className="text-ink">{fmt(r.height, 1)} m</b> tall</span><span><b className="text-ink">{r.storeys}</b> storeys</span>
                <span>FSR <b className="text-ink">{fmt(r.fsr, 2)}</b></span><span><b className="text-ink">{fmt(r.genTotal)}</b> of {fmt(r.reqTotal)} m²</span>
              </div>
              {r.conflicts.map((c) => (
                <div key={c.title} role="note" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-950">
                  <p className="flex items-start gap-1.5 font-semibold"><TriangleAlert size={13} className="mt-0.5 shrink-0" />{c.title}</p>
                  <p className="mt-0.5">{c.text}</p><p className="mt-0.5 italic">{c.fix}</p>
                </div>
              ))}
              <details>
                <summary className="cursor-pointer text-meta font-semibold text-ink">Requested against generated</summary>
                <table className="mt-1 w-full text-meta tabular-nums">
                  <thead><tr className="text-muted"><th className="text-left font-normal">Use</th><th className="text-right font-normal">Requested</th><th className="text-right font-normal">Generated</th></tr></thead>
                  <tbody>{r.rows.map((x) => <tr key={x.use}><td>{GEN_LABEL[x.use]}</td><td className="text-right">{fmt(x.target)} m²</td><td className={`text-right ${Math.abs(x.gen - x.target) > Math.max(60, x.target * 0.08) ? 'font-semibold text-amber-800' : ''}`}>{fmt(x.gen)} m²</td></tr>)}</tbody>
                </table>
              </details>
              {r.notes.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-meta font-semibold text-ink">Why the numbers differ ({r.notes.length})</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-meta text-muted">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </details>
              )}
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="generate-place" onClick={() => applyGenerated(r, f)} className={`${btn} flex items-center gap-1.5 border-accent bg-accent font-semibold text-white hover:bg-accent/90`}>
                  <Check size={13} />{hasTowers ? 'Replace the towers with this' : 'Place this massing'}
                </button>
                <button type="button" onClick={() => setVariations(variations ? null : [1, 2, 3])} aria-expanded={!!variations} className={`${btn} border-line hover:border-accent`}>Variations</button>
                {g.seed > 0 && <button type="button" onClick={() => g.set({ seed: 0, placed: null })} className={`${btn} border-line hover:border-accent`}>Back to the brief's answer</button>}
              </div>
              {hasTowers && <p className="text-meta text-muted">Replaces this site's towers; Undo brings them back.</p>}
              {variations && (
                <div className="grid grid-cols-3 gap-1" aria-label="Variations of the same brief">
                  {variations.map((sd) => {
                    const v = runGenerator(f, project, g, sd)
                    return (
                      <button key={sd} type="button" onClick={() => { g.set({ seed: sd, placed: null }); setVariations(null) }} aria-pressed={g.seed === sd} aria-label={`${v.label}: ${fmt(v.height, 0)} m, ${v.storeys} storeys`}
                        className={`flex flex-col items-center rounded-md border p-0.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${g.seed === sd ? 'border-accent' : 'border-line hover:border-accent'}`}>
                        <GenAxon blocks={v.blocks} site={{ w: f.w, d: f.d }} width={84} height={64} />
                        <span className="tabular-nums">{fmt(v.height, 0)} m · {v.storeys} st</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {g.placed && (
                <div role="status" className="rounded-md bg-accent/[0.07] px-2 py-1.5">
                  <p className="font-semibold text-ink">Placed {g.placed.label}: {g.placed.towers} tower{g.placed.towers === 1 ? '' : 's'}.</p>
                  {g.placed.notes.map((n) => <p key={n} className="mt-0.5 text-meta text-muted">{n}</p>)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
