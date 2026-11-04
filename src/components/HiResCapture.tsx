// Print-size capture of the 3D view: re-renders the scene once at a higher pixel ratio so a board image has enough
// pixels (an A2 board at 150 dpi is 3508 px wide; a screen capture is usually 1000–1500 px). Mounted inside the Canvas;
// callers use lib/hiresCapture.ts.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Material, Object3D } from 'three'
import { setHiResCapture } from '../lib/hiresCapture'
import { creditedDataUrl, sceneCredit } from '../lib/credit'

/**
 * Analysis drawn over the model: labels (sprites), lines (cone edges, outlines, streets, the grid) and see-through
 * surfaces (cone volumes, ghosted overlays, height surfaces). A massing-only capture leaves them out, so an image model
 * gets buildings and ground only (the first AI test render, 3 Nov, redrew a capture full of labels and cone volumes).
 */
function isOverlay(o: Object3D): boolean {
  const x = o as Object3D & { isSprite?: boolean; isLine?: boolean; isLineSegments2?: boolean; isPoints?: boolean; isMesh?: boolean; material?: Material | Material[] }
  // drei <Line> is a LineSegments2, a mesh in three's eyes.
  if (o.userData.overlay || x.isSprite || x.isLine || x.isLineSegments2 || x.isPoints) return true
  if (!x.isMesh || !x.material) return false
  // See-through: a low opacity, or transparent without depth (cone volumes fade by vertex colour at opacity 1).
  return (Array.isArray(x.material) ? x.material : [x.material]).every((m) => m.transparent && (m.opacity < 0.95 || !m.depthWrite))
}

export default function HiResCapture() {
  const { gl, scene, camera, size } = useThree()
  useEffect(() => {
    setHiResCapture((targetWidth, opts) => {
      const ctx = gl.getContext()
      const dims = ctx.getParameter(ctx.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null
      const maxW = dims ? Math.min(dims[0], 8192) : 4096
      const prev = gl.getPixelRatio()
      const ratio = Math.max(prev, Math.min(targetWidth / size.width, maxW / size.width))
      const hidden: Object3D[] = []
      if (opts?.massingOnly) scene.traverseVisible((o) => { if (o !== scene && isOverlay(o)) hidden.push(o) })
      try {
        for (const o of hidden) o.visible = false
        gl.setPixelRatio(ratio)
        gl.setSize(size.width, size.height, false)
        gl.render(scene, camera)
        // OSM credit on Real Vancouver captures (ODbL), except the AI-render input: its prompt forbids text, so the model
        // would redraw the credit as garbled letters; the imported render carries the credit in its label (lib/aiRender.ts).
        return creditedDataUrl(gl.domElement, opts?.massingOnly ? null : sceneCredit())
      } finally {
        for (const o of hidden) o.visible = true
        gl.setPixelRatio(prev)
        gl.setSize(size.width, size.height, false)
        gl.render(scene, camera)
      }
    })
    return () => setHiResCapture(null)
  }, [gl, scene, camera, size])
  return null
}
