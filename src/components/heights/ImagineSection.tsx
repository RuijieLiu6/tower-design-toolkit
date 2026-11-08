// Imagine Vancouver in the Results panel (after Vista v37 imagine-city.js, Ruijie Liu): every Vista building under
// Existing · Height references · With view cones, with counts, the selected building's calculation and a CSV.
import { useMemo } from 'react'
import { SCENARIO_LABEL, buildingRow, imagine, imagineCsv, type BuildingRow, type ImaginePrep, type Scenario } from '../../engine/imagine'
import { surfacesFor } from '../../lib/heightData'
import { runImagine, useImagine } from '../../lib/imagineStore'
import { VISTA_ATTRIBUTION, buildingSource, isEstimate } from '../../lib/vistaBuildings'
import { useCityData } from '../CityContext'
import { FlagChip, Section } from '../ui'
import { U } from '../Units'
import { IMAGINE_COLORS } from './ImagineLayer'

const SCENARIOS: Scenario[] = ['existing', 'zoning', 'views']
const n = (v: number) => v.toLocaleString('en-CA')
const m = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} m`)

const partsCache = new WeakMap<ImaginePrep, Map<number, number[]>>()
function partsOfRows(prep: ImaginePrep) {
  let map = partsCache.get(prep)
  if (!map) { map = new Map(); prep.partRow.forEach((r, p) => { if (r >= 0) { const l = map!.get(r); if (l) l.push(p); else map!.set(r, [p]) } }); partsCache.set(prep, map) }
  return map
}

export default function ImagineSection() {
  const { data } = useCityData()
  const im = useImagine()
  const surfaces = useMemo(() => (data ? surfacesFor(data.grids) : null), [data])
  if (!data || !surfaces) return <Section title="Imagine Vancouver"><p className="text-meta text-muted" role="status">Loading the city model…</p></Section>
  if (data.model !== 'vista' || !data.vista) {
    return <Section title="Imagine Vancouver"><p className="text-meta text-muted">Imagine runs on Vista's city model (its buildings carry Vista's zoning table). Switch the buildings to Vista's model in Layers &amp; context.</p></Section>
  }
  const model = { model: data.model, footprints: data.footprints, vista: data.vista }
  const go = (s: Scenario) => void runImagine({ footprints: data.footprints, heights: data.heights }, surfaces, s)
  const res = im.results[im.scenario]
  const sourceOf = (p: number) => ({ text: buildingSource(model, p), estimated: isEstimate(model, p) })
  const exportCsv = () => {
    const prep = im.prep
    if (!prep || !im.table) return
    const all = { existing: im.results.existing ?? imagine(prep, 'existing'), zoning: im.results.zoning ?? imagine(prep, 'zoning'), views: im.results.views ?? imagine(prep, 'views') }
    useImagine.setState({ results: all })
    const parts = partsOfRows(prep), rows: { existing: BuildingRow; zoning: BuildingRow; views: BuildingRow }[] = []
    for (const [r, ps] of parts) {
      const e = buildingRow(prep, all.existing, r, ps, sourceOf), z = buildingRow(prep, all.zoning, r, ps, sourceOf), v = buildingRow(prep, all.views, r, ps, sourceOf)
      if (e && z && v) rows.push({ existing: e, zoning: z, views: v })
    }
    const blob = new Blob([imagineCsv(rows, `${im.table.attribution}. ${VISTA_ATTRIBUTION}`)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'imagine-vancouver.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const sel = im.selected !== null && im.prep && res ? (() => {
    const ps = partsOfRows(im.prep).get(im.selected) ?? []
    return { e: buildingRow(im.prep, im.results.existing ?? imagine(im.prep, 'existing'), im.selected, ps, sourceOf), z: buildingRow(im.prep, im.results.zoning ?? imagine(im.prep, 'zoning'), im.selected, ps, sourceOf), v: buildingRow(im.prep, im.results.views ?? imagine(im.prep, 'views'), im.selected, ps, sourceOf) }
  })() : null

  return (
    <Section title="Imagine Vancouver" help="Vista's comparison of every building in the model: Existing, Height references (the basic zoning height over the whole footprint) and With view cones (also below every cone surface, 0.1 m clearance). Connected parts scale together.">
      <div className="space-y-1.5 text-meta">
        {im.status === 'idle' || (im.status === 'error' && !im.prep) ? (
          <>
            <button type="button" onClick={() => go(im.scenario)} className="rounded border border-accent bg-accent/10 px-2 py-1 font-medium text-ink hover:bg-accent/20">Calculate every building</button>
            {im.error && <p role="alert" className="text-flag-unresolved">{im.error}</p>}
          </>
        ) : im.status === 'loading' ? (
          <div role="status" className="space-y-0.5">
            <div>Testing {n(data.footprints.length)} building parts against the zoning and the 24 cone surfaces…</div>
            <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round(im.progress * 100)}%` }} /></div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Scenario">
              {SCENARIOS.map((s) => (
                <button key={s} type="button" aria-pressed={im.scenario === s} onClick={() => go(s)}
                  className={`rounded border px-1.5 py-0.5 ${im.scenario === s ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line bg-white text-ink hover:bg-slate-50'}`}>{SCENARIO_LABEL[s]}</button>
              ))}
            </div>
            {res && (
              <p>
                {n(res.stats.buildings)} buildings · {n(res.stats.changed)} height changes ({n(res.stats.reduced)} lower, {n(res.stats.grown)} higher) · {n(res.stats.mapped)} under a view cone
                {im.scenario === 'views' && <> · cut by a City-sourced estimate {n(res.stats.byEstimate)}, by a study surface {n(res.stats.byStudy)}{res.stats.noPositiveHeight ? <> · <span className="text-flag-unresolved">{n(res.stats.noPositiveHeight)} to zero height under surfaces below the ground (study surfaces that run downhill from the eye: an artefact)</span></> : null}</>}
                {im.scenario !== 'existing' && <> · {n(res.stats.unresolvedZoning)} keep their height: no zoning number (never a guessed height)</>}
              </p>
            )}
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={im.show} onChange={(e) => im.set({ show: e.target.checked })} /> Show on the model (caps at the scenario roof; click one for its calculation)</label>
            {im.show && im.scenario !== 'existing' && (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-meta text-muted">
                {([['grown', 'higher'], ['zoning', 'lower: zoning'], ['estimate', 'lower: City-sourced estimate'], ['study', 'lower: study surface (assumption)']] as const).map(([k, l]) => (
                  <span key={k} className="flex items-center gap-1"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: IMAGINE_COLORS[k] }} />{l}</span>
                ))}
              </div>
            )}
            {sel?.v && sel.e && sel.z && (
              <div className="space-y-0.5 rounded border border-line px-1.5 py-1">
                <div className="flex items-center justify-between gap-2"><b className="text-ink">OSM building {sel.v.osmId}</b><button type="button" className="text-muted underline" onClick={() => im.set({ selected: null })}>Close</button></div>
                <div>Existing <U>{m(sel.e.existingHeightM)}</U> · {sel.e.heightSource}{sel.e.estimated && <> <FlagChip flag="unverified" /> estimated, not measured</>}</div>
                <div className="flex flex-wrap items-center gap-1">Zoning {sel.v.zoningM !== null ? <><U>{m(sel.v.zoningM)}</U> basic ({sel.v.rules.join(', ')}) <FlagChip flag="unverified" /></> : <>no number ({sel.v.rules.map((r) => r.replace(/^unresolved:/, '')).join(', ') || sel.v.zoningStatus}) <FlagChip flag="unresolved" /></>}</div>
                <div>Height references <U>{m(sel.z.scenarioHeightM)}</U> · With view cones <U>{m(sel.v.scenarioHeightM)}</U></div>
                {sel.v.controllingView && <div className="flex flex-wrap items-center gap-1">Cut by {sel.v.controllingView} ({sel.v.viewKind === 'study' ? 'study surface, assumption, not a City ceiling' : 'City-sourced estimate'}) <FlagChip flag={sel.v.viewFlag ?? 'unverified'} /></div>}
                {sel.v.assembly !== null && <div className="text-muted">Part of Vista assembly {sel.v.assembly}: its parts scale together.</div>}
              </div>
            )}
            <button type="button" onClick={exportCsv} className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50">Export CSV (all three scenarios)</button>
          </>
        )}
        <p className="text-meta text-muted">{VISTA_ATTRIBUTION}; zoning: City of Vancouver (OGL-Vancouver) via Vista. Study heights, not legal maximums or a City assessment.</p>
      </div>
    </Section>
  )
}
