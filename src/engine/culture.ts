// Engagement ledger and claims guard (research P07-M01, round 4). Stage A: claim-restricting rules and fixed text only,
// with no cultural content and no AI verdict. The ladder, phrase list and counterpart list are team designs awaiting
// paid Indigenous review (unreviewed platform rule). Only people can engage the Nations; the tool never does.
import type { RuleResult, Source } from './types'

export const NATIONS = ['Musqueam', 'Squamish', 'Tsleil-Waututh'] as const
export type Nation = (typeof NATIONS)[number]

/** Engagement ladder per Nation (P07-M01). One Nation's status says nothing about the other two. */
export const LADDER: { level: 0 | 1 | 2 | 3 | 4; name: string; detail: string; allows: string }[] = [
  { level: 0, name: 'N0 · No engagement', detail: 'Standing default. Nobody from the Nation took part.', allows: 'Only the statement that no Nation took part.' },
  { level: 1, name: 'N1 · Desk research only', detail: 'Public documents read; not engagement.', allows: 'Wording that names the documents read, never engagement wording.' },
  { level: 2, name: 'N2 · Organizer answer logged', detail: 'A question to the organizer and its answer are logged; not engagement.', allows: 'Wording that cites the logged answer.' },
  { level: 3, name: 'N3 · Conversation', detail: 'A conversation with a named person; counterpart recorded.', allows: '"Spoke with" wording only.' },
  { level: 4, name: 'N4 · Written permission', detail: 'Written permission from an authorized decision-maker for one stated use, with a document reference.', allows: '"Approved by" wording for that use, with the reference.' },
]

export type Counterpart = 'none' | 'staff' | 'member' | 'authorized'
export const COUNTERPART_LABEL: Record<Counterpart, string> = {
  none: 'No one',
  staff: 'Nation staff (not a decision-maker)',
  member: 'Community member',
  authorized: 'Authorized representative (written decision)',
}

export interface NationRecord {
  status: 0 | 1 | 2 | 3 | 4
  counterpart: Counterpart
  /** What the evidence is (documents read, the logged answer, the conversation). */
  evidence: string
  /** Document reference for N4 (letter, email, agreement id). */
  reference: string
  date: string
  /** The one use an N4 permission covers. */
  use: string
  /** The team has looked at this row and confirms it is true. */
  confirmed: boolean
}

export const DEFAULT_RECORD: NationRecord = { status: 0, counterpart: 'none', evidence: '', reference: '', date: '', use: '', confirmed: false }

/** Problems with a declared record (P07-M01 metrics: evidence for N2-N4; N4 needs an authorized counterpart and a reference). */
export function recordIssues(r: NationRecord): string[] {
  const out: string[] = []
  if (r.status >= 2 && !r.evidence.trim()) out.push('Add an evidence note (needed from N2 up).')
  if (r.status >= 3 && r.counterpart === 'none') out.push('Record who the counterpart was (needed from N3 up).')
  if (r.status === 4 && r.counterpart !== 'authorized') out.push('N4 needs a written decision from an authorized representative.')
  if (r.status === 4 && !r.reference.trim()) out.push('N4 needs a document reference.')
  if (r.status === 4 && !r.use.trim()) out.push('N4 covers one stated use: say which.')
  if (r.status >= 2 && !r.date.trim()) out.push('Add the date.')
  return out
}

/** Fixed statement matched to the declared status (editable copy in the UI; no cultural content). */
export function statementFor(n: Nation, r: NationRecord): string {
  switch (r.status) {
    case 0: return `No ${n} representative took part in this work, and nothing here claims their engagement, consultation or approval.`
    case 1: return `No ${n} representative took part in this work. The team read public documents only${r.evidence.trim() ? ` (${r.evidence.trim()})` : ''}; this is desk research, not engagement.`
    case 2: return `No ${n} representative took part in this work. The organizer's answer on contact${r.date ? ` (${r.date})` : ''} is logged; this is not engagement.`
    case 3: return `Team members spoke with ${r.counterpart === 'none' ? '[counterpart]' : COUNTERPART_LABEL[r.counterpart].toLowerCase().replace(/ \(.*\)/, '')} of the ${n} Nation${r.date ? ` on ${r.date}` : ''}. This was a conversation, not consultation, approval or endorsement.`
    case 4: return `The ${n} Nation's authorized representative gave written permission for ${r.use.trim() || '[stated use]'} (${r.reference.trim() || '[reference]'}${r.date ? `, ${r.date}` : ''}). It covers that use only.`
  }
}

