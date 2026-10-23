// glTF binary (.glb) of an ExportScene through three.js's GLTFExporter (browser). glTF is Y up and metres; each node
// keeps its user strings in `extras` and its layer as the material name.
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { ExportScene } from './scene'

export async function toGlb(scene: ExportScene): Promise<ArrayBuffer> {
  const root = new THREE.Group()
  root.name = 'Massing'
  root.userData = { ...scene.notes }
  // Z up (model) to Y up (glTF): rotate the whole model −90° about X.
  root.rotation.x = -Math.PI / 2
  const mats = new Map<string, THREE.MeshStandardMaterial>()
  for (const l of scene.layers) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(l.color[0] / 255, l.color[1] / 255, l.color[2] / 255), roughness: 0.9 })
    m.name = l.path
    mats.set(l.path, m)
  }
  for (const s of scene.solids) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3))
    g.setIndex(s.indices)
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, mats.get(s.layer))
    mesh.name = s.name
    mesh.userData = { layer: s.layer, ...s.strings }
    root.add(mesh)
  }
  root.updateMatrixWorld(true)
  const result = await new GLTFExporter().parseAsync(root, { binary: true })
  return result as ArrayBuffer
}
