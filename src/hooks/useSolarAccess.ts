// Solar access for the current design: settings, a debounced run in a Web Worker, and the shared result.
// Several views call this hook; a run starts only when the inputs change, never once per caller.
import { useEffect } from 'react'
import { create } from 'zustand'
import type { VtcContext } from '../context'
import type { MapDate, SolarJobInput, SolarJobOutput } from '../engine/solarJob'
import type { Reading } from '../engine/solarRules'
import { contextOccluders } from '../lib/interchange/converters'
import { useStore, useTowers } from '../store'

export const SOLAR_NODE = 'built.solar-access'

interface SolarState {
  mapDate: MapDate
  view: 'hours' | 'loss'
  showMap: boolean
  /** The team's reading of each space that is not in Table 1 (default: unresolved). */
  readings: Record<string, Reading>
  status: 'idle' | 'running' | 'ready' | 'error'
  error: string
  out: SolarJobOutput | null
  key: string
  set: (p: Partial<Pick<SolarState, 'mapDate' | 'view' | 'showMap' | 'readings'>>) => void
}

export const useSolar = create<SolarState>((set) => ({
  mapDate: 'equinox', view: 'hours', showMap: true, readings: {}, status: 'idle', error: '', out: null, key: '',
  set: (p) => set(p),
}))

// The competition model is local-only; loaded once and shared.
let ctxPromise: Promise<VtcContext | null> | null = null
let ctxValue: VtcContext | null | undefined
const loadCtx = () => (ctxPromise ??= fetch('./local/vtc_context.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((c) => (ctxValue = c)))

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

function run(input: Omit<SolarJobInput, 'ctx' | 'city'>, ctx: VtcContext | null) {
  const w = getWorker()
  const msg: { id: number; input: Omit<SolarJobInput, 'ctx' | 'city'>; ctx?: VtcContext | null; cityBase?: string } = { id: ++seq, input }
  // The worker fetches the Real Vancouver layers itself, relative to the app (base "./").
  if (input.project === 'city') msg.cityBase = new URL('./', document.baseURI).href
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
  const on = useStore((s) => force || !!s.enabled[SOLAR_NODE])
  const { mapDate, readings } = useSolar()
  const state = useSolar()

  useEffect(() => {
    if (!on) return
    let cancelled = false, fired = false
    const geometry = towers.map((t) => [t.id, t.x, t.y, t.rotation, t.width, t.depth, t.height, t.podiumHeight, t.podiumWidth, t.podiumDepth, t.f2f, t.imported?.meshId ?? '', JSON.stringify(t.blocks ?? null)])
    const modelContext = model ? contextOccluders(model) : undefined
    const mkey = model && modelContext?.prisms.length ? `+${model.id}:${modelContext.prisms.length}` : ''
    const key = JSON.stringify({ project, geometry, readings, mapDate, ground: project === 'city' ? ground : 0, mkey })
    if (key === useSolar.getState().key) return
    useSolar.setState({ key })
    clearTimeout(timer)
    timer = setTimeout(() => {
      fired = true
      const go = (ctx: VtcContext | null) => {
        if (cancelled) { if (useSolar.getState().key === key) useSolar.setState({ key: '' }); return }
        run({ project, towers, readings, mapDate, groundElevation: ground, ctxKey: (project === 'city' ? 'city-layers' : ctx ? 'vtc-model' : 'none') + mkey, ...(modelContext?.prisms.length ? { modelContext } : {}) }, project === 'vtc' ? ctx : null)
      }
      if (project === 'vtc' && ctxValue === undefined) loadCtx().then(go)
      else go(project === 'vtc' ? ctxValue ?? null : null)
    }, 250)
    return () => {
      cancelled = true
      // Unmounted before the run started: let the next caller start it.
      if (!fired && useSolar.getState().key === key) { clearTimeout(timer); useSolar.setState({ key: '' }) }
    }
  }, [on, towers, project, mapDate, readings, ground, model])

  return { ...state, on }
}
