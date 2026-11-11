// Checks on a tool definition and on a returned proposal (brief §7): nothing is repaired, every problem is said in
// plain words, and a proposal with a problem is never applied. The shape checks are hand-written (the records are
// small); the geometry checks mirror the import readers' rules (engine/imported.ts MIN_FLOOR_AREA).
import { DESIGN_TOOL_FORMAT, LIMITS, PROTOCOL, SETTABLE_FIELDS, TOOL_PREFIX, type Operation, type Proposal, type ToolDefinition } from './contract'

export interface Check { ok: boolean; problems: string[]; warnings: string[] }
const PHASES = ['site', 'form', 'program', 'schematic', 'present']
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const arr = (v: unknown) => Array.isArray(v)
const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/** A tool definition as a file: the fields the Toolkit needs, with the connection pinned to one origin. */
export function checkDefinition(d: unknown): Check & { def?: ToolDefinition } {
  const p: string[] = [], w: string[] = []
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, problems: ['Not a tool definition (not a JSON object).'], warnings: [] }
  const o = d as Record<string, unknown>
  if (o.format !== DESIGN_TOOL_FORMAT) p.push(`format must be "${DESIGN_TOOL_FORMAT}" (got ${JSON.stringify(o.format ?? 'missing')}).`)
  if (!str(o.id) || !new RegExp(`^${TOOL_PREFIX.replace('.', '\\.')}[a-z0-9][a-z0-9-]{1,40}$`).test(o.id as string)) p.push('id must be "tool." plus lower-case letters, digits and hyphens.')
  for (const k of ['version', 'name', 'purpose', 'licence']) if (!str(o[k])) p.push(`${k} is missing.`)
  const author = o.author as Record<string, unknown> | undefined
  if (!author || !str(author.name)) p.push('author.name is missing.')
  if (!arr(o.phases) || !(o.phases as unknown[]).length || !(o.phases as unknown[]).every((x) => PHASES.includes(x as string))) p.push('phases must list at least one of site, form, program, schematic, present.')
  const c = o.connection as Record<string, unknown> | undefined
  if (!c || c.method !== 'web') p.push('connection.method must be "web" (the only method in this version).')
  else {
    let url: URL | null = null
    try { url = new URL(c.url as string) } catch { p.push('connection.url is not a URL.') }
    if (url && !/^https?:$/.test(url.protocol)) p.push('connection.url must be http(s).')
    if (!str(c.origin)) p.push('connection.origin is missing.')
    else if (url && url.origin !== c.origin) p.push(`connection.origin (${c.origin}) does not match the url's origin (${url.origin}).`)
    if (c.origin === '*') p.push('connection.origin must be one origin, never "*".')
    if (c.protocol !== PROTOCOL) p.push(`connection.protocol must be "${PROTOCOL}".`)
    if (url && url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) w.push('The tool is served over http, not https: fine on this computer, not for a shared site.')
  }
  const r = o.runtime as Record<string, unknown> | undefined
  if (!r || r.browser !== true || !arr(r.network)) p.push('runtime must be { browser: true, network: [origins] }.')
  if (!arr(o.inputs) || !(o.inputs as unknown[]).every((x) => x === 'tower.selected' || x === 'site.outline')) p.push('inputs may only list tower.selected and site.outline.')
  if (!arr(o.outputs) || !(o.outputs as unknown[]).every((x) => x === 'geometry.storeys' || x === 'parameters')) p.push('outputs may only list geometry.storeys and parameters.')
  if (!arr(o.operations) || !(o.operations as unknown[]).length || !(o.operations as unknown[]).every((x) => x === 'replace-geometry' || x === 'set-parameter')) p.push('operations must list replace-geometry and/or set-parameter (deletion is never allowed).')
  const u = o.units as Record<string, unknown> | undefined
  if (!u || u.length !== 'm' || u.frame !== 'tower-local' || u.up !== 'z') p.push('units must be { length: "m", frame: "tower-local", up: "z" }.')
  const dest = o.destination as Record<string, unknown> | undefined
  if (!dest || !arr(dest.sends) || !str(dest.to) || !str(dest.stores)) p.push('destination must say what is sent (sends), to whom (to) and where it is stored (stores).')
  if (!arr(o.limits)) p.push('limits must be a list (it may be empty).')
  if (o.editability !== 'externally-generated' && o.editability !== 'native-parameters') p.push('editability must be externally-generated or native-parameters.')
  return { ok: !p.length, problems: p, warnings: w, def: p.length ? undefined : (o as unknown as ToolDefinition) }
}

