// Pedestrian wind comfort (Sun & Wind Studio port): the node's presets, a debounced run in a Web Worker, and the shared
// result with its evidence lines. Several views call this hook; a run starts only when the inputs change.
import { useEffect } from 'react'
import { create } from 'zustand'
import type { RuleResult } from '../engine/types'
import type { WindStudyResult } from '../engine/windComfort'
import { cityObstacles, DEFAULT_WIND_PRESETS, readingsOf, strategyOf, towerObstacles, vtcObstacles, windRules, windTowerOf, type P, type WindObstacles, type WindPresets, type WindReadings } from '../engine/windComfortInput'
import type { WindJob, WindJobOut } from '../workers/windWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { loadVtcContext, useVtcSource } from '../lib/vtcContextSource'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'

export const WIND_COMFORT_NODE = 'built.wind-comfort'
const KEY = 'ts.windComfort'

export interface WindComfortOut {
  result: WindStudyResult
  readings: WindReadings
  rules: RuleResult[]
  /** Domain centre in the project frame (the block centre, or the tower). */
  centre: P
  towerId: string
  towerName: string
  obstacles: Pick<WindObstacles, 'loaded' | 'unknownHeights' | 'source'>
  presets: WindPresets
}
interface WindComfortState {
  presets: WindPresets
  /** Which field the overlay shows: with the tower, without, or the change in band. */
  view: 'with' | 'without' | 'change'
  status: 'idle' | 'running' | 'ready' | 'error'
  progress: string
  error: string
  out: WindComfortOut | null
  runRev: string | null
  outRev: string | null
  key: string
  set: (p: Partial<WindPresets>) => void
  setView: (v: WindComfortState['view']) => void
  reset: () => void
}
function readPresets(): WindPresets {
  try { return { ...DEFAULT_WIND_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<WindPresets>) } } catch { return { ...DEFAULT_WIND_PRESETS } }
}
export const useWindComfortStore = create<WindComfortState>((set) => ({
  presets: readPresets(), view: 'with', status: 'idle', progress: '', error: '', out: null, runRev: null, outRev: null, key: '',
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  setView: (view) => set({ view }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_WIND_PRESETS } } }),
}))

let worker: Worker | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
let pendingMeta: Omit<WindComfortOut, 'result' | 'readings' | 'rules'> | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/windWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WindJobOut>) => {
      if (e.data.id !== seq) return
      if (e.data.progress) { const p = e.data.progress; useWindComfortStore.setState({ progress: `Sector ${p.i + 1} of ${p.n} · ${p.name}` }); return }
      if (e.data.error || !e.data.result || !pendingMeta) { useWindComfortStore.setState({ status: 'error', error: e.data.error ?? 'No result', progress: '' }); return }
      const readings = readingsOf(e.data.result, e.data.plazaCells ?? 0)
      const rules = windRules({ readings, result: e.data.result, obstacles: pendingMeta.obstacles, presets: pendingMeta.presets, towerName: pendingMeta.towerName })
      useWindComfortStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...pendingMeta!, result: e.data.result!, readings, rules }, outRev: s.runRev }))
    }
    worker.onerror = (e) => useWindComfortStore.setState({ status: 'error', error: e.message || 'The wind worker failed to start', progress: '' })
  }
  return worker
}

/** Live wind comfort result while the node is on (or `force`, e.g. on the Customize canvas). */
export function useWindComfort(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const on = useStore((s) => force || nodeOn(s, WIND_COMFORT_NODE))
  const presets = useWindComfortStore((s) => s.presets)
  const state = useWindComfortStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  const city = useCityObstacles()
  const cityReady = project === 'city' ? !!city.data : true

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (!cityReady) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const key = JSON.stringify({ project, rev: modelRevision(towers), tower: tower.id, presets, ground: project === 'city' ? ground : 0, vtc: project === 'vtc' ? vtcVersion : -1, hidden: project === 'city' ? city.hidden.size : 0 })
    if (key === useWindComfortStore.getState().key) return
    useWindComfortStore.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, presets.future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
      const meshes = [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)]
      const job: WindJob = { id: ++seq, meshes, futures: obs.futures, plazaMeshes: obs.plazaMeshes, tower: windTowerOf(tower, centre),
        settings: { annual: presets.annual, dir: presets.dir, speed: presets.speed, period: presets.period, strat: strategyOf(tower, presets) } }
      pendingMeta = { centre, towerId: tower.id, towerName: tower.name, obstacles: { loaded: obs.loaded, unknownHeights: obs.unknownHeights, source: obs.source }, presets }
      useWindComfortStore.setState({ status: 'running', progress: presets.annual ? 'Sector 1 of 8…' : 'Solving the flow…', runRev: modelRevision(towers) })
      getWorker().postMessage(job)
    }, 400)
  }, [on, towers, project, selected, ground, presets, vtcVersion, city.data, city.heights, city.hidden, cityReady])

  return { ...state, on }
}
