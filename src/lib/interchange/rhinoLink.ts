// Live link to Rhino through the Tower Design Toolkit Link plugin (public/rhino/tdt_link.py; Ruijie, 5 Nov: "develop a
// Rhino plugin just like how Sinnie did with the sun & wind analysis"). The plugin serves the open Rhino document on this
// computer, at http://127.0.0.1:8798 (or 8799, 8800): GET /tdt/rev says which copy is current, GET /tdt/model.3dm is that
// copy, a .3dm with render meshes. Here it becomes a FileHandleLike for lib/interchange/live.ts, so the first copy goes
// through the upload dialog (layer roles, units, north, placement) and every later one updates the model in place with
// the same mapping, exactly as a linked file does. Nothing is uploaded: the page reads it from your own computer.
import { useImportStore } from '../import/store'
import type { FileHandleLike } from './live'

export const RHINO_LINK_PORTS = [8798, 8799, 8800] as const
export const RHINO_SCRIPT = 'tdt_link.py'
/** What to type in Rhino (7 or 8): the command, then pick the downloaded script. */
export const RHINO_COMMAND = 'RunPythonScript'

export interface RhinoRev { rev: number; doc: string; objects: number; units: string; port: number; version: string }
export const rhinoBase = (port: number) => `http://127.0.0.1:${port}`

type Fetch = typeof fetch

/** The first port with the plugin answering, and what it says; null when none answers. */
export async function findRhino(f: Fetch = fetch, ports: readonly number[] = RHINO_LINK_PORTS): Promise<RhinoRev | null> {
  for (const port of ports) {
    try {
      const r = await f(`${rhinoBase(port)}/tdt/rev`, { cache: 'no-store', signal: AbortSignal.timeout?.(1500) })
      if (!r.ok) continue
      const j = (await r.json()) as RhinoRev
      if (typeof j.rev === 'number') return { ...j, port: j.port ?? port }
    } catch { /* not this port */ }
  }
  return null
}

/**
 * A link handle on the plugin. getFile() asks for the current revision and downloads the model only when it changed;
 * the File's lastModified is the revision, so live.ts sees each new copy as a new save.
 */
export function rhinoHandle(port: number, f: Fetch = fetch): FileHandleLike & { kind: 'rhino' } {
  let cached: File | null = null
  return {
    kind: 'rhino',
    name: 'Rhino (live link)',
    async getFile() {
      const r = await f(`${rhinoBase(port)}/tdt/rev`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`the Rhino link answered HTTP ${r.status}`)
      const h = (await r.json()) as RhinoRev
      if (cached && cached.lastModified === h.rev) return cached
      const m = await f(`${rhinoBase(port)}/tdt/model.3dm`, { cache: 'no-store' })
      if (!m.ok) throw new Error(m.status === 503 ? 'Rhino is still writing the first copy' : `the Rhino link answered HTTP ${m.status}`)
      const rev = Number(m.headers.get('X-TDT-Rev') ?? h.rev)
      cached = new File([await m.arrayBuffer()], `${(h.doc || 'Rhino').replace(/\.3dm$/i, '')}.3dm`, { lastModified: rev })
      return cached
    },
  }
}

/** Why the page could not reach the plugin, in words the person can act on. */
export const NOT_FOUND = `No Rhino link found on this computer. In Rhino, type ${RHINO_COMMAND}, pick ${RHINO_SCRIPT} and wait for "running on http://127.0.0.1:8798" in Rhino's command line; then press Connect again. If your browser asks to let this site reach devices on your local network, allow it.`

/**
 * Connects: finds the plugin, reads its current copy, and opens the upload dialog with it as a linked model. Returns a
 * message for the panel (null when the dialog opened).
 */
export async function connectRhino(f: Fetch = fetch): Promise<string | null> {
  const found = await findRhino(f)
  if (!found) return NOT_FOUND
  const handle = rhinoHandle(found.port, f)
  let file: File
  try { file = await handle.getFile() } catch (e) { return `Rhino answered but its model could not be read: ${(e as Error).message}. Try again in a moment.` }
  useImportStore.getState().openDialog(file, null, handle)
  return null
}
