// Daylight sDA / ASE (Sun & Wind Studio port): the node's presets, a debounced run in a Web Worker, and the shared result
// with its evidence lines. Several views call this hook; a run starts only when the inputs change. After the 17 Nov review
// (as the wind comfort hook): results carry their project and model and are read only when current; a new run stops one
// in flight; on Real Vancouver the run waits for the detailed City buildings and reruns when they change; a tower with no
// floor to analyse posts no job and reports one unknown line.
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import type { AseTower, DlFloor, DlTower } from '../engine/daylightSW'
import { daylightModelOf, daylightRules, DEFAULT_DAYLIGHT_PRESETS, glazingOf, noFloorsRule, readingsOf, SRC, type DaylightPresets, type DaylightReadings, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { RuleResult } from '../engine/types'
import { cityObstacles, towerObstacles, vtcObstacles } from '../engine/windComfortInput'
import type { DaylightJob, DaylightJobOut } from '../workers/daylightWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { cityDetailReady, cityKey, isCurrent, runScheduler, workerRunner } from '../lib/sunWindRun'
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
  /** Toolkit level of each analysed floor (rows of tower / ase, in order): labels only. */
  levels: number[]
  towerId: string
  towerName: string
  contextLoaded: boolean
  unknownHeights: number
  glazing: GlazingChoice
  presets: DaylightPresets
  /** Degrees the plates were turned (true north to +y); the label comes from presets.north. */
  north: number
  plates: DlFloor[]
  posX: number
  posY: number
  project: string
  rev: string
}
/** No floor to analyse: the line reported instead of a run, for the project and model it was found on. */
export interface DaylightEmpty { project: string; rev: string; rules: RuleResult[] }
interface DaylightSWState {
  presets: DaylightPresets
  layer: 'da' | 'df' | 'ase'
  floor: number | null
  status: 'idle' | 'running' | 'ready' | 'error'
  progress: string
  error: string
  out: DaylightSWOut | null
  empty: DaylightEmpty | null
  runRev: string | null
  outRev: string | null
  key: string
  nonce: number
  set: (p: Partial<DaylightPresets>) => void
  setLayer: (v: DaylightSWState['layer']) => void
  setFloor: (i: number | null) => void
  reset: () => void
}
function readPresets(): DaylightPresets {
  try { return { ...DEFAULT_DAYLIGHT_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DaylightPresets>) } } catch { return { ...DEFAULT_DAYLIGHT_PRESETS } }
}
export const useDaylightSWStore = create<DaylightSWState>((set) => ({
  presets: readPresets(), layer: 'da', floor: null, status: 'idle', progress: '', error: '', out: null, empty: null, runRev: null, outRev: null, key: '', nonce: 0,
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  setLayer: (layer) => set({ layer }),
  setFloor: (floor) => set({ floor }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_DAYLIGHT_PRESETS } } }),
}))

let pendingMeta: (Omit<DaylightSWOut, 'tower' | 'ase' | 'readings' | 'rules'> & { left: number }) | null = null
const runner = workerRunner<DaylightJobOut>(() => new Worker(new URL('../workers/daylightWorker.ts', import.meta.url), { type: 'module' }), {
  message: (d) => {
    if (d.progress) { const p = d.progress; useDaylightSWStore.setState({ progress: `${p.stage === 'daylight' ? 'Daylight' : 'Annual sun'} · floor ${p.i + 1} of ${p.n}` }); return false }
    if (d.error || !d.tower || !d.ase || !pendingMeta) { useDaylightSWStore.setState({ status: 'error', error: d.error ?? 'No result', progress: '', out: null }); return true }
    const m = pendingMeta
    const readings = readingsOf(d.tower, d.ase, m.levels)
    const rules = daylightRules({ readings, contextLoaded: m.contextLoaded, unknownHeights: m.unknownHeights, glazing: m.glazing, presets: m.presets, towerName: m.towerName, period: d.ase.period, left: m.left })
    useDaylightSWStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...m, tower: d.tower!, ase: d.ase!, readings, rules }, outRev: s.runRev, floor: s.floor != null && s.floor < m.levels.length ? s.floor : null }))
    return true
  },
  error: (msg) => useDaylightSWStore.setState({ status: 'error', error: msg, progress: '', out: null }),
})
const scheduler = runScheduler()

/** The result only when it belongs to the project and model on screen and no rerun or failure is pending. */
export function useDaylightSWCurrent(): DaylightSWOut | null {
  const out = useDaylightSWStore((s) => s.out)
  const status = useDaylightSWStore((s) => s.status)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  return isCurrent(out, status, project, rev) ? out : null
}
/** The lines to record: the current result's, or the "no floors" line when that is what this model gave. */
export function useDaylightSWLines(): RuleResult[] | null {
  const out = useDaylightSWCurrent()
  const empty = useDaylightSWStore((s) => s.empty)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  if (out) return out.rules
  return empty && empty.project === project && empty.rev === rev ? empty.rules : null
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
  const nonce = useDaylightSWStore((s) => s.nonce)
  const state = useDaylightSWStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  const city = useCityObstacles(on && project === 'city')
  const owner = useMemo(() => Symbol('daylight-sw'), [])
  useEffect(() => () => { if (scheduler.release(owner)) queueMicrotask(() => useDaylightSWStore.setState((s) => ({ nonce: s.nonce + 1 }))) }, [owner])

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (project === 'city' && !cityDetailReady(city)) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const rev = modelRevision(towers)
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev, tower: tower.id, presets, facade, ground: project === 'city' ? ground : 0, vtc: project === 'vtc' ? vtcVersion : -1, city: project === 'city' ? cityKey(city) : null })
    const st = useDaylightSWStore.getState()
    if (key === st.key) return
    if (st.out && (st.out.project !== project || st.out.rev !== rev)) useDaylightSWStore.setState({ out: null })
    scheduler.schedule(key, st.key, owner, () => {
      if (!force && !nodeOn(useStore.getState(), DAYLIGHT_SW_NODE)) return
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const model = daylightModelOf(tower, centre, north)
      if (!model.floors.length) {
        runner.stop()
        useDaylightSWStore.setState({ key, status: 'ready', progress: '', out: null, runRev: rev, empty: { project, rev, rules: [noFloorsRule('sw-dl-sda', tower.name, SRC.engine)] } })
        return
      }
      const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, presets.future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
      const meshes = [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)]
      const glazing = glazingOf(presets, facade)
      const job: Omit<DaylightJob, 'id'> = { meshes, futures: obs.futures, north, floors: model.floors, settings: { zones: glazing.zones, vt: glazing.vt, target: presets.target, posX: model.posX, posY: model.posY, period: presets.period } }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, contextLoaded: obs.loaded, unknownHeights: obs.unknownHeights, glazing, presets, north, left: model.left, plates: model.floors, posX: model.posX, posY: model.posY, project, rev }
      useDaylightSWStore.setState({ key, status: 'running', progress: 'Preparing the sky of the typical year…', runRev: rev, out: null, empty: null })
      runner.post(job)
    })
  }, [on, force, towers, project, selected, ground, presets, facadeOn, system, wwr, vlt, shgc, vtcVersion, city.data, city.heights, city.hidden, nonce, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!on) { scheduler.cancel(); runner.stop(); if (useDaylightSWStore.getState().status === 'running') useDaylightSWStore.setState({ status: 'idle', progress: '', key: '' }) } }, [on])

  return { ...state, on }
}