export interface ClaimRule {
  id: string
  label: string
  re: RegExp
  /** Minimum status that allows the wording; 'banned' = never for a competition entry. */
  need: 3 | 4 | 'banned'
  /** Fires only when the sentence names a Nation or Indigenous peoples in general. */
  needsNation: boolean
  why: string
  /**
   * Motif wording (node built.claims-coverage): fires only when this also matches the sentence (a Nation, Salish, a
   * language, a cultural practice, or form and ornament), and passes only once a person's read is recorded.
   */
  context?: RegExp
  needsReader?: boolean
}

// Motif wording (node built.claims-coverage, completes gap G26). Borrowing motifs as "context" is the method Al-Kodmany's
// Ch.4 describes (Placemaking with Tall Buildings, pp.87–89, 110–111: tiers and star plans taken as identity); in
// Vancouver that route leads to appropriation, so the wording needs N4 for each Nation it touches and a person's read.
// English words only; Nation-language names stay in the stage B registry.
const LANGUAGE_RE = /\b(?:languages?|place[- ]?names?|oral\s+histor(?:y|ies)|legends?|stories|story)\b/i
const PRACTICE_RE = /\b(?:weav(?:e|es|ing)|woven|weavers?|baskets?|basketry|carv(?:e|ed|es|ing|ings)|canoes?|totems?|longhouses?|house\s*posts?|formline|spindle\s+whorls?|blankets?|regalia|potlatch|cedar\s+(?:bark|hats?|boxes?)|bentwood)\b/i
const FORM_RE = /\b(?:forms?|shapes?|ornament(?:s|al|ation)?|patterns?|motifs?|fa[cç]ades?|crowns?|silhouettes?|profiles?|cladding|screens?|textures?|geometr(?:y|ies)|massing|tops?|spires?)\b/i
export const MOTIF_RE = /\b(?:inspired\s+by|inspiration\s+from|evok(?:es|ed|ing|e)|evocative\s+of|echo(?:es|ed|ing)?|draw(?:s|n|ing)?\s+(?:on|from|upon)|drew\s+(?:on|from|upon)|(?:pays?|paying|paid)\s+homage|homage\s+to|a\s+nod\s+to|reminiscent\s+of)\b/gi

