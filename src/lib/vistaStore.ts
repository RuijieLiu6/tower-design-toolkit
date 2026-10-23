// Vista node state (Real Vancouver): what-if study planes (Vista v10) and view settings, kept in this browser
// (localStorage `ts.vista`, wrapped: storage may be blocked), plus the in-canvas capture queue for the PDF report.
import { create } from 'zustand'

/** One what-if plane per cone. Blank numbers mean "not entered": the cone then stays "no plane" (Vista: unknown). */
export interface WhatIfPlane {
  /** Elevation of the lower boundary at the City origin (CGVD28 m). */
  elevation: number | null
  /** Slope of the lower boundary along the bearing (degrees; 0 = horizontal). */
  pitch: number | null
  /** Bearing of the slope, degrees clockwise from grid north (prefilled with the cone axis). */
  bearing: number | null
  /** Where the user's numbers come from (a City sheet, a guess, a classmate). */
  note: string
}

/** One render from a fixed eye (a protected-view origin), for the report. Local frame (EPSG:26910 minus the City origin). */
export interface CaptureSpec { key: string; x: number; y: number; eye: number; bearing: number; hfov: number; pitch: number; aspect: number }
export interface CaptureJob { id: number; specs: CaptureSpec[]; resolve: (shots: (string | null)[]) => void }

interface VistaState {
  planes: Record<string, WhatIfPlane>
  /** Draw the what-if planes over the footprint in 3D. */
  showPlanes: boolean
  /** Light atmospheric haze in eye-level views (visual only; off = evidence view, no fog). */
  haze: boolean
  job: CaptureJob | null
  set: (patch: Partial<Omit<VistaState, 'set' | 'setPlane'>>) => void
  setPlane: (cone: string, patch: Partial<WhatIfPlane> | null) => void
}

const KEY = 'ts.vista'
function load(): Pick<VistaState, 'planes' | 'showPlanes' | 'haze'> {
  const empty = { planes: {}, showPlanes: true, haze: false }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const d = JSON.parse(raw) as Partial<VistaState>
    const planes: Record<string, WhatIfPlane> = {}
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    for (const [k, p] of Object.entries(d.planes ?? {})) planes[k] = { elevation: n(p?.elevation), pitch: n(p?.pitch), bearing: n(p?.bearing), note: String(p?.note ?? '').slice(0, 300) }
    return { planes, showPlanes: d.showPlanes !== false, haze: d.haze === true }
  } catch { return empty }
}
function save(s: Pick<VistaState, 'planes' | 'showPlanes' | 'haze'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ planes: s.planes, showPlanes: s.showPlanes, haze: s.haze })) } catch { /* storage blocked: session only */ }
}

export const useVistaStore = create<VistaState>((set, get) => ({
  ...load(),
  job: null,
  set: (patch) => { set(patch); if ('planes' in patch || 'showPlanes' in patch || 'haze' in patch) save(get()) },
  setPlane: (cone, patch) => {
    const planes = { ...get().planes }
    if (patch === null) delete planes[cone]
    else planes[cone] = { ...(planes[cone] ?? { elevation: null, pitch: null, bearing: null, note: '' }), ...patch }
    set({ planes }); save(get())
  },
}))

let jobId = 0
/** Ask the 3D view (VistaRig inside CityScene) to render these eyes; resolves with JPEG data URLs (null if it could not). */
export function requestCaptures(specs: CaptureSpec[], timeoutMs = 20000): Promise<(string | null)[]> {
  return new Promise((resolve) => {
    if (!specs.length) { resolve([]); return }
    const id = ++jobId
    const timer = setTimeout(() => { if (useVistaStore.getState().job?.id === id) useVistaStore.setState({ job: null }); resolve(specs.map(() => null)) }, timeoutMs)
    useVistaStore.setState({ job: { id, specs, resolve: (shots) => { clearTimeout(timer); resolve(shots) } } })
  })
}
