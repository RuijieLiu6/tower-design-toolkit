// Undo / redo for design edits. Watches the app store instead of wrapping it, so store.ts stays as it is.
// Rapid changes (a slider drag, typing a number) merge into one step; switching project or tower is not a step.
import { useSyncExternalStore } from 'react'
import { useStore } from '../../store'

type AppState = ReturnType<typeof useStore.getState>
const KEYS = ['towers', 'models', 'enabled', 'fsrTier', 'transitLink', 'groundElevation', 'groundMode', 'sun', 'liftPresets', 'egressPresets', 'publicRealm', 'cityInNature', 'windPresets', 'systemsPresets'] as const
type Snap = Pick<AppState, (typeof KEYS)[number]>

/** Edits closer together than this (ms) are one undo step. */
export const MERGE_MS = 700
export const LIMIT = 100

const pick = (s: AppState): Snap => Object.fromEntries(KEYS.map((k) => [k, s[k]])) as Snap
const differs = (a: Snap, b: Snap) => KEYS.some((k) => a[k] !== b[k])

let past: Snap[] = []
let future: Snap[] = []
let last: Snap | null = null
let lastAt = -Infinity
let applying = false
let version = 0
let clock: () => number = () => Date.now()
const listeners = new Set<() => void>()
const notify = () => { version++; listeners.forEach((l) => l()) }

function onChange(s: AppState) {
  const cur = pick(s)
  if (!last || !differs(cur, last)) { last = cur; return }
  if (applying) { last = cur; return }
  const t = clock()
  if (t - lastAt > MERGE_MS || !past.length) {
    past.push(last)
    if (past.length > LIMIT) past.shift()
  }
  future = []
  lastAt = t
  last = cur
  notify()
}

function apply(snap: Snap) {
  applying = true
  try {
    const s = useStore.getState()
    const towers = snap.towers[s.project]
    const selectedTower = towers.some((t) => t.id === s.selectedTower) ? s.selectedTower : towers[0]?.id ?? ''
    useStore.setState({ ...snap, selectedTower, placing: false })
  } finally { applying = false }
  lastAt = -Infinity
}

/** Start recording. Returns a function that stops. The clock is injectable for tests. */
export function startHistory(now: () => number = () => Date.now()) {
  clock = now
  last = pick(useStore.getState())
  return useStore.subscribe(onChange)
}

export function undo(): boolean {
  const prev = past.pop()
  if (!prev) return false
  future.push(pick(useStore.getState()))
  apply(prev)
  useStore.setState({ announce: 'Undone' })
  notify()
  return true
}

export function redo(): boolean {
  const next = future.pop()
  if (!next) return false
  past.push(pick(useStore.getState()))
  apply(next)
  useStore.setState({ announce: 'Redone' })
  notify()
  return true
}

/** Forget the history (used after restoring an autosave, so the first undo doesn't jump back to the defaults). */
export function resetHistory() {
  past = []
  future = []
  last = pick(useStore.getState())
  lastAt = -Infinity
  notify()
}

/** Close the current merge window, so the next edit starts a new step (e.g. after opening a file). */
export function breakStep() { lastAt = -Infinity }

/**
 * Apply a change that follows from the design rather than being an edit (the base following the terrain after a
 * move). It folds into the current state, so undoing the move also restores the base it had before.
 */
export function withoutHistory(fn: () => void) {
  applying = true
  try { fn() } finally { applying = false }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }
export function useHistory() {
  useSyncExternalStore(subscribe, () => version)
  return { canUndo: past.length > 0, canRedo: future.length > 0 }
}
