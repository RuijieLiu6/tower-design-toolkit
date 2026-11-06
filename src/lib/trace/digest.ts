// A compact record of what the checks said for one design (research P16-M04 "changed_results"): every result with
// its value, state and evidence flag, found by walking the live results, so checks added later are picked up too.
import type { CommunityRun } from '../../hooks/useCommunityResults'
import type { Flag, RuleState } from '../../engine/types'

export interface ResultLine {
  id: string; group: string; label: string; value: string; state: RuleState; flag: string; source?: { label: string; page?: string }
  /** The rule's threshold, when it states one (live only: saved iterations leave it out, lib/trace/trace.ts). */
  threshold?: string
}
export interface Digest { lines: ResultLine[]; metrics: Record<string, number> }

const STATES: RuleState[] = ['pass', 'warn', 'fail', 'unknown']
const GROUP: Record<string, string> = {
  rules: 'VTC rules', lifts: 'Core & lifts', egress: 'Egress & stairs', skyRooms: 'Sky room', streetwall: 'Streetwall',
  frontage: 'Frontage', groundPlane: 'Open space & links', cones: 'View cones', fsr: 'FSR', nature: 'City in Nature', wind: 'Wind procedure', structure: 'Structure', windStudy: 'Pedestrian wind', lifeSafety: 'Code & life safety', relaxAviation: 'Relaxations & aviation',
}
/** View-cone outcomes as rule states: above the estimate fails, no estimate or within uncertainty needs a check. */
const CONE_STATE: Record<string, RuleState> = { above: 'fail', within_uncertainty: 'warn', limit_unknown: 'warn', near_edge: 'pass', clear: 'pass', outside: 'pass' }

const isRule = (o: Record<string, unknown>) =>
  typeof o.id === 'string' && typeof o.label === 'string' && typeof o.value === 'string' && STATES.includes(o.state as RuleState) && typeof o.flag === 'string'

/** Walk a results object (as useResults returns it) and the community node runs. */
export function digestResults(results: Record<string, unknown>, community?: Map<string, CommunityRun>, names?: Record<string, string>): Digest {
  const lines: ResultLine[] = []
  const seen = new Set<string>()
  const add = (l: ResultLine) => { if (!seen.has(l.id)) { seen.add(l.id); lines.push(l) } }

  const walk = (v: unknown, group: string, path: string, tower: { id: string; name: string }, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 5) return
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, group, `${path}.${i}`, tower, depth + 1)); return }
    const o = v as Record<string, unknown>
    const t = o.tower as { id?: string; name?: string } | undefined
    const towerName = t && typeof t.name === 'string' ? t.name : tower.name
    const towerId = t && typeof t.id === 'string' ? t.id : tower.id
    if (isRule(o)) {
      const src = o.source as { label?: unknown; page?: unknown } | undefined
      add({ id: `${group}:${towerId ? `${towerId}:` : ''}${o.id}`, group: GROUP[group] ?? group, label: towerName && !(o.label as string).includes(towerName) ? `${o.label as string} (${towerName})` : (o.label as string), value: o.value as string, state: o.state as RuleState, flag: o.flag as string,
        ...(src && typeof src.label === 'string' ? { source: { label: src.label, ...(typeof src.page === 'string' ? { page: src.page } : {}) } } : {}),
        ...(typeof o.threshold === 'string' && o.threshold ? { threshold: o.threshold } : {}) })
      return
    }
    if (typeof o.overall === 'string' && typeof o.topZ === 'number' && t) {
      add({ id: `${group}:${towerId}:overall`, group: GROUP[group] ?? group, label: `View cones (${towerName})`, value: `top ${o.topZ.toFixed(1)} m geodetic, ${String(o.overall).replace(/_/g, ' ')}`, state: CONE_STATE[o.overall] ?? 'unknown', flag: o.overall === 'limit_unknown' ? 'unresolved' : 'team_assumption' })
      return
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'tower' && x && typeof x === 'object') walk(x, group, `${path}.${k}`, { id: towerId, name: towerName }, depth + 1)
  }

  const metrics: Record<string, number> = {}
  for (const [key, value] of Object.entries(results)) {
    if (key === 'fsr' && value && typeof value === 'object') {
      for (const m of ['total', 'totalFsr', 'tier1', 'tier2', 'tier3']) {
        const n = (value as Record<string, unknown>)[m]
        if (typeof n === 'number' && Number.isFinite(n)) metrics[`fsr.${m}`] = n
      }
      continue
    }
    walk(value, key, key, { id: '', name: '' }, 0)
  }
  for (const [id, run] of community ?? []) {
    for (const r of run.results) add({ id: `community:${r.id}:${id}`, group: `My nodes · ${names?.[id] ?? id}`, label: r.towerName ? `${r.label} (${r.towerName})` : r.label, value: r.value, state: r.info ? 'unknown' : r.state, flag: r.flag, source: { label: r.source.label, ...(r.source.page ? { page: r.source.page } : {}) } })
  }
  return { lines, metrics }
}

const STATE_RANK: Record<RuleState, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 }
const FLAG_RANK: Record<string, number> = { false_assumption: 0, unresolved: 1, unverified: 2, team_assumption: 3, verified: 4 }

export function counts(d: Digest): Record<RuleState, number> {
  const c: Record<RuleState, number> = { pass: 0, warn: 0, fail: 0, unknown: 0 }
  for (const l of d.lines) c[l.state]++
  return c
}
export const worstState = (d: Digest): RuleState => d.lines.reduce<RuleState>((w, l) => (STATE_RANK[l.state] < STATE_RANK[w] ? l.state : w), 'pass')
export const weakestFlag = (d: Digest): Flag | null =>
  (d.lines.reduce<string | null>((w, l) => (w === null || (FLAG_RANK[l.flag] ?? 2) < (FLAG_RANK[w] ?? 2) ? l.flag : w), null) as Flag | null)

export interface ResultChange { id: string; group: string; label: string; before?: { value: string; state: RuleState }; after?: { value: string; state: RuleState }; kind: 'worse' | 'better' | 'value' | 'added' | 'removed' }

/** What changed in the results between two designs, worst news first. */
export function diffResults(a: Digest, b: Digest): ResultChange[] {
  const A = new Map(a.lines.map((l) => [l.id, l])), B = new Map(b.lines.map((l) => [l.id, l]))
  const out: ResultChange[] = []
  for (const [id, x] of B) {
    const y = A.get(id)
    if (!y) { out.push({ id, group: x.group, label: x.label, after: { value: x.value, state: x.state }, kind: 'added' }); continue }
    if (y.state === x.state && y.value === x.value) continue
    const kind = STATE_RANK[x.state] < STATE_RANK[y.state] ? 'worse' : STATE_RANK[x.state] > STATE_RANK[y.state] ? 'better' : 'value'
    out.push({ id, group: x.group, label: x.label, before: { value: y.value, state: y.state }, after: { value: x.value, state: x.state }, kind })
  }
  for (const [id, y] of A) if (!B.has(id)) out.push({ id, group: y.group, label: y.label, before: { value: y.value, state: y.state }, kind: 'removed' })
  const order = { worse: 0, better: 1, added: 2, removed: 3, value: 4 }
  return out.sort((p, q) => order[p.kind] - order[q.kind])
}
