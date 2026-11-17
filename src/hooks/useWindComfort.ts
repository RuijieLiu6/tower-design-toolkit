// Pedestrian wind comfort (Sun & Wind Studio port): the node's presets, a debounced run in a Web Worker, and the shared
// result with its evidence lines. Several views call this hook; a run starts only when the inputs change. After the 17 Nov
// review: a result carries the project and model it was run for and is cleared when either changes or the run fails; a
// new run stops one still in flight; on Real Vancouver it waits for the detailed City buildings and reruns when they change.
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import type { RuleResult } from '../engine/types'
import type { WindStudyResult } from '../engine/windComfort'
import { cityObstacles, DEFAULT_WIND_PRESETS, readingsOf, strategyOf, towerObstacles, vtcObstacles, windNorthOf, windRules, windTowerOf, type P, type WindObstacles, type WindPresets, type WindReadings } from '../engine/windComfortInput'
import type { WindJob, WindJobOut } from '../workers/windWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { cityDetailReady, cityKey, isCurrent, runScheduler, workerRunner } from '../lib/sunWindRun'
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
  /** buildings: context buildings (with a height) that went into the run, other design towers excluded. */
  obstacles: Pick<WindObstacles, 'loaded' | 'unknownHeights' | 'source'> & { buildings: number }
  presets: WindPresets
  /** The project and model revision the run was for: anything else on screen makes the result stale. */
  project: string
  rev: string
  /** Degrees from the grid's +y to the north the bearings used. */
  north: number
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
  /** The inputs of the run last started. */
  key: string
  /** Bumped when a view drops a pending start, so the other views schedule it again. */
  nonce: number
  set: (p: Partial<WindPresets>) => void
  setView: (v: WindComfortState['view']) => void
  reset: () => void
}
function readPresets(): WindPresets {
  try { return { ...DEFAULT_WIND_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<WindPresets>) } } catch { return { ...DEFAULT_WIND_PRESETS } }
}
export const useWindComfortStore = create<WindComfortState>((set) => ({
  presets: readPresets(), view: 'with', status: 'idle', progress: '', error: '', out: null, runRev: null, outRev: null, key: '', nonce: 0,
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  setView: (view) => set({ view }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_WIND_PRESETS } } }),
}))

let pendingMeta: Omit<WindComfortOut, 'result' | 'readings' | 'rules'> | null = null
const runner = workerRunner<WindJobOut>(() => new Worker(new URL('../workers/windWorker.ts', import.meta.url), { type: 'module' }), {
  message: (d) => {
    if (d.progress) { const p = d.progress; useWindComfortStore.setState({ progress: `Sector ${p.i + 1} of ${p.n} · ${p.name}` }); return false }
    if (d.error || !d.result || !pendingMeta) { useWindComfortStore.setState({ status: 'error', error: d.error ?? 'No result', progress: '', out: null }); return true }
    const readings = readingsOf(d.result, d.plazaCells ?? 0)
    const rules = windRules({ readings, result: d.result, obstacles: pendingMeta.obstacles, presets: pendingMeta.presets, towerName: pendingMeta.towerName })
    useWindComfortStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...pendingMeta!, result: d.result!, readings, rules }, outRev: s.runRev }))
    return true
  },
  error: (msg) => useWindComfortStore.setState({ status: 'error', error: msg, progress: '', out: null }),
})
const scheduler = runScheduler()

/** The result only when it belongs to the project and model on screen and no rerun or failure is pending (trace, overlay, canvas). */
export function useWindComfortCurrent(): WindComfortOut | null {
  const out = useWindComfortStore((s) => s.out)
  const status = useWindComfortStore((s) => s.status)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  return isCurrent(out, status, project, rev) ? out : null
}

/** Live wind comfort result while the node is on (or `force`, e.g. on the Customize canvas). */
export function useWindComfort(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const on = useStore((s) => force || nodeOn(s, WIND_COMFORT_NODE))
  const presets = useWindComfortStore((s) => s.presets)
  const nonce = useWindComfortStore((s) => s.nonce)
  const state = useWindComfortStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  // The City data only on Real Vancouver, and only once its detailed buildings have loaded (the first stage has none).
  const city = useCityObstacles(on && project === 'city')
  const owner = useMemo(() => Symbol('wind-comfort'), [])
  useEffect(() => () => { if (scheduler.release(owner)) queueMicrotask(() => useWindComfortStore.setState((s) => ({ nonce: s.nonce + 1 }))) }, [owner])

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (project === 'city' && !cityDetailReady(city)) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const rev = modelRevision(towers)
    const key = JSON.stringify({ project, rev, tower: tower.id, presets, ground: project === 'city' ? ground : 0, vtc: project === 'vtc' ? vtcVersion : -1, city: project === 'city' ? cityKey(city) : null })
    const st = useWindComfortStore.getState()
    if (key === st.key) return
    if (st.out && (st.out.project !== project || st.out.rev !== rev)) useWindComfortStore.setState({ out: null })
    scheduler.schedule(key, st.key, owner, () => {
      if (!force && !nodeOn(useStore.getState(), WIND_COMFORT_NODE)) return
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, presets.future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
      const meshes = [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)]
      const north = windNorthOf(presets, project === 'vtc' ? VTC_NORTH_DEG : 0)
      const job: Omit<WindJob, 'id'> = { meshes, futures: obs.futures, plazaMeshes: obs.plazaMeshes, tower: windTowerOf(tower, centre),
        settings: { annual: presets.annual, dir: presets.dir, speed: presets.speed, period: presets.period, strat: strategyOf(tower, presets), north } }
      pendingMeta = { centre, towerId: tower.id, towerName: tower.name, obstacles: { loaded: obs.loaded, unknownHeights: obs.unknownHeights, source: obs.source, buildings: obs.meshes.length }, presets, project, rev, north }
      useWindComfortStore.setState({ key, status: 'running', progress: presets.annual ? 'Sector 1 of 8…' : 'Solving the flow…', runRev: rev, out: null })
      runner.post(job)
    })
  }, [on, force, towers, project, selected, ground, presets, vtcVersion, city.data, city.heights, city.hidden, nonce, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switched off: stop a run in flight and drop a pending start.
  useEffect(() => { if (!on) { scheduler.cancel(); runner.stop(); if (useWindComfortStore.getState().status === 'running') useWindComfortStore.setState({ status: 'idle', progress: '', key: '' }) } }, [on])

  return { ...state, on }
}
