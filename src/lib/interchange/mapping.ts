// Role mapping: which Rhino layers (or object names, or user-string values) are tower, podium, program, core, site,
// context or ignored. Guesses come from names and user strings (team assumption, shown as such); the person confirms
// them in one screen, and the mapping is remembered per file in this browser.
import { USES, type UseId } from '../../engine/types'
import type { RawCurve, RawImport, RawObject } from '../import/types'
import { ROLES, type MapBy, type Mapping, type MappingRule, type Role } from './model'

export type Item = (RawObject & { curve?: false }) | (RawCurve & { curve: true })

/** Every object and curve of a file, in file order. */
export const itemsOf = (raw: RawImport): Item[] => [...raw.objects.map((o) => ({ ...o, curve: false as const })), ...(raw.curves ?? []).map((c) => ({ ...c, curve: true as const }))]

/** The row an item falls in under a mapping mode. */
export function rowKey(it: Pick<Item, 'layer' | 'name' | 'userStrings'>, by: MapBy, key: string): string {
  if (by === 'name') return it.name || '(no name)'
  if (by === 'userString') return it.userStrings?.[key] ?? '(no value)'
  return it.layer || '(no layer)'
}

export interface MappingRow {
  key: string
  objects: number
  curves: number
  closedCurves: number
  triangles: number
  color: string | null
  /** Majority `role` user string among the row's items, if any. */
  roleString: Role | null
  /** Majority `use` user string among the row's items, if any. */
  useString: UseId | null
}

/** One row per distinct key, in first-seen order. */
export function mappingRows(raw: RawImport, by: MapBy, key: string): MappingRow[] {
  const rows = new Map<string, MappingRow & { roles: Map<string, number>; uses: Map<string, number> }>()
  for (const it of itemsOf(raw)) {
    const k = rowKey(it, by, key)
    let r = rows.get(k)
    if (!r) { r = { key: k, objects: 0, curves: 0, closedCurves: 0, triangles: 0, color: it.layerColor ?? null, roleString: null, useString: null, roles: new Map(), uses: new Map() }; rows.set(k, r) }
    if (it.curve) { r.curves++; if (it.closed) r.closedCurves++ } else { r.objects++; r.triangles += it.mesh.indices.length / 3 }
    const role = it.userStrings?.role?.toLowerCase(), use = it.userStrings?.use?.toLowerCase()
    if (role) r.roles.set(role, (r.roles.get(role) ?? 0) + 1)
    if (use) r.uses.set(use, (r.uses.get(use) ?? 0) + 1)
  }
  return [...rows.values()].map(({ roles, uses, ...r }) => {
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const role = top(roles), use = top(uses)
    return { ...r, roleString: ROLES.some((x) => x.id === role) ? (role as Role) : null, useString: use && use in USES ? (use as UseId) : null }
  })
}

// Name patterns (team assumption, 3 Nov 2026): checked in this order, so "Tower core" is core and "Podium retail" podium.
const IGNORE = /annot|\bdim|dimension|\btext|label|\bgrid|camera|light|furniture|people|figure|\btrees?\b|vegetation|\bcars?\b|hatch|detail|make2d|clipping|setback|street|road|curb|kerb|centre ?line|center ?line|sidewalk|\bview|render/i
const CORE = /\bcore\b|\blifts?\b|elevator|stair/i
const PODIUM = /podium|plinth|\bbase\b/i
const SITE = /\bsite\b|boundary|property|parcel|\blot\b|lot ?line/i
const CONTEXT = /context|surround|existing|neighbo|adjacent|\bcity\b|urban|block model|massing model of/i
const MASSY = /tower|mass|volume|building|bldg|crown|envelope|proposal|design/i
const USE_WORDS: [RegExp, UseId][] = [
  [/office|workplace/i, 'office'], [/resid|apartment|condo|housing|\bhomes?\b|rental/i, 'residential'], [/hotel|hospitality|\bkeys?\b/i, 'hotel'],
  [/retail|commercial|shop|\bf ?& ?b\b|restaurant/i, 'retail'], [/civic|cultur|museum|gallery|library|community/i, 'civic'],
  [/amenity|public|sky ?room|observ|lobby/i, 'amenity'], [/mech|plant|services?\b|m&e|mep/i, 'mechanical'],
]
const PROGRAM = /program|programme|\buse\b|\buses\b|zone|function/i

