// glTF / GLB reader on three.js GLTFLoader. glTF lengths are metres and +Y is up (Khronos glTF 2.0, research P14-S17).

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { RawImport, RawObject } from './types'

export async function readGltf(bytes: Uint8Array, fileName: string): Promise<RawImport> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => new GLTFLoader().parse(buf, '', (g) => res(g as unknown as { scene: THREE.Group }), rej))
  const scene = gltf.scene
  scene.updateMatrixWorld(true)
  const objects: RawObject[] = []
  const v = new THREE.Vector3()
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    const pos = m.geometry.getAttribute('position')
    if (!pos) return
    const positions = new Float64Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      positions[3 * i] = v.x; positions[3 * i + 1] = v.y; positions[3 * i + 2] = v.z
    }
    const index = m.geometry.getIndex()
    const indices = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i)
    // The top-level node is the closest thing glTF has to a layer.
    let top: THREE.Object3D = m
    while (top.parent && top.parent !== scene) top = top.parent
    objects.push({ name: m.name || top.name || `mesh ${objects.length + 1}`, layer: top.name || 'Scene', kind: 'mesh', meshSource: 'glTF mesh', mesh: { positions, indices } })
  })
  return {
    format: 'gltf', fileName, objects, skipped: [],
    unit: 'm', unitNote: 'glTF is in metres by the standard (Khronos glTF 2.0)',
    upAxis: 'y', upNote: 'glTF is y-up by the standard',
    fileNorthDeg: null, northNote: 'glTF stores no north', notes: [],
  }
}
