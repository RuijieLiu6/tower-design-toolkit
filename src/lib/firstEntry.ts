// The first entry of a visit starts on an empty site (16 Nov, Sinnie: "when i first enter the site, there should be no
// initial geometry that shows up"): towers and imported models kept from an earlier session are put away in both
// projects. Entering from the start page asks for it (lib/startPreset.ts); it runs once the design view's undo history
// is on and the autosave restored (components/ProjectMenu.tsx), so it is one step that Undo brings back, said in a
// note with Undo. Entering again later in the same visit keeps the design.
import { useStore } from '../store'

let asked = false
let done = false
let historyOn = false

/** From the start page's Enter: the first time in a visit only. */
export function askFirstEntryClear() {
  if (asked) return
  asked = true
  if (historyOn) void runFirstEntryClear()
}

/** From the design view, once its undo history runs. */
export function historyStarted() {
  historyOn = true
  if (asked) void runFirstEntryClear()
}
export function historyStopped() { historyOn = false }

async function runFirstEntryClear() {
  if (done) return
  done = true
  const [{ whenRestored }, { breakStep }, { tell }] = await Promise.all([import('./project/session'), import('./project/history'), import('./siteActions')])
  await whenRestored()
  const s = useStore.getState()
  const n = s.towers.vtc.length + s.towers.city.length, m = (s.models.vtc ? 1 : 0) + (s.models.city ? 1 : 0)
  if (!n && !m) return
  breakStep()
  useStore.setState({ towers: { vtc: [], city: [] }, models: { vtc: null, city: null }, selectedTower: '', placing: false })
  breakStep()
  const what = [n ? `${n} tower${n === 1 ? '' : 's'}` : '', m ? `${m} imported model${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')
  tell(`Started on an empty site. Your last design (${what}) is put away: Undo brings it back.`, { undoable: true })
}