export function guessUse(text: string): UseId | undefined {
  for (const [re, u] of USE_WORDS) if (re.test(text)) return u
  for (const [id, u] of Object.entries(USES)) if (text.toLowerCase().includes(u.label.toLowerCase())) return id as UseId
  return undefined
}

/** Best guess for one row. */
export function guessRule(row: MappingRow, onlyMeshRow: boolean): MappingRule {
  if (row.roleString) return { role: row.roleString, ...(row.useString ? { use: row.useString } : {}) }
  // OBJ group names come as slugs (Tower_A_Core): read underscores and dots as spaces.
  const k = row.key.replace(/[_.]+/g, ' ')
  const use = row.useString ?? guessUse(k)
  if (!row.objects) return { role: SITE.test(k) && row.closedCurves ? 'site' : 'ignore' }
  if (IGNORE.test(k)) return { role: 'ignore' }
  if (CORE.test(k)) return { role: 'core' }
  if (PODIUM.test(k)) return { role: 'podium', use: use ?? 'retail' }
  if (CONTEXT.test(k)) return { role: 'context' }
  if (SITE.test(k) && !MASSY.test(k)) return { role: 'site' }
  if (use && (PROGRAM.test(k) || !MASSY.test(k))) return { role: 'program', use }
  if (MASSY.test(k) || onlyMeshRow) return { role: 'tower' }
  // Unknown names with geometry (Default, Layer 01, …): treated as massing, like the import before (team assumption).
  return { role: 'tower' }
}

/** A full guessed mapping. Prefers user strings: with `role` user strings on most objects, rows are those values. */
export function autoMapping(raw: RawImport, by?: MapBy, key = 'role'): Mapping {
  const items = itemsOf(raw)
  const withRole = items.filter((it) => it.userStrings?.role).length
  const mode: MapBy = by ?? (items.length && withRole / items.length >= 0.8 ? 'userString' : 'layer')
  const rows = mappingRows(raw, mode, key)
  const meshRows = rows.filter((r) => r.objects > 0).length
  return { by: mode, key, rules: Object.fromEntries(rows.map((r) => [r.key, guessRule(r, meshRows === 1)])) }
}

export interface ItemRole { role: Role; use?: UseId; row: string }

/** Role of one item under a mapping. A program or podium item's own `use` user string beats the row's use. */
export function roleOf(it: Item, m: Mapping): ItemRole {
  const row = rowKey(it, m.by, m.key)
  const rule = m.rules[row] ?? { role: 'ignore' as Role }
  const own = it.userStrings?.use?.toLowerCase()
  const use = own && own in USES ? (own as UseId) : rule.use
  return { role: rule.role, ...(use && (rule.role === 'program' || rule.role === 'podium') ? { use } : {}), row }
}

// ---------- remembered per file (this browser only; try/catch, private mode simply forgets) ----------
const KEY = 'ts.rhinoMapping.v1'
const MAX = 30

/** Key of a file for the remembered mapping: its fingerprint when known, else its name. */
export const fileKey = (raw: Pick<RawImport, 'fileName' | 'fingerprint'>) => raw.fingerprint ?? `name:${raw.fileName}`

type Saved = Record<string, { mapping: Mapping; name: string; at: number }>
function readAll(): Saved {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Saved } catch { return {} }
}

export function rememberMapping(raw: Pick<RawImport, 'fileName' | 'fingerprint'>, mapping: Mapping, now = Date.now()) {
  try {
    const all = readAll()
    all[fileKey(raw)] = { mapping, name: raw.fileName, at: now }
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX)
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch { /* storage full or blocked: the mapping is simply guessed again next time */ }
}

/**
 * The mapping remembered for this file (same fingerprint, else the same file name), merged over a fresh guess so rows
 * that are new in this version of the file still get a role. Null when nothing is remembered.
 */
export function recallMapping(raw: RawImport): Mapping | null {
  const all = readAll()
  const hit = all[fileKey(raw)] ?? Object.values(all).filter((s) => s.name === raw.fileName).sort((a, b) => b.at - a.at)[0]
  if (!hit) return null
  const guess = autoMapping(raw, hit.mapping.by, hit.mapping.key)
  const known = Object.keys(guess.rules).filter((k) => hit.mapping.rules[k])
  if (!known.length) return null
  return { ...guess, rules: { ...guess.rules, ...Object.fromEntries(known.map((k) => [k, hit.mapping.rules[k]])) }, confirmed: known }
}
