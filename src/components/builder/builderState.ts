// UI-only state of the workflow builder (components/builder/*): what is selected, what is being dragged and where it
// would land, the library's filters. Never the workflow itself: that is the project workflow
// (lib/workflow/projectWorkflow.ts), read and edited through its store. Nothing here is saved.
import { create } from 'zustand'
import type { PhaseId } from '../../lib/phases'

/** A drop target between cards: the tool goes after `after` (a node id, or 'start' for the front). */
export interface Slot { after: string }

export interface Drag {
  /** 'add' from the library, 'move' a card by its handle. */
  kind: 'add' | 'move'
  id: string
  /** Pointer position (client), for the ghost. */
  x: number
  y: number
  /** The slot under the pointer, or null when outside the sequence. */
  over: Slot | null
}

/** An insertion waiting for a yes (brief §7: show the proposed position before applying it). */
export interface PendingAdd { id: string; after: string }

interface BuilderUi {
  selected: string | null
  drag: Drag | null
  pending: PendingAdd | null
  /** A "Return to…" chooser open for this card. */
  returnFrom: string | null
  query: string
  phase: PhaseId | null
  /** The inspector, collapsed when space is short. */
  inspector: boolean
  /** The one-line description under the header, dismissed. */
  introHidden: boolean
  select: (id: string | null) => void
  setDrag: (d: Drag | null) => void
  setPending: (p: PendingAdd | null) => void
  setReturnFrom: (id: string | null) => void
  setQuery: (q: string) => void
  setPhase: (p: PhaseId | null) => void
  setInspector: (v: boolean) => void
  hideIntro: () => void
}

export const useBuilderUi = create<BuilderUi>((set) => ({
  selected: null, drag: null, pending: null, returnFrom: null, query: '', phase: null, inspector: true, introHidden: false,
  select: (selected) => set({ selected, returnFrom: null }),
  setDrag: (drag) => set({ drag }),
  setPending: (pending) => set({ pending }),
  setReturnFrom: (returnFrom) => set({ returnFrom }),
  setQuery: (query) => set({ query }),
  setPhase: (phase) => set({ phase }),
  setInspector: (inspector) => set({ inspector }),
  hideIntro: () => set({ introHidden: true }),
}))

/** The slot under a client point: the nearest `[data-slot]` element under the pointer, read from the DOM. */
export function slotAt(x: number, y: number): Slot | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const slot = el?.closest<HTMLElement>('[data-slot]')
  if (!slot) return null
  return { after: slot.dataset.slot! }
}
