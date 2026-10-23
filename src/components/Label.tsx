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
export default function Label({ text, position, size = 0.022, color = '#3d434b', background = 'rgba(255,255,255,0.88)', bold = false }: {
  text: string; position: [number, number, number]; size?: number; color?: string; background?: string | null; bold?: boolean
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
    if (!sprite.current) return
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 38
    const f = Math.tan(THREE.MathUtils.degToRad(fov / 2)) / REF_HALF_FOV
    sprite.current.scale.set(size * aspect * f, size * f, 1)
  })
  return (
    <sprite ref={sprite} position={position} scale={[size * aspect, size, 1]} renderOrder={10}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  )
}
