// 2D is a true plan (16 Nov, Sinnie: "2D should be perfectly 2d plan view"): a parallel (orthographic) projection
// straight down, so every building shows only its roof outline at its true position, whatever its height or how far it
// is from the centre. The camera stays the scene's perspective camera, so orbit controls, flights and framing work as
// before: just before each render its projection is replaced by the orthographic one that matches the perspective
// scale at the target (half height = distance × tan(fov / 2)), so zoom and pan keep their feel. Picking follows: rays
// from a plan camera are parallel (Raycaster.setFromCamera, patched once below for cameras flagged `planOrtho`).
import * as THREE from 'three'

type Ctl = { target: THREE.Vector3 }

/** The orthographic projection matching the perspective camera's scale at the controls' target. */
export function applyPlanProjection(cam: THREE.PerspectiveCamera, target: THREE.Vector3) {
  const d = Math.max(1, cam.position.distanceTo(target))
  const h = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(1e-6, cam.zoom), w = h * cam.aspect
  cam.projectionMatrix.makeOrthographic(-w, w, h, -h, cam.near, cam.far)
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert()
}

let patched = false
function patchRaycaster() {
  if (patched) return
  patched = true
  const orig = THREE.Raycaster.prototype.setFromCamera
  THREE.Raycaster.prototype.setFromCamera = function (coords: THREE.Vector2, camera: THREE.Camera) {
    if (!camera.userData.planOrtho) return orig.call(this, coords, camera)
    const c = camera as THREE.PerspectiveCamera
    this.ray.origin.set(coords.x, coords.y, (c.near + c.far) / (c.near - c.far)).unproject(c)
    this.ray.direction.set(0, 0, -1).transformDirection(c.matrixWorld)
    this.camera = camera
  }
}

/** Turns the plan projection on for this camera and scene; returns the function that turns it off. */
export function startPlanOrtho(camera: THREE.Camera, scene: THREE.Scene, controls: Ctl | null, invalidate: () => void): () => void {
  const cam = camera as THREE.PerspectiveCamera
  if (!cam.isPerspectiveCamera || !controls) return () => {}
  patchRaycaster()
  cam.userData.planOrtho = true
  const prev = scene.onBeforeRender
  scene.onBeforeRender = function (...args: Parameters<THREE.Object3D['onBeforeRender']>) {
    prev.apply(this, args)
    if (cam.userData.planOrtho) applyPlanProjection(cam, controls.target)
  }
  applyPlanProjection(cam, controls.target)
  invalidate()
  return () => {
    cam.userData.planOrtho = false
    scene.onBeforeRender = prev
    cam.updateProjectionMatrix()
    invalidate()
  }
}
