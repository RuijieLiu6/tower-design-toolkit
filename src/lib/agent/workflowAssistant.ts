// The workflow assistant (Ruijie, 7 Nov): "translates a user's design intention into an editable arrangement of
// available nodes, and helps them modify and understand that workflow". Four behaviours, each one it can actually do:
//   - Suggest: a starting workflow from a project description (the closest preset plus the closest built nodes);
//   - Modify: add, remove or loop nodes on the current workflow ("add X after the program stage", "create an iteration
//     between massing and the checks", "remove the loop");
//   - Explain: why a node is there and what it needs (data/nodeNeeds.ts, the registry's question and limits);
//   - Clarify: one focused question with choices when a request can't be placed (no matching node, two candidates).
// It only arranges the built nodes (data/registry.ts BUILT_NODES); it never writes analysis or invents a node. Words are
// matched by a small table of the names people use for each node and phase, and, once the in-browser language model
// (./model2vec.ts) has loaded, by closeness to each node's name and question. Pure functions; the UI is
// components/landing/WorkflowAssistant.tsx and the cover (components/landing/Intro.tsx) previews and applies.
import { BUILT_NODES } from '../../data/registry'
import { NODE_NEEDS } from '../../data/nodeNeeds'
import { PHASES, phaseOfNode, type PhaseId } from '../phases'
import { USER_TYPES, type Preset } from '../userTypes'
import { addLoop, byPhase, dropLoops, insertAfter, insertByPhase, isLoopIn, linear, phaseIndex, takeOff, walk, type Board, type Edge } from '../workflowGraph'
import type { Index } from './match'
import type { Embedder } from './model2vec'

export type Model = { e: Embedder; index: Index } | null
export interface Proposal {
  kind: 'proposal'
  capability: 'suggest' | 'modify'
  board: Board
  added: string[]
  removed: string[]
  /** Loops the proposal adds, and how many it takes away. */
  loops: Edge[]
  unlooped: number
  summary: string
  /** The preset a suggestion starts from, if any. */
  preset: Preset | null
  via: 'model' | 'words'
}
export interface Explanation { kind: 'explain'; node: string; name: string; phase: string; question: string; reads: string[]; asks: string[]; onBoard: boolean; human: string | null }
export interface Clarification { kind: 'clarify'; question: string; options: { label: string; text: string }[] }
export type Reply = Proposal | Explanation | Clarification

const NODE = new Map(BUILT_NODES.map((n) => [n.id, n]))
export const nodeName = (id: string) => NODE.get(id)?.name ?? id
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

