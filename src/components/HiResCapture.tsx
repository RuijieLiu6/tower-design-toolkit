// Print-size capture of the 3D view: re-renders the scene once at a higher pixel ratio so a board image has enough
// pixels (an A2 board at 150 dpi is 3508 px wide; a screen capture is usually 1000–1500 px). Mounted inside the Canvas;
// callers use lib/hiresCapture.ts.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { setHiResCapture } from '../lib/hiresCapture'

export default function HiResCapture() {
  const { gl, scene, camera, size } = useThree()
  useEffect(() => {
    setHiResCapture((targetWidth) => {
      const ctx = gl.getContext()
      const dims = ctx.getParameter(ctx.MAX_VIEWPORT_DIMS) as Int32Array | number[] | null
      const maxW = dims ? Math.min(dims[0], 8192) : 4096
      const prev = gl.getPixelRatio()
      const ratio = Math.max(prev, Math.min(targetWidth / size.width, maxW / size.width))
      try {
        gl.setPixelRatio(ratio)
        gl.setSize(size.width, size.height, false)
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      } finally {
        gl.setPixelRatio(prev)
        gl.setSize(size.width, size.height, false)
        gl.render(scene, camera)
      }
    })
    return () => setHiResCapture(null)
  }, [gl, scene, camera, size])
  return null
}
