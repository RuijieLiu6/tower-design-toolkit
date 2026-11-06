// "Export model" next to the project menu (backlog item 32): Layer 0 out to Rhino (.3dm), SketchUp and most tools
// (OBJ + MTL), glTF (.glb); IFC is on the roadmap. Files are made in the browser; nothing is uploaded.
import { Download, Loader2 } from './icons'
import { useEffect, useRef, useState } from 'react'
import { VTC_NORTH_DEG } from '../context'
import { toExportScene } from '../lib/interchange/converters'
import { useImportStore } from '../lib/import/store'
import { CITY_ORIGIN, useStore } from '../store'
import { useUnits } from '../lib/units'
import SunWindSend from './SunWindSend'

/* eslint-disable @typescript-eslint/no-explicit-any */
let rhino: Promise<any> | null = null
const loadRhino = () => (rhino ??= (async () => {
  const [{ default: rhino3dm }, { default: wasmUrl }] = await Promise.all([import('rhino3dm/rhino3dm.module.js'), import('rhino3dm/rhino3dm.wasm?url')])
  return rhino3dm({ locateFile: () => wasmUrl })
})())

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function ExportMenu() {
  const unit = useUnits((st) => st.unit)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const present = useStore((s) => s.phase === 'present')
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const scene = () => {
    const s = useStore.getState()
    const towers = s.towers[s.project]
    const meshes = useImportStore.getState().meshes
    return {
      // Roles, uses, levels and provenance travel as user strings, so uploading the export reads back the same model.
      scene: toExportScene(towers, s.models[s.project], { project: s.project, northDeg: s.project === 'vtc' ? VTC_NORTH_DEG : 0, groundElevation: s.groundElevation, utmOrigin: s.project === 'city' ? CITY_ORIGIN : null, meshOf: (id) => meshes[id] }),
      base: `massing-${s.project}-${new Date().toISOString().slice(0, 10)}`,
      north: s.project === 'vtc' ? VTC_NORTH_DEG : 0,
    }
  }
  const run = async (kind: '3dm' | 'obj' | 'glb') => {
    setBusy(kind); setMsg('')
    try {
      const { scene: sc, base, north } = scene()
      if (kind === '3dm') {
        const [rh, { to3dm }] = await Promise.all([loadRhino(), import('../lib/export/writers')])
        // Approximate downtown location, only so Rhino reads the model north vector (not a survey position).
        save(to3dm(rh, sc, { northDeg: north, lat: 49.2827, lon: -123.1207 }) as BlobPart, `${base}.3dm`, 'application/octet-stream')
      } else if (kind === 'obj') {
        const [{ toObj }, { zipSync, strToU8 }] = await Promise.all([import('../lib/export/writers'), import('fflate')])
        const { obj, mtl } = toObj(sc, `${base}.mtl`)
        save(zipSync({ [`${base}.obj`]: strToU8(obj), [`${base}.mtl`]: strToU8(mtl) }) as BlobPart, `${base}-obj.zip`, 'application/zip')
      } else {
        const { toGlb } = await import('../lib/export/gltf')
        save(await toGlb(sc), `${base}.glb`, 'model/gltf-binary')
      }
      setMsg(`${sc.solids.length} objects on ${sc.layers.length} layers.`)
    } catch (e) { setMsg(`Export failed: ${(e as Error).message}`) }
    setBusy(null)
  }

  const item = 'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-black/5 disabled:opacity-50'
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title="Export the massing to Rhino, SketchUp and other tools"
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${present ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10'}`}><Download size={13} />Export model</button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border border-line bg-panel p-1.5 text-ink shadow-lg">
          <button role="menuitem" type="button" disabled={!!busy} onClick={() => run('3dm')} className={item}>{busy === '3dm' ? <Loader2 size={13} className="mt-0.5 animate-spin" /> : <Download size={13} className="mt-0.5" />}<span><b>Rhino (.3dm)</b><br /><span className="text-[10px] text-muted">Layer per use with its colour; role, use, level and provenance as user text, so it uploads back as the same model; site curve and context; north on the Earth anchor</span></span></button>
          <button role="menuitem" type="button" disabled={!!busy} onClick={() => run('obj')} className={item}>{busy === 'obj' ? <Loader2 size={13} className="mt-0.5 animate-spin" /> : <Download size={13} className="mt-0.5" />}<span><b>SketchUp and others (OBJ + MTL, .zip)</b><br /><span className="text-[10px] text-muted">Metres, Y up; one material per layer. In SketchUp Pro: File › Import, units metres</span></span></button>
          <button role="menuitem" type="button" disabled={!!busy} onClick={() => run('glb')} className={item}>{busy === 'glb' ? <Loader2 size={13} className="mt-0.5 animate-spin" /> : <Download size={13} className="mt-0.5" />}<span><b>glTF (.glb)</b><br /><span className="text-[10px] text-muted">For Blender, web viewers and render tools; user text in extras</span></span></button>
          <button role="menuitem" type="button" disabled className={item}><Download size={13} className="mt-0.5" /><span><b>IFC (roadmap)</b><br /><span className="text-[10px] text-muted">Storeys and spaces with use for Revit. Until then: link the .3dm (newer Revit versions, unverified) or convert the OBJ</span></span></button>
          {msg && <p className="px-2 pb-1 pt-0.5 text-[10px] text-muted">{msg}</p>}
          <SunWindSend item={item} />
          <p className="border-t border-line px-2 pt-1 text-[10px] text-muted">One closed solid per storey, LOD 100. Files are always in metres{unit !== 'm' ? ` (you are viewing ${unit === 'ft' ? 'feet' : 'millimetres'})` : ''}. Made in this browser; nothing is uploaded.</p>
        </div>
      )}
    </div>
  )
}
