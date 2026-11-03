// Reads an uploaded .3dm or .obj off the main thread and reports progress, so a large model never freezes the page
// (Rhino upload audit, 3 Nov 2026, row 22). The file arrives as a transferred ArrayBuffer and never leaves the browser.
import rhino3dm from 'rhino3dm/rhino3dm.module.js'
import wasmUrl from 'rhino3dm/rhino3dm.wasm?url'
import { readObj } from '../lib/import/obj'
import { read3dmWith } from '../lib/import/rhino'
import type { RawImport } from '../lib/import/types'

export type ReaderRequest = { id: number; name: string; kind: '3dm' | 'obj'; bytes: ArrayBuffer }
export type ReaderReply =
  | { id: number; type: 'progress'; phase: string; done: number; total: number }
  | { id: number; type: 'done'; raw: RawImport & { unitScaleOverride?: number } }
  | { id: number; type: 'error'; message: string }

const post = (msg: ReaderReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)
let rhino: Promise<unknown> | null = null

self.onmessage = async (e: MessageEvent<ReaderRequest>) => {
  const { id, name, kind, bytes } = e.data
  try {
    let raw: RawImport & { unitScaleOverride?: number }
    if (kind === '3dm') {
      post({ id, type: 'progress', phase: 'Loading the Rhino reader', done: 0, total: 1 })
      rhino ??= rhino3dm({ locateFile: () => wasmUrl })
      const rh = await rhino
      let last = 0
      raw = read3dmWith(rh, new Uint8Array(bytes), name, (done, total) => {
        const now = Date.now()
        if (now - last > 80 || done === total) { last = now; post({ id, type: 'progress', phase: 'Reading objects', done, total }) }
      })
    } else {
      post({ id, type: 'progress', phase: 'Reading the OBJ text', done: 0, total: 1 })
      raw = readObj(new TextDecoder().decode(bytes), name)
    }
    // Hand the vertex and index arrays back without copying them.
    const transfer: Transferable[] = []
    for (const o of raw.objects) for (const a of [o.mesh.positions, o.mesh.indices]) if (ArrayBuffer.isView(a) && !transfer.includes(a.buffer)) transfer.push(a.buffer as ArrayBuffer)
    post({ id, type: 'done', raw }, transfer)
  } catch (err) {
    post({ id, type: 'error', message: (err as Error)?.message || String(err) })
  }
}
