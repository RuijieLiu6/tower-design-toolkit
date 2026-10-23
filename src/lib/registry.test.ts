import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validatePackageText } from './nodeValidate'
import {
  canonical, checkDownload, flagCovers, flagShownStatus, giscusConfig, installability, latestVersion, makeSubmission, parseFlags, parseRatings, parseRegistry,
  ratingSummary, sha256Hex, wilsonLower, type FlagRecord,
} from './registry'

const root = new URL('../../public/registry/', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')
const sample = parseRegistry(read('index.json'))

const mod = (over: Record<string, unknown> = {}, version: Record<string, unknown> = {}) => ({
  id: 'community.test.node', name: 'Test', kind: 'declarative', category: 'SITE', stage: 'massing', licence: 'MIT', review: 'unreviewed', author: { name: 'A' },
  versions: [{ version: '1.0.0', file: 'packages/community.test.node@1.0.0.json', sha256: 'a'.repeat(64), tier: 'declarative', evidence: { verified: 1 }, yanked: false, ...version }],
  ...over,
})
const index = (modules: unknown[]) => JSON.stringify({ format: 'tower-studio-registry@1', name: 'T', modules })

describe('registry index', () => {
  it('reads the sample registry shipped with the app, with no problems', () => {
    expect(sample.ok).toBe(true)
    if (!sample.ok) return
    expect(sample.problems).toEqual([])
    expect(sample.index.sample).toBe(true)
    expect(sample.index.modules.map((m) => m.id)).toEqual(['community.example.tower-width', 'community.sample.plate-efficiency', 'community.sample.lease-depth', 'community.sample.wind-surrogate'])
    const plate = sample.index.modules[1]
    expect(plate.versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.0']) // newest first
    expect(latestVersion(plate)?.version).toBe('0.2.0') // 0.1.0 is yanked
    expect(installability(plate, plate.versions[1])).toEqual({ ok: false, reason: expect.stringMatching(/^Yanked: Threshold direction reversed/) })
    const code = sample.index.modules[3]
    expect(installability(code, latestVersion(code)).ok).toBe(false)
    expect(installability(code, latestVersion(code)).reason).toMatch(/sandbox/)
  })

  it('ships packages that hash to their index entries and pass the node builder\'s own import check', async () => {
    if (!sample.ok) throw new Error('sample index')
    for (const m of sample.index.modules.filter((x) => x.kind === 'declarative')) {
      for (const v of m.versions) {
        const text = read(v.file!)
        expect(await checkDownload(m, v, text), `${m.id}@${v.version}`).toEqual({ ok: true })
        const report = validatePackageText(text)
        expect(report.problems.filter((p) => p.level === 'error'), `${m.id}@${v.version}`).toEqual([])
      }
    }
  })

  it('refuses a tampered or mislabelled download', async () => {
    if (!sample.ok) throw new Error('sample index')
    const m = sample.index.modules[2], v = m.versions[0]
    const text = read(v.file!)
    expect((await checkDownload(m, v, text.replace('"good": 12', '"good": 20'))).problem).toMatch(/SHA-256/)
    const other = { ...v, sha256: await sha256Hex(text.replace('0.1.0', '9.9.9')) }
    expect((await checkDownload(m, other, text.replace('0.1.0', '9.9.9'))).problem).toMatch(/registry lists/)
  })

  it('drops a broken module with a reason and keeps the others', () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, RegExp][] = [
      [{ id: 'my-node' }, {}, /id must look like/],
      [{ licence: 'GPL-3.0' }, {}, /licence "GPL-3.0"/],
      [{ category: 'WIND' }, {}, /13 categories/],
      [{}, { version: '1.0' }, /not semantic/],
      [{}, { file: '../secrets.json' }, /file must be/],
      [{}, { sha256: 'xyz' }, /sha256/],
      [{}, { yanked: true }, /yanked without a reason/],
      [{ kind: 'code' }, { tier: 'declarative' }, /sandbox tier/],
      [{ kind: 'declarative' }, { tier: 'T1' }, /tier "declarative"/],
    ]
    for (const [m, v, re] of cases) {
      const r = parseRegistry(index([mod(m, v), mod({ id: 'community.test.other' })]))
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.index.modules.map((x) => x.id)).toEqual(['community.test.other'])
      expect(r.problems.join(' ')).toMatch(re)
    }
    const dup = parseRegistry(index([mod(), mod()]))
    expect(dup.ok && dup.problems[0]).toMatch(/listed twice/)
    const twice = parseRegistry(index([mod({ versions: [mod().versions[0], mod().versions[0]] })]))
    expect(twice.ok && twice.problems[0]).toMatch(/version 1.0.0 is listed twice/)
  })

  it('refuses a file that is not a registry', () => {
    expect(parseRegistry('{').ok).toBe(false)
    expect(parseRegistry(JSON.stringify({ format: 'tower-studio-node@1', modules: [] })).ok).toBe(false)
    expect(parseRegistry(JSON.stringify({ format: 'tower-studio-registry@1' })).ok).toBe(false)
  })
})

