// Vitest setup: a project opens with no tower (Ruijie, 6 Nov), but most tests check engines and files on the starting
// tower of each project, as placed by "Place a tower". So for tests the store's initial state already holds it (one in
// each project, the competition one selected). store.test.ts checks the real empty start (startingTowers, addTower on an empty project).
import { defaultTower, useStore } from '../store'

const init = useStore.getInitialState()
Object.assign(init, { towers: { vtc: [defaultTower('vtc')], city: [defaultTower('city')] }, selectedTower: 't1' })
useStore.setState(init, true)
