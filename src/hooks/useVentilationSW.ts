// Natural ventilation potential (Sun & Wind Studio port, engine 3): the node's presets, a debounced run in a Web Worker,
// and the shared result with its evidence lines. Several views call this hook; a run starts only when the inputs change.
import { useEffect } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { daylightModelOf, DEFAULT_DAYLIGHT_PRESETS, glazingOf, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { RuleResult } from '../engine/types'
import type { VentQuick, VentResult } from '../engine/ventilationSW'
import { DEFAULT_VENT_PRESETS, operableZones, readingsOf, ventRules, type VentilationPresets, type VentReadings } from '../engine/ventilationSWInput'
import type { VentJob, VentJobOut } from '../workers/ventilationWorker'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'
import { periodInfo } from '../engine/daylightSW'

export const VENTILATION_SW_NODE = 'built.ventilation-sw'
const KEY = 'ts.ventilationSW'

export interface VentilationSWOut {
  vent: VentResult
  quick: VentQuick
  readings: VentReadings
  rules: RuleResult[]
  levels: number[]
  towerId: string
  towerName: string
  glazing: GlazingChoice
  presets: VentilationPresets
  north: number
}
interface VentilationSWState {
  presets: VentilationPresets
  status: 'idle' | 'running' | 'ready' | 'error'
  error: string
  out: VentilationSWOut | null
  runRev: string | null
  outRev: string | null
  key: string
  set: (p: Partial<VentilationPresets>) => void
  reset: () => void
}
function readPresets(): VentilationPresets {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VentilationPresets>; return { ...DEFAULT_VENT_PRESETS, ...s, operable: { ...DEFAULT_VENT_PRESETS.operable, ...(s.operable ?? {}) } } } catch { return { ...DEFAULT_VENT_PRESETS } }
}
export const useVentilationSWStore = create<VentilationSWState>((set) => ({
  presets: readPresets(), status: 'idle', error: '', out: null, runRev: null, outRev: null, key: '',
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_VENT_PRESETS } } }),
}))

let worker: Worker | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
let pendingMeta: (Omit<VentilationSWOut, 'vent' | 'quick' | 'readings' | 'rules'> & { left: number }) | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/ventilationWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<VentJobOut>) => {
      if (e.data.id !== seq) return
      if (e.data.error || !e.data.vent || !e.data.quick || !pendingMeta) { useVentilationSWStore.setState({ status: 'error', error: e.data.error ?? 'No result' }); return }
      const m = pendingMeta
      const readings = readingsOf(e.data.vent, e.data.quick)
      const period = periodInfo(m.presets.period, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]).label
      const rules = ventRules({ readings, presets: m.presets, glazing: m.glazing, towerName: m.towerName, period, levels: m.levels, left: m.left })
      useVentilationSWStore.setState((s) => ({ status: 'ready', error: '', out: { ...m, vent: e.data.vent!, quick: e.data.quick!, readings, rules }, outRev: s.runRev }))
    }
    worker.onerror = (e) => useVentilationSWStore.setState({ status: 'error', error: e.message || 'The ventilation worker failed to start' })
  }
  return worker
}

/** Live ventilation result while the node is on (or `force`, e.g. on the Customize canvas). */
export function useVentilationSW(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const selected = useStore((s) => s.selectedTower)
  const on = useStore((s) => force || nodeOn(s, VENTILATION_SW_NODE))
  const facadeOn = useStore((s) => nodeOn(s, 'built.facade'))
  const { system, wwr, vlt, shgc } = useFacadeStore()
  const presets = useVentilationSWStore((s) => s.presets)
  const state = useVentilationSWStore()

  useEffect(() => {
    if (!on || towers.length === 0) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev: modelRevision(towers), tower: tower.id, presets, facade })
    if (key === useVentilationSWStore.getState().key) return
    useVentilationSWStore.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const centre: P = [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const model = daylightModelOf(tower, centre, north)
      const glazing = glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, glazing: presets.glazing }, facade)
      const zones = operableZones(glazing.zones, presets)
      const { operable: _o, glazing: _g, period, north: _n, ...vent } = presets
      const job: VentJob = { id: ++seq, floors: model.floors, zones, vent, period, height: tower.height, posX: model.posX, posY: model.posY }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, glazing, presets, north, left: model.left }
      useVentilationSWStore.setState({ status: 'running', runRev: modelRevision(towers) })
      getWorker().postMessage(job)
    }, 400)
  }, [on, towers, project, selected, presets, facadeOn, system, wwr, vlt, shgc])

  return { ...state, on }
}