/** Stage A phrase list (P07-M01, frozen): an unreviewed platform rule with no cultural content. */
export const CLAIM_RULES: ClaimRule[] = [
  { id: 'consulted', label: 'Duty-sense "consulted"', re: /\bconsult(?:ed|ing|ation|ations|s)?\b/gi, need: 'banned', needsNation: true,
    why: 'The duty to consult sits with the Crown; federal guidance says third parties have no legal obligation to consult. If you mean you read something, say "read".' },
  { id: 'approved', label: 'Approval or endorsement', re: /\b(?:approved|endorsed|sanctioned|supported)\s+by\b|\bendorse(?:d|ment|s)?\b|\bwith\s+(?:the\s+)?(?:approval|consent|permission)\s+of\b/gi, need: 4, needsNation: true,
    why: 'Only a written decision from an authorized representative (N4, with its reference) supports approval wording, and only for the stated use.' },
  { id: 'collaboration', label: 'Collaboration phrase', re: /\bin\s+collaboration\s+with\b|\bco-?design(?:ed|ing|s)?\b|\bwith\s+the\s+blessing\s+of\b|\bhonou?r(?:ing|s|ed)?\b[^.!?]{0,80}\bwith\s+permission\b/gi, need: 4, needsNation: true,
    why: 'Collaboration phrases on the stage A ban list are barred from N0 to N3.' },
  { id: 'engagement', label: 'Engagement wording', re: /\b(?:spoke|speaking|talked|talking|met|meeting|meetings|conversations?|engaged|engaging|engagement|worked)\s+with\b|\bengagement\s+(?:of|from)\b/gi, need: 3, needsNation: true,
    why: 'Wording that says people took part needs at least N3 (a conversation with a recorded counterpart) for that Nation; N1 desk research never supports it.' },
  { id: 'motif', label: 'Motif wording (borrowed form)', re: MOTIF_RE, need: 4, needsNation: false, needsReader: true,
    context: new RegExp(`${LANGUAGE_RE.source}|${PRACTICE_RE.source}|${FORM_RE.source}`, 'i'),
    why: 'Saying a form is inspired by, evokes, echoes, draws on or pays homage to a Nation, its language or a cultural practice borrows motifs as context (Al-Kodmany, Placemaking with Tall Buildings, pp.87–89, 110–111, read as a warning). It needs N4 for each Nation it touches and a person’s read recorded in Engagement & claims; the tool never judges the meaning.' },
  { id: 'fpic', label: 'Free, prior and informed consent', re: /\bfree,?\s+prior,?\s+and\s+informed\s+consent\b|\bFPIC\b/gi, need: 'banned', needsNation: false,
    why: 'A hypothetical competition entry has no real project, so FPIC cannot be claimed (P07-M02 lock).' },
]

const NATION_RE: Record<Nation, RegExp> = { Musqueam: /\bmusqueam\b/i, Squamish: /\bsquamish\b/i, 'Tsleil-Waututh': /\btsleil-?\s?waututh\b/i }
// English names only. Nation-language names come from each Nation's own page in stage B (P07-M05 registry), never typed here.
// "Salish" (Coast Salish) names the wider cultural and language family, so it is checked against all three Nations
// (node built.claims-coverage). "United Nations" is not a Nation reference (it used to hit and check against all three).
const GENERAL_RE = /\b(?:first\s+nations?|host\s+nations?|(?<!\bunited\s+)nations?|indigenous|aboriginal|MST|(?:coast\s+)?salish)\b/i

export interface ClaimFinding {
  rule: ClaimRule
  phrase: string
  /** Offsets in the text. */
  start: number
  end: number
  sentence: string
  nations: Nation[]
  /** Nations named in the sentence, or all three when it speaks of Nations in general. */
  general: boolean
  pass: boolean
  reason: string
}

function sentences(text: string): { s: string; start: number }[] {
  const out: { s: string; start: number }[] = []
  const re = /[^.!?\n]+[.!?]*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) if (m[0].trim()) out.push({ s: m[0], start: m.index })
  return out
}

/** A person's read of the motif wording (node built.claims-coverage): who read it and when. Empty name = none recorded. */
export interface MotifReader { name: string; date?: string }
const readerOk = (r?: MotifReader | null): r is MotifReader => !!r && !!r.name.trim()

/**
 * Scans board or narrative text for wording above each Nation's declared status. Regex only, no AI verdict. Motif
 * wording is checked in every sentence, whether or not it names a Nation: against the Nations it touches (those named;
 * all three for Salish, Nations in general, a language or a cultural practice), and always needing a person's read.
 */
