// Live results of the built nodes, as workflow lines. Reads the same engines as the guided app (hooks/useResults),
// so a node on the Customize canvas and the same node in the guided app always agree.
import type { NodeDef } from '../data/registry'
import type { RuleResult, RuleState } from '../engine/types'
import { STATE_LABEL, type ConeState } from '../engine/viewCones'
import type { useResults } from '../hooks/useResults'
import type { Item, NodeOutput } from './workflowLogic'

export type Results = ReturnType<typeof useResults>
type Project = 'vtc' | 'city'

const PROJECT_LABEL: Record<Project, string> = { vtc: 'Competition site', city: 'Real Vancouver' }

const fromRule = (r: RuleResult, tower?: { id: string; name: string }): Item => ({
  id: r.id, label: r.label, value: r.value, threshold: r.threshold, state: r.state, flag: r.flag, source: r.source, note: r.note,
  towerId: tower?.id, towerName: tower?.name,
})

const CONE_RULE: Record<ConeState, RuleState | null> = { above: 'fail', within_uncertainty: 'warn', near_edge: 'warn', limit_unknown: 'unknown', clear: 'pass', outside: null }

function summarise(items: Item[], ok: string): { state: RuleState; headline: string } {
  const f = items.filter((i) => i.state === 'fail').length, w = items.filter((i) => i.state === 'warn').length, u = items.filter((i) => i.state === 'unknown').length
  if (f) return { state: 'fail', headline: `${f} fail${w ? ` · ${w} to check` : ''}` }
  if (w) return { state: 'warn', headline: `${w} to check` }
  if (u && u === items.length) return { state: 'unknown', headline: 'No estimate' }
  return { state: 'pass', headline: ok }
}

