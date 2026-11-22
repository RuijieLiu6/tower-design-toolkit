import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_NODES } from '../data/registry'
import { DEFAULT_RECORD, lintClaims, NATIONS, type Nation, type NationRecord } from '../engine/culture'
import { USER_TYPES } from './userTypes'
import { isNationId, namespaceGuard, NATION_NAMESPACE } from './nationNamespace'
import { validatePackage } from './nodeValidate'
import { parseRegistry } from './registry'

// The reserved Nation-governed namespace (product #3): it exists, it is empty, and only a verified author can publish in it.
const sample = parseRegistry(readFileSync(new URL('../../public/registry/index.json', import.meta.url), 'utf8'))
const VERIFIED = { nation: 'A Nation', verifiedBy: 'Named person for that Nation', date: '2027-01-01' }
const mod = (id: string, author: Record<string, unknown> = { name: 'A' }, extra: Record<string, unknown> = {}) => ({
  id, name: 'Test', kind: 'declarative', category: 'CULT', stage: 'massing', licence: 'MIT', review: 'unreviewed', author,
  versions: [{ version: '1.0.0', file: `packages/${id}@1.0.0.json`, sha256: 'a'.repeat(64), tier: 'declarative', evidence: {}, yanked: false }], ...extra,
})
const index = (modules: unknown[]) => JSON.stringify({ format: 'tower-studio-registry@1', name: 'T', modules })

describe('the reserved nation.* namespace', () => {
  it('exists and holds no nodes: none in the namespace, the built registry, the sample registry or any preset', () => {
    expect(NATION_NAMESPACE.prefix).toBe('nation.')
    expect(NATION_NAMESPACE.nodes).toEqual([])
    expect(ALL_NODES.filter((n) => isNationId(n.id))).toEqual([])
    expect(sample.ok && sample.index.modules.filter((m) => isNationId(m.id))).toEqual([])
    expect(USER_TYPES.flatMap((t) => t.presets).filter((p) => isNationId(p.id) || p.nodes.some(isNationId))).toEqual([])
  })

  it('says plainly that no Nation has used it and that no engagement has happened, and passes the claims guard at N0', () => {
    expect(NATION_NAMESPACE.label).toMatch(/No Nation has used it/)
    expect(NATION_NAMESPACE.label).toMatch(/no engagement has happened/)
    const n0 = Object.fromEntries(NATIONS.map((n) => [n, { ...DEFAULT_RECORD }])) as Record<Nation, NationRecord>
    expect(lintClaims(NATION_NAMESPACE.label, n0).filter((f) => !f.pass)).toEqual([])
  })

  it('refuses an id under nation.* unless the author carries the verified-author field', () => {
    expect(namespaceGuard('nation.someone.node').ok).toBe(false)
    expect(namespaceGuard('nation.someone.node', { nationVerified: { nation: 'A Nation', verifiedBy: '', date: '2027-01-01' } }).ok).toBe(false)
    expect(namespaceGuard('nation.someone.node', { nationVerified: VERIFIED })).toEqual({ ok: true })
    expect(namespaceGuard('community.someone.node')).toEqual({ ok: true })
  })

  it('in the registry: drops an unverified nation.* module with the reason, lists a verified one, leaves a withheld one out quietly', () => {
    const r = parseRegistry(index([
      mod('nation.someone.node'),
      mod('nation.verified.node', { name: 'B', nationVerified: VERIFIED }),
      mod('nation.verified.kept', { name: 'C', nationVerified: VERIFIED }, { visibility: 'withheld' }),
      mod('community.test.other'),
    ]))
    if (!r.ok) throw new Error('index')
    expect(r.index.modules.map((m) => m.id)).toEqual(['nation.verified.node', 'community.test.other'])
    expect(r.index.modules[0].author.nationVerified).toEqual(VERIFIED)
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0]).toMatch(/nation\.someone\.node.*reserved for nodes published by authors verified by a Nation/)
  })

  it('in the node builder: a package id under nation.* is refused before anything else', () => {
    const report = validatePackage({ id: 'nation.someone.node', version: '0.1.0', name: 'X' })
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual([expect.objectContaining({ level: 'error', where: 'The id', message: expect.stringMatching(/reserved namespace/) })])
  })
})
