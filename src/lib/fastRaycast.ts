// Fast pointer picking for the 3D view.
//
// Measured on 3 Nov 2026 (production build, Intel UHD, Real Vancouver): every click and every wheel step spent
// 280+ ms in three.js's brute-force Mesh.raycast, testing the pointer ray against every triangle of the city
// buildings, terrain and plinth. This module:
//   1. replaces Mesh.raycast with three-mesh-bvh's accelerated raycast. Each large geometry gets a bounding-volume
//      hierarchy, built in a Web Worker (workers/bvhWorker.ts) so the page never waits for it: the 2-million-triangle
//      city mesh took a single 1.5 s task on the main thread (4 Nov). An index is used only while the geometry's
//      positions, triangle index and draw range are the ones it was built from; until a fresh one arrives, picking
//      uses three's own exact test, so a pick is never wrong, only slower for those few seconds;
//   2. offers pointer events without the wheel handler. Nothing in the scene reacts to the wheel, and R3F would
//      otherwise ray-test every interactive mesh on each zoom step (OrbitControls handles zoom on its own).
// Small geometries keep the plain raycast; building an index for them would cost more than it saves.
import { events as domEvents, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { BufferGeometry, Mesh, type BufferAttribute, type Raycaster, type Intersection, type TypedArray } from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'
import { attachBvh, BVH_OPTIONS, type BvhJob, type BvhReply, type IndexArray } from './bvhJob'

/** Triangle count above which a geometry gets an index (a box has 12; a tower block a few dozen). */
export const BVH_MIN_TRIANGLES = 2000

type Indexed = BufferGeometry & { boundsTree?: MeshBVH }
/** What an index was built from. Any change (an in-place edit bumps a version; hiding buildings rewrites the index and draw range) makes it stale. */
type Stamp = { pos: number; index: BufferAttribute | null; indexVersion: number; start: number; count: number }

const builtFrom = new WeakMap<BufferGeometry, Stamp>()
const stampOf = (g: BufferGeometry): Stamp => ({
  pos: (g.getAttribute('position') as BufferAttribute).version, index: g.index, indexVersion: g.index?.version ?? 0,
  start: g.drawRange.start, count: g.drawRange.count,
})
const sameStamp = (s: Stamp | undefined, g: BufferGeometry): boolean =>
  !!s && s.pos === (g.getAttribute('position') as BufferAttribute).version && s.index === g.index &&
  s.indexVersion === (g.index?.version ?? 0) && s.start === g.drawRange.start && s.count === g.drawRange.count

export function triangleCount(g: BufferGeometry): number {
  const pos = g.getAttribute('position')
  if (!pos) return 0
  return Math.floor((g.index ? g.index.count : pos.count) / 3)
}

const isLarge = (g: BufferGeometry): boolean => !!g.getAttribute('position') && triangleCount(g) >= BVH_MIN_TRIANGLES && !g.userData.noBvh
const hasFreshIndex = (g: Indexed): boolean => !!g.boundsTree && sameStamp(builtFrom.get(g), g)
function dropIndex(g: Indexed): void {
  if (!g.boundsTree) return
  g.boundsTree = undefined
  builtFrom.delete(g)
  bvhStats.dropped++
}

/** Index counters (read in the browser as window.__bvhStats when diagnosing). `mainMs` is time the page itself spent. */
export const bvhStats = { builds: 0, dropped: 0, mainMs: 0, maxMainMs: 0, workerBuilds: 0, workerMs: 0, maxWorkerMs: 0, staleReplies: 0, tris: 0, biggest: 0 }
;(globalThis as { __bvhStats?: typeof bvhStats }).__bvhStats = bvhStats
const counted = (g: BufferGeometry) => { bvhStats.builds++; bvhStats.tris += triangleCount(g); bvhStats.biggest = Math.max(bvhStats.biggest, triangleCount(g)) }

/** Builds the index of a large geometry on this thread, now (tests, and browsers without workers). Returns true if it has one. */
export function ensureIndex(g: BufferGeometry): boolean {
  const gi = g as Indexed
  if (!isLarge(g)) return false
  if (hasFreshIndex(gi)) return true
  dropIndex(gi)
  const t0 = performance.now()
  gi.boundsTree = new MeshBVH(g, BVH_OPTIONS)
  const ms = performance.now() - t0
  builtFrom.set(g, stampOf(g))
  counted(g); bvhStats.mainMs += ms; bvhStats.maxMainMs = Math.max(bvhStats.maxMainMs, ms)
  return true
}

// ---------- worker builds ----------
/** At most this many builds in flight; further requests wait for the next pick or warm-up scan. */
const MAX_JOBS = 2
/** Arrays are copied for the worker in slices of this many elements, with input handled between slices (~2 ms each). */
const COPY_SLICE = 2_000_000
let worker: Worker | null | undefined // undefined: not started yet; null: not available here
let seq = 0
const jobs = new Map<number, { g: BufferGeometry; stamp: Stamp }>()
const inFlight = new WeakSet<BufferGeometry>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return (worker = null)
  try {
    worker = new Worker(new URL('../workers/bvhWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<BvhReply>) => receive(e.data)
    worker.onerror = () => { worker = null; for (const { g } of jobs.values()) inFlight.delete(g); jobs.clear() } // later picks build on the page
  } catch {
    worker = null
  }
  return worker
}

function receive(reply: BvhReply): void {
  const job = jobs.get(reply.id)
  jobs.delete(reply.id)
  if (!job) return
  inFlight.delete(job.g)
  if ('error' in reply) { job.g.userData.noBvhWorker = true; return } // the next pick builds it on the page
  if (!sameStamp(job.stamp, job.g)) { bvhStats.staleReplies++; return } // changed while building; the next pick asks again
  dropIndex(job.g as Indexed)
  attachBvh(job.g, reply)
  builtFrom.set(job.g, job.stamp)
  counted(job.g); bvhStats.workerBuilds++; bvhStats.workerMs += reply.ms; bvhStats.maxWorkerMs = Math.max(bvhStats.maxWorkerMs, reply.ms)
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0))
async function copyInSlices<T extends TypedArray>(src: T): Promise<T> {
  const out = new (src.constructor as new (n: number) => T)(src.length)
  for (let o = 0; o < src.length; o += COPY_SLICE) {
    out.set(src.subarray(o, Math.min(src.length, o + COPY_SLICE)) as unknown as ArrayLike<number>, o)
    if (o + COPY_SLICE < src.length) await nextTask()
  }
  return out
}

/** Starts a worker build. Returns false when there is no worker (the caller builds on the page instead). */
function requestIndex(g: BufferGeometry): boolean {
  if (g.userData.noBvhWorker) return false
  const w = getWorker()
  if (!w) return false
  const pos = g.getAttribute('position') as BufferAttribute
  if ((pos as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return false
  if (inFlight.has(g) || jobs.size >= MAX_JOBS) return true
  inFlight.add(g)
  const stamp = stampOf(g)
  void (async () => {
    const position = await copyInSlices(pos.array)
    const index = g.index ? await copyInSlices(g.index.array as IndexArray) : null
    if (!sameStamp(stamp, g)) { inFlight.delete(g); return } // edited during the copy; the next pick asks again
    const id = ++seq
    jobs.set(id, { g, stamp })
    const job: BvhJob = { id, position, itemSize: pos.itemSize, normalized: pos.normalized, index, start: stamp.start, count: stamp.count }
    w.postMessage(job, [position.buffer as ArrayBuffer, ...(index ? [index.buffer as ArrayBuffer] : [])])
  })().catch(() => { inFlight.delete(g); g.userData.noBvhWorker = true })
  return true
}

/** `?nofastpick` in the URL turns this module off, for before/after timing on the same build. */
export const fastPickDisabled = (): boolean => typeof location !== 'undefined' && /[?&]nofastpick\b/.test(location.search)

let installed = false
/** Installs the accelerated raycast once for the whole app. Safe to call repeatedly. */
export function installFastRaycast(): void {
  if (installed || fastPickDisabled()) return
  installed = true
  Mesh.prototype.raycast = function fastRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
    const g = this.geometry as Indexed | undefined
    if (g && !hasFreshIndex(g)) {
      dropIndex(g) // stale: positions, triangle index or draw range changed since it was built
      if (isLarge(g) && !requestIndex(g)) ensureIndex(g)
    }
    return acceleratedRaycast.call(this, raycaster, intersects) // without a fresh index this is three's own exact test
  }
}

/** R3F pointer events without onWheel (see the header). Pass as <Canvas events={eventsWithoutWheel}>. */
export const eventsWithoutWheel: typeof domEvents = (store) => {
  const manager = domEvents(store)
  if (fastPickDisabled()) return manager
  const { onWheel: _ignored, ...handlers } = manager.handlers ?? ({} as NonNullable<typeof manager.handlers>)
  return { ...manager, handlers: handlers as NonNullable<typeof manager.handlers> }
}

/**
 * Asks for indexes of large meshes soon after they appear, so the first click after the city loads doesn't wait.
 * Re-scans every few seconds for geometry that arrived later (layers load on demand) or changed.
 */
export function BvhWarmup(): null {
  const scene = useThree((s) => s.scene)
  const raycaster = useThree((s) => s.raycaster) as Raycaster & { firstHitOnly?: boolean }
  useEffect(() => {
    if (fastPickDisabled()) return
    raycaster.firstHitOnly = true // each mesh reports only its nearest hit; R3F dispatches to the nearest anyway
    const scan = () => {
      scene.traverse((o) => {
        const g = (o as Mesh).isMesh ? ((o as Mesh).geometry as Indexed | undefined) : undefined
        if (g && isLarge(g) && !hasFreshIndex(g)) requestIndex(g)
      })
    }
    const t = setInterval(scan, 3000)
    const first = setTimeout(scan, 1000)
    return () => { clearInterval(t); clearTimeout(first) }
  }, [scene, raycaster])
  return null
}
