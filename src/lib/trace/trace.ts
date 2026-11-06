// Decision trace (research P16-M04): iterations of the design with what the checks said, and the decisions people
// recorded with their own rationale. Kept in the project file, so autosave, Save as and Export carry it.
// The tool records inputs and results; it never writes a rationale.
import { create } from 'zustand'
import { nodeById } from '../../data/registry'
import { USES, type Tower } from '../../engine/types'
import { useCommunityStore } from '../communityStore'
import { applyDesign, defaultDesign, pickDesign, type Design } from '../project/design'
import { breakStep } from '../project/history'
import { hashOf } from '../project/stable'
import { useStore } from '../../store'
import type { Digest } from './digest'
import type { CardReview } from './review'

export type IterationKind = 'checkpoint' | 'saved' | 'opened' | 'new' | 'decision'
export interface Iteration { id: string; at: string; label: string; kind: IterationKind; hash: string; design: Design; digest: Digest }
export type Outcome = 'chosen' | 'rejected' | 'deferred'
export interface Decision {
  id: string; at: string; iterationId: string
  /** IBIS: the question, the option considered, what happened to it, and why (written by a person). */
  issue: string; option: string; outcome: Outcome; rationale: string; author: string
  origin: 'human'
}
export interface Trace { iterations: Iteration[]; decisions: Decision[]; reviews?: CardReview[] }

export const MAX_ITERATIONS = 200

interface TraceState extends Trace {
  reviews: CardReview[]
  /** Digest of the current design, kept fresh by the recorder component. */
  live: { hash: string; digest: Digest } | null
  pending: { label: string; kind: IterationKind } | null
  author: string
}
export const useTrace = create<TraceState>(() => ({ iterations: [], decisions: [], reviews: [], live: null, pending: null, author: '' }))

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
export const designHash = (d: Design) => hashOf(d)
export const currentDesign = () => pickDesign(useStore.getState())

function commit(label: string, kind: IterationKind, live: { hash: string; digest: Digest }): Iteration | null {
  const s = useTrace.getState()
  const last = s.iterations[s.iterations.length - 1]
  // The same design twice in a row is one iteration, unless this records a save or an open.
  if (last && last.hash === live.hash && (kind === 'checkpoint' || kind === 'decision')) return last
  // Sources stay with the live view (rule cards, sources index); stored iterations keep results only, so files stay lean.
  const digest: Digest = { metrics: live.digest.metrics, lines: live.digest.lines.map(({ source: _source, threshold: _threshold, ...l }) => l) }
  const it: Iteration = { id: newId('i'), at: new Date().toISOString(), label: label.trim() || 'Iteration', kind, hash: live.hash, design: currentDesign(), digest }
  // Drop the oldest iterations past the cap, but never one a decision points to.
  let list = [...s.iterations, it]
  const keep = new Set(s.decisions.map((d) => d.iterationId))
  while (list.length > MAX_ITERATIONS) { const i = list.findIndex((x) => !keep.has(x.id)); if (i < 0) break; list = list.filter((_, k) => k !== i) }
  useTrace.setState({ iterations: list, pending: null })
  return it
}

/** Record an iteration of the current design (now if its results are ready, otherwise as soon as they are). */
export function recordIteration(label: string, kind: IterationKind = 'checkpoint'): Iteration | null {
  const live = useTrace.getState().live
  if (live && live.hash === designHash(currentDesign())) return commit(label, kind, live)
  useTrace.setState({ pending: { label, kind } })
  return null
}

/** Called by the recorder whenever the live results change. */
export function setLive(hash: string, digest: Digest) {
  useTrace.setState({ live: { hash, digest } })
  const p = useTrace.getState().pending
  if (p && hash === designHash(currentDesign())) commit(p.label, p.kind, { hash, digest })
}

