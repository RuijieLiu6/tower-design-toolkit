// Daylight sDA / ASE (Sun & Wind Studio port): the node's presets, a debounced run in a Web Worker, and the shared result
// with its evidence lines. Several views call this hook; a run starts only when the inputs change.
import { useEffect } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import type { AseTower, DlFloor, DlTower } from '../engine/daylightSW'
import { daylightModelOf, daylightRules, DEFAULT_DAYLIGHT_PRESETS, glazingOf, readingsOf, type DaylightPresets, type DaylightReadings, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { RuleResult } from '../engine/types'
import { cityObstacles, towerObstacles, vtcObstacles } from '../engine/windComfortInput'
import type { DaylightJob, DaylightJobOut } from '../workers/daylightWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { loadVtcContext, useVtcSource } from '../lib/vtcContextSource'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'

export const DAYLIGHT_SW_NODE = 'built.daylight-sw'
const KEY = 'ts.daylightSW'

export interface DaylightSWOut {
  tower: DlTower
  ase: AseTower
  readings: DaylightReadings
  rules: RuleResult[]
  /** Toolkit level of each analysed floor (rows of tower / ase, in order). */
  levels: number[]
  towerId: string
  towerName: string
  contextLoaded: boolean
  unknownHeights: number
  glazing: GlazingChoice
  presets: DaylightPresets
  /** Degrees the plates were turned (true north to +y); 0 when the model grid is read as north. */
  north: number
  /** The analysed plates in her frame (same order as levels) and the core centre, for the plan. */
  plates: DlFloor[]
  posX: number
  posY: number
}
interface DaylightSWState {
  presets: DaylightPresets
  /** Which field the plan shows, and on which analysed floor (index into levels). */
  layer: 'da' | 'df' | 'ase'
  floor: number | null
  status: 'idle' | 'running' | 'ready' | 'error'
  progress: string
  error: string
  out: DaylightSWOut | null
  runRev: string | null
  outRev: string | null
  key: string
  set: (p: Partial<DaylightPresets>) => void
  setLayer: (v: DaylightSWState['layer']) => void
  setFloor: (i: number | null) => void
  reset: () => void
}
function readPresets(): DaylightPresets {
  try { return { ...DEFAULT_DAYLIGHT_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DaylightPresets>) } } catch { return { ...DEFAULT_DAYLIGHT_PRESETS } }
}
export const useDaylightSWStore = create<DaylightSWState>((set) => ({
  presets: readPresets(), layer: 'da', floor: null, status: 'idle', progress: '', error: '', out: null, runRev: null, outRev: null, key: '',
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  setLayer: (layer) => set({ layer }),
  setFloor: (floor) => set({ floor }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_DAYLIGHT_PRESETS } } }),
}))

let worker: Worker | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
let pendingMeta: (Omit<DaylightSWOut, 'tower' | 'ase' | 'readings' | 'rules'> & { left: number }) | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/daylightWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DaylightJobOut>) => {
      if (e.data.id !== seq) return
      if (e.data.progress) { const p = e.data.progress; useDaylightSWStore.setState({ progress: `${p.stage === 'daylight' ? 'Daylight' : 'Annual sun'} · floor ${p.i + 1} of ${p.n}` }); return }
      if (e.data.error || !e.data.tower || !e.data.ase || !pendingMeta) { useDaylightSWStore.setState({ status: 'error', error: e.data.error ?? 'No result', progress: '' }); return }
      const m = pendingMeta
      const readings = readingsOf(e.data.tower, e.data.ase, m.levels)
      const rules = daylightRules({ readings, contextLoaded: m.contextLoaded, unknownHeights: m.unknownHeights, glazing: m.glazing, presets: m.presets, towerName: m.towerName, period: e.data.ase.period, left: m.left })
      useDaylightSWStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...m, tower: e.data.tower!, ase: e.data.ase!, readings, rules }, outRev: s.runRev, floor: s.floor != null && s.floor < m.levels.length ? s.floor : null }))
    }
    worker.onerror = (e) => useDaylightSWStore.setState({ status: 'error', error: e.message || 'The daylight worker failed to start', progress: '' })
  }
  return worker
}

/** Live daylight result while the node is on (or `force`, e.g. on the Customize canvas). */
export function useDaylightSW(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const on = useStore((s) => force || nodeOn(s, DAYLIGHT_SW_NODE))
  const facadeOn = useStore((s) => nodeOn(s, 'built.facade'))
  const { system, wwr, vlt, shgc } = useFacadeStore()
  const presets = useDaylightSWStore((s) => s.presets)
  const state = useDaylightSWStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  const city = useCityObstacles()
  const cityReady = project === 'city' ? !!city.data : true

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (!cityReady) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev: modelRevision(towers), tower: tower.id, presets, facade, ground: project === 'city' ? ground : 0, vtc: project === 'vtc' ? vtcVersion : -1, hidden: project === 'city' ? city.hidden.size : 0 })
    if (key === useDaylightSWStore.getState().key) return
    useDaylightSWStore.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, presets.future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
      const meshes = [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)]
      const model = daylightModelOf(tower, centre, north)
      const glazing = glazingOf(presets, facade)
      const job: DaylightJob = { id: ++seq, meshes, futures: obs.futures, north, floors: model.floors, settings: { zones: glazing.zones, vt: glazing.vt, target: presets.target, posX: model.posX, posY: model.posY, period: presets.period } }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, contextLoaded: obs.loaded, unknownHeights: obs.unknownHeights, glazing, presets, north, left: model.left, plates: model.floors, posX: model.posX, posY: model.posY }
      useDaylightSWStore.setState({ status: 'running', progress: 'Preparing the sky of the typical year…', runRev: modelRevision(towers) })
      getWorker().postMessage(job)
    }, 400)
  }, [on, towers, project, selected, ground, presets, facadeOn, system, wwr, vlt, shgc, vtcVersion, city.data, city.heights, city.hidden, cityReady])

  return { ...state, on }
}