// ---------- the words people use ----------
/** What people call each node (lower case; longer phrases win over the shorter ones inside them). */
const ALIASES: Record<string, string[]> = {
  'built.vtc-rules': ['hard rules', 'competition rules', 'vtc rules', 'height band', 'brief rules'],
  'built.fsr': ['fsr', 'floor area', 'floor space ratio', 'density', 'gfa', 'program area', 'mixed-use', 'mixed use', 'program mix'],
  'built.viewcones': ['view cone', 'view cones', 'viewcone', 'protected view', 'protected views', 'height limit', 'height limits'],
  'built.relax-aviation': ['relaxation', 'relaxations', 'aviation', 'airport', 'higher buildings policy', 'exceptional site'],
  'built.sun': ['shadow', 'shadows', 'sun and shadow', 'sun preview'],
  'built.solar-access': ['solar access', 'sun hours', 'shadow on parks', 'new shadow', 'sunlight on parks', 'park', 'parks'],
  'built.core-lifts': ['lift', 'lifts', 'elevator', 'elevators', 'vertical transport', 'core size'],
  'built.egress': ['egress', 'exit stairs', 'stairs', 'evacuation', 'exits'],
  'built.life-safety': ['life safety', 'code check', 'building code', 'fire safety', 'sprinkler', 'barrier-free', 'accessibility', 'plant floors', 'risers', 'generator', 'water pressure', 'water zones'],
  'built.sky-room': ['sky room', 'public sky room', 'sky deck', 'observation deck', 'public deck', 'room at height'],
  'built.economics': ['economics', 'land value', 'land residual', 'pro forma', 'feasibility', 'cost', 'costs', 'value', 'finance', 'viability'],
  'built.culture-claims': ['engagement', 'nation', 'nations', 'first nations', 'indigenous', 'claims', 'reconciliation', 'musqueam', 'squamish', 'tsleil-waututh'],
  'built.model': ['rhino model', 'my model', 'uploaded model', 'upload'],
  'built.provenance': ['ai use', 'ai-use', 'provenance', 'ai log', 'ai record', 'ai-generated'],
  'built.mobility': ['parking', 'loading', 'bike', 'bikes', 'bicycle', 'servicing'],
  'built.facade': ['facade', 'façade', 'glazing', 'glass', 'bird', 'birds', 'bird-friendly', 'window to wall'],
  'built.interior': ['interior', 'unit mix', 'units', 'homes', 'apartments', 'hotel keys', 'floor layout', 'activities'],
  'built.daylight-depth': ['daylight', 'plate depth', 'floor depth', 'natural light'],
  'built.view-from': ['view from', 'rooftop view', 'views from', 'mountain view', 'mountain views', 'north shore'],
  'built.vista': ['vista', 'view study', 'view studies', 'site boundary'],
  'built.heights': ['height suggestion', 'zoning height', 'how tall', 'height reference', 'height references'],
  'built.pr-streetwall': ['streetwall', 'street wall', 'podium', 'tower form', 'floorplate', 'tower separation', 'step-back', 'stepback'],
  'built.pr-frontage': ['active frontage', 'frontage', 'shopfront', 'shopfronts', 'retail frontage', 'entrances', 'canopy', 'canopies', 'public ground floor', 'ground floor'],
  'built.pr-ground': ['open space', 'plaza', 'pops', 'mid-block', 'midblock', 'public space', 'public realm', 'public ground floor', 'through-block link'],
  'built.city-in-nature': ['city in nature', 'nature', 'ecology', 'tree canopy', 'trees', 'rainwater', 'stormwater', 'habitat', 'biodiversity', 'green roof'],
  'built.wind-procedure': ['wind procedure', 'slenderness', 'slender', 'wind tunnel', 'wind load', 'wind loads'],
  'built.structure': ['structure', 'structural', 'seismic', 'earthquake', 'lateral system', 'outrigger', 'outriggers'],
  'built.wind-study': ['wind study', 'pedestrian wind study'],
  'built.wind-screen': ['wind', 'pedestrian wind', 'wind screen', 'downwash', 'windy'],
  'built.trips': ['trips', 'transit', 'station', 'commute', 'mode split', 'peak hour', 'skytrain', 'ridership'],
  'built.energy-carbon': ['energy', 'carbon', 'teui', 'tedi', 'ghgi', 'embodied carbon', 'emissions', 'solar panels', 'pv', 'net zero', 'sustainability', 'sustainable'],
}
/** Topics two or more nodes touch, each for its own reason: the assistant asks which one is meant. */
const TOPICS: { words: string[]; about: string; options: { id: string; why: string }[] }[] = [
  { words: ['water', 'water systems', 'water-systems', 'plumbing'], about: 'water', options: [
    { id: 'built.life-safety', why: 'water pressure zones, risers and plant floors' },
    { id: 'built.city-in-nature', why: 'rainwater detention and the rainwater rules' },
  ] },
  { words: ['sun', 'sunlight', 'solar'], about: 'sun', options: [
    { id: 'built.sun', why: 'where the towers cast shadow at a chosen time' },
    { id: 'built.solar-access', why: 'new shadow on protected parks, and sun hours' },
    { id: 'built.energy-carbon', why: 'where solar panels are worth placing' },
  ] },
  { words: ['views', 'view'], about: 'views', options: [
    { id: 'built.viewcones', why: 'how high the tower may rise under the protected views' },
    { id: 'built.view-from', why: 'what a person sees from a roof, corner or floor' },
    { id: 'built.vista', why: 'the design in each protected view, with a PDF study' },
  ] },
]
const PHASE_WORDS: Record<PhaseId, string[]> = {
  site: ['site', 'context', 'site stage', 'site phase'],
  form: ['form', 'massing', 'volume', 'shape', 'form stage'],
  program: ['program', 'programme', 'program stage', 'stacking'],
  schematic: ['schematic', 'schematic design', 'technical'],
  present: ['present', 'presentation', 'boards', 'board'],
}
/** The checks against rules and targets, for "the (relevant) checks / constraints". */
const CHECKS = ['built.vtc-rules', 'built.viewcones', 'built.relax-aviation', 'built.solar-access', 'built.core-lifts', 'built.egress', 'built.life-safety', 'built.sky-room', 'built.mobility',
  'built.facade', 'built.daylight-depth', 'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', 'built.city-in-nature', 'built.wind-procedure', 'built.structure', 'built.wind-study', 'built.wind-screen', 'built.energy-carbon']
