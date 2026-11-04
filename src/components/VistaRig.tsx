// In-canvas part of the Vista node (Real Vancouver, inside CityScene: x east, y north, z up, CGVD28 heights).
// 1. Eye-level views (View from here, protected origins): the far plane goes to 60 km so the North Shore mountains
//    (12-25 km from the origins, research C04) are never clipped, and the orbit fog is replaced by no fog (evidence
//    view) or a light haze (visual option). Restored on leaving.
// 2. Report renders: fixed eyes at protected-view origins, rendered from the real context and cropped to the report frame.
// 3. What-if study planes (Vista v10): the clipped plane over the selected footprint and its limiting point.
import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { towerFootprint } from '../engine/massing'
import { CONES } from '../engine/viewCones'
import { axisBearing, overlapPieces, planeFunction, whatIfCeiling, type Pt } from '../engine/vista'
import { useViewFromStore } from '../lib/viewFromStore'
import { useVistaStore, type CaptureSpec } from '../lib/vistaStore'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import SiteRig from './SiteRig'
import ImagineLayer from './heights/ImagineLayer'
import SiteMapMenu from './site/SiteMapMenu'

/** Model frame (x, y, z-up) to three.js world (y-up), as in ViewFromRig. */
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
type Ctl = { target: THREE.Vector3; enabled: boolean; update: () => void }
/** Far plane for eye-level views: beyond every protected subject (12.5-24.6 km) and the 25 km terrain ring. */
export const EYE_FAR = 60000
/** Light haze for eye-level views: about 11% at 20 km (visual only; research C04 r2 suggests capping haze). */
const HAZE_DENSITY = 1.7e-5

/** Translucent double-sided map sheets (cone wedges, tints, the height surface) as ViewFromRig hides them, and, for
 *  report renders, the sprite labels and legends (they would float over the view at screen size). */
function hideOverlays(scene: THREE.Scene, sprites = false): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (!o.visible) return
    if (sprites && (o as THREE.Sprite).isSprite) { o.visible = false; hidden.push(o); return }
    const m = (o as THREE.Mesh).material as THREE.Material | undefined
    if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m) && m.transparent && m.side === THREE.DoubleSide && !m.depthWrite) { o.visible = false; hidden.push(o) }
  })
  return hidden
}

function render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, s: CaptureSpec): string | null {
  const W = gl.domElement.width, H = gl.domElement.height
  if (W < 50 || H < 50) return null
  const canvasAspect = W / H
  const t = Math.tan((s.hfov * Math.PI) / 360)
  // The crop keeps the requested aspect; its horizontal field is the requested hfov.
  const vfov = canvasAspect >= s.aspect ? 2 * Math.atan(t / s.aspect) : 2 * Math.atan(t / canvasAspect)
  camera.position.copy(toThree(s.x, s.y, s.eye))
  const a = (s.bearing * Math.PI) / 180, p = (s.pitch * Math.PI) / 180
  camera.lookAt(camera.position.clone().add(toThree(Math.sin(a) * Math.cos(p), Math.cos(a) * Math.cos(p), Math.sin(p))))
  camera.fov = (vfov * 180) / Math.PI
  camera.near = 1
  camera.far = EYE_FAR
  camera.updateProjectionMatrix()
  gl.render(scene, camera)
  const cw = canvasAspect >= s.aspect ? Math.round(H * s.aspect) : W, ch = canvasAspect >= s.aspect ? H : Math.round(W / s.aspect)
  const out = document.createElement('canvas')
  const scale = Math.min(1, 1680 / cw)
  out.width = Math.round(cw * scale); out.height = Math.round(ch * scale)
  const g = out.getContext('2d')
  if (!g) return null
  g.drawImage(gl.domElement, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.88)
}

