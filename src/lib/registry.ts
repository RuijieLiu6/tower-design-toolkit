// Community registry client (research P15-M05, M06): read and validate a registry index, its flags and ratings,
// pick versions, check a package's SHA-256 before install, and prepare the files of a pull request. Nothing here
// talks to a server: the index is a local sample in public/registry/, and submissions are files the user downloads.
import { CATEGORIES, type Category } from '../data/registry'
import type { Flag } from '../engine/types'
import type { NodePackage } from './nodePackages'

export const REGISTRY_FORMAT = 'tower-studio-registry@1'
/** Licences a package may declare (same list as the node package schema). */
export const LICENCES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-4.0', 'CC0-1.0'] as const
export type Review = 'unreviewed' | 'community' | 'expert'
export type Kind = 'declarative' | 'code'
export type Tier = 'declarative' | 'T1' | 'T3'

export interface RegistryVersion {
  version: string
  /** Package path under the registry root; null for code modules (no installable bundle here). */
  file: string | null
  sha256: string | null
  published: string
  tier: Tier
  permissions: string[]
  /** Thresholds by the flag the author claims (community claims show as unverified until reviewed). */
  evidence: Partial<Record<Flag, number>>
  yanked: boolean
  reason?: string
}

export interface RegistryModule {
  id: string
  name: string
  kind: Kind
  category: Category
  stage: 'massing' | 'schematic' | 'present'
  author: { name: string; github?: string }
  licence: string
  summary: string
  review: Review
  tags: string[]
  forkedFrom?: string | null
  versions: RegistryVersion[]
}

export interface RegistryIndex { format: typeof REGISTRY_FORMAT; name: string; sample: boolean; note?: string; updated: string; repo: string | null; modules: RegistryModule[] }

export const REVIEW_LABEL: Record<Review, string> = {
  unreviewed: 'Unreviewed',
  community: 'Community-reviewed',
  expert: 'Expert-reviewed',
}