export function addDecision(d: Omit<Decision, 'id' | 'at' | 'iterationId' | 'origin'>): Decision | null {
  if (!d.rationale.trim() || !d.issue.trim()) return null
  const it = recordIteration(`Decision: ${d.issue.trim().slice(0, 60)}`, 'decision')
  const s = useTrace.getState()
  const iteration = it ?? s.iterations[s.iterations.length - 1]
  if (!iteration) return null
  const dec: Decision = { ...d, issue: d.issue.trim(), option: d.option.trim(), rationale: d.rationale.trim(), author: d.author.trim() || 'Unnamed', id: newId('d'), at: new Date().toISOString(), iterationId: iteration.id, origin: 'human' }
  useTrace.setState({ decisions: [...s.decisions, dec], author: dec.author })
  return dec
}

/** Put an earlier iteration's design back (one undo step). Fields added since then take today's defaults. */
export function restoreIteration(id: string) {
  const it = useTrace.getState().iterations.find((x) => x.id === id)
  if (!it) return
  breakStep()
  // Iterations saved before 27 Oct have no ground mode: they restore with the base they recorded (set by hand).
  applyDesign({ ...defaultDesign(), ...it.design, groundMode: it.design.groundMode ?? 'manual' }, `Restored “${it.label}”. Ctrl+Z goes back.`)
  breakStep()
}

/** Keep a rule-card review (blind-first, written by a person). */
export function addReview(r: CardReview) {
  const s = useTrace.getState()
  useTrace.setState({ reviews: [...s.reviews, r].slice(-500), author: r.reviewer })
}

export const traceForFile = (): Trace | undefined => {
  const { iterations, decisions, reviews } = useTrace.getState()
  return iterations.length || decisions.length || reviews.length ? { iterations, decisions, ...(reviews.length ? { reviews } : {}) } : undefined
}
export function loadTrace(t: Trace | undefined) {
  useTrace.setState({ iterations: t?.iterations ?? [], decisions: t?.decisions ?? [], reviews: t?.reviews ?? [], pending: null })
}

// --- Plain-words design diff --------------------------------------------------------------------------------------

