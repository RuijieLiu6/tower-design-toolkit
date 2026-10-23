// Sources & assumptions hub (research P16-M01 citations): every source the built nodes cite, with research metadata
// where the packets have it, every result by evidence flag, and every false assumption with its correction. Built from
// the live results by a generic walker (anything that carries a flag and a source), so nodes added later show up too.
import { ALL_NODES, BUILT_NODES } from '../../data/registry'
import index from '../../data/evidence_index.json'
import { RULE_CARDS } from '../../data/ruleCards'
import { ENERGY_FALSE_ASSUMPTIONS, SOURCES as ENERGY_SOURCES } from '../../engine/energyCarbon'
import { LIFE_SAFETY_FALSE_ASSUMPTIONS } from '../../engine/lifeSafety'
import { SEISMIC_FALSE_ASSUMPTIONS } from '../../engine/structure'
import type { Flag, RuleState, Source } from '../../engine/types'
import { SRC as WIND_SCREEN_SOURCES } from '../../engine/windScreen'
import { SRC as TRIP_SOURCES } from '../../engine/trips'
import { WIND_FALSE_ASSUMPTIONS } from '../../engine/windStructure'
import { RELAX_AVIATION_FALSE_ASSUMPTIONS } from '../../engine/relaxAviation'
import { VISTA_FALSE_ASSUMPTIONS } from '../../engine/vista'
import { cardsForResult } from '../trace/sources'

export const FLAGS: Flag[] = ['false_assumption', 'unresolved', 'unverified', 'team_assumption', 'verified']
export const FLAG_LABEL: Record<Flag, string> = { verified: 'Verified', team_assumption: 'Team assumption', unverified: 'Unverified', unresolved: 'Unresolved', false_assumption: 'False assumption' }
const RANK: Record<Flag, number> = { false_assumption: 0, unresolved: 1, unverified: 2, team_assumption: 3, verified: 4 }

export interface SourceMeta { title: string; publisher: string; year: string; type: string; opened: boolean; ids: string[] }
const META = (index as unknown as { sources: Record<string, SourceMeta> }).sources
export const RESEARCH_FALSE = (index as unknown as { falseAssumptions: { packet: string; claim: string; correction: string; round: string; stage: string }[] }).falseAssumptions

export interface EvidenceItem {
  node: string
  label: string
  flag: Flag
  source: Source
  value?: string
  note?: string
  state?: RuleState
  /** Rule id inside the node's results, for its rule card. */
  resultId?: string
  origin: 'result' | 'card' | 'declared'
}
export interface SourceEntry {
  key: string
  label: string
  url?: string
  pages: string[]
  nodes: string[]
  items: EvidenceItem[]
  weakest: Flag
  counts: Partial<Record<Flag, number>>
  meta?: SourceMeta
  cards: string[]
}
export interface FalseItem { id: string; claim: string; correction: string; source?: Source; node?: string; origin: 'node' | 'result' | 'research'; packet?: string; round?: string }
export interface Hub {
  items: EvidenceItem[]
  sources: SourceEntry[]
  falseAssumptions: FalseItem[]
  counts: Record<Flag, number>
}

export const normUrl = (url: string) => {
  const u = url.trim().split('#')[0].replace(/\/+$/, '')
  const m = u.match(/^(https?):\/\/([^/]+)(.*)$/i)
  return m ? `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3]}` : u
}
export const metaFor = (url?: string): SourceMeta | undefined => (url ? META[normUrl(url)] : undefined)
const BY_ID = (index as unknown as { byId?: Record<string, SourceMeta & { url: string }> }).byId ?? {}
/** Research metadata for a source: by its web address, else by a research id named in its label ("research P08-S57"). */
export function metaForSource(s: Source): SourceMeta | undefined {
  const byUrl = metaFor(s.url)
  if (byUrl) return byUrl
  const id = s.label.match(/[PC][0-9]{2}-S[0-9]+/)?.[0]
  return id ? BY_ID[id] : undefined
}

