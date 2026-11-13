// Black & white as pure linework (13 Nov, Sinnie: "black and white mode should be purely linework and no render stuff").
// Mounted inside the 3D canvas while the View is Black & white: every solid turns flat white (no light, shade, texture or
// shadow) with its edges drawn in black; see-through overlays and points are hidden; existing lines turn black; the
// background is white. New or re-made objects are caught every half second. Leaving the mode puts everything back.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

const INK = new THREE.Color('#151515')
const EDGE_DEG = 28

type Swap = { material: THREE.Material | THREE.Material[]; castShadow: boolean; receiveShadow: boolean }

export default function Linework() {
  const { scene, gl, invalidate } = useThree()
  useEffect(() => {
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, toneMapped: false, fog: false })
    const hidden = new THREE.MeshBasicMaterial({ visible: false })
    const ink = new THREE.LineBasicMaterial({ color: INK, toneMapped: false, fog: false })
    const swaps = new Map<THREE.Object3D, Swap>()
    const lineColours = new Map<THREE.Material, THREE.Color>()
    const hiddenObjs = new Set<THREE.Object3D>()
    const edges = new Map<THREE.Mesh, THREE.LineSegments>()
    const edgeGeom = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>()
    const background = scene.background
    const shadows = gl.shadowMap.enabled
    scene.background = new THREE.Color('#ffffff')
    gl.shadowMap.enabled = false

    const seeThrough = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]).every((x) => x.transparent && (x.opacity ?? 1) < 0.9)
    let sceneBg = background
    const apply = () => {
      let changed = false
      // The view sets its own background on re-render: white again, keeping the latest one to put back.
      if (!(scene.background instanceof THREE.Color && scene.background.getHex() === 0xffffff)) { sceneBg = scene.background; scene.background = new THREE.Color('#ffffff'); changed = true }
      scene.traverse((o) => {
        if (o.userData.linework) return
        const mesh = o as THREE.Mesh
        if ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
          if (o.visible && !hiddenObjs.has(o)) { hiddenObjs.add(o); o.visible = false; changed = true }
          return
        }
        // Lines (outlines, dashes, fat lines): black.
        if ((o as THREE.Line).isLine || (o as unknown as { isLine2?: boolean }).isLine2 || (o as unknown as { isLineSegments2?: boolean }).isLineSegments2) {
          for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (THREE.Material & { color?: THREE.Color })[]) {
            if (m?.color && !lineColours.has(m)) { lineColours.set(m, m.color.clone()); m.color.copy(INK); m.needsUpdate = true; changed = true }
          }
          return
        }
        if (!mesh.isMesh) return
        if (mesh.material === white || mesh.material === hidden) return
        // A material (re)made since the last pass: remember it, then swap.
        const prev = swaps.get(mesh)
        swaps.set(mesh, { material: mesh.material, castShadow: prev?.castShadow ?? mesh.castShadow, receiveShadow: prev?.receiveShadow ?? mesh.receiveShadow })
        const clear = seeThrough(mesh.material)
        mesh.material = clear ? hidden : white
        mesh.castShadow = false; mesh.receiveShadow = false
        changed = true
        // Edges for solids (not instanced: their copies share one geometry placed many times).
        if (!clear && !(mesh as THREE.InstancedMesh).isInstancedMesh && mesh.geometry && !edges.has(mesh)) {
          let g = edgeGeom.get(mesh.geometry)
          if (!g) { g = new THREE.EdgesGeometry(mesh.geometry, EDGE_DEG); edgeGeom.set(mesh.geometry, g) }
          const ls = new THREE.LineSegments(g, ink)
          ls.userData.linework = true
          ls.raycast = () => {}
          mesh.add(ls)
          edges.set(mesh, ls)
        }
      })
      // Edges whose geometry changed (a tower re-shaped): redrawn.
      for (const [mesh, ls] of edges) {
        if (!mesh.parent) { ls.removeFromParent(); edges.delete(mesh); continue }
        const g = edgeGeom.get(mesh.geometry)
        if (!g) { const ng = new THREE.EdgesGeometry(mesh.geometry, EDGE_DEG); edgeGeom.set(mesh.geometry, ng); ls.geometry = ng; changed = true }
      }
      if (changed) invalidate()
    }
    apply()
    const timer = window.setInterval(apply, 500)
    return () => {
      window.clearInterval(timer)
      for (const [o, s] of swaps) { const m = o as THREE.Mesh; if (m.material === white || m.material === hidden) m.material = s.material; m.castShadow = s.castShadow; m.receiveShadow = s.receiveShadow }
      for (const [m, c] of lineColours) { (m as THREE.Material & { color: THREE.Color }).color.copy(c); m.needsUpdate = true }
      for (const o of hiddenObjs) o.visible = true
      for (const ls of edges.values()) ls.removeFromParent()
      scene.background = sceneBg
      gl.shadowMap.enabled = shadows
      white.dispose(); hidden.dispose(); ink.dispose()
      invalidate()
    }
  }, [scene, gl, invalidate])
  return null
}
