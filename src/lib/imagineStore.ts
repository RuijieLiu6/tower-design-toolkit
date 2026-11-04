// Imagine Vancouver state (after Vista v37, Ruijie Liu): loads Vista's per-building zoning table, prepares every Vista
// building against the cone surfaces in chunks (with progress), keeps one result per scenario, and what the model shows.
import { create } from 'zustand'
import type { ConeSurface } from '../engine/heightModel'
import { imagine, prepareImagineAsync, type ImaginePrep, type ImagineResult, type ImagineTable, type Scenario } from '../engine/imagine'
import type { Footprint, FootprintHeights } from './cityLayers'
import { CITY_ORIGIN } from '../store'

/** Vista's imagine_city.json, the source of public/data/vista/imagine_zoning.json (tools/build_vista_imagine.py). */
export const IMAGINE_SOURCE_SHA256 = 'b421660455d34b409e195b26cca55c5597b7b7457a84c24bd6d3a86627be53a6'

interface ImagineState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: number
  error: string | null
  table: ImagineTable | null
  prep: ImaginePrep | null
  /** The data the prep was built on (a new city load or model needs a new prep). */
  basis: object | null
  results: Partial<Record<Scenario, ImagineResult>>
  scenario: Scenario
  /** Draw the comparison on the model. */
  show: boolean
  /** Selected building: a row of the table. */
  selected: number | null
  set: (patch: Partial<Omit<ImagineState, 'set'>>) => void
}
export const useImagine = create<ImagineState>((set) => ({
  status: 'idle', progress: 0, error: null, table: null, prep: null, basis: null, results: {}, scenario: 'views', show: false, selected: null,
  set: (patch) => set(patch),
}))

let tableCache: Promise<ImagineTable> | null = null
function loadTable(): Promise<ImagineTable> {
  tableCache ??= fetch('./data/vista/imagine_zoning.json').then(async (r) => {
    if (!r.ok) throw new Error(`Imagine table: HTTP ${r.status}`)
    const t = (await r.json()) as ImagineTable
    if (t.version !== 1 || t.source?.sha256 !== IMAGINE_SOURCE_SHA256) throw new Error("Imagine table: not built from Vista's published imagine_city.json")
    return t
  })
  tableCache.catch(() => { tableCache = null })
  return tableCache
}

/** Prepare (once per city data) and compute a scenario; later scenarios reuse the prep. */
export async function runImagine(city: { footprints: Footprint[]; heights: FootprintHeights | null }, surfaces: ConeSurface[], scenario: Scenario): Promise<void> {
  const s = useImagine.getState()
  if (s.status === 'loading') return
  if (!city.heights) { s.set({ status: 'error', error: 'The buildings have no heights yet.' }); return }
  let prep = s.basis === city.heights ? s.prep : null
  if (!prep) {
    s.set({ status: 'loading', progress: 0, error: null, results: {}, prep: null })
    try {
      const table = await loadTable()
      prep = await prepareImagineAsync(table, { footprints: city.footprints, ground: city.heights.ground, roof: city.heights.roof }, surfaces, CITY_ORIGIN, (progress) => useImagine.setState({ progress }))
      useImagine.setState({ table, prep, basis: city.heights })
    } catch (e) { useImagine.setState({ status: 'error', error: (e as Error).message }); return }
  }
  const results = { ...useImagine.getState().results }
  results[scenario] ??= imagine(prep, scenario)
  useImagine.setState({ status: 'ready', progress: 1, results, scenario })
}
