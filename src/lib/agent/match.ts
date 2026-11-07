// The landing page agent's reading of what a visitor types (lib/userTypes.ts holds the words it compares against). With
// the in-browser language model (./model2vec.ts): cosine similarity to each user type's own descriptions and to each
// starting workflow's. Before the model has loaded, or if it can't: plain keywords. Either way the agent says which it
// used, and the visitor can always pick another type or workflow by hand. Pure functions; the UI is in
// components/landing/Agent.tsx.
import { USER_TYPES, userType, type Preset, type UserTypeId } from '../userTypes'
import { BUILT_NODES } from '../../data/registry'
import type { Embedder } from './model2vec'

export interface TypeScore { type: UserTypeId; score: number }
export interface Reading {
  types: TypeScore[]
  /** Sure enough to go ahead, or ask between the top two. */
  confident: boolean
  via: 'model' | 'words'
}

// ---------- keywords (the fallback) ----------

const WORDS: Record<UserTypeId, string[]> = {
  designer: ['student', 'studio', 'competition', 'vtc', 'tall challenge', 'resident', 'citizen', 'neighbour', 'neighbor', 'neighbourhood', 'community', 'curious', 'beginner', 'workshop', 'co-design', 'codesign', 'learn', 'school', 'university', 'my street', 'not an architect', 'hobby', 'first time'],
  practitioner: ['architect', 'practice', 'firm', 'client', 'rezoning', 'feasibility', 'permit', 'design team', 'project architect', 'schematic', 'pro forma', 'developer', 'office'],
  planner: ['planner', 'planning', 'city of vancouver', 'reviewer', 'reviewing', 'review', 'policy', 'urban designer', 'guidelines', 'staff', 'municipal', 'council', 'application', 'applications'],
  engineer: ['engineer', 'engineering', 'structural', 'mechanical', 'consultant', 'sustainability', 'energy', 'carbon', 'elevator', 'lifts', 'vertical transportation', 'life safety', 'fire', 'wind', 'seismic', 'mep', 'envelope', 'facade'],
}

const has = (text: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text)

export function wordScores(text: string): TypeScore[] {
  return USER_TYPES.map((t) => ({ type: t.id, score: WORDS[t.id].filter((w) => has(text, w)).length }))
    .sort((a, b) => b.score - a.score)
}

// ---------- the language model ----------

export interface Index {
  types: { type: UserTypeId; vecs: Float32Array[] }[]
  presets: { preset: Preset; vecs: Float32Array[] }[]
  /** Each built analysis node by its name and the question it answers (for a design concept). */
  nodes: { id: string; vecs: Float32Array[] }[]
}

export function buildIndex(e: Embedder): Index {
  return {
    types: USER_TYPES.map((t) => ({ type: t.id, vecs: e.embed([`${t.name}: ${t.who}`, ...t.says]) })),
    presets: USER_TYPES.flatMap((t) => t.presets).map((p) => ({ preset: p, vecs: e.embed([p.name, p.goal, ...p.says]) })),
    nodes: BUILT_NODES.map((n) => ({ id: n.id, vecs: e.embed([n.name, n.question]) })),
  }
}

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
/** How close a text is to a set of examples: the mean of its two best matches (one lucky example is not enough). */
function closeness(v: Float32Array, vecs: Float32Array[]): number {
  const s = vecs.map((x) => dot(v, x)).sort((a, b) => b - a)
  return s.length > 1 ? (s[0] + s[1]) / 2 : s[0] ?? 0
}

/** Below this a reading is a guess; within MARGIN of the second type it is a tie (team calibration, 6 Nov). */
export const MIN_SCORE = 0.3
export const MARGIN = 0.04

export function readText(text: string, model?: { e: Embedder; index: Index } | null): Reading {
  if (model) {
    const v = model.e.embed([text])[0]
    const types = model.index.types.map((t) => ({ type: t.type, score: closeness(v, t.vecs) })).sort((a, b) => b.score - a.score)
    return { types, confident: types[0].score >= MIN_SCORE && types[0].score - types[1].score >= MARGIN, via: 'model' }
  }
  const types = wordScores(text)
  return { types, confident: types[0].score > 0 && types[0].score > types[1].score, via: 'words' }
}

/** The type's starting workflows, the closest to what was typed first (ties keep the curated order). */
export function rankPresets(text: string, type: UserTypeId, model?: { e: Embedder; index: Index } | null): Preset[] {
  const list = userType(type).presets
  if (!text.trim()) return list
  let score: (p: Preset) => number
  if (model) {
    const v = model.e.embed([text])[0]
    const by = new Map(model.index.presets.map((x) => [x.preset.id, closeness(v, x.vecs)]))
    score = (p) => by.get(p.id) ?? 0
  } else {
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
    score = (p) => { const hay = `${p.name} ${p.goal} ${p.says.join(' ')}`.toLowerCase(); return words.filter((w) => hay.includes(w)).length }
  }
  return list.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p)
}

// ---------- a design concept (Ruijie, 7 Nov: "more open ended questions like what is the concept of your design and
// provide suggested workflows") ----------

export interface Suggestion {
  /** Who the words sound like, when it is clear (only used to remember a role). */
  reading: Reading
  /** The preset workflows closest to the concept, from any user type, the closest first. */
  presets: Preset[]
  /** The analysis nodes closest to the concept: a workflow of its own. */
  nodes: string[]
}

const longWords = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)

/** The presets and nodes a concept reads closest to. Never invents a node: it only ranks the built ones. */
export function suggest(text: string, model?: { e: Embedder; index: Index } | null, take = { presets: 3, nodes: 5 }): Suggestion {
  const reading = readText(text, model)
  const all = USER_TYPES.flatMap((t) => t.presets)
  let preset: (p: Preset) => number, node: (id: string) => number
  if (model) {
    const v = model.e.embed([text])[0]
    const ps = new Map(model.index.presets.map((x) => [x.preset.id, closeness(v, x.vecs)]))
    const ns = new Map(model.index.nodes.map((x) => [x.id, closeness(v, x.vecs)]))
    preset = (p) => ps.get(p.id) ?? 0
    node = (id) => ns.get(id) ?? 0
  } else {
    const words = longWords(text)
    const hits = (hay: string) => words.filter((w) => hay.toLowerCase().includes(w)).length
    preset = (p) => hits(`${p.name} ${p.goal} ${p.says.join(' ')}`)
    node = (id) => { const n = BUILT_NODES.find((x) => x.id === id)!; return hits(`${n.name} ${n.question}`) }
  }
  const presets = all.map((p, i) => ({ p, i, s: preset(p) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, take.presets).map((x) => x.p)
  const nodes = BUILT_NODES.map((n, i) => ({ id: n.id, i, s: node(n.id) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, take.nodes).map((x) => x.id)
  return { reading, presets, nodes }
}
