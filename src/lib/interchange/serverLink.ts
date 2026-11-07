// A live link to a script running inside a design app (SketchUp's tdt_link.rb; the Rhino link has its own,
// lib/interchange/rhinoLink.ts, with the same protocol): the script serves the open model on this computer,
// GET /tdt/rev says which copy is current, GET /tdt/<model> is that copy. Like the Rhino link it becomes a FileHandleLike
// for lib/interchange/live.ts: the first copy goes through the upload dialog, every later one updates the model in place.
import { create } from 'zustand'
import { useImportStore } from '../import/store'
import type { FileHandleLike } from './live'

export interface ServerSpec { app: string; ports: readonly number[]; model: string; linkName: string }
export interface ServerRev { rev: number; doc: string; objects: number; units: string; port: number; version: string; instant?: boolean; pending?: number }

/** What each app's link last said about itself, by app name. */
export const useServerLinks = create<Record<string, ServerRev | undefined>>(() => ({}))
const base = (port: number) => `http://127.0.0.1:${port}`
type Fetch = typeof fetch

export async function findServer(spec: ServerSpec, f: Fetch = fetch): Promise<ServerRev | null> {
  for (const port of spec.ports) {
    try {
      const r = await f(`${base(port)}/tdt/rev`, { cache: 'no-store', signal: AbortSignal.timeout?.(1500) })
      if (!r.ok) continue
      const j = (await r.json()) as ServerRev
      if (typeof j.rev === 'number') return { ...j, port: j.port ?? port }
    } catch { /* not this port */ }
  }
  return null
}

export function serverHandle(spec: ServerSpec, port: number, f: Fetch = fetch): FileHandleLike {
  let cached: File | null = null
  const ext = spec.model.split('.').pop() ?? 'obj'
  return {
    name: spec.linkName,
    async getFile() {
      const r = await f(`${base(port)}/tdt/rev`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`the ${spec.app} link answered HTTP ${r.status}`)
      const h = (await r.json()) as ServerRev
      useServerLinks.setState({ [spec.app]: h })
      if (cached && cached.lastModified === h.rev) return cached
      const m = await f(`${base(port)}/tdt/${spec.model}`, { cache: 'no-store' })
      if (!m.ok) throw new Error(m.status === 503 ? `${spec.app} is still writing the first copy` : `the ${spec.app} link answered HTTP ${m.status}`)
      const rev = Number(m.headers.get('X-TDT-Rev') ?? h.rev)
      cached = new File([await m.arrayBuffer()], `${(h.doc || spec.app).replace(/\.[a-z0-9]+$/i, '')}.${ext}`, { lastModified: rev })
      return cached
    },
  }
}

/** Finds the app's link, reads its copy, and opens the upload dialog with it as a linked model; a message when it can't. */
export async function connectServer(spec: ServerSpec, notFound: string, f: Fetch = fetch): Promise<string | null> {
  const found = await findServer(spec, f)
  if (!found) return notFound
  const handle = serverHandle(spec, found.port, f)
  let file: File
  try { file = await handle.getFile() } catch (e) { return `${spec.app} answered but its model could not be read: ${(e as Error).message}. Try again in a moment.` }
  useImportStore.getState().openDialog(file, null, handle)
  return null
}