export interface ProposalContext {
  def: ToolDefinition
  /** The run the host is waiting for; null when none (a late or stray message). */
  session: { sessionId: string; runId: string; projectId: string; baseRevision: string; targets: string[] } | null
  /** The revision of the model now (lib/workflow/phasePackage.ts modelRevision). */
  currentRevision: string
  /** Run ids already applied in this project. */
  applied: ReadonlySet<string>
}

/** Signed area of a ring (positive counter-clockwise). */
export const ringArea = (r: [number, number][]) => r.reduce((s, [x, y], i) => { const [nx, ny] = r[(i + 1) % r.length]; return s + x * ny - nx * y }, 0) / 2

function checkLoop(loop: unknown, where: string, p: string[]) {
  if (!arr(loop) || (loop as unknown[]).length < 3) { p.push(`${where}: a loop needs at least 3 points.`); return }
  const l = loop as unknown[]
  if (l.length > LIMITS.maxLoopPoints) p.push(`${where}: more than ${LIMITS.maxLoopPoints} points in one loop.`)
  for (const pt of l) if (!arr(pt) || (pt as unknown[]).length !== 2 || !(pt as unknown[]).every(fin)) { p.push(`${where}: a point is not two finite numbers.`); return }
  for (const [x, y] of l as [number, number][]) if (Math.abs(x) > 1000 || Math.abs(y) > 1000) { p.push(`${where}: a point lies more than 1 km from the tower (units or frame wrong?).`); return }
  const [f, e] = [l[0] as [number, number], l[l.length - 1] as [number, number]]
  if (f[0] === e[0] && f[1] === e[1]) p.push(`${where}: the loop repeats its first point at the end; send open rings.`)
}

function checkOperation(op: unknown, i: number, ctx: ProposalContext, p: string[], w: string[]) {
  const where = `operation ${i + 1}`
  if (!op || typeof op !== 'object') { p.push(`${where}: not an object.`); return }
  const o = op as Record<string, unknown>
  if (o.op !== 'replace-geometry' && o.op !== 'set-parameter') { p.push(`${where}: "${String(o.op)}" is not an allowed operation (replace-geometry, set-parameter).`); return }
  if (!ctx.def.operations.includes(o.op)) p.push(`${where}: the tool is not registered for ${o.op}.`)
  if (!str(o.target)) { p.push(`${where}: no target.`); return }
  if (ctx.session && !ctx.session.targets.includes(o.target as string)) p.push(`${where}: target ${o.target} was not among the objects sent to the tool.`)
  if (o.op === 'set-parameter') {
    if (!SETTABLE_FIELDS.includes(o.field as never)) p.push(`${where}: "${String(o.field)}" is not a settable field (${SETTABLE_FIELDS.join(', ')}).`)
    if (!fin(o.value) || (o.value as number) < 0 || (o.value as number) > LIMITS.maxHeight) p.push(`${where}: value must be a finite number between 0 and ${LIMITS.maxHeight}.`)
    return
  }
  const st = o.storeys
  if (!arr(st) || !(st as unknown[]).length) { p.push(`${where}: replace-geometry needs storeys.`); return }
  const list = st as Record<string, unknown>[]
  if (list.length > LIMITS.maxStoreys) p.push(`${where}: more than ${LIMITS.maxStoreys} storeys.`)
  let prevTop = -Infinity, small = 0
  list.forEach((s, k) => {
    const at = `${where}, storey ${k + 1}`
    if (!s || typeof s !== 'object' || !fin(s.z0) || !fin(s.z1)) { p.push(`${at}: z0 and z1 must be finite numbers.`); return }
    const z0 = s.z0 as number, z1 = s.z1 as number
    if (z1 <= z0) p.push(`${at}: z1 must be above z0.`)
    if (z0 < prevTop - 0.01) p.push(`${at}: storeys must rise in order (this one starts below the one before).`)
    prevTop = z1
    if (z1 > LIMITS.maxHeight) p.push(`${at}: higher than ${LIMITS.maxHeight} m.`)
    if (!arr(s.loops) || !(s.loops as unknown[]).length) { p.push(`${at}: no loops.`); return }
    ;(s.loops as unknown[]).forEach((loop, j) => checkLoop(loop, `${at}, loop ${j + 1}`, p))
    const outer = (s.loops as [number, number][][])[0]
    if (arr(outer) && outer.length >= 3 && outer.every((q) => arr(q) && q.length === 2 && q.every(fin))) {
      const a = Math.abs(ringArea(outer))
      if (a > LIMITS.maxPlate) p.push(`${at}: plate of ${Math.round(a)} m² is larger than ${LIMITS.maxPlate} m².`)
      if (a < LIMITS.minFloorArea) small++
    }
    if (s.use !== undefined && typeof s.use !== 'string') p.push(`${at}: use must be a use id.`)
  })
  if (small) w.push(`${small} storey${small === 1 ? '' : 's'} under ${LIMITS.minFloorArea} m² will count as voids, not floor area.`)
}

