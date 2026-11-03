// Live workflow lines for the nodes whose results live outside useResults (economics, parking, facade, claims guard,
// provenance), so the Customize canvas shows them like the other built nodes. Each line keeps its flag and source.
import { money, VERDICT_LABEL, type EconResult } from '../engine/economics'
import type { FacadeResult } from '../engine/facade'
import type { GateItem, ClaimFinding } from '../engine/culture'
import type { ProvIssue, ProvEntry } from '../engine/provenance'
import type { RuleResult, RuleState } from '../engine/types'
import type { Item, NodeOutput } from './workflowLogic'
import type { Tower } from '../engine/types'
import type { InterchangeModel } from './interchange/model'
import { toCustomize } from './interchange/converters'

export interface ExtraInputs {
  econ: EconResult
  mobility: { rules: RuleResult[]; maxStalls: number }
  facade: FacadeResult
  culture: { findings: ClaimFinding[]; gate: GateItem[] }
  provenance: { prov: ProvEntry[]; issues: ProvIssue[] }
  /** The uploaded model of the current project and its towers (Layer 0 interchange). */
  model?: { model: InterchangeModel | null; towers: Tower[] }
}

const item = (r: RuleResult): Item => ({ id: r.id, label: r.label, value: r.value, threshold: r.threshold, state: r.state, flag: r.flag, source: r.source, note: r.note })
const worst = (items: Item[]): RuleState => (items.some((i) => i.state === 'fail') ? 'fail' : items.some((i) => i.state === 'warn') ? 'warn' : items.every((i) => i.state === 'pass') ? 'pass' : 'unknown')

export function extraOutput(id: string, x: ExtraInputs): NodeOutput | null {
  switch (id) {
    case 'built.economics': {
      const e = x.econ
      const state: RuleState = e.verdict === 'works' ? 'pass' : e.verdict === 'marginal' ? 'warn' : e.verdict === 'fails' ? 'fail' : 'unknown'
      return {
        state, headline: `${VERDICT_LABEL[e.verdict]} · ${money(e.rlvAfter)} left for land`,
        items: [{ id: 'econ-rlv', label: 'Land residual after CAC', value: money(e.rlvAfter), threshold: e.land != null ? `≥ land price ${money(e.land)}` : 'land price needed', state, flag: 'unverified', source: { label: 'Program Value Visualizer method and Vancouver 2026 pack (research P08)' } }],
      }
    }
    case 'built.mobility': {
      const items = x.mobility.rules.map(item)
      const open = items.filter((i) => i.flag === 'unresolved').length
      return { state: worst(items), headline: `Max ${x.mobility.maxStalls} stalls (unverified) · ${open} rates unresolved`, items }
    }
    case 'built.facade': {
      const items = x.facade.rules.map(item)
      return { state: worst(items), headline: `WWR ${x.facade.wall ? Math.round((x.facade.glass / x.facade.wall) * 100) : 0}%`, items }
    }
    case 'built.culture-claims': {
      const bad = x.culture.findings.filter((f) => !f.pass).length, done = x.culture.gate.filter((g) => g.ok).length
      const items: Item[] = x.culture.gate.map((g) => ({ id: `gate-${g.id}`, label: g.label, value: g.ok ? 'done' : 'open', state: g.ok ? 'pass' : 'unknown', flag: 'team_assumption', source: { label: 'Research P07-M01 export gate (unreviewed platform rule)' } }))
      return { state: bad ? 'fail' : done === x.culture.gate.length ? 'pass' : 'unknown', headline: `${done} of ${x.culture.gate.length} export checks${bad ? ` · ${bad} claim${bad > 1 ? 's' : ''} above status` : ''}`, items }
    }
    case 'built.provenance': {
      const n = x.provenance.prov.length, k = x.provenance.issues.length
      return { state: !n ? 'unknown' : k ? 'warn' : 'pass', headline: n ? `${n} elements · ${k ? `${k} to fix` : 'complete'}` : 'No elements logged yet', items: [] }
    }
    case 'built.model':
      return toCustomize(x.model?.model ?? null, x.model?.towers ?? [])
    default:
      return null
  }
}
