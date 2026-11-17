// Runs the daylight study (engine/daylightSW.ts, Sinnie Choi's engine) off the main thread: the hourly sky of the typical
// year and a tower of floors take a second or more. The hourly climate is bundled here only (src/data/sunWindHourly.json),
// so the main bundle does not carry it. Floors and zones arrive prepared (engine/daylightSWInput.ts); progress per floor.
import hourly from '../data/sunWindHourly.json'
import { aseTower, daylightTower, newCache, prep, type AseTower, type DlFloor, type DlSettings, type DlTower, type HourlyClimate, type SkyPrep } from '../engine/daylightSW'
import { buildingsToHer } from '../engine/daylightSWInput'
import { siteRaster, type FutureBox, type ObstacleMesh } from '../engine/windComfort'

export interface DaylightJob { id: number; meshes: ObstacleMesh[]; futures: FutureBox[] | null; north: number; floors: DlFloor[]; settings: Omit<DlSettings, 'bld'> }
export interface DaylightJobOut { id: number; tower?: DlTower; ase?: AseTower; days?: number[]; error?: string; progress?: { stage: 'daylight' | 'ase'; i: number; n: number } }

const post = (msg: DaylightJobOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)
let P: SkyPrep | null = null

self.onmessage = (e: MessageEvent<DaylightJob>) => {
  const job = e.data
  try {
    P ??= prep(hourly as unknown as HourlyClimate)
    const bld = buildingsToHer(siteRaster(job.meshes, job.futures).bld, job.north)
    const s: DlSettings = { ...job.settings, bld }
    const cache = newCache()
    const tower = daylightTower(P, job.floors, s, cache, (i, n) => post({ id: job.id, progress: { stage: 'daylight', i, n } }))
    const ase = aseTower(P, job.floors, s, hourly.days, cache, (i, n) => post({ id: job.id, progress: { stage: 'ase', i, n } }))
    const transfer: Transferable[] = []
    for (const p of tower.plans) transfer.push(p.df.buffer, p.da.buffer)
    for (const p of ase.plans) transfer.push(p.hrs.buffer)
    post({ id: job.id, tower, ase, days: hourly.days }, transfer)
  } catch (err) {
    post({ id: job.id, error: (err as Error).message })
  }
}
