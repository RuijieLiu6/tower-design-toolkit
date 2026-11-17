// Runs the wind comfort study (engine/windComfort.ts, Sinnie Choi's engine) off the main thread: eight sectors of the
// annual rose take seconds. The obstacles arrive prepared (engine/windComfortInput.ts); progress goes back per sector.
import { plazaMask, siteRaster, windStudy, type FutureBox, type ObstacleMesh, type WindStudyResult, type WindStudySettings, type WindTower } from '../engine/windComfort'

export interface WindJob { id: number; meshes: ObstacleMesh[]; futures: FutureBox[] | null; plazaMeshes: ObstacleMesh[]; tower: WindTower; settings: WindStudySettings }
export interface WindJobOut { id: number; result?: WindStudyResult; plazaCells?: number; error?: string; progress?: { i: number; n: number; name: string } }

const post = (msg: WindJobOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)

self.onmessage = (e: MessageEvent<WindJob>) => {
  const job = e.data
  try {
    const sr = siteRaster(job.meshes, job.futures)
    const plaza = plazaMask(job.plazaMeshes)
    let plazaCells = 0
    for (let k = 0; k < plaza.length; k++) plazaCells += plaza[k]
    const result = windStudy(sr, job.tower, plaza, job.settings, (i, n, name) => post({ id: job.id, progress: { i, n, name } }))
    const transfer: Transferable[] = [result.a.ratio.buffer, result.b.ratio.buffer, result.a.solid.buffer]
    if (result.a0) transfer.push(result.a0.ratio.buffer)
    post({ id: job.id, result, plazaCells }, transfer)
  } catch (err) {
    post({ id: job.id, error: (err as Error).message })
  }
}
