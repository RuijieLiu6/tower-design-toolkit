// Evidence lint (plan §4: "unsourced thresholds fail"). Every result a built node shows must name its source, state
// its threshold and carry a known evidence flag; a "verified" result must point somewhere a reader can check
// (a page, clause, table, URL or research source id). Used by evidenceLint.test.ts on every built engine.
import type { Flag, RuleResult } from '../engine/types'

export const FLAGS: Flag[] = ['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption']

export interface LintIssue { node: string; rule: string; problem: string }

/** A reference a reader can follow: page, clause, section, table, figure, URL or a research source id. */
const CHECKABLE = /(\bp\.\s?\d|\bpp\.\s?\d|\bs\.\s?\d|\bsection\b|\bcl\.\s?\d|\bclause\b|\btable\b|\bfigure\b|\bfig\.\s?\d|\bart\.\s?\d|\bpara\b|\bS\d+\.\d|\b[A-Z]\d{2}-S\d+|\bP\d{2}-S\d+|\bP\d{2}-M\d+|\bVBBL\b|\bby-law\b|https?:\/\/)/i

export function lintRule(node: string, r: RuleResult): LintIssue[] {
  const out: LintIssue[] = []
  const add = (problem: string) => out.push({ node, rule: r.id, problem })
  if (!r.source || !r.source.label?.trim()) add('no source')
  if (!FLAGS.includes(r.flag)) add(`unknown evidence flag "${String(r.flag)}"`)
  if (!r.threshold?.trim()) add('no threshold stated')
  if (r.flag === 'verified' && r.source && !r.source.url && !r.source.page && !CHECKABLE.test(r.source.label)) add('"verified" without a checkable reference (page, clause, URL or source id)')
  return out
}

export function lintRules(node: string, rules: RuleResult[]): LintIssue[] {
  return rules.flatMap((r) => lintRule(node, r))
}

/** Ledger rows (economics presets and the like): a value needs a source and a known flag. */
export function lintRow(node: string, id: string, row: { flag: Flag; source: string }): LintIssue[] {
  const out: LintIssue[] = []
  if (!row.source?.trim()) out.push({ node, rule: id, problem: 'no source' })
  if (!FLAGS.includes(row.flag)) out.push({ node, rule: id, problem: `unknown evidence flag "${String(row.flag)}"` })
  return out
}
