// A mass lines itself up with its lot (16 Nov, Sinnie: "after selecting or placing a mass, i want it to automatically
// orient itself to make the most sense on a lot instead of basing it off true north"). The first time a box tower
// appears (a case study, a typology, Add, a copy) or is selected while it still stands at the true-north default (turn
// 0°), it gets the Align placement of the tower bar (lib/towerEdit alignToLot: the study site or the City lot under it
// in Real Vancouver, the competition block otherwise), applied at once as one Undo step. It happens once per mass
// (Tower.autoAligned): a turn the user makes afterwards is kept. Drawn and imported masses keep the geometry they came with.
import { useStore } from '../store'
import type { Tower } from '../engine/types'
import { withoutHistory } from './project/history'

const eligible = (t: Tower) => !t.autoAligned && !t.drawn && !t.imported

function alignOnce(id: string) {
  const s = useStore.getState(), t = s.towers[s.project].find((x) => x.id === id)
  if (!t || !eligible(t)) return
  withoutHistory(() => useStore.getState().updateTower(id, { autoAligned: true }))
  if (Math.abs(t.rotation) > 1e-6) return // already turned (by the user or a generator): keep it
  void import('./towerEdit').then(({ alignToLot }) => alignToLot(id))
}

/** Watches new masses and selections once the saved session is back. Returns the unsubscribe. */
export function startAutoAlign(): () => void {
  let stop = () => {}, live = true
  void import('./project/session').then(({ whenRestored }) => whenRestored()).then(() => {
    if (!live) return
    let known = new Set(Object.values(useStore.getState().towers).flat().map((t) => t.id))
    stop = useStore.subscribe((s, p) => {
      const list = s.towers[s.project]
      const fresh = list.filter((t) => !known.has(t.id))
      if (fresh.length || s.towers !== p.towers) known = new Set(Object.values(s.towers).flat().map((t) => t.id))
      // New masses after a short pause (a placement in progress settles first); a first selection at once.
      for (const t of fresh) setTimeout(() => alignOnce(t.id), 120)
      if (s.selectedTower && s.selectedTower !== p.selectedTower && !fresh.some((t) => t.id === s.selectedTower)) alignOnce(s.selectedTower)
    })
  })
  return () => { live = false; stop() }
}