/** Output of a built node in the current project, or null if this module has no live adapter here yet. */
export function builtOutput(def: NodeDef, r: Results, project: Project, solar?: RuleResult[] | null): NodeOutput | null {
  if (def.projects && !def.projects.includes(project)) {
    const other = def.projects[0]
    return { state: 'idle', headline: `Runs in the ${PROJECT_LABEL[other]} project`, items: [] }
  }
  switch (def.id) {
    case 'built.vtc-rules': {
      const items = r.rules.map((x) => {
        // Height rules are per tower (id height-<tower id>); the rest are project-wide.
        const t = r.lifts.find((l) => x.id === `height-${l.tower.id}`)?.tower
        return fromRule(x, t)
      })
      return { ...summarise(items, 'All rules pass'), items }
    }
    case 'built.fsr': {
      const f = r.fsr
      const vtc = project === 'vtc'
      const items: Item[] = [
        { id: 'fsr-total', label: 'Total FSR', value: f.totalFsr.toFixed(2), threshold: 'reported, not judged', state: 'unknown', flag: 'team_assumption',
          source: { label: 'Gross area from the model, no exclusions (Vancouver FSR exclusions come with P01-M07)' } },
        vtc
          ? { id: 'fsr-nonres', label: 'Non-residential FSR (tier 2)', value: f.tier2.toFixed(2), threshold: '≥ 9.0 (brief pp.16, 19)', state: f.tier2 >= 9 ? 'pass' : 'warn', flag: 'verified',
              source: { label: 'Vancouver Tall Challenge brief (Buildner 2026)', page: 'pp.16, 19' }, note: 'Gross area, no exclusions (team assumption).' }
          // The 9.0 minimum is a competition rule, and the engine divides by the VTC block area: report only.
          : { id: 'fsr-nonres', label: 'Non-residential FSR (tier 2)', value: f.tier2.toFixed(2), threshold: 'reported, not judged: the 9.0 minimum is a VTC rule', state: 'unknown', flag: 'unverified',
              source: { label: 'Site area is the VTC block (144.8 × 79.2 m), not a City parcel' }, note: 'No parcel area for a downtown site yet, so this FSR is indicative only.' },
      ]
      return { state: vtc ? items[1].state : 'unknown', headline: `FSR ${f.totalFsr.toFixed(2)} · non-res ${f.tier2.toFixed(2)}`, items }
    }
    case 'built.viewcones': {
      const items: Item[] = []
      for (const c of r.cones) {
        for (const k of c.checks) {
          const state = CONE_RULE[k.state]
          if (!state) continue
          items.push({
            id: `cone-${k.cone.id}-${c.tower.id}`, label: `View cone ${k.cone.id} · ${k.cone.name}`,
            value: k.limit !== null ? `top ${c.topZ.toFixed(1)} m vs limit ${k.limit.toFixed(1)} m` : STATE_LABEL[k.state],
            threshold: k.param ? `estimated limit ±${k.param.u95} m` : 'no published slope: no estimate',
            state, flag: k.param?.flag ?? 'unresolved', source: { label: k.param?.source ?? 'City of Vancouver view cone (no parameters published)', url: k.cone.url },
            towerId: c.tower.id, towerName: c.tower.name, note: 'Estimate only; the City View Cone Assessment governs.',
          })
        }
        if (!c.checks.some((k) => CONE_RULE[k.state])) {
          items.push({ id: `cone-none-${c.tower.id}`, label: 'Protected view cones', value: 'Outside every cone', threshold: 'inside no cone', state: 'pass', flag: 'verified',
            source: { label: 'City of Vancouver view cone geometry' }, towerId: c.tower.id, towerName: c.tower.name })
        }
      }
      const o = r.cones[0]?.overall
      return { ...summarise(items, 'Below every estimate'), headline: o ? STATE_LABEL[o] : 'No tower', items }
    }
    case 'built.sun':
      return { state: 'unknown', headline: 'Preview (not the City test)', items: [
        { id: 'sun-preview', label: 'Sun & shadow', value: 'Visual preview in the 3D view', threshold: 'City solar access test (22 Sep, 10:00–16:00) is researched, not built', state: 'unknown',
          flag: 'unverified', source: { label: 'Approximate solar formula (±0.5°), not yet checked against NOAA' } },
      ] }
    case 'built.core-lifts': {
      const items = r.lifts.flatMap((l) => l.rules.map((x) => fromRule(x, l.tower)))
      const cars = r.lifts.reduce((s, l) => s + l.totalCars, 0)
      const short = Math.max(0, ...r.lifts.map((l) => l.requiredMax - l.modelledCore))
      const s = summarise(items, 'Core fits')
      return { ...s, headline: `${cars} cars · ${short > 0.5 ? `core short ${Math.round(short)} m²` : 'core fits'}${s.state === 'fail' || s.state === 'warn' ? ` · ${s.headline}` : ''}`, items }
    }
    case 'built.egress': {
      const items = r.egress.flatMap((e) => e.rules.map((x) => fromRule(x, e.tower)))
      const w = Math.max(0, ...r.egress.map((e) => e.widthMm))
      const s = summarise(items, 'all pass')
      return { ...s, headline: `${r.egress[0]?.stairs ?? 2} stairs × ${Math.round(w)} mm · ${s.headline}`, items }
    }
    case 'built.sky-room': {
      const items = r.skyRooms.flatMap((x) => x.rules.map((y) => fromRule(y, x.tower)))
      const room = r.skyRooms.find((x) => x.room)
      const s = summarise(items, 'all pass')
      return { ...s, headline: room ? `Level ${room.room!.level} · ~${Math.round(room.visitorsPerHour)} visitors/h` : 'No public room yet', items }
    }
    case 'built.solar-access': {
      // Runs in a worker (hooks/useSolarAccess); the canvas shows its last result.
      if (!solar) return { state: 'idle', headline: 'Computing shadows…', items: [] }
      // Per-space lines and the descriptive sun-hours line flow on; the self-test and caveats stay in the panel.
      const items = solar.filter((x) => x.id.startsWith('solar-space-') || x.id === 'solar-hours' || x.id === 'solar-table1').map((x) => fromRule(x))
      const tested = items.filter((i) => i.id.startsWith('solar-space-'))
      const s = summarise(tested.length ? tested : items, 'No new shadow')
      const swept = tested.length ? `${tested.filter((i) => !i.value?.startsWith('0 m²')).length} of ${tested.length} spaces get new shadow` : 'No public space placed'
      return { state: s.state, headline: swept, items }
    }
    default:
      return null
  }
}
