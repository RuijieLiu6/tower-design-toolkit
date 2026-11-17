// Energy use: TEUI / TEDI / GHGI (Sun & Wind Studio port, engine 4): the node's presets, a debounced run in a Web Worker,
// and the shared result with its evidence lines. Several views call this hook; a run starts only when the inputs change.
// After the 17 Nov review (as the other three ports): results carry their project and model and are read only when
// current; a new run stops one in flight; on Real Vancouver daylight dimming waits for the detailed City buildings and
// reruns when they change, and the City data loads only there; a tower with no floor posts no job, one unknown line.
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { DEFAULT_TARGET } from '../engine/daylightSW'
import { DEFAULT_DAYLIGHT_PRESETS, glazingOf, noFloorsRule, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { EnergyResult } from '../engine/energySW'
import { DEFAULT_ENERGY_PRESETS, energyModelOf, energyRules, SRC, type EnergyPresets } from '../engine/energySWInput'
import type { RuleResult } from '../engine/types'
import { cityObstacles, towerObstacles, vtcObstacles } from '../engine/windComfortInput'
import type { EnergyJob, EnergyJobOut } from '../workers/energyWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { cityDetailReady, cityKey, isCurrent, runScheduler, workerRunner } from '../lib/sunWindRun'
import { loadVtcContext, useVtcSource } from '../lib/vtcContextSource'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'

export const ENERGY_SW_NODE = 'built.energy-sw'
const KEY = 'ts.energySW'

export interface EnergySWOut { result: EnergyResult; rules: RuleResult[]; levels: number[]; towerId: string; towerName: string; glazing: GlazingChoice; presets: EnergyPresets; north: number; dimmed: boolean; project: string; rev: string }
export interface EnergyEmpty { project: string; rev: string; rules: RuleResult[] }
interface EnergySWState {
  presets: EnergyPresets
  status: 'idle' | 'running' | 'ready' | 'error'
  progress: string
  error: string
  out: EnergySWOut | null
  empty: EnergyEmpty | null
  runRev: string | null
  outRev: string | null
  key: string
  nonce: number
  set: (p: Partial<EnergyPresets>) => void
  reset: () => void
}
function readPresets(): EnergyPresets {
  try { return { ...DEFAULT_ENERGY_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<EnergyPresets>) } } catch { return { ...DEFAULT_ENERGY_PRESETS } }
}
export const useEnergySWStore = create<EnergySWState>((set) => ({
  presets: readPresets(), status: 'idle', progress: '', error: '', out: null, empty: null, runRev: null, outRev: null, key: '', nonce: 0,
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_ENERGY_PRESETS } } }),
}))

let pendingMeta: Omit<EnergySWOut, 'result' | 'rules'> | null = null
const runner = workerRunner<EnergyJobOut>(() => new Worker(new URL('../workers/energyWorker.ts', import.meta.url), { type: 'module' }), {
  message: (d) => {
    if (d.progress) { useEnergySWStore.setState({ progress: d.progress }); return false }
    if (d.error || !d.result || !pendingMeta) { useEnergySWStore.setState({ status: 'error', error: d.error ?? 'No result', progress: '', out: null }); return true }
    const m = pendingMeta
    const rules = energyRules({ result: d.result, presets: m.presets, glazing: m.glazing, towerName: m.towerName, dimmed: m.dimmed })
    useEnergySWStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...m, result: d.result!, rules }, outRev: s.runRev }))
    return true
  },
  error: (msg) => useEnergySWStore.setState({ status: 'error', error: msg, progress: '', out: null }),
})
const scheduler = runScheduler()

/** The result only when it belongs to the project and model on screen and no rerun or failure is pending. */
export function useEnergySWCurrent(): EnergySWOut | null {
  const out = useEnergySWStore((s) => s.out)
  const status = useEnergySWStore((s) => s.status)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  return isCurrent(out, status, project, rev) ? out : null
}
/** The lines to record: the current result's, or the "no floors" line when that is what this model gave. */
export function useEnergySWLines(): RuleResult[] | null {
  const out = useEnergySWCurrent()
  const empty = useEnergySWStore((s) => s.empty)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  if (out) return out.rules
  return empty && empty.project === project && empty.rev === rev ? empty.rules : null
}

/** Live energy result while the node is on (or `force`, e.g. on the Customize canvas). */
export function useEnergySW(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const on = useStore((s) => force || nodeOn(s, ENERGY_SW_NODE))
  const facadeOn = useStore((s) => nodeOn(s, 'built.facade'))
  const { system, wwr, vlt, shgc } = useFacadeStore()
  const presets = useEnergySWStore((s) => s.presets)
  const nonce = useEnergySWStore((s) => s.nonce)
  const state = useEnergySWStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  // The City buildings matter here only for daylight dimming on Real Vancouver.
  const city = useCityObstacles(on && presets.dimming && project === 'city')
  const owner = useMemo(() => Symbol('energy-sw'), [])
  useEffect(() => () => { if (scheduler.release(owner)) queueMicrotask(() => useEnergySWStore.setState((s) => ({ nonce: s.nonce + 1 }))) }, [owner])

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (presets.dimming && project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (presets.dimming && project === 'city' && !cityDetailReady(city)) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const rev = modelRevision(towers)
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev, tower: tower.id, presets, facade, ground: project === 'city' ? ground : 0, vtc: presets.dimming && project === 'vtc' ? vtcVersion : -1, city: presets.dimming && project === 'city' ? cityKey(city) : null })
    const st = useEnergySWStore.getState()
    if (key === st.key) return
    if (st.out && (st.out.project !== project || st.out.rev !== rev)) useEnergySWStore.setState({ out: null })
    scheduler.schedule(key, st.key, owner, () => {
      if (!force && !nodeOn(useStore.getState(), ENERGY_SW_NODE)) return
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const glazing = glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, glazing: presets.glazing }, facade)
      const model = energyModelOf(tower, centre, north, glazing)
      if (!model.floors.length) {
        runner.stop()
        useEnergySWStore.setState({ key, status: 'ready', progress: '', out: null, runRev: rev, empty: { project, rev, rules: [noFloorsRule('sw-en-teui', tower.name, SRC.engine)] } })
        return
      }
      const { dimming, glazing: _g, north: _n, future, ...settings } = presets
      let dim: EnergyJob['dimming'] = null
      if (dimming) {
        const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
        dim = { plates: model.plates, meshes: [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)], futures: obs.futures, north,
          settings: { zones: glazing.zones, vt: glazing.vt, target: DEFAULT_TARGET, posX: model.posX, posY: model.posY, period: { from: '01-01', to: '12-31' } } }
      }
      const job: Omit<EnergyJob, 'id'> = { floors: model.floors, settings, dimming: dim }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, glazing, presets, north, dimmed: dimming, project, rev }
      useEnergySWStore.setState({ key, status: 'running', progress: dimming ? 'Daylight for dimming…' : 'Hour by hour over the year…', runRev: rev, out: null, empty: null })
      runner.post(job)
    })
  }, [on, force, towers, project, selected, ground, presets, facadeOn, system, wwr, vlt, shgc, vtcVersion, city.data, city.heights, city.hidden, nonce, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!on) { scheduler.cancel(); runner.stop(); if (useEnergySWStore.getState().status === 'running') useEnergySWStore.setState({ status: 'idle', progress: '', key: '' }) } }, [on])

  return { ...state, on }
}