export default function VistaRig() {
  const { gl, camera, scene, controls } = useThree() as unknown as { gl: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; scene: THREE.Scene; controls: Ctl | null }
  const looking = useViewFromStore((s) => s.looking)
  const haze = useVistaStore((s) => s.haze)
  const job = useVistaStore((s) => s.job)
  const saved = useRef<{ fog: THREE.Scene['fog']; far: number } | null>(null)

  // 1. Eye-level views: far plane and fog.
  useEffect(() => {
    if (looking) {
      saved.current ??= { fog: scene.fog, far: camera.far }
      const bg = scene.background instanceof THREE.Color ? scene.background.clone() : new THREE.Color('#e9edf1')
      scene.fog = haze ? new THREE.FogExp2(bg, HAZE_DENSITY) : null
      camera.far = EYE_FAR
      camera.updateProjectionMatrix()
    } else if (saved.current) {
      scene.fog = saved.current.fog
      camera.far = saved.current.far
      camera.updateProjectionMatrix()
      saved.current = null
    }
  }, [looking, haze, scene, camera])
  useEffect(() => () => { if (saved.current) { scene.fog = saved.current.fog; camera.far = saved.current.far; camera.updateProjectionMatrix() } }, [scene, camera])

  // 2. Report renders.
  useEffect(() => {
    if (!job) return
    const prev = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, near: camera.near, far: camera.far, fog: scene.fog, ctl: controls?.enabled ?? true }
    if (controls) controls.enabled = false
    const hidden = hideOverlays(scene, true)
    scene.fog = null
    const shots: (string | null)[] = []
    try {
      for (const s of job.specs) { try { shots.push(render(gl, scene, camera, s)) } catch { shots.push(null) } }
    } finally {
      for (const o of hidden) o.visible = true
      scene.fog = prev.fog
      camera.position.copy(prev.pos); camera.quaternion.copy(prev.quat)
      camera.fov = prev.fov; camera.near = prev.near; camera.far = prev.far; camera.updateProjectionMatrix()
      if (controls) controls.enabled = prev.ctl
      gl.render(scene, camera)
    }
    job.resolve(shots)
    useVistaStore.setState({ job: null })
  }, [job]) // eslint-disable-line react-hooks/exhaustive-deps

  return <><WhatIfPlanes /><SiteRig /><ImagineLayer /><SiteMapMenu /></>
}

/** Vista v10's clipped study plane over the footprint, with a vertical marker at the limiting point. */
function WhatIfPlanes() {
  const on = useStore((s) => s.enabled['built.vista'])
  const show = useVistaStore((s) => s.showPlanes)
  const planes = useVistaStore((s) => s.planes)
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const ground = useStore((s) => s.groundElevation)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const res = useMemo(() => {
    if (!on || !show || !t || !Object.keys(planes).length) return null
    const fp = towerFootprint(t).map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt)
    return whatIfCeiling(fp, planes, ground, ground + t.height)
  }, [on, show, t, planes, ground])
  // The planes are drawn over the footprint plus a 60 m margin (clipped to each cone), so a sheet that cuts the tower
  // still shows outside the solid massing; the patch and the marker mark the footprint itself.
  const geom = useMemo(() => {
    if (!res?.patches.length || !t) return null
    const fp = towerFootprint(t).map(([x, y]) => [x + CITY_ORIGIN[0], y + CITY_ORIGIN[1]] as Pt)
    const xs = fp.map((p) => p[0]), ys = fp.map((p) => p[1]), m = 60
    const box: Pt[] = [[Math.min(...xs) - m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.max(...ys) + m], [Math.min(...xs) - m, Math.max(...ys) + m]]
    const pos: number[] = []
    for (const view of new Set(res.patches.map((p) => p.view))) {
      const cone = CONES.find((c) => c.id === view), e = planes[view]
      const f = cone && e && e.elevation !== null && e.pitch !== null ? planeFunction({ origin: cone.ring[0], observerElevationM: e.elevation, bearingDeg: e.bearing ?? axisBearing(cone), pitchDeg: e.pitch, source: '' }) : null
      if (!cone || !f) continue
      for (const piece of overlapPieces(cone.ring, box) ?? []) {
        const q = piece.map((p) => [p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1], f(p)])
        for (let i = 1; i + 1 < q.length; i++) pos.push(...q[0], ...q[i], ...q[i + 1])
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [res, t, planes])
  useEffect(() => () => geom?.dispose(), [geom])
  if (!res || !geom) return null
  const lp = res.limitingPoint ? [res.limitingPoint[0] - CITY_ORIGIN[0], res.limitingPoint[1] - CITY_ORIGIN[1]] : null
  return (
    <group>
      <mesh geometry={geom}>
        <meshBasicMaterial color="#ea580c" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {res.patches.map((p, i) => (
        <Line key={i} points={[...p.points, p.points[0]].map(([x, y, z]) => [x - CITY_ORIGIN[0], y - CITY_ORIGIN[1], z] as [number, number, number])} color="#c2410c" lineWidth={2} dashed dashSize={4} gapSize={3} />
      ))}
      {lp && res.ceilingElevationM !== null && (
        <Line points={[[lp[0], lp[1], ground], [lp[0], lp[1], res.ceilingElevationM]]} color="#c2410c" lineWidth={2.5} />
      )}
    </group>
  )
}
