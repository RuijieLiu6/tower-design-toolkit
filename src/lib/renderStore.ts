// AI render workflow state (research P13-M05): prepared jobs and imported results with their human review. Kept in
// this browser (localStorage `ts.renders`); the images themselves live in the board library (IndexedDB) and the shot
// strip. Rejected renders stay listed, so the record of AI use is complete.
import { create } from 'zustand'
import type { AiMeta, RenderJob, StyleId } from '../engine/renderPrompt'

export const REVIEW_CHECKS = [
  { id: 'massing', label: 'Same massing: outlines, heights and floor lines match the capture' },
  { id: 'context', label: 'Context towers all present, none invented or removed' },
  { id: 'marks', label: 'No invented text, signage, logos or watermarks (checked at 100%)' },
  { id: 'sun', label: 'Sun direction and shadows agree with the capture' },
] as const
export type ReviewId = (typeof REVIEW_CHECKS)[number]['id']

export interface RenderRecord {
  id: string
  imageId: string
  shotId: string
  meta: AiMeta
  imported: string
  checks: Partial<Record<ReviewId, boolean>>
  status: 'review' | 'accepted' | 'rejected'
  provId: string | null
  /** Imported without its manifest: the source capture is unknown. */
  orphan: boolean
}

interface RenderState {
  style: StyleId
  notes: string
  jobs: Pick<RenderJob, 'id' | 'created' | 'style' | 'cameraNote'>[]
  results: RenderRecord[]
  set: (patch: Partial<Pick<RenderState, 'style' | 'notes'>>) => void
  addJob: (j: RenderState['jobs'][number]) => void
  addResult: (r: RenderRecord) => void
  updateResult: (id: string, patch: Partial<RenderRecord>) => void
}

const KEY = 'ts.renders'
const load = (): Partial<RenderState> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const saved = load()

export const useRenderStore = create<RenderState>((set) => ({
  style: saved.style ?? 'overcast',
  notes: saved.notes ?? '',
  jobs: saved.jobs ?? [],
  results: saved.results ?? [],
  set: (patch) => set(patch),
  addJob: (j) => set((s) => ({ jobs: [j, ...s.jobs].slice(0, 50) })),
  addResult: (r) => set((s) => ({ results: [r, ...s.results.filter((x) => x.id !== r.id)] })),
  updateResult: (id, patch) => set((s) => ({ results: s.results.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
}))

useRenderStore.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ style: s.style, notes: s.notes, jobs: s.jobs, results: s.results })) } catch { /* private mode */ }
})
