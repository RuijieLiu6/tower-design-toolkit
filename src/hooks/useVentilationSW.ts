// Natural ventilation potential (Sun & Wind Studio port, engine 3): the node's presets, a debounced run in a Web Worker,
// and the shared result with its evidence lines. Several views call this hook; a run starts only when the inputs change.
// After the 17 Nov review (as wind comfort and daylight): results carry their project and model and are read only when
// current; a new run stops one in flight; a tower with no floor to analyse posts no job and reports one unknown line.
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { periodInfo } from '../engine/daylightSW'
import { daylightModelOf, DEFAULT_DAYLIGHT_PRESETS, glazingOf, noFloorsRule, type GlazingChoice, type P } from '../engine/daylightSWInput'
import type { RuleResult } from '../engine/types'
import type { VentQuick, VentResult } from '../engine/ventilationSW'
import { DEFAULT_VENT_PRESETS, operableZones, readingsOf, SRC, ventRules, type VentilationPresets, type VentReadings } from '../engine/ventilationSWInput'
import type { VentJob, VentJobOut } from '../workers/ventilationWorker'
import { nodeOn } from '../lib/analysis'
import { useFacadeStore } from '../lib/facadeStore'
import { isCurrent, runScheduler, workerRunner } from '../lib/sunWindRun'
import { modelRevision } from '../lib/workflow/phasePackage'
import { useStore, useTowers } from '../store'

export const VENTILATION_SW_NODE = 'built.ventilation-sw'
const KEY = 'ts.ventilationSW'

export interface VentilationSWOut {
  vent: VentResult
  quick: VentQuick
  readings: VentReadings
  rules: RuleResult[]
  /** Toolkit level of each analysed floor, by position: labels only. */
  levels: number[]
  towerId: string
  towerName: string
  glazing: GlazingChoice
  presets: VentilationPresets
  north: number
  project: string
  rev: string
}
export interface VentilationEmpty { project: string; rev: string; rules: RuleResult[] }
interface VentilationSWState {
  presets: VentilationPresets
  status: 'idle' | 'running' | 'ready' | 'error'
  error: string
  out: VentilationSWOut | null
  empty: VentilationEmpty | null
  runRev: string | null
  outRev: string | null
  key: string
  nonce: number
  set: (p: Partial<VentilationPresets>) => void
  reset: () => void
}
function readPresets(): VentilationPresets {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VentilationPresets>; return { ...DEFAULT_VENT_PRESETS, ...s, operable: { ...DEFAULT_VENT_PRESETS.operable, ...(s.operable ?? {}) } } } catch { return { ...DEFAULT_VENT_PRESETS } }
}
export const useVentilationSWStore = create<VentilationSWState>((set) => ({
  presets: readPresets(), status: 'idle', error: '', out: null, empty: null, runRev: null, outRev: null, key: '', nonce: 0,
  set: (p) => set((s) => { const presets = { ...s.presets, ...p }; try { localStorage.setItem(KEY, JSON.stringify(presets)) } catch { /* this visit only */ } return { presets } }),
  reset: () => set(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return { presets: { ...DEFAULT_VENT_PRESETS } } }),
}))

let pendingMeta: (Omit<VentilationSWOut, 'vent' | 'quick' | 'readings' | 'rules'> & { left: number }) | null = null
const runner = workerRunner<VentJobOut>(() => new Worker(new URL('../workers/ventilationWorker.ts', import.meta.url), { type: 'module' }), {
  message: (d) => {
    if (d.error || !d.vent || !d.quick || !pendingMeta) { useVentilationSWStore.setState({ status: 'error', error: d.error ?? 'No result', out: null }); return true }
    const m = pendingMeta
    const readings = readingsOf(d.vent, d.quick)
    const period = periodInfo(m.presets.period, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]).label
    const rules = ventRules({ readings, presets: m.presets, glazing: m.glazing, towerName: m.towerName, period, levels: m.levels, left: m.left })
    useVentilationSWStore.setState((s) => ({ status: 'ready', error: '', out: { ...m, vent: d.vent!, quick: d.quick!, readings, rules }, outRev: s.runRev }))
    return true
  },
  error: (msg) => useVentilationSWStore.setState({ status: 'error', error: msg, out: null }),
})
const scheduler = runScheduler()

/** The result only when it belongs to the project and model on screen and no rerun or failure is pending. */
export function useVentilationSWCurrent(): VentilationSWOut | null {
  const out = useVentilationSWStore((s) => s.out)
  const status = useVentilationSWStore((s) => s.status)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  return isCurrent(out, status, project, rev) ? out : null
}
/** The lines to record: the current result's, or the "no floors" line when that is what this model gave. */
export function useVentilationSWLines(): RuleResult[] | null {
  const out = useVentilationSWCurrent()
  const empty = useVentilationSWStore((s) => s.empty)
  const project = useStore((s) => s.project)
  const rev = modelRevision(useTowers())
  if (out) return out.rules
  return empty && empty.project === project && empty.rev === rev ? empty.rules : null
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
  const nonce = useVentilationSWStore((s) => s.nonce)
  const state = useVentilationSWStore()
  const owner = useMemo(() => Symbol('ventilation-sw'), [])
  useEffect(() => () => { if (scheduler.release(owner)) queueMicrotask(() => useVentilationSWStore.setState((s) => ({ nonce: s.nonce + 1 }))) }, [owner])

  useEffect(() => {
    if (!on || towers.length === 0) return
    const tower = towers.find((t) => t.id === selected) ?? towers[0]
    const rev = modelRevision(towers)
    const facade = facadeOn ? { system, wwr, vlt, shgc, treated: null, vegetation: 0 } : null
    const key = JSON.stringify({ project, rev, tower: tower.id, presets, facade })
    const st = useVentilationSWStore.getState()
    if (key === st.key) return
    if (st.out && (st.out.project !== project || st.out.rev !== rev)) useVentilationSWStore.setState({ out: null })
    scheduler.schedule(key, st.key, owner, () => {
      if (!force && !nodeOn(useStore.getState(), VENTILATION_SW_NODE)) return
      const centre: P = [tower.x, tower.y]
      const north = presets.north === 'true' ? (project === 'vtc' ? VTC_NORTH_DEG : 0) : 0
      const model = daylightModelOf(tower, centre, north)
      if (!model.floors.length) {
        runner.stop()
        useVentilationSWStore.setState({ key, status: 'ready', out: null, runRev: rev, empty: { project, rev, rules: [noFloorsRule('sw-vt-openable', tower.name, SRC.engine)] } })
        return
      }
      const glazing = glazingOf({ ...DEFAULT_DAYLIGHT_PRESETS, glazing: presets.glazing }, facade)
      const zones = operableZones(glazing.zones, presets)
      const { operable: _o, glazing: _g, period, north: _n, ...vent } = presets
      const job: Omit<VentJob, 'id'> = { floors: model.floors, zones, vent, period, height: tower.height, posX: model.posX, posY: model.posY }
      pendingMeta = { levels: model.levels, towerId: tower.id, towerName: tower.name, glazing, presets, north, left: model.left, project, rev }
      useVentilationSWStore.setState({ key, status: 'running', runRev: rev, out: null, empty: null })
      runner.post(job)
    })
  }, [on, force, towers, project, selected, presets, facadeOn, system, wwr, vlt, shgc, nonce, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!on) { scheduler.cancel(); runner.stop(); if (useVentilationSWStore.getState().status === 'running') useVentilationSWStore.setState({ status: 'idle', key: '' }) } }, [on])

  return { ...state, on }
}
