// Solar access for the current design: settings, a debounced run in a Web Worker, and the shared result.
// Several views call this hook; a run starts only when the inputs change, never once per caller.
import { useEffect } from 'react'
import { create } from 'zustand'
import type { VtcContext } from '../context'
import type { MapBounds, MapDate, SolarJobInput, SolarJobOutput } from '../engine/solarJob'
import type { Reading } from '../engine/solarRules'
import { contextOccluders } from '../lib/interchange/converters'
import { useCityModel, type CityModel } from '../lib/cityModel'
import { loadVtcContext, useVtcSource } from '../lib/vtcContextSource'
import { useStore, useTowers } from '../store'

export const SOLAR_NODE = 'built.solar-access'

interface SolarState {
  mapDate: MapDate
  view: 'hours' | 'loss'
  showMap: boolean
  /** The team's reading of each space that is not in Table 1 (default: unresolved). */
  readings: Record<string, Reading>
  /**
   * The sun-hours map's area per project when the user has set it (Ruijie, 4 Nov: placing a building makes a simulation
   * area; "add a function to modify the boundary"); absent, the automatic 1,280 m square around the tower. This browser
   * session only (not in the project file).
   */
  areas: Partial<Record<'vtc' | 'city', MapBounds>>
  /** The boundary's handles are on the map (components/SolarArea.tsx). */
  editing: boolean
  status: 'idle' | 'running' | 'ready' | 'error'
  error: string
  out: SolarJobOutput | null
  key: string
  set: (p: Partial<Pick<SolarState, 'mapDate' | 'view' | 'showMap' | 'readings' | 'areas' | 'editing'>>) => void
}

export const useSolar = create<SolarState>((set) => ({
  mapDate: 'equinox', view: 'hours', showMap: true, readings: {}, areas: {}, editing: false, status: 'idle', error: '', out: null, key: '',
  set: (p) => set(p),
}))

let worker: Worker | null = null
let seq = 0
let sentCtx: VtcContext | null | undefined
let timer: ReturnType<typeof setTimeout> | undefined

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/solarWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; out?: SolarJobOutput; error?: string }>) => {
      if (e.data.id !== seq) return // a newer run is on its way
      if (e.data.error) useSolar.setState({ status: 'error', error: e.data.error })
      else useSolar.setState({ status: 'ready', out: e.data.out!, error: '' })
    }
    worker.onerror = (e) => useSolar.setState({ status: 'error', error: e.message || 'The solar worker failed to start' })
  }
  return worker
}

function run(input: Omit<SolarJobInput, 'ctx' | 'city'>, ctx: VtcContext | null, cityModel: CityModel) {
  const w = getWorker()
  const msg: { id: number; input: Omit<SolarJobInput, 'ctx' | 'city'>; ctx?: VtcContext | null; cityBase?: string; cityModel?: CityModel } = { id: ++seq, input }
  // The worker fetches the Real Vancouver layers itself, relative to the app (base "./"), for the buildings model shown.
  if (input.project === 'city') { msg.cityBase = new URL('./', document.baseURI).href; msg.cityModel = cityModel }
  if (ctx !== sentCtx) { msg.ctx = ctx; sentCtx = ctx }
  useSolar.setState({ status: 'running' })
  w.postMessage(msg)
}

/** Live solar-access result while the node is switched on (or while `force`, e.g. the node sits on the Customize canvas). */
export function useSolarAccess(force = false) {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const ground = useStore((s) => s.groundElevation)
  // Existing buildings from an uploaded model join the baseline (lib/interchange, converter 3).
  const model = useStore((s) => s.models[s.project])
  const cityModel = useCityModel((s) => s.model)
  const on = useStore((s) => force || !!s.enabled[SOLAR_NODE])
  const { mapDate, readings } = useSolar()
  const area = useSolar((s) => s.areas[project])
  const state = useSolar()
  // The competition context (the entrant's own copy of the base model, kept in this browser): -1 until it has loaded (or
  // is known missing), then its version, so the map runs once on load and again when a copy is added or removed.
  const vtcVersion = useVtcSource((s) => (s.status === 'idle' || s.status === 'loading' ? -1 : s.version))

  useEffect(() => {
    if (!on) return
    if (project === 'vtc' && vtcVersion < 0) { void loadVtcContext(); return }
    let cancelled = false, fired = false
    const geometry = towers.map((t) => [t.id, t.x, t.y, t.rotation, t.width, t.depth, t.height, t.podiumHeight, t.podiumWidth, t.podiumDepth, t.f2f, t.imported?.meshId ?? '', JSON.stringify(t.blocks ?? null)])
    const modelContext = model ? contextOccluders(model) : undefined
    const mkey = model && modelContext?.prisms.length ? `+${model.id}:${modelContext.prisms.length}` : ''
    const key = JSON.stringify({ project, geometry, readings, mapDate, area: area ?? null, ground: project === 'city' ? ground : 0, mkey, cityModel: project === 'city' ? cityModel : '', vtc: project === 'vtc' ? vtcVersion : 0 })
    if (key === useSolar.getState().key) return
    useSolar.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      fired = true
      const go = (ctx: VtcContext | null) => {
        if (cancelled) { if (useSolar.getState().key === key) useSolar.setState({ key: '' }); return }
        run({ project, towers, readings, mapDate, ...(area ? { bounds: area } : {}), groundElevation: ground, ctxKey: (project === 'city' ? `city-layers:${cityModel}` : ctx ? `vtc-model:${vtcVersion}` : 'none') + mkey, ...(modelContext?.prisms.length ? { modelContext } : {}) }, project === 'vtc' ? ctx : null, cityModel)
      }
      go(project === 'vtc' ? useVtcSource.getState().ctx : null)
    }, 250)
    return () => {
      cancelled = true
      // Unmounted before the run started: let the next caller start it.
      if (!fired && useSolar.getState().key === key) { clearTimeout(timer); useSolar.setState({ key: '' }) }
    }
  }, [on, towers, project, mapDate, readings, area, ground, model, cityModel, vtcVersion])

  return { ...state, on }
}