describe('flags and ratings', () => {
  const flags = parseFlags(read('flags.json'))

  it('reads flag records and keeps a false assumption with its evidence', () => {
    expect(flags).toHaveLength(2)
    const fa = flags.find((f) => f.currentStatus === 'false_assumption')!
    expect(flagShownStatus(fa)).toBe('false_assumption')
    expect(fa.history.map((h) => h.status)).toEqual(['unverified', 'false_assumption'])
    expect(flagShownStatus({ ...fa, evidenceUrl: null })).toBe('disputed') // no evidence: not shown as fact
  })

  it('matches flags to versions and ranges', () => {
    const f = (versions: string) => ({ versions } as FlagRecord)
    expect(flagCovers(f('*'), '2.0.0')).toBe(true)
    expect(flagCovers(f('0.1.0'), '0.1.0')).toBe(true)
    expect(flagCovers(f('0.1.0'), '0.2.0')).toBe(false)
    expect(flagCovers(f('0.1.0 - 0.3.0'), '0.2.5')).toBe(true)
    expect(flagCovers(f('0.1.0 - 0.3.0'), '1.0.0')).toBe(false)
  })

  it('shows a rating only from five votes, as the Wilson lower bound', () => {
    expect(wilsonLower(6, 7)).toBeCloseTo(0.4869, 3)
    expect(wilsonLower(0, 0)).toBe(0)
    expect(wilsonLower(100, 100)).toBeGreaterThan(0.96)
    const ratings = parseRatings(read('ratings.json'))
    expect(ratingSummary(ratings['community.example.tower-width'])).toMatchObject({ n: 7, shown: true })
    expect(ratingSummary(ratings['community.sample.plate-efficiency']).shown).toBe(false) // n = 3
    expect(ratingSummary(undefined)).toMatchObject({ n: 0, shown: false })
    expect(parseRatings('nope')).toEqual({})
  })
})

describe('submission helper', () => {
  const pkg = JSON.parse(read('packages/community.sample.lease-depth@0.1.0.json'))

  it('prepares the package and index line for a pull request, reproducibly', async () => {
    const a = await makeSubmission(pkg, { today: '2026-10-22' })
    const b = await makeSubmission(pkg, { today: '2026-10-22' })
    expect(a).toEqual(b)
    expect(Object.keys(a.files)).toEqual(['packages/community.sample.lease-depth@0.1.0.json', 'index/community.sample.lease-depth.jsonl'])
    const line = JSON.parse(a.indexLine)
    expect(line.sha256).toBe(await sha256Hex(canonical(pkg)))
    expect(line).toMatchObject({ version: '0.1.0', tier: 'declarative', evidence: { team_assumption: 1 }, yanked: false })
    // The submitted entry is itself a valid registry entry.
    const r = parseRegistry(index([{ ...mod({ id: pkg.id, licence: pkg.licence, category: pkg.category, stage: pkg.stage }), versions: [line] }]))
    expect(r.ok && r.problems).toEqual([])
    expect(a.prBody).toMatch(/do not discuss your own competition scheme/)
  })

  it('keeps comments a stub with no repository yet', () => {
    const g = giscusConfig('community.x.y', null)
    expect(g.term).toBe('community.x.y')
    expect(g.repo).toMatch(/unresolved/)
  })
})
