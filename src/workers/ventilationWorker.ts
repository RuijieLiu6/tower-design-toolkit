// Runs the ventilation study (engine/ventilationSW.ts, Sinnie Choi's engine) off the main thread: every comfortable hour
// of the year balances the airflow of every operable floor (about a second for a tall tower). The hourly climate is
// bundled here only (src/data/sunWindHourly.json); floors and zones arrive prepared (engine/ventilationSWInput.ts).
import hourly from '../data/sunWindHourly.json'
import { prep, type DlFloor, type HourlyClimate, type SkyPrep, type Zone } from '../engine/daylightSW'
import { ventStudy, ventTowerQuick, type VentQuick, type VentResult, type VentSettings } from '../engine/ventilationSW'

export interface VentJob { id: number; floors: DlFloor[]; zones: Zone[]; vent: VentSettings; period: { from: string; to: string }; height: number; posX: number; posY: number }
export interface VentJobOut { id: number; vent?: VentResult; quick?: VentQuick; error?: string }

const post = (msg: VentJobOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)
let P: SkyPrep | null = null

self.onmessage = (e: MessageEvent<VentJob>) => {
  const job = e.data
  try {
    P ??= prep(hourly as unknown as HourlyClimate)
    const vent = ventStudy(P, { temp: hourly.temp, months: hourly.months, days: hourly.days }, job.floors, job.zones, job.vent, job.period, job.height)
    const quick = ventTowerQuick(job.floors, job.zones, job.vent.open, job.posX, job.posY)
    post({ id: job.id, vent, quick }, [vent.grid.buffer])
  } catch (err) {
    post({ id: job.id, error: (err as Error).message })
  }
}
