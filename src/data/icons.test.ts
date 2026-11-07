import { describe, expect, it } from 'vitest'
import { COMMUNITY_ICON_POOL, NODE_ICONS, communityIcons } from './icons'
import { BUILT_NODES } from './registry'

// The node bar shows icons only (names on hover), so no two nodes may share an icon.
describe('node icons', () => {
  it('gives every built node its own icon', () => {
    const missing = BUILT_NODES.filter((n) => !NODE_ICONS[n.id]).map((n) => n.id)
    expect(missing, 'add an entry to NODE_ICONS in data/icons.ts').toEqual([])
    const byIcon = new Map<unknown, string[]>()
    for (const n of BUILT_NODES) byIcon.set(NODE_ICONS[n.id], [...(byIcon.get(NODE_ICONS[n.id]) ?? []), n.id])
    expect([...byIcon.values()].filter((ids) => ids.length > 1), 'built nodes sharing an icon').toEqual([])
  })

  it('has no icon entries for nodes that are not built', () => {
    const built = new Set(BUILT_NODES.map((n) => n.id))
    expect(Object.keys(NODE_ICONS).filter((id) => !built.has(id))).toEqual([])
  })

  it('keeps the community pool unique and apart from the built icons', () => {
    expect(new Set(COMMUNITY_ICON_POOL).size).toBe(COMMUNITY_ICON_POOL.length)
    const builtIcons = new Set(Object.values(NODE_ICONS))
    expect(COMMUNITY_ICON_POOL.filter((i) => builtIcons.has(i))).toEqual([])
  })

  it('gives every community node a different icon, independent of list order', () => {
    const ids = COMMUNITY_ICON_POOL.map((_, i) => `community.test-node-${i}`)
    const a = communityIcons(ids)
    const b = communityIcons([...ids].reverse())
    const icons = ids.map((id) => a.get(id))
    expect(icons.every(Boolean)).toBe(true)
    expect(new Set(icons).size).toBe(ids.length)
    expect(ids.every((id) => a.get(id) === b.get(id))).toBe(true)
    const builtIcons = new Set(Object.values(NODE_ICONS))
    expect(icons.filter((i) => builtIcons.has(i!))).toEqual([])
  })

  it('falls back to initials (null) once the pool is used up', () => {
    const ids = [...COMMUNITY_ICON_POOL.map((_, i) => `community.n${i}`), 'community.one-more']
    expect([...communityIcons(ids).values()].filter((v) => v === null)).toHaveLength(1)
  })
})

// The icon book (Ruijie, 7 Nov: "no repetitive icons"): across every meaning shown as an icon, one drawing per meaning.
import { CATEGORY_ICONS, FLAG_ICONS, LIBRARY_TAB_ICONS, LOGIC_ICONS, PRESET_ICONS, PROGRAM_ICONS, SOURCE_ICONS, STEP_ICONS, TOOL_ICONS, TYPE_ICONS, WAY_ICONS } from './icons'
import { STAGES } from './stages'
import { USER_TYPES } from '../lib/userTypes'

describe('the icon book', () => {
  const book: [string, Record<string, unknown>][] = [
    ['category', CATEGORY_ICONS], ['node', NODE_ICONS], ['tool', TOOL_ICONS], ['step', STEP_ICONS], ['stage', Object.fromEntries(STAGES.map((s) => [s.id, s.icon]))],
    ['type', TYPE_ICONS], ['way', WAY_ICONS], ['preset', PRESET_ICONS], ['use', PROGRAM_ICONS], ['flag', FLAG_ICONS],
    ['source', SOURCE_ICONS], ['logic', LOGIC_ICONS], ['library tab', LIBRARY_TAB_ICONS],
  ]
  it('never gives one drawing two meanings', () => {
    const seen = new Map<unknown, string[]>()
    for (const [kind, map] of book) for (const [id, icon] of Object.entries(map)) seen.set(icon, [...(seen.get(icon) ?? []), `${kind}:${id}`])
    for (const icon of COMMUNITY_ICON_POOL) seen.set(icon, [...(seen.get(icon) ?? []), 'community pool'])
    expect([...seen.values()].filter((m) => m.length > 1)).toEqual([])
  })
  it('has a picture for every preset workflow', () => {
    expect(USER_TYPES.flatMap((t) => t.presets).filter((p) => !PRESET_ICONS[p.id]).map((p) => p.id)).toEqual([])
  })
})

// The filled icons (Ruijie, 7 Nov: "redesign all the icons refer to the design of Gmail or Google Icons make them actual
// patterns instead of vector lineworks"): every meaning in the book has a filled drawing of its own.
import { FILLED_BODIES, filledIcon } from '../components/icons/filled'

describe('the filled icons', () => {
  const book: Record<string, unknown>[] = [CATEGORY_ICONS, NODE_ICONS, TOOL_ICONS, STEP_ICONS, Object.fromEntries(STAGES.map((s) => [s.id, s.icon])),
    TYPE_ICONS, WAY_ICONS, PRESET_ICONS, PROGRAM_ICONS, FLAG_ICONS, SOURCE_ICONS, LOGIC_ICONS, LIBRARY_TAB_ICONS]
  const names = [...new Set([...book.flatMap((m) => Object.values(m)), ...COMMUNITY_ICON_POOL].map((i) => (i as { displayName?: string }).displayName))]
  it('draws every icon in the book filled', () => {
    expect(names.filter((n) => !filledIcon(n))).toEqual([])
  })
  it('never draws two icons the same', () => {
    const seen = new Map<string, string>()
    const twins = Object.entries(FILLED_BODIES).filter(([n, b]) => { const t = seen.get(b); seen.set(b, n); return !!t || !b })
    expect(twins.map(([n]) => n)).toEqual([])
  })
  it('keeps drawings filled: no thin lines (bands are 2 units or more)', () => {
    const thin = Object.entries(FILLED_BODIES).filter(([, b]) => [...b.matchAll(/stroke-width="([\d.]+)"/g)].some((m) => +m[1] < 2)).map(([n]) => n)
    expect(thin).toEqual([])
  })
})
