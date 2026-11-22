// Results for "Higher Buildings Policy" (node placement, 21 Nov 2026): is the site inside a Higher Buildings area, which
// ceiling applies, does it front a street open to about 700 ft (HBP rev. 31 Mar 2026 p.3 2.1(b)-(d), p.5 Figure 1), and
// the community benefit the design declares (pp.3-4 2.1(f)(g)), read from the sky room's line, never computed twice.
// The visual is the Higher Buildings map item (components/HigherBuildings.tsx): inspect, pin and frame it in Real
// Vancouver; on the competition site it says why it is not drawn. Screening only; never a determination.
import { useMemo } from 'react'
import { hbpChecklist } from '../engine/hbpArea'
import type { RuleResult, Tower } from '../engine/types'
import { useResults } from '../hooks/useResults'
import { useRelax } from '../lib/relaxStore'
import { useSiteStreets } from '../lib/siteStreets'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { HigherBuildingsDockItem, HigherBuildingsVtcItem } from './HigherBuildings'
import { Caveat, RuleRows } from './ResultViz'
import { NumberField, Section } from './ui'

export interface HbpResult { tower: Tower; rules: RuleResult[] }

/** Each tower's Higher Buildings lines (area, ceiling, the 700 ft streets) on the project in view. */
export function useHbp(): HbpResult[] {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const on = useRelax((s) => s.on)
  const ceilingFt = useRelax((s) => s.hbpCeilingFt)
  const streetsResult = useSiteStreets().result
  const streets = useMemo(() => (streetsResult ? streetsResult.streets.map((s) => s.name) : null), [streetsResult])
  return useMemo(() => towers.map((t) => {
    const city = project === 'city'
    // Both projects; the competition site reads as an assumed site (engine/hbpArea.ts).
    return { tower: t, rules: hbpChecklist(t, city ? 'city' : 'vtc', CITY_ORIGIN, { routeOn: on.includes('hbp'), ceilingFt, streets: city ? streets : null }) }
  }), [towers, project, on, ceilingFt, streets])
}

/** The sky room's 2.1(g) community-benefit lines, as the sky room computes them (a tower without one is left out). */
export function benefitLines(skyRooms: { tower: Tower; rules: RuleResult[] }[]): { tower: Tower; rule: RuleResult }[] {
  return skyRooms.flatMap((r) => r.rules.filter((x) => x.id.startsWith('skyroom-benefit')).map((rule) => ({ tower: r.tower, rule })))
}

export default function HbpPanel() {
  const results = useHbp()
  const project = useStore((s) => s.project)
  const hbpCeilingFt = useRelax((s) => s.hbpCeilingFt)
  const { skyRooms } = useResults()
  const enabled = useStore((s) => s.enabled)
  const benefit = useMemo(() => benefitLines(skyRooms), [skyRooms])
  return (
    <>
      <div className="mx-4 mt-3"><Caveat lead="Screening, not a determination">Membership of a Higher Buildings area is not approval; the Figure 1 ceilings are an unverified read of a low-resolution legend. The City decides.</Caveat></div>
      <Section title="Higher Buildings area">
        <div className="grid gap-2">
          {project === 'city' ? <HigherBuildingsDockItem /> : <HigherBuildingsVtcItem />}
          <NumberField label="Site-specific Higher Buildings ceiling" unit="ft" value={hbpCeilingFt ?? 0} min={0} step={5} onChange={(v) => useRelax.setState({ hbpCeilingFt: v > 0 ? v : null })}
            hint={project === 'city' ? '0 = the Figure 1 area’s ceiling (unverified read)' : '0 = the CBD’s 600 ft (assumed site)'} />
        </div>
      </Section>
      {results.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <RuleRows rules={r.rules} />
        </Section>
      ))}
      <Section title="Community benefit (2.1(g))">
        {!enabled['built.sky-room']
          ? <p className="text-meta text-muted">Read from the Sky room check: switch it on to see the benefit the design declares.</p>
          : benefit.length
            ? <div data-testid="hbp-benefit"><RuleRows rules={benefit.map((b) => (results.length > 1 ? { ...b.rule, label: `${b.rule.label} (${b.tower.name})` } : b.rule))} /></div>
            : <p className="text-meta text-muted">No community benefit declared yet (Sky room).</p>}
      </Section>
    </>
  )
}
