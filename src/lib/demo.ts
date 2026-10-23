// The demo project for the mid review (Fri 23 Oct): the competition site with two towers, a public sky room and
// every built node switched on. Saved as public/demo/demo-project.json in the project file format
// (tower-studio-project@1, lib/project/projectFile.ts); demo.test.ts keeps the saved file equal to this.
import { BUILT_NODES } from '../data/registry'
import { suggestSkyLobby, withAutoCore } from '../engine/lifts'
import type { Tower } from '../engine/types'
import { DEFAULT_SKY_ROOM, useStore } from '../store'
import { pickDesign, type Design } from './project/design'

export const DEMO_FILE = './demo/demo-project.json'
export const DEMO_NAME = 'Demo: VTC two-tower scheme'

export function demoDesign(): Design {
  const base = pickDesign(useStore.getInitialState())
  const [t1] = base.towers.vtc
  // Tower 1: the default 285 m mixed-use tower with a sky lobby opened to the public as a free sky room.
  const lobby = suggestSkyLobby({ ...t1, skyLobbies: [] })
  const main: Tower = withAutoCore({
    ...t1, name: 'Tower 1 · mixed use',
    skyLobbies: lobby ? [lobby] : [], skyRoom: lobby ? { level: lobby, ...DEFAULT_SKY_ROOM } : null,
  })
  // Tower 2: a slimmer residential tower east of it, inside the 244–305 m band.
  const second: Tower = withAutoCore({
    ...t1, id: 't2', name: 'Tower 2 · residential', x: 45, y: 0, width: 30, depth: 30, height: 250, podiumHeight: 0,
    bands: [{ use: 'residential', share: 1 }], skyLobbies: [], skyRoom: null,
  })
  return {
    ...base,
    project: 'vtc',
    towers: { ...base.towers, vtc: [main, second] },
    selectedTower: main.id,
    enabled: Object.fromEntries(BUILT_NODES.map((n) => [n.id, true])),
    sun: { month: 9, day: 22, hour: 15 },
  }
}
