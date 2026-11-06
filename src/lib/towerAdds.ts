// Which towers were just added (Ruijie, 5 Nov: "once you add volume in the map, allow the right site panel to indicate
// that a tower is added"): a tower whose id appears next to towers already there, in the same project (Add tower, an
// upload, a Rhino link update with a new tower). A project switch or a restore replaces the whole list and adds none.
// The right panel's Your site tab shows them with a "New" mark (components/site/SiteInfo.tsx) and opens on each addition.
import { create } from 'zustand'
import { useStore } from '../store'

interface TowerAdds {
  /** Tower id -> when it was added (ms); cleared when the person opens it in the list. */
  added: Record<string, number>
  /** Counts additions, for the right panel to open Your site on each. */
  seq: number
}
export const useTowerAdds = create<TowerAdds>(() => ({ added: {}, seq: 0 }))

type State = ReturnType<typeof useStore.getState>
let prev: { project: string; ids: Set<string> } | null = null

/** Compares the open project's towers with the last look; exported for the tests. */
export function observeTowers(s: Pick<State, 'project' | 'towers'>, now = Date.now()) {
  const ids = new Set(s.towers[s.project].map((t) => t.id))
  if (prev && prev.project === s.project) {
    const before = prev.ids
    const fresh = [...ids].filter((id) => !before.has(id))
    const kept = [...ids].some((id) => before.has(id))
    if (fresh.length && kept) useTowerAdds.setState((a) => ({ added: { ...a.added, ...Object.fromEntries(fresh.map((id) => [id, now])) }, seq: a.seq + 1 }))
  }
  // Towers gone (deleted) lose their mark.
  const marks = useTowerAdds.getState().added
  if (Object.keys(marks).some((id) => !ids.has(id) && prev?.project === s.project)) {
    useTowerAdds.setState({ added: Object.fromEntries(Object.entries(marks).filter(([id]) => ids.has(id))) })
  }
  prev = { project: s.project, ids }
}

let unsubscribe: (() => void) | null = null
/** Starts watching the store (once). */
export function watchTowerAdds() {
  if (unsubscribe) return
  observeTowers(useStore.getState())
  unsubscribe = useStore.subscribe((s, p) => { if (s.towers !== p.towers || s.project !== p.project) observeTowers(s) })
}

/** The person has seen this tower in the list: no more "New". */
export function seenTower(id: string) {
  const a = useTowerAdds.getState().added
  if (!(id in a)) return
  const rest = { ...a }
  delete rest[id]
  useTowerAdds.setState({ added: rest })
}

/** For the tests: forget the last look. */
export function resetTowerAdds() { prev = null; useTowerAdds.setState({ added: {}, seq: 0 }) }