const CHECK_WORDS = ['constraint checks', 'constraints', 'checks', 'rule checks', 'rules', 'compliance', 'limits', 'evaluations', 'analysis']

type Ref = { kind: 'node'; id: string; at: number } | { kind: 'phase'; id: PhaseId; at: number } | { kind: 'checks'; at: number } | { kind: 'topic'; topic: (typeof TOPICS)[number]; at: number }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every node, phase, topic or "checks" the text names, in reading order; longer phrases claim their words first. */
export function references(text: string): Ref[] {
  const low = ` ${text.toLowerCase().replace(/[’']/g, "'")} `
  const taken = new Array(low.length).fill(false)
  const cands: { phrase: string; ref: (at: number) => Ref }[] = []
  for (const [id, words] of Object.entries(ALIASES)) for (const w of words) cands.push({ phrase: w, ref: (at) => ({ kind: 'node', id, at }) })
  for (const [id, words] of Object.entries(PHASE_WORDS)) for (const w of words) cands.push({ phrase: w, ref: (at) => ({ kind: 'phase', id: id as PhaseId, at }) })
  for (const w of CHECK_WORDS) cands.push({ phrase: w, ref: (at) => ({ kind: 'checks', at }) })
  for (const topic of TOPICS) for (const w of topic.words) cands.push({ phrase: w, ref: (at) => ({ kind: 'topic', topic, at }) })
  cands.sort((a, b) => b.phrase.length - a.phrase.length)
  const out: Ref[] = []
  for (const c of cands) {
    const re = new RegExp(`(?<![a-z0-9])${esc(c.phrase)}(?![a-z0-9])`, 'g')
    for (const m of low.matchAll(re)) {
      const s = m.index!, e = s + c.phrase.length
      if (taken.slice(s, e).some(Boolean)) continue
      for (let i = s; i < e; i++) taken[i] = true
      out.push(c.ref(s))
    }
  }
  // A phrase that names two nodes on purpose ("public ground floor": frontage and open space) keeps both.
  return out.sort((a, b) => a.at - b.at)
}
/** Nodes for phrases claimed by more than one node (e.g. "public ground floor"). */
function nodesOf(refs: Ref[], text: string): string[] {
  const ids = refs.filter((r): r is Extract<Ref, { kind: 'node' }> => r.kind === 'node').map((r) => r.id)
  const low = text.toLowerCase()
  for (const [id, words] of Object.entries(ALIASES)) if (words.includes('public ground floor') && low.includes('public ground floor')) ids.push(id)
  return [...new Set(ids)]
}

// ---------- model scores ----------
const dotp = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
const close = (v: Float32Array, vecs: Float32Array[]) => { const s = vecs.map((x) => dotp(v, x)).sort((a, b) => b - a); return s.length > 1 ? (s[0] + s[1]) / 2 : s[0] ?? 0 }
const longWords = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
const STOP = new Set(['tower', 'towers', 'vancouver', 'design', 'with', 'that', 'this', 'from', 'into', 'have', 'help', 'explore', 'want', 'would', 'like', 'make', 'building', 'project'])