const M = (n: number) => `${Math.round(n * 10) / 10} m`
const TOWER_FIELDS: Partial<Record<keyof Tower, (v: never) => string>> = {
  height: M, width: M, depth: M, f2f: M, podiumHeight: M, podiumWidth: M, podiumDepth: M, x: M, y: M,
  rotation: (v: number) => `${v}°`,
  coreShare: (v: number) => `${Math.round(v * 1000) / 10}%`,
  plantEvery: (v: number) => (v ? `every ${v} floors` : 'none'),
  coreAuto: (v: boolean) => (v ? 'sized to the lifts' : 'set by hand'),
  podiumUse: (v: keyof typeof USES) => USES[v]?.label ?? String(v),
  bands: (v: Tower['bands']) => v.map((b) => `${USES[b.use]?.label ?? b.use} ${Math.round(b.share * 100)}%`).join(', '),
  skyLobbies: (v: number[]) => (v?.length ? `L${v.join(', L')}` : 'none'),
  outriggerFloors: (v: number[]) => (v?.length ? `L${v.join(', L')}` : 'none'),
}
const LABEL: Partial<Record<keyof Tower, string>> = {
  height: 'height', width: 'width', depth: 'depth', f2f: 'floor-to-floor', podiumHeight: 'podium height', podiumWidth: 'podium width', podiumDepth: 'podium depth',
  rotation: 'rotation', coreShare: 'core share', outriggerFloors: 'outrigger floors', plantEvery: 'plant floors', coreAuto: 'core', podiumUse: 'podium use', bands: 'program', skyLobbies: 'sky lobbies',
  x: 'position x', y: 'position y', skyRoom: 'sky room', stairPlacement: 'stairs', imported: 'imported massing', name: 'name',
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const SITE = { vtc: 'competition site', city: 'Real Vancouver' } as const

function leafDiff(prefix: string, a: unknown, b: unknown, out: string[], depth = 0) {
  if (same(a, b)) return
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && depth < 4) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leafDiff(prefix ? `${prefix} › ${k}` : k, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], out, depth + 1)
    return
  }
  const show = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 1000) / 1000}` : v === undefined ? '—' : JSON.stringify(v))
  out.push(`${prefix}: ${show(a)} → ${show(b)}`)
}

/** What changed in the design, in plain words (towers by id, both projects). */
export function diffDesign(a: Design, b: Design): string[] {
  const out: string[] = []
  if (a.project !== b.project) out.push(`Project: ${SITE[a.project]} → ${SITE[b.project]}`)
  for (const kind of ['vtc', 'city'] as const) {
    const where = kind === b.project ? '' : ` (${SITE[kind]})`
    const A = new Map(a.towers[kind].map((t) => [t.id, t])), B = new Map(b.towers[kind].map((t) => [t.id, t]))
    for (const [id, t] of B) if (!A.has(id)) out.push(`Added ${t.name}${where}`)
    for (const [id, t] of A) if (!B.has(id)) out.push(`Removed ${t.name}${where}`)
    for (const [id, tb] of B) {
      const ta = A.get(id)
      if (!ta) continue
      for (const k of new Set([...Object.keys(ta), ...Object.keys(tb)]) as Set<keyof Tower>) {
        if (k === 'id' || same(ta[k], tb[k])) continue
        if (k === 'coreShare' && tb.coreAuto && ta.coreAuto) continue // follows the lifts: a result, not a choice
        const f = TOWER_FIELDS[k] as ((v: unknown) => string) | undefined
        out.push(`${tb.name}${where} ${LABEL[k] ?? String(k)}: ${f ? f(ta[k]) : 'changed'} → ${f ? f(tb[k]) : 'changed'}`)
      }
    }
  }
  if (a.fsrTier !== b.fsrTier) out.push(`FSR reading: tier ${a.fsrTier} → tier ${b.fsrTier}`)
  if (a.transitLink !== b.transitLink) out.push(`Transit link: ${a.transitLink ? 'declared' : 'not declared'} → ${b.transitLink ? 'declared' : 'not declared'}`)
  if (a.groundElevation !== b.groundElevation) out.push(`Ground elevation (Real Vancouver): ${M(a.groundElevation)} → ${M(b.groundElevation)}`)
  if (a.groundMode !== b.groundMode) out.push(`Tower base (Real Vancouver): ${a.groundMode === 'terrain' ? 'follows the terrain' : 'set by hand'} → ${b.groundMode === 'terrain' ? 'follows the terrain' : 'set by hand'}`)
  if (!same(a.sun, b.sun)) out.push(`Sun setting: ${a.sun.month}/${a.sun.day} ${a.sun.hour}:00 → ${b.sun.month}/${b.sun.day} ${b.sun.hour}:00`)
  const presets: string[] = []
  leafDiff('Lift preset', a.liftPresets, b.liftPresets, presets)
  leafDiff('Egress preset', a.egressPresets, b.egressPresets, presets)
  leafDiff('Public realm', a.publicRealm, b.publicRealm, presets)
  leafDiff('Life-safety preset', a.systemsPresets, b.systemsPresets, presets)
  out.push(...presets.slice(0, 8), ...(presets.length > 8 ? [`…and ${presets.length - 8} more input changes`] : []))
  const names = Object.fromEntries(useCommunityStore.getState().packages.map((p) => [p.id, p.name]))
  const name = (id: string) => nodeById(id)?.name ?? names[id] ?? id
  const on = Object.keys(b.enabled).filter((k) => b.enabled[k] && !a.enabled[k]), off = Object.keys(a.enabled).filter((k) => a.enabled[k] && !b.enabled[k])
  if (on.length) out.push(`Switched on: ${on.map(name).join(', ')}`)
  if (off.length) out.push(`Switched off: ${off.map(name).join(', ')}`)
  return out
}
