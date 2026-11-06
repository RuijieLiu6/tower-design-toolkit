// Everything the workflow builder can place: Layer 0 sources, workflow logic, every registry node, and "My nodes".
import { Box, CircleCheck, CircleX, GitCompareArrows, Layers, MapPin, Package, Scale, Workflow, type LucideIcon } from '../icons'
import { CATEGORY_ICONS } from '../../data/icons'
import { ALL_NODES, CATEGORIES, type Category, type NodeDef, type Priority } from '../../data/registry'
import { LOGIC, SOURCES, type NodeKind } from '../../lib/workflowLogic'
import { iconFor } from './nodeIcons'

export type TabId = 'L0' | 'LOGIC' | Category | 'MINE'
export type EntryStatus = 'built' | 'preview' | 'researched' | 'community' | 'logic' | 'source'

export interface Entry {
  kind: NodeKind
  ref: string
  name: string
  tab: TabId
  status: EntryStatus
  icon: LucideIcon
  color: string
  blurb: string
  category?: Category
  priority?: Priority
  def?: NodeDef
}

export const L0_COLOR = '#1f2328'
export const LOGIC_COLOR = '#2a9d8f'
export const MINE_COLOR = '#7a4fb5'

const SOURCE_ICONS: Record<string, LucideIcon> = { 'src.site': MapPin, 'src.massing': Box, 'src.program': Layers }
const LOGIC_ICONS: Record<string, LucideIcon> = { 'logic.all-pass': CircleCheck, 'logic.any-fail': CircleX, 'logic.score': Scale, 'logic.compare': GitCompareArrows }

export const TABS: { id: TabId; label: string; short: string; icon: LucideIcon; color: string }[] = [
  { id: 'L0', label: 'Layer 0 sources', short: 'Layer 0', icon: Box, color: L0_COLOR },
  { id: 'LOGIC', label: 'Workflow logic', short: 'Logic', icon: Workflow, color: LOGIC_COLOR },
  ...(Object.keys(CATEGORIES) as Category[]).map((c) => ({ id: c, label: CATEGORIES[c].label, short: c, icon: CATEGORY_ICONS[c], color: CATEGORIES[c].color })),
  { id: 'MINE', label: 'My nodes (imported or built by you)', short: 'My nodes', icon: Package, color: MINE_COLOR },
]

export function defEntry(n: NodeDef, community = false): Entry {
  const status: EntryStatus = community || (n.status as string) === 'community' ? 'community' : n.status
  return {
    kind: 'eval', ref: n.id, name: n.name, tab: status === 'community' ? 'MINE' : n.category, status, category: n.category, priority: n.priority, def: n,
    icon: iconFor(n.name, n.category), color: CATEGORIES[n.category]?.color ?? MINE_COLOR, blurb: n.question,
  }
}

const STATIC: Entry[] = [
  ...SOURCES.map((s): Entry => ({ kind: 'source', ref: s.ref, name: s.name, tab: 'L0', status: 'source', icon: SOURCE_ICONS[s.ref], color: L0_COLOR, blurb: s.blurb })),
  ...LOGIC.map((l): Entry => ({ kind: 'logic', ref: l.ref, name: l.name, tab: 'LOGIC', status: 'logic', icon: LOGIC_ICONS[l.ref], color: LOGIC_COLOR, blurb: l.blurb })),
  ...ALL_NODES.map((n) => defEntry(n)),
]

/** The whole catalog, with any community nodes appended. */
export function catalog(community: NodeDef[] = []): Entry[] {
  return community.length ? [...STATIC, ...community.filter((c) => !STATIC.some((s) => s.ref === c.id)).map((c) => defEntry(c, true))] : STATIC
}

export function findEntry(ref: string, community: NodeDef[] = []): Entry | null {
  return catalog(community).find((e) => e.ref === ref) ?? null
}

export const isRunnable = (e: Entry | null) => !!e && (e.status === 'built' || e.status === 'preview' || e.status === 'community')

export const STATUS_LABEL: Record<EntryStatus, string> = {
  built: 'Built · runnable',
  preview: 'Built · preview',
  researched: 'Researched, not runnable',
  community: 'My node · community',
  logic: 'Workflow logic',
  source: 'Layer 0 source',
}

/** Search by name, id, question and category words. */
export function searchEntries(entries: Entry[], q: string, limit = 12): Entry[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return entries.filter((e) => e.status !== 'researched').slice(0, limit)
  const rank = (e: Entry) => {
    const name = e.name.toLowerCase()
    const hay = `${name} ${e.ref.toLowerCase()} ${e.blurb.toLowerCase()} ${e.category ? CATEGORIES[e.category].label.toLowerCase() : ''} ${e.tab.toLowerCase()}`
    if (!words.every((w) => hay.includes(w))) return -1
    let r = 0
    if (name.startsWith(words[0])) r += 4
    if (words.every((w) => name.includes(w))) r += 2
    if (e.status !== 'researched') r += 1
    return r
  }
  return entries.map((e) => [e, rank(e)] as const).filter(([, r]) => r >= 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([e]) => e)
}
