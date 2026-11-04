// Builds picking indexes off the main thread (lib/fastRaycast.ts sends copies of a geometry's arrays; lib/bvhJob.ts).
// The finished index comes back as transferred buffers, so the page only attaches it.
import { buildBvhJob, type BvhJob } from '../lib/bvhJob'

self.onmessage = (e: MessageEvent<BvhJob>) => {
  const reply = buildBvhJob(e.data)
  const transfer = 'roots' in reply ? [...reply.roots, reply.indirectBuffer.buffer as ArrayBuffer] : []
  ;(self as unknown as Worker).postMessage(reply, transfer)
}
