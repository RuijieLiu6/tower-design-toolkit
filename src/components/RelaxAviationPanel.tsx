// Results for "Relaxations & aviation" (C01-M06): the "Relaxations" mask switch and routes, the relaxation lines and the
// aviation checklist for each tower, and the corrected assumptions. Screening only; never a permit or aeronautical
// determination.
import { useMemo } from 'react'
import { NOT_A_DETERMINATION, RELAXATIONS, RELAX_AVIATION_FALSE_ASSUMPTIONS, aviationChecklist, relaxationChecklist, type Instrument } from '../engine/relaxAviation'
import type { RuleResult, Tower } from '../engine/types'
import { toggleInstrument, useRelax } from '../lib/relaxStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { ROUTE_STYLE } from './RelaxationMasks'
import { Card, FalseAssumptions } from './WindStructurePanel'
import { NumberField, Section, Toggle } from './ui'
import { useProjectSiteArea } from '../lib/siteArea'

export interface RelaxAviationResult { tower: Tower; relax: RuleResult[]; aviation: RuleResult[]; rules: RuleResult[] }

export function useRelaxAviation(): RelaxAviationResult[] {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  const on = useRelax((s) => s.on)
  const typed = useRelax((s) => s.siteArea)
  const study = useProjectSiteArea()
  // A typed area wins; otherwise the study site's (lib/siteArea.ts), named in the note.
  const siteArea = typed ?? study.area
  const areaSource = typed !== null ? 'typed in the Relaxations panel (team assumption)' : study.area !== null ? `${study.basis === 'parcels' ? 'the joined City parcels' : 'the study site boundary'}: ${study.source}` : undefined
  return useMemo(() => towers.map((t) => {
    const city = project === 'city'
    const relax = city ? relaxationChecklist(t, on, ground, siteArea, CITY_ORIGIN, areaSource) : []
    const aviation = aviationChecklist(t, city ? [t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]] : null)
    return { tower: t, relax, aviation, rules: [...relax, ...aviation] }
  }), [towers, project, ground, on, siteArea, areaSource])
}

export default function RelaxAviationPanel() {
  const results = useRelaxAviation()
  const project = useStore((s) => s.project)
  const { show, on, siteArea } = useRelax()
  const study = useProjectSiteArea()
  return (
    <>
      <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">{NOT_A_DETERMINATION}</div>
      <Section title="Relaxations">
        {project === 'city' ? (
          <div className="grid gap-2 text-[11px]">
            <div className="flex items-center gap-2"><Toggle checked={show} onChange={() => useRelax.setState({ show: !show })} label="Show relaxation masks" />Show where policy relaxations may apply (per view cone)</div>
            {(Object.keys(RELAXATIONS) as Instrument[]).map((k) => (
              <label key={k} className="flex items-start gap-1.5">
                <input type="checkbox" checked={on.includes(k)} onChange={() => toggleInstrument(k)} aria-label={`Switch on ${RELAXATIONS[k].label}`} className="mt-0.5" />
                <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: ROUTE_STYLE[k].color }} /><b>{RELAXATIONS[k].label}</b> ({RELAXATIONS[k].clause}): may enter {RELAXATIONS[k].cones.join(', ')}. <span className="text-muted">{RELAXATIONS[k].eligibility}</span></span>
              </label>
            ))}
            <NumberField label="Site area for the Exceptional Downtown Site test" unit="m²" value={siteArea ?? 0} min={0} step={100} onChange={(v) => useRelax.setState({ siteArea: v > 0 ? v : null })} hint={study.area !== null ? `0 = the study site's ${Math.round(study.area).toLocaleString('en-CA')} m²` : '0 = not known yet'} />
            <div className="flex flex-wrap gap-2 text-[10px] text-muted">
              {(['none', 'unlisted'] as const).map((r) => <span key={r} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border-2" style={{ borderColor: ROUTE_STYLE[r].color }} />{ROUTE_STYLE[r].label}</span>)}
            </div>
            <p className="text-[10px] text-muted">Routes are off by default and only relax their own cones; the limit shown with a route on is what the remaining cones allow. An Exceptional Downtown Site is a higher building too: switch both on.</p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-700">The competition site is hypothetical, so no view cone is modelled on it. Its 11,468 m² block is over the 8,000 m² Exceptional Downtown Site size (team reading, research C01); the views A, E, 9.x and J1 would still bind. Switch to Real Vancouver to see the masks.</p>
        )}
      </Section>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          {r.relax.length > 0 && <><h4 className="mb-1 text-[11px] font-semibold text-slate-700">View relaxations</h4><div className="mb-3 grid gap-2">{r.relax.map((x) => <Card key={x.id} r={x} />)}</div></>}
          <h4 className="mb-1 text-[11px] font-semibold text-slate-700">Aviation obligations</h4>
          <div className="grid gap-2">{r.aviation.map((x) => <Card key={x.id} r={x} />)}</div>
        </Section>
      ))}
      <FalseAssumptions items={RELAX_AVIATION_FALSE_ASSUMPTIONS} />
    </>
  )
}
