// Massing starts on a cleared site (16 Nov, Sinnie: "for massing, users should start with a cleared site"). The first
// time the Form (Massing) step opens in a visit, for each project, the towers and the imported model already on the
// site are put away as one Undo step, with a note that says so and an Undo button. Massing then opens on its start
// choices (components/tools/NoTower.tsx MassingStart). Later visits to the step in the same visit keep the design.
import { useStore, type ProjectKind } from '../store'
import { useStep } from './step'

const cleared = new Set<ProjectKind>()

async function clearForMassing() {
  const [{ whenRestored }, { breakStep }, { tell }] = await Promise.all([import('./project/session'), import('./project/history'), import('./siteActions')])
  await whenRestored()
  const s = useStore.getState(), p = s.project
  if (useStep.getState().step !== 'volume' || cleared.has(p)) return
  cleared.add(p)
  const n = s.towers[p].length, m = s.models[p] ? 1 : 0
  if (!n && !m) return
  breakStep()
  useStore.setState({ towers: { ...s.towers, [p]: [] }, models: { ...s.models, [p]: null }, selectedTower: '', placing: false })
  breakStep()
  const what = [n ? `${n} tower${n === 1 ? '' : 's'}` : '', m ? 'the imported model' : ''].filter(Boolean).join(' and ')
  tell(`Massing starts on a cleared site: ${what} put away. Undo brings it back.`, { undoable: true })
}

/** On entering the Form step (and when the app or a project opens on it). Returns the unsubscribe. */
export function startMassingClear(): () => void {
  const later = () => setTimeout(() => void clearForMassing(), 400)
  if (useStep.getState().step === 'volume') later()
  const a = useStep.subscribe((s, p) => { if (s.step === 'volume' && p.step !== 'volume') later() })
  const b = useStore.subscribe((s, p) => { if (s.project !== p.project && useStep.getState().step === 'volume') later() })
  return () => { a(); b() }
}