/** A returned proposal against the run it answers: identity, freshness, allowed operations, geometry. */
export function checkProposal(raw: unknown, ctx: ProposalContext): Check & { stale: boolean; proposal?: Proposal } {
  const p: string[] = [], w: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, stale: false, problems: ['Not a proposal (not a JSON object).'], warnings: [] }
  const o = raw as Record<string, unknown>
  if (o.protocol !== PROTOCOL || o.type !== 'tdt:proposal') p.push(`Not a ${PROTOCOL} proposal.`)
  if (o.toolId !== ctx.def.id) p.push(`It comes from ${String(o.toolId)}, not ${ctx.def.id}.`)
  if (o.toolVersion !== ctx.def.version) w.push(`Made by version ${String(o.toolVersion)}; ${ctx.def.version} is registered.`)
  if (!ctx.session) p.push('No run is waiting for a proposal (it was cancelled, or it arrived twice).')
  else {
    if (o.sessionId !== ctx.session.sessionId) p.push('It belongs to another session.')
    if (o.runId !== ctx.session.runId) p.push('It answers another run (cancelled or already finished).')
    if (o.projectId !== ctx.session.projectId) p.push('It was made for another project.')
  }
  if (str(o.runId) && ctx.applied.has(o.runId as string)) p.push('This proposal was already applied.')
  const u = o.units as Record<string, unknown> | undefined
  if (!u || u.length !== 'm' || u.frame !== 'tower-local' || u.up !== 'z') p.push(`Units must be metres in the tower-local frame, z up (got ${JSON.stringify(u ?? 'none')}).`)
  const stale = !!ctx.session && (o.baseRevision !== ctx.session.baseRevision || ctx.currentRevision !== ctx.session.baseRevision)
  if (!arr(o.operations) || !(o.operations as unknown[]).length) p.push('No operations.')
  else (o.operations as unknown[]).forEach((op, i) => checkOperation(op, i, ctx, p, w))
  for (const k of ['assumptions', 'warnings']) if (o[k] !== undefined && !arr(o[k])) p.push(`${k} must be a list of sentences.`)
  const size = JSON.stringify(raw).length
  if (size > LIMITS.maxBytes) p.push(`The proposal is ${(size / 1e6).toFixed(1)} MB, more than ${LIMITS.maxBytes / 1e6} MB.`)
  for (const s of (arr(o.warnings) ? (o.warnings as unknown[]) : [])) if (str(s)) w.push(`Tool: ${s as string}`)
  const ok = !p.length
  return { ok, stale, problems: p, warnings: w, proposal: ok ? ({ ...o, assumptions: (o.assumptions as string[]) ?? [], warnings: (o.warnings as string[]) ?? [], parameters: (o.parameters as Record<string, unknown>) ?? null, operations: o.operations as Operation[] } as Proposal) : undefined }
}
