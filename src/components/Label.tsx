import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/** tan of half the base 38 deg field of view, the lens label sizes are tuned for. */
const REF_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(19))

/**
 * Screen-sized text label drawn as a sprite (no DOM, no extra React roots).
 * `size` is the label height as a fraction of the viewport height, kept constant through lens changes
 * (an unattenuated sprite would otherwise grow as the field of view narrows, e.g. in the Schematic axonometric).
 */
export default function Label({ text, position, size = 0.022, color = '#3d434b', background = 'rgba(255,255,255,0.88)', bold = false, keepInView = false, maxDistance, lift }: {
  text: string; position: [number, number, number]; size?: number; color?: string; background?: string | null; bold?: boolean
  /** Slide the label along so it stays whole inside the view when its anchor is near (or past) an edge. */
  keepInView?: boolean
  /** Hide the label while the camera is farther than this (m) from it, e.g. a detail that only reads up close. */
  maxDistance?: number
  /** Sit the label above its anchor, its bottom edge this fraction of the view height over it (instead of centred on it). */
  lift?: number
}) {
  const { texture, aspect } = useMemo(() => {
    const dpr = 2, fontPx = 22 * dpr, pad = 8 * dpr
    const font = `${bold ? 600 : 500} ${fontPx}px Inter, "Segoe UI", system-ui, sans-serif`
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2
    const h = fontPx + pad * 1.4
    c.width = w; c.height = h
    ctx.font = font
    if (background) {
      ctx.fillStyle = background
      const r = 8 * dpr
      ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill()
    }
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.fillText(text, pad, h / 2 + dpr)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return { texture: t, aspect: w / h }
  }, [text, color, background, bold])
  useEffect(() => () => texture.dispose(), [texture])
  const sprite = useRef<THREE.Sprite>(null)
  useFrame(({ camera }) => {
    const s = sprite.current
    if (!s) return
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 38
    const f = Math.tan(THREE.MathUtils.degToRad(fov / 2)) / REF_HALF_FOV
    s.scale.set(size * aspect * f, size * f, 1)
    if (maxDistance !== undefined) s.visible = s.getWorldPosition(at).distanceTo(camera.position) <= maxDistance
    if (keepInView && s.visible) {
      // An unattenuated sprite spans scale × the projection's diagonal in clip space; its anchor (center) is moved so
      // the whole box stays 1% inside the view's edges (UI review, 3 Nov: "…en Elizabeth Park" was cut at the edge).
      const q = s.getWorldPosition(at).project(camera)
      if (q.z > 1) return
      const P = camera.projectionMatrix.elements, w = s.scale.x * P[0], h = s.scale.y * P[5], m = 0.02
      s.center.set(fit(q.x, w, m), fit(q.y, h, m))
    }
  })
  return (
    <sprite ref={sprite} position={position} scale={[size * aspect, size, 1]} center={lift !== undefined ? [0.5, -lift / size] : [0.5, 0.5]} renderOrder={10}>
      {/* No fog: Vista's haze washed labels out until they could not be read (UI review, 3 Nov). */}
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent fog={false} />
    </sprite>
  )
}

const at = new THREE.Vector3()

/** The anchor (0 = left/bottom edge, 1 = right/top) that keeps a box of clip-space size `w` around `q` inside ±(1 − m). */
function fit(q: number, w: number, m: number): number {
  if (w <= 0) return 0.5
  const lo = 1 - (1 - m - q) / w, hi = (q + 1 - m) / w // anchor bounds from the right and the left edge
  return lo > hi ? 0.5 : Math.min(hi, Math.max(lo, 0.5))
}