const ID = /^community\.[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SHA = /^[0-9a-f]{64}$/
const FLAGS: Flag[] = ['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption']

export const semverParts = (v: string) => v.split('.').map(Number) as [number, number, number]
export function compareSemver(a: string, b: string): number {
  const x = semverParts(a), y = semverParts(b)
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

export type ParsedIndex = { ok: true; index: RegistryIndex; problems: string[] } | { ok: false; problems: string[] }

/**
 * Validate a registry index. A broken module is dropped with a problem line (the rest still list); a broken file as a
 * whole (not JSON, wrong format) is refused.
 */
export function parseRegistry(text: string): ParsedIndex {
  let raw: any
  try { raw = JSON.parse(text) } catch (e) { return { ok: false, problems: [`The index is not valid JSON: ${(e as Error).message}`] } }
  if (!raw || typeof raw !== 'object' || raw.format !== REGISTRY_FORMAT) return { ok: false, problems: [`Expected format "${REGISTRY_FORMAT}".`] }
  if (!Array.isArray(raw.modules)) return { ok: false, problems: ['"modules" must be a list.'] }
  const problems: string[] = []
  const seen = new Set<string>()
  const modules: RegistryModule[] = []
  raw.modules.forEach((m: any, i: number) => {
    const where = `Module ${i + 1}${m?.id ? ` (${m.id})` : ''}`
    const bad = (msg: string) => { problems.push(`${where}: ${msg}`); return true }
    if (!m || typeof m !== 'object') { bad('is not an object'); return }
    if (typeof m.id !== 'string' || !ID.test(m.id)) { bad('id must look like community.<handle>.<node-name>'); return }
    if (seen.has(m.id)) { bad('id is listed twice'); return }
    if (typeof m.name !== 'string' || !m.name.trim()) { bad('needs a name'); return }
    if (!(m.category in CATEGORIES)) { bad(`category "${m.category}" is not one of the 13 categories`); return }
    if (!LICENCES.includes(m.licence)) { bad(`licence "${m.licence}" is not one of ${LICENCES.join(', ')}`); return }
    if (!['declarative', 'code'].includes(m.kind)) { bad('kind must be "declarative" or "code"'); return }
    if (!['unreviewed', 'community', 'expert'].includes(m.review)) { bad('review must be unreviewed, community or expert'); return }
    if (!['massing', 'schematic', 'present'].includes(m.stage)) { bad('stage must be massing, schematic or present'); return }
    if (!Array.isArray(m.versions) || !m.versions.length) { bad('needs at least one version'); return }
    const versions: RegistryVersion[] = []
    const vs = new Set<string>()
    for (const v of m.versions) {
      if (!v || typeof v.version !== 'string' || !SEMVER.test(v.version)) { bad(`version "${v?.version}" is not semantic (x.y.z)`); return }
      if (vs.has(v.version)) { bad(`version ${v.version} is listed twice`); return }
      vs.add(v.version)
      if (m.kind === 'declarative') {
        if (typeof v.file !== 'string' || !/^packages\/[A-Za-z0-9._@-]+\.json$/.test(v.file) || v.file.includes('..')) { bad(`version ${v.version}: file must be packages/<name>.json`); return }
        if (typeof v.sha256 !== 'string' || !SHA.test(v.sha256)) { bad(`version ${v.version}: sha256 must be 64 lowercase hex characters`); return }
        if (v.tier !== 'declarative') { bad(`version ${v.version}: a declarative module runs in tier "declarative"`); return }
      } else if (v.tier === 'declarative') { bad(`version ${v.version}: a code module needs a sandbox tier (T1 or T3)`); return }
      if (v.yanked && !(typeof v.reason === 'string' && v.reason.trim())) { bad(`version ${v.version} is yanked without a reason`); return }
      const evidence: Partial<Record<Flag, number>> = {}
      for (const [k, n] of Object.entries(v.evidence ?? {})) if (FLAGS.includes(k as Flag) && Number.isInteger(n) && (n as number) >= 0) evidence[k as Flag] = n as number
      versions.push({
        version: v.version, file: m.kind === 'declarative' ? v.file : null, sha256: m.kind === 'declarative' ? v.sha256 : null,
        published: typeof v.published === 'string' ? v.published : '', tier: v.tier, permissions: Array.isArray(v.permissions) ? v.permissions.filter((p: unknown) => typeof p === 'string') : [],
        evidence, yanked: !!v.yanked, ...(v.yanked ? { reason: v.reason } : {}),
      })
    }
    seen.add(m.id)
    modules.push({
      id: m.id, name: m.name, kind: m.kind, category: m.category, stage: m.stage, licence: m.licence, review: m.review,
      author: { name: typeof m.author?.name === 'string' ? m.author.name : 'Unknown author', ...(typeof m.author?.github === 'string' ? { github: m.author.github } : {}) },
      summary: typeof m.summary === 'string' ? m.summary : '', tags: Array.isArray(m.tags) ? m.tags.filter((t: unknown) => typeof t === 'string') : [],
      forkedFrom: typeof m.forkedFrom === 'string' ? m.forkedFrom : null,
      versions: versions.sort((a, b) => compareSemver(b.version, a.version)),
    })
  })
  return {
    ok: true, problems,
    index: { format: REGISTRY_FORMAT, name: String(raw.name ?? 'Registry'), sample: !!raw.sample, note: typeof raw.note === 'string' ? raw.note : undefined, updated: String(raw.updated ?? ''), repo: typeof raw.repo === 'string' ? raw.repo : null, modules },
  }
}

/** Newest version that is not yanked (yanked versions stay listed, with their reason, but are never installed). */
export const latestVersion = (m: RegistryModule) => m.versions.find((v) => !v.yanked) ?? null

export function installability(m: RegistryModule, v: RegistryVersion | null): { ok: boolean; reason?: string } {
  if (!v) return { ok: false, reason: 'Every version is yanked.' }
  if (v.yanked) return { ok: false, reason: `Yanked: ${v.reason}` }
  if (m.kind === 'code') return { ok: false, reason: 'This code module has no installable bundle in the registry yet. Code nodes run in the browser sandbox (research P15-M04) once imported through the node builder and allowed; declarative packages install from here.' }
  return { ok: true }
}

// ---- flags and ratings -------------------------------------------------------------------------------------------

export interface FlagRecord {
  module: string
  /** A version or a range written as "x.y.z", "x.y.z - x.y.z" or "*". */
  versions: string
  threshold: string | null
  claim: string
  correctedValue?: string
  evidenceUrl: string | null
  currentStatus: Flag
  state: 'open' | 'resolved'
  history: { date: string; status: Flag; note: string }[]
}

export function parseFlags(text: string): FlagRecord[] {
  try {
    const raw = JSON.parse(text)
    if (!Array.isArray(raw?.flags)) return []
    return raw.flags.filter((f: any) => f && typeof f.module === 'string' && typeof f.claim === 'string' && FLAGS.includes(f.currentStatus))
      .map((f: any): FlagRecord => ({
        module: f.module, versions: typeof f.versions === 'string' ? f.versions : '*', threshold: typeof f.threshold === 'string' ? f.threshold : null,
        claim: f.claim, ...(typeof f.correctedValue === 'string' ? { correctedValue: f.correctedValue } : {}), evidenceUrl: typeof f.evidenceUrl === 'string' ? f.evidenceUrl : null,
        currentStatus: f.currentStatus, state: f.state === 'resolved' ? 'resolved' : 'open', history: Array.isArray(f.history) ? f.history : [],
      }))
  } catch { return [] }
}

/** Does a flag's version range cover this version? */
export function flagCovers(f: FlagRecord, version: string): boolean {
  const r = f.versions.trim()
  if (r === '*' || r === version) return true
  const m = /^(\S+)\s*-\s*(\S+)$/.exec(r)
  return !!m && SEMVER.test(m[1]) && SEMVER.test(m[2]) && compareSemver(version, m[1]) >= 0 && compareSemver(version, m[2]) <= 0
}

/** A flag without evidence for a "false" status is shown as disputed, not as fact (research P15-M06). */
export const flagShownStatus = (f: FlagRecord): Flag | 'disputed' => (f.currentStatus === 'false_assumption' && !f.evidenceUrl ? 'disputed' : f.currentStatus)

/** Wilson score lower bound of the positive share (z = 1.96 for 95%). */
export function wilsonLower(up: number, n: number, z = 1.96): number {
  if (n <= 0) return 0
  const p = up / n
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
}

export const MIN_RATINGS = 5

export function parseRatings(text: string): Record<string, { up: number; down: number }> {
  try {
    const raw = JSON.parse(text)?.ratings ?? {}
    const out: Record<string, { up: number; down: number }> = {}
    for (const [id, r] of Object.entries(raw as Record<string, any>)) if (Number.isInteger(r?.up) && Number.isInteger(r?.down) && r.up >= 0 && r.down >= 0) out[id] = { up: r.up, down: r.down }
    return out
  } catch { return {} }
}

/** Rating as shown: hidden below the minimum count, otherwise the Wilson lower bound (research P15-M06). */
export function ratingSummary(r: { up: number; down: number } | undefined) {
  const n = r ? r.up + r.down : 0
  return { n, shown: n >= MIN_RATINGS, lower: r ? wilsonLower(r.up, n) : 0, positive: n ? r!.up / n : 0 }
}

// ---- integrity -----------------------------------------------------------------------------------------------------

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The package text must hash to the index entry, and name the same id and version. */
export async function checkDownload(m: RegistryModule, v: RegistryVersion, text: string): Promise<{ ok: boolean; problem?: string }> {
  const hash = await sha256Hex(text)
  if (hash !== v.sha256) return { ok: false, problem: `The package does not match the registry's SHA-256 (got ${hash.slice(0, 12)}…, expected ${v.sha256?.slice(0, 12)}…). It was not installed.` }
  try {
    const p = JSON.parse(text)
    if (p.id !== m.id || p.version !== v.version) return { ok: false, problem: `The package says ${p.id}@${p.version}, the registry lists ${m.id}@${v.version}. It was not installed.` }
  } catch { return { ok: false, problem: 'The package is not valid JSON.' } }
  return { ok: true }
}

// ---- submission (pull request files, never pushed) ---------------------------------------------------------------

export interface Submission {
  /** Files to add in the registry repository, path → content. */
  files: Record<string, string>
  /** The version line for index/<id>.jsonl (Cargo-style layout: one line per version). */
  indexLine: string
  prTitle: string
  prBody: string
}

/** Stable JSON: keys in insertion order, two-space indent, trailing newline (so the SHA-256 is reproducible). */
export const canonical = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`

export async function makeSubmission(pkg: Pick<NodePackage, 'id' | 'version' | 'name' | 'licence' | 'category' | 'stage' | 'metrics'>, opts: { today?: string } = {}): Promise<Submission> {
  const text = canonical(pkg)
  const sha256 = await sha256Hex(text)
  const evidence: Record<string, number> = {}
  for (const m of pkg.metrics) evidence[m.threshold.flag] = (evidence[m.threshold.flag] ?? 0) + 1
  const file = `packages/${pkg.id}@${pkg.version}.json`
  const line = { version: pkg.version, file, sha256, published: opts.today ?? new Date().toISOString().slice(0, 10), tier: 'declarative', permissions: [], evidence, yanked: false }
  const indexLine = JSON.stringify(line)
  const prTitle = `Add ${pkg.id}@${pkg.version}`
  const prBody = [
    `Adds **${pkg.name}** (\`${pkg.id}@${pkg.version}\`), a declarative Tower Design Toolkit node (\`tower-studio-node@1\`).`,
    '',
    `- Category: ${pkg.category} · stage: ${pkg.stage} · licence: ${pkg.licence}`,
    `- SHA-256 of \`${file}\`: \`${sha256}\``,
    `- Thresholds by claimed evidence: ${Object.entries(evidence).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    '',
    '**Checklist (CI runs these; a maintainer approves):**',
    '- [ ] The package passes Tower Design Toolkit\'s import check (schema, formulas, thresholds, its own tests)',
    '- [ ] Every threshold has a source with a page or clause; anything not read is marked unverified',
    '- [ ] No unpublished design, project file or personal data is included',
    '- [ ] I can license it under the declared licence',
    '',
    'Comments about the node go in its discussion thread once the registry page exists. Please do not discuss your own competition scheme there before the results.',
  ].join('\n')
  return { files: { [file]: text, [`index/${pkg.id}.jsonl`]: `${indexLine}\n` }, indexLine, prTitle, prBody }
}

/** Comment threads (research P15-M06): giscus maps one Discussion per module id. Not wired: no script is loaded. */
export function giscusConfig(moduleId: string, repo: string | null) {
  return {
    repo: repo ?? 'unresolved: the registry repository does not exist yet', repoId: '', category: 'Module feedback', categoryId: '',
    mapping: 'specific', term: moduleId, strict: '1', reactionsEnabled: '0', emitMetadata: '0', inputPosition: 'top', theme: 'light', lang: 'en', loading: 'lazy',
  }
}