function nodeScores(text: string, model: Model): Map<string, number> {
  const s = new Map<string, number>()
  if (model) {
    const v = model.e.embed([text])[0]
    for (const n of model.index.nodes) s.set(n.id, close(v, n.vecs))
  } else {
    const words = longWords(text).filter((w) => !STOP.has(w))
    for (const n of BUILT_NODES) { const hay = `${n.name} ${n.question}`.toLowerCase(); s.set(n.id, words.filter((w) => hay.includes(w)).length) }
  }
  return s
}
/**
 * The starting preset for a description: the one that shares most nodes with what the words name (named nodes weigh
 * twice the guessed ones), nudged by how
 * close its own description is (the model's closeness, or shared words). None when nothing is shared and the
 * description is not close: the suggestion is then made of the named nodes alone.
 */
export function bestPreset(text: string, named: string[], guessed: string[], model: Model): { preset: Preset; score: number } | null {
  const all = USER_TYPES.flatMap((t) => t.presets)
  let near: (p: Preset) => number
  if (model) {
    const v = model.e.embed([text])[0], by = new Map(model.index.presets.map((x) => [x.preset.id, close(v, x.vecs)]))
    near = (p) => by.get(p.id) ?? 0
  } else {
    const words = longWords(text).filter((w) => !STOP.has(w))
    near = (p) => { const hay = `${p.name} ${p.goal}`.toLowerCase(); return words.filter((w) => hay.includes(w)).length / 4 }
  }
  // Nodes the words name count twice as much as nodes only guessed from shared words or the model.
  const ranked = all.map((p) => { const strong = p.nodes.filter((x) => named.includes(x)).length, weak = p.nodes.filter((x) => guessed.includes(x) && !named.includes(x)).length; return { preset: p, shared: strong + weak, near: near(p), score: 2 * strong + weak + near(p) } })
    .sort((a, b) => b.score - a.score)
  const top = ranked[0]
  if (!top) return null
  // One shared node is enough to start from that preset (a fuller first workflow than the named nodes alone).
  const ok = top.shared >= 1 || (model ? top.near >= 0.42 : false)
  return ok ? { preset: top.preset, score: top.score } : null
}

// ---------- helpers on the board ----------
const diff = (from: Board, to: Board) => ({ added: to.nodes.filter((x) => !from.nodes.includes(x)), removed: from.nodes.filter((x) => !to.nodes.includes(x)) })
const loopsOf = (b: Board) => { const run = walk(b.edges); return b.edges.filter((e) => isLoopIn(run, e)) }
const phaseName = (id: string) => phaseOfNode(id)?.name ?? 'Site'

function proposal(capability: Proposal['capability'], from: Board, to: Board, summary: string, via: Proposal['via'], preset: Preset | null = null): Proposal {
  const { added, removed } = diff(from, to)
  const before = new Set(loopsOf(from).map((e) => `${e.a}>${e.b}`)), after = loopsOf(to)
  return { kind: 'proposal', capability, board: to, added, removed, loops: after.filter((e) => !before.has(`${e.a}>${e.b}`)), unlooped: [...before].filter((k) => !after.some((e) => `${e.a}>${e.b}` === k)).length, summary, preset, via }
}

const FOCUS: { label: string; add: string }[] = [
  { label: 'Height and protected views', add: 'focus on height limits and protected views' },
  { label: 'A public ground floor', add: 'focus on the public ground floor, frontage and open space' },
  { label: 'Sun, shadow and wind', add: 'focus on shadow on parks and pedestrian wind' },
  { label: 'Floor area and value', add: 'focus on floor area, FSR and land value' },
  { label: 'Core, structure and energy', add: 'focus on lifts, structure and energy' },
]

// ---------- the four behaviours ----------
const EXPLAIN = /^(please\s+)?(explain|why|what|tell me|how does|how do|which information|who)\b|\bexplain\b|\bwhat (information|info|data|inputs?) (does|do)\b|\bneeds? to know\b/
const LOOP = /\b(loop|loops|iterat\w*|repeat|cycle|go back|check back|feedback|revisit)\b/
const REMOVE = /\b(remove|drop|delete|take (?:out|off)|get rid of|without|no longer)\b/
const ADD = /\b(add|include|insert|put in|bring in|plus|also (?:check|test|study|run))\b/
const POS = /\b(after|before)\s+(?:the\s+)?([a-z][a-z &-]*?)(?:\s+(?:stage|phase|step|node))?(?=[,.;!?]|$|\s+(?:and|then|to|so)\b)/

