// Keeps every orbit view above the ground (lib/cameraClamp.ts). Mounted after <Lens />, so it runs after OrbitControls
// (useFrame priority -1), the Schematic lens and camera presets have placed the camera, and before the frame is drawn.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { MAX_POLAR, clampView, nearFor, relaxPolar, sceneGround, type V3 } from '../lib/cameraClamp'

type Controls = { target: THREE.Vector3; enabled: boolean; maxPolarAngle: number; getPolarAngle: () => number }
const toModel = (v: THREE.Vector3): V3 => [v.x, -v.z, v.y]

/**
 * Two lookups in the scene's height grids per frame, no raycast. While something else holds the camera with the
 * controls switched off (View from here, dragging the move/rotate gizmo), it leaves the camera alone.
 */
export default function CameraClamp() {
  const own = useRef({ near: -1, base: 1 })
  useFrame((state) => {
    const ctl = state.controls as unknown as Controls | null
    if (!ctl?.enabled) return
    const cam = state.camera as THREE.PerspectiveCamera
    if (ctl.maxPolarAngle > MAX_POLAR) ctl.maxPolarAngle = relaxPolar(ctl.maxPolarAngle, ctl.getPolarAngle())
    const r = clampView(toModel(cam.position), toModel(ctl.target), sceneGround.at, sceneGround.plinth)
    if (r.moved) {
      cam.position.set(r.cam[0], r.cam[2], -r.cam[1])
      ctl.target.set(r.target[0], r.target[2], -r.target[1])
      cam.lookAt(ctl.target)
    }
    // A preset or the lens sets the near plane for its distance; close to the ground it shrinks so it never cuts the
    // ground open (which would show what is underneath), and it returns to their value on the way back up.
    const o = own.current
    if (cam.near !== o.near) o.base = cam.near
    const near = nearFor(o.base, r.above, cam.position.distanceTo(ctl.target))
    if (Math.abs(near - cam.near) > 1e-3) { cam.near = near; cam.updateProjectionMatrix() }
    o.near = cam.near
  })
  return null
}
