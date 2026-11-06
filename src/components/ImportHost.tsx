// Mounts the upload dialog on demand and lets a model file be dropped anywhere on the app (research P14-M02).
import { FileUp } from './icons'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useImportStore } from '../lib/import/store'

const ImportDialog = lazy(() => import('./ImportDialog'))
const MODEL = /\.(3dm|obj|glb|gltf|ifc|skp|rvt)$/i

export default function ImportHost() {
  const open = useImportStore((s) => s.dialogOpen)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    // Only when no other dialog is open, so the node builder's own drop zone keeps working.
    const otherDialog = () => !!document.querySelector('[role="dialog"]')
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => { if (!hasFiles(e) || otherDialog()) return; depth++; setDragging(true) }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = (e: DragEvent) => { if (hasFiles(e) && !otherDialog()) e.preventDefault() }
    const drop = (e: DragEvent) => {
      depth = 0; setDragging(false)
      if (e.defaultPrevented || otherDialog()) return
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => MODEL.test(x.name))
      if (!f) return
      e.preventDefault()
      useImportStore.getState().openDialog(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])
  return (
    <>
      {dragging && !open && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 p-6">
          <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-accent bg-panel px-6 py-4 text-sm font-medium text-accent shadow-lg">
            <FileUp size={18} />Drop a Rhino (.3dm), OBJ, glTF or IFC model to upload it: read in this browser, nothing leaves it
          </div>
        </div>
      )}
      {open && <Suspense fallback={null}><ImportDialog /></Suspense>}
    </>
  )
}