/**
 * Read a request against the current workflow. `focus`: the node the visitor last touched (for "this node"). Returns a
 * proposal to preview, an explanation, or a question with choices.
 */
export function interpret(text: string, board: Board, model: Model = null, focus: string | null = null): Reply {
  const t = text.trim()
  const low = t.toLowerCase()
  const via: Proposal['via'] = model ? 'model' : 'words'
  const run = walk(board.edges)
  if (!t) return { kind: 'clarify', question: 'What would you like to explore?', options: FOCUS.map((f) => ({ label: f.label, text: `Help me explore a tower; ${f.add}` })) }
  const refs = references(low)
  const named = nodesOf(refs, low)

  // Explain
  if (EXPLAIN.test(low) && !ADD.test(low) && !REMOVE.test(low) && !/\b(create|make)\b/.test(low)) {
    const id = named[0] ?? (/\bthis\b/.test(low) ? focus : null)
    if (!id) return { kind: 'clarify', question: 'Which node should I explain?', options: (run.length ? run : PHASES.flatMap((p) => p.nodes)).slice(0, 6).map((n) => ({ label: nodeName(n), text: `Explain ${nodeName(n)}` })) }
    const n = NODE.get(id)!, needs = NODE_NEEDS[id] ?? { reads: [], asks: [] }
    return { kind: 'explain', node: id, name: n.name, phase: phaseName(id), question: n.question, reads: needs.reads, asks: needs.asks, onBoard: board.nodes.includes(id), human: n.human ?? null }
  }

  // Modify: loops
  if (LOOP.test(low)) {
    if (REMOVE.test(low) || /\bno loops?\b|\bstraight\b/.test(low)) {
      const to = dropLoops(board)
      const n = loopsOf(board).length
      if (!n) return { kind: 'clarify', question: 'There is no loop on the workflow yet. Add one?', options: [{ label: 'Loop the whole run', text: 'Add a loop over the whole workflow' }] }
      return proposal('modify', board, to, `Takes away ${n === 1 ? 'the loop' : `the ${n} loops`}: a straight run from Start to Enter.`, via)
    }
    if (run.length < 2) return { kind: 'clarify', question: 'A loop needs at least two nodes on the workflow. Start from a description first?', options: FOCUS.slice(0, 3).map((f) => ({ label: f.label, text: `Help me explore a tower; ${f.add}` })) }
    const rank = (id: string) => run.indexOf(id)
    const setOf = (r: Ref): string[] => r.kind === 'node' ? (run.includes(r.id) ? [r.id] : [])
      : r.kind === 'phase' ? (() => { const mine = run.filter((x) => phaseOfNode(x)?.id === r.id); if (mine.length) return mine; const next = run.find((x) => phaseIndex(x) >= PHASES.findIndex((p) => p.id === r.id)); return next ? [next] : [] })()
      : r.kind === 'checks' ? run.filter((x) => CHECKS.includes(x)) : []
    const specific = refs.filter((r) => r.kind === 'node' || r.kind === 'phase')
    const groups = refs.filter((r) => r.kind === 'checks')
    let to: string | undefined, from: string | undefined, about = 'over the whole workflow'
    if (specific.length && groups.length) {
      // "between massing and the (relevant) checks": back to the start of the named part, from the last check after it.
      const start = specific.map(setOf).flat().sort((a, b) => rank(a) - rank(b))[0]
      const after = groups.map(setOf).flat().filter((x) => start && rank(x) > rank(start)).sort((a, b) => rank(b) - rank(a))[0]
      if (!start) return { kind: 'clarify', question: `Nothing from ${list(specific.map((r) => (r.kind === 'phase' ? PHASES.find((p) => p.id === r.id)!.name : nodeName(r.id))))} is on the workflow yet. Add it first?`, options: specific.filter((r) => r.kind === 'node').map((r) => ({ label: `Add ${nodeName((r as { id: string }).id)}`, text: `Add ${nodeName((r as { id: string }).id)}` })) }
      if (!after) return { kind: 'clarify', question: `No check comes after ${nodeName(start)} on the workflow. Which check should the loop come back from?`, options: CHECKS.filter((x) => !run.includes(x)).slice(0, 4).map((x) => ({ label: `Add ${nodeName(x)}`, text: `Add ${nodeName(x)}` })) }
      to = start; from = after; about = `between ${nodeName(start)} and the checks after it`
    } else if (specific.length >= 2) {
      const all = specific.map(setOf).flat().sort((a, b) => rank(a) - rank(b))
      to = all[0]; from = all[all.length - 1]; about = `between ${nodeName(to)} and ${nodeName(from)}`
    } else if (specific.length === 1 || groups.length === 1) {
      const all = setOf((specific[0] ?? groups[0])!).sort((a, b) => rank(a) - rank(b))
      if (all.length < 2) {
        const r = specific[0]
        return { kind: 'clarify', question: `A loop needs two nodes to run between; ${r && r.kind === 'phase' ? `the ${PHASES.find((p) => p.id === r.id)!.name} phase has ${all.length} on the workflow` : 'only one matches'}. Loop the whole workflow instead?`, options: [{ label: 'Loop the whole workflow', text: 'Add a loop over the whole workflow' }] }
      }
      to = all[0]; from = all[all.length - 1]; about = specific[0]?.kind === 'phase' ? `over the ${PHASES.find((p) => p.id === (specific[0] as { id: PhaseId }).id)!.name} phase` : 'over the checks'
    } else { to = run[0]; from = run[run.length - 1] }
    if (!to || !from || rank(from) < rank(to) || to === from) return { kind: 'clarify', question: 'Which part should the loop run over?', options: PHASES.filter((p) => run.some((x) => phaseOfNode(x)?.id === p.id)).map((p) => ({ label: p.name, text: `Loop the ${p.name} phase` })) }
    return proposal('modify', board, addLoop(board, from, to), `Adds a loop ${about}: after ${nodeName(from)} the workflow goes back to ${nodeName(to)} until you are happy with the result.`, via)
  }

  // Modify: remove
  if (REMOVE.test(low)) {
    const gone = named.filter((id) => board.nodes.includes(id))
    if (!gone.length) return { kind: 'clarify', question: named.length ? `${list(named.map(nodeName))} ${named.length === 1 ? 'is' : 'are'} not on the workflow. Which node should come off?` : 'Which node should come off the workflow?', options: run.slice(0, 6).map((x) => ({ label: nodeName(x), text: `Remove ${nodeName(x)}` })) }
    let to = board
    for (const id of gone) to = takeOff(to, id)
    return proposal('modify', board, to, `Takes ${list(gone.map(nodeName))} off the workflow; the nodes either side are joined.`, via)
  }

  // Modify: add
  if (ADD.test(low)) {
    const posM = POS.exec(low)
    const fresh = named.filter((id) => !board.nodes.includes(id))
    const topic = refs.find((r): r is Extract<Ref, { kind: 'topic' }> => r.kind === 'topic')
    if (!fresh.length) {
      if (topic) return { kind: 'clarify', question: `No node studies ${topic.topic.about} on its own. These built nodes touch it: which one?`, options: topic.topic.options.map((o) => ({ label: `${nodeName(o.id)}: ${o.why}`, text: `Add ${nodeName(o.id)}${posM ? ` ${posM[0]}` : ''}` })) }
      if (named.length) return { kind: 'clarify', question: `${list(named.map(nodeName))} ${named.length === 1 ? 'is' : 'are'} already on the workflow. Add something else?`, options: [] }
      const s = nodeScores(t, model), ranked = [...s.entries()].filter(([id, v]) => v > 0 && !board.nodes.includes(id)).sort((a, b) => b[1] - a[1]).slice(0, 3)
      return { kind: 'clarify', question: ranked.length ? 'I couldn’t match that to one built node. The closest are:' : 'I couldn’t match that to a built node. Which one did you mean?', options: (ranked.length ? ranked.map(([id]) => id) : CHECKS.filter((x) => !board.nodes.includes(x)).slice(0, 4)).map((id) => ({ label: nodeName(id), text: `Add ${nodeName(id)}${posM ? ` ${posM[0]}` : ''}` })) }
    }
    // Where: after/before a named phase or node, else in phase order.
    let to = board, where = ''
    const anchorRefs = posM ? references(posM[2]) : []
    const anchor = anchorRefs[0]
    for (const id of fresh) {
      if (posM && anchor) {
        const r = walk(to.edges)
        const inPhase = (p: PhaseId) => r.filter((x) => phaseOfNode(x)?.id === p)
        let after: string | null = null
        if (anchor.kind === 'node' && r.includes(anchor.id)) after = posM[1] === 'after' ? anchor.id : r[r.indexOf(anchor.id) - 1] ?? 'start'
        else if (anchor.kind === 'phase') {
          const mine = inPhase(anchor.id), pi = PHASES.findIndex((p) => p.id === anchor.id)
          if (posM[1] === 'after') after = mine.length ? mine[mine.length - 1] : [...r].reverse().find((x) => phaseIndex(x) <= pi) ?? 'start'
          else after = mine.length ? (r[r.indexOf(mine[0]) - 1] ?? 'start') : [...r].reverse().find((x) => phaseIndex(x) < pi) ?? 'start'
        }
        if (after) {
          to = insertAfter(to, id, after)
          const anchorName = anchor.kind === 'phase' ? `the ${PHASES.find((p) => p.id === anchor.id)!.name} stage` : nodeName((anchor as { id: string }).id)
          const own = phaseName(id)
          where = ` ${posM[1]} ${anchorName}${own && anchor.kind === 'phase' && own !== PHASES.find((p) => p.id === anchor.id)!.name ? ` (it belongs to ${own}, placed where you asked)` : ''}`
          continue
        }
      }
      to = insertByPhase(to, id)
      where = where || ' in its phase’s place'
    }
    return proposal('modify', board, to, `Adds ${list(fresh.map(nodeName))}${where}.`, via)
  }

  // Suggest: a starting workflow from a description
  const scores = nodeScores(t, model)
  const best = Math.max(0, ...scores.values())
  // The model's closest nodes; without it, only nodes that share two or more words with the description.
  const nearest = [...scores.entries()].filter(([, v]) => (model ? v >= Math.max(0.25, best - 0.1) : v >= 2 && v >= best - 1)).sort((a, b) => b[1] - a[1]).slice(0, model ? 4 : 2).map(([id]) => id)
  const topicPicks = refs.filter((r): r is Extract<Ref, { kind: 'topic' }> => r.kind === 'topic').map((r) => r.topic.options[0].id)
  const picks = [...new Set([...named, ...topicPicks, ...nearest])]
  const preset = bestPreset(t, [...named, ...topicPicks], nearest, model)
  if (!picks.length && !preset) return { kind: 'clarify', question: 'What should the workflow look at first?', options: FOCUS.map((f) => ({ label: f.label, text: `${t.replace(/[.\s]+$/, '')}; ${f.add}` })) }
  const nodes = byPhase([...new Set([...(preset?.preset.nodes ?? []), ...picks])]).slice(0, 12)
  let to: Board = { nodes, edges: linear(nodes) }
  if (LOOP.test(low) && nodes.length > 1) to = addLoop(to, nodes[nodes.length - 1], nodes[0])
  const extra = picks.filter((id) => !(preset?.preset.nodes ?? []).includes(id))
  const summary = preset
    ? `Starts from the “${preset.preset.name}” workflow${extra.length ? ` and adds ${list(extra.map(nodeName))}` : ''}: ${nodes.length} nodes from ${phaseName(nodes[0])} to ${phaseName(nodes[nodes.length - 1])}.`
    : `A workflow of ${nodes.length} nodes from what you described: ${list(nodes.map(nodeName))}.`
  return proposal('suggest', board, to, summary, via, preset?.preset ?? null)
}
