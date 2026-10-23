// Which sources the live results rest on (research P16-M02): curated rule cards matched to result lines, and every
// other document and clause the checks cite, so a reader can see what to open and verify before trusting a result.
import { NODE_GROUPS, RULE_CARDS, cardMatches, type RuleCard } from '../../data/ruleCards'
import type { RuleState } from '../../engine/types'
import type { ResultLine } from './digest'

const STATE_ORDER: RuleState[] = ['fail', 'warn', 'unknown', 'pass']
const FLAG_ORDER = ['false_assumption', 'unresolved', 'unverified', 'team_assumption', 'verified']
const flagRank = (f: string) => { const i = FLAG_ORDER.indexOf(f); return i < 0 ? 2 : i }

export const worstOf = (lines: { state: RuleState }[]): RuleState | null =>
  lines.length ? lines.reduce<RuleState>((w, l) => (STATE_ORDER.indexOf(l.state) < STATE_ORDER.indexOf(w) ? l.state : w), 'pass') : null
export const weakestOf = (flags: string[]): string => flags.reduce((w, f) => (flagRank(f) < flagRank(w) ? f : w), 'verified')
/** The results group a line belongs to ("lifts" in "lifts:t1:ntg-t1"). */
export const groupKey = (lineId: string) => lineId.split(':')[0]
export const linesForCard = (c: RuleCard, lines: ResultLine[]) => lines.filter((l) => cardMatches(c, l.id))

/** Cards behind one result of a built node, matched by the node and the rule id (result cards know no group). */
export function cardsForResult(nodeId: string | null | undefined, ruleId: string): RuleCard[] {
  if (!nodeId) return []
  return RULE_CARDS.filter((c) => c.usedBy.includes(nodeId) && c.results.some((p) => ruleId.startsWith(p.slice(p.indexOf(':') + 1))))
}

export interface SourceEntry { key: string; label: string; page?: string; lines: ResultLine[]; flag: string; state: RuleState; cards: string[] }

/** Group result lines by the document and clause they cite. Lines that cite nothing are left out. */
export function sourceIndex(lines: ResultLine[]): SourceEntry[] {
  const m = new Map<string, SourceEntry>()
  for (const l of lines) {
    if (!l.source) continue
    const key = `${l.source.label}|${l.source.page ?? ''}`
    const e = m.get(key) ?? { key, label: l.source.label, ...(l.source.page ? { page: l.source.page } : {}), lines: [], flag: 'verified', state: 'pass' as RuleState, cards: [] }
    e.lines.push(l)
    m.set(key, e)
  }
  for (const e of m.values()) {
    e.flag = weakestOf(e.lines.map((l) => l.flag))
    e.state = worstOf(e.lines) ?? 'unknown'
    e.cards = RULE_CARDS.filter((c) => e.lines.some((l) => cardMatches(c, l.id))).map((c) => c.id)
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label) || (a.page ?? '').localeCompare(b.page ?? ''))
}

export interface RulesBehind {
  /** Curated cards the node applies, each with the live results it backs (from any group). */
  cards: { card: RuleCard; lines: ResultLine[] }[]
  /** Sources of the node's other results, which no card covers yet. */
  other: SourceEntry[]
  /** Results that cite no document (team presets, derived values). */
  uncited: ResultLine[]
  lines: ResultLine[]
}

/** The rules behind one built node: its curated cards, then the sources of its uncarded live results. */
export function rulesBehind(nodeId: string, lines: ResultLine[]): RulesBehind {
  const groups = NODE_GROUPS[nodeId] ?? []
  const mine = lines.filter((l) => groups.includes(groupKey(l.id)))
  const cards = RULE_CARDS.filter((c) => c.usedBy.includes(nodeId) || mine.some((l) => cardMatches(c, l.id)))
  const rest = mine.filter((l) => !cards.some((c) => cardMatches(c, l.id)))
  return {
    cards: cards.map((card) => ({ card, lines: linesForCard(card, lines) })),
    other: sourceIndex(rest),
    uncited: rest.filter((l) => !l.source),
    lines: mine,
  }
}
