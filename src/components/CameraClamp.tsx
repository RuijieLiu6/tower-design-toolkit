// Keeps every orbit view above the ground (lib/cameraClamp.ts). Mounted after <Lens />, so it runs after OrbitControls
// (useFrame priority -1), the Schematic lens and camera presets have placed the camera, and before the frame is drawn.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { MAX_POLAR, clampView, nearFor, relaxPolar, sceneGround, type V3 } from '../lib/cameraClamp'
import { EDGE_SLACK, limitView, viewLimit } from '../lib/viewLimit'

type Controls = { target: THREE.Vector3; enabled: boolean; maxPolarAngle: number; getPolarAngle: () => number }
const toModel = (v: THREE.Vector3): V3 => [v.x, -v.z, v.y]
const right = new THREE.Vector3(), up = new THREE.Vector3()

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
    // Real Vancouver: no zooming out or panning past the built model (lib/viewLimit.ts), before the ground rules.
    const edge = viewLimit.rect
    if (edge) {
      right.set(1, 0, 0).applyQuaternion(cam.quaternion)
      up.set(0, 1, 0).applyQuaternion(cam.quaternion)
      const rl = Math.hypot(right.x, right.z) || 1
      const lim = limitView(toModel(cam.position), toModel(ctl.target), {
        tanHalf: Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), aspect: cam.aspect,
        right: [right.x / rl, -right.z / rl], up: [up.x, -up.z],
      }, edge, EDGE_SLACK)
      if (lim.moved) {
        cam.position.set(lim.cam[0], lim.cam[2], -lim.cam[1])
        ctl.target.set(lim.target[0], lim.target[2], -lim.target[1])
      }
    }
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
