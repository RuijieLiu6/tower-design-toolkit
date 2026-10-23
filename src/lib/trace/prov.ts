// The decision trace as a W3C PROV-O bundle in JSON-LD (research P16-M04 "TraceBundle"): each recorded iteration is a
// check run (Activity) by the tool (SoftwareAgent) that used a design (Entity) and generated results (Entity); later
// designs were derived from earlier ones; decisions and rule-card reviews are Activities associated with a Person.
// Names are replaced by "Person 1, 2…" unless the user keeps them. The export is for the team's own audit, not for the
// competition entry (entries must stay anonymous).
import { CARDS_DRAFTED_BY, type RuleCard } from '../../data/ruleCards'
import { hashOf } from '../project/stable'
import { counts, weakestFlag, worstState } from './digest'
import { cardHash } from './review'
import type { Trace } from './trace'

const NS = 'urn:tower-studio:'
export const PROV_CONTEXT = {
  '@vocab': `${NS}term:`,
  prov: 'http://www.w3.org/ns/prov#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ts: `${NS}term:`,
  'prov:startedAtTime': { '@type': 'xsd:dateTime' },
  'prov:generatedAtTime': { '@type': 'xsd:dateTime' },
  'prov:used': { '@type': '@id' },
  'prov:wasAssociatedWith': { '@type': '@id' },
  'prov:wasGeneratedBy': { '@type': '@id' },
  'prov:wasDerivedFrom': { '@type': '@id' },
  'prov:wasAttributedTo': { '@type': '@id' },
  'prov:hadMember': { '@type': '@id' },
}

export interface ProvOptions { anonymise: boolean; app: string; cards: RuleCard[]; exportedAt: string }
type Node = Record<string, unknown>

