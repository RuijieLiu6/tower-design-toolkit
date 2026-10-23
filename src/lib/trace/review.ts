// Blind-first review of rule cards (research P16-M02, the plain review form that ships before 30 Nov): a person who did
// not draft the card opens the source, types their own reading without seeing the card, then sees it and gives a verdict.
// The form stores reviewer, mode, dwell time and the card's hash, so editing a card makes its review stale.
import type { Deontic, RuleCard, Strength } from '../../data/ruleCards'
import { hashOf } from '../project/stable'

export interface Reading { requires: string; parameter: string; rule: string; deontic: Deontic | ''; strength: Strength | '' }
export type Verdict = 'agree' | 'disagree' | 'unsure'
export interface CardReview {
  id: string; at: string; cardId: string; cardHash: string; reviewer: string
  mode: 'blind-first'
  /** What the reviewer typed before seeing the card. */
  reading: Reading
  verdict: Verdict; note: string
  /** Time from opening the form to the verdict. */
  dwellMs: number
  /** Did the blind reading give the card's deontic type and strength? */
  matches: { deontic: boolean; strength: boolean }
  origin: 'human'
}
export type ReviewState = 'unreviewed' | 'reviewed' | 'disputed' | 'stale'

/** Hash of what a reviewer checks: change any of it and earlier reviews no longer count. */
export const cardHash = (c: RuleCard) =>
  hashOf({ id: c.id, source: c.source, summary: c.summary, parameter: c.parameter, rule: c.rule, deontic: c.deontic, strength: c.strength, results: c.results })

/** A card's review state from its latest review on the current version. Agreement only counts when the blind reading
 *  also gave the same deontic type and strength; otherwise the difference is for people to resolve. */
export function reviewStatus(c: RuleCard, reviews: CardReview[]): { state: ReviewState; latest?: CardReview; reason?: string } {
  const mine = reviews.filter((r) => r.cardId === c.id)
  if (!mine.length) return { state: 'unreviewed' }
  const h = cardHash(c)
  const current = mine.filter((r) => r.cardHash === h)
  if (!current.length) return { state: 'stale', latest: mine[mine.length - 1], reason: 'The card changed after its last review.' }
  const latest = current[current.length - 1]
  if (latest.verdict === 'disagree') return { state: 'disputed', latest, reason: latest.note || 'The reviewer disagreed.' }
  if (latest.verdict === 'unsure') return { state: 'unreviewed', latest, reason: 'The reviewer was unsure: ask another person.' }
  const off = [!latest.matches.deontic && 'deontic type', !latest.matches.strength && 'strength'].filter(Boolean)
  if (off.length) return { state: 'disputed', latest, reason: `The blind reading differed on ${off.join(' and ')}: resolve it with whoever drafted the card.` }
  return { state: 'reviewed', latest }
}

export const REVIEW_LABEL: Record<ReviewState, string> = { unreviewed: 'Unreviewed', reviewed: 'Reviewed', disputed: 'Disputed', stale: 'Review stale' }

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** Build a review record, or null when the reading or reviewer is missing (a verdict without a blind reading is not a review). */
export function makeReview(c: RuleCard, reviewer: string, reading: Reading, verdict: Verdict, note: string, dwellMs: number): CardReview | null {
  if (!reviewer.trim() || !(reading.requires.trim() || reading.rule.trim()) || !reading.deontic || !reading.strength) return null
  return {
    id: newId(), at: new Date().toISOString(), cardId: c.id, cardHash: cardHash(c), reviewer: reviewer.trim().slice(0, 80), mode: 'blind-first',
    reading: { requires: reading.requires.trim().slice(0, 1000), parameter: reading.parameter.trim().slice(0, 300), rule: reading.rule.trim().slice(0, 300), deontic: reading.deontic, strength: reading.strength },
    verdict, note: note.trim().slice(0, 1000), dwellMs: Math.max(0, Math.round(dwellMs)),
    matches: { deontic: reading.deontic === c.deontic, strength: reading.strength === c.strength }, origin: 'human',
  }
}
