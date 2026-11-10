// Mounts the upload dialog on demand and lets a file be dropped anywhere on the app (research P14-M02): it opens the
// transfer centre with the purpose read from the file (lib/porting/sniff.ts), so a drop goes through the same preview
// and confirmation as a chosen file. Nothing is read into the model by the drop itself.
import { FileUp } from './icons'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useImportStore } from '../lib/import/store'
import { BASE_MODEL_NAME, addVtcModel, useVtcSource } from '../lib/vtcContextSource'
import { sniff } from '../lib/porting/sniff'
import { useTransfer } from '../lib/porting/transfer'

const ImportDialog = lazy(() => import('./ImportDialog'))

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
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      e.preventDefault()
      // The competition base model, dropped while its context is missing: it is the context, not a massing upload.
      if (BASE_MODEL_NAME.test(f.name) && !useVtcSource.getState().ctx) { void addVtcModel(f); return }
      void sniff(f).then((purpose) => useTransfer.getState().open('import', null, purpose ? { purpose, file: f } : { file: f }))
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
            <FileUp size={18} />Drop a model (.3dm, OBJ, glTF, IFC), a project, a phase package, a site boundary or a tool package: it is read in this browser and shown before anything changes
          </div>
        </div>
      )}
      {open && <Suspense fallback={null}><ImportDialog /></Suspense>}
    </>
  )
}