export function lintClaims(text: string, records: Record<Nation, NationRecord>, reader?: MotifReader | null): ClaimFinding[] {
  const out: ClaimFinding[] = []
  for (const { s, start } of sentences(text)) {
    const named = NATIONS.filter((n) => NATION_RE[n].test(s))
    const general = !named.length && GENERAL_RE.test(s)
    const nations = named.length ? named : general ? [...NATIONS] : []
    for (const rule of CLAIM_RULES) {
      if (rule.needsNation && !nations.length) continue
      if (rule.context && !nations.length && !rule.context.test(s)) continue
      // A language or a cultural practice beside motif wording touches all three Nations even when none is named.
      const touched = rule.needsReader && !nations.length && (LANGUAGE_RE.test(s) || PRACTICE_RE.test(s)) ? [...NATIONS] : nations
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(s))) {
        let pass: boolean, reason: string
        if (rule.need === 'banned') { pass = false; reason = rule.why }
        else if (rule.needsReader) {
          const low = touched.filter((n) => records[n].status < 4 || !records[n].reference.trim())
          const read = readerOk(reader)
          pass = read && low.length === 0
          reason = pass && readerOk(reader) ? `Allowed: read by ${reader.name.trim()}${reader.date ? ` (${reader.date})` : ''}${touched.length ? `; ${touched.join(', ')} at N4 with a reference` : ''}.`
            : `${[...(low.length ? [`${low.join(', ')} ${low.length === 1 ? 'is' : 'are'} below N4 (or has no reference)`] : []), ...(read ? [] : ['no person’s read is recorded'])].join('; ')}. ${rule.why}`
          out.push({ rule, phrase: m[0], start: start + m.index, end: start + m.index + m[0].length, sentence: s.trim(), nations: touched, general: general || (touched.length > 0 && !named.length), pass, reason })
          continue
        }
        else {
          const low = nations.filter((n) => records[n].status < (rule.need as number) || (rule.need === 4 && !records[n].reference.trim()))
          pass = low.length === 0 && nations.length > 0
          reason = pass ? `Allowed: ${nations.join(', ')} at N${rule.need} or above${rule.need === 4 ? ' with a reference' : ''}.` : `${low.join(', ')} ${low.length === 1 ? 'is' : 'are'} below N${rule.need}${rule.need === 4 ? ' (or has no reference)' : ''}. ${rule.why}`
        }
        out.push({ rule, phrase: m[0], start: start + m.index, end: start + m.index + m[0].length, sentence: s.trim(), nations, general, pass, reason })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** The generic no-contact rule: shown until a person confirms names, clauses and dates in a browser (P07-M01). */
export const CONTACT_RULE = 'Do not contact any juror, their firms, the organizer\'s advisors, the Commissioning Party or City staff about the entry. Ask questions only through the competition portal. Do not seek feedback on the entry from anyone on the jury, including in studio reviews.'

/** Fixed non-endorsement line (P07-M01). Wording needs the instructor's agreement; kept off boards to protect anonymity. */
export const NON_ENDORSEMENT = 'Tower Design Toolkit is a student study tool. It is not affiliated with, reviewed or endorsed by the competition organizer, the City of Vancouver, UBC, or the Musqueam, Squamish or Tsleil-Waututh Nations.'

export interface GateItem { id: string; label: string; ok: boolean }

/** M01 export gate: every item must hold before a board export. */
export function exportGate(records: Record<Nation, NationRecord>, findings: ClaimFinding[], contactAck: boolean, eligibility: { authors: boolean; associate: boolean; instructor: boolean }): GateItem[] {
  return [
    { id: 'declared', label: 'Status confirmed for all three Nations', ok: NATIONS.every((n) => records[n].confirmed) },
    { id: 'evidence', label: 'Evidence, counterpart and reference complete for the declared status', ok: NATIONS.every((n) => recordIssues(records[n]).length === 0) },
    { id: 'claims', label: 'No wording above a declared status (claims lint)', ok: findings.every((f) => f.pass) },
    { id: 'contact', label: 'No-contact rule acknowledged', ok: contactAck },
    { id: 'eligibility', label: 'Eligibility records: each author, the associate question, instructor confirmation', ok: eligibility.authors && eligibility.associate && eligibility.instructor },
  ]
}

// --- Result lines from data (gap G15) ------------------------------------------------------------------------------
// The guard as result lines, so it runs from a design's data (the Sources hub, the design harness) as well as from the
// browser's ledger. The lint above is unchanged; these lines only report it. No evidence notes, counterpart names or
// eligibility records go into a line: the status, the fixed statement and the flagged wording only.

const GUARD: Source = { label: 'Research P07-M01 (round 4): engagement ledger and claims guard, team rules awaiting paid Indigenous review' }

/** Full records from partial ones: a Nation or field left out takes DEFAULT_RECORD (N0 · No engagement, not confirmed). */
export function fullRecords(r: Partial<Record<Nation, Partial<NationRecord>>> = {}): Record<Nation, NationRecord> {
  return Object.fromEntries(NATIONS.map((n) => [n, { ...DEFAULT_RECORD, ...(r[n] ?? {}) }])) as Record<Nation, NationRecord>
}

const MOTIF_SOURCE: Source = { label: 'Al-Kodmany, Placemaking with Tall Buildings (Routledge 2026), Ch.4: motifs borrowed as context, read as a warning; rule from Research P07-M01 (person’s read, D22)', page: 'pp.87–89, 110–111' }

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Claims-lint summary, one line per flagged phrase, and one line per Nation's record. */
export function claimsLines(text: string | string[], partial: Partial<Record<Nation, Partial<NationRecord>>> = {}, reader?: MotifReader | null): RuleResult[] {
  const records = fullRecords(partial)
  const board = Array.isArray(text) ? text.join('\n') : text
  const findings = board.trim() ? lintClaims(board, records, reader) : []
  const bad = findings.filter((f) => !f.pass)
  const out: RuleResult[] = [{
    id: 'cc-lint', label: 'Claims lint: wording above each Nation’s declared status',
    value: !board.trim() ? 'no board text to check' : bad.length ? `${bad.length} phrase${bad.length > 1 ? 's' : ''} above status: ${[...new Set(bad.map((f) => `"${f.phrase}"`))].join(', ')}` : `no wording above status (${findings.length} engagement phrase${findings.length === 1 ? '' : 's'} found, all allowed)`,
    threshold: 'no engagement, consultation, approval or collaboration wording above the status declared for each Nation it names (N0–N4)',
    state: !board.trim() ? 'unknown' : bad.length ? 'fail' : 'pass', flag: 'team_assumption', source: GUARD,
    note: 'Regex only, no AI verdict: a sentence is checked when it names a Nation, Salish, or the Nations or Indigenous peoples in general (then against all three; "United Nations" does not count). Motif wording (inspired by, evokes, echoes, draws on, homage) is checked in every sentence about a Nation, a language, a cultural practice or form and ornament, and needs a person’s read. The phrase list is the stage A list plus the motif rule (21 Nov).',
  }]
  let c = 0, mo = 0
  for (const f of findings) {
    const motif = !!f.rule.needsReader
    out.push({
      id: motif ? `cc-motif-${mo++}` : `cc-claim-${c++}`, label: `"${f.phrase}" (${f.rule.label})`, value: clip(f.sentence),
      threshold: f.rule.need === 'banned' ? 'never in a competition entry' : motif ? `a person’s read recorded${f.nations.length ? `, and ${f.nations.join(', ')} at N4 with a reference` : ''}` : `${f.nations.join(', ')} at N${f.rule.need} or above${f.rule.need === 4 ? ' with a reference' : ''}`,
      state: f.pass ? 'pass' : 'fail', flag: motif ? 'verified' : 'team_assumption', source: motif ? MOTIF_SOURCE : GUARD, note: f.reason,
      // Node contract: whether a form borrows a motif lies outside a phrase check; until a person has read it, say so.
      ...(motif && !readerOk(reader) ? { specialist: 'Whether this form borrows a motif needs a person’s read (and, for a Nation, its own decision); the phrase check cannot judge it' } : {}),
    })
  }
  for (const n of NATIONS) {
    const r = records[n], issues = recordIssues(r)
    out.push({
      id: `cc-record-${n.toLowerCase()}`, label: `Engagement record: ${n}`, value: `${LADDER[r.status]?.name ?? `N${r.status}`}${r.confirmed ? ', confirmed' : ', not confirmed'}`,
      threshold: 'status confirmed by the team, with the evidence, counterpart, date and reference its level needs',
      state: issues.length ? 'warn' : r.confirmed ? 'pass' : 'unknown', flag: 'team_assumption', source: GUARD,
      note: issues.length ? issues.join(' ') : `Board statement: ${statementFor(n, r)}`,
    })
  }
  return out
}
