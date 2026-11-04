// Builds a picking index (three-mesh-bvh) from copies of a geometry's arrays. workers/bvhWorker.ts runs it off the main
// thread (the 2-million-triangle city mesh took a single 1.5 s task on the page, 4 Nov); the tests run it directly.
// Indirect mode: the index keeps its own triangle order, so the geometry's own index is never reordered. The city mesh
// rewrites that index to hide buildings under the design (CityContext.tsx useHiddenParts), and the index follows the
// draw range, so hidden buildings are never picked.
import { BufferAttribute, BufferGeometry, type TypedArray } from 'three'
import { MeshBVH, type MeshBVHOptions, type SerializedBVH } from 'three-mesh-bvh'

/** `indirect` is a real option of three-mesh-bvh 0.8 that its type file leaves out. */
export const BVH_OPTIONS = { maxLeafTris: 10, indirect: true } as MeshBVHOptions

export type IndexArray = Uint32Array | Uint16Array
export type BvhJob = { id: number; position: TypedArray; itemSize: number; normalized: boolean; index: IndexArray | null; start: number; count: number }
export type BvhBuilt = { id: number; roots: ArrayBuffer[]; indirectBuffer: IndexArray; ms: number }
export type BvhReply = BvhBuilt | { id: number; error: string }

export function buildBvhJob(job: BvhJob): BvhReply {
  try {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(job.position, job.itemSize, job.normalized))
    if (job.index) g.setIndex(new BufferAttribute(job.index, 1))
    g.setDrawRange(job.start, job.count)
    const t0 = performance.now()
    const data = MeshBVH.serialize(new MeshBVH(g, BVH_OPTIONS), { cloneBuffers: false }) as SerializedBVH & { indirectBuffer: IndexArray }
    return { id: job.id, roots: data.roots, indirectBuffer: data.indirectBuffer, ms: performance.now() - t0 }
  } catch (err) {
    return { id: job.id, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Puts a built index on the real geometry without copying or changing any of its arrays. */
export function attachBvh(g: BufferGeometry, built: Pick<BvhBuilt, 'roots' | 'indirectBuffer'>): MeshBVH {
  const data = { roots: built.roots, index: null, indirectBuffer: built.indirectBuffer } as unknown as SerializedBVH
  const bvh = MeshBVH.deserialize(data, g, { setIndex: false })
  ;(g as BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = bvh
  return bvh
}
