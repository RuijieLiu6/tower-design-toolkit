// Picks the reader for a dropped file. The rhino3dm and web-ifc WebAssembly modules load only when a file needs them.
// .3dm and OBJ files are read in a Web Worker (src/workers/readerWorker.ts) with progress; the page reads them itself
// only where workers are unavailable. Nothing is uploaded anywhere: the bytes stay in this browser.

import { readObj } from './obj'
import type { RawImport } from './types'
import type { ReaderReply, ReaderRequest } from '../../workers/readerWorker'

export type ReadProgress = (p: { phase: string; done: number; total: number }) => void

/* eslint-disable @typescript-eslint/no-explicit-any */
let rhino: Promise<any> | null = null
let ifc: Promise<{ api: any; ctx: number }> | null = null

export type LoadedImport = RawImport & { unitScaleOverride?: number }

/** Reads a model file. `signal` cancels it: a read in the worker stops at once (the worker is ended), one on the page at its next step. */
export async function readModelFile(file: File, onProgress?: ReadProgress, signal?: AbortSignal): Promise<LoadedImport> {
  const raw = await readBytes(file, onProgress, signal)
  if (signal?.aborted) throw new ReaderError(CANCELLED)
  return { ...raw, fileSize: file.size, fingerprint: raw.fingerprint }
}

const CANCELLED = 'Upload cancelled'
/** True for the error a cancelled read rejects with. */
export const isCancelled = (e: unknown) => e instanceof Error && e.message === CANCELLED

async function readBytes(file: File, onProgress?: ReadProgress, signal?: AbortSignal): Promise<LoadedImport> {
  const name = file.name
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')
  onProgress?.({ phase: 'Opening the file', done: 0, total: 1 })
  let bytes = new Uint8Array(await file.arrayBuffer())
  if (signal?.aborted) throw new ReaderError(CANCELLED)
  const fingerprint = fingerprintOf(bytes)
  const head = new TextDecoder().decode(bytes.slice(0, 32))
  const kind = ext === '3dm' || head.startsWith('3D Geometry File Format') ? '3dm' : ext === 'obj' ? 'obj' : null
  if (kind && typeof Worker !== 'undefined') {
    // The bytes move to the worker (no copy, so a large file is held once); a reader error comes back as is.
    try { return { ...(await inWorker(name, kind, bytes.buffer as ArrayBuffer, onProgress, signal)), fingerprint } } catch (e) {
      if (e instanceof ReaderError) throw e
      bytes = new Uint8Array(await file.arrayBuffer())
    }
  }
  if (ext === 'skp') throw new Error('SketchUp files cannot be read in a browser. In SketchUp Pro: File > Export > 3D Model > OBJ, then import the OBJ.')
  if (ext === 'rvt' || ext === 'rfa') throw new Error('Revit files cannot be read in a browser. In Revit: File > Export > IFC (IFC4, the mass only), then import the IFC.')
  if (ext === 'dwg' || ext === 'dxf') throw new Error('2D plans (DWG/DXF) are not massing. Export the 3D mass as 3DM, OBJ or IFC.')
  if (ext === '3dm' || head.startsWith('3D Geometry File Format')) {
    const [rh, { read3dmWith }] = await Promise.all([loadRhino3dm(), import('./rhino')])
    return { ...read3dmWith(rh, bytes, name, (done, total) => onProgress?.({ phase: 'Reading objects', done, total })), fingerprint }
  }
  if (ext === 'ifc' || head.startsWith('ISO-10303-21')) {
    ifc ??= (async () => {
      const [webIfc, { default: wasmUrl }] = await Promise.all([import('web-ifc'), import('web-ifc/web-ifc.wasm?url')])
      const api = new webIfc.IfcAPI()
      await api.Init(() => wasmUrl, true)
      return { api, ctx: webIfc.IFCGEOMETRICREPRESENTATIONCONTEXT }
    })()
    const [{ api, ctx }, { readIfcWith }] = await Promise.all([ifc, import('./ifc')])
    return { ...readIfcWith(api, bytes, name, ctx), fingerprint }
  }
  if (ext === 'glb' || ext === 'gltf' || head.startsWith('glTF')) {
    const { readGltf } = await import('./gltf')
    return { ...(await readGltf(bytes, name)), fingerprint }
  }
  if (ext === 'obj') return { ...readObj(new TextDecoder().decode(bytes), name), fingerprint }
  throw new Error(`.${ext || '?'} is not a format Tower Design Toolkit reads. Use 3DM, OBJ, glTF/GLB or IFC.`)
}

/** rhino3dm (openNURBS in WebAssembly) on the page, loaded once and shared (also by lib/vtcContextSource.ts). */
export function loadRhino3dm(): Promise<any> {
  return (rhino ??= (async () => {
    const [{ default: rhino3dm }, { default: wasmUrl }] = await Promise.all([import('rhino3dm/rhino3dm.module.js'), import('rhino3dm/rhino3dm.wasm?url')])
    return rhino3dm({ locateFile: () => wasmUrl })
  })())
}

export const ACCEPT = '.3dm,.obj,.glb,.gltf,.ifc,.skp,.rvt'

/** Size plus a hash of the first and last 64 KB: enough to tell two saves of a file apart, quick on any size. */
export function fingerprintOf(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  const eat = (from: number, to: number) => { for (let i = from; i < to; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0 } }
  const n = bytes.length, part = 65536
  if (n <= 2 * part) eat(0, n); else { eat(0, part); eat(n - part, n) }
  return `${n.toString(36)}-${h.toString(16).padStart(8, '0')}`
}

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (r: LoadedImport) => void; reject: (e: Error) => void; progress?: ReadProgress }>()

/** An error from the reader itself (the file), as opposed to the worker failing to run. */
class ReaderError extends Error {}

/** Reads in the worker; rejects with a plain Error (the caller then reads on the page) when the worker cannot run. */
function inWorker(name: string, kind: '3dm' | 'obj', bytes: ArrayBuffer, onProgress?: ReadProgress, signal?: AbortSignal): Promise<LoadedImport> {
  if (!worker) {
    worker = new Worker(new URL('../../workers/readerWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ReaderReply>) => {
      const m = e.data, w = waiting.get(m.id)
      if (!w) return
      if (m.type === 'progress') w.progress?.({ phase: m.phase, done: m.done, total: m.total })
      else { waiting.delete(m.id); if (m.type === 'done') w.resolve(m.raw); else w.reject(new ReaderError(m.message)) }
    }
    // A worker that cannot start (blocked, old browser): fail every pending read so each falls back to the page.
    worker.onerror = () => { for (const w of waiting.values()) w.reject(new Error('reader worker failed')); waiting.clear(); worker?.terminate(); worker = null }
  }
  const id = ++seq
  const msg: ReaderRequest = { id, name, kind, bytes }
  return new Promise((resolve, reject) => {
    // Cancel ends the worker (rhino3dm cannot be interrupted any other way); the next read starts a fresh one.
    const cancel = () => { waiting.delete(id); worker?.terminate(); worker = null; for (const w of waiting.values()) w.reject(new Error('reader worker restarted')); waiting.clear(); reject(new ReaderError(CANCELLED)) }
    if (signal?.aborted) { reject(new ReaderError(CANCELLED)); return }
    signal?.addEventListener('abort', cancel, { once: true })
    const done = <T,>(f: (v: T) => void) => (v: T) => { signal?.removeEventListener('abort', cancel); f(v) }
    waiting.set(id, { resolve: done(resolve), reject: done(reject), progress: onProgress })
    worker!.postMessage(msg, [bytes])
  })
}