export function traceToProv(trace: Trace, o: ProvOptions): { '@context': typeof PROV_CONTEXT; '@graph': Node[] } {
  const graph: Node[] = []
  const tool = `${NS}agent:tool`, drafter = `${NS}agent:card-drafter`
  graph.push({ '@id': tool, '@type': ['prov:Agent', 'prov:SoftwareAgent'], 'rdfs:label': `${o.app}: deterministic checks, no AI in results` })
  graph.push({ '@id': drafter, '@type': ['prov:Agent', 'prov:SoftwareAgent'], 'rdfs:label': `Rule-card drafts: ${CARDS_DRAFTED_BY}` })

  // People, numbered in order of first appearance; the number is stable within one export.
  const people = new Map<string, string>()
  const person = (name: string) => {
    const key = name.trim() || 'Unnamed'
    let id = people.get(key)
    if (!id) {
      id = `${NS}person:${people.size + 1}`
      people.set(key, id)
      graph.push({ '@id': id, '@type': ['prov:Agent', 'prov:Person'], 'rdfs:label': o.anonymise ? `Person ${people.size}` : key })
    }
    return id
  }

  // Rule set as exported: one entity per card version, collected.
  const cardId = (c: RuleCard) => `${NS}card:${c.id}@${cardHash(c)}`
  const setId = `${NS}ruleset:${hashOf(o.cards.map(cardHash))}`
  for (const c of o.cards) graph.push({ '@id': cardId(c), '@type': 'prov:Entity', 'rdfs:label': c.title, 'prov:wasAttributedTo': drafter, 'ts:clause': `${c.source.label}${c.source.page ? `, ${c.source.page}` : ''}`, 'ts:summary': c.summary, 'ts:deontic': c.deontic, 'ts:strength': c.strength, 'ts:flag': c.flag })
  graph.push({ '@id': setId, '@type': ['prov:Entity', 'prov:Collection'], 'rdfs:label': `Rule cards at export (${o.cards.length})`, 'prov:hadMember': o.cards.map(cardId) })

  // Iterations: design entity, check-run activity, results entity, derivation from the previous design.
  const designs = new Set<string>()
  let prevDesign: string | null = null
  const resultsOf = new Map<string, string>()
  for (const it of trace.iterations) {
    const design = `${NS}design:${it.hash}`
    if (!designs.has(design)) {
      designs.add(design)
      graph.push({ '@id': design, '@type': 'prov:Entity', 'rdfs:label': `Design ${it.hash}`, 'ts:designHash': it.hash, ...(prevDesign && prevDesign !== design ? { 'prov:wasDerivedFrom': prevDesign } : {}) })
    }
    prevDesign = design
    const run = `${NS}run:${it.id}`, results = `${NS}results:${it.id}`
    resultsOf.set(it.id, results)
    graph.push({ '@id': run, '@type': 'prov:Activity', 'rdfs:label': it.label, 'ts:kind': it.kind, 'prov:startedAtTime': it.at, 'prov:used': design, 'prov:wasAssociatedWith': tool })
    graph.push({
      '@id': results, '@type': 'prov:Entity', 'rdfs:label': `Results of “${it.label}”`, 'prov:wasGeneratedBy': run,
      'ts:counts': counts(it.digest), 'ts:worstState': worstState(it.digest), 'ts:weakestFlag': weakestFlag(it.digest) ?? 'none',
      'ts:lines': it.digest.lines.map((l) => ({ 'ts:result': l.id, 'ts:state': l.state, 'ts:value': l.value, 'ts:flag': l.flag })),
    })
  }

  for (const d of trace.decisions) {
    const used = resultsOf.get(d.iterationId)
    graph.push({
      '@id': `${NS}decision:${d.id}`, '@type': ['prov:Activity', 'ts:Decision'], 'rdfs:label': d.issue, 'prov:startedAtTime': d.at,
      'prov:wasAssociatedWith': person(d.author), ...(used ? { 'prov:used': used } : {}),
      'ts:option': d.option, 'ts:outcome': d.outcome, 'ts:rationale': d.rationale, 'ts:origin': d.origin,
    })
  }

  const byId = new Map(o.cards.map((c) => [c.id, c]))
  for (const r of trace.reviews ?? []) {
    const c = byId.get(r.cardId)
    const card = c && cardHash(c) === r.cardHash ? cardId(c) : `${NS}card:${r.cardId}@${r.cardHash}`
    graph.push({
      '@id': `${NS}review:${r.id}`, '@type': ['prov:Activity', 'ts:Review'], 'rdfs:label': `Blind-first review of ${r.cardId}`, 'prov:startedAtTime': r.at,
      'prov:used': card, 'prov:wasAssociatedWith': person(r.reviewer),
      'ts:mode': r.mode, 'ts:verdict': r.verdict, 'ts:note': r.note, 'ts:dwellMs': r.dwellMs, 'ts:deonticMatched': r.matches.deontic, 'ts:strengthMatched': r.matches.strength,
      'ts:reading': { 'ts:requires': r.reading.requires, 'ts:parameter': r.reading.parameter, 'ts:rule': r.reading.rule, 'ts:deontic': r.reading.deontic, 'ts:strength': r.reading.strength },
      'ts:origin': r.origin,
    })
  }

  graph.unshift({
    '@id': `${NS}bundle:${hashOf({ i: trace.iterations.map((x) => x.id), d: trace.decisions.map((x) => x.id), r: (trace.reviews ?? []).map((x) => x.id) })}`,
    '@type': ['prov:Bundle', 'prov:Entity'], 'rdfs:label': 'Tower Design Toolkit decision trace', 'prov:generatedAtTime': o.exportedAt, 'prov:wasAttributedTo': tool,
    'ts:names': o.anonymise ? 'replaced by Person 1, 2… (rationales and notes are kept as written)' : 'kept',
    'ts:limits': 'Records what was recorded, not that the reasoning was sound. Iterations do not yet record the app or rule-set version they ran with; the rule set here is the one at export. For the team only: entries must stay anonymous.',
  })
  return { '@context': PROV_CONTEXT, '@graph': graph }
}