/** Sources of nodes whose results carry none (or only after a run), declared once here. */
export const DECLARED: Record<string, Source[]> = {
  'built.fsr': [{ label: 'Vancouver Tall Challenge brief (Buildner 2026)', page: 'p.16 and p.19 (9.0 non-residential FSR)' }],
  'built.sun': [{ label: 'NOAA GML solar calculator equations (Meeus)', url: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html' }],
  'built.viewcones': [
    { label: 'City of Vancouver, Public Views Guidelines (Feb 2026)', page: 'cl. 3.1.1; relaxations 3.1.2–3.1.5 and 3.4', url: 'https://guidelines.vancouver.ca/guidelines-public-views.pdf' },
    { label: 'City of Vancouver ViewCone layer (OGL-Vancouver, retrieved 2026-10-21), plan polygons' },
  ],
  'built.view-from': [
    { label: 'City of Vancouver ViewCone layer (OGL-Vancouver, retrieved 2026-10-21), plan polygons' },
    { label: 'Ray cast over LiDAR 2022 roofs (P90), the design towers and MRDEM-30 terrain (CGVD28), research C02' },
  ],
  'built.vista': [
    { label: 'City of Vancouver ViewCone layer (OGL-Vancouver, retrieved 2026-10-21): plan polygons, origins and viewpoint elevations (Lv)' },
    { label: 'City of Vancouver, Public Views Guidelines (Feb 2026; team copy SHA-256 597f0da2…b0ca)', url: 'https://guidelines.vancouver.ca/guidelines-public-views.pdf' },
    { label: 'Vista v10.1 (Ruijie Liu, ARCH 540, handoff 2026-10-22): exact cone clip, study planes, cone-fit camera, report; research C04 (Vista audit, frame rule)' },
    { label: 'NRCan MRDEM-30 terrain (CGVD28 after conversion) and City LiDAR 2022 roofs, as in the Real Vancouver context layers' },
  ],
  'built.solar-access': [
    { label: 'City of Vancouver, Solar Access Guidelines for the Downtown Peninsula (approved 17 Sep 2025, amended 29 Jul 2026)', url: 'https://guidelines.vancouver.ca/guidelines-solar-access-downtown.pdf' },
    { label: 'NOAA GML solar calculator equations (Meeus)', url: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html' },
  ],
  'built.culture-claims': [{ label: 'Research P07-M01 (round 4): engagement ledger and claims guard, team rules awaiting paid Indigenous review' }],
  'built.provenance': [{ label: 'IPTC NewsCodes, digital source type (research P07-M07, P07-S38)', url: 'http://cv.iptc.org/newscodes/digitalsourcetype/' }],
  // The energy screen runs hourly PV only when switched on; its sources are listed either way.
  'built.energy-carbon': Object.values(ENERGY_SOURCES) as Source[],
  'built.wind-screen': Object.values(WIND_SCREEN_SOURCES) as Source[],
  'built.trips': Object.values(TRIP_SOURCES) as Source[],
}

/** False assumptions each node keeps visible (engine lists; the nature ledger's come with its results). */
export const NODE_FALSE: { node: string; items: { claim: string; correction: string; source?: Source }[] }[] = [
  { node: 'built.wind-procedure', items: WIND_FALSE_ASSUMPTIONS },
  { node: 'built.structure', items: SEISMIC_FALSE_ASSUMPTIONS },
  { node: 'built.life-safety', items: LIFE_SAFETY_FALSE_ASSUMPTIONS },
  { node: 'built.energy-carbon', items: ENERGY_FALSE_ASSUMPTIONS },
  { node: 'built.relax-aviation', items: RELAX_AVIATION_FALSE_ASSUMPTIONS },
  { node: 'built.vista', items: VISTA_FALSE_ASSUMPTIONS },
]

const SKIP = new Set(['tower', 'floors', 'storeys', 'faces', 'map', 'grid', 'positions', 'indices', 'profile', 'hull', 'loops', 'cone', 'surfaces', 'samples', 'hours', 'obstacles', 'spots', 'rects'])
const isFlag = (f: unknown): f is Flag => typeof f === 'string' && (FLAGS as string[]).includes(f)

function asSource(s: unknown): Source | null {
  if (typeof s === 'string') return s.trim() ? { label: s.trim() } : null
  if (s && typeof s === 'object' && typeof (s as Source).label === 'string' && (s as Source).label.trim()) {
    const x = s as Source
    return { label: x.label.trim(), ...(x.page ? { page: String(x.page) } : {}), ...(x.url ? { url: x.url } : {}) }
  }
  return null
}

/** Walk one node's results for anything with a flag and a source, and for kept false assumptions (claim + correction). */
export function walkEvidence(node: string, value: unknown, items: EvidenceItem[], falses: FalseItem[], depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 6) return
  if (Array.isArray(value)) {
    if (value.length > 400 || (value.length && typeof value[0] !== 'object')) return
    for (const v of value) walkEvidence(node, v, items, falses, depth + 1)
    return
  }
  const o = value as Record<string, unknown>
  if (typeof o.claim === 'string' && typeof o.correction === 'string') {
    falses.push({ id: `${node}:${o.claim}`, claim: o.claim, correction: o.correction, source: asSource(o.source) ?? undefined, node, origin: 'node' })
    return
  }
  const src = asSource(o.source)
  if (isFlag(o.flag) && src) {
    // Ledger rows name themselves in different ways: label, name, title, item (charge schedules) or id.
    const label = String(o.label ?? o.name ?? o.title ?? o.item ?? o.id ?? 'Unnamed item')
    const value = typeof o.value === 'string' || typeof o.value === 'number' ? String(o.value) : typeof o.rate === 'string' ? o.rate : undefined
    const note = typeof o.note === 'string' && o.note ? o.note : typeof o.basis === 'string' && o.basis ? o.basis : undefined
    items.push({
      node, label, flag: o.flag, source: src, origin: 'result',
      ...(value !== undefined ? { value } : {}),
      ...(note ? { note } : {}),
      ...(typeof o.state === 'string' ? { state: o.state as RuleState } : {}),
      ...(typeof o.id === 'string' ? { resultId: o.id } : {}),
    })
    return
  }
  for (const [k, v] of Object.entries(o)) if (!SKIP.has(k) && v && typeof v === 'object') walkEvidence(node, v, items, falses, depth + 1)
}

const keyOf = (s: Source) => (s.url ? normUrl(s.url) : s.label.toLowerCase().replace(/\s+/g, ' ').trim())

/** Build the hub from each built node's live results ({ nodeId: results }). */
export function buildHub(groups: Record<string, unknown>): Hub {
  const raw: EvidenceItem[] = []
  const falses: FalseItem[] = []
  for (const [node, value] of Object.entries(groups)) walkEvidence(node, value, raw, falses)
  for (const c of RULE_CARDS) for (const node of c.usedBy) raw.push({ node, label: `Rule card: ${c.title}`, flag: c.flag, source: c.source, origin: 'card', note: c.summary })
  for (const [node, list] of Object.entries(DECLARED)) for (const s of list) raw.push({ node, label: 'Declared source of the node', flag: 'verified', source: s, origin: 'declared' })

  // One item per node, label and clause (towers repeat the same rule).
  const seen = new Set<string>()
  const items = raw.filter((i) => { const k = `${i.node}|${i.label}|${keyOf(i.source)}|${i.source.page ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true })

  const byKey = new Map<string, SourceEntry>()
  for (const i of items) {
    const key = keyOf(i.source)
    const e = byKey.get(key) ?? { key, label: i.source.label, url: i.source.url, pages: [], nodes: [], items: [], weakest: 'verified' as Flag, counts: {}, meta: metaForSource(i.source), cards: [] }
    if (!e.meta) e.meta = metaForSource(i.source)
    if (i.source.label.length > e.label.length && !i.source.url) e.label = i.source.label
    if (i.source.page && !e.pages.includes(i.source.page)) e.pages.push(i.source.page)
    if (!e.nodes.includes(i.node)) e.nodes.push(i.node)
    e.items.push(i)
    if (i.origin !== 'declared') {
      e.counts[i.flag] = (e.counts[i.flag] ?? 0) + 1
      if (RANK[i.flag] < RANK[e.weakest]) e.weakest = i.flag
    }
    if (i.resultId) for (const c of cardsForResult(i.node, i.resultId)) if (!e.cards.includes(c.id)) e.cards.push(c.id)
    if (i.origin === 'card') { const card = RULE_CARDS.find((c) => `Rule card: ${c.title}` === i.label); if (card && !e.cards.includes(card.id)) e.cards.push(card.id) }
    byKey.set(key, e)
  }
  // Most-used first (the by-law sections many checks rest on), then by title.
  const used = (e: SourceEntry) => e.items.filter((i) => i.origin !== 'declared').length + e.nodes.length
  const sources = [...byKey.values()].sort((a, b) => used(b) - used(a) || (a.meta?.title ?? a.label).localeCompare(b.meta?.title ?? b.label))

  // False assumptions: the nodes' kept lists, results flagged false (their value and note are the correction), research.
  for (const { node, items: list } of NODE_FALSE) for (const f of list) falses.push({ id: `${node}:${f.claim}`, claim: f.claim, correction: f.correction, source: f.source, node, origin: 'node' })
  for (const i of items) if (i.flag === 'false_assumption' && i.origin === 'result') falses.push({ id: `${i.node}:${i.label}`, claim: i.label, correction: [i.value, i.note].filter(Boolean).join('. '), source: i.source, node: i.node, origin: 'result' })
  for (const r of RESEARCH_FALSE) falses.push({ id: `research:${r.packet}:${r.claim}`, claim: r.claim, correction: r.correction, packet: r.packet, round: r.round, node: nodeForPacket(r.packet), origin: 'research' })
  const fseen = new Set<string>()
  const falseAssumptions = falses.filter((f) => (fseen.has(f.id) ? false : (fseen.add(f.id), true)))

  const counts = Object.fromEntries(FLAGS.map((f) => [f, items.filter((i) => i.origin === 'result' && i.flag === f).length])) as Record<Flag, number>
  return { items, sources, falseAssumptions, counts }
}

/** The built node that uses a research packet, else the first researched module of it. */
export function nodeForPacket(packet: string): string | undefined {
  return BUILT_NODES.find((n) => n.packet === packet)?.id ?? ALL_NODES.find((n) => n.packet === packet)?.id
}

const nodeName = (id: string) => ALL_NODES.find((n) => n.id === id)?.name ?? id
const citation = (s: SourceEntry) => {
  const m = s.meta
  const title = m?.title || s.label
  const pub = m && m.publisher && !title.includes(m.publisher) ? `${m.publisher}` : ''
  const year = m?.year && !title.includes(m.year) ? m.year : ''
  return [title, [pub, year].filter(Boolean).join(', ')].filter(Boolean).join('. ')
}

/** Bibliography for the boards: Markdown with the evidence status, or a short numbered text block. No people are named. */
export function bibliography(hub: Hub, format: 'markdown' | 'board', only?: (s: SourceEntry) => boolean): string {
  const list = hub.sources.filter((s) => !only || only(s))
  if (format === 'board') {
    const lines = list.map((s, i) => `${i + 1}. ${citation(s)}${s.pages.length ? `, ${s.pages.slice(0, 4).join('; ')}` : ''}.${s.url ? ` ${s.url}` : ''}`)
    return `Sources\n${lines.join('\n')}\n\nEvidence flags shown on every result: verified, team assumption, unverified, unresolved; false assumptions are kept visible with their corrections.`
  }
  const md = list.map((s) => {
    const flags = FLAGS.filter((f) => s.counts[f]).map((f) => `${FLAG_LABEL[f]} ${s.counts[f]}`).join(', ')
    return [
      `- **${citation(s)}**${s.url ? ` <${s.url}>` : ''}`,
      s.pages.length ? `  - Clauses and pages used: ${s.pages.join('; ')}` : '',
      `  - Used by: ${s.nodes.map(nodeName).join(', ')}`,
      flags ? `  - Results: ${flags}` : '',
      s.meta ? `  - Research: ${s.meta.opened ? 'opened' : 'not opened'} (${s.meta.ids.join(', ')})` : '  - Research: not in the research source lists',
    ].filter(Boolean).join('\n')
  })
  const falses = hub.falseAssumptions.filter((f) => f.origin !== 'research')
  return [
    '# Sources and assumptions (Tower Design Toolkit)', '',
    `${list.length} sources. Results by flag: ${FLAGS.map((f) => `${FLAG_LABEL[f]} ${hub.counts[f]}`).join(', ')}.`, '',
    '## Sources', '', ...md, '',
    '## False assumptions kept visible, with corrections', '',
    ...falses.map((f) => `- ~~${f.claim}~~ ${f.correction}${f.node ? ` (${nodeName(f.node)})` : ''}`), '',
  ].join('\n')
}
