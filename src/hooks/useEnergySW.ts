// Energy use: TEUI / TEDI / GHGI (Sun & Wind Studio port, engine 4): the node's presets, a debounced run in a Web Worker,
// and the shared result with its evidence lines. Several views call this hook; a run starts only when the inputs change.
import { useEffect } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { DEFAULT_TARGET } from '../engine/daylightSW'
import { DEFAULT_DAYLIGHT_PRESETS, glazingOf, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { EnergyResult } from '../engine/energySW'
import { DEFAULT_ENERGY_PRESETS, energyModelOf, energyRules, type EnergyPresets } from '../engine/energySWInput'
import type { RuleResult } from '../engine/types'
import { cityObstacles, towerObstacles, vtcObstacles } from '../engine/windComfortInput'
import type { EnergyJob, EnergyJobOut } from '../workers/energyWorker'
import { useCityObstacles } from '../components/CityContext'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { loadVtcContext, useVtcSource } from '../lib/vtcContextSource'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'

export const ENERGY_SW_NODE = 'built.energy-sw'
const KEY = 'ts.energySW'

export interface EnergySWOut { result: EnergyResult; rules: RuleResult[]; levels: number[]; towerId: string; towerName: string; glazing: GlazingChoice; presets: EnergyPresets; north: number; dimmed: boolean }
interface EnergySWState {
  presets: EnergyPresets
  status: 'idle' | 'running' | 'ready' | 'error'
  progress: string
  error: string
  out: EnergySWOut | null
  runRev: string | null
  outRev: string | null
  key: string
  set: (p: Partial<EnergyPresets>) => void
  reset: () => void
}
function readPresets(): EnergyPresets {
  try { return { ...DEFAULT_ENERGY_PRESETS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<EnergyPresets>) } } catch { return { ...DEFAULT_ENERGY_PRESETS } }
}
export const useEnergySWStore = create<EnergySWState>((set) => ({
  presets: readPresets(), status: 'idle', progress: '', error: '', out: null, runRev: null, outRev: null, key: '',
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_ENERGY_PRESETS } } }),
}))

let worker: Worker | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
let pendingMeta: Omit<EnergySWOut, 'result' | 'rules'> | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/energyWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<EnergyJobOut>) => {
      if (e.data.id !== seq) return
      if (e.data.progress) { useEnergySWStore.setState({ progress: e.data.progress }); return }
      if (e.data.error || !e.data.result || !pendingMeta) { useEnergySWStore.setState({ status: 'error', error: e.data.error ?? 'No result', progress: '' }); return }
      const m = pendingMeta
      const rules = energyRules({ result: e.data.result, presets: m.presets, glazing: m.glazing, towerName: m.towerName, dimmed: m.dimmed })
      useEnergySWStore.setState((s) => ({ status: 'ready', error: '', progress: '', out: { ...m, result: e.data.result!, rules }, outRev: s.runRev }))
    }
    worker.onerror = (e) => useEnergySWStore.setState({ status: 'error', error: e.message || 'The energy worker failed to start', progress: '' })
  }
  return worker
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
  const state = useEnergySWStore()
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))
  const city = useCityObstacles()
  const cityReady = project === 'city' ? !!city.data : true

  useEffect(() => {
    if (!on || towers.length === 0) return
    if (presets.dimming && project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    if (presets.dimming && !cityReady) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev: modelRevision(towers), tower: tower.id, presets, facade, ground: project === 'city' ? ground : 0, vtc: presets.dimming && project === 'vtc' ? vtcVersion : -1, hidden: project === 'city' ? city.hidden.size : 0 })
    if (key === useEnergySWStore.getState().key) return
    useEnergySWStore.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const centre: P = project === 'vtc' ? [0, 0] : [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const glazing = glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, glazing: presets.glazing }, facade)
      const model = energyModelOf(tower, centre, north, glazing)
      const { dimming, glazing: _g, north: _n, future, ...settings } = presets
      let dim: EnergyJob['dimming'] = null
      if (dimming) {
        const obs = project === 'vtc' ? vtcObstacles(useVtcSource.getState().ctx, future) : cityObstacles(city.data?.footprints ?? [], city.heights, city.hidden, centre, ground)
        dim = { plates: model.plates, meshes: [...obs.meshes, ...towerObstacles(towers.filter((t) => t.id !== tower.id), centre)], futures: obs.futures, north,
          settings: { zones: glazing.zones, vt: glazing.vt, target: DEFAULT_TARGET, posX: model.posX, posY: model.posY, period: { from: '01-01', to: '12-31' } } }
      }
      const job: EnergyJob = { id: ++seq, floors: model.floors, settings, dimming: dim }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, glazing, presets, north, dimmed: dimming }
      useEnergySWStore.setState({ status: 'running', progress: dimming ? 'Daylight for dimming…' : 'Hour by hour over the year…', runRev: modelRevision(towers) })
      getWorker().postMessage(job)
    }, 400)
  }, [on, towers, project, selected, ground, presets, facadeOn, system, wwr, vlt, shgc, vtcVersion, city.data, city.heights, city.hidden, cityReady])

  return { ...state, on }
}
