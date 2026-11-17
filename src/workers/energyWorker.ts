// Runs the energy study (engine/energySW.ts, Sinnie Choi's engine) off the main thread: 8,760 hours per program zone, and,
// for daylight dimming, the daylight port over every floor first (a few seconds for a tall tower). The hourly climate is
// bundled here only (src/data/sunWindHourly.json); floors, plates and glazing arrive prepared (engine/energySWInput.ts).
import hourly from '../data/sunWindHourly.json'
import { daylightTower, newCache, prep, type DlFloor, type DlSettings, type HourlyClimate, type SkyPrep } from '../engine/daylightSW'
import { buildingsToHer } from '../engine/daylightSWInput'
import { energyHourly, type EnergyFloor, type EnergyResult, type EnergySettings } from '../engine/energySW'
import { siteRaster, type FutureBox, type ObstacleMesh } from '../engine/windComfort'

export interface EnergyJob { id: number; floors: EnergyFloor[]; settings: EnergySettings; dimming: { plates: DlFloor[]; meshes: ObstacleMesh[]; futures: FutureBox[] | null; north: number; settings: Omit<DlSettings, 'bld'> } | null }
export interface EnergyJobOut { id: number; result?: EnergyResult; error?: string; progress?: string }

const post = (msg: EnergyJobOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)
let P: SkyPrep | null = null

self.onmessage = (e: MessageEvent<EnergyJob>) => {
  const job = e.data
  try {
    P ??= prep(hourly as unknown as HourlyClimate)
    let dsf: number[][] | null = null
    if (job.dimming) {
      const d = job.dimming
      const s: DlSettings = { ...d.settings, bld: buildingsToHer(siteRaster(d.meshes, d.futures).bld, d.north) }
      dsf = daylightTower(P, d.plates, s, newCache(), (i, n) => post({ id: job.id, progress: `Daylight for dimming · floor ${i + 1} of ${n}` })).rows.map((r) => r.dsf)
    }
    post({ id: job.id, progress: 'Hour by hour over the year…' })
    const result = energyHourly(P, { tz: hourly.tz, days: hourly.days }, job.floors, job.settings, dsf)
    post({ id: job.id, result }, [result.hourly.heat.buffer, result.hourly.cool.buffer])
  } catch (err) {
    post({ id: job.id, error: (err as Error).message })
  }
}
