// The "No render" View (13 Nov, Sinnie: "revert back to no black and white mode. can you just make a version with no
// rendering"): the same model and colours as Geometry with the rendering taken out. Every solid gets a plain matte
// material in its own colour (no textures, maps, gloss, fog or shadows); see-through overlays, lines and labels stay as
// they are. With the canvas at normal pixel density and no shadow pass (Viewport.tsx) it is the light view to work in.
// New or re-made objects are caught about once a second; leaving the View puts every material back.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

/** How often new or re-made objects are caught, ms. */
const SCAN_MS = 1200
const FALLBACK = new THREE.Color('#d6d8db')

type Swap = { material: THREE.Material | THREE.Material[]; castShadow: boolean; receiveShadow: boolean }
type Coloured = THREE.Material & { color?: THREE.Color; vertexColors?: boolean; map?: THREE.Texture | null }

export default function NoRender() {
  const { scene, gl, invalidate } = useThree()
  useEffect(() => {
    const plain = new Map<THREE.Material, THREE.Material>()
    const made = new Set<THREE.Material>()
    const swaps = new Map<THREE.Mesh, Swap>()
    const shadows = gl.shadowMap.enabled
    let fog = scene.fog
    gl.shadowMap.enabled = false
    scene.fog = null

    /** The plain stand-in of a material: matte, its own colour (or its vertex colours), no maps. */
    const plainOf = (m: THREE.Material, mesh: THREE.Mesh): THREE.Material => {
      let p = plain.get(m)
      if (p) return p
      const c = m as Coloured
      const vertex = !!c.vertexColors || (!c.color && !!mesh.geometry?.attributes.color)
      const color = c.color ? (c.map ? c.color.clone().lerp(FALLBACK, 0.5) : c.color.clone()) : vertex ? new THREE.Color('#ffffff') : FALLBACK.clone()
      p = new THREE.MeshLambertMaterial({
        color, vertexColors: vertex, side: m.side, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, fog: false,
      })
      plain.set(m, p); made.add(p)
      return p
    }
    const apply = () => {
      // The view may set its fog again on re-render: off again, keeping the latest to put back.
      if (scene.fog) { fog = scene.fog; scene.fog = null }
      let changed = false
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        // Fat lines (outlines, dashes) are meshes drawn with a line material: they stay as they are.
        if (mats.some((m) => (m as unknown as { isLineMaterial?: boolean }).isLineMaterial)) return
        if (mats.every((m) => made.has(m))) return
        // See-through overlays (analysis tints, site fills, cones) keep their own look.
        if (mats.every((m) => m.transparent && m.opacity < 0.9)) return
        const prev = swaps.get(mesh)
        swaps.set(mesh, { material: mesh.material, castShadow: prev?.castShadow ?? mesh.castShadow, receiveShadow: prev?.receiveShadow ?? mesh.receiveShadow })
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => plainOf(m, mesh)) : plainOf(mesh.material, mesh)
        mesh.castShadow = false; mesh.receiveShadow = false
        changed = true
      })
      if (changed) invalidate()
    }
    apply()
    const timer = window.setInterval(apply, SCAN_MS)
    return () => {
      window.clearInterval(timer)
      for (const [m, s] of swaps) {
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        if (mats.every((x) => made.has(x))) m.material = s.material
        m.castShadow = s.castShadow; m.receiveShadow = s.receiveShadow
      }
      for (const p of made) p.dispose()
      gl.shadowMap.enabled = shadows
      scene.fog = fog
      invalidate()
    }
  }, [scene, gl, invalidate])
  return null
}
