// Print-size capture of the 3D view. The renderer side lives in components/HiResCapture.tsx (inside the lazy Viewport
// chunk); this file only holds the hook, so panels can call it without pulling three.js into the main bundle.
import { useStore } from '../store'

type Capture = (targetWidth: number) => string | null
let capture: Capture | null = null

export function setHiResCapture(fn: Capture | null) { capture = fn }

/** PNG data URL of the current 3D view about `targetWidth` px wide (capped by the GPU), or null if no view is mounted. */
export function captureHiRes(targetWidth = 3508): string | null {
  return capture ? capture(targetWidth) : null
}

/** Print-size capture filed in the shot strip. An A2 board at 150 dpi is 3508 px wide. */
export function captureHiResShot(): boolean {
  const dataUrl = captureHiRes(3508)
  if (!dataUrl) return false
  const s = useStore.getState()
  const at = new Date().toISOString()
  s.addShot({ id: at, dataUrl, stage: s.phase, representation: s.phase === 'present' ? s.presentRep : s.phase === 'advanced' ? 'xray' : 'clay', project: s.project, at })
  return true
}
