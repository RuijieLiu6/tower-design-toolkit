// Engagement ledger and claims guard (research P07-M01, round 4). Stage A: claim-restricting rules and fixed text only,
// with no cultural content and no AI verdict. The ladder, phrase list and counterpart list are team designs awaiting
// paid Indigenous review (unreviewed platform rule). Only people can engage the Nations; the tool never does.

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
}

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
  { id: 'fpic', label: 'Free, prior and informed consent', re: /\bfree,?\s+prior,?\s+and\s+informed\s+consent\b|\bFPIC\b/gi, need: 'banned', needsNation: false,
    why: 'A hypothetical competition entry has no real project, so FPIC cannot be claimed (P07-M02 lock).' },
]

const NATION_RE: Record<Nation, RegExp> = { Musqueam: /\bmusqueam\b/i, Squamish: /\bsquamish\b/i, 'Tsleil-Waututh': /\btsleil-?\s?waututh\b/i }
// English names only. Nation-language names come from each Nation's own page in stage B (P07-M05 registry), never typed here.
const GENERAL_RE = /\b(?:first\s+nations?|host\s+nations?|nations?|indigenous|aboriginal|MST)\b/i

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

/** Scans board or narrative text for wording above each Nation's declared status. Regex only, no AI verdict. */
export function lintClaims(text: string, records: Record<Nation, NationRecord>): ClaimFinding[] {
  const out: ClaimFinding[] = []
  for (const { s, start } of sentences(text)) {
    const named = NATIONS.filter((n) => NATION_RE[n].test(s))
    const general = !named.length && GENERAL_RE.test(s)
    const nations = named.length ? named : general ? [...NATIONS] : []
    for (const rule of CLAIM_RULES) {
      if (rule.needsNation && !nations.length) continue
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(s))) {
        let pass: boolean, reason: string
        if (rule.need === 'banned') { pass = false; reason = rule.why }
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
